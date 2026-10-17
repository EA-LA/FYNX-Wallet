# Unified FYNX website verification

October 17, 2026. The public homepage stays on the waitlist. `owner.html` is an authenticated area of the same GitHub Pages website, using the existing verified Firebase owner account.

## Implemented

- Exact loop-shaped FYNX mark in the public/owner headers and SVG, PNG and Apple touch icons.
- Public footer **Owner access** link; owner **Sign out & exit** returns to the public homepage.
- Full existing dashboard moved from the archived `dist/` tree into `wallet-src/dashboard/`. Overview, Assets, Buy & sell, Swap, Activity, Settings and the remaining design pages are available after owner verification.
- The protected dashboard document is served by the existing `fynxWalletWorkspace` function after App Check, exact-origin, revoked-token and verified-owner checks. No standalone dashboard document is published on Pages. Repository source remains public.
- An opaque-origin iframe isolates the simulation from account credentials, the connected wallet and live registrations. Network calls and form submissions are denied. Exact script hashes are pinned in parent/child CSP. Preview state lasts only for the signed-in visit.
- Actual Sepolia connection/signing and live waitlist records remain in the existing owner tools. Preview balances and simulated transactions do not represent real funds.

## Verification performed

Live Firebase backend with the candidate frontend served at the production origin for browser checks:

- Anonymous dashboard request: **401**, zero dashboard frames, sign-in visible.
- Temporary verified non-owner email/password account: **403** on the actual `dashboard` operation; private workspace hidden.
- Authorized owner request: full dashboard rendered, and all six primary dashboard tabs navigated successfully.
- Preview attempts to read parent DOM and local storage were denied; no wallet provider was present in the preview.
- **Open wallet testing** opened the real owner wallet panel through the restricted message bridge.
- Deliberately simulated HTTP **503** displayed an error with no dashboard; Retry loaded the real protected document after removing the simulation.
- A delayed dashboard response arriving after sign-out was discarded: zero frames, private workspace hidden, sign-in visible.
- Desktop (1440 px) and mobile (390 px) screenshots inspected; no horizontal overflow in the owner page or dashboard.
- `npm run check` passed 23 preview templates, waitlist checks and eleven wallet/dashboard test groups. The new dispatch test exercises the real backend handler with actual owner-guard logic; the build test verifies the exact CSP digest.
- Scoped function deployment succeeded. Compared 65 unrelated functions: zero changed. Shared rules releases unchanged; temporary operator signing grant removed.

Test authentication uses an operator-authorized short-lived Firebase token kept under `.git/`; it is not a user-facing login bypass or a published test hook. Non-owner test credentials and account are temporary. The human owner completes Google/password/passkey authentication on their own device.

The public waitlist's original live Firestore evidence remains in [the waitlist verification record](../firebase-waitlist/VERIFICATION.md). Public wallet launch, real funds, physical Ledger/recovery acceptance and legal/independent-security approvals remain subject to [release gates](LAUNCH-READINESS.md).

GitHub Actions supplies the revision-specific verification and Pages deployment results. The older remote prototype has not been changed; the new website has no links or runtime dependency on it.

## Published release checks and cache correction

Release `e49e48f` passed [GitHub verification](https://github.com/EA-LA/FYNX-Wallet/actions/runs/39059797524) and [Pages deployment](https://github.com/EA-LA/FYNX-Wallet/actions/runs/39059796574). Published HTML, JavaScript, CSS and all three icon files matched the release bytes. Direct requests for the old dashboard, editable dashboard source and backend HTML/source returned **404**.

The final browser test detected a previously cached owner bundle loading with the new HTML. The build now assigns content-derived versions to owner script/style URLs and the privacy-page stylesheet. CI verifies those versions against the actual generated files. This fixes upgrades for returning visitors without relaxing the CSP or owner gate.

The owner Waitlist tab retrieved three actual Firestore registrations. The existing acceptance-test record still has its original server timestamp `2026-10-17T17:39:26.686Z`, `waiting` status, `fynx-wallet-public` source and `prelaunch-v2` notice version. No registration was deleted during this follow-up. A missing App Check token on the new dashboard operation returned **401**.
