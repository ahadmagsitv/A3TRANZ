// Plan §6.6: five role labels collapse to three capability sets.
// A plain object map. No policy engine.
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
  "viewPayroll", // view only — markPayrollPaid is withheld
];

const TIER3: Capability[] = ["createJobs", "updateJobs", "messageDrivers"];

const ROLE_CAPS: Record<Role, Capability[]> = {
  admin: TIER1,
  manager: TIER1,
  assistant_manager: TIER2,
  project_manager: TIER3,
  dispatcher: TIER3,
  driver: [], // mobile-only role, never signs into admin-web
};

export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPS[role].includes(capability);
}

/** Display label per capability, plan §6.6 table order. W13's three
 * permission blocks read this + `can()` directly — nowhere else hand-writes
 * a second copy of "who can do what" (plan W-12). */
export const CAPABILITY_LABEL: Record<Capability, string> = {
  approveJobs: "Approve & close jobs",
  createJobs: "Create & assign job cards",
  updateJobs: "Update job details & status",
  messageDrivers: "Message drivers",
  manageCustomersFleet: "Manage customers & fleet",
  manageDrivers: "Add & deactivate drivers",
  manageTeam: "Manage team & roles",
  viewPayroll: "Payroll — view",
  markPayrollPaid: "Payroll — mark as paid",
  viewReports: "View reports & export",
};

export const ALL_CAPABILITIES = Object.keys(CAPABILITY_LABEL) as Capability[];

/** The three capability sets, one representative role per tier — plan §6.6
 * "five role labels collapse to three distinct capability sets". Manager
 * shares admin's TIER1 caps and Dispatcher shares Project Manager's TIER3
 * caps, so one role per tier is enough to read every row via `can()`. */
export const PERMISSION_TIERS: { label: string; role: Role }[] = [
  { label: "Admin / Manager", role: "admin" },
  { label: "Assistant Manager", role: "assistant_manager" },
  { label: "Project Manager / Dispatcher", role: "project_manager" },
];

/** Display label per role (plan §6.6) — one source, Sidebar + Topbar both read it. */
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  assistant_manager: "Assistant Manager",
  project_manager: "Project Manager",
  dispatcher: "Dispatcher",
  driver: "Driver",
};
