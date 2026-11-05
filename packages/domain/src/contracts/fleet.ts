export type UnitKind = 'truck' | 'chassis';

export type UnitStatus = 'in_service' | 'in_use' | 'out_of_service';

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
  id: string;
  kind: UnitKind;
  label: string;
  plate: string | null;
  status: UnitStatus;
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
  returnToService(id: string): Promise<Unit>;
}

