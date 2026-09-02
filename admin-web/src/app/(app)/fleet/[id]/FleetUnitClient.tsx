"use client";
// W18 — Fleet unit detail, incl. out-of-service defect record (task W-03e).
// Pixel port of W18-out-of-service from a3tranz-admin-all.html. The driver's
// defect note is read from the real FleetRepo record and rendered quoted +
// attributed — never editable, this is the legal record of why a unit went
// out of service (plan §5 W-03e / §6 gate 10).
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, Container, MessageSquare, User, Wrench, X } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { Toast } from "@/components/Toast";
import { Button } from "@/components/Button";
import { RoleGate } from "@/components/RoleGate";
import { UnitChip } from "@/components/UnitChip";
import { Timeline } from "@/components/Timeline";
import { useStore } from "@/data/repos/useStore";
import { authStore } from "@/data/repos/auth";
import { fleetRepo } from "@/data/repos/fleet";
import { jobsRepo } from "@/data/repos/jobs";
import type { FleetUnit } from "@/data/contracts/fleet";
import type { InspectionItem } from "@/data/contracts/jobs";

// The checklist comes from the job the defect blocked — that inspection IS
// the record of why this unit is out of service. It used to be a hardcoded
// five-item list and a hardcoded "11 of 12", which could not disagree with the
// defect note beside it because it was not reading anything.

export default function FleetUnitClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const user = useStore(authStore);
  const [unit, setUnit] = useState<FleetUnit | null | undefined>(undefined);
  const [items, setItems] = useState<InspectionItem[]>([]);

  useEffect(() => {
    fleetRepo.get(id).then(setUnit);
  }, [id]);

  // The blocking job carries the inspection that took this unit off the road.
  useEffect(() => {
    const jobId = unit?.defect?.blockedJobId;
    if (!jobId) return;
    let live = true;
    jobsRepo.get(jobId).then((j) => {
      if (live) setItems(j?.inspection?.items ?? []);
    });
    return () => {
      live = false;
    };
  }, [unit?.defect?.blockedJobId]);

  async function handleReturnToService() {
    await fleetRepo.returnToService(id);
    router.push("/fleet");
  }

  if (!user) return null;

  if (unit === undefined) {
    return (
      <>
        <Topbar title="Fleet" />
        <div className="content">
          <Skeleton height={120} />
        </div>
      </>
    );
  }

  if (unit === null) {
    return (
      <>
        <Topbar title="Fleet" />
        <div className="content">
          <EmptyState icon={<Container />} title="Unit not found" description={`No fleet unit with id ${id}.`} />
        </div>
      </>
    );
  }

  const defect = unit.defect;

  return (
    <>
      <Topbar title="Fleet" />
      <div className="content">
        <div className="page-head">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h1>{unit.id}</h1>
              {defect && <UnitChip icon={<AlertTriangle />} outOfService>Out of service</UnitChip>}
            </div>
            <div className="sub">
              {unit.label} · {unit.plate}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <Link href="/messages" className="btn btn-secondary">
              <MessageSquare />
              Message driver
            </Link>
            {defect && (
              <RoleGate role={user.role} cap="manageCustomersFleet">
                <Button variant="primary" onClick={handleReturnToService}>
                  <Wrench />
                  Clear &amp; return to service
                </Button>
              </RoleGate>
            )}
          </div>
        </div>

        {defect && (
          <div style={{ marginBottom: 20 }}>
            <Toast tone="warn">
              <AlertTriangle />
              Defect reported by {defect.reportedBy} — {defect.note} · {defect.at}. Job {defect.blockedJobId} was blocked
              from starting.
            </Toast>
          </div>
        )}

        <div className="grid-2">
          <div className="card">
            <div className="card-h">
              <h3>{defect ? `Failed pre-trip inspection · ${defect.at}` : "Unit status"}</h3>
            </div>
            <div style={{ padding: "16px 22px 20px" }}>
              {defect ? (
                <>
                  <div className="insp fail">
                    <span className="it">{defect.item}</span>
                    <span className="pf">
                      <b className="p"><Check /></b>
                      <b className="f"><X /></b>
                    </span>
                  </div>
                  <div className="inote">
                    <label>
                      <AlertTriangle />
                      Defect note from driver
                    </label>
                    <div className="said">&ldquo;{defect.note}&rdquo;</div>
                    <div className="by">
                      <User />
                      {defect.reportedBy} · {defect.at}
                    </div>
                  </div>
                  {items
                    .filter((it) => it.result === "pass")
                    .map((it, i, arr) => (
                      <div className="insp pass" key={it.id} style={i === arr.length - 1 ? { marginBottom: 0 } : undefined}>
                        <span className="it">{it.label}</span>
                        <span className="pf">
                          <b className="p"><Check /></b>
                          <b><X /></b>
                        </span>
                      </div>
                    ))}
                  {items.length > 0 && (
                    <div style={{ font: "600 13px var(--f)", color: "var(--text-2)", marginTop: 14 }}>
                      {items.filter((it) => it.result === "pass").length} of {items.length} items passed ·{" "}
                      {items.filter((it) => it.result === "defect").length} defect
                    </div>
                  )}
                </>
              ) : (
                <div className="t-sub">
                  Last inspection {unit.lastInspectionAt} · next due {unit.nextDueAt}. No open defects on record.
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-h">
              <h3>Inspection history</h3>
            </div>
            <div style={{ padding: "20px 22px 22px" }}>
              {unit.inspectionHistory.length === 0 ? (
                <div className="t-sub">No inspections on record yet.</div>
              ) : (
                <Timeline
                  events={unit.inspectionHistory.map((e) => ({
                    id: e.id,
                    title: e.title,
                    meta: e.meta,
                    at: "",
                    tone: e.tone,
                  }))}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
