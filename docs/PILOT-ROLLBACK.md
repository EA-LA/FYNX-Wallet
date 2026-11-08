# Pilot rollback and reconciliation plan

This is the plan for the **pilot / rollback** launch step: how to stop a small real-money pilot quickly and safely, and how to prove afterwards that every transfer is accounted for. It does not switch anything on. Real-money sending on Base stays off until you turn it on yourself ([SERVICES-SETUP.md](SERVICES-SETUP.md#turning-on-real-money-sending-base)).

FYNX is self-custody: FYNX never holds customer funds and cannot reverse, freeze or recover an on-chain transfer. "Rollback" therefore means **stop new activity, put the software back to the last good version, and reconcile** — not undoing transfers.

The launch step stays open until you have (1) run the rollback practice below with at least one other person and (2) saved a reconciliation report for a real pilot or test session. Record both in Launch readiness with a short note (dates and outcome only, no addresses or keys).

## When to roll back

Roll back as soon as any of these happens during the pilot. Do not wait to find the cause first.

- A reconciliation shows **Needs a look** that you cannot explain within one hour: an outgoing transfer nobody recognises, a transfer above your per-transfer limit, or a USDC balance that does not match the history.
- A signed-in session, passkey or wallet that is not yours appears (follow [OPERATIONS.md](OPERATIONS.md#incident-response) as well).
- A release changed the wallet, transfer or sign-in code and something behaves differently from the test sessions.
- Support receives the same complaint from two pilot users within a day (for example "my transfer shows the wrong amount").
- The history or network provider is down long enough that you can no longer check transfers (see "Your services" in Launch readiness).

## Roll back, step by step

Write the UTC time next to each step as you do it.

1. **Stop new real-money transfers.** Crypto tools → Real-money sending → **Turn off**. It takes effect at once, also for a transfer someone was reviewing, and is written to the security audit log (`mainnet.off`). If the workspace cannot be reached, contain the owner function as described in OPERATIONS.md step 2 (deny-all handler for `fynxWalletWorkspace` only; never touch other services in the shared project).
2. **Tell the pilot group** in the agreed support channel: new transfers are paused, funds in their own wallets are not affected, and when the next update will come. Do not promise a cause or a date you do not know.
3. **Freeze releases.** No new commits to `main` until the rollback is closed, except the rollback itself.
4. **Put the website back** to the last good version: revert the faulty commit in Git, run `npm run check`, push, and confirm the GitHub Actions run and the published manifest ([RELEASE-PROCESS.md](RELEASE-PROCESS.md#backend-changes-and-rollback)).
5. **Put the server back** if the server changed: deploy the last reviewed source of the owner function only, with its matching website version. Never roll back database data or delete customer records.
6. **Reconcile** every network used in the pilot (next section) and keep the reports.
7. **Decide on reopening.** Reopen only when the reconciliation is **Balanced** (or every flag is explained in writing), the cause is fixed and retested, and you give written approval. Turning real-money sending back on needs a fresh sign-in and the typed confirmation, as before.

## Reconcile after a rollback

Use **Crypto tools → Portfolio & history** (read-only; nothing is signed or sent):

1. Press **Check balances** (reads the verified wallet on every network).
2. Choose the network and press **Load history**. The **Reconciliation** box then compares three things:
   - every ETH and USDC transfer in the history with the transactions submitted from this page session,
   - outgoing transfers on Base with your per-transfer limit (or the pilot ceiling of 0.1 ETH / 250 USDC when sending is off),
   - the USDC balance with what the history explains (it must match exactly) and the ETH balance (normally a little lower, because network fees are not listed in the history).
3. Read the result:
   - **Balanced** — everything is explained.
   - **Needs a look** — an outgoing transfer was not started from this page, a transfer is above the limit, or the USDC balance differs. Explain each one in writing before reopening.
   - **Not finished** — balances not checked yet, a transaction is still waiting, or the history has more than 100 transfers (only the newest 100 are checked; use the explorer for older ones).
4. **Copy** or **Download** the report and keep it with the pilot records. It contains totals, findings, dates, shortened addresses and public transaction IDs — never keys or full addresses.

Every transaction you submit from the owner workspace is remembered in that browser (public transaction ID, network, wallet, label and time; nothing else), so a reconciliation on a later day still knows it came from FYNX. Outgoing transfers that were not submitted from FYNX on that browser are listed under "Outgoing transfers to check": open each on the explorer and, if it was yours, choose how it was sent (earlier FYNX session, another device, another wallet app, between your own wallets) and press "Mark as mine". The reason appears in the saved report. If you do not recognise a transfer, do not mark it: follow the rollback steps above. A marked transfer above the limit is still flagged. "Forget remembered transfers" clears the list in that browser. If a waiting transaction settles in Track while a history is loaded, the reconciliation updates and asks you to load the history again.

## Practise it

Before the pilot, practise the rollback once:

1. Launch readiness → **Incident practice run** → choose **Pilot transfers do not add up**. Walk through all seven stages with at least one other person and note any gaps as follow-ups.
2. On a test network, send one small test transfer from Crypto tools, then run the reconciliation and save the report. It should read **Balanced** once the transfer is confirmed and the balances are checked.
3. Record the pilot / rollback step in Launch readiness with the date of the practice run and of the saved report.
