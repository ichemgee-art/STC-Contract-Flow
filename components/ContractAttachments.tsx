"use client";

import {
  Download,
  Expand,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import {
  addContractAttachment,
  deleteContractAttachment,
  subscribeContractAttachments,
  type ContractAttachment,
} from "@/lib/contractAttachments";
import { playUiSound, primeUiAudio } from "@/lib/sounds";

const MAX_ATTACHMENTS = 20;

function formatBytes(value: number) {
  if (!value) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function ContractAttachments({ contractId }: { contractId: string }) {
  const { user, profile } = useAuth();
  const { language, locale } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<ContractAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ContractAttachment | null>(null);
  const [dragging, setDragging] = useState(false);

  const ar = language === "ar";

  useEffect(() => {
    return subscribeContractAttachments(
      contractId,
      (next) => {
        setAttachments(next);
        setLoading(false);
      },
      () => {
        setError(ar ? "تعذر تحميل صور العقد." : "Could not load contract images.");
        setLoading(false);
      },
    );
  }, [contractId, ar]);

  async function uploadFiles(files: File[]) {
    if (!user || !profile?.active || busy || files.length === 0) return;

    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!images.length) {
      setError(ar ? "اختر صورًا فقط." : "Please choose image files only.");
      return;
    }

    const availableSlots = MAX_ATTACHMENTS - attachments.length;
    const selected = images.slice(0, Math.max(0, availableSlots));

    if (!selected.length) {
      setError(ar ? "وصلت للحد الأقصى: 20 صورة للعقد." : "Maximum reached: 20 images per contract.");
      return;
    }

    primeUiAudio();
    setBusy(true);
    setError("");

    try {
      for (let index = 0; index < selected.length; index += 1) {
        setProgress(
          ar
            ? `جاري تجهيز ورفع الصورة ${index + 1} من ${selected.length}`
            : `Optimizing and uploading ${index + 1} of ${selected.length}`,
        );

        await addContractAttachment(contractId, selected[index], {
          uid: user.uid,
          displayName: profile.displayName,
        });
      }

      playUiSound("created");

      if (images.length > availableSlots) {
        setError(
          ar
            ? `تم رفع ${selected.length} صورة فقط للوصول للحد الأقصى 20 صورة.`
            : `Uploaded ${selected.length} image(s) to stay within the 20-image limit.`,
        );
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(
        message.includes("permission")
          ? (ar ? "صلاحيات رفع صور العقود غير مفعلة بعد." : "Attachment permissions are not enabled yet.")
          : (ar ? "تعذر رفع الصورة. جرّب صورة أخرى." : "Could not upload the image. Try another one."),
      );
    } finally {
      setBusy(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeAttachment(attachment: ContractAttachment) {
    if (busy) return;

    const confirmed = window.confirm(
      ar
        ? `حذف «${attachment.name}» من العقد؟`
        : `Delete “${attachment.name}” from this contract?`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      await deleteContractAttachment(contractId, attachment.id);
      if (preview?.id === attachment.id) setPreview(null);
      playUiSound("reopen");
    } catch {
      setError(ar ? "تعذر حذف الصورة." : "Could not delete the image.");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  function uploadedAtText(attachment: ContractAttachment) {
    return attachment.uploadedAt
      ? attachment.uploadedAt.toDate().toLocaleString(locale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : ar ? "الآن" : "Just now";
  }

  return (
    <>
      <section className="attachment-card card">
        <div className="attachment-heading">
          <div>
            <p className="eyebrow">{ar ? "مرفقات العقد" : "Contract attachments"}</p>
            <h3>{ar ? "صور العقد" : "Contract images"}</h3>
            <p>
              {ar
                ? "احتفظ بصور العقد داخل نفس السجل. يتم تحسين حجم الصورة تلقائيًا مع الحفاظ على وضوح القراءة."
                : "Keep contract images inside the same record. Images are optimized automatically while preserving readability."}
            </p>
          </div>

          <div className="attachment-counter">
            <ImageIcon size={17} />
            <strong>{attachments.length}</strong>
            <span>/ {MAX_ATTACHMENTS}</span>
          </div>
        </div>

        <input
          ref={inputRef}
          className="attachment-input"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => void uploadFiles(Array.from(event.target.files ?? []))}
        />

        <div
          className={dragging ? "attachment-dropzone dragging" : "attachment-dropzone"}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="attachment-drop-icon">
            {busy ? <LoaderCircle size={24} className="spin" /> : <UploadCloud size={24} />}
          </div>
          <div>
            <strong>
              {busy
                ? progress
                : ar
                  ? "اسحب صور العقد هنا أو اختر من الجهاز"
                  : "Drop contract images here or choose from your device"}
            </strong>
            <span>
              {ar
                ? "JPG / PNG / صور الموبايل · يتم الضغط تلقائيًا"
                : "JPG / PNG / mobile photos · automatically optimized"}
            </span>
          </div>
          <button
            type="button"
            className="button button-secondary attachment-upload-button"
            disabled={busy || attachments.length >= MAX_ATTACHMENTS}
            onClick={() => inputRef.current?.click()}
          >
            <Plus size={17} />
            {ar ? "إضافة صور" : "Add images"}
          </button>
        </div>

        {error ? <div className="attachment-error">{error}</div> : null}

        {loading ? (
          <div className="attachment-state">
            <LoaderCircle size={22} className="spin" />
            <span>{ar ? "جاري تحميل الصور…" : "Loading images…"}</span>
          </div>
        ) : attachments.length === 0 ? (
          <div className="attachment-empty">
            <ImageIcon size={23} />
            <strong>{ar ? "لا توجد صور لهذا العقد بعد" : "No images for this contract yet"}</strong>
            <span>{ar ? "أول صورة تضيفها ستظهر هنا." : "The first image you add will appear here."}</span>
          </div>
        ) : (
          <div className="attachment-grid">
            {attachments.map((attachment, index) => (
              <article className="attachment-item" key={attachment.id}>
                <button
                  type="button"
                  className="attachment-preview-button"
                  onClick={() => setPreview(attachment)}
                  aria-label={ar ? "فتح الصورة" : "Open image"}
                >
                  <img src={attachment.dataUrl} alt={attachment.name} />
                  <span className="attachment-page-number">{index + 1}</span>
                  <span className="attachment-expand">
                    <Expand size={16} />
                  </span>
                </button>

                <div className="attachment-item-copy">
                  <strong title={attachment.name}>{attachment.name}</strong>
                  <span>{formatBytes(attachment.size)} · {uploadedAtText(attachment)}</span>
                </div>

                <button
                  type="button"
                  className="attachment-delete"
                  disabled={busy}
                  onClick={() => void removeAttachment(attachment)}
                  aria-label={ar ? "حذف الصورة" : "Delete image"}
                  title={ar ? "حذف" : "Delete"}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {preview ? (
        <div className="attachment-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="attachment-modal-backdrop"
            onClick={() => setPreview(null)}
            aria-label={ar ? "إغلاق المعاينة" : "Close preview"}
          />

          <div className="attachment-modal-panel">
            <header>
              <div>
                <strong>{preview.name}</strong>
                <span>{uploadedAtText(preview)} · {formatBytes(preview.size)}</span>
              </div>
              <div className="attachment-modal-actions">
                <a
                  className="icon-button"
                  href={preview.dataUrl}
                  download={preview.name}
                  title={ar ? "تنزيل الصورة" : "Download image"}
                >
                  <Download size={18} />
                </a>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setPreview(null)}
                  aria-label={ar ? "إغلاق" : "Close"}
                >
                  <X size={20} />
                </button>
              </div>
            </header>

            <div className="attachment-modal-image">
              <img src={preview.dataUrl} alt={preview.name} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
