"use client";

import { Check, Circle, LoaderCircle } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { canCompleteStage, STAGES, type ContractRecord, type StageKey } from "@/types/contract";

export function StageChecklist({
  contract,
  busyStage,
  onToggle,
}: {
  contract: ContractRecord;
  busyStage?: StageKey | null;
  onToggle: (stage: StageKey, checked: boolean) => void;
}) {
  const { t, locale, stageLabel } = useLanguage();

  function formatStageDate(key: StageKey) {
    const value = contract.stageDates[key];
    if (!value) return t("pending");
    return value.toDate().toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="stage-checklist">
      {STAGES.map((stage, index) => {
        const checked = contract.stages[stage.key];
        const canCheck = checked || canCompleteStage(contract.stages, stage.key);
        const busy = busyStage === stage.key;
        const label = stageLabel(stage.key);

        return (
          <div
            key={stage.key}
            className={checked ? "stage-row completed" : canCheck ? "stage-row" : "stage-row locked"}
          >
            <div className="stage-index">{index + 1}</div>
            <button
              type="button"
              data-testid={"stage-" + stage.key}
              data-completed={checked ? "true" : "false"}
              className={checked ? "stage-check checked" : "stage-check"}
              disabled={!canCheck || Boolean(busyStage)}
              onClick={() => onToggle(stage.key, !checked)}
              aria-label={(checked ? t("reopen") : t("finish")) + " " + label}
            >
              {busy ? <LoaderCircle className="spin" size={17} /> : checked ? <Check size={17} /> : <Circle size={17} />}
            </button>
            <div className="stage-copy">
              <strong>{label}</strong>
              <span>{formatStageDate(stage.key)}</span>
            </div>
            <div className={checked ? "stage-state done" : "stage-state"}>
              {checked ? t("done") : canCheck ? t("next") : t("locked")}
            </div>
          </div>
        );
      })}
    </div>
  );
}
