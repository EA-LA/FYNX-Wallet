# FYNX Wallet launch checklist

Updated 2026-11-10. Operator name supplied: **FYNX finance world inc.**; registration and permissions remain unverified.

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

**Steps (2 of 4 recorded as done):**

- [x] Engineering: Public website and waitlist published from GitHub Pages.
- [x] Engineering: Registrations saved with consent, notice version and a 365-day expiry.
- [ ] You: On your phone, open the public website, join the waitlist with a test address ending in @example.com and confirm the success message. _(about 5 min; needs: phone or iPad)_
- [ ] You: In the Waitlist tab, find that test address, check its consent details, then remove it. _(about 5 min)_ _(after: On your phone, open the public website, join the waitlist with a test address ending in…)_

## Account login and recovery

**Current:** Google, email/password and passkeys are implemented for the verified owner. Virtual passkey and authorization tests passed.

**To finish:** Test Google, email recovery, passkey creation/sign-in/removal, and browser attestation on actual supported devices. Account recovery does not recover wallet funds.

**Responsible:** Owner + engineering. [Evidence and context](../docs/VERIFICATION.md).

**Steps (1 of 9 recorded as done):**

- [x] Engineering: Google, email/password and passkey sign-in built; virtual passkey and owner-only authorization tests pass.
- [ ] You: Sign in with Google in a normal (not private) desktop browser. Note the browser and version. _(about 3 min)_
- [ ] You: Use “Set or reset an email password”, open the email, set a password, then sign in with email and password. _(about 8 min; needs: email inbox)_
- [ ] You: Account security → Add a passkey on this computer and confirm it appears in the list. _(about 3 min)_
- [ ] You: Sign out, then sign back in with “Use a passkey”. _(about 3 min)_ _(after: Account security → Add a passkey on this computer and confirm it appears in the list)_
- [ ] You: Add a passkey on your iPhone or iPad in Safari and sign in with it. _(about 8 min; needs: phone or iPad)_
- [ ] You: Remove one passkey and confirm it can no longer be used to sign in. _(about 5 min)_ _(after: Account security → Add a passkey on this computer and confirm it appears in the list)_
- [ ] You: Leave the workspace untouched for 15 minutes and confirm it signs you out. _(about 16 min)_
- [ ] You: Try to sign in with a Google account that is not the owner and confirm access is refused. _(about 4 min; needs: second Google account)_

## Separate accounts for every customer

**Current:** Public customer accounts are deliberately closed; the backend authorizes one owner.

**To finish:** Implement per-user profiles, wallet ownership, session revocation, abuse limits and cross-account isolation tests on the selected production infrastructure. Open registration only after approval.

**Responsible:** Engineering. [Evidence and context](../docs/LAUNCH-READINESS.md).

**Steps (0 of 4 recorded as done):**

- [ ] Engineering: Per-customer profiles and wallet ownership records.
- [ ] Engineering: Cross-account isolation tests: one customer can never read or act on another’s data. _(after: Per-customer profiles and wallet ownership records)_
- [ ] Engineering: Session revocation, rate limits and abuse controls for public sign-up.
- [ ] You: Approve opening registration only after the security, legal and pilot gates pass. _(after: Cross-account isolation tests: one customer can never read or act on another’s data; Session revocation, rate limits and abuse controls for public sign-up; Production security and independent audit → Independent review completed, issues fixed and retested; U.S. launch permissions and consumer protections → Complete the registrations and contracts counsel requires; Controlled public launch → Give final written approval to remove the waitlist for the pilot group)_

## Wallet creation and recovery

**Current:** Version one connects an existing user-controlled wallet. FYNX does not create a wallet, generate 24 words, or recover signing keys from email.

**To finish:** Prove external-wallet recovery first. If creating a wallet inside FYNX is required, select and independently review key generation, encrypted storage, device/passkey access, backup, export and recovery before implementation. Never ask users for an existing Ledger phrase.

**Responsible:** Owner + security engineering. [Evidence and context](../docs/LAUNCH-READINESS.md).

**Steps (1 of 4 recorded as done):**

- [x] Engineering: Version one connects an existing wallet; FYNX never creates, stores or asks for recovery words.
- [ ] You: Decide: is connecting your own wallet (for example MetaMask or Ledger) enough for launch, or must FYNX create wallets inside the app? Write your decision in the note.
- [ ] You: Restore a test wallet from its recovery phrase in that wallet’s own app (never on FYNX) and confirm the same address appears in Crypto tools. _(about 15 min; needs: test wallet)_
- [ ] Outside party: Only if FYNX must create wallets: independent review of key generation, encrypted storage, backup, export and recovery before any build. _(after: Decide: is connecting your own wallet (for example MetaMask or Ledger) enough for launch,…)_

## Send, receive and signing

**Current:** ETH and canonical USDC test transfers have address/network/fee review, token simulation, bounded amounts, one-use approval and receipt lookup. Receive QR codes include the chain and asset. Real contracts executed successfully in an isolated Base Sepolia fork.

**To finish:** Record physical-wallet approval/rejection, public testnet transfers and independent recipient balances. Test recovery and supported browsers/devices. Mainnet signing remains disabled.

**Responsible:** Owner + engineering. [Evidence and context](../docs/CRYPTO-TOOLS-VERIFICATION.md).

**Steps (2 of 11 recorded as done):**

- [x] Engineering: ETH and USDC transfers with review, simulation, limits and receipts passed on an isolated Base Sepolia copy.
- [x] Engineering: Sending on Base mainnet is blocked; only test networks can sign.
- [ ] You: In a wallet that holds no real money, get free Base Sepolia test ETH from a faucet listed in Base’s documentation. _(about 15 min; needs: test wallet)_
- [ ] You: Crypto tools → Base Sepolia → Connect wallet → Review ownership message → approve. Confirm the wallet shows as verified. _(about 5 min; needs: test wallet)_
- [ ] You: Repeat, but reject the ownership signature in the wallet. Confirm the page says nothing was approved. _(about 3 min; needs: test wallet)_ _(after: Crypto tools → Base Sepolia → Connect wallet → Review ownership message → approve)_
- [ ] You: Scan the Receive QR code with a phone wallet and confirm the address and network match exactly. _(about 5 min; needs: test wallet, phone or iPad)_
- [ ] You: Send 0.001 test ETH to a second address you control. Note the transaction ID and confirm the recipient balance on the Base Sepolia block explorer. _(about 8 min; needs: test wallet)_ _(after: In a wallet that holds no real money, get free Base Sepolia test ETH from a faucet listed…; Crypto tools → Base Sepolia → Connect wallet → Review ownership message → approve)_
- [ ] You: Send 1 test USDC the same way (test USDC comes from Circle’s testnet faucet). _(about 10 min; needs: test wallet)_ _(after: Send 0.001 test ETH to a second address you control)_
- [ ] You: Start a transfer and reject it in the wallet. Confirm nothing was sent. _(about 3 min; needs: test wallet)_ _(after: Crypto tools → Base Sepolia → Connect wallet → Review ownership message → approve)_
- [ ] You: Repeat one transfer with a Ledger, approving on the device screen. _(about 10 min; needs: Ledger)_ _(after: Send 0.001 test ETH to a second address you control)_
- [ ] You: Switch to Base mainnet and confirm sending and swapping stay disabled. _(about 3 min; needs: test wallet)_

## Live assets, balances and transaction history

**Current:** Live ETH/USDC balances on Ethereum Sepolia, Base Sepolia and read-only Base. Session transaction journal and hash lookup are implemented, and each check reports confirmations and detects replaced (sped-up or cancelled), dropped and reorganised transactions. The separate dashboard remains a simulation.

**To finish:** Add complete indexed transaction history, reliable production RPC/failover and market prices. Bitcoin and Solana are not implemented.

**Responsible:** Engineering + infrastructure provider. [Evidence and context](../docs/CRYPTO-TOOLS-VERIFICATION.md).

**Steps (3 of 8 recorded as done):**

- [x] Engineering: Live ETH and USDC balances on Ethereum Sepolia, Base Sepolia and Base (read-only).
- [x] Engineering: Session transaction list and transaction lookup.
- [ ] You: Compare the balances shown in Crypto tools with the block explorer on both test networks. _(about 10 min; needs: test wallet)_ _(after: Send, receive and signing → In a wallet that holds no real money, get free Base Sepolia test ETH from a faucet listed…)_
- [ ] You: Paste a transaction ID into “Track confirmation” and confirm the status matches the explorer. _(about 5 min)_ _(after: Send, receive and signing → Send 0.001 test ETH to a second address you control)_
- [ ] Engineering: Complete transaction history from an indexing provider.
- [ ] Engineering: Production network connection with a backup provider if the first fails.
- [x] Engineering: Handle replaced, dropped and reorganised transactions: Track shows confirmations and explains each case (read-only checks, tested in tests/tx-tracker.test.mjs).
- [ ] Outside party: Market prices from a licensed data provider.

## Buy and sell through cards or bank accounts

**Current:** A server-only Transak sandbox checkout and order-status adapter is implemented with fixed hosts, verified-wallet binding and private secrets. No partner credentials are supplied; it fails closed. No live payments are enabled.

**To finish:** Create a provider sandbox account, enable BUY/SELL, arrange required IP allowlisting and supply staging credentials in Secret Manager. Test purchases, sales, cancellations, refunds and reconciliation. Business approval, production credentials and legal review are separate gates.

**Responsible:** Business owner + counsel + engineering. [Evidence and context](../docs/PROVIDER-SETUP.md).

**Steps (1 of 8 recorded as done):**

- [x] Engineering: Transak sandbox checkout and order check built; stays off until credentials are added.
- [ ] You: Create a Transak partner account and get its staging (test) API key and access token. Never paste them into chat or GitHub. _(about 30 min)_
- [ ] Outside party: Transak approves the backend’s fixed IP address (needs a static outbound address set up first). _(after: Create a Transak partner account and get its staging (test) API key and access token)_
- [ ] You: Put the staging key in Google Cloud Secret Manager (FYNX_TRANSAK_SANDBOX), following docs/PROVIDER-SETUP.md. _(about 15 min)_ _(after: Create a Transak partner account and get its staging (test) API key and access token)_
- [ ] Engineering: Redeploy only the owner function so it picks up the new secret. _(after: Put the staging key in Google Cloud Secret Manager (FYNX_TRANSAK_SANDBOX), following…)_
- [ ] You: Crypto tools → Check integration status, then create a sandbox Buy and a Sell checkout, and verify each order ID. _(about 20 min; needs: test wallet)_ _(after: Redeploy only the owner function so it picks up the new secret; Transak approves the backend’s fixed IP address (needs a static outbound address set up…)_
- [ ] You: Test a cancelled and a failed sandbox order and confirm they never show as paid. _(about 15 min; needs: test wallet)_ _(after: Crypto tools → Check integration status, then create a sandbox Buy and a Sell checkout,…)_
- [ ] Outside party: Provider business approval, production contract and legal review before real payments. _(after: Crypto tools → Check integration status, then create a sandbox Buy and a Sell checkout,…; U.S. launch permissions and consumer protections → Counsel reviews federal and state licensing, anti-money-laundering, sanctions, age and…)_

## Swap assets safely

**Current:** Direct ETH/USDC Uniswap v3 swaps on Base Sepolia: bounded slippage/price impact, one-minute quotes, exact/reset/revoke approvals, simulation and on-chain minimum output. Base mainnet quotes are read-only. Local-fork swaps passed in both directions.

**To finish:** Verify public-testnet and hardware-wallet execution; independently review the pinned contracts, pricing/manipulation risks, routing, fee handling and production release policy. Mainnet swaps stay disabled.

**Responsible:** Engineering + approved liquidity/provider arrangements. [Evidence and context](../docs/CRYPTO-TOOLS-VERIFICATION.md).

**Steps (1 of 7 recorded as done):**

- [x] Engineering: ETH ↔ USDC swaps with slippage, price-impact, expiry and minimum-received limits passed on an isolated Base Sepolia copy.
- [ ] You: Crypto tools → Base Sepolia → get a quote for 0.001 ETH → USDC and check the minimum received. _(about 5 min; needs: test wallet)_ _(after: Send, receive and signing → In a wallet that holds no real money, get free Base Sepolia test ETH from a faucet listed…; Send, receive and signing → Crypto tools → Base Sepolia → Connect wallet → Review ownership message → approve)_
- [ ] You: Complete that swap in your wallet and confirm both balances on the explorer. _(about 8 min; needs: test wallet)_ _(after: Crypto tools → Base Sepolia → get a quote for 0.001 ETH → USDC and check the minimum…)_
- [ ] You: Swap a small amount of USDC back to ETH: approve the exact amount, request a fresh quote, swap. _(about 12 min; needs: test wallet)_ _(after: Complete that swap in your wallet and confirm both balances on the explorer)_
- [ ] You: Use “Revoke swap allowance” and confirm the allowance is zero. _(about 5 min; needs: test wallet)_ _(after: Swap a small amount of USDC back to ETH: approve the exact amount, request a fresh quote,…)_
- [ ] You: Repeat one swap approving on a Ledger. _(about 10 min; needs: Ledger)_ _(after: Complete that swap in your wallet and confirm both balances on the explorer)_
- [ ] Outside party: Independent review of the pinned contracts, pricing risks and fee handling before real funds.

## Production security and independent audit

**Current:** Owner authorization, App Check, challenge replay protection, dependency checks and an internal review are in place. Current GitHub origin and Firebase project are shared with other applications.

**To finish:** Choose a dedicated production origin/backend boundary, configure response headers and secrets/IAM, retest App Check on normal browsers, and commission an independent signing/auth review with fixes and retesting.

**Responsible:** Owner + engineering + independent reviewer. [Evidence and context](../security_best_practices_report.md).

**Steps (1 of 5 recorded as done):**

- [x] Engineering: Owner-only authorization, App Check, replay protection, dependency checks and an internal review.
- [ ] You: Choose a dedicated web address and a separate Firebase project for the production wallet.
- [ ] Engineering: Security headers, secrets and access permissions on that dedicated setup; retest App Check in normal browsers. _(after: Choose a dedicated web address and a separate Firebase project for the production wallet)_
- [ ] You: Choose and hire an independent security reviewer for signing and sign-in.
- [ ] Outside party: Independent review completed, issues fixed and retested. _(after: Choose and hire an independent security reviewer for signing and sign-in)_

## Publish only verified releases

**Current:** The Pages workflow waits for tests, generated-file checks and dependency audits. Only approved public assets are packaged, with a revision/hash manifest.

**To finish:** Keep deployment gated; use the published manifest and Actions run to identify each release. Backend deployments and rollbacks remain separately scoped.

**Responsible:** Engineering. [Evidence and context](../docs/RELEASE-PROCESS.md).

**Steps (2 of 3 recorded as done):**

- [x] Engineering: Website updates publish only after tests, generated-file checks and dependency audits pass.
- [x] Engineering: Each release publishes a revision and file-hash manifest.
- [ ] You: Open the GitHub Actions page and confirm the latest “Verify and publish FYNX Wallet” run is green. _(about 2 min)_

## Monitoring, backups and incident recovery

**Current:** Audit retention, rate limits, a connection check and an incident procedure exist. There is no tested alert recipient or restore drill.

**To finish:** Assign monitored support/security contacts, set failure/authorization/billing alerts, test delivery, select backup retention and recovery objectives, and restore into an isolated environment. Connection checks are not continuous monitoring.

**Responsible:** Owner + engineering. [Evidence and context](../docs/OPERATIONS.md).

**Steps (1 of 7 recorded as done):**

- [x] Engineering: Audit retention, rate limits, connection checks and a written incident procedure.
- [ ] You: Name who reads fynxteam5@gmail.com every day, and a backup person.
- [ ] You: Choose where alerts go (email or phone) for failures, sign-in problems and billing.
- [ ] Engineering: Set up those alerts in Google Cloud and send a test alert. _(after: Choose where alerts go (email or phone) for failures, sign-in problems and billing)_
- [ ] You: Choose how long backups are kept and how quickly the service must be restored after an outage.
- [ ] Engineering: Restore a backup into a separate test project and record the result. _(after: Choose how long backups are kept and how quickly the service must be restored after an…)_
- [ ] You: Walk through the incident procedure once with your team (a 30-minute practice run). _(about 30 min; needs: team)_ _(after: Name who reads fynxteam5@gmail.com every day, and a backup person)_

## U.S. launch permissions and consumer protections

**Current:** The owner supplied the name FYNX finance world inc. and selected the United States as the first intended market. Incorporation state, registration details and legal permissions are unverified.

**To finish:** Confirm entity details and the exact custody/payment model. Have counsel determine federal/state licensing, AML/KYC, sanctions, age/eligibility, privacy, consumer terms, disclosures and complaints duties. Finish the required registrations, contracts and controls before serving customers.

**Responsible:** Business owner + qualified counsel. [Evidence and context](../docs/LEGAL-OPERATING-REVIEW.md).

**Steps (0 of 6 recorded as done):**

- [ ] You: Confirm FYNX finance world inc.’s state of incorporation and registration details.
- [ ] You: Confirm the model: customers keep their own keys and a licensed provider handles card and bank payments.
- [ ] You: Hire qualified U.S. counsel experienced with crypto and payments.
- [ ] Outside party: Counsel reviews federal and state licensing, anti-money-laundering, sanctions, age and eligibility, privacy and complaints duties. _(after: Hire qualified U.S. counsel experienced with crypto and payments; Confirm FYNX finance world inc.’s state of incorporation and registration details; Confirm the model: customers keep their own keys and a licensed provider handles card and…)_
- [ ] Outside party: Customer terms, privacy notice and risk disclosures drafted and approved. _(after: Counsel reviews federal and state licensing, anti-money-laundering, sanctions, age and…)_
- [ ] You: Complete the registrations and contracts counsel requires. _(after: Counsel reviews federal and state licensing, anti-money-laundering, sanctions, age and…)_

## International availability

**Current:** Worldwide access is a future goal, not current eligibility or authorization.

**To finish:** Approve each country and product separately for local requirements, sanctions, payment/provider coverage, data handling and support. Implement an approved-country policy before expansion; do not promise all countries.

**Responsible:** Business owner + counsel + providers. [Evidence and context](../docs/LEGAL-OPERATING-REVIEW.md).

**Steps (0 of 3 recorded as done):**

- [ ] You: Pick the first country after the U.S.
- [ ] Outside party: Counsel and payment provider confirm what is allowed and supported in that country. _(after: Pick the first country after the U.S.; U.S. launch permissions and consumer protections → Hire qualified U.S. counsel experienced with crypto and payments)_
- [ ] Engineering: An approved-country list that blocks sign-up from anywhere not approved. _(after: Counsel and payment provider confirm what is allowed and supported in that country)_

## Controlled public launch

**Current:** Public customers remain on the waitlist. No launch date, real-funds readiness or flawless operation is claimed.

**To finish:** After the applicable gates pass, run a small approved pilot with limits, staffed support, recovery/incident procedures, reconciliation, measured reliability and a rollback decision. Obtain explicit owner release approval before removing the waitlist.

**Responsible:** Owner + engineering + reviewers. [Evidence and context](../docs/LAUNCH-READINESS.md).

**Steps (0 of 4 recorded as done):**

- [ ] You: Decide the pilot: how many people, which states, and the maximum amounts.
- [ ] You: Arrange who answers support during the pilot, and how fast.
- [ ] Engineering: A tested rollback plan and reconciliation reports for the pilot.
- [ ] You: Give final written approval to remove the waitlist for the pilot group. _(after: Decide the pilot: how many people, which states, and the maximum amounts; Arrange who answers support during the pilot, and how fast; A tested rollback plan and reconciliation reports for the pilot; Production security and independent audit → Independent review completed, issues fixed and retested; U.S. launch permissions and consumer protections → Customer terms, privacy notice and risk disclosures drafted and approved; U.S. launch permissions and consumer protections → Complete the registrations and contracts counsel requires)_

This file is generated from `wallet-src/launch-checklist.json`; update that source and run `npm run build`. The owner dashboard uses the same checklist.
