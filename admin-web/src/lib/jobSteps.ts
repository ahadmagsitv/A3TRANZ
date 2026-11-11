import { EVIDENCE_STEPS, slotLabels, stepOrder } from "@a3/domain";
import type { JobStep, JobType } from "@/data/contracts/jobs";

type EvidenceStep = Exclude<JobStep, "pretrip">;

export const stepSlots = (type: JobType, step: EvidenceStep) => {
  const labels = slotLabels(type, step);
  return { count: labels.length, labels };
};

export const STEP_TITLES: Record<EvidenceStep, string> = {
  pickup: "Confirm pickup",
  load: "Confirm load",
  delivery: "Confirm delivery",
};

export const evidenceSteps = (type: JobType): EvidenceStep[] =>
  EVIDENCE_STEPS.filter((s) => stepOrder(type).includes(s));

export const totalEvidencePhotos = (type: JobType) =>
  evidenceSteps(type).reduce((sum, s) => sum + stepSlots(type, s).count, 0);
