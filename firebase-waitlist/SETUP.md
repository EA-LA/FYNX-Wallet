# FYNX Wallet waitlist setup — not deployed

## Access architecture

Keep the existing full workspace owner-private:
https://fynx-wallet-preview.cocoa-badge-6319.chatgpt.site

The separate public Site is published at https://fynx-wallet.cocoa-badge-6319.chatgpt.site with signup disabled until Firebase configuration and collection notices are finalized. Its source is `public-site/`. Its entrypoint contains marketing pages and a waitlist only. It does not include the owner's wallet application code. Public login / wallet links lead to the waitlist. The existing Sites owner access policy protects the full workspace; a client-side email comparison is not an access boundary.

## Information needed

1. Firebase project ID and the web app's public configuration from Project settings → General → Your apps → Web app → SDK setup and configuration.
2. Confirm whether the project already has Firestore, Functions, App Check, and an existing functions codebase.
3. App Check web registration with a reCAPTCHA Enterprise site key and the eventual public domain.
4. Confirm the operating entity, verified privacy contact, retention/deletion policy, and availability-update consent text before enabling collection.

The web Firebase config is public identification, not an administrative credential. Do not share service-account private keys or existing project secrets in chat.

## Deployment integration

- Review and merge `functions/index.js` into the existing Functions codebase, or configure this as a distinct codebase. Do not overwrite an existing firebase.json, functions entrypoint, or Firestore rules.
- Install dependencies and commit the resulting lockfile in the chosen Firebase checkout. Confirm supported Node and SDK versions against current Firebase docs before deployment.
- Confirm billing/runtime requirements, App Check registration, and abuse/budget controls.
- Deploy only `joinFynxWalletWaitlist` to the explicitly selected Firebase project.
- Populate public-site/firebase-config.js with the public config, App Check site key, and matching region.
- Keep this Firestore collection inaccessible to client reads and direct writes. The callable function uses the Admin SDK. Review existing rules for overlapping broad allow statements; a narrow deny does not override another matching allow.
- App Check is a useful abuse control, not a full rate limiter. Add project-appropriate quotas / throttling and alerting before opening the form widely.

## Records

The function creates `fynxWalletWaitlist/{sha256(normalizedEmail)}` with email, consent, noticeVersion, source, server timestamp, and waiting status. Repeat requests use the same ID without resetting the original timestamp. No confirmation email is sent. Authorized operators can inspect records in Firebase Console → Firestore.

## Required verification before public collection

Test a valid signup, repeat signup, malformed email, missing consent, missing/invalid App Check token, simulated outage, inaccessible public reads, timestamp/consent recording, and authorized operator access. Finish privacy contact, retention/deletion, and unsubscribe handling. Do not tell a user they joined until the backend returns success.

Until the Firebase public config and App Check key exist, the form remains disabled and clearly says signups are not being collected.
