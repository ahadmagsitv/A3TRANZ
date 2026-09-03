"use client";
// W16 — Add/Edit customer modal (task W-03c). Also reachable inline from the
// job form's "+ Add a new customer".
//
// One modal for both: the edit path on the customer detail page had a Pencil
// button with no onClick at all, and PATCH /customers/:id already existed —
// only the wiring was missing.
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Toggle } from "@/components/Toggle";
import { customersRepo } from "@/data/repos/customers";
import type { Customer } from "@/data/contracts/customers";

const FORM_ID = "add-customer-form";

export function CustomerModal({
  onClose,
  onCreated,
  customer,
}: {
  onClose: () => void;
  onCreated: (customer: Customer) => void;
  /** Present = edit that customer; absent = create a new one. */
  customer?: Customer;
}) {
  const editing = customer !== undefined;
  const [saving, setSaving] = useState(false);
  const [notify, setNotify] = useState(customer?.notifyOnComplete ?? true);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fields = {
      name: String(data.get("name") ?? ""),
      contactName: String(data.get("contactName") ?? ""),
      email: String(data.get("email") ?? ""),
      phone: String(data.get("phone") ?? ""),
    };
    setSaving(true);
    try {
      const saved = editing
        ? await customersRepo.update(customer.id, { ...fields, notifyOnComplete: notify })
        : await customersRepo.add(fields);
      // Create cannot carry the toggle (add() takes no such field), so a
      // customer created with it off needs the follow-up patch.
      const final =
        editing || notify ? saved : await customersRepo.update(saved.id, { notifyOnComplete: false });
      onCreated(final);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit customer" : "Add customer"}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="amber" disabled={saving}>
            {editing ? null : <Plus />}
            {saving ? "Saving…" : editing ? "Save changes" : "Add customer"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit}>
        <div className="field">
          <label>Company name</label>
          <input className="input" name="name" defaultValue={customer?.name ?? ""} placeholder="e.g. Gulf Coast Logistics LLC" required />
        </div>
        <div className="two">
          <div className="field">
            <label>Primary contact</label>
            <input className="input" name="contactName" defaultValue={customer?.contactName ?? ""} placeholder="Full name" required />
          </div>
          <div className="field">
            <label>Job title</label>
            <input className="input" placeholder="e.g. Operations Manager" />
          </div>
        </div>
        <div className="two">
          <div className="field">
            <label>Email</label>
            <input className="input" name="email" type="email" defaultValue={customer?.email ?? ""} placeholder="ops@company.com" required />
          </div>
          <div className="field">
            <label>Phone</label>
            <input className="input" name="phone" defaultValue={customer?.phone ?? ""} placeholder="(713) 555-0000" required />
          </div>
        </div>
        <div className="field">
          <label>Address</label>
          <input className="input" placeholder="Street, city, state, ZIP" />
        </div>
        <div className="field">
          <label>Delivery notes</label>
          <textarea className="textarea" placeholder="Gate, dock, receiving hours, site contact…" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Notifications</label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              padding: "13px 15px",
              background: "var(--surface-2)",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--r)",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ font: "600 14px var(--f)", color: "var(--text)" }}>
                Email this customer when the driver submits
              </div>
              <div style={{ font: "500 12px var(--f)", color: "var(--text-2)", marginTop: 2 }}>
                Sends the closeout summary, photos and ticket numbers on driver completion
              </div>
            </div>
            <Toggle on={notify} onChange={setNotify} />
          </div>
        </div>
      </form>
    </Modal>
  );
}
