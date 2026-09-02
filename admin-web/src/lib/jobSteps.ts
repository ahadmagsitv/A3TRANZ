// Evidence step/slot labels — shared by the job detail page (W5 "Driver
// capture — by step") and the approve modal (W22 "Stage photos"), so the 2+3+4
// labelling (plan §7 gate 8, "nine required photos") lives in exactly one
// place.
import type { JobStep } from "@/data/contracts/jobs";

export const STEP_SLOTS: Record<Exclude<JobStep, "pretrip">, { count: number; labels: string[] }> = {
  pickup: { count: 2, labels: ["Chassis + container no.", "Seal in hand"] },
  load: { count: 3, labels: ["Seal + chassis no.", "Bill of lading", "Load, doors open"] },
  delivery: { count: 4, labels: ["Container + chassis", "Seal in hand", "J1 ticket", "Chassis return ticket"] },
};

export const STEP_TITLES: Record<Exclude<JobStep, "pretrip">, string> = {
  pickup: "Confirm pickup",
  load: "Confirm load",
  delivery: "Confirm delivery",
};

export const STEP_ORDER: Exclude<JobStep, "pretrip">[] = ["pickup", "load", "delivery"];

export const TOTAL_EVIDENCE_PHOTOS = STEP_ORDER.reduce((sum, s) => sum + STEP_SLOTS[s].count, 0); // 9
