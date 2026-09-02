import type { FleetRepo, FleetUnit, UnitDefect, UnitInput } from "@/data/contracts/fleet";
import { api, maybe } from "./api";
import { dayLabel, relative } from "./format";

interface ApiUnit {
  id: string;
  kind: "truck" | "chassis";
  label: string;
  plate: string;
  status: "in_service" | "in_use" | "out_of_service";
  outOfService: boolean;
  onJobId: string | null;
  defectId: string | null;
  lastInspectionAt: string | null;
  nextDueAt: string | null;
}

interface ApiDefect {
  item: string;
  note: string;
  reportedBy: string;
  reportedAt: string;
  jobId: string;
}

const toUnit = (u: ApiUnit, defect?: UnitDefect): FleetUnit => ({
  id: u.id,
  type: u.kind,
  label: u.label,
  plate: u.plate,
  status: u.status,
  onJobId: u.onJobId,
  // The tables render these raw, so they arrive display-ready — same rule as
  // customers and drivers.
  lastInspectionAt: dayLabel(u.lastInspectionAt),
  nextDueAt: dayLabel(u.nextDueAt),
  ...(defect ? { defect } : {}),
  // W18's inspection history is not a table the API keeps yet — the defect
  // record is. Empty rather than invented: the screen renders the banner from
  // `defect`, which is the part that is the legal record.
  inspectionHistory: [],
});

/**
 * The defect is a second request (`/fleet/:id/defect`), so only the detail
 * screen pays for it. The list renders `outOfService` from status alone.
 */
async function defectFor(id: string): Promise<UnitDefect | undefined> {
  const { defect } = await api<{ defect: ApiDefect | null }>(`/fleet/${id}/defect`);
  if (!defect) return undefined;
  return {
    item: defect.item,
    note: defect.note,
    reportedBy: defect.reportedBy,
    at: relative(defect.reportedAt),
    blockedJobId: defect.jobId,
  };
}

export const fleetRepo: FleetRepo = {
  async list(): Promise<FleetUnit[]> {
    const { units } = await api<{ units: ApiUnit[] }>("/fleet");
    return units.map((u) => toUnit(u));
  },

  async add(input: UnitInput): Promise<FleetUnit> {
    const { unit } = await api<{ unit: ApiUnit }>("/fleet", {
      method: "POST",
      // `type` in the UI, `kind` on the wire — mapped here like every other
      // name the two sides chose independently.
      body: { id: input.id, kind: input.type, plate: input.plate },
    });
    return toUnit(unit);
  },

  async get(id: string): Promise<FleetUnit | null> {
    const r = await maybe(api<{ unit: ApiUnit }>(`/fleet/${id}`));
    if (!r) return null;
    return toUnit(r.unit, r.unit.defectId ? await defectFor(id) : undefined);
  },

  async returnToService(id: string): Promise<FleetUnit> {
    const { unit } = await api<{ unit: ApiUnit }>(`/fleet/${id}/return-to-service`, {
      method: "POST",
    });
    return toUnit(unit);
  },
};
