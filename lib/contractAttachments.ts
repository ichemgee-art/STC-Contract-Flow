"use client";

import { auth } from "@/lib/firebase";
import {
  cachedAttachment,
  clearAttachmentCaches,
  invalidateAttachment,
} from "@/lib/attachmentCache";

export interface ContractAttachment {
  pathname: string;
  name: string;
  size: number;
  uploadedAt: string;
  contentType: string;
}

const TARGET_COMPRESSED_BYTES = 850_000;
const MAX_COMPRESSED_BYTES = 1_200_000;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const UPLOAD_RETRY_DELAYS = [600, 1200, 2200] as const;
const LIST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 75_000;
const DELETE_TIMEOUT_MS = 30_000;

async function authHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unsupported image format."));
    };

    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not optimize image."));
      },
      type,
      quality,
    );
  });
}

export async function optimizeContractImage(file: File) {
  const looksLikeImage =
    file.type.startsWith("image/")
    || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);

  if (!looksLikeImage) {
    throw new Error("Only image files are supported.");
  }

  if (file.size <= 0) {
    throw new Error("The image file is empty.");
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Source image is too large.");
  }

  const image = await loadImage(file);
  let width = image.naturalWidth;
  let height = image.naturalHeight;

  if (!width || !height) {
    throw new Error("Unsupported image format.");
  }

  const maxDimension = 2600;
  if (Math.max(width, height) > maxDimension) {
    const ratio = maxDimension / Math.max(width, height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Image processing is not available.");

  let quality = 0.94;
  let blob: Blob | null = null;
  let outputType = "image/webp";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    // Resizing a canvas resets the 2D context state, so quality settings must
    // be restored on every compression pass.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    blob = await canvasToBlob(canvas, quality, outputType);

    if (blob.type !== "image/webp") {
      outputType = "image/jpeg";
      blob = await canvasToBlob(canvas, quality, outputType);
    }

    if (blob.size <= TARGET_COMPRESSED_BYTES) break;

    if (quality > 0.86) {
      quality = Math.max(0.86, quality - 0.025);
    } else {
      const longest = Math.max(width, height);
      if (longest > 2050) {
        const ratio = Math.max(2050 / longest, 0.9);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      } else {
        break;
      }
    }
  }

  if (!blob) throw new Error("Could not optimize image.");

  if (blob.size > MAX_COMPRESSED_BYTES) {
    blob = await canvasToBlob(canvas, 0.84, outputType);
  }

  if (blob.size > MAX_COMPRESSED_BYTES) {
    throw new Error("Image is too large to optimize safely.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 140) || "contract-image";
  const extension = outputType === "image/webp" ? ".webp" : ".jpg";

  return new File([blob], baseName + extension, {
    type: outputType,
    lastModified: Date.now(),
  });
}

export async function listContractAttachments(contractId: string) {
  const uid = auth.currentUser?.uid;
  const headers = await authHeaders();
  const response = await fetch(
    `/api/contracts/${encodeURIComponent(contractId)}/attachments`,
    {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      await clearAttachmentCaches();
    }
    throw new Error("Could not load attachments.");
  }

  if (auth.currentUser?.uid !== uid) {
    throw new Error("Authentication changed.");
  }

  const payload = (await response.json()) as { attachments: ContractAttachment[] };
  return payload.attachments;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function responseError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return "Could not upload attachment.";

  try {
    const payload = JSON.parse(text) as { error?: string };
    return payload.error || "Could not upload attachment.";
  } catch {
    return text;
  }
}

export async function addContractAttachment(contractId: string, source: File) {
  const file = await optimizeContractImage(source);

  for (let attempt = 0; attempt <= UPLOAD_RETRY_DELAYS.length; attempt += 1) {
    const headers = await authHeaders();
    const body = new FormData();
    body.append("file", file);

    const response = await fetch(
      `/api/contracts/${encodeURIComponent(contractId)}/attachments`,
      {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      },
    );

    if (response.ok) {
      const payload = (await response.json()) as { attachment: ContractAttachment };
      return payload.attachment;
    }

    const message = await responseError(response);
    const uploadBusy =
      response.status === 409
      && /upload in progress/i.test(message);

    if (uploadBusy && attempt < UPLOAD_RETRY_DELAYS.length) {
      await delay(UPLOAD_RETRY_DELAYS[attempt]);
      continue;
    }

    throw new Error(message);
  }

  throw new Error("Could not upload attachment.");
}

export async function deleteContractAttachment(contractId: string, pathname: string) {
  const uid = auth.currentUser?.uid;

  for (let attempt = 0; attempt <= UPLOAD_RETRY_DELAYS.length; attempt += 1) {
    const headers = await authHeaders();
    const response = await fetch(
      `/api/contracts/${encodeURIComponent(contractId)}/attachments`,
      {
        method: "DELETE",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pathname }),
        signal: AbortSignal.timeout(DELETE_TIMEOUT_MS),
      },
    );

    if (response.ok) {
      if (uid) await invalidateAttachment(uid, attachmentUrl(contractId, pathname));
      return;
    }

    const message = await responseError(response);
    const busy =
      response.status === 409
      && /upload in progress/i.test(message);

    if (busy && attempt < UPLOAD_RETRY_DELAYS.length) {
      await delay(UPLOAD_RETRY_DELAYS[attempt]);
      continue;
    }

    throw new Error(message || "Could not delete attachment.");
  }

  throw new Error("Could not delete attachment.");
}

function attachmentUrl(contractId: string, pathname: string) {
  return `/api/contracts/${encodeURIComponent(contractId)}/attachments?pathname=${encodeURIComponent(pathname)}`;
}

export async function fetchContractAttachment(contractId: string, pathname: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in.");

  const headers = await authHeaders();

  return cachedAttachment(
    uid,
    attachmentUrl(contractId, pathname),
    headers,
    () => auth.currentUser?.uid === uid,
  );
}


export interface ContractAttachmentShare {
  shareUrl: string;
  downloadUrl: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export async function createAttachmentShare(contractId: string, pathname: string) {
  const headers = await authHeaders();
  const response = await fetch(
    `/api/contracts/${encodeURIComponent(contractId)}/attachments/share`,
    {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pathname }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    const message = await responseError(response);
    throw new Error(message || "Could not create share link.");
  }

  return (await response.json()) as ContractAttachmentShare;
}
