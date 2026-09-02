"use client";
// W9 — Add driver modal (task W-04c). Drivers are added by an admin, never
// self-registered (plan §5 W-04c).
import { useState, type FormEvent } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { driversRepo } from "@/data/repos/drivers";
import type { Driver } from "@/data/contracts/drivers";

const FORM_ID = "add-driver-form";

export function DriverModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (driver: Driver) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const first = String(data.get("firstName") ?? "").trim();
    const last = String(data.get("lastName") ?? "").trim();
    setSaving(true);
    setError(null);
    try {
      const created = await driversRepo.add({
        name: [first, last].filter(Boolean).join(" "),
        email: String(data.get("email") ?? ""),
        phone: String(data.get("phone") ?? ""),
        base: String(data.get("base") ?? ""),
        tempPassword: String(data.get("tempPassword") ?? ""),
      });
      onCreated(created);
      onClose();
    } catch (e) {
      // The server owns the rules this form can fail on — a duplicate email,
      // a password it will not accept. Show what it said rather than guessing.
      setError(e instanceof Error ? e.message : "Could not add that driver.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add driver"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="amber" disabled={saving}>
            <UserPlus />
            {saving ? "Adding…" : "Add driver"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit}>
        <div className="two">
          <div className="field">
            <label>First name</label>
            <input className="input" name="firstName" placeholder="John" required />
          </div>
          <div className="field">
            <label>Last name</label>
            <input className="input" name="lastName" placeholder="Reyes" required />
          </div>
        </div>
        <div className="field">
          <label>Work email</label>
          <input className="input" name="email" type="email" placeholder="name@a3transport.com" required />
        </div>
        <div className="field">
          <label>Phone</label>
          <input className="input" name="phone" placeholder="(713) 555-0000" required />
        </div>
        <div className="field">
          <label>Temporary password</label>
          <input
            className="input"
            name="tempPassword"
            type="text"
            minLength={8}
            placeholder="At least 8 characters"
            required
            autoComplete="off"
          />
        </div>
        <div className="two">
          <div className="field">
            <label>Region</label>
            <input className="input" name="base" placeholder="Houston" required />
          </div>
          <div className="field">
            <label>Status</label>
            <select className="select" defaultValue="active">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        {error && (
          <div className="toast toast-err" style={{ width: "100%", marginBottom: 12 }}>
            {error}
          </div>
        )}
        <div className="toast-inline" style={{ width: "100%", justifyContent: "flex-start" }}>
          <KeyRound />
          Give this password to the driver yourself — invite emails are not
          sending yet. They can change it from Profile once signed in.
        </div>
      </form>
    </Modal>
  );
}
