# Owner tools and transfer safeguards

Verified October 17, 2026. Public access remains on the waitlist. This release improves the existing owner workspace; it does not enable public accounts, mainnet transfers, payments or swaps.

## Delivered

- Owner-only waitlist lookup by exact email, normalized the same way as signup. The form never places the email in a URL.
- Pagination through all registrations, 50 at a time. The cursor includes the server timestamp and document ID, so equal timestamps do not skip rows and removing the last row does not break the next page.
- Expandable consent version, consent flag, source and retention date. Mobile rows have readable labels.
- Deletion and its audit event commit in one Firestore transaction. Retrying an already-removed record is safe. Failed operations do not claim a successful removal. Recent owner authentication is still required.
- The wallet adapter accepts only its latest original transfer review and consumes it before asynchronous submission begins. Copies, concurrent reuse, superseded reviews, expired reviews and retries after rejection are refused. Recipient contract code is checked again immediately before submission.
- Balance and receipt responses are rejected after a wallet change or disconnect. Malformed receipts cannot appear confirmed. Closing a connection permanently invalidates it.
- Sign-out immediately clears private rows, search text, counts, ownership messages, transfer details, input fields, transaction links and the dashboard. Responses from the prior session cannot populate the new session.

These checks cannot recall a transaction already approved or broadcast by an external wallet. Always inspect that wallet before retrying an uncertain submission.

## Verification

`npm run check` passes 23 preview templates, existing public waitlist validation/UI checks, and 19 wallet/dashboard/owner-list test groups. New cases include a 121-record dataset with tied timestamps, deletion of a page-boundary row, invalid cursors/page sizes, transaction/audit commit failure, recent-login authorization, parallel transfer submissions, rejection/retry, delayed wallet responses and malformed receipts. All three production dependency audits reported zero known vulnerabilities at these lockfile versions.

The deployed `fynxWalletWorkspace` function was exercised against live Firestore:

- Three existing registrations were fetched across three one-record pages, with unique IDs and a matching total.
- The existing `example.com` acceptance record was found using uppercase and surrounding spaces; its consent, notice version, source and expiry were returned.
- Invalid email, cursor and oversized page requests returned `invalid-argument`.
- The browser's Load more control appended live records. Exact lookup, empty results and expandable consent evidence worked.
- A simulated HTTP 503 preserved the displayed row and restored the retry button.
- A real response deliberately delayed until after sign-out was discarded: no rows, search text, signing message, transfer review or dashboard remained. Anonymous list access returned `unauthenticated`.
- Removing a verified-nonexistent test address returned `{ok: true, removed: false}`. No existing registration was deleted during acceptance. Atomic deletion/failure behavior is covered by the automated tests; this run did not induce a production database outage.

Browser authentication used a private, short-lived Firebase acceptance token for the existing owner. The automated browser's normal reCAPTCHA attestation returned `App attestation failed`; API enablement and allowed-domain configuration were confirmed intact. Subsequent live checks used Firebase's documented App Check debug provider with a temporary app-specific credential. This proves the deployed owner handlers and Firestore results, **not normal reCAPTCHA attestation or a human Google login in this run**. Production App Check enforcement and risk settings were not relaxed. Test credentials and bootstrap scripts are kept outside source and removed after testing; the temporary debug registration is revoked.

The updated adapter also signed and mined a transfer on an isolated local EVM with Sepolia chain ID 11155111. The recipient balance increased by 0.001 test ETH and the receipt was confirmed. Local hash: `0xce948698d3fd26e17843ae2ca03902ba894a7f7e15b904d37fd34737037dbc8c`. This is **not a public Sepolia transaction**.

Only the named workspace function was deployed. All 65 unrelated function update times and shared Rules releases matched the baseline. No new index, shared rule, service-account key or public signup path was added. GitHub Actions records the revision's check and Pages results.

## Remaining gates

Physical Ledger/browser-wallet acceptance, public Sepolia transfer and recipient confirmation, recovery on a spare device, normal-device passkey coverage, independent security/legal review, monitored alerts, restore testing and production isolation remain open. See [launch readiness](LAUNCH-READINESS.md).

Implementation references: [Firestore query cursors](https://firebase.google.com/docs/firestore/query-data/query-cursors), [EIP-1193 provider events](https://eips.ethereum.org/EIPS/eip-1193), [Firebase App Check debug-provider guidance](https://firebase.google.com/docs/app-check/web/debug-provider).
