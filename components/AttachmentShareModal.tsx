"use client";

import {
  Check,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import QRCode from "react-qr-code";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createAttachmentShare,
  type ContractAttachment,
  type ContractAttachmentShare,
} from "@/lib/contractAttachments";

export function AttachmentShareModal({
  contractId,
  attachment,
  ar,
  onClose,
}: {
  contractId: string;
  attachment: ContractAttachment;
  ar: boolean;
  onClose: () => void;
}) {
  const [share, setShare] = useState<ContractAttachmentShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const generate = useCallback(async () => {
    setLoading(true);
    setError("");
    setCopied(false);
    try {
      const next = await createAttachmentShare(contractId, attachment.pathname);
      setShare(next);
      setNow(Date.now());
    } catch {
      setError(ar ? "تعذر إنشاء QR للصورة." : "Could not create the QR link.");
    } finally {
      setLoading(false);
    }
  }, [ar, attachment.pathname, contractId]);

  useEffect(() => {
    void generate();
  }, [generate]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const remainingMs = share
    ? Math.max(0, new Date(share.expiresAt).getTime() - now)
    : 0;
  const expired = Boolean(share) && remainingMs <= 0;

  const countdown = useMemo(() => {
    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [remainingMs]);

  const expiryText = share
    ? new Date(share.expiresAt).toLocaleTimeString(ar ? "ar-EG" : "en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  async function copyLink() {
    if (!share?.shareUrl || expired) return;
    try {
      await navigator.clipboard.writeText(share.shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(ar ? "تعذر نسخ الرابط." : "Could not copy the link.");
    }
  }

  return (
    <div className="qr-share-modal" role="dialog" aria-modal="true">
      <button className="qr-share-backdrop" aria-label={ar ? "إغلاق" : "Close"} onClick={onClose} />
      <section className="qr-share-panel">
        <header>
          <div>
            <span className="qr-share-icon"><Smartphone size={20} /></span>
            <div>
              <p className="eyebrow">{ar ? "مشاركة على الموبايل" : "Share to phone"}</p>
              <h3>{ar ? "QR لصورة العقد" : "Contract image QR"}</h3>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"}>
            <X size={19} />
          </button>
        </header>

        <div className="qr-share-body">
          <div className="qr-share-qr-card">
            {loading ? (
              <div className="qr-share-loading">
                <LoaderCircle className="spin" size={28} />
                <span>{ar ? "جاري إنشاء QR آمن…" : "Creating secure QR…"}</span>
              </div>
            ) : share && !expired ? (
              <div className="qr-share-code">
                <QRCode
                  value={share.shareUrl}
                  size={230}
                  bgColor="#FFFFFF"
                  fgColor="#0B3556"
                  level="H"
                />
                <span className="qr-share-logo">STC</span>
              </div>
            ) : (
              <div className="qr-share-loading">
                <Clock3 size={28} />
                <span>{ar ? "انتهت صلاحية الـQR. اعمل Regenerate." : "QR expired. Regenerate it."}</span>
              </div>
            )}
          </div>

          <div className="qr-share-info">
            <div className="qr-share-security">
              <ShieldCheck size={18} />
              <div>
                <strong>{ar ? "رابط مؤقت وآمن" : "Secure temporary link"}</strong>
                <span>{ar ? "خاص بالصورة دي فقط وصالح 30 دقيقة." : "Only for this image and valid for 30 minutes."}</span>
              </div>
            </div>

            <div className="qr-share-expiry">
              <Clock3 size={18} />
              <div>
                <span>{ar ? "الوقت المتبقي" : "Time remaining"}</span>
                <strong>{share ? countdown : "—"}</strong>
                {share ? <small>{ar ? `ينتهي الساعة ${expiryText}` : `Expires at ${expiryText}`}</small> : null}
              </div>
            </div>

            <div className="qr-share-file">
              <span>{ar ? "الصورة" : "Image"}</span>
              <strong title={attachment.name}>{attachment.name}</strong>
            </div>

            {error ? <div className="attachment-error">{error}</div> : null}

            <div className="qr-share-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void copyLink()}
                disabled={!share || expired || loading}
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
                {copied ? (ar ? "تم النسخ" : "Copied") : (ar ? "Copy Link" : "Copy Link")}
              </button>

              <button
                type="button"
                className="button button-secondary"
                onClick={() => void generate()}
                disabled={loading}
              >
                <RefreshCw size={17} className={loading ? "spin" : ""} />
                Regenerate QR
              </button>

              {share && !expired ? (
                <a className="button button-secondary" href={share.shareUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={17} />
                  {ar ? "فتح الرابط" : "Open link"}
                </a>
              ) : null}

              {share && !expired ? (
                <a className="button button-primary" href={share.downloadUrl}>
                  <Download size={17} />
                  {ar ? "تحميل الصورة" : "Download image"}
                </a>
              ) : null}
            </div>

            <p className="qr-share-hint">
              {ar
                ? "امسح الكود بكاميرا الموبايل. هتفتح صفحة فيها الصورة وزر تحميل مباشر."
                : "Scan with your phone camera. The page opens with the image and a direct download button."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
