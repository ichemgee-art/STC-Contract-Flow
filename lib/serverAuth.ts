import "server-only";

interface FirestoreValue {
  booleanValue?: boolean;
  stringValue?: string;
}

interface FirestoreDocument {
  fields?: Record<string, FirestoreValue>;
}

function decodeFirebaseUid(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return "";
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: string;
      user_id?: string;
    };
    return parsed.user_id || parsed.sub || "";
  } catch {
    return "";
  }
}

async function firestoreGet(path: string, token: string) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Firebase project ID is not configured.");

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  return response;
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

  const uid = decodeFirebaseUid(token);
  if (!uid) throw new Response("Unauthorized", { status: 401 });

  const userResponse = await firestoreGet(`users/${encodeURIComponent(uid)}`, token);
  if (!userResponse.ok) {
    throw new Response("Unauthorized", { status: userResponse.status === 404 ? 403 : userResponse.status });
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
