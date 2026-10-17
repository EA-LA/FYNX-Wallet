# FYNX Wallet waitlist operations

The public frontend is https://ea-la.github.io/FYNX-Wallet/. Work in this repository; the existing ChatGPT Sites projects are separate and must not be redeployed by this workflow.

## Deployment scope

- Project: `fynx-c7a28` (number `1011050657868`).
- Web app: `FYNX - Wallet`, `1:1011050657868:web:2b8f02ebdebf8b3bb05ce9`.
- Callable: `joinFynxWalletWaitlist`, second generation, Node 22, `us-central1`.
- Dedicated codebase: `fynx-wallet-waitlist`.
- `firebase.json` contains Functions only. It must not acquire project-wide rules, hosting, or unrelated function configuration.

From the repository root:

```sh
npm ci --prefix firebase-waitlist/functions
node tests/waitlist-check.cjs
node tests/waitlist-ui-check.cjs
firebase deploy --only functions:fynx-wallet-waitlist:joinFynxWalletWaitlist \
  --project fynx-c7a28 --config firebase-waitlist/firebase.json
```

Use an authenticated Firebase CLI account. Never commit tokens, service-account JSON, debug App Check tokens, browser session storage, or downloaded project configuration containing credentials.

## App Check and access

The reCAPTCHA Enterprise score key named `FYNX Wallet GitHub Pages` allows only `ea-la.github.io`. It uses the default App Check minimum score of 0.5 and a one-hour token lifetime. The public site key belongs in `public-site/firebase-config.js`; it is not a secret. Do not add localhost to the production key or relax enforcement for testing.

The function enforces App Check and also checks the exact Wallet app ID, so a token from another Firebase app in the same project is rejected. Browser CORS allows `https://ea-la.github.io`; CORS is not the authorization boundary. Project-wide App Check enforcement for other services is unchanged.

The existing Firestore rules permit only authorized administrators on otherwise unmatched collections, including `fynxWalletWaitlist`. No rules deployment is necessary. A narrow deny would not override a broad matching allow: recheck the effective rules if the project rules change in future.

## Registration records

View registrations in [Firebase Console → Firestore → Data](https://console.firebase.google.com/project/fynx-c7a28/firestore/databases/-default-/data), collection `fynxWalletWaitlist`.

Documents use `sha256(trimmed, lowercase email)` as their ID. A Firestore transaction creates a record only if it is absent; concurrent and repeated requests cannot create duplicate rows or reset original values. The response is identical for new and existing registrations to avoid disclosing list membership.

Stored fields:

- `email`: normalized address.
- `consent`: `true`.
- `noticeVersion`: `prelaunch-v2`.
- `createdAt`: Firestore server timestamp.
- `source`: `fynx-wallet-public`, set by the server.
- `status`: `waiting`, set by the server.
- `expiresAt`: 365 days after registration; a collection-specific Firestore TTL policy handles expiry.

TTL deletion is normally completed within 24 hours after expiry. Restricted project backups follow their existing lifecycle. No other collection's retention policy is changed.

## Operator workflow

The privacy contact is FYNX's published team address, `fynxteam5@gmail.com`. Monitor it for requests with subject **FYNX Wallet waitlist removal**. Verify the request comes from the registered address, then find the normalized email in the collection and delete that document. Process removals before sending any future availability updates. Exclude expired records and test addresses. Any future email campaign must provide an unsubscribe mechanism; this implementation does not send emails or connect an email-marketing service.

Public wallet/login routes continue to show the waitlist. `owner.html` keeps the existing owner-private workspace link. Do not publish `dist/` through GitHub Pages or change the owner's hosting policy.

## Release verification

Keep `waitlistBackendReady` false until the deployed function, real App Check registration, actual Firestore write, duplicate handling, validation, failure UI, and denied public reads/writes have been checked. The UI must await `{ ok: true }` from the callable; local validation or a network request alone is not confirmation.

Run the unit checks above and `node tests/demo-check.cjs`. For a live browser test, use the production GitHub Pages origin and the real reCAPTCHA provider. Read the resulting test document using operator credentials and check every stored field and the original timestamp after a duplicate submission. Test invalid email, missing consent, missing/invalid App Check, and a simulated 503 response. Database-failure injection in the unit tests must produce an error, never `{ ok: true }`.

Confirm GitHub Pages deployment for the pushed commit and repeat the signup through the published site. See `VERIFICATION.md` for the release evidence and limitations.
