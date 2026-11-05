import type { JobStep } from "@/data/contracts/jobs";

export const STEP_SLOTS: Record<Exclude<JobStep, "pretrip">, { count: number; labels: string[] }> = {
  pickup: { count: 2, labels: ["Chassis + container no.", "Seal in hand"] },
  load: { count: 3, labels: ["Load, doors open", "Bill of lading", "Seal + chassis no."] },
  delivery: { count: 2, labels: ["J1 ticket", "Chassis return ticket"] },
};

export const STEP_TITLES: Record<Exclude<JobStep, "pretrip">, string> = {
  pickup: "Confirm pickup",
  load: "Confirm load",
  delivery: "Confirm delivery",
};

export const STEP_ORDER: Exclude<JobStep, "pretrip">[] = ["pickup", "load", "delivery"];

export const TOTAL_EVIDENCE_PHOTOS = STEP_ORDER.reduce((sum, s) => sum + STEP_SLOTS[s].count, 0);
