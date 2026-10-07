"use client";

import { MessageSquarePlus, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import {
  addContractNote,
  deleteContractNote,
  subscribeContractNotes,
} from "@/lib/contractNotes";
import type { ContractNote } from "@/types/contract";

export function ContractNotes({ contractId }: { contractId: string }) {
  const { user, profile } = useAuth();
  const { language, locale } = useLanguage();
  const [notes, setNotes] = useState<ContractNote[]>([]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");

    return subscribeContractNotes(
      contractId,
      (next) => {
        setNotes(next);
        setLoading(false);
      },
      () => {
        setError(language === "ar" ? "تعذر تحميل الملاحظات." : "Could not load notes.");
        setLoading(false);
      },
    );
  }, [contractId, language]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !profile?.active || !value.trim()) return;

    setBusy(true);
    setError("");
    try {
      await addContractNote(contractId, value, {
        uid: user.uid,
        displayName: profile.displayName,
      });
      setValue("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : language === "ar"
            ? "تعذر إضافة الملاحظة."
            : "Could not add note.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(note: ContractNote) {
    if (!user || (profile?.role !== "admin" && note.createdBy !== user.uid)) return;

    const confirmed = window.confirm(
      language === "ar" ? "حذف هذه الملاحظة؟" : "Delete this note?",
    );
    if (!confirmed) return;

    setDeleting(note.id);
    setError("");
    try {
      await deleteContractNote(contractId, note.id);
    } catch {
      setError(language === "ar" ? "تعذر حذف الملاحظة." : "Could not delete note.");
    } finally {
      setDeleting("");
    }
  }

  function noteDate(note: ContractNote) {
    return note.createdAt
      ? note.createdAt.toDate().toLocaleString(locale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : language === "ar"
        ? "الآن"
        : "Just now";
  }

  return (
    <section className="contract-notes card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{language === "ar" ? "المتابعة" : "Follow-up"}</p>
          <h3>{language === "ar" ? "ملاحظات العقد" : "Contract Notes"}</h3>
        </div>
        <MessageSquarePlus size={19} />
      </div>

      <form className="contract-note-form" onSubmit={submit}>
        <textarea
          data-testid="contract-note-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={2000}
          rows={3}
          placeholder={
            language === "ar"
              ? "اكتب ملاحظة متابعة على العقد..."
              : "Add a follow-up note..."
          }
        />
        <div className="contract-note-form-footer">
          <span>{value.length}/2000</span>
          <button
            data-testid="contract-note-submit"
            className="button button-primary"
            type="submit"
            disabled={busy || !value.trim()}
          >
            <Send size={15} />
            {busy
              ? language === "ar" ? "جاري الإضافة..." : "Adding..."
              : language === "ar" ? "إضافة ملاحظة" : "Add Note"}
          </button>
        </div>
      </form>

      {error ? <div className="notice notice-error">{error}</div> : null}

      <div className="contract-note-list" data-testid="contract-note-list">
        {loading ? (
          <div className="contract-note-empty">
            {language === "ar" ? "جاري تحميل الملاحظات..." : "Loading notes..."}
          </div>
        ) : notes.length === 0 ? (
          <div className="contract-note-empty">
            {language === "ar"
              ? "لا توجد ملاحظات على هذا العقد حتى الآن."
              : "No notes have been added yet."}
          </div>
        ) : (
          notes.map((note) => {
            const canDelete = profile?.role === "admin" || note.createdBy === user?.uid;
            return (
              <article className="contract-note-item" key={note.id}>
                <div className="contract-note-meta">
                  <div>
                    <strong>{note.createdByName || "STC User"}</strong>
                    <span>{noteDate(note)}</span>
                  </div>
                  {canDelete ? (
                    <button
                      className="icon-button contract-note-delete"
                      type="button"
                      onClick={() => void remove(note)}
                      disabled={deleting === note.id}
                      aria-label={language === "ar" ? "حذف الملاحظة" : "Delete note"}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
                <p>{note.text}</p>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
