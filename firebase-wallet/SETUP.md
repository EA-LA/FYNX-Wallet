# Owner workspace backend

Project: `fynx-c7a28`. Region: `us-central1`. Function: `fynxWalletWorkspace`. Codebase: `fynx-wallet-workspace`.

This codebase is separate from the live waitlist function. Deploy with:

```sh
firebase deploy --only functions:fynx-wallet-workspace:fynxWalletWorkspace --project fynx-c7a28 --config firebase-wallet/firebase.json
```

The existing Firebase connection is used. No private credential files belong in source. Public web identifiers live in `public-site/firebase-config.js`; the server’s owner UID, app ID, origin, chain ID, RP ID and runtime identity live in `functions/config.js`. Changing an owner UID is a privileged operator change, not a client setting.

## Deployed controls

- Dedicated runtime service account `fynx-wallet-runtime@fynx-c7a28.iam.gserviceaccount.com`.
- Project roles: `roles/datastore.user` and `roles/firebaseauth.viewer`.
- `roles/iam.serviceAccountTokenCreator` on that service account **for itself**, allowing Firebase custom tokens after verified WebAuthn authentication. No service-account private key was created.
- Google/Email providers already existed and were preserved. Added `ea-la.github.io` to Firebase Authentication authorized domains while preserving every prior domain and sign-in setting.
- Firebase App Check requires the Wallet app ID and the existing domain-restricted reCAPTCHA Enterprise setup.
- Server owner authorization rechecks Firebase ID token revocation and verified email. Passkey security changes and waitlist deletion require a login within five minutes.
- 120 owner operations per 15 minutes; unauthenticated passkey entry points allow 30 requests per hashed request-IP window. Maximum three function instances. These controls reduce abuse but do not constitute a comprehensive DDoS/billing defense.
- `fynxWalletChallenges`: single-use transactionally consumed challenges; TTL `expiresAt`.
- `fynxWalletRateLimits`: 24-hour expiry and TTL.
- `fynxWalletAudit`: 90-day expiry and TTL.
- `fynxWalletProfiles` and `fynxWalletPasskeys`: active owner records, removed on unlink / passkey removal.
- Existing shared Firestore rules deny public reads/writes of these collections and permit existing project administrators. Rules were inspected and preserved; they were not redeployed.

## Important boundaries

Firestore IAM access is database-wide and the Firebase Auth project is shared. A compromise of this backend or existing project administrators can affect more than this app. The code restricts its own paths and users; that does not replace project isolation. Review a dedicated production project before handling public accounts.

GitHub Pages project paths under `ea-la.github.io` share one web origin. WebAuthn RP/origin checks cannot isolate `/FYNX-Wallet/` from another page on that same origin. The current owner test release uses this origin; evaluate an independently controlled wallet subdomain before public release. A domain change requires App Check/Auth/CSP/RP configuration updates and passkey re-enrollment.

The owner page has a strict script CSP and blocks embedded operation in JavaScript. GitHub Pages does not provide repository-level custom response headers; meta CSP cannot enforce `frame-ancestors`. A production wallet origin should support response headers and monitoring.

## Verification and maintenance

See `../docs/VERIFICATION.md`. Tests use temporary credentials and an ephemeral signer outside the repository source. An operator-authorized short-lived Firebase token bootstraps owner testing; this does not establish that a human completed Google login or a hardware recovery ceremony. A virtual WebAuthn authenticator is distinguished from a physical device.

Use Cloud Logging for this function, the Firebase Authentication console for user revocation, and Firestore for approved operator review. Follow `../docs/OPERATIONS.md` for incidents and privacy requests. Never log or export passkey private material, auth tokens, recovery words or wallet private keys.
