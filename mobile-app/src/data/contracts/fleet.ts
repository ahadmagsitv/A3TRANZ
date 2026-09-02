export type UnitKind = 'truck' | 'chassis';

export interface Unit {
  /** ISO-formatted: `TRK-118`, `CH-4402`. */
  id: string;
  kind: UnitKind;
  outOfService: boolean;
  defectId: string | null;
}

/**
 * The legal record of why a unit went out of service. Quoted and attributed
 * wherever it is shown, and never editable after the fact (§5 W18).
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

export interface FleetRepo {
  list(): Promise<Unit[]>;
  get(id: string): Promise<Unit | null>;
  defect(unitId: string): Promise<Defect | null>;
}
