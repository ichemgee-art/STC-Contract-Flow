# Security

## Trust model

STC Contract Flow uses Firebase Authentication, Firestore Security Rules, authenticated Next.js API routes, and private Vercel Blob storage.

A Firebase Auth account alone is not sufficient to read application data. The signed-in UID must also have an existing `users/{uid}` profile with `active: true` and an allowed role.

Privileged API routes validate the Firebase ID token with Firebase Identity Toolkit, then re-read the user's active role from Firestore before acting.

## Roles

- `admin`: contract read/create/update/delete plus administrative operations.
- `editor`: contract read/create/update, workflow, notes, and attachments; no contract deletion or legacy numbering.

Client applications cannot create, update, or delete `users/{uid}` access profiles.

## Immediate user deactivation

When removing access, set `users/{uid}.active = false` in addition to disabling/revoking the Firebase Auth account.

Firestore Rules evaluate the profile on every protected data request, so the Firestore profile is the immediate kill switch. The web app also listens to that profile in realtime and clears cached private attachments when access is removed.

## Contract numbering integrity

New contract numbers are allocated in one Firestore transaction using:

- `contractCounters/{year}`
- `contractNumberReservations/{contractNumber}`
- `contracts/{contractId}`

The reservation is immutable and the hardened rules require the counter, reservation, and contract to agree. Deleted contract numbers are not reused.

The business year is based on `Africa/Cairo`.

## Attachments

Contract attachments are stored in Vercel Blob with `access: "private"` and are retrieved through authenticated application routes.

The upload API enforces file count, size, supported content signatures, image dimensions, expected MIME type, path ownership, and rejects common private image metadata containers.

Temporary QR links use encrypted authenticated tokens, expire after 30 minutes, and are invalidated by a private deletion tombstone when a contract is deleted through the application.

## Secrets

Never commit:

- service-account JSON files
- private keys
- Vercel Blob tokens
- attachment-share secrets
- passwords or production credentials

Only public Firebase web configuration may use `NEXT_PUBLIC_`.

`ATTACHMENT_SHARE_SECRET` must be at least 32 characters and server-only. During rotation, the prior value can temporarily be supplied as `ATTACHMENT_SHARE_SECRET_PREVIOUS` so already-issued 30-minute links remain valid.

## Numbering rule deployment prerequisite

The application uses only the atomic reservation transaction. A permission denial
is returned to the caller; it is never retried using the older counter shape.

The hardened `firestore.rules` must be live before deploying this application.
The production rules for `stc-contract-flow` were checked against the repository
on 2026-10-11. Recheck the target project whenever deploying elsewhere.

For already-numbered legacy contracts, preserve the contract identifier and the
counter high-water mark. Reconcile missing reservation documents through a
privileged, reviewed maintenance operation; do not reset a counter to the count
of surviving contracts. Gaps may represent previously deleted numbers. A missing
legacy reservation alone is not evidence of a duplicate number.

## Environment isolation

Production uses Firebase `stc-contract-flow` and private Blob store `store_beAq4JiSWexxCh86`. Preview uses Firebase `stc-contract-flow-preview` and private Blob store `store_RAYJhxZ46nLqTZCB`. Scope every Firebase configuration variable, Blob token, and attachment-share secret to its environment. Never copy production contracts, files, or user credentials into Preview.

`next.config.ts` calls `assertPreviewIsolation` before building. Vercel Preview builds fail unless all Firebase identifiers and `BLOB_STORE_ID` match the dedicated Preview resources, a Blob token is present, and the share secret has at least 32 characters. The guard does not introspect opaque API keys or tokens: also verify the Blob environment variable's store binding in Vercel and generate independent secrets. Local emulator CI and Production builds are unaffected.

Changing environment variables does not rewrite previously built deployments. Retire or block old Preview deployment URLs and their aliases before considering an environment migration complete. Keep Preview deployments protected by Vercel Authentication.

Preview deployments should remain protected while they can reach any business data.

## Backups and recovery

Enable and document Firestore Point-in-Time Recovery or scheduled exports appropriate to the production plan. Define retention and restore testing for contract data.

Blob attachments need a separate recovery/retention policy because Firestore backups do not contain Vercel Blob objects.

## App Check and abuse controls

Enable Firebase App Check for the production web app after registering the production domain and verifying that legitimate traffic is accepted.

Use Vercel Firewall rate limiting for sensitive or public API routes. Stage new firewall rules in log mode first, review real traffic, then enforce.

## CI security gates

Pull requests run:

- lint
- TypeScript typecheck
- production dependency audit
- Next.js build
- adversarial Firestore Rules tests
- Playwright E2E tests against isolated Firebase emulators

Dependencies are locked with `package-lock.json` and installed with `npm ci`.
