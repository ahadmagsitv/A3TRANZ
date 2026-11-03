"use client";
// QA R23 — the account menu's "Profile & password". Who you are, and the one
// account change the API supports for yourself: POST /auth/change-password.
import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { api } from "@/data/repos/api";
import { authRepo } from "@/data/repos/auth";
import type { AuthUser } from "@/data/contracts/auth";
import { ROLE_LABEL } from "@/lib/rbac";

const FORM_ID = "change-password-form";

export function AccountModal({ user, onClose }: { user: AuthUser; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/auth/change-password", { method: "POST", body: { current, next } });
      // The API revokes every session, this one included — sign in again.
      await authRepo.logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your password.");
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Profile & password"
      onClose={onClose}
      style={{ width: 460 }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={saving}>
            <KeyRound />
            {saving ? "Saving…" : "Change password"}
          </Button>
        </>
      }
    >
      <div className="field">
        <label>Name</label>
        <div style={{ font: "600 14px var(--f)", color: "var(--text)" }}>{user.name}</div>
      </div>
      <div className="two">
        <div className="field">
          <label>Email</label>
          <div style={{ font: "500 14px var(--f)", color: "var(--text-2)", overflowWrap: "anywhere" }}>{user.email}</div>
        </div>
        <div className="field">
          <label>Role</label>
          <div style={{ font: "500 14px var(--f)", color: "var(--text-2)" }}>{ROLE_LABEL[user.role] ?? user.role}</div>
        </div>
      </div>
      <form id={FORM_ID} onSubmit={submit} style={{ borderTop: "1px solid var(--hairline)", paddingTop: 16 }}>
        <div className="field">
          <label>Current password</label>
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="field">
          <label>New password</label>
          <input className="input" type="password" autoComplete="new-password" minLength={8} placeholder="At least 8 characters" value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div className="t-sub">You&rsquo;ll be signed out on every device and asked to sign in again.</div>
        {error && (
          <div className="toast toast-err" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
