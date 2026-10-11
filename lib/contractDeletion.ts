import "server-only";

export function contractTombstonePath(contractId: string) {
  return `contract-tombstones/${encodeURIComponent(contractId)}.json`;
}
