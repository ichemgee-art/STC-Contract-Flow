# Security

## Access control

STC Contract Flow uses Firebase Authentication plus Firestore Security Rules.

Authentication alone is not enough to access data. The signed-in UID must also have an active `users/{uid}` profile.

## Roles

- `admin`: full contract CRUD.
- `editor`: contract read/create/update, no deletion.

Client applications cannot create or modify user access profiles.

## Secrets

This project does not use the Firebase Admin SDK or a service account in the browser.

Never commit:

- service-account JSON files
- private keys
- server credentials
- passwords

Never expose privileged keys using `NEXT_PUBLIC_`.

## Data integrity

Firestore Rules enforce ordered stages and server-side timestamps. Audit ownership fields are immutable after creation.

## Recommended production hardening

After the first deployment, enable Firebase App Check for the production domain to add another protection layer against unauthorized clients.
