"use client";
// W17 — Add unit modal. Trucks and chassis had no create path at all: they
// only ever came from the seed, so an empty database could not produce a job
// (W4 needs a vehicle and a chassis).
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { fleetRepo } from "@/data/repos/fleet";
import type { FleetUnit, UnitType } from "@/data/contracts/fleet";

const FORM_ID = "add-unit-form";

export function UnitModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (unit: FleetUnit) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      onCreated(
        await fleetRepo.add({
          id: String(data.get("id") ?? "").trim(),
          type: String(data.get("type") ?? "truck") as UnitType,
          plate: String(data.get("plate") ?? ""),
        }),
      );
      onClose();
    } catch (err) {
      // The server owns uniqueness — a unit number already on the fleet is the
      // failure this form actually hits.
      setError(err instanceof Error ? err.message : "Could not add that unit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add unit"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="amber" disabled={saving}>
            <Plus />
            {saving ? "Adding…" : "Add unit"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit}>
        <div className="two">
          <div className="field">
            <label>Unit number</label>
            {/* The number painted on the vehicle — a driver reads it off the
                bumper and has to find the same string here. */}
            <input
              className="input"
              name="id"
              placeholder="TRK-118"
              required
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>Type</label>
            <select className="select" name="type" defaultValue="truck">
              <option value="truck">Truck</option>
              <option value="chassis">Chassis</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Plate</label>
          <input className="input" name="plate" placeholder="TX 00118" />
        </div>
        {error && (
          <div className="toast toast-err" style={{ width: "100%", marginTop: 12 }}>
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
