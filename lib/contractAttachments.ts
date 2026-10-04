"use client";

import { auth } from "@/lib/firebase";

export interface ContractAttachment {
  pathname: string;
  name: string;
  size: number;
  uploadedAt: string;
  contentType: string;
}

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

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not optimize image."));
      },
      "image/jpeg",
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

  const maxDimension = 2800;
  if (Math.max(width, height) > maxDimension) {
    const ratio = maxDimension / Math.max(width, height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Image processing is not available.");

  let quality = 0.9;
  let blob: Blob | null = null;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    blob = await canvasToBlob(canvas, quality);
    if (blob.size <= MAX_COMPRESSED_BYTES) break;

    quality = Math.max(0.62, quality - 0.05);
    if (attempt >= 2) {
      width = Math.max(1400, Math.round(width * 0.9));
      height = Math.max(1400, Math.round(height * 0.9));
    }
  }

  if (!blob) throw new Error("Could not optimize image.");

  const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 140) || "contract-image";
  return new File([blob], baseName + ".jpg", {
    type: "image/jpeg",
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
      cache: "no-store",
    },
  );

  if (!response.ok) throw new Error("Could not load attachment.");
  return response.blob();
}
