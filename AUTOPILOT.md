# Autopilot backlog (FYNX Wallet)

Prioritized ideas, one focused change per run. Scope: public site, UI, docs and tests only. Never touch key handling, signing, transfers/swaps/limits, network enablement, contract addresses, owner authorization, App Check, passkeys, Firebase rules, payment adapters or firebase-wallet/ / firebase-waitlist/ authorization code.

- [x] Header "Join waitlist" button text contrast fix (2026-11-03)
- [x] Per-section browser tab titles, active menu item, focus moves to the page heading (2026-11-03)
- [x] Phones: compact Menu button with all sections (2026-11-03)
- [ ] Unknown links (e.g. #typo) show the "You're a little early" login page — consider a friendly "page not found" view instead
- [x] "Skip to content" link for keyboard users (2026-11-03)
- [ ] SEO: add a meta description, Open Graph/Twitter preview tags and a share image to index.html
- [ ] Add a privacy-friendly `sitemap.xml` / `robots.txt` to the Pages release (requires adding them to the approved public-file list)
- [x] FAQ: 19 grouped questions with live search and Expand all (2026-11-03)
- [ ] Waitlist form: show the email field's error inline with a clearer message before submit
- [ ] Load Google Fonts with `preconnect` hints for faster first paint
- [ ] Footer "© 2026" — generate the year automatically
- [ ] Add a visible "Back to top" control on long pages on mobile
- [x] Networks page: planned-support table (send / receive / swap / buy) and an in-browser address format checker (2026-11-03)
- [x] Security page: "Is this a scam?" self-check, approve-before checklist, official contact and U.S. fraud reporting links (2026-11-03)
- [x] Homepage: illustrative portfolio labels BTC/SOL as later, separate work (2026-11-03)
- [ ] Waitlist page: short "What happens next" timeline under the form
- [ ] Features page: only three short cards — add a fuller tour (portfolio, buy, send/receive, swap, review screen) with honest "planned" labels
- [ ] Address checker: optional checksum verification for mixed-case Ethereum addresses (needs a small keccak helper)
- [ ] Preview terms page: very short; expand into sections (no financial advice, eligibility, changes) after checking with the legal review brief
