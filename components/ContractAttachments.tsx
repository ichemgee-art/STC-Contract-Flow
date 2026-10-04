"use client";

import {
  Expand,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ContractImageViewer } from "@/components/ContractImageViewer";
import { useLanguage } from "@/components/LanguageProvider";
import {
  addContractAttachment,
  deleteContractAttachment,
  fetchContractAttachment,
  listContractAttachments,
  type ContractAttachment,
} from "@/lib/contractAttachments";
import { playUiSound, primeUiAudio } from "@/lib/sounds";

const MAX_ATTACHMENTS = 5;

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
  const autoAttempted = useRef(false);
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (forceRetry = false) => {
    if (src || loading || (failed && !forceRetry)) return src;
    setLoading(true);
    setFailed(false);

    try {
      const blob = await fetchContractAttachment(contractId, attachment.pathname);
      const next = URL.createObjectURL(blob);
      setSrc(next);
      return next;
    } catch {
      setFailed(true);
      return "";
    } finally {
      setLoading(false);
    }
  }, [attachment.pathname, contractId, failed, loading, src]);

  useEffect(() => {
    const element = buttonRef.current;
    if (!element || src) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !autoAttempted.current) {
          autoAttempted.current = true;
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
      aria-label={attachment.name}
      onClick={() => {
        if (src) {
          onOpen(attachment, src);
          return;
        }
        autoAttempted.current = true;
        void load(true).then((url) => {
          if (url) onOpen(attachment, url);
        });
      }}
    >
      {src ? (
        <img src={src} alt={attachment.name} loading="lazy" />
      ) : (
        <span className="attachment-image-placeholder">
          {loading ? <LoaderCircle size={22} className="spin" /> : <ImageIcon size={22} />}
          {failed ? <small>Retry / إعادة المحاولة</small> : null}
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
  const [selectedPath, setSelectedPath] = useState("");
  const closePreview = useCallback(() => setPreview(null), []);
  const [dragging, setDragging] = useState(false);

  const ar = language === "ar";
  const selectedAttachment = attachments.find(item => item.pathname === selectedPath) || attachments[0];

  const reload = useCallback(async (preserveError = false) => {
    try {
      const next = await listContractAttachments(contractId);
      setAttachments(next);
      if (!preserveError) setError("");
    } catch {
      setError(ar ? "تعذر تحميل صور العقد." : "Could not load contract images.");
    } finally {
      setLoading(false);
    }
  }, [contractId, ar]);

  useEffect(() => {
    setLoading(true);
    setAttachments([]);
    setSelectedPath("");
    setPreview(null);
    void reload();
  }, [reload]);

  async function uploadFiles(files: File[]) {
    if (busy || loading || files.length === 0) return;

    const images = files.filter((file) =>
      file.type.startsWith("image/")
      || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name),
    );

    if (!images.length) {
      setError(ar ? "اختر صورًا فقط." : "Please choose image files only.");
      return;
    }

    const availableSlots = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    const selected = images.slice(0, availableSlots);

    if (!selected.length) {
      setError(ar ? "وصلت للحد الأقصى: 5 صور للعقد." : "Maximum reached: 5 images per contract.");
      return;
    }

    primeUiAudio();
    setBusy(true);
    setError("");

    let uploaded = 0;
    const failures: string[] = [];

    try {
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];

        setProgress(
          ar
            ? `جاري تحسين ورفع الصورة ${index + 1} من ${selected.length}`
            : `Optimizing and uploading ${index + 1} of ${selected.length}`,
        );

        try {
          await addContractAttachment(contractId, file);
          uploaded += 1;
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "";

          if (/Maximum attachments/i.test(message)) {
            failures.push(ar ? "تم الوصول للحد الأقصى 5 صور." : "The 5-image limit was reached.");
            break;
          }

          if (/Source image is too large/i.test(message)) {
            failures.push(ar ? `${file.name}: حجم الصورة الأصلية كبير جدًا.` : `${file.name}: source image is too large.`);
          } else if (/too large/i.test(message)) {
            failures.push(ar ? `${file.name}: تعذر ضغط الصورة للحجم المسموح.` : `${file.name}: could not be compressed enough.`);
          } else if (/Unsupported image|Only image/i.test(message)) {
            failures.push(ar ? `${file.name}: صيغة الصورة غير مدعومة على هذا الجهاز.` : `${file.name}: image format is not supported on this device.`);
          } else {
            failures.push(ar ? `${file.name}: فشل الرفع.` : `${file.name}: upload failed.`);
          }
        }
      }

      if (uploaded > 0) {
        playUiSound("created");
      }

      const skippedForLimit = Math.max(0, images.length - selected.length);
      const notices = [...failures];

      if (skippedForLimit > 0) {
        notices.push(
          ar
            ? `تم تجاهل ${skippedForLimit} صورة لأن الحد الأقصى للعقد هو 5 صور.`
            : `${skippedForLimit} image(s) were skipped because the contract limit is 5.`,
        );
      }

      if (notices.length) {
        setError(notices.join(" "));
      }
    } finally {
      await reload();
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
            <h3>{ar ? "مستندات العقد" : "Contract document viewer"}</h3>
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
            disabled={busy || loading || attachments.length >= MAX_ATTACHMENTS}
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
          <div className="contract-document-layout">
            <div className="contract-document-preview">
              <AttachmentThumbnail
                key={selectedAttachment.pathname}
                contractId={contractId}
                attachment={selectedAttachment}
                onOpen={(item, url) => setPreview({ attachment: item, url })}
              />
              <span>{ar ? "اضغط لفتح المستند والتكبير" : "Open document to zoom and inspect"}</span>
            </div>
          <div className="attachment-grid document-thumbnail-strip">
            {attachments.map((attachment, index) => (
              <article className={selectedAttachment.pathname === attachment.pathname ? "attachment-item document-page-selected" : "attachment-item"} key={attachment.pathname}>
                <div className="attachment-thumb-wrap">
                  <AttachmentThumbnail
                    contractId={contractId}
                    attachment={attachment}
                    onOpen={(item) => setSelectedPath(item.pathname)}
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
          </div>
        )}
      </section>

      {preview ? <ContractImageViewer
        src={preview.url} name={preview.attachment.name} ar={ar}
        onClose={closePreview} onDownload={() => void downloadAttachment(preview.attachment)}
      /> : null}
    </>
  );
}
