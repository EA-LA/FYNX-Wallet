# FYNX provider setup and remaining release gates

Updated 2026-10-20. These instructions prepare testing; adding keys does not open mainnet or public accounts.

## What runs without a paid wallet or swap API

- Existing browser wallets (including Ledger accounts exposed through compatible extensions) retain the keys and approve transactions. Google/email/passkeys identify the FYNX account; they do not create or recover wallet keys.
- ETH and canonical USDC balances, receive QR codes and test transfers use the connected wallet's RPC. Base is the intended first production network; Base mainnet currently permits balances and quotes only.
- Swaps call pinned Uniswap v3 contracts directly. There is no FYNX swap API subscription or FYNX test service fee. Pool fees and blockchain fees still apply. Public RPC endpoints are rate-limited and require a production reliability plan.
- Test limits: 0.01 ETH / 25 USDC per action, 0.1/0.5/1% slippage, estimated price impact including pool fee <=3%, 60-second quote/review. The contract also enforces deadline and minimum received.

## Owner steps for cards and banks

The prepared adapter uses **Transak staging**, not MoonPay. FYNX remains the product; Transak is an external payment/identity provider. You must agree to the provider's terms and obtain its business approval yourself. No account has been created or contract accepted on your behalf.

1. Create a [Transak partner account](https://docs.transak.com/guides/how-to-create-partner-dashboard-account). Obtain its **staging** API key and partner access token; enable SELL if needed. Use its official process to generate/renew the access token. Never paste secrets in chat, GitHub issues or frontend configuration.
2. Ask Transak to approve the required backend IPs. Its current session API requires IP allowlisting. Standard Firebase Functions outbound addresses are not fixed. Arrange static egress with a reviewed VPC/NAT configuration or a provider-approved alternative before expecting checkout to work. This can add ongoing cost; none was provisioned here.
3. In Google Cloud Secret Manager for `fynx-c7a28`, edit the existing **FYNX_TRANSAK_SANDBOX** secret to contain this JSON shape (replace placeholders privately):

   ```json
   {"enabled":true,"environment":"STAGING","apiKey":"STAGING_KEY","accessToken":"CURRENT_PARTNER_ACCESS_TOKEN","expiresAt":0}
   ```

   Set `expiresAt` to the provider's actual Unix expiry time in **seconds**. The initial secret is `{}`, so checkout stays disabled. The runtime account has access to this one secret. The access token must be renewed before expiry; automatic partner-token rotation is not implemented. Never use production credentials in this adapter.
4. Redeploy only the owner function to bind the new secret version:

   ```sh
   firebase deploy --only functions:fynx-wallet-workspace:fynxWalletWorkspace --project fynx-c7a28 --config firebase-wallet/firebase.json
   ```
5. Sign into [the owner workspace](https://ea-la.github.io/FYNX-Wallet/owner.html), open **Crypto tools**, select Ethereum Sepolia, connect and verify your wallet, then **Check integration status**. Create a sandbox BUY or SELL checkout and open its single-use URL within five minutes.
6. Use [Transak's sandbox instructions](https://docs.transak.com/guides/sandbox-credentials). Staging native ETH purchases do **not** deliver ETH; a completed sandbox order is not proof of asset delivery. The provider describes test-token delivery separately. Follow its off-ramp test instructions; never send mainnet funds to staging.
7. Enter the provider order ID in the same session and verify it from the server. FYNX validates the private partner reference, wallet, direction, network and currencies. A redirect or browser message never credits a balance or marks a payment complete. Verify failed/refunded/cancelled flows too. If an actual provider response omits a required binding field, keep the order unverified and reconcile the integration with its current API schema.

No actual provider sandbox session has been tested without your credentials. Production checkout, signed webhook processing, automated reconciliation, refunds/disputes workflow and customer eligibility remain additional work after sandbox access. The order-status adapter polls only when requested and returns a provider sandbox status; it is not an accounting ledger.

## Work still needed before customers can use real money

- **Wallet experience:** decide whether external-wallet connection satisfies launch. An embedded/new-wallet flow, backup/export and wallet recovery are not built. Never import an existing Ledger recovery phrase into FYNX.
- **Live acceptance:** physical-device signing/rejection, Google and passkey flows in normal browsers, public-testnet transfer/swap with independent balances, gas shortfall, RPC outage and recovery.
- **Production engineering:** dedicated origin/security headers, dependable RPC/indexer, full transaction history, pending/replacement/reorg recovery, market data, monitoring/alerts, backups/restore drill, independent security review, incident response.
- **Customer accounts:** per-user authorization and isolation, customer recovery/support, abuse controls and separate customer records. The current backend intentionally authorizes one owner.
- **Payments/business:** provider approval and supported U.S. states/products, production settlement and reconciliation, refunds/chargebacks, fee disclosures and operating support. An API key alone does not provide these.
- **Legal:** verify FYNX finance world inc.'s incorporation details and have qualified counsel review the precise custody/payment model, U.S. federal/state obligations and customer terms. Approve each additional country separately. See [legal operating review](LEGAL-OPERATING-REVIEW.md).
- **Release:** complete the evidence checklist, set controlled limits and obtain explicit owner approval before enabling mainnet or removing the waitlist. Changing an API key cannot bypass this gate.

Sources: [Base connections](https://docs.base.org/get-started/connect-to-base), [Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses), [Uniswap deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments), [Transak session API](https://docs.transak.com/api/public/create-widget-url), [provider order API](https://docs.transak.com/api/public/get-order-by-order-id).
