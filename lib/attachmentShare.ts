import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";

export const ATTACHMENT_SHARE_TTL_MS = 30 * 60 * 1000;
const TOKEN_AAD = Buffer.from("stc-attachment-share:v2", "utf8");

export interface AttachmentSharePayload {
  v: 1 | 2;
  contractId: string;
  pathname: string;
  name: string;
  iat: number;
  exp: number;
  nonce: string;
}

function configuredSecrets() {
  const current = process.env.ATTACHMENT_SHARE_SECRET;
  if (!current || current.length < 32) {
    throw new Error("ATTACHMENT_SHARE_SECRET is not configured.");
  }

  const previous = process.env.ATTACHMENT_SHARE_SECRET_PREVIOUS;
  return previous && previous.length >= 32 && previous !== current
    ? [current, previous]
    : [current];
}

function encryptionKey(secret: string) {
  return createHash("sha256")
    .update("stc-attachment-share-v2\0", "utf8")
    .update(secret, "utf8")
    .digest();
}

function legacySignatureFor(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

function validPayload(payload: Partial<AttachmentSharePayload>) {
  if (
    (payload.v !== 1 && payload.v !== 2)
    || typeof payload.contractId !== "string"
    || payload.contractId.length < 1
    || payload.contractId.length > 160
    || typeof payload.pathname !== "string"
    || payload.pathname.length < 1
    || payload.pathname.length > 700
    || typeof payload.name !== "string"
    || payload.name.length < 1
    || payload.name.length > 180
    || typeof payload.iat !== "number"
    || typeof payload.exp !== "number"
    || typeof payload.nonce !== "string"
    || payload.nonce.length < 16
    || payload.nonce.length > 100
  ) {
    return false;
  }

  const now = Date.now();
  const lifetime = payload.exp - payload.iat;
  return (
    payload.exp > now
    && payload.iat <= now + 60_000
    && lifetime > 0
    && lifetime <= ATTACHMENT_SHARE_TTL_MS
    && payload.pathname.startsWith(`contracts/${payload.contractId}/`)
  );
}

function parsePayload(value: string): AttachmentSharePayload | null {
  try {
    const payload = JSON.parse(value) as Partial<AttachmentSharePayload>;
    return validPayload(payload) ? payload as AttachmentSharePayload : null;
  } catch {
    return null;
  }
}

function verifyEncryptedToken(token: string) {
  const [version, ivEncoded, ciphertextEncoded, tagEncoded, extra] = token.split(".");
  if (
    version !== "v2"
    || !ivEncoded
    || !ciphertextEncoded
    || !tagEncoded
    || extra
  ) {
    return null;
  }

  let iv: Buffer;
  let ciphertext: Buffer;
  let tag: Buffer;

  try {
    iv = Buffer.from(ivEncoded, "base64url");
    ciphertext = Buffer.from(ciphertextEncoded, "base64url");
    tag = Buffer.from(tagEncoded, "base64url");
  } catch {
    return null;
  }

  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1 || ciphertext.length > 2048) {
    return null;
  }

  for (const secret of configuredSecrets()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
      decipher.setAAD(TOKEN_AAD);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");

      const payload = parsePayload(plaintext);
      if (payload?.v === 2) return payload;
    } catch {
      // Try the previous rotation secret, if configured.
    }
  }

  return null;
}

function verifyLegacyToken(token: string) {
  const [encodedPayload, providedSignature, extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra) return null;

  const provided = Buffer.from(providedSignature, "utf8");

  for (const secret of configuredSecrets()) {
    const expected = Buffer.from(
      legacySignatureFor(encodedPayload, secret),
      "utf8",
    );

    if (
      provided.length === expected.length
      && timingSafeEqual(provided, expected)
    ) {
      try {
        const payload = parsePayload(
          Buffer.from(encodedPayload, "base64url").toString("utf8"),
        );
        if (payload?.v === 1) return payload;
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function createAttachmentShareToken(input: {
  contractId: string;
  pathname: string;
  name: string;
}) {
  const now = Date.now();
  const payload: AttachmentSharePayload = {
    v: 2,
    contractId: input.contractId,
    pathname: input.pathname,
    name: input.name,
    iat: now,
    exp: now + ATTACHMENT_SHARE_TTL_MS,
    nonce: randomBytes(18).toString("base64url"),
  };

  if (!validPayload(payload)) {
    throw new Error("Invalid attachment share payload.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    encryptionKey(configuredSecrets()[0]),
    iv,
  );
  cipher.setAAD(TOKEN_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    token: [
      "v2",
      iv.toString("base64url"),
      ciphertext.toString("base64url"),
      tag.toString("base64url"),
    ].join("."),
    payload,
  };
}

export function verifyAttachmentShareToken(token: string): AttachmentSharePayload | null {
  if (!token || token.length > 4096) return null;
  return token.startsWith("v2.")
    ? verifyEncryptedToken(token)
    : verifyLegacyToken(token);
}
