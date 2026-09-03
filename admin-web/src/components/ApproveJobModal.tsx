"use client";
// W22 — Approve job (task W-08). Pixel port of W22-notify-customer from
// a3tranz-admin-all.html, EXCEPT the customer email body: plan §8 Q2
// (RESOLVED) drops the `J1-…` / `CR-…` ticket-number literals the source
// markup prints and rewords that line to "Container returned and chassis
// returned; 9 photos are attached." Nothing else about this modal changes —
// see the file-level comment on jobs/[id]/page.tsx for why the payroll cards
// (this one included) are `viewPayroll`-gated content, not a hidden action.
import { useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  MailCheck,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { PhotoThumb } from "@/components/PhotoThumb";
import { Button } from "@/components/Button";
import { RoleGate } from "@/components/RoleGate";
import { Toast } from "@/components/Toast";
import { StatusPill } from "@/components/StatusPill";
import { JobTypeChip } from "@/components/JobTypeChip";
import { NumbersOnJobCard } from "@/components/NumbersOnJobCard";
import { jobsRepo } from "@/data/repos/jobs";
import { STEP_ORDER, STEP_SLOTS, STEP_TITLES, TOTAL_EVIDENCE_PHOTOS } from "@/lib/jobSteps";
import type { Job } from "@/data/contracts/jobs";
import type { Customer } from "@/data/contracts/customers";
import type { Role } from "@/data/contracts/auth";

/** Default send-back reason — the source markup has no reason field on W22
 * (the toast-warn above the fold is the whole "are you sure" affordance), so
 * there is nothing for a form to collect. */
const SEND_BACK_REASON = "Sent back for correction after evidence review";

function firstName(name: string): string {
  return name.trim().split(" ")[0] || name;
}

export function ApproveJobModal({
  job,
  customer,
  role,
  driverName,
  onClose,
  onApproved,
  onSentBack,
}: {
  job: Job;
  customer: Customer | null;
  role: Role;
  driverName: string;
  onClose: () => void;
  onApproved: (job: Job) => void;
  onSentBack: (job: Job) => void;
}) {
  const [busy, setBusy] = useState<"approve" | "sendback" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submittedEvent = job.timeline.find((e) => e.tone === "review") ?? job.timeline[job.timeline.length - 1];
  const deliveredEvent = job.timeline.find((e) => e.title.toLowerCase().includes("confirm delivery"));
  const submittedAt = submittedEvent?.at ?? "—";
  const deliveredAt = deliveredEvent?.at ?? submittedAt;
  const photoCount = job.evidence.length;

  async function handleApprove() {
    setBusy("approve");
    setError(null);
    try {
      const updated = await jobsRepo.approve(job.id);
      onApproved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleSendBack() {
    setBusy("sendback");
    setError(null);
    try {
      const updated = await jobsRepo.sendBack(job.id, SEND_BACK_REASON);
      onSentBack(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      title="Approve & close job"
      onClose={onClose}
      footer={
        <>
          <RoleGate role={role} cap="approveJobs">
            <Button variant="secondary" onClick={handleSendBack} disabled={busy !== null}>
              {busy === "sendback" ? "Sending back…" : "Send back to driver"}
            </Button>
          </RoleGate>
          <RoleGate role={role} cap="approveJobs">
            <Button variant="primary" onClick={handleApprove} disabled={busy !== null}>
              <CheckCircle2 />
              {busy === "approve" ? "Approving…" : "Approve & close"}
            </Button>
          </RoleGate>
        </>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <StatusPill status={job.status} />
        <JobTypeChip type={job.type} />
        <span className="t-id" style={{ marginLeft: "auto" }}>
          {job.id}
        </span>
      </div>
      <div style={{ font: "800 18px var(--fd)", color: "var(--text)", letterSpacing: "-.3px", marginBottom: 3 }}>
        {job.title}
      </div>

      <div className="toast toast-warn" style={{ margin: "10px 0 14px" }}>
        <AlertTriangle />
        The customer was already told this job is complete. Sending it back means correcting them.
      </div>

      {error && (
        <div style={{ marginBottom: 14 }}>
          <Toast tone="err">
            <AlertTriangle />
            {error}
          </Toast>
        </div>
      )}

      <div className="sub" style={{ marginBottom: 18 }}>
        {customer?.name ?? "—"} · submitted by {driverName}, {submittedAt}
      </div>

      <div className="section-lbl" style={{ margin: "0 0 10px" }}>
        Numbers on this job
      </div>
      <NumbersOnJobCard job={job} bare />

      <div className="section-lbl" style={{ margin: "0 0 10px" }}>
        Stage photos · {photoCount} of {TOTAL_EVIDENCE_PHOTOS} required
      </div>
      <div style={{ marginBottom: 20 }}>
        {STEP_ORDER.map((step, stepIdx) => {
          const slots = STEP_SLOTS[step];
          const evidenceForStep = job.evidence.filter((e) => e.step === step);
          return (
            <div key={step}>
              <div className="section-lbl" style={{ margin: stepIdx === 0 ? "0 0 10px" : "16px 0 10px" }}>
                {STEP_TITLES[step]} · {evidenceForStep.length} of {slots.count}
              </div>
              {Array.from({ length: slots.count }, (_, i) => i).map((slotIndex) => {
                const ev = evidenceForStep.find((e) => e.slot === slotIndex);
                const isLast = stepIdx === STEP_ORDER.length - 1 && slotIndex === slots.count - 1;
                return ev ? (
                  <div className="pslot" style={isLast ? { marginBottom: 0 } : undefined} key={slotIndex}>
                    <PhotoThumb src={ev.photoUrl} alt={ev.label} />
                    <div className="pb">
                      <div className="pt">
                        {slotIndex + 1} · {ev.label}
                      </div>
                      <div className="pm">{ev.note}</div>
                    </div>
                    <span className="pk">
                      <CheckCircle2 />
                    </span>
                  </div>
                ) : (
                  <div className="pslot blank" style={isLast ? { marginBottom: 0 } : undefined} key={slotIndex}>
                    <PhotoThumb alt={slots.labels[slotIndex]} />
                    <div className="pb">
                      <div className="pt">
                        {slotIndex + 1} · {slots.labels[slotIndex]}
                      </div>
                      <div className="pm">Not captured yet</div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="section-lbl" style={{ margin: "0 0 10px" }}>
        Customer email — already sent
      </div>
      <div className="toast toast-ok" style={{ marginBottom: 10 }}>
        <MailCheck />
        Sent to {customer?.name ?? "the customer"} at {submittedAt}, when {driverName} submitted.
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "13px 15px",
          background: "var(--surface-2)",
          border: "1px solid var(--hairline)",
          borderRadius: "var(--r)",
          marginBottom: 10,
        }}
      >
        <span className={`cbx${customer?.notifyOnComplete ? " on" : ""}`}>
          <Check />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ font: "600 14px var(--f)", color: "var(--text)" }}>
            Completion email — {customer?.name ?? "customer"}
          </div>
          <div style={{ font: "500 12px var(--f)", color: "var(--text-2)", marginTop: 2 }}>
            {customer?.email ?? "—"}
          </div>
        </div>
      </div>
      <div className="emailprev">
        <div className="eh">
          Job {job.id} completed — {job.title}
        </div>
        Hi {customer ? firstName(customer.contactName) : "there"},<br />
        Your container <b style={{ color: "var(--text)" }}>{job.containerNo}</b> was delivered to{" "}
        {job.deliveryLocation} on {deliveredAt}.<br />
        {/* plan §8 Q2 (resolved): no J1-… / CR-… ticket-number literals in the email body. */}
        Container returned and chassis returned; {photoCount} photos are attached.<br />
        — A 3 Transport Inc
      </div>
    </Modal>
  );
}
