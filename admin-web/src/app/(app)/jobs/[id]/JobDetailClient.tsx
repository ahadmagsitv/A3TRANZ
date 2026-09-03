"use client";
// W5 — Job detail + timeline (task W-07a) and W6 — job chat thread (task
// W-07b) share this one job-scoped route, per plan §2.2 folder structure
// (`jobs/[id]/page.tsx  # W5, W6, W22`). Chat is a view toggle (`?view=chat`)
// on the same page rather than a second route.
//
// The RBAC "dispatcher view" (W5-dispatcher-view-rbac) is NOT a second page —
// it is this same component, still fetching the real job, with:
//   - Approve & close gated by <RoleGate cap="approveJobs"> (visible+locked
//     for Dispatcher/Project Manager, per plan §6.6).
//   - The payroll-priced cards (Numbers on this job, Pre-trip inspection,
//     Job notes, Attachment history, Price & payroll) shown only for roles
//     that hold the "viewPayroll" capability — those cards carry pricing and
//     evidence-review detail that Dispatcher/Project Manager aren't granted
//     anywhere else in the RBAC matrix either (plan §6.6 table), so this is
//     content scoping by capability, not a hidden *action* (gate §7 #9 is
//     about controls, not information cards).
//
// Pretrip inspection reuses the real FleetUnit.defect record (already the
// source of truth in fleet/[id]/page.tsx / W18) instead of inventing a
// per-job checklist field that isn't in the Job contract.
import { use, useEffect, useMemo, useState, type FormEvent, Fragment } from "react";
import { jobLabel } from "@/lib/jobLabel";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Container,
  Download,
  FileText,
  Hash,
  Info,
  MapPin,
  MessageSquare,
  Pencil,
  ShieldAlert,
  Truck as TruckIcon,
  User,
  X,
} from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { PhotoThumb } from "@/components/PhotoThumb";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { Button } from "@/components/Button";
import { RoleGate } from "@/components/RoleGate";
import { StatusPill } from "@/components/StatusPill";
import { JobTypeChip } from "@/components/JobTypeChip";
import { PriorityTag } from "@/components/PriorityTag";
import { UnitChip } from "@/components/UnitChip";
import { Money } from "@/components/Money";
import { Timeline } from "@/components/Timeline";
import { JobFormModal } from "@/components/JobFormModal";
import { useStore } from "@/data/repos/useStore";
import { authStore } from "@/data/repos/auth";
import { can } from "@/lib/rbac";
import { jobsRepo } from "@/data/repos/jobs";
import { customersRepo } from "@/data/repos/customers";
import { fleetRepo } from "@/data/repos/fleet";
import { driversRepo } from "@/data/repos/drivers";
import { chatRepo, chatStore } from "@/data/repos/chat";
import { ChatBubbles } from "@/components/ChatBubbles";
import { ChatComposer } from "@/components/ChatComposer";
import { ApproveJobModal } from "@/components/ApproveJobModal";
import { NumbersOnJobCard } from "@/components/NumbersOnJobCard";
import { STEP_SLOTS, STEP_TITLES } from "@/lib/jobSteps";
import type { Job, JobStep } from "@/data/contracts/jobs";
import type { Customer } from "@/data/contracts/customers";
import type { FleetUnit } from "@/data/contracts/fleet";
import type { Driver } from "@/data/contracts/drivers";

// The checklist is whatever the driver actually logged — `job.inspection`
// off the API. It used to be a hardcoded 12-item list with a hardcoded failed
// item, which meant this card showed the same thing for every job and could
// not disagree with the defect record it sits next to.

function shortName(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

type StepState = "done" | "on" | "plain";

function stepperStates(job: Job): [StepState, StepState, StepState, StepState] {
  const pickupCount = job.evidence.filter((e) => e.step === "pickup").length;
  const loadCount = job.evidence.filter((e) => e.step === "load").length;
  const deliveryCount = job.evidence.filter((e) => e.step === "delivery").length;

  if (job.status === "done") return ["done", "done", "done", "done"];
  if (job.status === "blocked") return ["on", "plain", "plain", "plain"];

  let reached = -1;
  if (job.status !== "pending") reached = 0;
  if (pickupCount >= STEP_SLOTS.pickup.count) reached = 1;
  if (loadCount >= STEP_SLOTS.load.count) reached = 2;
  if (deliveryCount >= STEP_SLOTS.delivery.count) reached = 3;

  return [0, 1, 2, 3].map((i): StepState => {
    if (reached === -1) return i === 0 ? "on" : "plain";
    if (i < reached) return "done";
    if (i === reached) return "on";
    return "plain";
  }) as [StepState, StepState, StepState, StepState];
}

export default function JobDetailClient({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // The id in the route IS the job id. The API generates `A3-0001` with no
  // leading `#`; that prefix was a fixture-era artifact, and the helper that
  // re-attached it here asked the server for a job that cannot exist.
  const { id } = use(params);
  // `useSearchParams` (client-side, reads the real URL), not `use(props.
  // searchParams)` — the static export in next.config.ts renders this route
  // with `dynamic = "error"`, and awaiting the server-provided searchParams
  // Promise is exactly the dynamic API that trips. This still needs the
  // Suspense boundary the page.tsx wrapper provides.
  const searchParams = useSearchParams();
  const router = useRouter();
  const view = searchParams.get("view") === "chat" ? "chat" : "detail";
  const user = useStore(authStore);
  const threads = useStore(chatStore);

  const [job, setJob] = useState<Job | null | undefined>(undefined); // undefined = loading
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [truck, setTruck] = useState<FleetUnit | null>(null);
  const [chassisUnit, setChassisUnit] = useState<FleetUnit | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [showEdit, setShowEdit] = useState(false);
  const [showApprove, setShowApprove] = useState(false);

  useEffect(() => {
    jobsRepo.get(id).then(setJob);
    driversRepo.list().then(setDrivers);
  }, [id]);

  useEffect(() => {
    if (!job) return;
    customersRepo.get(job.customerId).then(setCustomer);
    fleetRepo.get(job.truckId).then(setTruck);
    fleetRepo.get(job.chassisId).then(setChassisUnit);
  }, [job]);

  const thread = useMemo(() => threads.find((t) => t.jobId === id) ?? null, [threads, id]);

  useEffect(() => {
    if (view === "chat" && thread && thread.unread) {
      chatRepo.markRead(thread.id);
    }
  }, [view, thread]);

  if (!user) return null;

  if (job === undefined) {
    return (
      <>
        <Topbar title="Jobs" />
        <div className="content">
          <Skeleton height={120} />
        </div>
      </>
    );
  }

  if (job === null) {
    return (
      <>
        <Topbar title="Jobs" />
        <div className="content">
          <EmptyState icon={<Container />} title="Job not found" description={`No job with id ${id}.`} />
        </div>
      </>
    );
  }

  const canViewPayroll = can(user.role, "viewPayroll");
  const driverName = (driverId: string | null) => {
    if (!driverId) return "Unassigned";
    return drivers.find((d) => d.id === driverId)?.name ?? driverId;
  };
  const driverInitials = (driverId: string | null) => {
    if (!driverId) return "—";
    return drivers.find((d) => d.id === driverId)?.initials ?? "—";
  };
  const driverCity = drivers.find((d) => d.id === job.driverId)?.city ?? "";

  const defect =
    job.status === "blocked"
      ? truck?.defect?.blockedJobId === job.id
        ? truck.defect
        : chassisUnit?.defect?.blockedJobId === job.id
          ? chassisUnit.defect
          : undefined
      : undefined;

  const pretripEvent = job.timeline.find((e) => e.title.toLowerCase().includes("pre-trip"));

  // Derived from what the driver logged, not from a constant: an item the API
  // has no result for has not been inspected, and the counts in the header
  // have to be the counts in the list below it.
  const inspectionItems = job.inspection?.items ?? [];
  const failedItems = inspectionItems.filter((i) => i.result === "defect");
  const passedItems = inspectionItems.filter((i) => i.result === "pass");
  const [stepPretrip, stepPickup, stepLoad, stepDelivery] = stepperStates(job);

  const legsByDriver = job.legs.reduce<Map<string, string[]>>((map, leg) => {
    const list = map.get(leg.driverId) ?? [];
    list.push(leg.label);
    map.set(leg.driverId, list);
    return map;
  }, new Map());

  if (view === "chat") {
    return (
      <ChatView
        job={job}
        threadId={thread?.id ?? null}
        driverName={driverName(job.driverId)}
        driverInitials={driverInitials(job.driverId)}
        onBack={() => router.push(`/jobs/${encodeURIComponent(job.id)}`)}
      />
    );
  }

  return (
    <>
      <Topbar title="Jobs" />
      <div className="content">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <Link href="/jobs" className="btn-ghost" style={{ font: "600 13px var(--f)", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <ChevronLeft style={{ width: 16 }} />
            Jobs
          </Link>
          <span className="t-sub">/ {jobLabel(job.id)}</span>
        </div>

        <div className="page-head" style={{ marginBottom: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h1>{job.title}</h1>
              <StatusPill status={job.status} />
              <JobTypeChip type={job.type} />
              <PriorityTag priority={job.priority} />
            </div>
            <div className="sub" style={{ marginTop: 4 }}>
              {customer ? `${customer.name} · ${customer.contactName} · ${customer.email}` : "—"}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            {thread && (
              <Link href={`/jobs/${encodeURIComponent(job.id)}?view=chat`} className="btn btn-secondary">
                <MessageSquare />
                Chat
              </Link>
            )}
            <RoleGate role={user.role} cap="updateJobs">
              <Button variant="secondary" onClick={() => setShowEdit(true)}>
                <Pencil />
                Edit
              </Button>
            </RoleGate>
            {job.status === "awaiting_approval" && (
              <RoleGate role={user.role} cap="approveJobs">
                <Button variant="amber" onClick={() => setShowApprove(true)}>
                  <CheckCircle2 />
                  Approve & close
                </Button>
              </RoleGate>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <UnitChip icon={<TruckIcon />}>{job.truckId}</UnitChip>
          <UnitChip icon={<Container />}>{job.chassisId}</UnitChip>
          {job.containerNo !== "—" && (
            <UnitChip icon={<Hash />}>{job.containerNo}</UnitChip>
          )}
        </div>

        <div className="stepper" style={{ marginBottom: 18 }}>
          <Step label="Pre-trip" state={stepPretrip} note={pretripEvent ? "Passed" : job.status === "blocked" ? "Failed" : "Not started"} />
          <Step label="Pickup" state={stepPickup} note={`${job.evidence.filter((e) => e.step === "pickup").length} of ${STEP_SLOTS.pickup.count} photos`} />
          <Step label="Load" state={stepLoad} note={`${job.evidence.filter((e) => e.step === "load").length} of ${STEP_SLOTS.load.count} photos`} />
          <Step label="Delivery" state={stepDelivery} note={`${job.evidence.filter((e) => e.step === "delivery").length} of ${STEP_SLOTS.delivery.count} photos`} />
        </div>

        {job.status === "awaiting_approval" &&
          (canViewPayroll ? (
            <div className="toast-inline" style={{ marginBottom: 18 }}>
              <Info />
              {shortName(driverName(job.driverId))} marked this complete — review the closeout evidence, then approve to finalize. Only an admin can
              close a job.
            </div>
          ) : (
            <div className="toast-inline" style={{ marginBottom: 18 }}>
              <ShieldAlert />
              {shortName(driverName(job.driverId))} marked this complete — an <b>Admin or Manager</b> will review the uploads and close it. Dispatchers
              can edit, assign and message, but not finalize.
            </div>
          ))}

        <div className="grid-2">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {canViewPayroll && <NumbersOnJobCard job={job} />}

            {canViewPayroll && (
              <div className="card">
                <div className="card-h">
                  <h3>Pre-trip inspection</h3>
                  {inspectionItems.length > 0 && (failedItems.length === 0 ? (
                    <span className="spill sp-done" style={{ marginLeft: "auto" }}>
                      {passedItems.length} of {inspectionItems.length} passed
                    </span>
                  ) : (
                    <span className="spill sp-overdue" style={{ marginLeft: "auto" }}>
                      {failedItems.length} of {inspectionItems.length} failed
                    </span>
                  ))}
                </div>
                <div style={{ padding: "18px 20px" }}>
                  {inspectionItems.length === 0 ? (
                    <div className="t-sub">Pre-trip inspection not completed yet.</div>
                  ) : (
                    <>
                      {pretripEvent && failedItems.length === 0 && (
                        <div className="toast toast-ok" style={{ marginBottom: 14 }}>
                          <ClipboardCheck />
                          {pretripEvent.meta} — job released to start.
                        </div>
                      )}
                      {inspectionItems.map((item, i) => {
                        const failed = item.result === "defect";
                        return (
                          <Fragment key={item.id}>
                            <div
                              className={failed ? "insp fail" : "insp pass"}
                              style={i === inspectionItems.length - 1 && !failed ? { marginBottom: 0 } : undefined}
                            >
                              <span className="it">{item.label}</span>
                              <span className="pf">
                                <b className={failed ? "p" : "p"}><Check /></b>
                                <b className={failed ? "f" : undefined}><X /></b>
                              </span>
                            </div>
                            {/* A defect without a note is refused at capture, so
                                this always has something to quote. */}
                            {failed && (item.note || defect) && (
                              <div className="inote">
                                <label>
                                  <AlertTriangle />
                                  Defect note from driver
                                </label>
                                <div className="said">&ldquo;{item.note ?? defect?.note}&rdquo;</div>
                                {defect && (
                                  <div className="by">
                                    <User />
                                    {defect.reportedBy} · {defect.at}
                                  </div>
                                )}
                              </div>
                            )}
                          </Fragment>
                        );
                      })}
                    </>
                  )}

                </div>
              </div>
            )}

            <div className="card">
              <div className="card-h">
                <h3>Details</h3>
              </div>
              <div style={{ padding: "18px 20px" }}>
                <div className="section-lbl">Instructions</div>
                <p style={{ font: "500 14px var(--f)", color: "var(--text-2)", lineHeight: 1.6, marginBottom: 16 }}>
                  Pick up at {job.pickupLocation} and deliver to {job.deliveryLocation}.
                </p>
                <div className="mapbox gmap">
                  <iframe
                    className="gmapf"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(job.deliveryLocation)}&z=15&output=embed`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`Map — ${job.deliveryLocation}`}
                  />
                </div>
                <div style={{ font: "600 13px var(--f)", color: "var(--text)", marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <MapPin style={{ width: 15, color: "var(--st-overdue)" }} />
                  {job.deliveryLocation}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-h">
                <h3>Driver capture — by step</h3>
                <span className="t-sub" style={{ marginLeft: "auto" }}>
                  {job.evidence.length} photos{job.sealNo ? " · 1 number" : ""}
                </span>
              </div>
              <div style={{ padding: "18px 20px" }}>
                {(Object.keys(STEP_SLOTS) as Exclude<JobStep, "pretrip">[]).map((step, stepIdx) => {
                  const slots = STEP_SLOTS[step];
                  const evidenceForStep = job.evidence.filter((e) => e.step === step);
                  return (
                    <div key={step}>
                      <div className="section-lbl" style={{ margin: stepIdx === 0 ? "0 0 10px" : "16px 0 10px" }}>
                        {STEP_TITLES[step]} · {evidenceForStep.length} of {slots.count}
                      </div>
                      {Array.from({ length: slots.count }, (_, i) => i).map((slotIndex) => {
                        const ev = evidenceForStep.find((e) => e.slot === slotIndex);
                        return ev ? (
                          <div className="pslot" key={slotIndex}>
                            <PhotoThumb src={ev.photoUrl} alt={ev.label} />
                            <div className="pb">
                              <div className="pt">{slotIndex + 1} · {ev.label}</div>
                              <div className="pm">{ev.note}</div>
                            </div>
                            <span className="pk">
                              <CheckCircle2 />
                            </span>
                          </div>
                        ) : (
                          <div className="pslot blank" key={slotIndex}>
                            <PhotoThumb alt={slots.labels[slotIndex]} />
                            <div className="pb">
                              <div className="pt">{slotIndex + 1} · {slots.labels[slotIndex]}</div>
                              <div className="pm">Not captured yet</div>
                            </div>
                          </div>
                        );
                      })}
                      {step === "pickup" && job.sealNo && (
                        <div className="evid" style={{ marginBottom: 0 }}>
                          <span className="eic">
                            <Hash />
                          </span>
                          <div className="eb">
                            <div className="el">Seal no. — typed by the driver</div>
                            <div className="ev">{job.sealNo}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {job.attachments
                  .filter((a) => a.type === "document")
                  .slice(0, 1)
                  .map((a) => (
                    <div
                      key={a.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        background: "var(--surface-2)",
                        border: "1px solid var(--hairline)",
                        borderRadius: "var(--r)",
                        marginTop: 6,
                      }}
                    >
                      <span style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(37,99,235,.10)", color: "var(--st-progress)", display: "grid", placeItems: "center" }}>
                        <FileText style={{ width: 17 }} />
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ font: "600 13px var(--f)", color: "var(--text)" }}>{a.name}</div>
                        <div className="t-sub">from {shortName(a.uploadedBy)} · {a.size}</div>
                      </div>
                      <Download style={{ width: 17, color: "var(--text-2)" }} />
                    </div>
                  ))}
              </div>
            </div>

            {canViewPayroll && (
              <div className="card">
                <div className="card-h">
                  <h3>Job notes</h3>
                  <span className="t-sub" style={{ marginLeft: "auto" }}>
                    {job.notes.length} · driver &amp; office
                  </span>
                </div>
                <div style={{ padding: "18px 20px" }}>
                  {job.notes.length === 0 ? (
                    <div className="t-sub">No notes on this job yet.</div>
                  ) : (
                    job.notes.map((n, i) => (
                      <div className="evid" key={i} style={i === job.notes.length - 1 ? { marginBottom: 0 } : undefined}>
                        <span className="eic" style={{ background: "var(--navy)", color: "#fff", font: "700 12px var(--f)" }}>
                          {n.author
                            .split(" ")
                            .map((p) => p[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        <div className="eb">
                          <div className="el">
                            {n.author} · {n.at}
                          </div>
                          <div className="ev" style={{ font: "500 14px var(--f)", letterSpacing: 0, lineHeight: 1.45, whiteSpace: "normal" }}>
                            {n.text}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {canViewPayroll && (
              <div className="card">
                <div className="card-h">
                  <h3>Attachment history</h3>
                  <span className="t-sub" style={{ marginLeft: "auto" }}>
                    {job.attachments.length} files
                  </span>
                </div>
                {job.attachments.length === 0 ? (
                  <div className="t-sub" style={{ padding: "18px 20px" }}>
                    No attachments on this job yet.
                  </div>
                ) : (
                  <table className="dtable">
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Added by</th>
                        <th>Source</th>
                        <th>Stage</th>
                        <th>When</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {job.attachments.map((a) => (
                        <tr key={a.name}>
                          <td>
                            {a.uri ? (
                              <a
                                className="t-strong"
                                href={a.uri}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: "var(--navy)", textDecoration: "underline" }}
                              >
                                {a.name}
                              </a>
                            ) : (
                              <span className="t-strong">{a.name}</span>
                            )}
                            <div className="t-id">{a.size} · {a.type}</div>
                          </td>
                          <td>
                            <span className="mini-av">
                              {a.uploadedBy
                                .split(" ")
                                .map((p) => p[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                            {shortName(a.uploadedBy)}
                          </td>
                          <td>
                            <span className="jtype">{a.source}</span>
                          </td>
                          <td>{a.step}</td>
                          <td className="t-sub">{a.at}</td>
                          <td>
                            {/* A presigned bucket URL, so this is a plain link
                                rather than a fetch — the browser downloads it
                                without the app holding the bytes. */}
                            {a.uri ? (
                              <a
                                className="rowact"
                                href={a.uri}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Download ${a.name}`}
                              >
                                <Download />
                              </a>
                            ) : (
                              <span className="rowact" style={{ opacity: 0.45 }}>
                                <Download />
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {canViewPayroll && (
              <div className="card">
                <div className="card-h">
                  <h3>Price &amp; payroll</h3>
                </div>
                <div style={{ padding: "8px 20px 18px" }}>
                  {job.legs.map((leg) => (
                    <div className="legrow" key={leg.id}>
                      <span className="ll">{leg.label}</span>
                      <span className="la money">
                        <Money amount={leg.amount} />
                      </span>
                      <span className="lc">
                        <span className="mini-av">{driverInitials(leg.driverId)}</span>
                        {shortName(driverName(leg.driverId))}
                        <span className={`spill ${job.status === "done" ? "sp-done" : "sp-pending"}`} style={{ marginLeft: 6 }}>
                          {job.status === "done" ? "Paid out" : "Accruing"}
                        </span>
                      </span>
                    </div>
                  ))}
                  <div className="legtotal">
                    Job price
                    <span className="lt money">
                      <Money amount={job.price} />
                    </span>
                  </div>
                  <div className="toast toast-info" style={{ marginTop: 14 }}>
                    <Info />
                    Legs accrue to payroll the moment this job is approved.
                  </div>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-h">
                <h3>Assigned</h3>
              </div>

              {canViewPayroll ? (
                <div style={{ padding: "16px 20px" }}>
                  {Array.from(legsByDriver.entries()).map(([driverId, labels], i, arr) => (
                    <div
                      key={driverId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        paddingBottom: i === arr.length - 1 ? 0 : 12,
                        paddingTop: i === 0 ? 0 : 12,
                        borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--hairline)",
                      }}
                    >
                      <span className="mini-av" style={{ width: 36, height: 36 }}>
                        {driverInitials(driverId)}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ font: "600 14px var(--f)", color: "var(--text)" }}>{driverName(driverId)}</div>
                        <div className="t-sub">{labels.join(" · ")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="mini-av" style={{ width: 36, height: 36 }}>
                      {driverInitials(job.driverId)}
                    </span>
                    <div>
                      <div style={{ font: "600 14px var(--f)", color: "var(--text)" }}>{driverName(job.driverId)}</div>
                      <div className="t-sub">Driver{driverCity ? ` · ${driverCity}` : ""}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-h">
                <h3>Timeline</h3>
              </div>
              <div style={{ padding: 20 }}>
                {job.timeline.length === 0 ? (
                  <div className="t-sub">No activity recorded yet.</div>
                ) : (
                  <Timeline events={job.timeline} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showEdit && (
        <JobFormModal
          mode="edit"
          job={job}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setJob(updated);
            setShowEdit(false);
          }}
        />
      )}

      {showApprove && (
        <ApproveJobModal
          job={job}
          customer={customer}
          role={user.role}
          driverName={driverName(job.driverId)}
          onClose={() => setShowApprove(false)}
          onApproved={() => {
            setShowApprove(false);
            router.push("/jobs");
          }}
          onSentBack={(updated) => {
            setJob(updated);
            setShowApprove(false);
          }}
        />
      )}
    </>
  );
}

function Step({ label, state, note }: { label: string; state: StepState; note: string }) {
  return (
    <div className={`step${state === "done" ? " done" : state === "on" ? " on" : ""}`}>
      <span className="dot">{state === "done" && <Check />}</span>
      <span className="sl">{label}</span>
      <span className="st">{note}</span>
    </div>
  );
}

function ChatView({
  job,
  threadId,
  driverName,
  driverInitials,
  onBack,
}: {
  job: Job;
  threadId: string | null;
  driverName: string;
  driverInitials: string;
  onBack: () => void;
}) {
  const threads = useStore(chatStore);
  const thread = threads.find((t) => t.id === threadId) ?? null;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!thread || !text.trim()) return;
    setSending(true);
    try {
      await chatRepo.send(thread.id, text.trim());
      setText("");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Topbar title={`Job ${job.id} · Chat`} />
      <div className="content" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--hairline)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="mini-av" style={{ width: 34, height: 34 }}>
            {driverInitials}
          </span>
          <div>
            <div style={{ font: "700 14px var(--f)", color: "var(--text)" }}>{driverName}</div>
            <div className="t-sub">
              {job.title} · <StatusPill status={job.status} />
            </div>
          </div>
          <span className="btn-ghost" style={{ marginLeft: "auto", font: "600 13px var(--f)", cursor: "pointer" }} onClick={onBack} role="button">
            Open job →
          </span>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 14, background: "var(--bg)" }}>
          <ChatBubbles messages={thread?.messages ?? []} />
        </div>
        <ChatComposer
          value={text}
          onChange={setText}
          onSubmit={handleSend}
          placeholder={`Message ${driverName.split(" ")[0]}…`}
          disabled={!thread}
          sending={sending}
        />
      </div>
    </>
  );
}
