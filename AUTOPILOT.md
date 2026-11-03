# Autopilot backlog (FYNX Wallet)

Prioritized ideas, one focused change per run. Scope: public site, UI, docs and tests only. Never touch key handling, signing, transfers/swaps/limits, network enablement, contract addresses, owner authorization, App Check, passkeys, Firebase rules, payment adapters or firebase-wallet/ / firebase-waitlist/ authorization code.

- [x] Header "Join waitlist" button text contrast fix (2026-11-03)
- [x] Per-section browser tab titles, active menu item, focus moves to the page heading (2026-11-03)
- [ ] Phones: Features / Networks / Security links are hidden in the top bar on small screens — add a compact menu
- [ ] Unknown links (e.g. #typo) show the "You're a little early" login page — consider a friendly "page not found" view instead
- [ ] Add a "Skip to content" link for keyboard users
- [ ] SEO: add a meta description, Open Graph/Twitter preview tags and a share image to index.html
- [ ] Add a privacy-friendly `sitemap.xml` / `robots.txt` to the Pages release (requires adding them to the approved public-file list)
- [ ] FAQ: expand with more questions (supported networks, fees, how updates are sent, how to leave the list)
- [ ] Waitlist form: show the email field's error inline with a clearer message before submit
- [ ] Load Google Fonts with `preconnect` hints for faster first paint
- [ ] Footer "© 2026" — generate the year automatically
- [ ] Add a visible "Back to top" control on long pages on mobile
