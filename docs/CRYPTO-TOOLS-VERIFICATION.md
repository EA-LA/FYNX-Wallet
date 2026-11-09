# Crypto tools verification — 2026-10-20

Scope: owner-only functionality in EA-LA/FYNX-Wallet. Public visitors remain on the waitlist. Base mainnet supports reads/quotes only; transaction preparation and submission reject mainnet. The existing dashboard continues to show clearly labeled simulated balances and trades. Real controls are in **Crypto tools**.

## Implemented and tested

- Supported networks: Ethereum Sepolia, Base Sepolia, Base mainnet (read-only).
- Native ETH and Circle's canonical USDC: live balances, strict decimals/amount limits, recipient review, network-aware receive QR, ERC20 simulation, gas/balance checks and wallet-approved transactions.
- Base ETH/USDC swaps using pinned Uniswap v3 Factory, QuoterV2 and SwapRouter02 deployments. Quotes compare the 0.05%, 0.3% and 1% pools at one block; no arbitrary token/contract/calldata is accepted. A maximum 3% estimated price impact (including pool fee), bounded slippage, deadline, minimum output and one-use review are enforced.
- USDC allowance: exact required amount, reset to zero before replacing an insufficient nonzero allowance, explicit revoke. ETH output is unwrapped and sent to the connected wallet in the same multicall.
- Session transaction journal, hash lookup and receipt states. A submitted hash is pending, never success. Successful inclusion is not a finality guarantee. The explorer remains the source for full history/replacements/finality.
- Transak staging adapter: server-side secret, fixed staging endpoints, owner/App Check gates, verified wallet binding, single-use checkout URL, private expiring reference, server order lookup with reference/wallet/product/currency checks. Missing/expired credentials and provider errors fail closed. No balance credits occur on browser messages or redirects. No production endpoint exists in this adapter.

## Evidence

`npm run check` passed 33 Node test groups plus the existing 23 preview-template checks and waitlist backend/frontend tests. New cases cover mainnet signing rejection, exact ERC20 units, changed decimals, failed simulation, insufficient tokens/gas, route failure, price impact, slippage, expiry, signed network binding, copied/replayed reviews, wallet rejection, exact/reset/revoke allowances, missing/expired/production payment configuration, unexpected checkout hosts and mismatched provider orders.

Read-only public RPC calls confirmed network identities and deployed USDC contracts. Live quotes returned on both Base and Base Sepolia (quotes are time-dependent, not fixed exchange prices).

An **isolated local fork of Base Sepolia** executed the deployed contract code and state using ephemeral local accounts:

| Operation | Result |
|---|---|
| ETH → USDC | Receipt success; USDC increased from 0 to 4.142377 in this test |
| Send USDC to second account | Receipt success; independent recipient balance increased by 0.1 USDC |
| Exact USDC approval | Receipt success; approval amount 0.1 USDC |
| USDC → ETH | Receipt success; independent ETH increase after execution fees was 23,998,879,512,961 wei in the final rerun |
| Remaining router allowance | 0 |
| Revoke allowance | Receipt success |
| Insufficient-token transfer | Rejected before broadcast |

These were **not public-chain transactions**. No real funds were moved. The local fork omitted OP deposit transaction lists because Ganache cannot decode them; public contract code/storage/state were otherwise read from Base Sepolia. See `scripts/verify-crypto-fork.mjs` for reproduction. The upstream RPC in that script rejects all write methods; transaction broadcasts go only to the local in-process EVM.

The owner Firebase function was deployed successfully with its scoped codebase selector and is ACTIVE. A fresh before/after comparison found **all 70 unrelated functions unchanged** and the shared rules releases unchanged. The existing challenge TTL remains ACTIVE.

A real browser against the deployed Firebase API verified owner access, a rejected then successful Base Sepolia wallet-ownership signature, a visible network-bound receive QR, real zero USDC balance, and a live swap quote. An unfunded swap failed before an approval review opened. Base mainnet ownership/read-only quoting worked while transfer, revoke and swap preparation controls stayed disabled. Changing networks cleared old QR/quote state; a simulated backend 503 showed an outage; sign-out cleared private results. The mobile viewport had no horizontal overflow. Temporary App Check credentials were revoked afterward, and the isolated test wallet profile was removed (the original profile was absent).

The browser used a private ephemeral software wallet and a read-only RPC bridge for acceptance. It did not use a physical Ledger, broadcast public-chain funds, or validate a normal human Google login. Screenshot capture in that headed browser timed out. A separate local layout-only browser rendered the production HTML/CSS at 1200px and 390px widths; both screenshots were visually inspected and the mobile layout had no horizontal overflow. The layout fixture contained no account data or authentication bypass in published code. GitHub Actions and the public release manifest provide the final publication evidence.

## Limits before release

- No actual hardware-wallet or public-testnet transfer/swap has been proven in this run. No real provider sandbox purchase/sale can be verified without the owner's partner credentials and required IP allowlisting.
- Automated tests use an isolated test browser and, for Firebase acceptance, an official temporary App Check debug registration. This does not certify normal browser reCAPTCHA, physical passkeys or the user's Google popup flow.
- Native ETH recipients and ERC20 recipients are limited to standard wallet addresses. Smart-contract wallets, Bitcoin, Solana, embedded wallet creation/recovery, bridges and arbitrary tokens are unsupported.
- SwapRouter02 is an existing Uniswap v3 router; this is a deliberately narrow direct-contract integration, not Universal Router/Permit2 or a best-execution aggregator. It needs independent review before real funds. Spot-price impact is not an independent fair-price oracle or MEV protection.
- Base's final fee can include an L1 data fee beyond the execution estimate. The wallet must display the final fee. Production fee estimation/reconciliation remains a gate.
- Full indexed history, production RPC resilience, customer isolation, legal/provider approval and operational response remain open. See [provider setup](PROVIDER-SETUP.md) and [launch checklist](LAUNCH-CHECKLIST.md).

## Replaced, dropped and reorganised transactions (2026-11-07)

Crypto tools → Track uses `wallet-src/tx-tracker.js` for every status check (the "Check confirmation" button after sending, "Check status" on each session transaction, and the hash lookup). It only reads the network (`eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getTransactionCount`); it never signs, sends or resends. It reports:

- **Confirmed / failed** with a confirmations count and a practical "settled" threshold (12 blocks on Ethereum Sepolia, 30 on Base networks; a testing threshold, not a finality guarantee).
- **Reorganised** when the block that held the receipt is no longer the canonical block at that height; **lagging** when the connection has not reached that block yet.
- **Replaced** when the sender's confirmed nonce has moved past this transaction's nonce (wallet "Speed up" / "Cancel"). The nonce is remembered from earlier checks so a transaction that vanished from the node is still recognised, and the receipt is read once more before saying "replaced" to avoid a race with inclusion.
- **Finding the replacement** (read-only): binary search of `eth_getTransactionCount(wallet, block)` from the submit time (at most a day back) to the first block where the nonce was used, then that block's transactions; if the connection cannot read old state (non-archive nodes keep about 128 blocks), it retries the last 120 blocks and then checks up to 20 outgoing transfers from the loaded history by ID. A match must have the same sender and nonce and a different ID. Classified as speed-up (same recipient, value and data), cancel (0 to self, no data), different, or unknown. Evidence: `tests/tx-replacement.test.mjs`. Not yet confirmed against a real wallet speed-up on a test network.
- **Looking up any ID** (2026-11-09): an ID typed into the Track lookup that was not submitted on this page gets a result card (status, wallet, recipient, nonce, block, confirmations, exact ETH amount for plain transfers, and whether FYNX sent it: this page, an earlier session in the pilot register, or not known). When the network still knows the transaction and reports it replaced, "Find the replacement" runs the same read-only search with the full one-day window (no submit time is known). A replacement found this way is not added to the pilot register. Evidence: `tests/lookup-and-ask-again.test.mjs`.
- **Wallet number check** (2026-11-09, standalone, no ID needed): reads `eth_getTransactionCount(wallet, 'latest')`, `eth_getTransactionCount(wallet, 'pending')` (optional; a connection that does not answer it is reported as not reporting waiting transactions, and a pending count below the used count is treated as none waiting) and `eth_blockNumber`. Shows numbers used, the next number, how many wait and which one blocks the rest, with wallet-side advice (speed up / cancel the oldest waiting number; never resend). Transactions submitted on this page are matched by wallet and number (not in the queue → may be dropped; number already used but still shown waiting → check again). "Which transaction used a number?" runs the read-only `findByNonce` search without an ID to exclude; for a number not used yet it points to the page transaction with that number when there is one. Nothing is added to the pilot register. Evidence: `tests/wallet-queue.test.mjs`. Not yet confirmed against a real stuck transaction on a test network.
- **Dropped** when the network has no record 10 minutes after submitting and the nonce is unused; **not yet seen** before that; **not found** for a pasted ID the network does not know.

Evidence: `tests/tx-tracker.test.mjs` (fake read-only network covering each case, malformed answers, the inclusion race, read-only method list, and the app wiring). Checklist step `assets/replace` is recorded done on this basis. The owner step `assets/lookup` (compare with the explorer on a real test network) stays open.

## Reproduce the optional contract test

Install `ganache@7.9.2` into an isolated development tooling directory, then run from the repository root:

```sh
FYNX_GANACHE_MODULE=/absolute/tooling/node_modules/ganache/dist/node/core.js node scripts/verify-crypto-fork.mjs
```

This legacy test runner is not part of the website or deployed backend. Its OP block-transaction compatibility shim is only for the isolated fork. Quotes/output amounts depend on the forked state; successful receipts and independent balance/allowance assertions determine the result.
