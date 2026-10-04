import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const ATTACHMENT_SHARE_TTL_MS = 30 * 60 * 1000;

export interface AttachmentSharePayload {
  v: 1;
  contractId: string;
  pathname: string;
  name: string;
  iat: number;
  exp: number;
  nonce: string;
}

function shareSecret() {
  const value = process.env.ATTACHMENT_SHARE_SECRET;
  if (!value || value.length < 32) {
    throw new Error("ATTACHMENT_SHARE_SECRET is not configured.");
  }
  return value;
}

function encodePayload(payload: AttachmentSharePayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function signatureFor(encodedPayload: string) {
  return createHmac("sha256", shareSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createAttachmentShareToken(input: {
  contractId: string;
  pathname: string;
  name: string;
}) {
  const now = Date.now();
  const payload: AttachmentSharePayload = {
    v: 1,
    contractId: input.contractId,
    pathname: input.pathname,
    name: input.name,
    iat: now,
    exp: now + ATTACHMENT_SHARE_TTL_MS,
    nonce: randomBytes(18).toString("base64url"),
  };

  const encodedPayload = encodePayload(payload);
  return {
    token: `${encodedPayload}.${signatureFor(encodedPayload)}`,
    payload,
  };
}

export function verifyAttachmentShareToken(token: string): AttachmentSharePayload | null {
  try {
    const [encodedPayload, providedSignature, extra] = token.split(".");
    if (!encodedPayload || !providedSignature || extra) return null;

    const expectedSignature = signatureFor(encodedPayload);
    const provided = Buffer.from(providedSignature, "utf8");
    const expected = Buffer.from(expectedSignature, "utf8");

    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<AttachmentSharePayload>;

    if (
      payload.v !== 1
      || typeof payload.contractId !== "string"
      || typeof payload.pathname !== "string"
      || typeof payload.name !== "string"
      || typeof payload.iat !== "number"
      || typeof payload.exp !== "number"
      || typeof payload.nonce !== "string"
    ) {
      return null;
    }

    const now = Date.now();
    const lifetime = payload.exp - payload.iat;
    if (
      payload.exp <= now
      || payload.iat > now + 60_000
      || lifetime <= 0
      || lifetime > ATTACHMENT_SHARE_TTL_MS
      || !payload.pathname.startsWith(`contracts/${payload.contractId}/`)
    ) {
      return null;
    }

    return payload as AttachmentSharePayload;
  } catch {
    return null;
  }
}
