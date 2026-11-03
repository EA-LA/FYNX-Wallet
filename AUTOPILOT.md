# Autopilot backlog (FYNX Wallet)

Prioritized ideas, one focused change per run. Scope: public site, UI, docs and tests only. Never touch key handling, signing, transfers/swaps/limits, network enablement, contract addresses, owner authorization, App Check, passkeys, Firebase rules, payment adapters or firebase-wallet/ / firebase-waitlist/ authorization code.

- [x] Header "Join waitlist" button text contrast fix (2026-11-03)
- [x] Per-section browser tab titles, active menu item, focus moves to the page heading (2026-11-03)
- [x] Phones: compact Menu button with all sections (2026-11-03)
- [x] Unknown links (e.g. #typo) now show a friendly "Page not found" view with links to every section; closed wallet routes still go to Log in (2026-11-03)
- [x] "Skip to content" link for keyboard users (2026-11-03)
- [ ] SEO: add a meta description, Open Graph/Twitter preview tags and a share image to index.html
- [ ] Add a privacy-friendly `sitemap.xml` / `robots.txt` to the Pages release (requires adding them to the approved public-file list)
- [x] FAQ: 19 grouped questions with live search and Expand all (2026-11-03)
- [ ] Waitlist form: show the email field's error inline with a clearer message before submit
- [ ] Load Google Fonts with `preconnect` hints for faster first paint
- [x] Footer year is filled in automatically (2026-11-03)
- [ ] Add a visible "Back to top" control on long pages on mobile
- [x] Networks page: planned-support table (send / receive / swap / buy) and an in-browser address format checker (2026-11-03)
- [x] Security page: "Is this a scam?" self-check, approve-before checklist, official contact and U.S. fraud reporting links (2026-11-03)
- [x] Homepage: illustrative portfolio labels BTC/SOL as later, separate work (2026-11-03)
- [x] Waitlist page: "What happens after you join" four-step timeline under the form (2026-11-03)
- [x] Features page: five-part tour (portfolio, buy/sell, send/receive, swap, your keys) with status labels and example previews, plus an interactive review-screen walkthrough (2026-11-03)
- [x] Homepage: the three feature cards link to the matching part of the Features tour (#features/portfolio, /buy, /send) (2026-11-03)
- [x] Security page: "Before you approve anything" links to the example review-screen walkthrough (#features/review) (2026-11-03)
- [x] Address checker: verifies the Ethereum (EIP-55) checksum of mixed-case addresses with an in-browser Keccak-256 and warns on a mismatch (2026-11-03)
- [ ] Preview terms page: very short; expand into sections (no financial advice, eligibility, changes) after checking with the legal review brief
- [ ] Networks page: a "Copy" button next to the address checker result
- [ ] Features tour: update the browser address (#features/<part>) when a jump chip is pressed so the part can be shared
- [ ] FAQ: shareable links to a single answer (e.g. #faq/fees)
