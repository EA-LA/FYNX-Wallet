# FYNX Wallet

FYNX finance world inc.’s GitHub-owned website and owner-only wallet test workspace.

- **Public website:** https://ea-la.github.io/FYNX-Wallet/
- **Owner workspace:** https://ea-la.github.io/FYNX-Wallet/owner.html
- **Registrations:** owner workspace → Waitlist, or Firebase project `fynx-c7a28` → Firestore → `fynxWalletWaitlist`.

The public waitlist is live. The owner workspace uses Firebase email/Google authentication, device passkeys, and server-side authorization for the existing verified owner. Public wallet accounts remain closed. The selected wallet model keeps recovery phrases and signing keys in an external wallet, including hardware accounts through a compatible browser extension.

## Current wallet scope

One network: **Sepolia testnet**. Standard Ethereum EOA wallets, server-verified ownership signatures, address/balance display, native test ETH transfer review, wallet approval and receipt checks. Per-transfer UI limit: 0.01 test ETH. No mainnet, token transfers, smart-contract wallet support, swaps, fiat payments, embedded seed generation/import, or WalletConnect/mobile sessions are enabled.

A FYNX passkey signs into the account; the connected wallet separately authorizes signatures. Google/email account recovery does not recover wallet keys. Set an email password through Firebase’s reset link if that account currently uses Google only. Do not put recovery words, private keys, tokens or service-account credentials in this repository.

**This is not a completed production wallet.** Physical Ledger signing, public Sepolia send/receive and recovery acceptance, independent security review, legal review, provider approvals and operating drills remain release gates. See [readiness](docs/LAUNCH-READINESS.md) and [verification evidence](docs/VERIFICATION.md).

## Repository ownership and hosting

GitHub Pages serves the website and workspace frontend; Firebase runs the two scoped backend functions. All current frontend/backend source is in this repository. There is no external site-builder login, branding or runtime dependency in these pages. Legacy external-hosting metadata has been removed. The old remote prototype was not updated or deleted.

This repository remains public. Public source code is not an authorization boundary: the backend checks App Check, exact origin, Firebase token revocation, verified email and the configured owner UID. Private data is never included in the static Pages build.

## Structure

| Path | Purpose |
| --- | --- |
| `index.html`, `public-site/` | Public marketing and verified waitlist |
| `owner.html`, `wallet-privacy.html`, `wallet-assets/` | Published FYNX owner frontend and bundled dependencies |
| `wallet-src/` | Editable owner frontend and wallet provider adapter |
| `firebase-wallet/` | Scoped owner API, passkeys, wallet proofs, audit events |
| `firebase-waitlist/` | Existing live waitlist function and verification record |
| `docs/` | Readiness, operations, legal-review brief and test evidence |
| `dist/` | Archived local-only simulation; excluded from Pages |
| `tests/` | Validation, authorization, signatures, races, error and transfer checks |

## Local checks and build

Use Node 22 and npm:

```sh
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix firebase-wallet/functions
npm ci --ignore-scripts --prefix firebase-waitlist/functions
npm run check
npm audit --omit=dev
npm audit --omit=dev --prefix firebase-wallet/functions
```

`npm run build` bundles the owner frontend into `wallet-assets/app.js`. Commit the bundle and lockfiles with its source. CI checks rebuild reproducibility, tests and high-severity advisories. The pinned grpc override fixes a reported Node dependency advisory in Firebase’s unused Firestore package; the owner browser bundle imports Auth, Functions and App Check only.

Static previews can run with `python3 -m http.server 8080`. Live authentication/App Check are configured for the GitHub Pages domain, so local preview alone is not a live acceptance test. Do not disable App Check to make localhost appear production-ready. The archived simulation runs separately with `python3 -m http.server 8081 --directory dist`.

## Deployment

GitHub Pages builds `main` at the repository root. `_config.yml` excludes backend/source/development directories. Verify both the **Verify FYNX Wallet** workflow and **pages build and deployment** after pushing.

Deploy only the intended function:

```sh
firebase deploy --only functions:fynx-wallet-workspace:fynxWalletWorkspace --project fynx-c7a28 --config firebase-wallet/firebase.json
firebase deploy --only functions:fynx-wallet-waitlist:joinFynxWalletWaitlist --project fynx-c7a28 --config firebase-waitlist/firebase.json
```

Do not deploy shared database rules or unrelated functions. See [backend setup](firebase-wallet/SETUP.md), [operations](docs/OPERATIONS.md), [security report](security_best_practices_report.md), [threat model](FYNX-Wallet-threat-model.md), and [legal review brief](docs/LEGAL-OPERATING-REVIEW.md).

No public license is granted by this repository.
