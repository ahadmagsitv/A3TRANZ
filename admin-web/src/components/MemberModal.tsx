"use client";
// W13 — Add / edit member. The office-staff twin of DriverModal: same shape,
// same admin-creates-the-account rule, plus the role picker, which is the
// whole point — the role chosen here is what every RoleGate and every
// `requires()` on the server reads afterwards.
//
// One modal for both: editing is the same four fields with values in them,
// and a second component would be this one with different defaults. The
// password is the only field that differs — an existing member already has
// one, and replacing it is what the reset link is for.
import { useState, type FormEvent } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { authRepo } from "@/data/repos/auth";
import { OFFICE_ROLES, ROLE_LABEL } from "@/lib/rbac";
import type { NewMember, TeamMember } from "@/data/contracts/auth";

const FORM_ID = "add-member-form";

export function MemberModal({
  member,
  onClose,
  onSaved,
}: {
  /** Present = edit that member. Absent = add a new one. */
  member?: TeamMember;
  onClose: () => void;
  onSaved: (member: TeamMember) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Split on the LAST space: "Mary Anne Kovacs" is a first name of "Mary
  // Anne", not a last name of "Anne Kovacs". The two boxes are a display
  // convention — the server stores and returns one `name`.
  const cut = member ? member.name.lastIndexOf(" ") : -1;
  const firstName = member ? (cut < 0 ? member.name : member.name.slice(0, cut)) : "";
  const lastName = member && cut >= 0 ? member.name.slice(cut + 1) : "";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const first = String(data.get("firstName") ?? "").trim();
    const last = String(data.get("lastName") ?? "").trim();
    const common = {
      name: [first, last].filter(Boolean).join(" "),
      email: String(data.get("email") ?? ""),
      role: String(data.get("role") ?? "dispatcher") as NewMember["role"],
    };
    setSaving(true);
    setError(null);
    try {
      const saved = member
        ? await authRepo.update(member.id, common)
        : await authRepo.add({ ...common, tempPassword: String(data.get("tempPassword") ?? "") });
      onSaved(saved);
      onClose();
    } catch (e) {
      // The server owns the rules this form can fail on — a duplicate email, a
      // role it will not accept, editing your own account. Show what it said
      // rather than guessing.
      setError(e instanceof Error ? e.message : "Could not save that member.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={member ? `Edit ${member.name}` : "Add member"}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="amber" disabled={saving}>
            <UserPlus />
            {saving ? "Saving…" : member ? "Save changes" : "Add member"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit}>
        <div className="two">
          <div className="field">
            <label>First name</label>
            <input className="input" name="firstName" placeholder="Maria" defaultValue={firstName} required />
          </div>
          <div className="field">
            <label>Last name</label>
            <input className="input" name="lastName" placeholder="Kovacs" defaultValue={lastName} required />
          </div>
        </div>
        <div className="field">
          <label>Work email</label>
          <input
            className="input"
            name="email"
            type="email"
            placeholder="name@a3tranz.com"
            defaultValue={member?.email ?? ""}
            required
          />
        </div>
        <div className="field">
          <label>Role</label>
          <select className="select" name="role" defaultValue={member?.role ?? "dispatcher"} required>
            {OFFICE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        {!member && (
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
        )}
        {error && (
          <div className="toast toast-err" style={{ width: "100%", marginBottom: 12 }}>
            {error}
          </div>
        )}
        {member ? (
          <div className="toast-inline" style={{ width: "100%", justifyContent: "flex-start" }}>
            <KeyRound />
            Changing the role signs them out — they pick up the new permissions
            the next time they sign in.
          </div>
        ) : (
          <div className="toast-inline" style={{ width: "100%", justifyContent: "flex-start" }}>
            <KeyRound />
            Give this password to them yourself — invite emails are not sending
            yet. They can change it once signed in.
          </div>
        )}
      </form>
    </Modal>
  );
}
