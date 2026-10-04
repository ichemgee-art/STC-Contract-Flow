# STC Contract Flow

A lightweight internal web app for tracking STC contracts from the first company stamp through settlement.

## Workflow

Each contract follows this fixed order:

1. Stamped by STC
2. Stamped by Client
3. Down Payment
4. Supply
5. Settlement

The UI prevents completing a stage before the previous one. Reopening an earlier stage clears the later stages to keep the workflow consistent.

## Core fields

- Sales representative
- Company / client
- Contract type — manual text
- Product / item — manual text
- Created at — automatic
- Created by — automatic
- Stage completion dates — automatic

## Stack

- Next.js 16.3.8
- React 19.3
- Firebase Authentication
- Cloud Firestore
- Firestore Security Rules
- Lucide icons
- TypeScript

## Security model

There is no public sign-up in the UI.

A user needs both:

1. A Firebase Authentication account.
2. An active profile document at `users/{uid}`.

Example profile:

```json
{
  "displayName": "Ahmed Mohamed",
  "email": "ahmed@company.com",
  "role": "admin",
  "active": true
}
```

Supported roles:

- `admin`: read, create, update and delete contracts.
- `editor`: read, create and update contracts; cannot delete.

The Firestore rules also enforce:

- Only active members can read contract data.
- New contracts must start with every workflow stage pending.
- Stages must remain in the correct logical order.
- Stage timestamps must be server timestamps captured when the stage changes.
- Created-by audit fields cannot be changed after creation.
- Users cannot promote themselves or activate their own profile.

> Firebase web configuration values are identifiers, not privileged server secrets. Even so, this project keeps them in `.env.local` for clean environment management. Never put a Firebase Admin service-account private key in client code or in a `NEXT_PUBLIC_` variable.

## Firebase setup

### 1. Create a Firebase project

Open Firebase Console and create a new project for **STC Contract Flow**.

### 2. Register a Web App

In Project Settings, add a Web App and copy the web configuration values.

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Fill in:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

### 3. Enable Authentication

Firebase Console → Authentication → Sign-in method → enable **Email/Password**.

Create the users who should be able to log in. Do not add a public sign-up screen.

### 4. Create Firestore

Firebase Console → Firestore Database → create the default database.

### 5. Deploy the included security rules

The repository includes:

- `firestore.rules`
- `firestore.indexes.json`
- `firebase.json`

Using Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore
```

You can also paste `firestore.rules` into Firestore → Rules and publish them.

### 6. Create the first authorized user profile

After creating a user in Firebase Authentication, copy that user's UID.

In Firestore create:

```text
users
└── <AUTH_USER_UID>
    ├── displayName: "Your Name"
    ├── email: "your@email.com"
    ├── role: "admin"
    └── active: true
```

The document ID must exactly equal the Authentication UID.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Main screens

- Login
- Dashboard
- Contracts register
- New contract
- Contract details / workflow
- Edit contract

The contracts register supports search, status filtering and direct stage updates.

## Firestore structure

```text
users/{uid}

contracts/{contractId}
  salesRepresentative
  companyName
  contractType
  product
  stages
    stampedByUs
    stampedByClient
    downPayment
    supply
    settlement
  stageDates
    stampedByUs
    stampedByClient
    downPayment
    supply
    settlement
  createdAt
  updatedAt
  createdBy
  createdByName
```

## Private contract documents

- Up to five images per contract, enforced by the UI and authenticated API. Existing attachments are retained; contracts already above the limit cannot receive more uploads.
- The document preview sits beside the core contract information, before workflow. Select a thumbnail, then open the large preview for fit-to-screen viewing, zoom controls, wheel/pinch zoom and bounded panning after zoom. Escape closes the viewer; keyboard `+`, `-`, and `0` control zoom.
- Image bytes are cached for 24 hours in user-scoped CacheStorage entries keyed by the authenticated API path. Tokens are never persisted in cache entries. Attachment listings remain authenticated and uncached. Expired images revalidate with ETag/304; unavailable storage falls back to authenticated downloads.
- Deletion removes the cached image. Logout clears all application image caches, and account changes remove other users' caches. Generation guards prevent in-flight downloads from repopulating caches after deletion or logout, including across tabs.
- API image responses use `private, no-store`, preventing a second unmanaged HTTP cache from retaining private bytes. The application cache owns image reuse and cleanup.
- Uploads use a conditional-write lease in private Blob storage to serialize the count check and upload across Vercel instances. The lease expires after two minutes and storage operations are bounded below that duration. A concurrent upload returns HTTP 409 and can be retried. Firebase Auth, Firestore permissions and workflow are unchanged.

## Deployment configuration

The app can be deployed to Vercel. Add the six `NEXT_PUBLIC_FIREBASE_...` environment variables in the Vercel project settings before the production deployment. Redeploy after changing any `NEXT_PUBLIC_*` value so the new client configuration is included in the build.
