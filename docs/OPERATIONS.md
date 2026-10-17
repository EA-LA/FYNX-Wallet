# FYNX Wallet operating procedure

Owner: FYNX finance world inc. Contact: fynxteam5@gmail.com. The owner must confirm who monitors this inbox and its backup coverage before a public launch. No support staffing or legal entity verification is assumed.

## Current scope

- Public GitHub Pages marketing site and live waitlist.
- Private Firebase-authorized owner workspace on GitHub Pages.
- External wallets retain all signing keys; Sepolia test ETH only. No custody, trading orders, card collection, swaps, mainnet sends, or automated email campaign is enabled by this repository.
- Separate Firebase function codebases isolate deployments. Do not run an unscoped `firebase deploy` in this shared project.

## Registrations and deletion requests

View the latest 50 registrations in **Owner workspace → Waitlist**, or all registrations in the Firebase console’s `fynxWalletWaitlist` collection. Fields include email, consent, notice version, server creation time, source, waiting status and expiry.

1. Check the support inbox for withdrawal requests before any campaign. Verify the request through the registered mailbox; do not ask for identity documents, wallet signatures, keys or recovery words.
2. Sign in again if necessary, load registrations, confirm the exact email, and remove the matching record. The backend requires a recent owner login and records a deletion audit event without the email.
3. Confirm the active Firestore record is gone. Remove the address from any separately approved mailing provider if one is added later. This repository currently has no such integration.
4. Reply only when the operator chooses to do so. Automation here does not send messages.
5. Waitlist records expire after 365 days. TTL deletion is asynchronous. Do not represent deletion as removal from provider backups or immutable blockchain data.
6. Exclude all `example.com` acceptance-test addresses from any campaign.

## Security events and retention

`fynxWalletAudit` stores action, hashed actor, timestamp, and a 90-day expiry; no signature, raw email, IP, private key or token. `fynxWalletChallenges` uses short-lived one-use challenges (five minutes for wallet proof; two for passkeys), plus TTL cleanup. `fynxWalletRateLimits` expires after one day. Inspect Cloud Logging for `Wallet workspace operation failed` and `Waitlist persistence failed`.

Log queries and an incident procedure are prepared below; no monitored alert destination or on-call service has been configured. Before public launch, route failure spikes, unexpected authorization failures, quota/billing anomalies and IAM changes to a monitored destination and perform a test alert.

## Incident response

1. Record UTC start time, affected function/version, symptoms and request IDs. Never paste tokens, emails, signatures or keys into public GitHub issues.
2. Contain only the affected FYNX Wallet service. Temporarily hide wallet actions in the frontend or deploy a deny-all handler to `fynxWalletWorkspace`; do not disable unrelated project services or rewrite shared rules. Keep the public waitlist available if it is unaffected.
3. For owner account compromise, use Firebase Authentication to disable/revoke sessions for the affected UID, remove compromised passkey registrations, and recover the Google account through its official process. Sign-out in a browser alone does not revoke a stolen token.
4. For a wallet compromise, the operator follows the wallet vendor’s recovery/incident process. FYNX cannot revoke on-chain signatures or recover a seed. Do not request a user’s phrase.
5. Preserve restricted logs and deployment evidence. Compare source, function revisions, IAM, auth domains and App Check configuration with release records. Review other applications in the shared project if runtime credentials may be affected.
6. Have counsel assess notification duties for actual affected jurisdictions. Do not promise a universal deadline or claim a breach is harmless without evidence.
7. Re-test access denial, signatures, challenge replay, passkeys and failed writes before reopening. Record cause, corrective action and owner approval.

## Backup, restore and release

GitHub stores source history. Firestore recovery/export settings are shared-project decisions; this change does not enable a new shared backup schedule. Before public launch, confirm retention, protected export destination, recovery objectives and a restore drill in a separate test project. A written procedure is not a tested restore.

For each release: run `npm run check`, inspect dependency advisories, review the diff for secrets and changes to signing/auth, deploy only the named function, verify a live backend result and denial cases, then push the verified frontend and confirm GitHub Pages. The previous Git commit can restore the frontend; backend rollback requires deploying its corresponding reviewed function source separately. Document both revisions.

## Signing and recovery support

Support may ask for a public address, network, transaction hash, wallet version and error text. Support must never ask for passwords, passkey private material, wallet private keys, recovery phrases, remote screen-control while a phrase is visible, or “verification” transfers. Publish supported wallet/device versions only after testing them. The current interface supports standard EOA signatures and native Sepolia transfers; smart-contract wallets, WalletConnect/mobile sessions, Bitcoin, tokens and other chains are not validated.
