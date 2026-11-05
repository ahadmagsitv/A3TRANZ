import type { Role } from "./contracts/auth.ts";

export type Capability =
  | "approveJobs"
  | "createJobs"
  | "updateJobs"
  | "messageDrivers"
  | "manageCustomersFleet"
  | "manageDrivers"
  | "manageTeam"
  | "viewPayroll"
  | "markPayrollPaid"
  | "viewReports";

const TIER1: Capability[] = [
  "approveJobs",
  "createJobs",
  "updateJobs",
  "messageDrivers",
  "manageCustomersFleet",
  "manageDrivers",
  "manageTeam",
  "viewPayroll",
  "markPayrollPaid",
  "viewReports",
];

const TIER2: Capability[] = [
  "approveJobs",
  "createJobs",
  "updateJobs",
  "messageDrivers",
  "manageCustomersFleet",
  "viewPayroll",
];

const TIER3: Capability[] = ["createJobs", "updateJobs", "messageDrivers"];

const ROLE_CAPS: Record<Role, Capability[]> = {
  admin: TIER1,
  manager: TIER1,
  assistant_manager: TIER2,
  project_manager: TIER3,
  dispatcher: TIER3,
  driver: [],
};

export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPS[role].includes(capability);
}

export const CAPABILITY_LABEL: Record<Capability, string> = {
  approveJobs: "Approve & close jobs",
  createJobs: "Create & assign job cards",
  updateJobs: "Update job details",
  messageDrivers: "Message drivers",
  manageCustomersFleet: "Manage customers & fleet",
  manageDrivers: "Add & deactivate drivers",
  manageTeam: "Manage team & roles",
  viewPayroll: "Payroll — view",
  markPayrollPaid: "Payroll — mark as paid",
  viewReports: "View reports & export",
};

export const ALL_CAPABILITIES = Object.keys(CAPABILITY_LABEL) as Capability[];

export const PERMISSION_TIERS: { label: string; role: Role }[] = [
  { label: "Admin / Manager", role: "admin" },
  { label: "Assistant Manager", role: "assistant_manager" },
  { label: "Project Manager / Dispatcher", role: "project_manager" },
];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  assistant_manager: "Assistant Manager",
  project_manager: "Project Manager",
  dispatcher: "Dispatcher",
  driver: "Driver",
};

export const OFFICE_ROLES = (Object.keys(ROLE_LABEL) as Role[]).filter(
  r => r !== "driver",
);
