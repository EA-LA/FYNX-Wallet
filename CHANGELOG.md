# Changelog

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
