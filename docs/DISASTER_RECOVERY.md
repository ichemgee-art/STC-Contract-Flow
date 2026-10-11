# STC Contract Flow — disaster recovery runbook (production)

Status: **procedures only**. This document does not mean backups exist or are enabled.

## Hard safety constraints
- Do not run restore/import against production during a smoke test. Use a separate staging project.
- Firestore backups are **not** Vercel Blob attachment backups.
- Never copy service-account keys, production credentials, or user documents into this repository or CI artifacts.
- Record recovery point objective (RPO), recovery time objective (RTO), owner, and every restore drill.
- Require a verified restore before claiming backup readiness.

## 1. Verify Firestore backup schedules (read-only)

In a trusted Google Cloud terminal with the correct account/project:

```bash
gcloud firestore backups schedules list --database='(default)' --project='<PRODUCTION_PROJECT_ID>'
gcloud firestore backups list --project='<PRODUCTION_PROJECT_ID>'
```

Verify each backup's state, completion date, location and retention. A configured schedule without a successfully completed backup is not a verified recovery point.

## 2. Enable daily native Firestore backups (Cloud project admin)

Only if none is configured, and **after** verifying the target project and billing:

```bash
gcloud firestore backups schedules create \
  --database='(default)' \
  --recurrence=daily \
  --retention=7d \
  --project='<PRODUCTION_PROJECT_ID>'
```

Seven days is an initial example: choose retention with STC management. Also consider PITR for accidental data changes; it is a separate paid feature with its own window.

## 3. Independently back up private contract attachments

Vercel Blob objects under `contracts/<contractId>/` are not part of Firestore backups. Set up a separate, privileged, scheduled inventory-and-copy job to a private destination with versioning, lifecycle policy, least-privilege access and monitoring. Do **not** export permanent public URLs, attach the objects to GitHub Actions artifacts or reuse an unauthenticated public bucket.

A recovery drill must verify byte-for-byte integrity of a sample PDF, image, and their Firestore contract association. Do not delete the only surviving Blob originals during a test.

## 4. Quarterly restore drill (staging only)

1. Obtain an actual, completed Firestore backup identifier.
2. Restore it to a **separate non-production database/project** with distinct Firebase credentials.
3. Validate counts, sample contract IDs, contract numbers/reservations, stages and notes.
4. Restore sample Blob objects from the separate attachment backup to a **different private store**, and verify previews/downloads.
5. Confirm the staging app cannot access production resources.
6. Log backup ID, restore time, counts, sample results and failures.

## 5. Firestore Rules production deployment

Once authenticated Firebase access is available:
- Read currently deployed rules and compare with tracked `firestore.rules`.
- Test against Firebase emulators (`npm run test:rules`).
- Confirm the compatible application is live, then deploy `firestore.rules` and `firestore.indexes.json` in a controlled rollout.
- Smoke test contract creation, stage transitions, numbering, notes, editor permissions and delete+QR expiry.
- Do **not** remove the old numbering fallback until the verified rules are live.

References:
- https://cloud.google.com/firestore/docs/backups
- https://firebase.google.com/docs/firestore/manage-data/export-import
- https://firebase.google.com/docs/firestore/use-pitr

## Recovery readiness

- [ ] Production project verified
- [ ] Last successful Firestore backup time inspected
- [ ] Blob object copies and integrity test verified
- [ ] Restore drill in isolated staging passed
- [ ] Rules in Firebase checked against repo
- [ ] Backup alerting and accountable owner assigned
