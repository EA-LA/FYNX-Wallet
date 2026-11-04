# Changelog

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
