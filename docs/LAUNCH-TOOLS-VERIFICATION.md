# Launch checklist, connection checks and release gate

Verified October 17, 2026. Public accounts and real-funds features remain closed.

## Scope delivered

- Fourteen launch work items, with current evidence, remaining work and responsibility, in the owner dashboard and a generated GitHub document. Both use the same JSON source. The plan records FYNX's own product, U.S. first and separately reviewed international expansion; no MoonPay integration is introduced.
- An owner-only connection check calls the deployed workspace session handler. Its successful response proves owner authorization, app verification and a read of the private workspace records at that moment. A connected wallet can separately check its current account/network without signing or transferring. No connected wallet is labeled **Not tested**, never passed.
- A Pages workflow whose deployment depends on successful verification, with an explicit public-asset package and a revision/SHA-256 manifest. See [release process](RELEASE-PROCESS.md).

## Automated and live evidence

`npm run check` passed 23 preview-template checks, the waitlist backend/UI suites, and 24 Node test groups. All three production dependency audits reported zero known vulnerabilities at the checked lockfiles. Artifact tests verify excluded backend/private/source fixtures, reject sample private keys/debug activation/test hooks, reject missing local dependencies and reject symlinked files.

The candidate frontend was loaded in a real automated browser at the production origin, with only its local static assets substituted. Its connection check called the **deployed** Firebase backend and confirmed the existing owner's authorization and private Firestore reads. No registration or wallet record was created or removed by these checks.

- All fourteen checklist items rendered, including expanded U.S. launch requirements.
- Desktop and 390-pixel mobile layouts were inspected; the mobile document had no horizontal overflow.
- An intercepted HTTP 503 cleared previous successful results and restored the retry button. Removing the interception recovered the live result.
- A real backend response delayed until after sign-out was discarded. Results and status were empty, and the private workspace stayed hidden.
- Unit checks reject malformed/guest backend responses and report a changed or wrong-network wallet as needing attention.

Authentication used a private, short-lived Firebase test token for the existing owner and Firebase's official app-specific App Check debug mechanism. This verifies the live handlers and database reads, **not a human Google login, normal reCAPTCHA attestation, hardware signing or public-network settlement**. Production App Check enforcement was not weakened. Temporary token-creation permission was removed; the debug registration and local sign-in tokens were revoked/removed after acceptance. No credential or test bootstrap is included in the public artifact.

No Firebase function or shared database rules were deployed for this change. Live connection checks use the existing owner API. Verify the matching GitHub Actions run and public release manifest for deployment evidence; test success alone does not prove publication.

## Open acceptance gates

Normal-device Google/email/passkey acceptance, physical-wallet approval/rejection, public Sepolia send/receive, recovery, production infrastructure, customer account isolation, buy/sell arrangements, swaps, independent security/legal review, monitored alerts and restore drills remain open. The [full checklist](LAUNCH-CHECKLIST.md) tracks these without representing them as completed.
