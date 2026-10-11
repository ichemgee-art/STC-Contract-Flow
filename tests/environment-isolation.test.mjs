import assert from "node:assert/strict";
import test from "node:test";
import { assertPreviewIsolation } from "../lib/environmentIsolation.ts";

const isolated = {
  VERCEL_ENV: "preview",
  NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyBV4Wu1OtZ3LcEc4gMUwrup6wTT0yqJfOM",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "stc-contract-flow-preview",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "stc-contract-flow-preview.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "stc-contract-flow-preview.firebasestorage.app",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "44481933818",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:44481933818:web:b7d8fbe33641598abd7443",
  BLOB_STORE_ID: "store_RAYJhxZ46nLqTZCB",
  BLOB_READ_WRITE_TOKEN: "test-only-preview-token",
  ATTACHMENT_SHARE_SECRET: "test-only-secret-with-at-least-32-characters",
};

test("dedicated Preview configuration builds", () => {
  assert.doesNotThrow(() => assertPreviewIsolation(isolated));
});
test("production and local emulator workflows are unaffected", () => {
  for (const VERCEL_ENV of ["production", "development", undefined]) {
    assert.doesNotThrow(() => assertPreviewIsolation({ VERCEL_ENV }));
  }
});
for (const [key, value] of Object.entries({
  NEXT_PUBLIC_FIREBASE_API_KEY: "wrong-project-key",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "stc-contract-flow",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "stc-contract-flow.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "stc-contract-flow.firebasestorage.app",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "734139099131",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:734139099131:web:e08209e3fc34b0de20cd5e",
  BLOB_STORE_ID: "store_beAq4JiSWexxCh86",
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
})) {
  test(`rejects production or emulator configuration: ${key}`, () => {
    assert.throws(() => assertPreviewIsolation({ ...isolated, [key]: value }));
  });
}
for (const key of Object.keys(isolated).filter(key => key !== "VERCEL_ENV")) {
  test(`rejects missing Preview setting: ${key}`, () => {
    const env = { ...isolated };
    delete env[key];
    assert.throws(() => assertPreviewIsolation(env));
  });
}
test("rejects short share secrets without disclosing their values", () => {
  assert.throws(
    () => assertPreviewIsolation({ ...isolated, ATTACHMENT_SHARE_SECRET: "short" }),
    (error) => !error.message.includes("short"),
  );
});
