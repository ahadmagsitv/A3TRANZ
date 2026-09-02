export type UnitType = "truck" | "chassis";
export type UnitStatus = "in_service" | "in_use" | "out_of_service";

export interface UnitDefect {
  /** The checklist item that failed, as the driver marked it. */
  item: string;
  note: string;
  reportedBy: string;
  at: string;
  blockedJobId: string;
}

export interface InspectionEvent {
  id: string;
  tone: "done" | "overdue";
  title: string;
  meta: string;
}

export interface FleetUnit {
  id: string; // "TRK-118" | "CH-4402"
  type: UnitType;
  label: string;
  plate: string;
  status: UnitStatus;
  onJobId: string | null;
  lastInspectionAt: string;
  nextDueAt: string;
  defect?: UnitDefect;
  inspectionHistory: InspectionEvent[];
}

export interface UnitInput {
  /** Typed by the office — it is the number painted on the unit. */
  id: string;
  type: UnitType;
  plate: string;
}

export interface FleetRepo {
  list(): Promise<FleetUnit[]>;
  add(input: UnitInput): Promise<FleetUnit>;
  get(id: string): Promise<FleetUnit | null>;
  returnToService(id: string): Promise<FleetUnit>;
}
