import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

const PROJECT_ID = "demo-stc-contract-flow";
export const ADMIN_EMAIL = "e2e-admin@stc.local";
export const EDITOR_EMAIL = "e2e-editor@stc.local";
export const TEST_PASSWORD = "E2e-Test-2026!";

async function ensureUser(email: string, displayName: string, role: "admin" | "editor") {
  const auth = getAuth();
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password: TEST_PASSWORD, displayName });
  }

  await getFirestore().doc(`users/${user.uid}`).set({
    displayName,
    email,
    role,
    active: true,
  });

  return user;
}

export default async function globalSetup() {
  process.env.GCLOUD_PROJECT = PROJECT_ID;
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT_ID });

  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });

  await ensureUser(ADMIN_EMAIL, "E2E Admin", "admin");
  await ensureUser(EDITOR_EMAIL, "E2E Editor", "editor");

  const db = getFirestore();
  const batchSize = 125;
  const year = new Date().getFullYear();
  const base = Date.now() - batchSize * 60_000;

  const writer = db.bulkWriter();
  for (let index = 0; index < batchSize; index += 1) {
    const createdAt = Timestamp.fromMillis(base + index * 60_000);
    const id = `scale-${String(index + 1).padStart(3, "0")}`;
    writer.set(db.doc(`contracts/${id}`), {
      contractNumber: `STC-${year}-${String(index + 1).padStart(4, "0")}`,
      contractYear: year,
      contractSequence: index + 1,
      salesRepresentative: index % 2 ? "Scale Rep A" : "Scale Rep B",
      companyName: `Scale Company ${String(index + 1).padStart(3, "0")}`,
      contractType: "Supply",
      product: index % 3 ? "HPL" : "Raised Floor",
      stages: {
        stampedByUs: false,
        stampedByClient: false,
        downPayment: false,
        supply: false,
        settlement: false,
      },
      stageDates: {
        stampedByUs: null,
        stampedByClient: null,
        downPayment: null,
        supply: null,
        settlement: null,
      },
      createdAt,
      updatedAt: createdAt,
      createdBy: "e2e-seed",
      createdByName: "E2E Seed",
    });
  }
  writer.set(db.doc(`contractCounters/${year}`), {
    year,
    value: batchSize,
    updatedAt: Timestamp.now(),
  });
  await writer.close();

  // Make sure emulator writes are visible before the browser starts.
  await db.doc("e2e/meta").set({ seededAt: FieldValue.serverTimestamp(), contracts: batchSize });
}
