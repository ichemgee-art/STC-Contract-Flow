import "server-only";

interface FirestoreValue {
  booleanValue?: boolean;
  stringValue?: string;
}

interface FirestoreDocument {
  fields?: Record<string, FirestoreValue>;
}

interface FirebaseTokenPayload {
  sub?: string;
  user_id?: string;
  auth_time?: number;
}

interface IdentityLookupResponse {
  users?: Array<{
    localId?: string;
    disabled?: boolean;
    validSince?: string;
  }>;
}

function decodeFirebasePayload(token: string): FirebaseTokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) return null;
    return JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as FirebaseTokenPayload;
  } catch {
    return null;
  }
}

async function verifiedFirebaseUid(token: string) {
  // The isolated Firebase emulator uses unsigned local test tokens. Production
  // must never use this path.
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
    const payload = decodeFirebasePayload(token);
    return payload?.user_id || payload?.sub || "";
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("Firebase API key is not configured.");

  // Identity Toolkit validates the Firebase ID token server-side and returns
  // the canonical localId/disabled state. This avoids trusting a decoded JWT
  // payload while keeping this deployment free of long-lived service-account
  // private keys.
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) return "";

  const lookup = (await response.json()) as IdentityLookupResponse;
  const account = lookup.users?.[0];
  if (!account?.localId || account.disabled === true) return "";

  // validSince is Firebase Auth's token-valid-after boundary. Identity Toolkit
  // already authenticated the token; this additional comparison makes password
  // resets/admin revocation take effect for privileged API routes without
  // waiting for the browser's current ID token to expire.
  const payload = decodeFirebasePayload(token);
  const authTime = payload?.auth_time;
  const validSince = Number(account.validSince ?? 0);
  if (
    Number.isFinite(validSince)
    && validSince > 0
    && typeof authTime === "number"
    && authTime < validSince
  ) {
    return "";
  }

  return account.localId;
}

async function firestoreGet(path: string, token: string) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Firebase project ID is not configured.");

  const baseUrl =
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
      ? `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`
      : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  return fetch(
    `${baseUrl}/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
}

export interface VerifiedMember {
  uid: string;
  displayName: string;
  role: "admin" | "editor";
}

export async function requireActiveMember(
  request: Request,
  contractId?: string,
): Promise<VerifiedMember> {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) throw new Response("Unauthorized", { status: 401 });

  const uid = await verifiedFirebaseUid(token);
  if (!uid) throw new Response("Unauthorized", { status: 401 });

  const userResponse = await firestoreGet(`users/${encodeURIComponent(uid)}`, token);
  if (!userResponse.ok) {
    throw new Response(
      "Unauthorized",
      { status: userResponse.status === 404 ? 403 : userResponse.status },
    );
  }

  const userDocument = (await userResponse.json()) as FirestoreDocument;
  const active = userDocument.fields?.active?.booleanValue === true;
  const role = userDocument.fields?.role?.stringValue;
  const displayName = userDocument.fields?.displayName?.stringValue || "STC User";

  if (!active || (role !== "admin" && role !== "editor")) {
    throw new Response("Forbidden", { status: 403 });
  }

  if (contractId) {
    const contractResponse = await firestoreGet(
      `contracts/${encodeURIComponent(contractId)}`,
      token,
    );

    if (!contractResponse.ok) {
      throw new Response(
        contractResponse.status === 404 ? "Contract not found" : "Forbidden",
        { status: contractResponse.status === 404 ? 404 : 403 },
      );
    }
  }

  return {
    uid,
    displayName,
    role,
  };
}
