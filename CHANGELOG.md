# Changelog

## 2026-11-07 07:16 UTC — Ready for your keys: live prices, full history, dependable network reads and a services check

- **Launch readiness → Your services** (new): one press checks every outside service FYNX uses and says **Working**, **Not added yet**, **Key looks wrong** or **Not answering**. It covers Alchemy (network + history), CoinGecko (prices), the public backup, Transak, and real-money sending, which stays off until you turn it on. Keys are never shown.
- **Crypto tools → Portfolio & history** (new): **Check balances** shows ETH and USDC for your verified wallet on all three networks. Your Base balance is shown in dollars, and test-network coins are never counted as money. **Load history** lists every ETH and USDC transfer in and out, newest first, with explorer links.
- The FYNX server reads through Alchemy first and switches automatically to the public network if Alchemy is missing or down.
- **What you do:** follow docs/SERVICES-SETUP.md (create the FYNX_PROVIDERS secret with your Alchemy and CoinGecko keys, then deploy the owner function). Until that deploy, the new buttons say the server still needs the update.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html → Launch readiness and Crypto tools.

## 2026-11-07 06:19 UTC — [autopilot] Waitlist: address check, privacy-request replies and the waitlist launch tests in one place
- **Address check** (new box under Sign-up insights): spots the same inbox signed up twice (for example j.smith@gmail.com and jsmith+fynx@gmail.com), likely mistyped addresses (gmial.com, .con), throwaway inboxes, shared mailboxes (info@, support@) and rows past their retention date. Each row in the table shows a small label, and “Show these” filters the list to just those rows. The copied summary now includes these counts (no email addresses).
- **New “Show” filter** on the registration list (Needs a look, Possible duplicates, Likely mistyped, Disposable inbox, Shared mailbox, Retention ending, Past retention). Download CSV follows the same filter.
- **Privacy request replies**: open a registration’s status and press “Draft privacy reply” to get a ready-to-paste answer listing exactly what the waitlist holds for that person. After you remove someone, a deletion confirmation draft appears (honest about backups). Nothing is sent from the page; drafts clear on sign-out.
- **Your waitlist launch tests** now live on the Waitlist tab: after you join from your phone with an @example.com address and look it up, a six-point sign-up check confirms consent, notice version, source, sign-up time and the 365-day deletion date. When you remove it, one press records “find and remove” as Passed with a short note — shared with Launch readiness and your test report.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html → Waitlist.

## 2026-11-07 02:16 UTC — [autopilot] Crypto tools: transaction tracking now spots replaced, dropped and reorganised transactions

- **"Track confirmation" tells you what really happened to a transaction.** Before, anything without a receipt just said "pending". Now each check says one of: waiting to be included, confirmed (with a confirmations count and a small progress bar, for example "5 of 30 confirmations"), failed on-chain, replaced (you pressed "Speed up" or "Cancel" in your wallet and another version went through), dropped by the network, or moved by a block reorganisation. Each result comes with a plain explanation and what to do next, such as "do not send it again".
- **Every transaction in the list has its own "Check status" button**, and shows when you submitted it and when it was last checked. The button disappears once there is nothing left to wait for.
- Checking only reads the network: it never signs or resends anything. Sending, swapping and limits are unchanged.
- **Launch readiness moved forward:** the engineering step "Handle replaced, dropped and reorganised transactions" is now done, backed by new automated tests.
- See it: https://ea-la.github.io/FYNX-Wallet/owner.html → Crypto tools → Step 5 · Track.

## 2026-11-06 22:18 UTC — [autopilot] Owner workspace: your decisions now move between devices, and a to-do list for practice-run follow-ups

- **Decisions travel with your test report.** Answers you give in "Decisions only you can make" (on your phone, iPad or computer) are now included in Copy test report / Download report, in a short readable section. On your other device, paste the report into "Bring in results from another device": it lists the decisions it found (new, newer, already here, or kept because this browser saved later) and adds them together with your test results. Done steps and the overall percentage update straight away.
- **New "Follow-ups to do" list** in the Incident practice run card. Every follow-up your team wrote during a finished practice run appears here with a tick box, open ones first, and a count (for example "1 of 2 done"). Ticking one off keeps the date, and "Copy follow-up list" gives you a checklist to share with your team. The practice-run record now shows which follow-ups are done.
- See it: https://ea-la.github.io/FYNX-Wallet/owner.html → Launch readiness ("Record your test results" and "Incident practice run").

## 2026-11-06 18:25 UTC — [autopilot] Owner workspace: incident practice run and a backup restore guide

- **New in Launch readiness: "Incident practice run".** Pick one of four made-up bad days (a strange sign-in to your account, waitlist sign-ups failing, a fake FYNX site asking for recovery phrases, or the waitlist file sent to the wrong person) and walk your team through the seven steps of your incident procedure, one question at a time. Press "Show what the procedure says" after you discuss each step, then mark it handled or note a gap and what needs to change.
- When all seven steps are discussed with at least two people, "Finish and mark the step done" ticks off the practice-run step in your checklist, with the follow-ups in its note. You can copy or download a short record to share, and your last five runs are listed.
- After each step, a short message confirms what was noted (handy for screen readers).
- The checklist step and "Your next steps" now have a button that jumps straight to the practice run.
- **New guide for backups:** step-by-step instructions for choosing backup settings that match your answers in the decision worksheet and for testing a restore in a separate project, linked from the practice-run card.
- See it: https://ea-la.github.io/FYNX-Wallet/owner.html → Launch readiness (scroll below "Decisions only you can make").

## 2026-11-06 14:26 UTC — [autopilot] Owner workspace: combine results from your phone, iPad and computer; notes on every test; alert setup guide
- Launch readiness: new "Bring in results from another device". Results you record are saved only in the browser you used, so tests done on your iPhone or iPad did not show on your computer. Now: on the other device press Copy test report (or Download report), then paste it (or choose the file) here and press Check report. You see what is new, what is newer, what is already there and what is kept because this browser has a later result, then press Add. The overall percentage, next steps and your report update straight away. Nothing is uploaded. https://ea-la.github.io/FYNX-Wallet/owner.html (Launch readiness tab, under "Record your test results")
- Account security and Crypto tools: every launch test now has "Add a note" / "Edit note" right there (browser, device, transaction ID). Notes are the same ones shown in Launch readiness and your report; anything that looks like a recovery phrase or key is refused. https://ea-la.github.io/FYNX-Wallet/owner.html (Account security and Crypto tools tabs)
- The test report now shows the time of each result (for example "2026-11-06 14:20 UTC"), not just the day, so results from different devices are combined correctly.
- New guide for the Monitoring launch gate: exact Google Cloud console steps to send failure, access-change and billing alerts to your chosen email, plus two commands that send a test alert. https://github.com/EA-LA/FYNX-Wallet/blob/main/docs/ALERTS-SETUP.md

## 2026-11-06 10:25 UTC — [autopilot] Owner workspace: record security tests in place, clearer Crypto tools, worksheet keeps your typing
- Account security: each of your 8 sign-in and passkey launch tests now has Passed / Failed / Not applicable buttons right there, with a "1 of 8 recorded" count. Results are the same ones shown in Launch readiness and your test report. "Copy checkup summary" now also says how many of these tests you have recorded. https://ea-la.github.io/FYNX-Wallet/owner.html (Account security tab)
- Crypto tools: the cards are numbered Step 1 to Step 5 (Connect, Balances & receive, Send, Swap, Track), and the swap card now tells you what to do for the network you picked (for example: Ethereum Sepolia has no swap route, switch to Base Sepolia). New "Copy test summary" button lists your 19 wallet tests and their results, without notes, addresses or transaction IDs. https://ea-la.github.io/FYNX-Wallet/owner.html (Crypto tools tab)
- Fixed: in "Decisions only you can make", anything you typed but had not saved yet was wiped when another part of the Launch readiness tab refreshed. It now stays, marked "unsaved", until you save or clear it (and it is wiped when you sign out).
- Fixed: recording a result in the Launch readiness checklist could lose your place (keyboard focus jumped to a hidden copy of that step on another tab).

## 2026-11-06 06:20 UTC — [autopilot] Owner workspace: decision worksheet and questions for your lawyer

- The **Launch readiness** tab has a new **Decisions only you can make** section. Twelve launch steps are business choices rather than tests: how customers get a wallet, the production web address, the security reviewer, who reads the support inbox, where alerts go, backups and recovery time, company details, the business model, U.S. counsel, the first country after the U.S., pilot size and limits, and pilot support.
- Each one explains why it matters and gives you simple choices or short boxes to fill in. When your answer is complete, that step is marked done in the checklist and goes into your test report, so the overall percentage moves forward. A score shows how many you have decided (for example "2/12").
- Half-finished answers are kept as "In progress" with a clear reason (for example a lawyer only counts once they are engaged, a backup person must be someone else, the monthly pilot limit must be at least the per-transaction limit).
- **Copy decision record** copies a short table of your decisions to share with your engineer or Claude.
- **Questions for your lawyer**: a ready first-call sheet for U.S. counsel with 14 questions (licensing, anti-money-laundering and sanctions, customer terms, privacy, incidents, international), filled in with your answers so far and links to the documents to share. Copy it, download it, or preview it on the page. It is a list of questions, not legal advice.
- In the checklist, decision steps now have an "Answer in the decision worksheet" button, and "Your next steps" opens the worksheet directly.
- Answers stay in this browser only. Anything that looks like a recovery phrase or key is refused.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html → Launch readiness.

## 2026-11-06 02:15 UTC — [autopilot] Owner workspace: Crypto tools test guide

- The **Crypto tools** tab now opens with a **Test session guide**: seven numbered setup steps (wallet extension found, test network selected, wallet connected, ownership verified, test ETH, test USDC, a test transaction confirmed). They tick themselves off as you go, the next one is highlighted with a "Go there" button, and a score shows how close you are (for example "4/6 setup steps").
- **Free test assets** box with the right faucet links for the network you picked: Base’s own faucet list and the Coinbase faucet for Base Sepolia, Google Cloud’s faucet for Ethereum Sepolia, and Circle’s test USDC faucet for both, with a reminder that faucets never need a recovery phrase. Base mainnet stays read-only and shows no faucets.
- **Your crypto launch tests**: all 19 of your Crypto tools launch steps (signing, balances, swaps, buy/sell sandbox, wallet recovery) are listed by gate with Passed / Failed / Not applicable buttons right next to the tools. Results are the same as in Launch readiness and stay in this browser only.
- For steps proven by a transaction (sends, swaps, revoke, lookup), one tap adds the latest transaction ID from this page to that step’s note, so your test report carries the evidence.
- The transaction list now says when nothing has been sent on the selected network yet, instead of staying blank.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html → Crypto tools.

## 2026-11-05 22:30 UTC — [autopilot] Owner workspace: Account security checkup

- The **Account security** tab now opens with a **Security checkup**: a score (for example "3/5 checks done") and five clear checks: owner email verified, a passkey added, a passkey on a second device, at least two ways to sign in, and your wallet ownership proven. Each one that still needs doing says why it matters and has a button that takes you straight to the fix.
- **This sign-in** shows how you signed in (Google, email & password or passkey), when, how long you still have to add or remove a passkey (the 5-minute rule), how long until the automatic sign-out, and when the account was created. It updates on its own.
- **Ways back into your account** lists Google, email & password and your passkeys, ticked or "not set up", so you can see at a glance if you could get locked out.
- **Your account-security launch tests**: the eight login and passkey steps from Launch readiness are listed with your saved result, plus a button that opens that gate to record results.
- Passkeys are now numbered (Passkey 1, Passkey 2…) with the date added and how long ago, and removing your only passkey warns you first and tells you which sign-in method remains.
- **Copy checkup summary** copies the results with counts and dates only (no email or wallet address).
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html → Account security.

## 2026-11-05 18:25 UTC — [autopilot] Owner workspace: waitlist sign-up insights, chart and CSV download

- In your owner workspace, the **Waitlist** tab now shows a **Sign-up insights** panel as soon as you press Load registrations: total sign-ups, how many came in today, this week (with the change from the week before) and this month, and what share gave recorded consent.
- A **sign-up chart** shows sign-ups per day for the last 30 days, or per week for the last 12 weeks.
- Breakdowns show which privacy-notice version people agreed to, where they signed up, their status, and how many reach the end of their retention period within 30 days.
- Test addresses (like owner-test@example.com) are marked "(test address)" and left out of the numbers.
- **Load all registrations** fetches the rest of the list in one press, so the numbers cover everyone.
- New filter above the list: type part of an email, show only people with or without recorded consent, or hide test addresses.
- **Download CSV** saves the shown registrations as a spreadsheet file (it contains email addresses, so keep it private). **Copy summary** copies the numbers only, without any email addresses.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html → Waitlist.

## 2026-11-05 15:20 UTC — [autopilot] Owner workspace: Launch readiness becomes a working to-do list
- Launch readiness tab (owner workspace): a progress summary at the top (percent of launch steps done, gates done / needing you / waiting on others, your tests done) and "Your next steps", each one click away. https://ea-la.github.io/FYNX-Wallet/owner.html
- Every one of the 14 gates now lists concrete steps (83 in total), labelled You, Engineering or Outside party. Your steps have Passed / Failed / Not applicable buttons, a note box, and a button that opens the right tab (Crypto tools, Account security, Waitlist).
- Results are saved in your browser only. Notes that look like a recovery phrase or key are refused.
- "Copy test report" and "Download report" turn your results into a dated report you can share, so the checklist can be updated with real evidence.
- Filter the gates by All / Needs you / Waiting on others / Done.
- Dashboard tab: on iPad/iPhone Safari the dashboard preview could spill past the right edge and get cut off; it now fits the frame.
- The full checklist document on GitHub now lists the same steps with ticks.

## 2026-11-05 14:40 UTC — [autopilot] "Spot the scam" practice on the Security page
- New practice game on the Security page: ten everyday situations (a fake "support" message, a surprise token in your wallet, a copied look-alike address, a sign-in request, a withdrawal "tax", a fake sponsored search result, a phone call asking to share your screen, and some safe ones too). For each, choose "Go ahead" or "Stop" and see the red flags, what to do instead, and a link to the matching free tool. At the end you get a score and a list of the ones to review. Nothing is sent or saved. https://ea-la.github.io/FYNX-Wallet/#security/practice
- The "Is this a scam?" check now links to the practice, and the Security page's "On this page" row has a Practice button.
- The Learn page's browser tab now says "Learn crypto" instead of "Crypto glossary". https://ea-la.github.io/FYNX-Wallet/#learn

## 2026-11-05 10:20 UTC — [autopilot] "Which kind of wallet fits you?" chooser on the Learn page

- New on the Learn page: answer four quick questions (how much, how often you move it, whether you can keep a backup, who needs to approve) and get a plain-English suggestion — exchange account, app wallet, hardware wallet, a savings + spending pair, or a shared multi-signature setup — with the reasons, honest warnings, first steps and links to the matching lesson or tool. https://ea-la.github.io/FYNX-Wallet/#learn/chooser
- A side-by-side comparison of the five options: who holds the keys, what happens if you lose your phone, what happens if the company fails, main risks and who each one usually suits.
- New glossary word "Multi-signature (multisig)". https://ea-la.github.io/FYNX-Wallet/#learn/multisig
- Homepage: a line under "Start here" now links straight to the six beginner lessons and the wallet chooser. https://ea-la.github.io/FYNX-Wallet/

## 2026-11-05 06:20 UTC — [autopilot] Six beginner crypto lessons on the Learn page, and a copy-link fix

- The Learn page now opens with **"New to crypto? Start with the basics."**: six short lessons (about 18 minutes in total) on what a wallet really holds, the recovery phrase, addresses and networks, network fees, approvals and signatures, and spotting scams. Each one has key points, links to the glossary words it uses, a matching free tool, and a one-question check with an explanation. A progress bar remembers which lessons you have checked, only in your own browser, and there is a "Clear my progress" button. https://ea-la.github.io/FYNX-Wallet/#learn/lessons
- Each lesson has its own link to share, for example https://ea-la.github.io/FYNX-Wallet/#learn/lesson-phrase, and a "Next lesson" button.
- An "On this page" row at the top of the Learn page jumps to the lessons, the glossary or any topic.
- Fixed: after visiting the Questions page, "Copy link" buttons on other pages could also copy a wrong Questions link. Each page's buttons now only do their own job.

## 2026-11-05 02:20 UTC — [autopilot] "Understand a signature request" tool, and more free tools on the homepage
- New free tool on the Security page: before pressing "Confirm" or "Sign" in any wallet, paste what it asks you to sign and get a plain-English explanation of what it would allow. https://ea-la.github.io/FYNX-Wallet/#security/sign
- It recognises the requests scammers use most: unlimited token approvals (shown in red), NFT "approve all" permissions, token sends and transfers, signed "permits" that cost no fee but let someone take tokens later, Uniswap Permit2 permissions, and marketplace listings, including the well-known trick of a listing that sells your NFT for nothing.
- It also reads "Sign in with Ethereum" messages (and warns if the site named in the message doesn't match), plain text messages (with a warning for "claim", "verify" or "unlock" wording), and permission removals, which it marks as safe.
- Six "Try an example" buttons show what each kind of request looks like (made-up addresses). Spender addresses get one-tap Etherscan and Basescan buttons.
- Nothing is signed or sent. Recovery phrases, private keys and bare 64-character codes (blind signing) are cleared straight away with a warning.
- Glossary: new word "Permit (signed approval)", and "Token approval" now links to the new tool. https://ea-la.github.io/FYNX-Wallet/#learn/permit
- Homepage "Start here" row now shows eight free tools in two even rows, adding "Check a link" and "Read a signature request". https://ea-la.github.io/FYNX-Wallet/

## 2026-11-04 22:20 UTC — [autopilot] "Check a website link" scam-link checker
- New free tool on the Security page: paste any link you were sent and it tells you, in plain words, whether it looks like a scam before you open it. https://ea-la.github.io/FYNX-Wallet/#security/link
- It shows the site you would *really* be visiting (for example `metamask.io.wallet-sync.com` is really wallet-sync.com), and warns about fake brand names, look-alike spellings (metarnask.io, coinbsae.com), letters from other alphabets, hidden “@” tricks, bare number addresses, shortened links, unencrypted http links, free-hosting sites, cheap scam-prone endings and “claim / sync / restore your wallet” wording.
- Known official addresses (MetaMask, Ledger, Trezor, Coinbase, Kraken, Binance, Uniswap, OpenSea, Phantom, Trust Wallet, Rabby, Robinhood, Etherscan, Basescan, Solscan and FYNX’s own sites) are recognised and confirmed.
- The link is never opened or sent anywhere, and anything that looks like a recovery phrase or key is cleared straight away.
- Includes a short “How to read any web address” guide. The Security page’s “On this page” row and the glossary’s Phishing entry link to it.

## 2026-11-04 18:40 UTC — [autopilot] Paste an explorer link, jump around long pages, and a "Top" button

- The transaction lookup on the Networks page now understands whole links copied from Etherscan, Basescan, mempool.space, Blockstream, Solana Explorer and Solscan. It pulls out the transaction or address, shows it, and lists the link's own network first. Links from look-alike or unknown sites get a clear warning instead of buttons. See https://ea-la.github.io/FYNX-Wallet/#networks/lookup
- The Networks and Security pages now open with an "On this page" row so visitors can jump straight to each tool (and share that spot): https://ea-la.github.io/FYNX-Wallet/#networks and https://ea-la.github.io/FYNX-Wallet/#security
- A small "↑ Top" button appears after scrolling down on any long page, which helps most on phones.

## 2026-11-04 14:18 UTC — [autopilot] Look up any transaction, and a unit and fee converter

- New on the Networks page: "Look up a transaction or address". Paste a transaction ID, a wallet address or a name like vitalik.eth and get one-tap buttons to open it on the right public block explorer (Etherscan, Basescan, their test networks, mempool.space for Bitcoin, the Solana explorer). A short guide explains what to check there: status, from and to, amount, fee and confirmations. https://ea-la.github.io/FYNX-Wallet/#networks/lookup
- Built-in safety: recovery phrases and Bitcoin private keys are wiped straight away with a warning, and because a private key can look just like a transaction ID, the explorer buttons only appear after you confirm where the ID came from.
- New on the Networks page: "Convert amounts and understand fees". Convert exactly between ETH, gwei and wei, USDC and its base units, BTC and sats, SOL and lamports, and see how a network fee is worked out (gas used × gas price). Pure arithmetic, no prices. https://ea-la.github.io/FYNX-Wallet/#networks/units
- Glossary: two new words, "Gwei and wei" and "Token decimals", each linked to the converter. https://ea-la.github.io/FYNX-Wallet/#learn/gwei
- Homepage: the "Start here" row now has six free tools, adding "Track a transaction" and "Plan for your family". https://ea-la.github.io/FYNX-Wallet/

## 2026-11-04 10:17 UTC — [autopilot] A printable backup sheet for your family, and a friendlier waitlist form

- New on the Security page: "Backup instructions for your family". Fill in which wallet you use, how many words your phrase has, where the copies are kept and who to call, then print it or save it as a PDF to keep with a will. Anything left empty prints as a line to fill in by hand, and the sheet explains step by step how a family member can safely recover the wallet. It never asks for the recovery phrase: if someone types or pastes one, it is wiped straight away with a warning. Nothing is sent or saved. https://ea-la.github.io/FYNX-Wallet/#security/sheet
- The backup check on the same page now points to the new sheet as the next step.
- Waitlist form: if the email is mistyped, a clear message appears right under the field ("An email address needs an @", "Check the part after the @"…), and common slips like gmial.com or hotmial.com get a "Did you mean …gmail.com? Use this" fix. https://ea-la.github.io/FYNX-Wallet/#waitlist
- Waitlist page: a "While you wait" row of the free tools under the form, and the "You're on the list" message now links to them too.

## 2026-11-04 06:20 UTC — [autopilot] A recovery-phrase backup check and a "Start here" row for newcomers

- New on the Security page: "Is your recovery phrase backup safe?" Tick nine plain statements and get a score, with the risky gaps shown first in red and a clear fix for each one. Answers never leave the page. https://ea-la.github.io/FYNX-Wallet/#security/backup
- Homepage: a new "New to crypto? Start here." row with four free tools: glossary, backup check, scam check and address check. https://ea-la.github.io/FYNX-Wallet/
- Features, Networks and Security pages now end with a row of the crypto words they use, each linking to its glossary explanation.
- Address checker: a "Copy address" button (not shown for anything that looks like a key or recovery phrase). https://ea-la.github.io/FYNX-Wallet/#networks/check
- Features tour: pressing a jump button updates the link in the address bar, so you can share that exact part.
- New direct links to sections: #security/scam, #security/approve, #networks/plan.

## 2026-11-04 02:20 UTC — [autopilot] A crypto glossary, shareable answers, and better link previews

- New **Learn** page in the top menu: 33 crypto words explained in plain English (wallet, recovery phrase, network fee, token approval, slippage, KYC and more), grouped into five topics. Search it, filter by topic, jump between related words, and follow each word to the matching tool on the site. https://ea-la.github.io/FYNX-Wallet/#learn
- Every glossary word has its own link with a **Copy link** button, e.g. https://ea-la.github.io/FYNX-Wallet/#learn/token-approval
- Every answer on the Questions page can now be shared too: the link opens that answer and highlights it, e.g. https://ea-la.github.io/FYNX-Wallet/#faq/how-do-i-leave-the-waitlist-or-delete-my-email
- Links to the site shared in messages and social apps now show a proper title and description.

## 2026-11-03 22:17 UTC — [autopilot] Typo-catching address check, a proper "page not found", and links into the Features tour
- The address checker on the Networks page now verifies the built-in Ethereum checksum. If an address uses mixed capital letters and they don't match, it shows a red "Checksum does not match: likely a typo" warning and tells you not to send. Correct addresses show "Checksum verified". It still runs only in your browser. See https://ea-la.github.io/FYNX-Wallet/#networks
- Mistyped or old links (for example https://ea-la.github.io/FYNX-Wallet/#typo) now show a clear "This page doesn't exist" page with links to every section. Before, they showed the "You're a little early" log-in page, which was confusing.
- The three cards on the homepage now say "See how it works" and open the matching part of the Features tour (Portfolio, Buy and sell, Send and receive). See https://ea-la.github.io/FYNX-Wallet/
- The Security page checklist now links to the example review-screen walkthrough. Each part of the tour has its own link that can be shared, e.g. https://ea-la.github.io/FYNX-Wallet/#features/review
- The year in the footer now updates automatically.

## 2026-11-03 18:15 UTC — [autopilot] A full Features tour and "what happens next" on the waitlist
- The Features page is now a proper tour: Portfolio, Buy and sell, Send and receive, Swap and Your keys, each with a plain explanation, what you will see, an honest status label (for example "Planned · needs provider approval") and an example preview. Buttons at the top jump to each part. See https://ea-la.github.io/FYNX-Wallet/#features
- New "Walk through the review screen" on the same page: tap each line of an example send (recipient, network, amount, fee, approval, after sending) to learn what to check before approving. It is clearly marked as an example and nothing is sent.
- The waitlist and Log in pages now show "What happens after you join" in four steps, from signing up to when your record is deleted. See https://ea-la.github.io/FYNX-Wallet/#waitlist

## 2026-11-03 14:30 UTC — [autopilot] Address checker on Networks and a scam self-check on Security
- Networks page: a new table shows, for Ethereum, Base, Solana and Bitcoin, whether sending, receiving, swapping and buying are planned, possible or not yet planned. See https://ea-la.github.io/FYNX-Wallet/#networks
- Networks page: paste any wallet address into "Which network is this address for?" to see whether it is an Ethereum/Base, Bitcoin or Solana address, with a warning if it looks incomplete. If someone pastes a recovery phrase, it is cleared straight away with a warning. Nothing typed there leaves the browser.
- Security page: a new "Is this a scam?" check lets visitors tick warning signs and get a clear verdict, plus a "Before you approve anything" checklist, how FYNX will contact people, and where to report fraud in the U.S. See https://ea-la.github.io/FYNX-Wallet/#security
- Homepage example portfolio now labels Bitcoin and Solana as "later, separate work" so it matches the Networks page.

## 2026-11-03 10:15 UTC — [autopilot] Searchable help page and a menu for phones
- The Questions page grew from 4 to 19 answers, grouped into The waitlist, The product, and Security and privacy. It covers fees, countries, networks, card payments, how long your email is kept, how to leave the list, and who holds the keys.
- A search box filters the questions as you type, and an "Expand all" button opens every answer at once. See https://ea-la.github.io/FYNX-Wallet/#faq
- On phones, a new "Menu" button in the top bar opens Features, Networks, Security, Questions, Waitlist privacy and Log in. Before, these links were hidden on small screens.
- Keyboard users can press Tab once and choose "Skip to content" to jump past the header.

## 2026-11-03 — [autopilot] Site publishing unblocked
- A newly reported issue in two third-party building blocks was stopping the website from publishing updates. Both were updated to their fixed versions, and the site publishes again.
- Nothing changes in how the site looks or works.

## 2026-11-03 — [autopilot] Clearer header and page titles on the public site
- The black "Join waitlist" button in the top bar now has crisp white text. Before, its label was a faint grey that was hard to read.
- Each section (Features, Networks, Security, Questions, Waitlist privacy and so on) now shows its own name in the browser tab, so open tabs and bookmarks are easy to tell apart.
- The top menu now highlights the section you are viewing.
- Moving between sections now takes keyboard and screen-reader users to the new heading, so they don't have to start again from the top of the page.
