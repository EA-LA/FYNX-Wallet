# FYNX Wallet

An interactive FYNX Wallet product concept with a white interface, soft shadows, rounded panels, and responsive layouts.

## Preview

https://fynx-wallet-preview.cocoa-badge-6319.chatgpt.site

The hosted preview is private to the Site owner. GitHub access does not automatically grant access to the preview.

## Run locally

No installation or build step is required. Serve the static directory:

```sh
python3 -m http.server 8080 --directory dist
```

Open http://localhost:8080. The app uses hash-based routes, so no server rewrite rules are required.

## Project structure

- `dist/index.html`: static entrypoint, navigation, and application container
- `dist/styles.css`: responsive layout, typography, and visual design
- `dist/app.js`: pages, local demo state, transaction simulations, and interface behavior
- `.openai/hosting.json`: existing ChatGPT Sites project identity and static hosting configuration

`dist/` is the actual editable source for this buildless project. It must remain tracked.

## Included screens and flows

- Product homepage and wallet dashboard
- Asset list, search, individual holdings, and allocation
- Buy and sell with illustrative quotes and fee review
- Same-network ETH / USDC swap simulation
- Send preview with balance checks and a receive-screen concept
- Successful and failed simulation outcomes
- Transaction history, type/status filters, detail pages, and CSV export
- Local profile/preferences, connection status, and demo reset
- Security information, network coverage, support drafts, and preview legal notices
- Founder build guide with provider requirements, architecture, cost categories, revenue arithmetic, and a local planning checklist

## What is connected?

No live wallet, payment, authentication, price, swap, or blockchain provider is connected. All balances, prices, fees, and transactions are illustrative. Receive identifiers are intentionally invalid. Support forms prepare drafts locally and send nothing.

Demo state is stored in browser local storage under `fynx-wallet-v2`. It is not a financial ledger, encrypted storage, or a login account. Reset it from Settings → Data.

Google Fonts is requested for typography; system fonts remain as fallbacks.

## Before production

The in-app **Before launch** guide documents the proposed integration work. The starting scope proposed is a user-controlled wallet on one EVM network, ETH + USDC, provider-hosted buy/sell, and same-network swaps.

Required work includes wallet signing and recovery, provider approvals, live quotes, real authentication, a backend/database, webhook verification, idempotent order processing, network monitoring, independent security review, and legal/operating review for the actual business model and launch markets. Bitcoin requires separately validated wallet infrastructure.

Never place provider secrets, signing keys, private keys, recovery phrases, or customer identity documents in the repository or frontend.

## Validation and limitations

JavaScript syntax, page templates, quote arithmetic, simulated balance changes, failure invariants, invalid input, and text escaping were checked during development. Visual browser testing and real-provider end-to-end testing have not been completed.

## GitHub and Sites synchronization

A GitHub source copy does not by itself establish automatic synchronization with ChatGPT Sites. Changes must be committed and pushed to GitHub; Sites deployments use their own source and publication workflow until an explicit integration is configured.

No public license is granted by this repository.

## Public waitlist website

Public website: https://fynx-wallet.cocoa-badge-6319.chatgpt.site

`public-site/` is the marketing and waitlist frontend. Login and wallet links lead to the waitlist. It is published separately from the owner workspace. `deployments/public-hosting.json` records its Sites identity and static hosting configuration; that separate deployment uses `public-site/` files copied into its own `dist/` directory. Do not replace the owner project identity with the public one.

`firebase-waitlist/` contains a proposed App Check-protected Firebase callable function and integration instructions. Firebase configuration and backend deployment are still required; no signup is currently collected. The full workspace remains owner-private on ChatGPT Sites.

Repository visibility and hosted-site access are independent. The source contains demo interfaces, not a live wallet or protected customer records. Do not publish the owner `dist/` as your public production wallet.

## Checks

```sh
node --check dist/app.js
node --check public-site/app.js
node --check firebase-waitlist/functions/index.js
node tests/demo-check.cjs
node tests/waitlist-check.cjs
```

The tests exercise templates and logic with lightweight mocks; they do not replace browser, Firebase emulator, or live-provider tests.

## GitHub Pages

Public site: https://ea-la.github.io/FYNX-Wallet/

GitHub Pages uses `main` → `/ (root)`. Root `index.html` loads the public frontend from `public-site/`; `_config.yml` excludes development and owner-workspace directories from the Pages build. Keep the root entrypoint in sync if public-site/index.html changes. Backend Firebase Functions must be deployed separately.
