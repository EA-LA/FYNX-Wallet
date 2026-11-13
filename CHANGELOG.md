# Changelog

## 2026-11-13 12:35 UTC — [autopilot] Owner workspace: a ready pilot invite list on the Waitlist tab

- The Waitlist tab has a new "Pilot invite list" box (under Address check, after you press Load registrations). It picks who to invite first when the controlled pilot opens, straight from your real waitlist.
- It leaves out people who should not be invited and says how many and why: test addresses, no recorded consent, past the retention date, likely mistyped addresses, throwaway inboxes, shared team mailboxes (you can include these with one tick) and the same inbox signed up twice (only the earliest sign-up counts).
- Choose the group size (filled in from your "Pilot size and limits" decision when you have made it) and the order: earliest sign-ups first, or a fair draw. The draw uses a code you can keep, so the same code gives the same list on any device.
- It warns when not every registration is loaded, when an invited person's sign-up is about to be deleted under the retention rule, when open privacy requests asked for removal or no contact, and that the waitlist does not record which state people live in (so you confirm that before giving access).
- "Download invite list" gives a spreadsheet (invite + reserve, in order, with notes); "Copy counts" copies a summary without any email addresses. Nothing is sent to anyone and the waitlist is not changed.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Waitlist tab, after signing in).

## 2026-11-13 06:30 UTC — [autopilot] Owner workspace: see who can spend your USDC

- Crypto tools has a new "Who can spend your USDC?" card (after Step 4 Swap). Press "Check permissions" and FYNX reads the USDC contract on the selected network to show every spending permission ("approval") your connected wallet has given: nothing allowed, an exact amount, or no limit at all, with a clear warning when an app can take everything you hold.
- The swap router that FYNX swaps use is always checked. You can add any other app or contract you once approved (with a name, saved in this browser for that network) and remove it again.
- After an approval or a "Revoke swap allowance" confirms in Track, the card reads the permissions again by itself.
- Helps with the launch test "Revoke swap allowance": when the router's allowance reads zero on the test network, one press adds that reading (network, block, time) to the test's note, so you no longer have to look it up on the block explorer. You still record Passed yourself.
- It only reads. It never approves, revokes, signs or sends anything.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Crypto tools tab, after signing in and connecting your wallet).

## 2026-11-13 02:20 UTC — [autopilot] Owner workspace: transfer results now follow you to your other devices

- When you send a test transfer from FYNX on one device and later check whether it went through, that answer (confirmed, confirmed and settled, failed, replaced in the wallet, or dropped) now goes into the Launch readiness test report together with the transfer.
- On your other device, "Bring in results from another device" shows which transfers have a newer answer ("2 checked later on the other device"), with what each device knew, and adds them. Your Dashboard "wallet tests recorded" tile and Crypto tools reconciliation then say the same thing on every device, without checking again.
- A device never replaces a newer answer with an older one. Only public transaction IDs and the fixed answer words travel; wallet addresses and notes stay on each device. Older reports still work.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Launch readiness tab → Bring in results from another device, after signing in).

## 2026-11-12 22:15 UTC — [autopilot] Owner workspace: did the last transfer go through, and new requests while you were away

- Dashboard tab → Today: the "wallet tests recorded" tile now says whether the last transfer sent from FYNX went through: confirmed, confirmed and settled, failed, replaced in the wallet, dropped (nothing spent) or not checked yet. Every status check in Crypto tools → Track remembers its final answer in this browser, so you no longer have to check again to know.
- Dashboard tab → Today → "Since your last visit": now also lists new privacy requests that arrived while you were away (type, when received, the date to answer by, and whether it is already overdue) and requests sent to outside parties (lawyer, payment provider, reviewer, data provider) with the date sent. Each row opens the right list.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Dashboard tab after signing in).

## 2026-11-12 18:16 UTC — [autopilot] Owner workspace: answers while you were away, and a crypto tools tile on Today
- Dashboard → "Since your last visit" now also lists outside parties that answered while you were away (for example "Lawyer · … (after 10 days)") and waitlist privacy requests that were answered (what was asked, the answer date, the outcome and whether it was late). Each line opens the right place: the outside hand-off list or the privacy request log.
- These come first in the list, before engineering steps, so the answers you are waiting for are not hidden. Only the request ids are kept for the comparison, never references or notes. The first visit after this update starts the comparison; nothing old shows up as new.
- Today has a sixth tile, "wallet tests recorded": how many of your crypto launch tests are recorded, how many failed, and the newest transfer this browser sent from FYNX (day and network). Clicking it opens Crypto tools at your test list. "Copy today" includes it.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Dashboard tab).

## 2026-11-12 14:45 UTC — [autopilot] Owner workspace: "Since your last visit" on the Dashboard tab
- Dashboard → "Today · What needs you" now has a "Since your last visit" box that says how long you were away and what changed in the meantime: launch steps the checklist recorded done (and by whom), your own test results recorded since then (including ones brought in from your phone or iPad), outside evidence ticked as received, and dated items that became overdue.
- Each line opens the step, date or hand-off list it is about; if there is more than fits, a link takes you to "What's been finished". "Mark as seen" starts the comparison again from now.
- A reload or switching tabs within 30 minutes keeps the same comparison, so it does not disappear while you work. The first time you open it in a browser it says there is nothing to compare yet.
- "Copy today" includes the box (fixed words and step names only, never your notes). Nothing is sent anywhere: it is kept in this browser only.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Dashboard tab).

## 2026-11-12 10:55 UTC — [autopilot] Owner workspace: a "What needs you" summary on the Dashboard tab
- Dashboard (the tab you land on after signing in) now opens with "Today · What needs you": one plain sentence with the most pressing thing (something overdue, due today, a test session under way, a failed test to retest…), then five tiles: launch steps done, your tests and decisions, dates in the next 7 days, open privacy requests and outside answers you are waiting for. Each tile takes you straight to the place where it is handled.
- Under the tiles: the overdue and upcoming dated items (with Open buttons) and your next steps, the same list as in Launch readiness. "Copy today" copies the summary (counts and fixed words only, no notes).
- Launch readiness → "What's been finished": evidence you ticked without an "Arrived" date is now listed on its own ("1 of 5 pieces has no Arrived date"), with a link to add the date. The copied history includes it.
- Crypto tools → Step 2: the USDC block-list line now says how long ago it was checked; after 10 minutes it asks you to refresh, and choosing USDC in Step 3 re-checks it by itself (read-only; sending is unchanged).
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Dashboard, Launch readiness and Crypto tools tabs).

## 2026-11-12 06:50 UTC — [autopilot] Owner workspace: your own wallet's USDC block-list status, and evidence arrivals in "What's been finished"
- Crypto tools → Step 2 Balances: when your balances load, FYNX also checks whether Circle (the USDC issuer) has blocked your connected wallet. You see a green "not on the block list", a clear red warning if it is blocked (ETH is not affected), or "could not read" — never a guess.
- If your wallet is blocked, Step 3 Send warns you when you choose USDC, and Step 4 Swap warns you before a swap, so you don't pay a network fee for a transfer that will fail. Sending and swapping themselves are unchanged.
- Launch readiness → "What's been finished": evidence from outside parties (lawyer, Transak, security reviewer, data provider) now shows up in the week it arrived, with what came in, whether the step can now be recorded and which steps it unlocks. Click a line to jump to that request. The copied history includes it.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Crypto tools and Launch readiness tabs).

## 2026-11-12 02:20 UTC — [autopilot] Owner workspace: blocked-by-USDC warning and automatic recipient check on paste
- Crypto tools → Step 3 Send: when you paste a full wallet address, FYNX now checks it on the network by itself (once per address). You can turn this off with the new "Check pasted addresses automatically" box.
- The check now also asks the USDC contract whether Circle (the company behind USDC) has blocked that address. If it has, a red "USDC blocked" warning appears at the top: a USDC transfer there would fail and still cost a fee.
- Nothing is sent or signed by these checks; the transfer review and limits are unchanged.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (sign in → Crypto tools → Step 3).

## 2026-11-11 22:20 UTC — [autopilot] Owner workspace: check a recipient on the network before sending, and name it after it worked

- Crypto tools → Step 3 Send: under the recipient check there is now a **Check this address on the network** button. With your wallet connected it looks the address up on the selected network (nothing is sent) and tells you in plain words whether it is a contract (FYNX refuses those), an upgraded “smart account” wallet (also refused), a wallet in use (how many transactions it has sent), one that only receives, or one that has **never been used** — which is how a mistyped or invented address looks, so you are told to send a small amount first.
- After your transfer to a new wallet confirms, the same box offers **Name this wallet**, so next time FYNX recognises it (and still warns about look-alikes). Names stay in this browser only.
- Typo addresses do not get a network check; the result says when it was checked and asks for a re-check after 10 minutes.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html → Crypto tools → Step 3.

## 2026-11-11 18:20 UTC — [autopilot] Owner workspace: recipient check and look-alike scam warnings in Crypto tools

- **Step 3 (Send)** now checks the recipient address as you paste it, before you review anything: a green **Known** note for wallets you named, own or sent to before (with how many times and when), an amber **Careful** note for a new recipient (send a small amount first), and a red **Stop** for a typo in the address's capital letters, a burn address, a token or swap contract (lost if you send to it) or a **look-alike** of a wallet you use.
- Look-alikes are the "address poisoning" scam: someone sends you a tiny or zero transfer from an address that starts and ends like a wallet you really use, hoping you copy the wrong one from your history later. FYNX now spots them.
- The address is also shown in groups of four (0x 036C bD53 …) so you can compare it with your wallet or Ledger screen.
- **Portfolio & history**: a red "Look-alike activity" box lists any look-alike senders and zero-value transfers in the loaded history, and those rows and wallets are marked "do not copy this address".
- Information only: it never changes or blocks a transfer; the existing review and limits stay exactly as they were.
- See it: https://ea-la.github.io/FYNX-Wallet/owner.html → Crypto tools → Step 3 and Portfolio & history (sign in first).

## 2026-11-11 14:40 UTC — [autopilot] Owner workspace: see everything that's been finished, week by week

- Launch readiness has a new **"What's been finished"** panel: every finished launch step with its date, grouped by week, newest first. It shows your own test results and the work engineering and outside parties have finished, with a filter for each.
- A small chart shows how much of the launch was done at the end of each week, so you can see the launch moving.
- Steps that were already done when the checklist was first written are shown separately, so they are not counted as new progress.
- Copy or download the history to send to your team, an adviser or an investor (step names and dates only, no notes).
- The **Progress update** now also counts engineering and outside-party steps finished in the period, not only yours.
- The full launch checklist now shows the date each finished step was done.
- See it: https://ea-la.github.io/FYNX-Wallet/owner.html → Launch readiness (sign in first).

## 2026-11-11 10:20 UTC — [autopilot] Owner workspace: a ready-to-send progress update

- Launch readiness tab (https://ea-la.github.io/FYNX-Wallet/owner.html → Launch readiness): a new **Progress update** box, between the overview and Your dates.
- Pick **Last 7 days**, **Last 14 days** or **Last 30 days**. It writes a short note on how the launch is going: how far along it is and how much that moved in the period, which steps you finished, which tests need a retest, your next steps, what each outside party (lawyer, payment provider, security reviewer, data provider) has been asked and answered, dates overdue or coming up in the next two weeks, waitlist privacy request counts and incident-practice follow-ups.
- **Copy update** (for an email, Slack or a Google Doc), **Copy one-line summary** (for a quick chat message) or **Download (.md)**. A preview shows exactly what will be sent.
- The finished steps in the box are links that take you to the step in the checklist.
- Only fixed words, dates and counts go in: your notes, references, email and wallet addresses never do, and it never claims a launch date or that FYNX is live.

## 2026-11-11 06:45 UTC — [autopilot] Owner workspace: all your dates in one place, and in your calendar

- Launch readiness tab: a new **Your dates** box right under the overview. It gathers everything in the workspace that has a date, soonest first, with anything overdue at the top in red:
  - when each open **privacy request** must be answered (30 days after it arrived),
  - when to **remind an outside party** (lawyer, payment provider, security reviewer, data provider) who has not answered a request you sent,
  - when to **ask again for missing documents** after they answered,
  - when each **account that controls FYNX** (Google, Firebase, billing, GitHub…) is due for its 90-day review.
- Each line says how many days are left (or how late it is) and has an **Open** button that takes you straight to that item.
- **Add to calendar (.ics)** downloads a calendar file you can open in Google Calendar, Apple Calendar or Outlook: each date becomes an all-day event with a 9:00 reminder (privacy answers also remind you 3 days early). Overdue items land on today. Download it again after changes and the same events are updated.
- **Copy dates** copies the list as text.
- Only fixed words go into the calendar file (request types, party, step and account names). Your own references and notes stay in this browser.
- Nothing is sent anywhere; no backend change.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Launch readiness tab, after signing in).

## 2026-11-11 02:16 UTC — [autopilot] Owner workspace: transaction history you can filter, add up, name and download

- Crypto tools → Portfolio & history: after "Load history", a new tools box appears above the list of transfers.
- **Filter** the history: received only / sent only, ETH or USDC, and a search box that finds a wallet address, a transaction ID or a name you gave a wallet. "Clear filters" resets it.
- **Totals** for what is shown: received, sent and net per asset, exact to the last digit, with the number of transfers.
- **By month** (UTC): how many transfers and how much went in and out each month.
- **Wallets you transact with**: every wallet on the other side, with transfers each way, net per asset and dates. Give any wallet your own name (for example "Ledger test account"); the name then shows in the list, the search and the spreadsheet. Names are saved in this browser only; addresses, emails, keys and recovery phrases are refused as names. A wallet you sent to only once is marked so you can double-check it.
- **Download spreadsheet (.csv)**: the filtered transfers with exact amounts, full addresses, transaction IDs, explorer links, your names and whether FYNX sent it — safe to open in Excel or Google Sheets. **Copy summary** gives totals and months only, with no addresses or IDs.
- Read-only: nothing is signed, sent or changed on any network, and no backend change is needed.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Crypto tools tab → Portfolio & history, after signing in and loading the history).

## 2026-11-10 18:30 UTC — [autopilot] Owner workspace: review the accounts that control FYNX

- Account security → new **"Accounts that control FYNX"** box. It lists the accounts that could change FYNX without ever signing in to your workspace: your owner Google account, the Firebase / Google Cloud project, Google Cloud billing, GitHub, the team inbox, and (once you use them) Transak, Alchemy and CoinGecko.
- For each one: what it controls, exactly what to check, and buttons that open its own security or "who has access" page. Then record 2-step verification (on / off / not sure), whether recovery codes are saved offline, how many people have access, and the date you reviewed it ("Reviewed today").
- Each account shows a clear state: **Gap** (2-step off or no recovery codes), **Overdue** (more than 90 days since the last review), Not reviewed, Due soon, or Reviewed with the next due date. A score shows how many are done.
- The Security checkup gets one more line for this. Gaps and overdue reviews appear in Launch readiness → "Your next steps", and a small number on the Account security tab tells you something needs a look.
- "Copy access review" gives a short summary to share (no addresses, passwords or codes). Your answers travel to your other devices inside the test report, like your other results.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Account security tab, after signing in).

## 2026-11-10 14:45 UTC — [autopilot] Owner workspace: your measured test times now move between your devices

- Launch readiness → the test report (Copy test report / Download report) now carries a **"Measured test times"** section: how long each launch test took in your finished test sessions. Only the step, the minutes and when the result was recorded go in; no notes.
- **"Bring in results from another device"** now reads those times too. Before adding, it shows how many are new, which are already here, and for each test "your time 7 → 10 min · estimate 3 min". Bringing the same report in twice adds nothing.
- So a session you timed on your phone helps plan the next one on your computer ("Plan with my own times", "Your pace" and "Your measured times" all use them).
- "Your measured times" says the times travel in your report. "Forget measured times" stays per device, and the preview says so.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Launch readiness tab, after signing in).

## 2026-11-10 12:10 UTC — [autopilot] Owner workspace: see your pace, and learn how long your tests really take

- Launch readiness → new **"Your pace"** box at the top: how many of your own steps you finished in the last four weeks, about how much testing time is left in your open tests, and how many decisions and sign-offs are still open. Once you have a steady pace (two or more steps in four weeks) it says roughly when your part will be done, with the date. It never guesses for engineering or outside parties, and says so. Open "Steps finished per week" for a small chart of the last 8 weeks.
- Test sessions now **time each test** for you: every row says "took 12 min · estimate 10 min", and the top shows the time so far. A long pause counts as a break and is not timed.
- When a session ends, the times are kept in this browser. Your next plan can use **your own times** instead of the estimates ("Plan with my own times"), so a 30-minute session really fits in 30 minutes.
- **"Your measured times"** under the planner lists each measured test, says whether your tests run longer or shorter than the estimates, flags estimates that are clearly off, and **"Copy estimates to correct"** gives a short list to share so the checklist times can be fixed. "Forget measured times" clears them (your results stay).
- "Copy session results" now adds a "Time taken" section.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Launch readiness tab, after signing in).

## 2026-11-10 06:45 UTC — [autopilot] Owner workspace: plan a test session that fits your time

- Launch readiness → new **"Plan a test session"** box. Pick how long you have (15 minutes to 1.5 hours) and tick what you have with you (a test wallet, your phone or iPad, a Ledger, your email inbox, a second Google account, your team). FYNX picks the open launch tests that fit, puts any failed test first for a retest, and keeps the right order (for example, a passkey is added before you sign in with it). It also says what was left out and why.
- Press **Start this session** to get a numbered list: the test you are on is highlighted, and you mark each one Passed, Failed or Not applicable right there. Results are the same ones the checklist and your test report use. It shows how many minutes are left, and "Copy session results" gives a short results-only summary to share.
- A session in progress is the first item in "Your next steps", and it is still there after the automatic 15-minute sign-out.
- Every one of your 33 tests now has a time estimate (and what it needs). The full checklist document shows it too, e.g. "about 5 min; needs: phone or iPad".
- Outside hand-offs: the "ask again for missing pieces" reminder now waits 14 days after the *last piece that arrived*, not only after their first answer, so you do not chase someone who is still sending documents.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Launch readiness tab, after signing in).

## 2026-11-10 02:30 UTC — [autopilot] Owner workspace: watch a stuck wallet by itself, and date the evidence you receive

- Crypto tools → Track → "Check the wallet's numbers": when something is waiting, you can tick **"Re-check this wallet every 30 seconds while something is waiting"**. FYNX reads the wallet again on its own and says what changed since the last check ("Number 5 went through; number 6 is still waiting"). It pauses when the page is hidden, when you are doing something else, or when you switch network, and switches itself off once nothing is waiting. It only reads the network: nothing is signed, sped up or cancelled.
- Pressing "Check again" yourself now also shows what changed since the previous check.
- Launch readiness → Hand off to outside parties → "What came back": every piece you tick now gets an **"Arrived" date** (today by default; change it if it came earlier). The summary line shows when things arrived ("arrived 2026-11-03 to 2026-11-06", "last piece arrived …"), the copied evidence summary lists the date next to each piece, and the dates travel to your other devices inside the test report (older reports still work).
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Crypto tools and Launch readiness tabs, after signing in).

## 2026-11-09 22:20 UTC — [autopilot] Owner workspace: see why a wallet's transactions are stuck

- Crypto tools → Step 5 Track has a new section, **"Stuck or missing transaction? Check the wallet's numbers"**. Paste any wallet address (or press "Use my connected wallet") and press Check wallet: no transaction ID needed.
- It shows how many transaction numbers the wallet has used, which number its next transaction gets, and how many are waiting. When something is stuck it names the exact number that holds up the rest and says what to do in your wallet (speed it up or cancel it; never send the same transfer again).
- Transactions you submitted on this page are matched up: ones the network no longer has in its queue, and ones that still show as waiting although their number is already used (press Check again on them).
- "Which transaction used a number?": type a number (or press "Find the last used number") and FYNX shows the transaction with that number: explorer link, confirmed / failed / not yet, and one press to look it up in full.
- FYNX only reads the network: nothing is signed, sent or saved. It clears when you sign out.
- Also: the previous update's automatic publish run failed on GitHub's side before it started; this update publishes everything again.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Crypto tools tab, after signing in).

## 2026-11-09 18:20 UTC — [autopilot] Owner workspace: find a lost transaction from its wallet and number

- Crypto tools → Step 5 Track: when you look up a transaction ID the network no longer knows (for example one that was sped up or cancelled in another app), the result now offers **Search by wallet and number**. Paste the wallet address (or press "Use my connected wallet") and the transaction number ("Nonce" on the explorer), and FYNX shows the transaction that used that number: explorer link, confirmed / failed / not yet, block and confirmations, and whether it was a cancel.
- One press on "Look up this transaction" opens the found transaction in the same card.
- Clear answers when the wallet has not used that number yet, or when it was used further back than the network connection can read (with what to do instead).
- FYNX only reads the network: nothing is signed, sent or saved.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Crypto tools tab, after signing in).

## 2026-11-09 14:55 UTC — [autopilot] Owner workspace: look up any transaction, and a reminder when outside parties still owe documents

- Crypto tools → Step 5 · Track: checking a transaction ID that was not sent from this page (for example from another wallet app) now shows a full result card: status, explorer link, sender, recipient, transaction number, block, confirmations, the exact ETH amount for simple transfers, and whether FYNX sent it (this page, an earlier session, or not that this browser knows), plus what to do next.
- If that transaction was sped up or cancelled, "Find the replacement" shows which transaction took its place and whether it is confirmed. "Check again" follows a waiting one; "Clear" removes the card. Only reads the network; nothing is signed or sent.
- Launch readiness → Hand off to outside parties: when a party answered but some of the documents you asked for are still missing, the request now says how many are missing and from which day to ask again. After 14 days it turns amber, the party button shows "to ask again for missing pieces", and it appears in "Your next steps" as "Ask again for missing pieces" (one press opens the list).
- The list you copy for that party now says how many days have passed since their answer while the remaining points are still needed.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Crypto tools and Launch readiness tabs, after signing in).

## 2026-11-09 10:40 UTC — [autopilot] Owner workspace: see which transaction replaced a sped-up or cancelled one

- Crypto tools → Step 5 · Track: when you press "Speed up" or "Cancel" in your wallet, the original transaction shows "Replaced". FYNX now finds the transaction that took its place by itself and shows it under the original: its ID (opens the explorer), whether it was a speed-up, a cancel or something different, and whether it is confirmed (with confirmations) or failed.
- Buttons "Find the replacement", "Look again" and "Check the replacement again" on replaced transactions. Only reads the network; nothing is signed or sent.
- Crypto tools → Portfolio & history → Reconciliation: a sped-up transfer no longer shows up as "not submitted from FYNX". The original is explained (in the history under the new ID, cancelled so nothing moved, failed, or not listed yet, in which case the history is loaded again by itself). The replacement is remembered in this browser for later checks.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Crypto tools tab, after signing in).

## 2026-11-09 06:40 UTC — [autopilot] Owner workspace: tick off what each outside party sent back

- Launch readiness → "What can move now" → "Hand off to outside parties": every request to your lawyer, Transak, the security reviewer and the market-data provider now has a "What came back" list (for example: the written memo, approved terms, signed agreement, final report, retest letter, licence terms). Tick each piece as it arrives.
- Each request shows "2 of 5 received · still missing: …" or "Everything is in"; the party buttons show how many pieces have arrived.
- The list you copy for a party now thanks them for what arrived and asks only for what is still missing; a request that is complete stops asking questions.
- When everything for a request is in, "Your next steps" tells you to share the documents. "Copy evidence summary" gives a ready list to send with them. Ticking alone never marks a launch step done.
- The ticks travel with your test report, so another device can bring them in.
- See it: https://ea-la.github.io/FYNX-Wallet/owner.html (Launch readiness tab)

## 2026-11-09 02:40 UTC — [autopilot] Owner workspace: track when you asked outside parties and when they answered

- Launch readiness → What can move now → Hand off to outside parties: under every request to your lawyer, payment provider, security reviewer or market-data provider you can now record the day you sent it and the day the answer came (or press "Sent today" / "Answered today").
- Each request says where it stands: not sent yet, waiting (how many days, and from which day to send a reminder), "send a reminder" after 14 days without an answer, or answered (and how many days it took).
- The party buttons show how many requests are waiting, to chase or answered. Requests that need a reminder appear at the top of "Your next steps", and one press opens the request.
- When you copy the list again for a party, it now says "Reminder: we first sent this request on …".
- The dates travel with your test report to your other devices (only dates, nothing you typed).
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (Launch readiness tab).

## 2026-11-08 22:16 UTC — [autopilot] Owner workspace: ready-to-send lists for your lawyer, payment provider, security reviewer and price provider

- Launch readiness → "What can move now" has a new "Hand off to outside parties" box. Pick who you are writing to (Lawyer, Payment provider (Transak), Independent security reviewer, Market-data provider). Each card says how many requests you can send them now and how many are still waiting.
- For the one you pick you see every launch step that party owns: "Ask now", "Not yet" (with links to the exact steps that must be finished first, and whose they are) or "Done" / "Not needed". If you decided customers connect their own wallet, the wallet-creation review is shown as not needed.
- "Copy the list" (or Download) gives you an email-ready list: who they are (from your decision worksheet, e.g. your law firm and whether it is engaged), the numbered questions they need to answer, what to ask them to send back as proof, and the documents to send them. Your notes are never included, and the list reminds you never to send keys or passwords.
- Fixed: step names ending in "U.S." lost their final dot in the "waits for" lines and in the full checklist.
- See it: https://ea-la.github.io/FYNX-Wallet/owner.html (Launch readiness tab).

## 2026-11-08 18:20 UTC — [autopilot] Owner workspace: hand-off list for engineering and "blocked by" on every gate

- Launch readiness → "What can move now" has a new "Hand off to engineering" box. One press copies (or downloads) a short list for your engineer or Claude: the engineering steps that can start today (the ones that unlock the most later work first), the ones still waiting and on what, any of your tests that failed, and the decisions only you (or an outside party) can make to unblock engineering. "Preview the list" shows it before you copy. Your notes are never included.
- Each launch gate now shows a "Blocked by" line with the exact steps holding it up (who owns each one, and how many steps it holds). Each one is a link that jumps to that step. The gate bar also says how many of its steps are waiting.
- See it: https://ea-la.github.io/FYNX-Wallet/owner.html (Launch readiness tab).

## 2026-11-08 14:40 UTC — [autopilot] Owner workspace: Launch readiness shows what can move now and what is waiting

- Launch readiness has a new "What can move now" panel under the progress overview: how many steps are ready for you right now, how many are ready for engineering or outside parties, and how many are waiting on another step.
- "Do these first" picks the three steps that free the most other work (for example: verifying your test wallet frees 11 later steps; hiring U.S. counsel frees 8).
- Each list opens the exact step in the checklist below, highlighted, so you can record the result straight away.
- Steps that only make sense after another one (sign in with a passkey after adding one; the Transak sandbox test after the key and redeploy; counsel's review after hiring counsel; pilot approval after the audit and legal work) now say "Waiting" and show "Best done after: …" with a link to that step. It is a suggested order: you can still record any result.
- "Your next steps" now skips steps that are still waiting on something else, so it always suggests something you can actually do today.
- The full checklist document on GitHub lists the same order next to each step.
- See it: https://ea-la.github.io/FYNX-Wallet/owner.html (Launch readiness tab).

## 2026-11-08 10:17 UTC — [autopilot] Owner workspace: reconciliation re-loads the history by itself; privacy request deletions follow you between devices

- Crypto tools → Portfolio & history → Reconciliation: when a transfer you sent is confirmed on the network but the history provider has not listed it yet, the workspace now loads the history again by itself after about 45 seconds (at most twice) and tells you when. No more pressing "Load history" over and over during a pilot check. "Don't reload automatically" turns it off. It only reads; it waits while the tab is in the background and stops when you sign out.
- Waitlist → Privacy requests: deleting a request now travels in the Launch readiness test report. On your other device the import preview shows "deleted on the other device, will be deleted here" (with that device's own reference) before you press Add.
- Fixed: bringing in an older test report used to bring back privacy requests you had already deleted. It no longer does.
- See it: https://ea-la.github.io/FYNX-Wallet/owner.html (Crypto tools → Portfolio & history; Waitlist → Privacy requests; Launch readiness → Bring in results from another device).

## 2026-11-08 06:16 UTC — [autopilot] Owner workspace: pilot transfers follow you between devices; waitlist removal is double-checked

- Launch readiness → "Copy test report" now also carries the pilot transfer list from Crypto tools → Reconciliation: the transactions you sent from FYNX and the outside transfers you marked as yours. Paste the report on your other device under "Bring in results from another device" and its reconciliation knows them too, so a check on your computer no longer flags transfers you sent or explained on your phone. Only public transaction IDs travel; wallet addresses stay on each device.
- The import preview shows each transfer that will be added (network, time, FYNX label or your reason) before you press Add. If both devices marked the same transfer differently, the later one wins.
- Waitlist tab: after you remove a test address, a new "Check it is gone" button runs the same exact search you use for real requests and shows a clear "gone" or "still found". If it is still there, the launch test is recorded as Failed; the saved note says what the check found (no email address).
- See it: https://ea-la.github.io/FYNX-Wallet/owner.html (Launch readiness → Bring in results from another device; Waitlist tab after removing a test address).

## 2026-11-08 02:20 UTC — [autopilot] Owner workspace: reconciliation remembers your FYNX transfers and lets you sign off the rest

- Crypto tools → Portfolio & history → Reconciliation now remembers, in this browser, every transaction you send from the workspace. A check on a later day no longer calls your own earlier FYNX transfers "not from this page".
- New "Outgoing transfers to check" list: each transfer that did not come from FYNX on this browser, with a link to the explorer, a "How was it sent?" choice (earlier FYNX session, another device, another wallet app, between my own wallets) and "Mark as mine" (with Undo). Once everything is explained, the result can turn "Balanced". The reasons appear in the saved reconciliation report. Transfers above your limit stay flagged even when marked.
- When a waiting transaction settles in Step 5 · Track, the reconciliation updates straight away and tells you to load the history again.
- "Forget remembered transfers" clears the list in this browser. Only public transaction IDs are kept; nothing is signed or sent.
- See it: https://ea-la.github.io/FYNX-Wallet/owner.html (Crypto tools tab, after Load history).

## 2026-11-07 22:18 UTC — [autopilot] Owner workspace: pilot reconciliation and a rollback plan

- **Crypto tools → Portfolio & history** now has a **Reconciliation** box. After you check balances and load the history for a network, it tells you in one line whether everything adds up: **Balanced**, **Needs a look** or **Not finished**.
- It lists what came in and went out (ETH and USDC), matches each transfer with the ones you sent from this page, flags any outgoing transfer you did not start here, flags any real-money transfer on Base above your per-transfer limit (or the 0.1 ETH / 250 USDC pilot ceiling), checks that your USDC balance matches the history to the last cent, and explains the small ETH difference as network fees.
- Transactions that failed, were dropped or are still waiting are explained in plain words instead of looking like a mismatch.
- **Copy** or **Download** a reconciliation report for your pilot records (totals, findings, dates, shortened addresses and public transaction IDs only). Read-only: nothing is signed, sent or saved.
- New written **rollback plan** (docs/PILOT-ROLLBACK.md): when to stop the pilot, the exact steps (turn off real-money sending first), how to reconcile afterwards and what must be true before reopening.
- **Launch readiness → Incident practice run** has a fifth practice situation, "Pilot transfers do not add up", to rehearse the rollback with your team.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html → Crypto tools → Portfolio & history (needs the server update from the services setup guide to load history), and Launch readiness → Incident practice run.

## 2026-11-07 18:30 UTC — [autopilot] Owner workspace: privacy requests and practice runs now move between your devices

- The test report you copy on one device (Launch readiness → Copy test report) now also carries your waitlist privacy request log and your finished incident practice runs.
- On another device, "Bring in results from another device" shows which privacy requests and practice runs are new, changed or already there before you add them. Answering a request on your phone and importing on your computer updates it; a follow-up ticked off on one device shows as done on the other.
- Privacy entries travel with dates, request type and answer only. Your references and notes stay on the device where you typed them, and no email address is ever in the report.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html → Launch readiness → "Bring in results from another device".

## 2026-11-07 14:40 UTC — [autopilot] Owner workspace: privacy deadlines visible everywhere; track all transactions at once
- The **Waitlist** tab button now shows how many privacy requests are still open. It turns amber when one is due within 7 days and red when one is overdue, so you see it from any tab.
- **Launch readiness → Your next steps** now starts with any overdue or nearly-due privacy request ("Asked to be removed: answer by …"). Pressing it opens the Waitlist tab right on that request.
- **Crypto tools → Step 5 Track** has a new **Check all waiting** button that checks every unfinished test transaction in one go and sums up the result in one line.
- New option **Re-check every 30 seconds while something is waiting**: it keeps checking on its own while the page is open, pauses when the page is in the background, and switches itself off when everything is settled or you sign out. It only reads the network; it never signs or resends anything.
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html (sign in as the owner).

## 2026-11-07 10:20 UTC — [autopilot] Waitlist: a privacy request log so no access or removal request is missed

- New **Privacy requests** section on the Waitlist tab of your owner workspace (https://ea-la.github.io/FYNX-Wallet/owner.html → Waitlist).
- Add each request with the day it arrived and what the person asked for (what we hold, removal, address fix, no more contact, other), plus an optional reference such as the email subject. Email addresses are refused, so the log never holds personal details.
- Every request counts down to its 30-day due date: amber in the last 7 days, red when overdue. Press **Mark answered** with the date and the answer you gave; it shows whether you were on time and how many days it took.
- Totals at the top: open, overdue, due soon, and answered on time with the average days.
- **Copy request log** / **Download log** gives a dated record without email addresses. After a draft privacy reply opens, **Add to privacy request log** fills in the type for you.
- Saved only in this browser. The operating procedure (docs/OPERATIONS.md) now includes the step.

## 2026-11-07 07:20 UTC — Real-money sending: your own switch and limits

- **Crypto tools → Real-money sending (Base)** (new): you can turn real-money sending on yourself. Enter your limits per transfer (up to 0.1 ETH and 250 USDC during the pilot) and type TURN ON REAL MONEY. It needs a sign-in from the last 5 minutes, and every change is written to the security log.
- When it's on, ETH and USDC transfers on Base get the same review, simulation and checks as on the test networks, and your wallet still asks you to approve each one. Anything above your limit is refused. Swaps with real money stay off.
- **Turn off** works at once, even for a transfer you were in the middle of reviewing. The switch is off by default and also shows in "Your services".
- The FYNX owner function needs one deploy to use this (docs/SERVICES-SETUP.md, step 4).
- See it at https://ea-la.github.io/FYNX-Wallet/owner.html → Crypto tools.

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
