"use client";
// W13 — Add member modal. The office-staff twin of DriverModal: same shape,
// same admin-creates-the-account rule, plus the role picker, which is the
// whole point — the role chosen here is what every RoleGate and every
// `requires()` on the server reads afterwards.
import { useState, type FormEvent } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { authRepo } from "@/data/repos/auth";
import { OFFICE_ROLES, ROLE_LABEL } from "@/lib/rbac";
import type { AuthUser, NewMember } from "@/data/contracts/auth";

const FORM_ID = "add-member-form";

export function MemberModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (member: AuthUser) => void;
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
      const created = await authRepo.add({
        name: [first, last].filter(Boolean).join(" "),
        email: String(data.get("email") ?? ""),
        role: String(data.get("role") ?? "dispatcher") as NewMember["role"],
        tempPassword: String(data.get("tempPassword") ?? ""),
      });
      onCreated(created);
      onClose();
    } catch (e) {
      // The server owns the rules this form can fail on — a duplicate email, a
      // role it will not accept. Show what it said rather than guessing.
      setError(e instanceof Error ? e.message : "Could not add that member.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add member"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="amber" disabled={saving}>
            <UserPlus />
            {saving ? "Adding…" : "Add member"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit}>
        <div className="two">
          <div className="field">
            <label>First name</label>
            <input className="input" name="firstName" placeholder="Maria" required />
          </div>
          <div className="field">
            <label>Last name</label>
            <input className="input" name="lastName" placeholder="Kovacs" required />
          </div>
        </div>
        <div className="field">
          <label>Work email</label>
          <input className="input" name="email" type="email" placeholder="name@a3tranz.com" required />
        </div>
        <div className="field">
          <label>Role</label>
          <select className="select" name="role" defaultValue="dispatcher" required>
            {OFFICE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
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
        {error && (
          <div className="toast toast-err" style={{ width: "100%", marginBottom: 12 }}>
            {error}
          </div>
        )}
        <div className="toast-inline" style={{ width: "100%", justifyContent: "flex-start" }}>
          <KeyRound />
          Give this password to them yourself — invite emails are not sending
          yet. They can change it once signed in.
        </div>
      </form>
    </Modal>
  );
}
