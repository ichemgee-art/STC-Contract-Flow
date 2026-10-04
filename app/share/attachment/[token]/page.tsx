import { Clock3, Download, ShieldCheck } from "lucide-react";
import { verifyAttachmentShareToken } from "@/lib/attachmentShare";

export const dynamic = "force-dynamic";

export default async function AttachmentSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyAttachmentShareToken(token);

  if (!payload) {
    return (
      <main className="share-page">
        <section className="share-card share-expired-card">
          <div className="share-brand">STC</div>
          <p className="eyebrow">STC CONTRACT FLOW</p>
          <h1>انتهت صلاحية رابط الصورة</h1>
          <p>
            رابط الـ QR مؤقت. ارجع للنظام واعمل <strong>Regenerate QR</strong> للحصول على رابط جديد صالح لمدة 30 دقيقة.
          </p>
        </section>
      </main>
    );
  }

  const encodedToken = encodeURIComponent(token);
  const imageUrl = `/api/share/attachment/${encodedToken}`;
  const downloadUrl = `${imageUrl}?download=1`;
  const expiresAt = new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(new Date(payload.exp));

  return (
    <main className="share-page">
      <section className="share-card">
        <header className="share-header">
          <div>
            <div className="share-brand">STC</div>
            <div>
              <p className="eyebrow">STC CONTRACT FLOW</p>
              <h1>صورة عقد</h1>
            </div>
          </div>
          <span className="share-secure-badge">
            <ShieldCheck size={16} />
            رابط مؤقت وآمن
          </span>
        </header>

        <div className="share-expiry">
          <Clock3 size={17} />
          <div>
            <strong>صالح حتى {expiresAt}</strong>
            <span>بعد الموعد ده الرابط والصورة مش هيفتحوا من الـQR.</span>
          </div>
        </div>

        <div className="share-image-shell">
          <img src={imageUrl} alt={payload.name} />
        </div>

        <div className="share-file-name" title={payload.name}>
          {payload.name}
        </div>

        <a className="share-download-button" href={downloadUrl}>
          <Download size={19} />
          تحميل الصورة على الموبايل
        </a>

        <p className="share-footer-note">
          Specialized Trading & Construction · الرابط مخصص لمشاركة هذه الصورة فقط.
        </p>
      </section>
    </main>
  );
}
