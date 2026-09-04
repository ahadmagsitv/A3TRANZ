"use client";
// W20 — payroll period detail, grouped by driver (task W-10b) and W21 —
// confirm / paid (task W-10c). One route, since the source markup's
// W21-confirm is W20's own content dimmed behind a scrim with a modal on
// top, and W21-paid is that same route once `status` flips to "paid" — not
// a separate page (mirrors jobs/[id]/page.tsx's view-toggle convention).
// `?confirm=1` opens the modal directly, matching W19's "Mark as paid"
// button, which in the source markup goes straight to W21-confirm.
//
// Per plan §7.3 this is a LEDGER: markPaid never moves money or collects
// bank/card details, it only records a date + reference that a payment
// happened elsewhere. Amounts are editable here only (web) — never on
// mobile (plan W-10b).
import { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  Info,
  Users,
} from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { Button } from "@/components/Button";
import { RoleGate } from "@/components/RoleGate";
import { Modal } from "@/components/Modal";
import { Toast } from "@/components/Toast";
import { StatusPill } from "@/components/StatusPill";
import { Money } from "@/components/Money";
import { PayGroup } from "@/components/PayGroup";
import { PayLine, PayLineMore } from "@/components/PayLine";
import { Timeline } from "@/components/Timeline";
import { Bars } from "@/components/Bars";
import { useStore } from "@/data/repos/useStore";
import { authStore } from "@/data/repos/auth";
import { payrollRepo } from "@/data/repos/payroll";
import { driversRepo } from "@/data/repos/drivers";
import { can } from "@/lib/rbac";
import { PAY_STATUS_LABEL, PAY_STATUS_PILL } from "@/lib/payStatus";
import { downloadCsv } from "@/lib/csv";
import type { PayPeriod } from "@/data/contracts/payroll";
import type { Driver } from "@/data/contracts/drivers";
import type { TimelineEvent } from "@/data/contracts/jobs";

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// "Fri, Nov 21" -> "Nov 21" — fallback display for paid periods seeded
// without a `paidAt` (the fixture's already-paid history, plan §2.3's
// fixture is a copied static asset, not something to backfill).
function shortFromLong(s: string): string {
  const i = s.indexOf(", ");
  return i >= 0 ? s.slice(i + 2) : s;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildTimeline(period: PayPeriod): TimelineEvent[] {
  const openedLabel = period.label.split("–")[0]?.trim() ?? period.label;
  const closedTone = period.status === "accruing" ? "pending" : "done";
  const holdTone =
    period.status === "accruing" ? "pending" : period.status === "held" ? "review" : "done";
  const payableTone =
    period.status === "paid" ? "done" : period.status === "payable" ? "review" : "pending";
  return [
    { id: "opened", title: "Period opened", meta: `${openedLabel} · legs accrue on admin approval`, at: "", tone: "done" },
    { id: "accrued", title: `${period.legCount} job legs approved`, meta: `${period.label} · across ${period.driverCount} drivers`, at: "", tone: "done" },
    { id: "closed", title: "Period closed", meta: `${period.closesAt} · 11:59 PM`, at: "", tone: closedTone },
    { id: "hold", title: "One-week hold", meta: "One week after the period closes", at: "", tone: holdTone },
    {
      id: "payable",
      title: period.status === "paid" ? "Paid" : "Payable",
      meta:
        period.status === "paid"
          ? `${period.paidAt ? shortDate(period.paidAt) : shortFromLong(period.paysAt)} · reference ${period.reference ?? "—"}`
          : `${period.paysAt} · awaiting Mark as paid`,
      at: "",
      tone: payableTone,
    },
  ];
}

export default function PayrollPeriodClient({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  // `useSearchParams` (client-side), not `use(props.searchParams)` — see
  // jobs/[id]/JobDetailClient.tsx's comment; same static-export constraint.
  const searchParams = useSearchParams();
  const router = useRouter();
  const user = useStore(authStore);

  const [period, setPeriod] = useState<PayPeriod | null | undefined>(undefined);
  const [allPeriods, setAllPeriods] = useState<PayPeriod[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [showConfirm, setShowConfirm] = useState(searchParams.get("confirm") === "1");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = !!user && can(user.role, "viewPayroll");

  useEffect(() => {
    if (!allowed) return;
    payrollRepo.get(id).then(setPeriod);
    payrollRepo.list().then(setAllPeriods);
    driversRepo.list().then(setDrivers);
  }, [id, allowed]);

  // Reacting to a searchParams change on an already-mounted instance (e.g.
  // W19's "Mark as paid" link while already sitting on this period) — done
  // during render, React's endorsed pattern for "adjust state when a prop
  // changes", same idiom jobs/page.tsx uses for its filter reset.
  const confirmParam = searchParams.get("confirm") === "1";
  const [prevConfirmParam, setPrevConfirmParam] = useState(confirmParam);
  if (confirmParam !== prevConfirmParam) {
    setPrevConfirmParam(confirmParam);
    if (confirmParam) setShowConfirm(true);
  }

  // Suggested next reference, derived from the real fixture history rather
  // than fabricated (plan §7 "no fabricated data disconnected from the
  // fixtures") — one past the highest existing PR-#### in the dataset. The
  // reference input falls back to displaying this until the admin types
  // over it (see the `value={reference || suggestedReference}` below), so
  // no effect is needed to seed `reference` itself.
  const suggestedReference = useMemo(() => {
    const nums = allPeriods
      .map((p) => p.reference)
      .filter((r): r is string => !!r)
      .map((r) => parseInt(r.replace(/\D/g, ""), 10))
      .filter((n) => !Number.isNaN(n));
    return `PR-${(nums.length ? Math.max(...nums) : 1140) + 1}`;
  }, [allPeriods]);

  function closeConfirm() {
    setShowConfirm(false);
    setError(null);
    router.replace(`/payroll/${encodeURIComponent(id)}`);
  }

  async function handleConfirmPaid() {
    setBusy(true);
    setError(null);
    try {
      const updated = await payrollRepo.markPaid(id, reference || suggestedReference, paymentDate);
      setPeriod(updated);
      setShowConfirm(false);
      router.replace(`/payroll/${encodeURIComponent(id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function driverName(driverId: string): string {
    return drivers.find((d) => d.id === driverId)?.name ?? driverId;
  }
  function driverInitials(driverId: string): string {
    return drivers.find((d) => d.id === driverId)?.initials ?? driverId.slice(0, 2).toUpperCase();
  }

  function exportCsv() {
    if (!period) return;
    const rows: (string | number)[][] = [["Driver", "Job ID", "Job title", "Leg", "Amount"]];
    period.groups.forEach((g) => {
      const name = driverName(g.driverId);
      g.lines.forEach((l) => rows.push([name, l.jobId, l.jobTitle, l.legLabel, l.amount.toFixed(2)]));
      if (g.moreLegsCount > 0) rows.push([name, "", `+ ${g.moreLegsCount} more legs`, "", g.moreLegsAmount.toFixed(2)]);
    });
    rows.push(["", "", "", "Period total", period.amount.toFixed(2)]);
    downloadCsv(`a3tranz-payroll-${period.id}.csv`, rows);
  }

  if (!user) return null;

  if (period === undefined) {
    return (
      <>
        <Topbar title="Payroll" />
        <div className="content">
          <Skeleton height={120} />
        </div>
      </>
    );
  }

  if (period === null) {
    return (
      <>
        <Topbar title="Payroll" />
        <div className="content">
          <EmptyState icon={<Users />} title="Pay period not found" description={`No pay period with id ${id}.`} />
        </div>
      </>
    );
  }

  if (!allowed) {
    return (
      <>
        <Topbar title="Payroll" />
        <div className="content">
          <EmptyState
            icon={<Users />}
            title="Payroll isn't available for your role"
            description="Project Manager and Dispatcher accounts aren't granted payroll visibility (plan §6.6)."
          />
        </div>
      </>
    );
  }

  const canMarkPaid = can(user.role, "markPayrollPaid");

  return (
    <>
      <Topbar title="Payroll" />
      <div className="content" style={showConfirm ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
        <div className="page-head">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h1>{period.label}</h1>
              <StatusPill status={PAY_STATUS_PILL[period.status]} label={PAY_STATUS_LABEL[period.status]} />
            </div>
            <div className="sub">
              {period.status === "paid"
                ? `Paid ${period.paidAt ? shortDate(period.paidAt) : shortFromLong(period.paysAt)} by ${user.name} · reference ${period.reference ?? "—"}`
                : `Closed ${period.closesAt} · pays ${period.paysAt} · ${period.driverCount} drivers · ${period.legCount} job legs`}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <Button variant="secondary" onClick={exportCsv}>
              <Download />
              {period.status === "paid" ? "Download statement" : "Export CSV"}
            </Button>
            {period.status === "payable" && (
              <RoleGate role={user.role} cap="markPayrollPaid">
                <Button variant="primary" onClick={() => setShowConfirm(true)} disabled={!canMarkPaid}>
                  <Check />
                  Mark period as paid
                </Button>
              </RoleGate>
            )}
          </div>
        </div>

        {period.status === "paid" && (
          <div className="toast toast-ok" style={{ marginBottom: 20 }}>
            <CheckCircle2 />
            <Money amount={period.amount} />
            &nbsp;marked paid to {period.driverCount} drivers. Each driver&apos;s app now shows this period as Paid.
          </div>
        )}

        {period.status === "paid" ? (
          <div className="card">
            <div className="card-h">
              <h3>Payment record</h3>
            </div>
            {period.groups.length === 0 ? (
              <EmptyState
                icon={<Users />}
                title="No itemised breakdown"
                description="This period was paid before per-driver line items were recorded in the fixture data."
              />
            ) : (
              <>
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>Driver</th>
                      <th>Job legs</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Paid</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {period.groups.map((g) => (
                      <tr key={g.driverId}>
                        <td>
                          <span className="mini-av">{driverInitials(g.driverId)}</span>
                          <span className="t-strong">{driverName(g.driverId)}</span>
                        </td>
                        <td>{g.lines.length + g.moreLegsCount}</td>
                        <td><Money amount={g.amount} /></td>
                        <td><StatusPill status="done" label="Paid" /></td>
                        <td className="t-sub">{period.paidAt ? shortDate(period.paidAt) : shortFromLong(period.paysAt)}</td>
                        <td className="t-id">{period.reference ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="pager">
                  <span>Period total</span>
                  <span style={{ marginLeft: "auto", font: "800 18px var(--fd)", color: "var(--text)", letterSpacing: "-.4px" }}>
                    <Money amount={period.amount} />
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="grid-2">
            <div className="card">
              <div className="card-h">
                <h3>By driver</h3>
              </div>
              <div style={{ padding: "18px 22px 22px" }}>
                {period.groups.length === 0 ? (
                  <EmptyState
                    icon={<Users />}
                    title="No driver breakdown yet"
                    description="Legs accrue into this card as jobs are approved through the pay period."
                  />
                ) : (
                  <>
                    {period.groups.map((g) => (
                      <PayGroup
                        key={g.driverId}
                        driverInitials={driverInitials(g.driverId)}
                        driverName={driverName(g.driverId)}
                        amount={g.amount}
                        statusLabel={PAY_STATUS_LABEL[period.status] as "Payable" | "Held" | "Paid" | "Accruing"}
                      >
                        {g.lines.map((l) => (
                          <PayLine key={`${l.jobId}-${l.legLabel}`} jobId={l.jobId} jobTitle={l.jobTitle} legLabel={l.legLabel} amount={l.amount} />
                        ))}
                        {g.moreLegsCount > 0 && <PayLineMore count={g.moreLegsCount} amount={g.moreLegsAmount} />}
                      </PayGroup>
                    ))}
                    <div className="legtotal">
                      Period total
                      <span className="lt">
                        <Money amount={period.amount} />
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-h">
                  <h3>How this period was built</h3>
                </div>
                <div style={{ padding: "18px 22px 22px" }}>
                  <Timeline events={buildTimeline(period)} />
                </div>
              </div>
              {period.groups.length > 0 && (
                <div className="card">
                  <div className="card-h">
                    <h3>Split across drivers</h3>
                  </div>
                  <div style={{ padding: "22px 24px 18px" }}>
                    <Bars
                      items={period.groups.map((g) => ({
                        label: driverName(g.driverId).split(" ")[0],
                        value: g.amount,
                        displayValue: g.amount.toLocaleString("en-US", { maximumFractionDigits: 0 }),
                      }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showConfirm && (
        <Modal
          title="Mark period as paid"
          onClose={closeConfirm}
          footer={
            <>
              <Button variant="secondary" onClick={closeConfirm} disabled={busy}>
                Cancel
              </Button>
              <RoleGate role={user.role} cap="markPayrollPaid">
                <Button variant="primary" onClick={handleConfirmPaid} disabled={busy || !canMarkPaid}>
                  <Check />
                  {busy ? "Confirming…" : "Confirm paid"}
                </Button>
              </RoleGate>
            </>
          }
        >
          <div className="toast toast-info" style={{ marginBottom: 20 }}>
            <Info />
            This records a payment made outside A3TRANZ. It does not move money.
          </div>
          {error && (
            <div style={{ marginBottom: 14 }}>
              <Toast tone="err">
                <AlertTriangle />
                {error}
              </Toast>
            </div>
          )}
          <div className="card" style={{ boxShadow: "none", padding: "4px 18px 14px", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--hairline)", font: "500 14px var(--f)", color: "var(--text-2)" }}>
              Period
              <span style={{ marginLeft: "auto", font: "600 14px var(--f)", color: "var(--text)" }}>{period.label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--hairline)", font: "500 14px var(--f)", color: "var(--text-2)" }}>
              Drivers
              <span style={{ marginLeft: "auto", font: "600 14px var(--f)", color: "var(--text)" }}>{period.driverCount}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--hairline)", font: "500 14px var(--f)", color: "var(--text-2)" }}>
              Job legs
              <span style={{ marginLeft: "auto", font: "600 14px var(--f)", color: "var(--text)" }}>{period.legCount}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 0 4px", font: "700 15px var(--f)", color: "var(--text)" }}>
              Total
              <span style={{ marginLeft: "auto", font: "800 24px var(--fd)", color: "var(--text)", letterSpacing: "-.6px" }}>
                <Money amount={period.amount} />
              </span>
            </div>
          </div>
          <div className="two">
            <div className="field">
              <label>Payment date</label>
              <input className="input" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Reference</label>
              <input
                className="input"
                value={reference || suggestedReference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Method</label>
            <select className="select" defaultValue="ach">
              <option value="ach">ACH — company account</option>
              <option value="check">Check</option>
              <option value="wire">Wire</option>
            </select>
          </div>
        </Modal>
      )}
    </>
  );
}
