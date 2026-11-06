# Autopilot backlog (FYNX Wallet)

Prioritized ideas, one focused change per run. Scope: public site, UI, docs and tests only. Never touch key handling, signing, transfers/swaps/limits, network enablement, contract addresses, owner authorization, App Check, passkeys, Firebase rules, payment adapters or firebase-wallet/ / firebase-waitlist/ authorization code.

- [x] Header "Join waitlist" button text contrast fix (2026-11-03)
- [x] Per-section browser tab titles, active menu item, focus moves to the page heading (2026-11-03)
- [x] Phones: compact Menu button with all sections (2026-11-03)
- [x] Unknown links (e.g. #typo) now show a friendly "Page not found" view with links to every section; closed wallet routes still go to Log in (2026-11-03)
- [x] "Skip to content" link for keyboard users (2026-11-03)
- [x] SEO: clearer meta description, Open Graph/Twitter preview tags and canonical link (2026-11-04)
- [ ] SEO: a share image for link previews (needs a new approved public file)
- [ ] Add a privacy-friendly `sitemap.xml` / `robots.txt` to the Pages release (requires adding them to the approved public-file list)
- [x] FAQ: 19 grouped questions with live search and Expand all (2026-11-03)
- [x] Waitlist form: specific inline email messages (missing @, spaces, bad domain) and a one-tap fix for common typos like gmial.com (2026-11-04)
- [ ] Load Google Fonts with `preconnect` hints for faster first paint
- [x] Footer year is filled in automatically (2026-11-03)
- [x] A "↑ Top" button appears after scrolling down on any long page (phone and desktop) and returns focus to the page heading (2026-11-04)
- [x] Networks page: planned-support table (send / receive / swap / buy) and an in-browser address format checker (2026-11-03)
- [x] Security page: "Is this a scam?" self-check, approve-before checklist, official contact and U.S. fraud reporting links (2026-11-03)
- [x] Homepage: illustrative portfolio labels BTC/SOL as later, separate work (2026-11-03)
- [x] Waitlist page: "What happens after you join" four-step timeline under the form (2026-11-03)
- [x] Features page: five-part tour (portfolio, buy/sell, send/receive, swap, your keys) with status labels and example previews, plus an interactive review-screen walkthrough (2026-11-03)
- [x] Homepage: the three feature cards link to the matching part of the Features tour (#features/portfolio, /buy, /send) (2026-11-03)
- [x] Security page: "Before you approve anything" links to the example review-screen walkthrough (#features/review) (2026-11-03)
- [x] Address checker: verifies the Ethereum (EIP-55) checksum of mixed-case addresses with an in-browser Keccak-256 and warns on a mismatch (2026-11-03)
- [ ] Preview terms page: very short; expand into sections (no financial advice, eligibility, changes) after checking with the legal review brief
- [x] Networks page: a "Copy address" button under the address checker (hidden for anything that looks like a key or phrase) (2026-11-04)
- [x] Features tour: jump chips update the browser address (#features/<part>) so the part can be shared (2026-11-04)
- [x] FAQ: shareable links to a single answer (#faq/<question>) with a Copy link button; the answer opens and is highlighted (2026-11-04)
- [x] New Learn page (#learn): 33-term plain-English crypto glossary in five topics, with search, topic filters, related terms, links to the matching tool or page, and shareable #learn/<term> links; linked from header, phone menu, footer, FAQ and page-not-found (2026-11-04)
- [x] Features, Networks and Security end with a "Words used on this page" row linking each term to the glossary (2026-11-04)
- [x] Homepage: "New to crypto? Start here." row with four free tools (glossary, backup check, scam check, address check) (2026-11-04)
- [x] Security page: "Is your recovery phrase backup safe?" nine-statement check with a score, urgent items first and a fix plus glossary link for each gap; deep links #security/backup, #security/scam, #security/approve, #networks/check, #networks/plan (2026-11-04)
- [x] Security page: printable backup instructions sheet for family (#security/sheet), optional fields, blank lines for hand-filling, refuses anything that looks like a phrase or key, prints only the sheet (2026-11-04)
- [ ] Glossary: link terms inline inside Features/Networks/Security paragraphs, not only in the end-of-page row
- [x] Waitlist page: "While you wait" free tools row under the form, and tool links in the success message (2026-11-04)
- [x] Homepage "Start here" row: six tools in a 3×2 layout, now including the transaction lookup and the family backup sheet (2026-11-04)
- [ ] Preview terms page and Learn page: printable versions
- [ ] Security sheet: optional second wallet (some people keep two)
- [x] Networks page: "Look up a transaction or address" (#networks/lookup) builds links to Etherscan, Basescan, their Sepolia test explorers, mempool.space and the Solana explorer for transaction IDs, addresses and ENS names; refuses recovery phrases, Bitcoin private keys and xpubs; hides links for 64-character IDs (which look like private keys) until the visitor confirms where it came from; "What to check on the explorer" guide (2026-11-04)
- [x] Networks page: exact unit converter (ETH/gwei/wei, USDC/base units, BTC/sats, SOL/lamports) and network-fee arithmetic (gas × gas price), no prices (#networks/units) (2026-11-04)
- [x] Glossary: new terms "Gwei and wei" and "Token decimals"; transaction ID and block explorer entries link to the lookup tool (2026-11-04)
- [x] Networks and Security pages: "On this page" row at the top linking to each tool, with shareable addresses (2026-11-04)
- [x] Lookup tool: accepts links copied from Etherscan, Basescan (and their Sepolia sites), mempool.space, Blockstream, Solana Explorer and Solscan; shows the ID it found, puts the link's own network first, and warns on look-alike sites, links without an ID and mismatched contents (2026-11-04)
- [x] Security page: "Check a website link" (#security/link) reads a pasted link without opening it: real site shown, fake brand names, look-alike spellings (incl. letter swaps and rn/m, 0/o tricks), other-alphabet letters, "@" disguises, IP addresses, shorteners, http, free hosting, risky endings and wallet-bait words; recognises a short list of official addresses; refuses phrases/keys; linked from the jump row and the Phishing glossary entry (2026-11-04)
- [ ] Link checker: optional "report this site" links (e.g. Google Safe Browsing report form) and more official addresses if visitors ask
- [x] Homepage "Start here" row: eight tools in a 4×2 grid (2 columns on tablets, 1 on phones), adding "Check a link" and "Read a signature request" (2026-11-05)
- [ ] Lookup tool: also accept token pages (/token/…) and Arbitrum/Optimism explorers once those networks are considered
- [x] Learn page: "On this page" row at the top (Lessons, Glossary and each topic), with shareable #learn/<section> links; jumping to a topic clears any search or filter that would hide it (2026-11-05)
- [x] Learn page: "New to crypto? Start with the basics." six short lessons (what a wallet holds, recovery phrase, addresses and networks, fees, approvals and signatures, scams), each with key points, glossary words, a matching free tool and one check-yourself question with an explanation; progress bar kept only in this browser; Next lesson and Copy link buttons; shareable #learn/lesson-<id> links (2026-11-05)
- [x] Lessons: homepage line under the Start here grid linking to the first lesson and the wallet chooser (2026-11-05)
- [x] Learn page: "Which kind of wallet fits you?" chooser (#learn/chooser): four questions (amount, how often, backup, who approves) suggest an exchange account, app wallet, hardware wallet, savings + spending pair or multi-signature, with reasons, warnings (concentration risk, unsure backups), first steps, links, and a five-way comparison of who holds the keys, recovery, company failure, risks and fit; no brands, nothing saved (2026-11-05)
- [x] Glossary: new "Multi-signature (multisig)" term; Custodial account links to the chooser (2026-11-05)
- [ ] Chooser: remember the last answers in this browser (optional) and add a printable summary
- [x] Learn page: browser tab title now says "Learn crypto" instead of "Crypto glossary" (2026-11-05)
- [ ] Lessons: a seventh lesson on buying and selling (on-ramps, spreads, identity checks) once the buy flow is closer
- [x] Security page: "Understand a signature request" (#security/sign) explains pasted wallet requests in plain words: approve / increaseAllowance / decreaseAllowance (unlimited = danger, zero = revoke), setApprovalForAll, transfer / transferFrom / NFT safeTransferFrom, on-chain permit and Permit2 approve; typed signatures (EIP-2612 Permit, Permit2 PermitSingle/Batch and one-time transfers, Seaport listings incl. the zero-price listing trick, other typed data); Sign-In with Ethereum (with a site/URI mismatch warning) and plain or hex-encoded text messages; refuses phrases, keys and raw 32-byte hashes (blind signing); six labelled examples with made-up addresses; explorer buttons for the spender (2026-11-05)
- [x] Glossary: new "Permit (signed approval)" term; Token approval and Permit link to the signature tool (2026-11-05)
- [ ] Signature tool: recognise Uniswap Universal Router / multicall swaps and show the token amounts in and out
- [ ] Signature tool: optional decimals box so amounts can be shown in whole tokens when the visitor knows the token
- [ ] Signature tool: Solana transaction messages (base58/base64) once Solana is closer

## Bugs found and fixed

- [x] Page click handlers piled up as visitors moved between pages: after opening Questions, a "Copy link" (or Next lesson) on the Learn page also ran the Questions handler and could copy a wrong `#faq/...` link. Handlers now reset on every page change (2026-11-05)
- [x] Security page: "Spot the scam: practice" (#security/practice): ten everyday situations (fake support DM, surprise airdrop token, address poisoning, safe family transfer, honest sign-in request, withdrawal "tax", sponsored fake site, exchange email handled safely, unlimited approval from an ad, remote-access caller), one at a time; Go ahead / Stop, then red flags or why it is fine, what to do, tool and glossary links; progress dots, a score with the missed situations to review, Try again; nothing sent or saved; linked from the scam self-check and the On this page row (2026-11-05)
- [ ] Practice: link it from the "Spotting a scam" lesson and the homepage Start here row
- [ ] Practice: a second set of situations (romance, giveaway livestreams, fake job/task apps, QR-code payments)
- [ ] Header/phone menu label "Crypto glossary" could become "Learn" to match the page (update nav tests)

## Owner workspace (owner.html) — owner asked on 2026-11-05 to focus here and finish the launch checklist
- [x] Launch readiness: overview (percent, gate groups, your tests), next steps, filters, 83 concrete steps across 14 gates (You / Engineering / Outside), Passed/Failed/N/A + notes saved in this browser only (secret-looking notes refused), copy/download test report, tab shortcuts (2026-11-05)
- [x] Dashboard tab: iOS/iPadOS Safari widened the sandboxed iframe to its content, cutting off the right column; parent-side fix (width:1px;min-width:100%) (2026-11-05) — needs a check on the owner's iPad
- [ ] When the owner shares a test report: mark the matching steps done in wallet-src/launch-checklist.json and add the evidence to docs/VERIFICATION.md
- [x] Waitlist tab: "Sign-up insights" panel: total, last 7 days with trend vs the previous week, last 30 days and today, consent-recorded share; daily (30 days) / weekly (12 weeks) sign-up chart; privacy-notice version, source, status and retention breakdowns; test addresses (example.com, .test, .invalid) labelled and left out of the figures; "Load all registrations" (up to 1,000 per press, within the rate limit); filter loaded rows by text, consent and test addresses; CSV download of the filtered rows (formula-safe cells); "Copy summary" with counts only, no emails; cleared on sign-out (2026-11-05)
- [ ] Waitlist tab: sign-up totals across ALL registrations without loading them (needs a small backend count-by-day endpoint and a function redeploy; owner decision)
- [ ] Waitlist tab: highlight registrations whose retention date has passed and offer a reviewed bulk removal (needs backend support)
- [x] Account security tab: "Security checkup" with a score and five checks (verified email, a passkey, a second-device passkey, two ways in, wallet ownership proven) plus fix buttons; "This sign-in" (method, time, 5-minute window for passkey changes, idle sign-out countdown, account created); "Ways back into your account"; the identity gate's owner steps with saved results and a link to record them; numbered passkeys with added date and age; last-passkey removal warning; counts-only "Copy checkup summary" (2026-11-05)
- [ ] Account security tab: passkey device names (needs the backend to store a name at registration and a function redeploy; owner decision)
- [ ] Account security tab: record the identity gate results inline (Passed/Failed buttons) without switching to Launch readiness — the same pattern now exists on Crypto tools (recordWalletStep), reuse it
- [x] Crypto tools: "Test session guide" with seven self-ticking setup steps (wallet found, test network, connected, verified, test ETH, test USDC, a confirmed transaction), Go there buttons, per-network faucet links (Base docs list, CDP, Google Cloud Sepolia, Circle USDC); "Your crypto launch tests" (19 owner steps by gate) with inline Passed/Failed/N/A shared with Launch readiness and "Add latest transaction ID to note"; empty state for the session transaction list. Pure helpers in wallet-src/crypto-guide.js with tests; transfer/swap/signing code untouched (2026-11-06)
- [ ] Crypto tools: step numbers on the cards below (Connect → Receive → Send → Swap → Track) and an empty-state hint on the swap card when the selected network has no pool
- [ ] Crypto tools: a "copy test summary" (counts only) for the wallet tests, like the security checkup
- [ ] Operations gate: alert-setup guide page in docs with exact Google Cloud console steps
- [x] Legal gate: "Questions for your lawyer" sheet (14 questions by area, filled with the owner's answers, document links; copy, download, preview) (2026-11-06)
- [x] Launch readiness: "Decisions only you can make" worksheet for the 12 owner decision steps (wallet model, production domain/project, security reviewer, inbox, alert destination, backups/RTO/RPO, entity, business model and fees, counsel, first country, pilot limits, pilot support); complete answers record the step as Passed with a "Decision: …" note (shared with the test report), drafts stay "In progress" with reasons; copy a decision record; "Answer in the decision worksheet" buttons on those steps; next steps open the worksheet. Pure helpers in wallet-src/owner-decisions.js with tests (2026-11-06)
- [ ] Decision worksheet: keep unsaved typing when another part of the tab re-renders (currently a re-render resets unsaved fields)
- [ ] When the owner shares a decision record: copy the decisions into docs (OPERATIONS.md inbox/alerts/backups, LEGAL-OPERATING-REVIEW.md entity row) and mark the matching steps done in launch-checklist.json
- Note: the dashboard document itself (wallet-src/dashboard) is served by the Firebase function; changing it needs a backend redeploy, so autopilot leaves it alone.
