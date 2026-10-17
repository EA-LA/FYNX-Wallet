# Wallet phase-one verification

Date: October 17, 2026. Environment: Firebase `fynx-c7a28`, GitHub Pages origin `https://ea-la.github.io`, Node 22 deployment runtime. Public release remains a waitlist; this is an owner-only Sepolia workspace.

## Live Firebase evidence

- `fynxWalletWorkspace` deployed successfully and reports `ACTIVE`.
- Compared 65 existing functions with their pre-workspace-deployment update times: **zero unrelated functions changed**, including the existing waitlist function.
- Shared Firebase Rules releases are unchanged. No database/storage rules were redeployed.
- The existing Google/email providers and auth settings were preserved; the GitHub Pages host was added to the existing authorized-domain list.
- New challenge, rate-limit and audit TTL policies all report `ACTIVE`.
- A real ECDSA signature from a newly generated, unfunded acceptance-test signer was submitted through the browser with real App Check and owner authentication. The backend verified it and persisted the link to Firestore.
- Verified record before cleanup: address `0xc4cBD4283Fa2a0b958c66F2a4Ab4700f8246bc6e`, chain `11155111`, server `verifiedAt` **2026-10-17T18:02:46.851Z**, Firestore update **2026-10-17T18:02:46.877544Z**. This test wallet was subsequently unlinked, not left attached to the owner.
- Replaying the same signature/challenge returned `failed-precondition`. Mainnet challenge requests returned `failed-precondition`; invalid addresses returned `invalid-argument`.
- Missing and forged App Check tokens both returned HTTP **401**. Anonymous owner-session requests returned **401**.
- A temporary verified email/password Firebase account signed in through the actual email form, then received **403 owner access denied**. The private workspace stayed hidden. That test account was deleted.
- Anonymous Firestore reads of `fynxWalletProfiles`, `fynxWalletPasskeys`, `fynxWalletChallenges`, `fynxWalletAudit` and `fynxWalletRateLimits` all returned **403**.

## Passkeys and browser behavior

Owner enrollment and subsequent passkey login succeeded with a Chromium virtual WebAuthn authenticator, live Firebase challenges, real public-key verification, custom-token exchange and owner authorization. After enrollment, the page was reloaded using the unmodified release bundle with no sign-in test hook. Passkey sign-in then opened the owner workspace and loaded the live waitlist. The temporary passkey was removed after testing; no test passkeys remain.

The initial enrollment session used an operator-authorized short-lived Firebase owner token. A temporary, service-account-specific operator signing grant was removed immediately after minting it; a later IAM read confirmed removal. Tokens and temporary test passwords were stored only under `.git/` and deleted after testing. No private credential was committed, and no service-account private key was created.

Google sign-in successfully opened the Google Accounts OAuth flow on `accounts.google.com`. **A human Google sign-in was not completed by this test.** The owner must finish it on their device. The owner’s existing account has Google access; email/password sign-in requires that owner to set a password through the provided Firebase reset flow. No password was changed for the owner.

A simulated HTTP 503 on the workspace API displayed an error and restored the retry button. This is a browser outage simulation, not an induced production database outage. The waitlist’s separately documented persistence-failure unit test remains in place.

Desktop (1440 px) and mobile (390 px) screenshots were visually inspected. No horizontal overflow was detected. Sign-in loads without console errors; deliberate 401/403/503 tests generate expected network errors. Temporary test hooks, virtual credentials and test signer code are not in the published bundle.

## Local cryptographic and transaction checks

`npm run check` passes the existing demo/waitlist checks and nine wallet test groups covering:

- exact App Check application/origin and payload bounds;
- owner UID, email verification, revoked tokens and recent-login requirements;
- real ECDSA signing/recovery, incorrect signer/message, expired challenges and wrong UID;
- atomic single-use challenge consumption under concurrent replay;
- mainnet refusal before signing/sending;
- invalid recipients/amounts, contract recipients and insufficient gas;
- account/network changes and expired transfer reviews;
- wallet rejection;
- distinct pending, failed and confirmed receipts.

A separate isolated local EVM accepted and mined a transaction through the actual `WalletConnection` adapter. The recipient balance increased by **1,000,000,000,000,000 wei (0.001 test ETH)**. The signed legacy transaction encoded chain ID `11155111`. Local transaction hash: `0x8546dc15f4bc7dcaba8861a11bd731764ce376fe5e3ac12b1b551271040a2e79`, local block 1. **This hash is not a public Sepolia transaction and will not appear on Sepolia Etherscan.** No real funds were moved.

Root, workspace backend and waitlist backend dependency audits each reported zero known vulnerabilities at the checked lockfile versions. CI rebuilds the committed bundle and reruns checks.

## Remaining acceptance gates

Not yet proved: physical Ledger/browser-wallet integration, public Sepolia transfer/recipient confirmation, test-wallet recovery on a spare device, physical-device passkey compatibility, human Google and owner email login, independent security review, legal jurisdiction/approval, alert delivery, backup/restore drill, and a production-origin/shared-project isolation decision. No live fiat or swap integration exists.

The existing live waitlist evidence is in `../firebase-waitlist/VERIFICATION.md`. GitHub commit `d4560da` passed [verification](https://github.com/EA-LA/FYNX-Wallet/actions/runs/39057533915) and [Pages deployment](https://github.com/EA-LA/FYNX-Wallet/actions/runs/39057533347). The published owner HTML, bundle and privacy page matched local release bytes; backend source and the archived dashboard returned 404 from Pages. A fresh browser exposed a missing favicon, corrected with the FYNX icon in the follow-up release. GitHub Actions records checks for each pushed revision. Neither frontend tests nor this report alone authorize a public wallet launch.
