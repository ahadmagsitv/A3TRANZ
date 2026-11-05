export type UnitKind = 'truck' | 'chassis';

export interface Unit {
  id: string;
  kind: UnitKind;
  outOfService: boolean;
  defectId: string | null;
}

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
