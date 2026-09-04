"use client";
// W19 — Payroll pay periods (task W-10a). Pixel port of W19-pay-periods from
// a3tranz-admin-all.html, with two deliberate deviations:
//   1. The hold-rule banner renders the literal sentence handed down for this
//      build ("Pay is always one full week behind: a period closes Sunday and
//      pays the following Friday") rather than the source markup's paraphrase.
//   2. The pager shows the real fixture count (6 of 6) instead of the source
//      markup's decorative "32" — plan §7 bars fabricated data disconnected
//      from the fixtures.
// Bi-weekly has no periods in the fixture data — switching the chip shows an
// honest empty state rather than inventing a second dataset.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Check, Clock, CheckCircle2, Download, Info, Loader, Pause } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { StatusPill } from "@/components/StatusPill";
import { Money } from "@/components/Money";
import { Button } from "@/components/Button";
import { RoleGate } from "@/components/RoleGate";
import { useStore } from "@/data/repos/useStore";
import { authStore } from "@/data/repos/auth";
import { payrollRepo } from "@/data/repos/payroll";
import { can } from "@/lib/rbac";
import { PAY_STATUS_LABEL, PAY_STATUS_PILL } from "@/lib/payStatus";
import { downloadCsv } from "@/lib/csv";
import type { PayPeriod } from "@/data/contracts/payroll";

export default function PayrollPage() {
  const router = useRouter();
  const user = useStore(authStore);
  const [periods, setPeriods] = useState<PayPeriod[] | null>(null);
  const [mode, setMode] = useState<"weekly" | "biweekly">("weekly");

  const allowed = !!user && can(user.role, "viewPayroll");

  useEffect(() => {
    if (allowed) payrollRepo.list().then(setPeriods);
  }, [allowed]);

  const current = periods?.find((p) => p.status === "accruing");
  const held = periods?.find((p) => p.status === "held");
  const payable = periods?.find((p) => p.status === "payable");
  const paidPeriods = useMemo(() => periods?.filter((p) => p.status === "paid") ?? [], [periods]);
  const paidTotal = paidPeriods.reduce((sum, p) => sum + p.amount, 0);

  function exportCsv() {
    if (!periods) return;
    const rows: (string | number)[][] = [
      ["Period", "Closes", "Pays", "Drivers", "Job legs", "Amount", "Status", "Reference"],
      ...periods.map((p) => [
        p.label,
        p.closesAt,
        p.paysAt,
        p.driverCount,
        p.legCount,
        p.amount.toFixed(2),
        PAY_STATUS_LABEL[p.status],
        p.reference ?? "",
      ]),
    ];
    downloadCsv("a3tranz-payroll-periods.csv", rows);
  }

  if (!user) return null;

  if (!allowed) {
    return (
      <>
        <Topbar title="Payroll" />
        <div className="content">
          <EmptyState
            icon={<Banknote />}
            title="Payroll isn't available for your role"
            description="Project Manager and Dispatcher accounts aren't granted payroll visibility (plan §6.6)."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Payroll" />
      <div className="content">
        <div className="page-head">
          <div>
            <h1>Driver payroll</h1>
            <div className="sub">Automated from approved job legs</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <div className={`chipf${mode === "weekly" ? " on" : ""}`} role="button" onClick={() => setMode("weekly")}>
              Weekly
            </div>
            <div className={`chipf${mode === "biweekly" ? " on" : ""}`} role="button" onClick={() => setMode("biweekly")}>
              Bi-weekly
            </div>
            <Button variant="secondary" onClick={exportCsv} disabled={!periods}>
              <Download />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="toast toast-info" style={{ marginBottom: 20 }}>
          <Info />
          Pay is always one full week behind: a period closes Sunday and pays the following Friday.
        </div>

        {mode === "biweekly" ? (
          <div className="card">
            <EmptyState
              icon={<Banknote />}
              title="No bi-weekly periods"
              description="This company runs payroll weekly — there is no bi-weekly period data to show."
            />
          </div>
        ) : periods === null ? (
          <>
            <div className="kpi-row">
              {Array.from({ length: 4 }).map((_, i) => (
                <div className="kpi" key={i}>
                  <Skeleton width="60%" height={13} />
                  <div style={{ marginTop: 10 }}>
                    <Skeleton width="70%" height={30} />
                  </div>
                </div>
              ))}
            </div>
            <div className="card">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Closes</th>
                    <th>Pays</th>
                    <th>Drivers</th>
                    <th>Job legs</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td><Skeleton width="70%" /></td>
                      <td><Skeleton width="60%" /></td>
                      <td><Skeleton width="60%" /></td>
                      <td><Skeleton width={24} /></td>
                      <td><Skeleton width={24} /></td>
                      <td><Skeleton width={64} /></td>
                      <td><Skeleton width={78} /></td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="kpi-row">
              <div className="kpi">
                <div className="kpi-l">
                  <Loader style={{ width: 16 }} />
                  Accruing this period
                  <span className="kpi-ic" style={{ background: "rgba(100,116,139,.12)", color: "var(--st-pending)" }}>
                    <Clock />
                  </span>
                </div>
                <div className="kpi-n"><Money amount={current?.amount ?? 0} /></div>
                <div className="kpi-d" style={{ color: "var(--text-2)" }}>
                  {current ? `${current.label} · closes Sunday` : "No current period"}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-l">
                  <Pause style={{ width: 16 }} />
                  Held
                  <span className="kpi-ic" style={{ background: "var(--amber-tint)", color: "var(--st-review)" }}>
                    <Clock />
                  </span>
                </div>
                <div className="kpi-n"><Money amount={held?.amount ?? 0} /></div>
                <div className="kpi-d" style={{ color: "var(--text-2)" }}>
                  {held ? `${held.label} · in the one-week hold` : "Nothing held"}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-l">
                  <Banknote style={{ width: 16 }} />
                  Payable Friday
                  <span className="kpi-ic" style={{ background: "rgba(37,99,235,.12)", color: "var(--st-progress)" }}>
                    <Banknote />
                  </span>
                </div>
                <div className="kpi-n"><Money amount={payable?.amount ?? 0} /></div>
                <div className="kpi-d" style={{ color: "var(--st-progress-ink)" }}>
                  {payable ? `${payable.label} · ${payable.driverCount} drivers` : "Nothing payable"}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-l">
                  <CheckCircle2 style={{ width: 16 }} />
                  Paid this year
                  <span className="kpi-ic" style={{ background: "rgba(22,163,74,.12)", color: "var(--st-done)" }}>
                    <CheckCircle2 />
                  </span>
                </div>
                <div className="kpi-n"><Money amount={paidTotal} /></div>
                <div className="kpi-d" style={{ color: "var(--text-2)" }}>
                  {paidPeriods.length} period{paidPeriods.length === 1 ? "" : "s"} paid
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-h">
                <h3>Pay periods</h3>
              </div>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Closes</th>
                    <th>Pays</th>
                    <th>Drivers</th>
                    <th>Job legs</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.id} onClick={() => router.push(`/payroll/${encodeURIComponent(p.id)}`)} style={{ cursor: "pointer" }}>
                      <td>
                        <span className="t-strong">{p.label}</span>
                        {p.isCurrent && <div className="t-id">Current</div>}
                      </td>
                      <td className="t-sub">{p.closesAt}</td>
                      <td className="t-sub">{p.paysAt}</td>
                      <td>{p.driverCount}</td>
                      <td>{p.legCount}</td>
                      <td><Money amount={p.amount} /></td>
                      <td><StatusPill status={PAY_STATUS_PILL[p.status]} label={PAY_STATUS_LABEL[p.status]} /></td>
                      <td className="t-sub" onClick={(e) => e.stopPropagation()}>
                        {p.status === "payable" ? (
                          <RoleGate role={user.role} cap="markPayrollPaid">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => router.push(`/payroll/${encodeURIComponent(p.id)}?confirm=1`)}
                            >
                              <Check />
                              Mark as paid
                            </Button>
                          </RoleGate>
                        ) : p.status === "paid" ? (
                          <span className="t-id">{p.reference ?? "—"}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pager">
                <span>Showing {periods.length} of {periods.length} periods</span>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
