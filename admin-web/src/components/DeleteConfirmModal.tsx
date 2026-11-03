"use client";
// QA R9 — confirm before a permanent delete. The server decides whether the
// record can go (it refuses anything with history), so its message is shown
// as-is when it says no.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";

export function DeleteConfirmModal({
  name,
  onClose,
  onDelete,
}: {
  name: string;
  onClose: () => void;
  /** Rejects with the server's reason when the record cannot be deleted. */
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
      setBusy(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      style={{ width: 460 }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} disabled={busy || error !== null}>
            <Trash2 />
            {busy ? "Deleting…" : "Delete permanently"}
          </Button>
        </>
      }
    >
      <div style={{ textAlign: "center", padding: "6px 4px 0" }}>
        <h3 style={{ font: "800 19px var(--fd)", color: "var(--text)" }}>Delete {name}?</h3>
        <p style={{ font: "500 14px var(--f)", color: "var(--text-2)", lineHeight: 1.55, marginTop: 8 }}>
          This can&rsquo;t be undone. Only records with no job history can be deleted.
        </p>
        {error && (
          <div className="toast toast-err" style={{ marginTop: 14, textAlign: "left" }}>
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
