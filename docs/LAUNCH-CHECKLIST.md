# FYNX Wallet launch checklist

Updated 2026-10-20. Operator name supplied: **FYNX finance world inc.**; registration and permissions remain unverified.

FYNX is its own product. Owner crypto tools support Ethereum Sepolia and Base Sepolia test transactions, plus read-only Base mainnet. Public access stays on the waitlist. No MoonPay integration is planned.

**Market plan:** United States first; expand internationally only where the final product is permitted and supported.

This is an evidence-based work list, not a certification or legal opinion. “Implemented” applies only to the described owner/testnet scope.

| Item | Status | Responsible |
| --- | --- | --- |
| One FYNX website and a live waitlist | Implemented within current scope | Engineering |
| Account login and recovery | Needs device / live-network testing | Owner + engineering |
| Separate accounts for every customer | Engineering not finished | Engineering |
| Wallet creation and recovery | Architecture decision required | Owner + security engineering |
| Send, receive and signing | Needs device / live-network testing | Owner + engineering |
| Live assets, balances and transaction history | Needs device / live-network testing | Engineering + infrastructure provider |
| Buy and sell through cards or bank accounts | External input or approval required | Business owner + counsel + engineering |
| Swap assets safely | Needs device / live-network testing | Engineering + approved liquidity/provider arrangements |
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

**Current:** ETH and canonical USDC test transfers have address/network/fee review, token simulation, bounded amounts, one-use approval and receipt lookup. Receive QR codes include the chain and asset. Real contracts executed successfully in an isolated Base Sepolia fork.

**To finish:** Record physical-wallet approval/rejection, public testnet transfers and independent recipient balances. Test recovery and supported browsers/devices. Mainnet signing remains disabled.

**Responsible:** Owner + engineering. [Evidence and context](../docs/CRYPTO-TOOLS-VERIFICATION.md).

## Live assets, balances and transaction history

**Current:** Live ETH/USDC balances on Ethereum Sepolia, Base Sepolia and read-only Base. Session transaction journal and hash lookup are implemented. The separate dashboard remains a simulation.

**To finish:** Add complete indexed transaction history, reliable production RPC/failover, replacement/reorg handling and market prices. Bitcoin and Solana are not implemented.

**Responsible:** Engineering + infrastructure provider. [Evidence and context](../docs/CRYPTO-TOOLS-VERIFICATION.md).

## Buy and sell through cards or bank accounts

**Current:** A server-only Transak sandbox checkout and order-status adapter is implemented with fixed hosts, verified-wallet binding and private secrets. No partner credentials are supplied; it fails closed. No live payments are enabled.

**To finish:** Create a provider sandbox account, enable BUY/SELL, arrange required IP allowlisting and supply staging credentials in Secret Manager. Test purchases, sales, cancellations, refunds and reconciliation. Business approval, production credentials and legal review are separate gates.

**Responsible:** Business owner + counsel + engineering. [Evidence and context](../docs/PROVIDER-SETUP.md).

## Swap assets safely

**Current:** Direct ETH/USDC Uniswap v3 swaps on Base Sepolia: bounded slippage/price impact, one-minute quotes, exact/reset/revoke approvals, simulation and on-chain minimum output. Base mainnet quotes are read-only. Local-fork swaps passed in both directions.

**To finish:** Verify public-testnet and hardware-wallet execution; independently review the pinned contracts, pricing/manipulation risks, routing, fee handling and production release policy. Mainnet swaps stay disabled.

**Responsible:** Engineering + approved liquidity/provider arrangements. [Evidence and context](../docs/CRYPTO-TOOLS-VERIFICATION.md).

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
