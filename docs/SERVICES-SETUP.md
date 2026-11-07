# Add your service keys (the "fuel")

FYNX Wallet's server is built to use these services as soon as their keys are added. You add each key once, privately, in Google Cloud. Then you press **Check my services** in the owner workspace (**Launch readiness → Your services**).

Never paste a key into the owner workspace, chat, email, GitHub or a screenshot. Keys live only in Google Cloud Secret Manager and are read only by the FYNX server.

| Service | What it switches on | Cost to start |
| --- | --- | --- |
| Alchemy | Dependable network reads on Ethereum Sepolia, Base Sepolia and Base (with the public endpoint as an automatic backup), plus full ETH/USDC transaction history in **Crypto tools → Portfolio & history** | Free tier available |
| CoinGecko | Live ETH and USDC prices and your Base portfolio value in dollars | Free "Demo" key available |
| Transak | Card and bank buy/sell checkout, **test mode only** until Transak approves your business ([PROVIDER-SETUP.md](PROVIDER-SETUP.md)) | Partner account |

Portfolio balances already work without any key: they use the public endpoint until Alchemy is added.

## Step 1 — Alchemy key

1. Sign in at [alchemy.com](https://www.alchemy.com/) and create an app.
2. Turn on these networks for the app: **Ethereum Sepolia**, **Base Sepolia** and **Base Mainnet**.
3. Copy the app's **API key**. This is the short key, not the full URL.

## Step 2 — CoinGecko key

1. Sign in at [coingecko.com](https://www.coingecko.com/en/developers/dashboard) and create a **Demo** API key (free). If you buy a paid plan later, use `"coingeckoPlan":"pro"` below.
2. Copy the key.

## Step 3 — Put both keys into Google Cloud (one secret)

1. Open [Secret Manager for fynx-c7a28](https://console.cloud.google.com/security/secret-manager?project=fynx-c7a28).
2. Choose **Create secret**. Name it exactly `FYNX_PROVIDERS`. If it already exists, open it and choose **New version** instead.
3. Paste this value, putting your keys in place of the capital words:

   ```json
   {"alchemyKey":"YOUR_ALCHEMY_KEY","coingeckoKey":"YOUR_COINGECKO_KEY","coingeckoPlan":"demo"}
   ```

   You can leave a key out until you have it. `{}` on its own is fine: the server starts, and the missing services show **Not added yet**.
4. Let the FYNX server read the secret. Open the secret, choose **Permissions → Grant access**, add `fynx-wallet-runtime@fynx-c7a28.iam.gserviceaccount.com` and give it the role **Secret Manager Secret Accessor**. Do this for this one secret only.

The secret must exist (even as `{}`) **before** the next deploy, or the deploy stops with a "secret not found" error.

## Step 4 — Deploy only the owner function

From the repository folder, with the Firebase CLI signed in to the owner account:

```sh
firebase deploy --only functions:fynx-wallet-workspace:fynxWalletWorkspace --project fynx-c7a28 --config firebase-wallet/firebase.json
```

This deploys only the FYNX owner function. Never run a plain `firebase deploy` in this shared project. After a deploy, the server picks up new secret versions only on the next deploy. Repeat this step whenever you change a key.

## Step 5 — Check

1. Open the [owner workspace](https://ea-la.github.io/FYNX-Wallet/owner.html) → **Launch readiness → Your services → Check my services**. Each service shows **Working**, **Not added yet**, **Key looks wrong** or **Not answering**.
2. Open **Crypto tools → Portfolio & history**. Press **Check balances**, then choose a network and press **Load history**. Compare one transfer with the block explorer link next to it.
3. Record the results in Launch readiness (Assets gate: "Compare balances" and "Track confirmation").

## If something is wrong

- **Key looks wrong:** the value is too short or contains spaces. Copy the key again (just the key, not a URL) and add a new secret version.
- **Not answering:** the provider rejected the key, or the network for it is not enabled in the Alchemy app. Check the app's networks and the key, add a new version, then deploy again.
- **"Your FYNX server has not been updated with this feature yet":** do Step 4.
- To turn a service off, add a new secret version without its key and deploy.

## Turning on real-money sending (Base)

This is a switch, not a key. It is off until you turn it on:

1. Sign in again (the server needs a sign-in from the last 5 minutes).
2. Open **Crypto tools → Real-money sending**. Enter your maximum ETH and USDC per transfer (pilot ceiling: 0.1 ETH and 250 USDC), type `TURN ON REAL MONEY` and press **Turn on with these limits**.
3. Choose **Base** as the network. Transfers then go through the same review, simulation and checks as on the test networks, and your wallet still asks you to approve each one. Swaps with real money stay off.
4. **Turn off** takes effect at once, also for a transfer you were reviewing. Each change is written to the security audit log.

Do this only after the security review, legal and pilot gates in Launch readiness are done. The switch needs the same owner-function deploy as Step 4.

## What a key cannot switch on

Real-money sending on Base stays off until you turn it on yourself (above). Public customer accounts, live card payments and other countries need the release gates in [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md).
