import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

const PROJECT_ID = "demo-stc-contract-flow-rules";
const ADMIN_UID = "rules-admin";
const EDITOR_UID = "rules-editor";
const OTHER_UID = "rules-editor-other";
const INACTIVE_UID = "rules-inactive";
const ADMIN_NAME = "Rules Admin";
const EDITOR_NAME = "Rules Editor";
const OTHER_NAME = "Rules Other Editor";

let testEnv;

const emptyStages = () => ({
  stampedByUs: false,
  stampedByClient: false,
  downPayment: false,
  supply: false,
  settlement: false,
});

const emptyDates = () => ({
  stampedByUs: null,
  stampedByClient: null,
  downPayment: null,
  supply: null,
  settlement: null,
});

function formatNumber(year, sequence) {
  return `STC-${year}-${String(sequence).padStart(4, "0")}`;
}

async function seedProfile(uid, displayName, role, active = true) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", uid), {
      displayName,
      email: `${uid}@stc.test`,
      role,
      active,
    });
  });
}

async function seedUsers() {
  await Promise.all([
    seedProfile(ADMIN_UID, ADMIN_NAME, "admin", true),
    seedProfile(EDITOR_UID, EDITOR_NAME, "editor", true),
    seedProfile(OTHER_UID, OTHER_NAME, "editor", true),
    seedProfile(INACTIVE_UID, "Inactive User", "editor", false),
  ]);
}

function contractBody({
  uid,
  displayName,
  year,
  sequence,
  contractNumber = formatNumber(year, sequence),
}) {
  return {
    contractNumber,
    contractYear: year,
    contractSequence: sequence,
    salesRepresentative: "Rules Representative",
    companyName: "Rules Company",
    contractType: "Supply",
    product: "HPL",
    stages: emptyStages(),
    stageDates: emptyDates(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    createdByName: displayName,
  };
}

async function createReservedContract(db, {
  id = "contract-1",
  uid = EDITOR_UID,
  displayName = EDITOR_NAME,
  year = new Date().getUTCFullYear(),
} = {}) {
  const contractRef = doc(db, "contracts", id);

  await runTransaction(db, async (transaction) => {
    const counterRef = doc(db, "contractCounters", String(year));
    const counterSnapshot = await transaction.get(counterRef);
    const current = counterSnapshot.exists()
      ? Number(counterSnapshot.data().value ?? 0)
      : 0;
    const sequence = current + 1;
    const contractNumber = formatNumber(year, sequence);
    const reservationRef = doc(db, "contractNumberReservations", contractNumber);

    transaction.set(reservationRef, {
      contractId: id,
      year,
      sequence,
      createdAt: serverTimestamp(),
    });
    transaction.set(counterRef, {
      year,
      value: sequence,
      lastReservation: contractNumber,
      lastContractId: id,
      updatedAt: serverTimestamp(),
    });
    transaction.set(contractRef, contractBody({
      uid,
      displayName,
      year,
      sequence,
      contractNumber,
    }));
  });

  return contractRef;
}

async function assignLegacyNumber(db, id, year) {
  const contractRef = doc(db, "contracts", id);
  return runTransaction(db, async (transaction) => {
    const counterRef = doc(db, "contractCounters", String(year));
    const counterSnapshot = await transaction.get(counterRef);
    const current = counterSnapshot.exists()
      ? Number(counterSnapshot.data().value ?? 0)
      : 0;
    const sequence = current + 1;
    const contractNumber = formatNumber(year, sequence);
    const reservationRef = doc(db, "contractNumberReservations", contractNumber);

    transaction.set(reservationRef, {
      contractId: id,
      year,
      sequence,
      createdAt: serverTimestamp(),
    });
    transaction.set(counterRef, {
      year,
      value: sequence,
      lastReservation: contractNumber,
      lastContractId: id,
      updatedAt: serverTimestamp(),
    });
    transaction.update(contractRef, {
      contractNumber,
      contractYear: year,
      contractSequence: sequence,
      updatedAt: serverTimestamp(),
    });
  });
}

async function completeStage(db, contractRef, stage) {
  const snapshot = await getDoc(contractRef);
  const data = snapshot.data();
  const order = [
    "stampedByUs",
    "stampedByClient",
    "downPayment",
    "supply",
    "settlement",
  ];
  const stages = { ...data.stages, [stage]: true };
  const stageDates = { ...data.stageDates, [stage]: serverTimestamp() };
  assert.ok(order.includes(stage));

  await updateDoc(contractRef, {
    stages,
    stageDates,
    updatedAt: serverTimestamp(),
  });
}

before(async () => {
  const rules = await readFile("firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedUsers();
});

after(async () => {
  await testEnv.cleanup();
});

test("unauthenticated and inactive users cannot read contracts", async () => {
  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();
  const ref = await assertSucceeds(createReservedContract(editorDb));

  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(unauthDb, "contracts", ref.id)));

  const inactiveDb = testEnv.authenticatedContext(INACTIVE_UID).firestore();
  await assertFails(getDoc(doc(inactiveDb, "contracts", ref.id)));
});

test("users cannot create, edit, or self-escalate profile documents", async () => {
  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();

  await assertFails(updateDoc(doc(editorDb, "users", EDITOR_UID), {
    role: "admin",
  }));

  await assertFails(setDoc(doc(editorDb, "users", "attacker-created"), {
    displayName: "Attacker",
    email: "attacker@stc.test",
    role: "admin",
    active: true,
  }));
});

test("valid contract creation reserves a unique sequential number atomically", async () => {
  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();
  const year = new Date().getUTCFullYear();
  const ref = await assertSucceeds(createReservedContract(editorDb, { year }));

  const contract = (await getDoc(ref)).data();
  assert.equal(contract.contractNumber, formatNumber(year, 1));

  const counter = (await getDoc(doc(editorDb, "contractCounters", String(year)))).data();
  assert.equal(counter.value, 1);
  assert.equal(counter.lastContractId, ref.id);
});

test("direct counter corruption is denied even to an active editor", async () => {
  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();
  const year = new Date().getUTCFullYear();
  await assertSucceeds(createReservedContract(editorDb, { year }));

  await assertFails(updateDoc(doc(editorDb, "contractCounters", String(year)), {
    value: 2,
    updatedAt: serverTimestamp(),
  }));
});

test("contract creation without a matching reservation is denied", async () => {
  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();
  const year = new Date().getUTCFullYear();

  await assertFails(setDoc(
    doc(editorDb, "contracts", "unreserved"),
    contractBody({
      uid: EDITOR_UID,
      displayName: EDITOR_NAME,
      year,
      sequence: 1,
    }),
  ));
});

test("a duplicate displayed contract number cannot be assigned to another contract", async () => {
  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();
  const year = new Date().getUTCFullYear();
  await assertSucceeds(createReservedContract(editorDb, { id: "original", year }));

  await assertFails(setDoc(
    doc(editorDb, "contracts", "duplicate"),
    contractBody({
      uid: EDITOR_UID,
      displayName: EDITOR_NAME,
      year,
      sequence: 1,
      contractNumber: formatNumber(year, 1),
    }),
  ));
});

test("contract number text must match its year and sequence", async () => {
  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();
  const year = new Date().getUTCFullYear();
  const contractRef = doc(editorDb, "contracts", "mismatched");

  await assertFails(runTransaction(editorDb, async (transaction) => {
    const counterRef = doc(editorDb, "contractCounters", String(year));
    const reservationRef = doc(
      editorDb,
      "contractNumberReservations",
      formatNumber(year, 9999),
    );

    transaction.set(reservationRef, {
      contractId: contractRef.id,
      year,
      sequence: 1,
      createdAt: serverTimestamp(),
    });
    transaction.set(counterRef, {
      year,
      value: 1,
      lastReservation: formatNumber(year, 9999),
      lastContractId: contractRef.id,
      updatedAt: serverTimestamp(),
    });
    transaction.set(contractRef, contractBody({
      uid: EDITOR_UID,
      displayName: EDITOR_NAME,
      year,
      sequence: 1,
      contractNumber: formatNumber(year, 9999),
    }));
  }));
});

test("legacy contracts cannot be given a partial identifier", async () => {
  const year = new Date().getUTCFullYear();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "contracts", "legacy"), {
      salesRepresentative: "Rules Representative",
      companyName: "Legacy Company",
      contractType: "Supply",
      product: "HPL",
      stages: emptyStages(),
      stageDates: emptyDates(),
      createdAt: Timestamp.fromDate(new Date(Date.UTC(year, 2, 1))),
      updatedAt: Timestamp.fromDate(new Date(Date.UTC(year, 2, 1))),
      createdBy: EDITOR_UID,
      createdByName: EDITOR_NAME,
    });
  });

  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();
  await assertFails(updateDoc(doc(editorDb, "contracts", "legacy"), {
    contractNumber: formatNumber(year, 1),
    updatedAt: serverTimestamp(),
  }));
});

test("only admins can assign numbers to legacy contracts", async () => {
  const year = new Date().getUTCFullYear();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "contracts", "legacy-admin-only"), {
      salesRepresentative: "Rules Representative",
      companyName: "Legacy Admin Company",
      contractType: "Supply",
      product: "HPL",
      stages: emptyStages(),
      stageDates: emptyDates(),
      createdAt: Timestamp.fromDate(new Date(Date.UTC(year, 2, 1))),
      updatedAt: Timestamp.fromDate(new Date(Date.UTC(year, 2, 1))),
      createdBy: EDITOR_UID,
      createdByName: EDITOR_NAME,
    });
  });

  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();
  await assertFails(assignLegacyNumber(editorDb, "legacy-admin-only", year));

  const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore();
  await assertSucceeds(assignLegacyNumber(adminDb, "legacy-admin-only", year));

  const snapshot = await getDoc(doc(adminDb, "contracts", "legacy-admin-only"));
  assert.equal(snapshot.data().contractNumber, formatNumber(year, 1));
});

test("workflow cannot skip stages or forge a stage timestamp", async () => {
  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();
  const ref = await assertSucceeds(createReservedContract(editorDb));

  await assertFails(updateDoc(ref, {
    stages: {
      ...emptyStages(),
      stampedByClient: true,
    },
    stageDates: {
      ...emptyDates(),
      stampedByClient: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  }));

  await assertFails(updateDoc(ref, {
    stages: {
      ...emptyStages(),
      stampedByUs: true,
    },
    stageDates: {
      ...emptyDates(),
      stampedByUs: Timestamp.fromMillis(Date.now() - 60_000),
    },
    updatedAt: serverTimestamp(),
  }));
});

test("workflow allows one ordered stage at a time", async () => {
  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();
  const ref = await assertSucceeds(createReservedContract(editorDb));

  await assertSucceeds(completeStage(editorDb, ref, "stampedByUs"));
  await assertSucceeds(completeStage(editorDb, ref, "stampedByClient"));
  await assertSucceeds(completeStage(editorDb, ref, "downPayment"));
});

test("reopening a stage must clear every later completed stage", async () => {
  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();
  const ref = await assertSucceeds(createReservedContract(editorDb));

  await completeStage(editorDb, ref, "stampedByUs");
  await completeStage(editorDb, ref, "stampedByClient");
  await completeStage(editorDb, ref, "downPayment");
  await completeStage(editorDb, ref, "supply");

  const snapshot = await getDoc(ref);
  const data = snapshot.data();

  await assertFails(updateDoc(ref, {
    stages: {
      ...data.stages,
      downPayment: false,
    },
    stageDates: {
      ...data.stageDates,
      downPayment: null,
    },
    updatedAt: serverTimestamp(),
  }));

  await assertSucceeds(updateDoc(ref, {
    stages: {
      ...data.stages,
      downPayment: false,
      supply: false,
      settlement: false,
    },
    stageDates: {
      ...data.stageDates,
      downPayment: null,
      supply: null,
      settlement: null,
    },
    updatedAt: serverTimestamp(),
  }));
});

test("notes require an existing parent and cannot forge authorship", async () => {
  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();

  await assertFails(addDoc(
    collection(editorDb, "contracts", "missing-contract", "notes"),
    {
      text: "orphan note",
      createdAt: serverTimestamp(),
      createdBy: EDITOR_UID,
      createdByName: EDITOR_NAME,
    },
  ));

  const ref = await assertSucceeds(createReservedContract(editorDb));
  await assertFails(addDoc(collection(editorDb, "contracts", ref.id, "notes"), {
    text: "forged note",
    createdAt: serverTimestamp(),
    createdBy: ADMIN_UID,
    createdByName: ADMIN_NAME,
  }));
});

test("note owner can delete own note, other editor cannot, admin can", async () => {
  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();
  const otherDb = testEnv.authenticatedContext(OTHER_UID).firestore();
  const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore();
  const ref = await assertSucceeds(createReservedContract(editorDb));

  const note1 = await assertSucceeds(addDoc(
    collection(editorDb, "contracts", ref.id, "notes"),
    {
      text: "owner note",
      createdAt: serverTimestamp(),
      createdBy: EDITOR_UID,
      createdByName: EDITOR_NAME,
    },
  ));
  await assertFails(deleteDoc(doc(otherDb, "contracts", ref.id, "notes", note1.id)));
  await assertSucceeds(deleteDoc(doc(editorDb, "contracts", ref.id, "notes", note1.id)));

  const note2 = await assertSucceeds(addDoc(
    collection(editorDb, "contracts", ref.id, "notes"),
    {
      text: "admin cleanup note",
      createdAt: serverTimestamp(),
      createdBy: EDITOR_UID,
      createdByName: EDITOR_NAME,
    },
  ));
  await assertSucceeds(deleteDoc(doc(adminDb, "contracts", ref.id, "notes", note2.id)));
});

test("only admins can delete contracts", async () => {
  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();
  const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore();
  const ref = await assertSucceeds(createReservedContract(editorDb));

  await assertFails(deleteDoc(doc(editorDb, "contracts", ref.id)));
  await assertSucceeds(deleteDoc(doc(adminDb, "contracts", ref.id)));
});

test("admins can delete orphan notes for retryable cleanup", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "contracts", "gone", "notes", "orphan"), {
      text: "orphaned during an interrupted delete",
      createdAt: Timestamp.now(),
      createdBy: EDITOR_UID,
      createdByName: EDITOR_NAME,
    });
  });

  const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore();
  const editorDb = testEnv.authenticatedContext(EDITOR_UID).firestore();

  await assertFails(getDoc(doc(editorDb, "contracts", "gone", "notes", "orphan")));
  await assertSucceeds(deleteDoc(doc(adminDb, "contracts", "gone", "notes", "orphan")));
});
