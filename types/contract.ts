import type { Timestamp } from "firebase/firestore";

export const STAGE_KEYS = [
  "stampedByUs",
  "stampedByClient",
  "downPayment",
  "supply",
  "settlement",
] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

export const STAGES: Array<{
  key: StageKey;
  label: string;
  shortLabel: string;
}> = [
  { key: "stampedByUs", label: "Stamped by STC", shortLabel: "STC Stamp" },
  { key: "stampedByClient", label: "Stamped by Client", shortLabel: "Client Stamp" },
  { key: "downPayment", label: "Down Payment", shortLabel: "Payment" },
  { key: "supply", label: "Supply", shortLabel: "Supply" },
  { key: "settlement", label: "Stocking Payment", shortLabel: "Stocking Payment" },
];

export type ContractStages = Record<StageKey, boolean>;
export type ContractStageDates = Record<StageKey, Timestamp | null>;

export interface ContractRecord {
  id: string;
  salesRepresentative: string;
  companyName: string;
  contractType: string;
  product: string;
  stages: ContractStages;
  stageDates: ContractStageDates;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  createdBy: string;
  createdByName: string;
}

export interface ContractInput {
  salesRepresentative: string;
  companyName: string;
  contractType: string;
  product: string;
}

export type ContractStatus =
  | "Waiting for STC Stamp"
  | "Waiting for Client Stamp"
  | "Waiting for Down Payment"
  | "Waiting for Supply"
  | "Waiting for Stocking Payment"
  | "Completed";

export function getContractStatus(stages: ContractStages): ContractStatus {
  if (!stages.stampedByUs) return "Waiting for STC Stamp";
  if (!stages.stampedByClient) return "Waiting for Client Stamp";
  if (!stages.downPayment) return "Waiting for Down Payment";
  if (!stages.supply) return "Waiting for Supply";
  if (!stages.settlement) return "Waiting for Stocking Payment";
  return "Completed";
}

export function getProgress(stages: ContractStages) {
  const completed = STAGE_KEYS.filter((key) => stages[key]).length;
  return Math.round((completed / STAGE_KEYS.length) * 100);
}

export function canCompleteStage(stages: ContractStages, stage: StageKey) {
  const index = STAGE_KEYS.indexOf(stage);
  if (index <= 0) return true;
  return STAGE_KEYS.slice(0, index).every((key) => stages[key]);
}
