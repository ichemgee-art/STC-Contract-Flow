"use client";

import { auth } from "@/lib/firebase";

export interface ContractAttachment {
  pathname: string;
  name: string;
  size: number;
  uploadedAt: string;
  contentType: string;
}

const TARGET_COMPRESSED_BYTES = 850_000;
const MAX_COMPRESSED_BYTES = 1_200_000;

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
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are supported.");
  }

  const image = await loadImage(file);
  let width = image.naturalWidth;
  let height = image.naturalHeight;

  const maxDimension = 2600;
  if (Math.max(width, height) > maxDimension) {
    const ratio = maxDimension / Math.max(width, height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Image processing is not available.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  let quality = 0.94;
  let blob: Blob | null = null;
  let outputType = "image/webp";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
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
    const fallbackQuality = 0.84;
    blob = await canvasToBlob(canvas, fallbackQuality, outputType);
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
  const headers = await authHeaders();
  const response = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/attachments`, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) throw new Error("Could not load attachments.");
  const payload = (await response.json()) as { attachments: ContractAttachment[] };
  return payload.attachments;
}

export async function addContractAttachment(contractId: string, source: File) {
  const file = await optimizeContractImage(source);
  const headers = await authHeaders();
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(
    `/api/contracts/${encodeURIComponent(contractId)}/attachments`,
    {
      method: "POST",
      headers,
      body,
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Could not upload attachment.");
  }

  const payload = (await response.json()) as { attachment: ContractAttachment };
  return payload.attachment;
}

export async function deleteContractAttachment(contractId: string, pathname: string) {
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
    },
  );

  if (!response.ok) throw new Error("Could not delete attachment.");
}

export async function fetchContractAttachment(contractId: string, pathname: string) {
  const headers = await authHeaders();
  const response = await fetch(
    `/api/contracts/${encodeURIComponent(contractId)}/attachments?pathname=${encodeURIComponent(pathname)}`,
    {
      headers,
      cache: "default",
    },
  );

  if (!response.ok) throw new Error("Could not load attachment.");
  return response.blob();
}
