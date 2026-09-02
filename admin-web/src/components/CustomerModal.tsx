"use client";
// W16 — Add customer modal (task W-03c). Also reachable inline from other
// screens later (W4's "+ Add a new customer") once that screen exists.
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
}: {
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [notify, setNotify] = useState(true);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const created = await customersRepo.add({
        name: String(data.get("name") ?? ""),
        contactName: String(data.get("contactName") ?? ""),
        email: String(data.get("email") ?? ""),
        phone: String(data.get("phone") ?? ""),
      });
      const final = notify ? created : await customersRepo.update(created.id, { notifyOnComplete: false });
      onCreated(final);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add customer"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="amber" disabled={saving}>
            <Plus />
            {saving ? "Adding…" : "Add customer"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit}>
        <div className="field">
          <label>Company name</label>
          <input className="input" name="name" placeholder="e.g. Gulf Coast Logistics LLC" required />
        </div>
        <div className="two">
          <div className="field">
            <label>Primary contact</label>
            <input className="input" name="contactName" placeholder="Full name" required />
          </div>
          <div className="field">
            <label>Job title</label>
            <input className="input" placeholder="e.g. Operations Manager" />
          </div>
        </div>
        <div className="two">
          <div className="field">
            <label>Email</label>
            <input className="input" name="email" type="email" placeholder="ops@company.com" required />
          </div>
          <div className="field">
            <label>Phone</label>
            <input className="input" name="phone" placeholder="(713) 555-0000" required />
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
