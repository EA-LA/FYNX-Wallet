# FYNX Wallet launch checklist

Updated 2026-10-17. Operator name supplied: **FYNX finance world inc.**; registration and permissions remain unverified.

FYNX is its own product. No MoonPay partnership or integration is requested. Current access is owner-only on Sepolia; public visitors remain on the waitlist.

**Market plan:** United States first; expand internationally only where the final product is permitted and supported.

This is an evidence-based work list, not a certification or legal opinion. “Implemented” applies only to the described owner/testnet scope.

| Item | Status | Responsible |
| --- | --- | --- |
| One FYNX website and a live waitlist | Implemented within current scope | Engineering |
| Account login and recovery | Needs device / live-network testing | Owner + engineering |
| Separate accounts for every customer | Engineering not finished | Engineering |
| Wallet creation and recovery | Architecture decision required | Owner + security engineering |
| Send, receive and signing | Needs device / live-network testing | Owner + engineering |
| Live assets, balances and transaction history | Engineering not finished | Engineering + infrastructure provider |
| Buy and sell through cards or bank accounts | External input or approval required | Business owner + counsel + engineering |
| Swap assets safely | Engineering not finished | Engineering + approved liquidity/provider arrangements |
| Production security and independent audit | External input or approval required | Owner + engineering + independent reviewer |
| Publish only verified releases | Implemented within current scope | Engineering |
| Monitoring, backups and incident recovery | External input or approval required | Owner + engineering |
| U.S. launch permissions and consumer protections | External input or approval required | Business owner + qualified counsel |
| International availability | External input or approval required | Business owner + counsel + providers |
| Controlled public launch | Blocked until prior gates pass | Owner + engineering + reviewers |

## One FYNX website and a live waitlist

**Current:** GitHub hosts the public site and owner dashboard. Firebase stores confirmed registrations with consent and retention metadata.

**To finish:** Maintain the waitlist until the public-launch gates are approved.

**Responsible:** Engineering. [Evidence and context](../firebase-waitlist/VERIFICATION.md).

## Account login and recovery

**Current:** Google, email/password and passkeys are implemented for the verified owner. Virtual passkey and authorization tests passed.

**To finish:** Test Google, email recovery, passkey creation/sign-in/removal, and browser attestation on actual supported devices. Account recovery does not recover wallet funds.

**Responsible:** Owner + engineering. [Evidence and context](../docs/VERIFICATION.md).

## Separate accounts for every customer

**Current:** Public customer accounts are deliberately closed; the backend authorizes one owner.

**To finish:** Implement per-user profiles, wallet ownership, session revocation, abuse limits and cross-account isolation tests on the selected production infrastructure. Open registration only after approval.

**Responsible:** Engineering. [Evidence and context](../docs/LAUNCH-READINESS.md).

## Wallet creation and recovery

**Current:** Version one connects an existing user-controlled wallet. FYNX does not create a wallet, generate 24 words, or recover signing keys from email.

**To finish:** Prove external-wallet recovery first. If creating a wallet inside FYNX is required, select and independently review key generation, encrypted storage, device/passkey access, backup, export and recovery before implementation. Never ask users for an existing Ledger phrase.

**Responsible:** Owner + security engineering. [Evidence and context](../docs/LAUNCH-READINESS.md).

## Send, receive and signing

**Current:** Owner Sepolia transfers have recipient/fee review, ownership proof, one-use approval and pending/failed/confirmed receipt checks. Local EVM transfers passed.

**To finish:** Record a physical-wallet approval and rejection, public Sepolia transfer, independent recipient balance, insufficient gas, wrong network, disconnect and restored-wallet tests. Mainnet remains disabled.

**Responsible:** Owner + engineering. [Evidence and context](../docs/OWNER-TOOLS-VERIFICATION.md).

## Live assets, balances and transaction history

**Current:** Only native Sepolia test ETH is connected. Dashboard portfolio values and its trading activity are simulated.

**To finish:** Choose initial production chains/assets, dependable RPC/indexing and price data; build accurate balances, token decimals, history, confirmations, replacement/reorg handling and provider-outage recovery. Bitcoin requires separate implementation.

**Responsible:** Engineering + infrastructure provider. [Evidence and context](../README.md).

## Buy and sell through cards or bank accounts

**Current:** No real fiat purchases, sales, bank accounts, card processing or settlement are connected. No MoonPay integration is planned.

**To finish:** Arrange banking, payment processing and liquidity for FYNX's chosen operating model. Then implement quotes/fees, identity checks as required, signed callbacks, idempotent orders, settlement reconciliation, refunds, disputes and outage handling. Test with approved sandbox access before live credentials.

**Responsible:** Business owner + counsel + engineering. [Evidence and context](../docs/LEGAL-OPERATING-REVIEW.md).

## Swap assets safely

**Current:** The dashboard swap is a simulation; no real router or liquidity connection is active.

**To finish:** Implement supported pairs, quote expiry, minimum received, slippage/price impact, exact token approvals, simulation, transaction tracking, failed routes and fee disclosure before enabling swaps.

**Responsible:** Engineering + approved liquidity/provider arrangements. [Evidence and context](../docs/LAUNCH-READINESS.md).

## Production security and independent audit

**Current:** Owner authorization, App Check, challenge replay protection, dependency checks and an internal review are in place. Current GitHub origin and Firebase project are shared with other applications.

**To finish:** Choose a dedicated production origin/backend boundary, configure response headers and secrets/IAM, retest App Check on normal browsers, and commission an independent signing/auth review with fixes and retesting.

**Responsible:** Owner + engineering + independent reviewer. [Evidence and context](../security_best_practices_report.md).

## Publish only verified releases

**Current:** The Pages workflow waits for tests, generated-file checks and dependency audits. Only approved public assets are packaged, with a revision/hash manifest.

**To finish:** Keep deployment gated; use the published manifest and Actions run to identify each release. Backend deployments and rollbacks remain separately scoped.

**Responsible:** Engineering. [Evidence and context](../docs/RELEASE-PROCESS.md).

## Monitoring, backups and incident recovery

**Current:** Audit retention, rate limits, a connection check and an incident procedure exist. There is no tested alert recipient or restore drill.

**To finish:** Assign monitored support/security contacts, set failure/authorization/billing alerts, test delivery, select backup retention and recovery objectives, and restore into an isolated environment. Connection checks are not continuous monitoring.

**Responsible:** Owner + engineering. [Evidence and context](../docs/OPERATIONS.md).

## U.S. launch permissions and consumer protections

**Current:** The owner supplied the name FYNX finance world inc. and selected the United States as the first intended market. Incorporation state, registration details and legal permissions are unverified.

**To finish:** Confirm entity details and the exact custody/payment model. Have counsel determine federal/state licensing, AML/KYC, sanctions, age/eligibility, privacy, consumer terms, disclosures and complaints duties. Finish the required registrations, contracts and controls before serving customers.

**Responsible:** Business owner + qualified counsel. [Evidence and context](../docs/LEGAL-OPERATING-REVIEW.md).

## International availability

**Current:** Worldwide access is a future goal, not current eligibility or authorization.

**To finish:** Approve each country and product separately for local requirements, sanctions, payment/provider coverage, data handling and support. Implement an approved-country policy before expansion; do not promise all countries.

**Responsible:** Business owner + counsel + providers. [Evidence and context](../docs/LEGAL-OPERATING-REVIEW.md).

## Controlled public launch

**Current:** Public customers remain on the waitlist. No launch date, real-funds readiness or flawless operation is claimed.

**To finish:** After the applicable gates pass, run a small approved pilot with limits, staffed support, recovery/incident procedures, reconciliation, measured reliability and a rollback decision. Obtain explicit owner release approval before removing the waitlist.

**Responsible:** Owner + engineering + reviewers. [Evidence and context](../docs/LAUNCH-READINESS.md).

This file is generated from `wallet-src/launch-checklist.json`; update that source and run `npm run build`. The owner dashboard uses the same checklist.
