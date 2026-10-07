"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ContractForm } from "@/components/ContractForm";
import { SuccessCelebration } from "@/components/SuccessCelebration";
import { useContracts } from "@/components/ContractsProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { createContract } from "@/lib/contracts";
import { playUiSound, primeUiAudio } from "@/lib/sounds";
import type { ContractInput } from "@/types/contract";

export default function NewContractPage() {
  const { user, profile } = useAuth();
  const { refreshCount } = useContracts();
  const { t, language } = useLanguage();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdContractId, setCreatedContractId] = useState("");

  async function submit(input: ContractInput) {
    if (!user || !profile?.active) return;
    primeUiAudio();
    setBusy(true);
    setError("");

    try {
      const reference = await createContract(input, {
        uid: user.uid,
        displayName: profile.displayName,
      });
      void refreshCount();
      playUiSound("created");
      setCreatedContractId(reference.id);
    } catch {
      setError(t("createContractError"));
      setBusy(false);
    }
  }

  return (
    <>
      <SuccessCelebration
        open={Boolean(createdContractId)}
        title={language === "ar" ? "تم إضافة العقد" : "Contract Added"}
        subtitle={
          language === "ar"
            ? "تم حفظ العقد بنجاح"
            : "The contract was saved successfully"
        }
        onComplete={() => {
          if (createdContractId) router.push("/contracts/" + createdContractId);
        }}
      />
      <div className="page-stack form-page">
      <section className="page-intro">
        <div>
          <p className="eyebrow">{t("newRecord")}</p>
          <h2>{t("addContractHeadline")}</h2>
          <p>{t("newContractDescription")}</p>
        </div>
      </section>
      <ContractForm onSubmit={submit} busy={busy} error={error} />
      </div>
    </>
  );
}
