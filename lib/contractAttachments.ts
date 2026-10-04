"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const MAX_COMPRESSED_BYTES = 580_000;
const MAX_DATA_URL_CHARS = 800_000;

export interface ContractAttachment {
  id: string;
  name: string;
  dataUrl: string;
  contentType: "image/jpeg";
  size: number;
  originalSize: number;
  uploadedAt: Timestamp | null;
  uploadedBy: string;
  uploadedByName: string;
}

function fromSnapshot(snapshot: DocumentSnapshot<DocumentData>): ContractAttachment {
  const data = snapshot.data();
  if (!data) throw new Error("Attachment document has no data.");

  return {
    id: snapshot.id,
    name: data.name ?? "contract-image.jpg",
    dataUrl: data.dataUrl ?? "",
    contentType: "image/jpeg",
    size: Number(data.size ?? 0),
    originalSize: Number(data.originalSize ?? 0),
    uploadedAt: data.uploadedAt ?? null,
    uploadedBy: data.uploadedBy ?? "",
    uploadedByName: data.uploadedByName ?? "",
  };
}

export function subscribeContractAttachments(
  contractId: string,
  onData: (attachments: ContractAttachment[]) => void,
  onError?: (error: Error) => void,
) {
  const attachmentsQuery = query(
    collection(db, "contracts", contractId, "attachments"),
    orderBy("uploadedAt", "desc"),
  );

  return onSnapshot(
    attachmentsQuery,
    (snapshot) => onData(snapshot.docs.map(fromSnapshot)),
    (error) => onError?.(error),
  );
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

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image."));
    reader.readAsDataURL(blob);
  });
}

export async function optimizeContractImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are supported.");
  }

  const image = await loadImage(file);
  let width = image.naturalWidth;
  let height = image.naturalHeight;

  const maxDimension = 2400;
  if (Math.max(width, height) > maxDimension) {
    const ratio = maxDimension / Math.max(width, height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Image processing is not available.");

  let quality = 0.88;
  let blob: Blob | null = null;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    canvas.width = width;
    canvas.height = height;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    blob = await canvasToBlob(canvas, quality);
    if (blob.size <= MAX_COMPRESSED_BYTES) break;

    quality = Math.max(0.58, quality - 0.06);
    if (attempt >= 2) {
      width = Math.max(1100, Math.round(width * 0.88));
      height = Math.max(1100, Math.round(height * 0.88));
    }
  }

  if (!blob || blob.size > MAX_COMPRESSED_BYTES) {
    throw new Error("Image is too large to optimize safely.");
  }

  const dataUrl = await blobToDataUrl(blob);
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error("Optimized image is still too large.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 150) || "contract-image";

  return {
    name: baseName + ".jpg",
    dataUrl,
    size: blob.size,
    originalSize: file.size,
  };
}

export async function addContractAttachment(
  contractId: string,
  file: File,
  user: { uid: string; displayName: string },
) {
  const optimized = await optimizeContractImage(file);

  return addDoc(collection(db, "contracts", contractId, "attachments"), {
    ...optimized,
    contentType: "image/jpeg",
    uploadedAt: serverTimestamp(),
    uploadedBy: user.uid,
    uploadedByName: user.displayName,
  });
}

export async function deleteContractAttachment(contractId: string, attachmentId: string) {
  return deleteDoc(doc(db, "contracts", contractId, "attachments", attachmentId));
}
