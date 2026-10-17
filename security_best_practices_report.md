# FYNX Wallet security review

Internal implementation review, October 17, 2026. This is not an independent audit or production certification. Scope: published waitlist, owner frontend, the two repository-owned Firebase functions, and visible deployment configuration. Unrelated FYNX services, actual hardware firmware, Google/GitHub internals and incorporation status are outside this review.

## Result

No known critical implementation flaw was found in this review of the owner-only test release. Real-funds/public launch is blocked by the high-priority gates below. Controls implemented include server owner authorization and token-revocation checks, App Check, one-use expiring wallet/WebAuthn challenges, verified signatures, in-memory sessions, DOM text insertion for private data, a restricted script CSP, pinned dependencies, audit retention and Sepolia-only transaction review. The tests distinguish real cloud/cryptographic evidence from local EVM and virtual-authenticator coverage.

## Outstanding findings and release gates

### SEC-001 — High: shared web origin and incomplete header control

- Rule: JS-CSP-001 / cross-origin trust isolation.
- Evidence: `firebase-wallet/functions/config.js:4` fixes the origin to `https://ea-la.github.io`; `config.js:5` uses that host as the WebAuthn RP ID. `owner.html:5` uses a meta CSP. `wallet-src/app.js:78` blocks embedded use in JavaScript.
- Impact: another compromised page under that same origin can share origin privileges. WebAuthn cannot bind a passkey to the `/FYNX-Wallet/` path. Meta CSP cannot deliver `frame-ancestors`; JavaScript frame blocking is not a complete replacement for response headers.
- Required before public real-funds launch: use a dedicated wallet origin with controlled HTTP security headers, assess every script allowed there, and re-enroll passkeys for the selected RP. Keep the current owner-only test gate meanwhile.
- False-positive boundary: no compromise of another GitHub Pages project was established; this is an architectural exposure, not a demonstrated exploit.

### SEC-002 — High release gate: hardware, public-network and recovery acceptance missing

- Rule: signing/recovery assurance specific to this product.
- Evidence: `wallet-src/wallet-client.js:73` sends reviewed native transactions through an external provider; `docs/LAUNCH-READINESS.md` records the device/public-testnet gates.
- Impact: provider/device incompatibility, unsafe recovery instructions or chain-specific behavior could cause failures or user mistakes once real funds are enabled.
- Required: physical Ledger approval/rejection, official test-wallet restoration, matching restored address, public Sepolia send/receive with independent recipient/explorer confirmation, provider/version matrix and independent signing review. Existing automated ECDSA/local EVM checks do not prove those workflows.
- Mitigation now: no seed collection; Sepolia-only chain ID; reviewed recipient/value/fee; 0.01 test ETH limit; no tokens/contracts/swaps/mainnet.

### SEC-003 — Medium: shared Firebase project increases backend blast radius

- Rule: least privilege / authorization boundary.
- Evidence: `firebase-wallet/functions/index.js:11` uses a dedicated runtime identity. `firebase-wallet/SETUP.md` records its database-wide datastore role and self-signing capability. Existing shared Firestore rules retain privileged project-admin access.
- Impact: a runtime compromise or existing project-admin compromise could affect other data/auth users in this shared project. Application collection-name restrictions are not an IAM boundary.
- Fix before public launch: evaluate a dedicated production project/database/auth boundary and minimal operator roles. Preserve unrelated services until an explicit migration is designed and validated.
- Mitigations implemented: dedicated identity, no downloaded service-account keys, auth-read role, scoped function deployment, hardcoded owner UID and limited app collections. No unrelated rules or functions changed.

### SEC-004 — Medium: incident monitoring and restore remain procedural

- Rule: operational detection/recovery.
- Evidence: `firebase-wallet/functions/core.js:73` records expiring audit events; `firebase-wallet/functions/index.js:77` sanitizes errors. `docs/OPERATIONS.md` describes alerts and a restore drill as pending.
- Impact: attacks/outages may go unnoticed; recovery time and completeness are unproven.
- Fix: assign monitored alert recipients, test alert delivery, confirm backup/export retention and perform a restore drill in a separate test environment before public launch.
- Mitigation: error logs, 90-day audit TTL, instance limits, rate limits and a scoped incident/rollback procedure exist. They are not a staffed on-call service.

### SEC-005 — Low: rate limits have platform and shared-address limits

- Rule: abuse resistance.
- Evidence: `firebase-wallet/functions/index.js:22` rate-limits unauthenticated passkey requests by the framework request IP; `core.js:62` uses Firestore counters with expiry. Authenticated requests use UID limits.
- Impact: shared NAT/proxy addresses may be throttled together; distributed actors can exceed a per-address defense and still incur invocation cost.
- Fix: measure actual request-IP behavior under Firebase’s ingress, tune limits and add platform alerts/edge controls before broad public access. Do not treat App Check as a user authorization or DDoS guarantee.

## Changes made during this work

1. Replaced the external owner entry link with real Firebase authentication and a server-gated FYNX workspace (`owner.html`, `firebase-wallet/functions/core.js:14`).
2. Added EIP-4361-shaped server-generated ownership messages, exact stored-message ECDSA verification and atomic single-use challenges (`core.js:29`, `core.js:50`). Wallet proof never authorizes a transfer.
3. Added WebAuthn owner passkeys with exact RP/origin checks, required user verification, short-lived challenges, credential counters and recent-login requirements (`passkeys.js`, `index.js:26`).
4. Kept auth sessions in memory, cleared private DOM rows on sign-out, and invalidated wallet state on account/network changes (`wallet-src/app.js:82`, `wallet-client.js:5`).
5. Kept request-derived private data out of HTML parsing: waitlist rows, passkey rows, messages and transaction details use `textContent`/DOM nodes. Added owner CSP without inline/eval script permission (`owner.html:5`).
6. Added exact-network and value constraints, balance-plus-gas checks, fixed transaction fields, contract-recipient rejection, explicit pending/confirmed/failed states and review consumption before wallet submission (`wallet-client.js`, `app.js:181`).
7. Kept secrets out of Git; bundled locked frontend dependencies; corrected the transitive grpc advisory with a compatible pinned override; added CI verification with pinned action revisions.

## Verification

See `docs/VERIFICATION.md` for live Firestore, signature replay, App Check, passkey, unauthorized-access, public-read and browser evidence. The local test suite exercises actual ECDSA signatures and rejection/race paths. A separate local EVM test verifies a signed, mined transfer and recipient balance increase. Dependency audits report zero known advisories at the checked versions. These results are time-specific and do not replace independent review.

Sources used for the implementation: [Firebase Google authentication](https://firebase.google.com/docs/auth/web/google-signin), [Firebase password authentication](https://firebase.google.com/docs/auth/web/password-auth), [ERC-4361](https://eips.ethereum.org/EIPS/eip-4361), [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193), [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server). Each describes its own component; none certifies this application.
