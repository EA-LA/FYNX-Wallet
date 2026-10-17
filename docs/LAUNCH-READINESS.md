# FYNX Wallet launch readiness

Status: owner-only testnet workspace. Public visitors remain on the live waitlist. No production-wallet launch or independent certification is claimed.

Operator name supplied by the owner: **FYNX finance world inc.** Registration jurisdiction, company number, address, and launch markets have not been supplied or independently verified.

| Checklist item | Current result | Evidence / remaining gate |
| --- | --- | --- |
| Product decisions | First version uses an external user-controlled Ethereum wallet, one network (Sepolia), native test ETH, no FYNX transfer fee | Keys and recovery stay in the selected wallet. Public mainnet assets, fees, age eligibility, and countries require approval. |
| Wallets and signing | Browser-wallet discovery, connection, server-verified ownership signatures, receive address, balance, transfer review and receipt checks implemented | Real cryptographic checks, live backend evidence, and local EVM transfer tests in `VERIFICATION.md`. Physical Ledger and public Sepolia transfer acceptance remain pending. |
| Email / Google account access | Firebase sign-in UI and verified-owner authorization implemented | Existing owner can use Google; email login needs an email password configured by that owner. Public accounts are not enabled. |
| Passkeys | Owner enrollment, verification, sign-in, removal, challenge expiry, and user verification implemented | Requires a compatible authenticator. A FYNX passkey signs into the account; it does not replace the wallet’s signing key or recovery process. |
| Authentication and database | Server UID authorization, revoked-token checks, App Check, transactional single-use challenges, audit events, TTL retention | Shared Firebase project administrators remain privileged. No shared rules were replaced. Restore drill and alert routing remain pending. |
| Wallet creation and recovery | Delegate to the existing wallet’s established setup/recovery process | FYNX does not generate/import 24 words. Test restoration on a spare device with a newly created, unfunded test wallet; never import an existing Ledger seed into a browser. |
| Security review | Internal review, threat model, dependency audit, negative access/signing tests, incident runbook prepared | Independent review, hardware acceptance, dedicated-origin assessment, alert test, and recovery drill are still release gates. |
| Legal and operating review | Product/data map, review questions, launch decision record and operating procedures prepared | Qualified counsel must assess the actual model and chosen jurisdictions. No legal clearance, license, entity verification, or provider approval is implied. |
| Payments and swaps | Disabled | Provider account/KYB, contracts, secrets, webhooks, idempotency, refunds, disclosures, reconciliation and outage tests required. |
| Controlled public launch | Closed | Requires the above gates, funded-network testing, defined limits, support ownership, and signed release approval. |

## Required acceptance on the owner’s device

1. Open `https://ea-la.github.io/FYNX-Wallet/owner.html` and sign in with the existing owner’s Google account. A different account must be denied.
2. If email/password access is wanted, use **Set or reset an email password** for that same account, complete the Firebase email link, and test login. No password is set by this implementation.
3. Add a device passkey after a fresh sign-in. Sign out; sign in with that passkey. Keep the Google account accessible and test removing/re-enrolling a spare passkey.
4. Use a new, unfunded test wallet or Ledger test account through a compatible Ethereum browser extension. Select Sepolia. Verify the full ownership message and domain, then approve on the wallet/device.
5. Confirm the receive address on the device. Fund it with valueless Sepolia test ETH through a reputable faucet. Test a small transfer to another test address, rejection, insufficient gas, disconnect, wrong network and reload.
6. Confirm the transaction on the public Sepolia explorer and verify the recipient’s balance independently. A transaction hash alone is not confirmation.
7. Test restoring the new test wallet in its official wallet software or on a spare hardware device. Keep test phrases offline. Document the device, wallet/version, derivation/account selection and matching restored address.
8. Obtain independent security and legal approval before opening public access or enabling real funds.

## First-step definition of done

The first wallet step is complete only after live owner sign-in, physical-wallet signing, public-testnet send/receive, rejection, and recovery have recorded evidence. Code implementation and automated checks are necessary but do not satisfy those remaining device and public-network gates.
