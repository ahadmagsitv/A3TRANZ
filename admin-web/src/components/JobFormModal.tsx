"use client";
// W4 — Create / edit job card (task W-06). Pixel port of W4-import-export /
// W4-validation-error from a3tranz-admin-all.html: one scrolling card
// (Modal already caps at max-height:88% with .modal-b scrolling), Import and
// Export share this one form — the .jtype chip only records which run it is
// (plan §5 W-06). Field order is fixed per plan §6.2: Job type → Customer →
// Job title → Description → Container no. → Pickup/Delivery location →
// Start/Due date → Priority → Job price (total + legs) → Vehicle & equipment
// → Notify → Attachments.
//
// The leg-split validator (plan §6.9) is NOT re-implemented here — legTotal
// is computed locally only to drive the live `.errmsg` hint and the locked
// look on the submit button. The one verbatim sentence
// ("Legs total $X but the job price is $Y — they must match…") always comes
// from the thrown Error out of jobsRepo.create()/update(), never duplicated
// client-side.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Check, Download, Lock, Paperclip, Plus, Upload, X } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { CustomerModal } from "@/components/CustomerModal";
import { customersRepo } from "@/data/repos/customers";
import { fleetRepo } from "@/data/repos/fleet";
import { driversRepo } from "@/data/repos/drivers";
import { jobsRepo } from "@/data/repos/jobs";
import type { Customer } from "@/data/contracts/customers";
import type { FleetUnit } from "@/data/contracts/fleet";
import type { Driver } from "@/data/contracts/drivers";
import type { Job, JobDraft, JobType, Priority } from "@/data/contracts/jobs";

// The limits uploads.ts enforces (MAX_BYTES / ALLOWED), stated once here so
// the picker can refuse a file before the job is saved.
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/heic", "application/pdf"];
const mb = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

const LEG_LABELS = ["Pickup", "Loading", "Delivery"] as const;

interface LegState {
  amount: string;
  driverId: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function JobFormModal({
  mode,
  job,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  job?: Job;
  onClose: () => void;
  onSaved: (job: Job) => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [fleet, setFleet] = useState<FleetUnit[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  useEffect(() => {
    customersRepo.list().then(setCustomers);
    fleetRepo.list().then(setFleet);
    driversRepo.list().then(setDrivers);
  }, []);

  const [type, setType] = useState<JobType>(job?.type ?? "import");
  const [customerId, setCustomerId] = useState(job?.customerId ?? "");
  const [title, setTitle] = useState(job?.title ?? "");
  const [description, setDescription] = useState(""); // not persisted on Job (JobDraft-only field, see mock)
  const [containerNo, setContainerNo] = useState(job?.containerNo && job.containerNo !== "—" ? job.containerNo : "");
  const [pickupLocation, setPickupLocation] = useState(job?.pickupLocation ?? "");
  const [deliveryLocation, setDeliveryLocation] = useState(job?.deliveryLocation ?? "");
  const [startDate, setStartDate] = useState(job?.startDate.slice(0, 10) ?? "");
  const [dueDate, setDueDate] = useState(job?.dueDate.slice(0, 10) ?? "");
  const [priority, setPriority] = useState<Priority>(job?.priority ?? "med");
  const [price, setPrice] = useState(job ? job.price.toFixed(2) : "");
  const [legs, setLegs] = useState<LegState[]>(
    LEG_LABELS.map((_label, i) => {
      const existing = job?.legs[i];
      return { amount: existing ? existing.amount.toFixed(2) : "", driverId: existing?.driverId ?? "" };
    })
  );
  const [truckId, setTruckId] = useState(job?.truckId ?? "");
  const [chassisId, setChassisId] = useState(job?.chassisId ?? "");
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [saving, setSaving] = useState(false);
  // Queued, not uploaded: on create the job has no id yet, and the bucket key
  // is scoped to one. They go up once the job exists — which is also what the
  // edit path does, so there is one flow rather than two.
  const [pending, setPending] = useState<File[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // The error renders in the middle of the scrolling body; Save is in the
  // fixed footer and the file picker is below the error. Without this, a
  // failed upload reported itself somewhere the user was not looking, which
  // is indistinguishable from nothing happening.
  useEffect(() => {
    if (submitError) errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [submitError]);

  const trucks = useMemo(() => fleet.filter((u) => u.type === "truck"), [fleet]);
  const chassisUnits = useMemo(() => fleet.filter((u) => u.type === "chassis"), [fleet]);
  const activeDrivers = useMemo(() => drivers.filter((d) => d.status === "active"), [drivers]);

  // Default the customer/truck/chassis/driver selects to the first loaded
  // option (create mode only) — computed at render time rather than via an
  // effect + setState (avoids the cascading-render footgun; the derived
  // value only commits to state once the user actually picks something, or
  // on submit — see handleSubmit below).
  const effectiveCustomerId = customerId || (mode === "create" ? (customers[0]?.id ?? "") : "");
  const effectiveTruckId = truckId || (mode === "create" ? (trucks[0]?.id ?? "") : "");
  const effectiveChassisId = chassisId || (mode === "create" ? (chassisUnits[0]?.id ?? "") : "");
  const effectiveLegDriverId = (i: number) => legs[i].driverId || (mode === "create" ? (activeDrivers[0]?.id ?? "") : "");

  const priceNum = parseFloat(price) || 0;
  const legTotal = round2(legs.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0));
  const diff = round2(legTotal - priceNum);
  const mismatch = Math.abs(diff) > 0.001;

  function updateLeg(i: number, patch: Partial<LegState>) {
    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    setSubmitError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSubmitError(null);
    const draft: JobDraft = {
      title,
      type,
      customerId: effectiveCustomerId,
      description,
      containerNo: containerNo || "—",
      pickupLocation,
      deliveryLocation,
      startDate,
      dueDate: dueDate ? `${dueDate}T00:00:00` : "",
      priority,
      price: priceNum,
      legs: legs.map((l, i) => ({ label: LEG_LABELS[i], amount: parseFloat(l.amount) || 0, driverId: effectiveLegDriverId(i) })),
      truckId: effectiveTruckId,
      chassisId: effectiveChassisId,
      notifyCustomer,
    };
    try {
      const saved =
        mode === "edit" && job ? await jobsRepo.update(job.id, draft) : await jobsRepo.create(draft);
      // The job is already saved by this point, so an upload failure must not
      // read as "the job was not created" — it is reported against the job
      // that now exists.
      const withFiles = pending.length ? await jobsRepo.attach(saved.id, pending) : saved;
      onSaved(withFiles);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (showAddCustomer) {
    return (
      <CustomerModal
        onClose={() => setShowAddCustomer(false)}
        onCreated={(created) => {
          setCustomers((prev) => [...prev, created]);
          setCustomerId(created.id);
          setShowAddCustomer(false);
        }}
      />
    );
  }

  const FORM_ID = "job-form";

  return (
    <Modal
      title={mode === "edit" ? "Edit job card" : "Create job card"}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="amber" disabled={saving} style={mismatch ? { opacity: 0.45 } : undefined}>
            {mismatch ? <Lock /> : <Plus />}
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Create & assign"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit}>
        <div className="field">
          <label>Job type</label>
          <div style={{ display: "flex", gap: 8 }}>
            <span className={`chipf${type === "import" ? " on" : ""}`} role="button" onClick={() => setType("import")}>
              <Download />
              Import
            </span>
            <span className={`chipf${type === "export" ? " on" : ""}`} role="button" onClick={() => setType("export")}>
              <Upload />
              Export
            </span>
          </div>
        </div>

        <div className="field">
          <label>Customer</label>
          <select className="select" value={effectiveCustomerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="" disabled>
              Select a customer…
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div
            style={{ font: "600 12px var(--f)", color: "var(--amber-ink)", marginTop: 7, cursor: "pointer" }}
            role="button"
            onClick={() => setShowAddCustomer(true)}
          >
            + Add a new customer
          </div>
        </div>

        <div className="field">
          <label>Job title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Container pickup — Terminal B" required />
        </div>

        <div className="field">
          <label>Description</label>
          <textarea
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Instructions, manifest details, contact on site…"
          />
        </div>

        <div className="two">
          <div className="field">
            <label>Container no.</label>
            <input className="input money" value={containerNo} onChange={(e) => setContainerNo(e.target.value)} placeholder="MSCU-441028-3" />
          </div>
        </div>

        <div className="two">
          <div className="field">
            <label>Pickup location</label>
            <input className="input" value={pickupLocation} onChange={(e) => setPickupLocation(e.target.value)} required />
          </div>
          <div className="field">
            <label>Delivery location</label>
            <input className="input" value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} required />
          </div>
        </div>

        <div className="two">
          <div className="field">
            <label>Start date</label>
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div className="field">
            <label>Due date</label>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </div>
        </div>

        <div className="field">
          <label>Priority</label>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="low">Low</option>
            <option value="med">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="section-lbl" style={{ margin: "22px 0 10px" }}>
          Job price
        </div>
        <div className="field">
          <label>Total job price</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", font: "700 14px var(--f)", color: "var(--text)" }}>
              $
            </span>
            <input
              className={`input money${mismatch ? " bad" : ""}`}
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setSubmitError(null);
              }}
              style={{ paddingLeft: 24, fontWeight: 700 }}
              required
            />
          </div>
          {mismatch && (
            <div className="errmsg">
              <AlertTriangle />
              {money(Math.abs(diff))} {diff > 0 ? "over-allocated" : "under-allocated"} across the three legs
            </div>
          )}
        </div>

        <div className="card" style={{ padding: "6px 16px 14px", boxShadow: "none", marginBottom: 0 }}>
          {LEG_LABELS.map((label, i) => (
            <div className="legrow" key={label}>
              <span className="ll">{label}</span>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", font: "700 14px var(--f)", color: "var(--text)" }}>
                  $
                </span>
                <input
                  className={`input money${mismatch ? " bad" : ""}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={legs[i].amount}
                  onChange={(e) => updateLeg(i, { amount: e.target.value })}
                  style={{ width: 100, padding: "8px 12px 8px 22px", fontWeight: 700, color: "var(--text)" }}
                  required
                />
              </div>
              <span className="lc">
                <select
                  className="select"
                  value={effectiveLegDriverId(i)}
                  onChange={(e) => updateLeg(i, { driverId: e.target.value })}
                  style={{ padding: "8px 12px", fontSize: 13, width: 190 }}
                  required
                >
                  <option value="" disabled>
                    Assign a driver…
                  </option>
                  {activeDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          ))}
          <div className="legtotal" style={mismatch ? { color: "var(--st-overdue-ink)" } : undefined}>
            Legs total
            <span className="lt money" style={mismatch ? { color: "var(--st-overdue-ink)" } : undefined}>
              {money(legTotal)}
            </span>
          </div>
        </div>

        {submitError ? (
          <div ref={errorRef} className="toast toast-err" style={{ margin: "8px 0 18px" }}>
            <AlertTriangle />
            {submitError}
          </div>
        ) : (
          <div className="toast toast-info" style={{ margin: "8px 0 18px" }}>
            <Check style={{ width: 14 }} />
            Legs must sum to the total. Each leg pays its own driver.
          </div>
        )}

        <div className="section-lbl" style={{ margin: "0 0 10px" }}>
          Vehicle &amp; equipment
        </div>
        <div className="two">
          <div className="field">
            <label>Vehicle (truck)</label>
            <select className="select" value={effectiveTruckId} onChange={(e) => setTruckId(e.target.value)} required>
              <option value="" disabled>
                Select a truck…
              </option>
              {trucks.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id} — {u.label}
                  {u.status === "out_of_service" ? " (out of service)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Chassis / equipment</label>
            <select className="select" value={effectiveChassisId} onChange={(e) => setChassisId(e.target.value)} required>
              <option value="" disabled>
                Select a chassis…
              </option>
              {chassisUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id} — {u.label}
                  {u.status === "out_of_service" ? " (out of service)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="section-lbl" style={{ margin: "0 0 10px" }}>
          Notify
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
            marginBottom: 18,
            cursor: "pointer",
          }}
          role="button"
          onClick={() => setNotifyCustomer((v) => !v)}
        >
          <span className={`cbx${notifyCustomer ? " on" : ""}`}>{notifyCustomer && <Check />}</span>
          <div>
            <div style={{ font: "600 14px var(--f)", color: "var(--text)" }}>Email customer when the driver submits</div>
            <div style={{ font: "500 12px var(--f)", color: "var(--text-2)", marginTop: 2 }}>
              Goes to the customer&rsquo;s email the moment the driver marks the job complete — before office approval
            </div>
          </div>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label>Attachments</label>
          <label
            className="dropzone"
            style={{ cursor: "pointer", display: "block", margin: 0 }}
          >
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/heic,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                // Checked here, not after saving: presign enforces the same
                // limits, but by then the job exists and the failure reads as
                // "the job saved but the file vanished".
                const tooBig = picked.filter((f) => f.size > MAX_UPLOAD_BYTES);
                const wrongType = picked.filter(
                  (f) => f.type && !ACCEPTED_TYPES.includes(f.type),
                );
                const rejected = [...new Set([...tooBig, ...wrongType])];
                setSubmitError(
                  rejected.length === 0
                    ? null
                    : tooBig.length > 0
                      ? `${tooBig[0]!.name} is ${mb(tooBig[0]!.size)} — the limit is ${mb(MAX_UPLOAD_BYTES)} per file.`
                      : `${wrongType[0]!.name} is not a PDF, JPEG, PNG or HEIC.`,
                );
                setPending((prev) => [...prev, ...picked.filter((f) => !rejected.includes(f))]);
                // Let the same file be picked again after being removed.
                e.target.value = "";
              }}
            />
            <Paperclip />
            <div>
              {pending.length === 0
                ? `Drop PDFs, photos or documents — or click to browse (max ${mb(MAX_UPLOAD_BYTES)} each)`
                : `${pending.length} file${pending.length === 1 ? "" : "s"} ready — click to add more`}
            </div>
          </label>

          {/* Styled inline rather than with a class: `.filechip` is mobile's
              stylesheet, not this one, so these rows rendered unstyled here. */}
          {pending.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {pending.map((f, i) => (
                <div
                  key={`${f.name}-${f.lastModified}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    background: "var(--surface-2)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "var(--r)",
                    font: "600 13px var(--f)",
                    color: "var(--text)",
                  }}
                >
                  <Paperclip style={{ width: 16, height: 16, color: "var(--navy)", flex: "none" }} />
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {f.name}
                  </span>
                  <span className="t-sub" style={{ flex: "none" }}>
                    {f.size >= 1048576
                      ? `${(f.size / 1048576).toFixed(1)} MB`
                      : `${Math.max(1, Math.round(f.size / 1024))} KB`}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setPending((prev) => prev.filter((_, n) => n !== i))}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-2)",
                      display: "inline-flex",
                      padding: 0,
                      flex: "none",
                    }}
                  >
                    <X style={{ width: 15, height: 15 }} />
                  </button>
                </div>
              ))}
              <div className="t-sub">
                Uploads when the job is saved.
              </div>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
