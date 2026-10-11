# Contract audit activation (two-phase deployment)

This feature is **disabled** until `NEXT_PUBLIC_CONTRACT_AUDIT_ENABLED=true` is added in the production Vercel environment. Merely merging this code does NOT activate audit logging on the live Firebase project.

## What it covers
- New contract creation
- Contract details changes
- Ordered workflow stage progress/reopen
- Legacy contract number assignment
- Each event stores verified actor UID/display name, Firestore server timestamp, and old/new contract summaries.
- Firestore rules validate the event against the contract's state in the **same atomic transaction** and deny event updates/deletions.
- Audited contracts require a *new* linked audit event on every subsequent update.
- Admins may view the last 100 events on each contract page.

## What it does NOT cover yet
- Contracts created/edited by old clients before audit activation are not retroactively logged.
- Old, unaudited contracts may still receive legacy-mode writes until migration/enforcement is complete.
- Changes to notes and individual attachment uploads/downloads are not yet in the Firestore audit collection.
- Contract delete intent and success are independently journaled to **private Vercel Blob** by the server. That journal is not shown in the contract's Firestore timeline.
- No backup is created by enabling this feature.

## Required safe rollout — DO NOT skip
1. Confirm completed Firestore + independent private Blob backups; drill a restore in an isolated project.
2. Connect authorized Firebase management tooling and **inspect actually deployed rules**. Do not assume GitHub's rules are live.
3. Run `npm run test:rules` against the **candidate** rules, plus `npm run e2e` against emulators (playwright fixture enables the audit flag there).
4. Deploy the updated `firestore.rules`/indexes only after checking production-compatible behavior. Verify normal creates and updates with current production client (flag still OFF).
5. Configure `NEXT_PUBLIC_CONTRACT_AUDIT_ENABLED=true` **only in Production** and redeploy. Verify creation, edits, stage reopens, admin audit timeline and denial of an unaudited update to an audited contract.
6. Verify production audit events on server; confirm actor names and timestamps, and create a monitoring alert for audit write failures.
7. Decide when to enforce audit on all legacy contracts and migrate existing ones, then remove legacy compatibility. This separate later rollout must preserve current contract numbering.

## Rollback
- Turn the feature flag OFF in Vercel Production and redeploy **only if current rules permit legacy writes**. Do not blindly revert the Firestore rules after audited records exist; that could invalidate data or bypass required logging.
- Rollbacks need security review and testing with existing audited records.

## Required management confirmation
The exact production Firebase project, deployed rule revision and latest backup timestamp must be verified before setting the flag. Do not paste secrets into issues or chat.
