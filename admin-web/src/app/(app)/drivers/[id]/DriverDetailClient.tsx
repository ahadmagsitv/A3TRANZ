"use client";
// W8 — Driver detail: profile + history, deactivate confirm (task W-04b).
// Pixel port of W8-profile-history / W8-confirm from a3tranz-admin-all.html.
// Confirm renders as a `.modal` over `.scrim-bg` (plan §5 W-04b).
import { use, useEffect, useState } from "react";
import { jobLabel } from "@/lib/jobLabel";
import Link from "next/link";
import { ChevronLeft, MessageSquare, UserCheck, UserX, Users } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { Button } from "@/components/Button";
import { RoleGate } from "@/components/RoleGate";
import { Modal } from "@/components/Modal";
import { StatusPill } from "@/components/StatusPill";
import { useStore } from "@/data/repos/useStore";
import { authStore } from "@/data/repos/auth";
import { driversRepo } from "@/data/repos/drivers";
import { jobsRepo } from "@/data/repos/jobs";
import type { Driver } from "@/data/contracts/drivers";
import type { Job } from "@/data/contracts/jobs";

function attachmentsLabel(job: Job): string {
  if (job.evidence.length > 0) return `${job.evidence.length} photos`;
  if (job.attachments.length > 0) return job.attachments.length === 1 ? "1 doc" : `${job.attachments.length} docs`;
  return "—";
}

export default function DriverDetailClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useStore(authStore);
  const [driver, setDriver] = useState<Driver | null | undefined>(undefined);
  // Every job this driver is on. The history table below wants the completed
  // ones; the Message button only needs to know whether there are any at all,
  // since a conversation is attached to a job.
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const jobs = allJobs.filter((j) => j.status === "done");
  const [showConfirm, setShowConfirm] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => {
    driversRepo.get(id).then(setDriver);
    jobsRepo.list().then((all) => setAllJobs(all.filter((j) => j.driverId === id)));
  }, [id]);

  async function handleDeactivate() {
    setDeactivating(true);
    try {
      const updated = await driversRepo.deactivate(id);
      setDriver(updated);
      setShowConfirm(false);
    } finally {
      setDeactivating(false);
    }
  }

  /**
   * No confirm step: putting a driver back on the road is reversible by the
   * button that replaces it, and the destructive direction is the one that
   * needs a gate.
   */
  async function handleActivate() {
    setDeactivating(true);
    try {
      setDriver(await driversRepo.activate(id));
    } finally {
      setDeactivating(false);
    }
  }

  if (!user) return null;

  if (driver === undefined) {
    return (
      <>
        <Topbar title="Drivers" />
        <div className="content">
          <Skeleton height={120} />
        </div>
      </>
    );
  }

  if (driver === null) {
    return (
      <>
        <Topbar title="Drivers" />
        <div className="content">
          <EmptyState icon={<Users />} title="Driver not found" description={`No driver with id ${id}.`} />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Drivers" />
      <div className="content">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Link href="/drivers" className="btn-ghost" style={{ font: "600 13px var(--f)", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <ChevronLeft style={{ width: 16 }} />
            Drivers
          </Link>
        </div>
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "22px 24px" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--navy)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                font: "800 24px var(--fd)",
              }}
            >
              {driver.initials}
            </div>
            <div>
              <div style={{ font: "800 22px var(--fd)", color: "var(--text)" }}>{driver.name}</div>
              <div className="t-sub" style={{ marginTop: 2 }}>
                Driver · {driver.city} · joined {new Date(driver.joinedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </div>
              <div style={{ marginTop: 6 }}>
                <span className={driver.status === "active" ? "tag-act" : "tag-inact"}>{driver.status === "active" ? "Active" : "Inactive"}</span>
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              {/* Threads are job-scoped, so the inbox is what creates one —
                  this only has to say who. */}
              {allJobs.length > 0 && (
                <Link
                  href={`/messages?driver=${encodeURIComponent(id)}`}
                  className="btn btn-secondary"
                >
                  <MessageSquare />
                  Message
                </Link>
              )}
              <RoleGate role={user.role} cap="manageDrivers">
                {driver.status === "active" ? (
                  <Button
                    variant="secondary"
                    style={{ color: "var(--st-overdue-ink)", borderColor: "rgba(220,38,38,.3)" }}
                    onClick={() => setShowConfirm(true)}
                  >
                    <UserX />
                    Deactivate
                  </Button>
                ) : (
                  <Button variant="amber" onClick={handleActivate} disabled={deactivating}>
                    <UserCheck />
                    {deactivating ? "Reactivating…" : "Reactivate"}
                  </Button>
                )}
              </RoleGate>
            </div>
          </div>
          <div style={{ display: "flex", borderTop: "1px solid var(--hairline)" }}>
            <div style={{ flex: 1, padding: "16px 24px", borderRight: "1px solid var(--hairline)" }}>
              <div className="t-sub">Contact</div>
              <div style={{ font: "600 14px var(--f)", color: "var(--text)", marginTop: 4 }}>
                {driver.email}
                <br />
                {driver.phone}
              </div>
            </div>
            <div style={{ flex: 1, padding: "16px 24px", borderRight: "1px solid var(--hairline)" }}>
              <div className="t-sub">Completed</div>
              <div style={{ font: "800 22px var(--fd)", color: "var(--text)", marginTop: 2 }}>{driver.jobsCompleted}</div>
            </div>
            <div style={{ flex: 1, padding: "16px 24px", borderRight: "1px solid var(--hairline)" }}>
              <div className="t-sub">In progress</div>
              <div style={{ font: "800 22px var(--fd)", color: "var(--st-progress)", marginTop: 2 }}>{driver.jobsInProgress}</div>
            </div>
            <div style={{ flex: 1, padding: "16px 24px" }}>
              <div className="t-sub">Overdue</div>
              <div style={{ font: "800 22px var(--fd)", color: "var(--st-overdue)", marginTop: 2 }}>{driver.jobsOverdue}</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-h">
            <h3>Work history</h3>
          </div>
          <table className="dtable">
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Completed</th>
                <th>Attachments</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="t-sub" style={{ textAlign: "center", padding: "24px 20px" }}>
                    No completed jobs yet.
                  </td>
                </tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <span className="t-strong">{j.title}</span>
                      <div className="t-id">{jobLabel(j.id)}</div>
                    </td>
                    <td>
                      <StatusPill status={j.status} />
                    </td>
                    <td>{new Date(j.dueDate).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}</td>
                    <td className="t-sub">{attachmentsLabel(j)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showConfirm && (
        <Modal onClose={() => setShowConfirm(false)} style={{ width: 460 }} footer={
          <>
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeactivate} disabled={deactivating}>
              <UserX />
              {deactivating ? "Deactivating…" : "Deactivate"}
            </Button>
          </>
        }>
          <div style={{ textAlign: "center", padding: "6px 4px 0" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "rgba(220,38,38,.10)",
                color: "var(--st-overdue)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 14px",
              }}
            >
              <UserX style={{ width: 26 }} />
            </div>
            <h3 style={{ font: "800 19px var(--fd)", color: "var(--text)" }}>Deactivate {driver.name}?</h3>
            <p style={{ font: "500 14px var(--f)", color: "var(--text-2)", lineHeight: 1.55, marginTop: 8 }}>
              They&rsquo;ll lose app access and won&rsquo;t receive new job assignments until reactivated. Their
              in-progress jobs and history are kept.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
