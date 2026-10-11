"use client";

import { useEffect, useState } from "react";
import {
  collection, limit, onSnapshot, orderBy, query,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CONTRACT_AUDIT_ENABLED, type ContractAuditAction } from "@/lib/contractAudit";
import { useLanguage } from "@/components/LanguageProvider";

interface EventRecord {
  id: string;
  action: ContractAuditAction;
  actorUid: string;
  actorName: string;
  at: Timestamp | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

const actionTitles: Record<ContractAuditAction, { ar: string; en: string }> = {
  created: { ar: "إنشاء العقد", en: "Contract created" },
  details_updated: { ar: "تعديل بيانات العقد", en: "Contract details changed" },
  stage_updated: { ar: "تحديث مرحلة العقد", en: "Workflow stage changed" },
  number_assigned: { ar: "ترقيم عقد قديم", en: "Legacy number assigned" },
};

export function ContractAuditTimeline({ contractId }: { contractId: string }) {
  const { language, locale } = useLanguage();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!CONTRACT_AUDIT_ENABLED) return;
    setError("");
    return onSnapshot(
      query(
        collection(db, "contractAudit", contractId, "entries"),
        orderBy("at", "desc"), limit(100),
      ),
      (snapshot) => setEvents(snapshot.docs.map((entry) => ({
        id: entry.id, ...(entry.data() as Omit<EventRecord, "id">),
      }))),
      () => setError(language === "ar"
        ? "تعذر تحميل سجل التدقيق."
        : "Could not load the audit trail."),
    );
  }, [contractId, language]);

  if (!CONTRACT_AUDIT_ENABLED) return null;

  return (
    <section className="card" style={{ padding: "22px" }} data-testid="audit-timeline">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{language === "ar" ? "أمان العقود" : "Contract security"}</p>
          <h3>{language === "ar" ? "سجل التعديلات" : "Audit trail"}</h3>
        </div>
      </div>
      {error ? <p role="alert" className="notice notice-error">{error}</p> : null}
      {!error && events.length === 0 ? (
        <p className="muted">{language === "ar"
          ? "لا توجد عمليات مسجلة في نظام التدقيق الجديد بعد."
          : "No events have been recorded since audit logging was enabled."}</p>
      ) : null}
      <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
        {events.map((event) => {
          const title = actionTitles[event.action]?.[language] ?? event.action;
          const details = Object.keys(event.after ?? {}).filter((field) =>
            JSON.stringify(event.before?.[field]) !== JSON.stringify(event.after[field]),
          );
          return (
            <article key={event.id} style={{
              border: "1px solid var(--border)", borderRadius: "12px",
              padding: "12px 14px",
            }}>
              <strong>{title}</strong>
              <p style={{ margin: "4px 0", overflowWrap: "anywhere" }}>
                {event.actorName} ({event.actorUid})
              </p>
              <small>
                {event.at?.toDate().toLocaleString(locale) ?? "—"}
                {details.length ? " · " + details.join(", ") : ""}
              </small>
            </article>
          );
        })}
      </div>
      {events.length === 100 && <p className="muted">
        {language === "ar"
          ? "يتم عرض آخر 100 عملية فقط؛ باقي السجلات محفوظة في Firestore."
          : "Showing the latest 100 events; earlier records remain in Firestore."}
      </p>}
    </section>
  );
}
