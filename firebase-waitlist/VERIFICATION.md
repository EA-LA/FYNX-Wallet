# Live waitlist verification — October 17, 2026

## Backend release

- Firebase project: `fynx-c7a28`.
- Function: `joinFynxWalletWaitlist`, `us-central1`, Node 22, codebase `fynx-wallet-waitlist`.
- Deployment reported successful; function state `ACTIVE`, updated `2026-10-17T17:28:36.366054116Z`.
- Only this function was deployed. The 64 existing functions retained their update timestamps. Firestore and Storage rules releases are unchanged.
- reCAPTCHA Enterprise and Firebase App Check APIs are enabled. The real score key is restricted to `ea-la.github.io`; App Check retains a 0.5 minimum score and one-hour token lifetime. No debug tokens or test-mode score overrides were used.
- The collection-specific `expiresAt` TTL policy is `ACTIVE`. Other retention policies and project-wide App Check enforcement are unchanged.

## Verified before frontend activation

The candidate frontend was loaded in a browser on the actual GitHub Pages origin with local JavaScript overrides. Firebase SDKs, real reCAPTCHA, App Check, the deployed callable, and Firestore were live. `waitlistBackendReady` remained false in the repository until these checks passed.

| Check | Result |
| --- | --- |
| Successful signup | Callable returned `{ ok: true }`; browser showed success only after the response. |
| Actual Firestore write | Authenticated operator read confirmed the document below and all seven required data fields plus expiry. |
| Duplicate signup | Case/whitespace variant and three parallel repeats all returned success; one document remained with unchanged fields and timestamps. |
| Invalid email | Deployed callable returned `functions/invalid-argument`. |
| Missing consent | Deployed callable returned `functions/invalid-argument`; no document was created. |
| Old notice version | Deployed callable returned `functions/invalid-argument`. |
| Missing/invalid App Check | Direct requests each returned HTTP 401 `UNAUTHENTICATED`; no document was created. |
| Unauthorized Firestore access | Anonymous document read, collection list, create, and update each returned HTTP 403 `PERMISSION_DENIED`. |
| Backend outage in browser | A deliberately intercepted HTTP 503 response showed the error, retained the email, enabled retry, and showed no success. No document was created. This was a simulation, not a production outage. |
| Database write failure | Unit fault injection rejected with `unavailable`; no successful response or write was produced. Production Firestore was not disrupted. |
| Owner workspace isolation | `dist/index.html` is excluded from Pages. `owner.html`, `dist/`, and both Sites configurations were left unchanged. |

Test document:

- Collection: `fynxWalletWaitlist`.
- ID: `09e66c9ab5ca9f0e3e55b0da9cc63a719f942659bc86a74b6e24c31a20a66ce5`.
- Email: `fynx-wallet-live-20261017@example.com` (reserved test domain; exclude from any campaign).
- `consent`: `true`.
- `noticeVersion`: `prelaunch-v2`.
- `createdAt`: `2026-10-17T17:32:13.587Z` (Firestore server timestamp).
- `source`: `fynx-wallet-public`.
- `status`: `waiting`.
- `expiresAt`: `2027-10-17T17:32:13.537Z`.
- Firestore document create/update time: `2026-10-17T17:32:13.624022Z`; no duplicate modified it.

The repository unit checks pass for backend validation, app identity, duplicate preservation, expiry, write failure, pending-save UI, malformed responses, retry, navigation, and the existing wallet prototype. The backend dependency audit reports zero known vulnerabilities for the pinned dependency tree.

## Published-site verification

The final GitHub Pages deployment and a second signup with no browser overrides are checked after pushing the activation commit. Their results are recorded in the follow-up evidence update.

## Operator notes

View registrations in [Firebase Console → Firestore Data](https://console.firebase.google.com/project/fynx-c7a28/firestore/databases/-default-/data), under `fynxWalletWaitlist`.

The selected privacy contact, `fynxteam5@gmail.com`, is already published in the [FYNX whitepaper](https://www.fynxfinanceworld.com/assets/docs/FYNX-Whitepaper.pdf). The notice specifies 365-day expiry and deletion requests to that address. The owner must monitor that inbox and process requests before sending updates. No email-delivery or marketing service is connected by this change.
