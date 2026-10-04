"use client";

import { Check, Circle, LoaderCircle } from "lucide-react";
import { canCompleteStage, STAGES, type ContractRecord, type StageKey } from "@/types/contract";

function formatStageDate(contract: ContractRecord, key: StageKey) {
  const value = contract.stageDates[key];
  if (!value) return "Pending";
  return value.toDate().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StageChecklist({
  contract,
  busyStage,
  onToggle,
}: {
  contract: ContractRecord;
  busyStage?: StageKey | null;
  onToggle: (stage: StageKey, checked: boolean) => void;
}) {
  return (
    <div className="stage-checklist">
      {STAGES.map((stage, index) => {
        const checked = contract.stages[stage.key];
        const canCheck = checked || canCompleteStage(contract.stages, stage.key);
        const busy = busyStage === stage.key;

        return (
          <div
            key={stage.key}
            className={checked ? "stage-row completed" : canCheck ? "stage-row" : "stage-row locked"}
          >
            <div className="stage-index">{index + 1}</div>
            <button
              type="button"
              className={checked ? "stage-check checked" : "stage-check"}
              disabled={!canCheck || Boolean(busyStage)}
              onClick={() => onToggle(stage.key, !checked)}
              aria-label={(checked ? "Reopen " : "Complete ") + stage.label}
            >
              {busy ? <LoaderCircle className="spin" size={17} /> : checked ? <Check size={17} /> : <Circle size={17} />}
            </button>
            <div className="stage-copy">
              <strong>{stage.label}</strong>
              <span>{formatStageDate(contract, stage.key)}</span>
            </div>
            <div className={checked ? "stage-state done" : "stage-state"}>
              {checked ? "Done" : canCheck ? "Next" : "Locked"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
