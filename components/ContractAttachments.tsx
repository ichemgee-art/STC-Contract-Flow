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
import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import {
  addContractAttachment,
  deleteContractAttachment,
  fetchContractAttachment,
  listContractAttachments,
  type ContractAttachment,
} from "@/lib/contractAttachments";
import { playUiSound, primeUiAudio } from "@/lib/sounds";

const MAX_ATTACHMENTS = 20;

function formatBytes(value: number) {
  if (!value) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentThumbnail({
  contractId,
  attachment,
  onOpen,
}: {
  contractId: string;
  attachment: ContractAttachment;
  onOpen: (attachment: ContractAttachment, url: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (src || loading) return src;
    setLoading(true);

    try {
      const blob = await fetchContractAttachment(contractId, attachment.pathname);
      const next = URL.createObjectURL(blob);
      setSrc(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, [attachment.pathname, contractId, loading, src]);

  useEffect(() => {
    const element = buttonRef.current;
    if (!element || src) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void load().catch(() => undefined);
          observer.disconnect();
        }
      },
      { rootMargin: "220px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [load, src]);

  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className="attachment-preview-button"
      onClick={() => {
        if (src) {
          onOpen(attachment, src);
          return;
        }
        void load().then((url) => {
          if (url) onOpen(attachment, url);
        });
      }}
    >
      {src ? (
        <img src={src} alt={attachment.name} loading="lazy" />
      ) : (
        <span className="attachment-image-placeholder">
          {loading ? <LoaderCircle size={22} className="spin" /> : <ImageIcon size={22} />}
        </span>
      )}
      <span className="attachment-expand"><Expand size={16} /></span>
    </button>
  );
}

export function ContractAttachments({ contractId }: { contractId: string }) {
  const { language, locale } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<ContractAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ attachment: ContractAttachment; url: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  const ar = language === "ar";

  const reload = useCallback(async () => {
    try {
      const next = await listContractAttachments(contractId);
      setAttachments(next);
      setError("");
    } catch {
      setError(ar ? "تعذر تحميل صور العقد." : "Could not load contract images.");
    } finally {
      setLoading(false);
    }
  }, [contractId, ar]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  async function uploadFiles(files: File[]) {
    if (busy || files.length === 0) return;

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
            ? `جاري تحسين ورفع الصورة ${index + 1} من ${selected.length}`
            : `Optimizing and uploading ${index + 1} of ${selected.length}`,
        );
        await addContractAttachment(contractId, selected[index]);
      }

      await reload();
      playUiSound("created");

      if (images.length > availableSlots) {
        setError(
          ar
            ? `تم رفع ${selected.length} صورة فقط لأن الحد الأقصى 20 صورة للعقد.`
            : `Uploaded ${selected.length} image(s) because the maximum is 20 per contract.`,
        );
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (/Maximum attachments/i.test(message)) {
        setError(ar ? "وصلت للحد الأقصى: 20 صورة للعقد." : "Maximum reached: 20 images per contract.");
      } else if (/too large/i.test(message)) {
        setError(ar ? "الصورة كبيرة جدًا حتى بعد التحسين. جرّب صورة أخرى." : "The image is still too large after optimization.");
      } else {
        setError(ar ? "تعذر رفع الصورة. جرّب مرة أخرى." : "Could not upload the image. Try again.");
      }
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
      await deleteContractAttachment(contractId, attachment.pathname);
      if (preview?.attachment.pathname === attachment.pathname) setPreview(null);
      await reload();
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
    const value = new Date(attachment.uploadedAt);
    if (Number.isNaN(value.getTime())) return ar ? "الآن" : "Just now";

    return value.toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function downloadAttachment(attachment: ContractAttachment) {
    try {
      const blob = await fetchContractAttachment(contractId, attachment.pathname);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(ar ? "تعذر تنزيل الصورة." : "Could not download the image.");
    }
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
                ? "احتفظ بصور العقد داخل نفس السجل. الصور خاصة ولا تُفتح إلا لمستخدم مسجل ومفعّل."
                : "Keep contract images in the same record. Files stay private and require an active signed-in user."}
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
          <div className="attachment-drop-copy">
            <strong>
              {busy
                ? progress
                : ar
                  ? "اسحب صور العقد هنا أو اختر من الجهاز"
                  : "Drop contract images here or choose from your device"}
            </strong>
            <span>
              {ar
                ? "صور الموبايل وJPG/PNG · تحسين تلقائي مع الحفاظ على وضوح الكتابة"
                : "Mobile photos and JPG/PNG · automatic optimization while keeping text readable"}
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
              <article className="attachment-item" key={attachment.pathname}>
                <div className="attachment-thumb-wrap">
                  <AttachmentThumbnail
                    contractId={contractId}
                    attachment={attachment}
                    onOpen={(item, url) => setPreview({ attachment: item, url })}
                  />
                  <span className="attachment-page-number">{index + 1}</span>
                </div>

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
                <strong>{preview.attachment.name}</strong>
                <span>{uploadedAtText(preview.attachment)} · {formatBytes(preview.attachment.size)}</span>
              </div>
              <div className="attachment-modal-actions">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => void downloadAttachment(preview.attachment)}
                  title={ar ? "تنزيل الصورة" : "Download image"}
                >
                  <Download size={18} />
                </button>
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
              <img src={preview.url} alt={preview.attachment.name} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
