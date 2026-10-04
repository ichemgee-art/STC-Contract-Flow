import { getContractStatus, type ContractStages } from "@/types/contract";

const classByStatus = {
  "Waiting for STC Stamp": "status-neutral",
  "Waiting for Client Stamp": "status-blue",
  "Waiting for Down Payment": "status-gold",
  "Waiting for Supply": "status-orange",
  "Waiting for Settlement": "status-purple",
  Completed: "status-green",
} as const;

export function StatusBadge({ stages }: { stages: ContractStages }) {
  const status = getContractStatus(stages);
  return <span className={"status-badge " + classByStatus[status]}>{status}</span>;
}
