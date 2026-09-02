export type UnitKind = 'truck' | 'chassis';

/** admin's 3-state carries what a boolean cannot: a unit busy on a job. */
export type UnitStatus = 'in_service' | 'in_use' | 'out_of_service';

/**
 * The legal record of why a unit went out of service. Quoted and attributed
 * wherever it is shown, and never editable after the fact (§5 W18).
 * INSERT-only at the DB level — no UPDATE grant, no DELETE grant.
 */
export interface Defect {
  id: string;
  unitId: string;
  jobId: string;
  item: string;
  note: string;
  reportedBy: string;
  reportedAt: string;
  photoUri: string | null;
}

export interface InspectionEvent {
  id: string;
  tone: 'done' | 'overdue';
  title: string;
  meta: string;
}

export interface Unit {
  /** ISO-formatted: `TRK-118`, `CH-4402`. */
  id: string;
  kind: UnitKind;
  label: string;
  plate: string | null;
  status: UnitStatus;
  /** DERIVED from status — mobile reads this, admin reads `status` (§R-F1). */
  outOfService: boolean;
  onJobId: string | null;
  defectId: string | null;
  lastInspectionAt: string | null;
  nextDueAt: string | null;
  inspectionHistory: InspectionEvent[];
}

export interface FleetRepo {
  list(): Promise<Unit[]>;
  get(id: string): Promise<Unit | null>;
  defect(unitId: string): Promise<Defect | null>;
  /** W18. Clears the OOS status; the defect row itself is never deleted. */
  returnToService(id: string): Promise<Unit>;
}

/* §R-F1 · mobile `outOfService: boolean`, admin `status` 3-state. Both kept:
 *         status is stored, outOfService is derived (`status ===
 *         'out_of_service'`). Collapsing to the boolean would have lost
 *         'in_use', which is how W17 greys a unit already on a job.
 * §R-F2 · admin `type` → `kind`. admin's inline `UnitDefect` subset dropped in
 *         favour of mobile's full `Defect` — W18 quotes and attributes it, so
 *         it needs reportedBy/reportedAt/photoUri that the subset lacked. */
