type Environment = Record<string, string | undefined>;

const preview = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyBV4Wu1OtZ3LcEc4gMUwrup6wTT0yqJfOM",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "stc-contract-flow-preview",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "stc-contract-flow-preview.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "stc-contract-flow-preview.firebasestorage.app",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "44481933818",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:44481933818:web:b7d8fbe33641598abd7443",
} as const;

/** Fail the build before a Preview can embed production Firebase configuration. */
export function assertPreviewIsolation(env: Environment): void {
  if (env.VERCEL_ENV !== "preview") return;
  if (env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
    throw new Error("Preview must use its dedicated Firebase project, not localhost emulators.");
  }
  for (const [key, expected] of Object.entries(preview)) {
    if (env[key] !== expected) {
      throw new Error(`Preview isolation: ${key} must identify the dedicated Preview Firebase app.`);
    }
  }
  if (env.BLOB_STORE_ID !== "store_RAYJhxZ46nLqTZCB" || !env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Preview isolation: dedicated Preview Blob store binding and token are required.");
  }
  if ((env.ATTACHMENT_SHARE_SECRET?.length ?? 0) < 32) {
    throw new Error("Preview isolation: an independent attachment-share secret is required.");
  }
}
