"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ContractForm } from "@/components/ContractForm";
import { createContract } from "@/lib/contracts";
import type { ContractInput } from "@/types/contract";

export default function NewContractPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(input: ContractInput) {
    if (!user || !profile?.active) return;
    setBusy(true);
    setError("");

    try {
      const reference = await createContract(input, {
        uid: user.uid,
        displayName: profile.displayName,
      });
      router.push("/contracts/" + reference.id);
    } catch {
      setError("Could not create the contract. Check your connection and permissions.");
      setBusy(false);
    }
  }

  return (
    <div className="page-stack form-page">
      <section className="page-intro">
        <div>
          <p className="eyebrow">New record</p>
          <h2>Add a contract in seconds.</h2>
          <p>The workflow starts at “Stamped by STC” after the basic details are saved.</p>
        </div>
      </section>
      <ContractForm onSubmit={submit} busy={busy} error={error} />
    </div>
  );
}
