import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { address, fail } from './core.js';
import { ORIGIN } from './config.js';
const API = 'https://api-gateway-stg.transak.com/api/v2/auth/session';
export function sandboxConfig(raw) {
  try {
    const c = JSON.parse(raw || '{}');
    if (c.enabled !== true || c.environment !== 'STAGING' || typeof c.apiKey !== 'string' || c.apiKey.length < 16 || typeof c.accessToken !== 'string' || c.accessToken.length < 20 || !Number.isFinite(c.expiresAt) || c.expiresAt * 1000 <= Date.now() + 60000) return null;
    return c;
  } catch { return null; }
}
export function providerStatus(raw) {
  const configured = !!sandboxConfig(raw);
  return { sandboxReady: configured, productionReady: false, message: configured ? 'Sandbox credentials are configured. Select Ethereum Sepolia and verify your wallet to test checkout. Provider acceptance and IP allowlisting still apply. Production payments are disabled.' : 'Card/bank checkout is not connected. Create a Transak partner sandbox, arrange its required IP allowlisting, then store the staging API key and current access token in the FYNX_TRANSAK_SANDBOX secret. Mainnet payments stay disabled.' };
}
async function providerFetch(fetcher, url, options) {
  let response;
  try { response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) }); }
  catch { fail('unavailable', 'The payment provider did not respond. No payment is confirmed.'); }
  if (!response.ok) fail('unavailable', 'The payment provider rejected the request. Check sandbox credentials, expiry and IP allowlisting. No payment is confirmed.');
  try { return await response.json(); } catch { fail('unavailable', 'The payment provider response could not be verified.'); }
}
export async function createCheckout({ raw, db, uid, wallet, input, ip, fetcher = fetch }) {
  const config = sandboxConfig(raw);
  if (!config) fail('failed-precondition', providerStatus(raw).message);
  if (!['BUY', 'SELL'].includes(input.direction)) fail('invalid-argument', 'Choose buy or sell.');
  if (!wallet || wallet.chainId !== 11155111 || address(input.address) !== wallet.address) fail('permission-denied', 'Verify the same Ethereum Sepolia wallet before testing checkout.');
  if (!isIP(ip || '')) fail('failed-precondition', 'The originating connection could not be verified.');
  const id = randomBytes(24).toString('hex');
  const result = await providerFetch(fetcher, API, {
    method: 'POST', headers: { 'content-type': 'application/json', 'access-token': config.accessToken, 'x-api-key': config.apiKey, 'x-user-ip': ip },
    body: JSON.stringify({ widgetParams: { apiKey: config.apiKey, referrerDomain: new URL(ORIGIN).host, productsAvailed: input.direction, fiatCurrency: 'USD', cryptoCurrencyCode: 'ETH', network: 'ethereum', walletAddress: wallet.address, disableWalletAddressForm: true, partnerOrderId: id, themeColor: '242834', hideMenu: true } }),
  });
  let url;
  try { url = new URL(result.data.widgetUrl); } catch { fail('unavailable', 'Invalid checkout response.'); }
  if (url.origin !== 'https://global-stg.transak.com' || url.username || url.password || !url.searchParams.get('sessionId')) fail('unavailable', 'Unexpected checkout destination.');
  // Existing private challenge collection already has an expiry TTL policy.
  await db.collection('fynxWalletChallenges').doc(id).create({ kind: 'fiat-sandbox', uid, address: wallet.address, direction: input.direction, createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 86400000) });
  return { id, url: url.href, sandbox: true, expiresAt: Date.now() + 300000 };
}
export async function checkoutStatus({ raw, db, uid, input, fetcher = fetch }) {
  const config = sandboxConfig(raw);
  if (!config) fail('failed-precondition', 'Sandbox credentials are missing or expired.');
  if (!/^[a-f0-9]{48}$/.test(input.sessionId || '') || !/^[a-f0-9-]{36}$/i.test(input.orderId || '')) fail('invalid-argument', 'Enter the checkout session and provider order ID.');
  const snap = await db.collection('fynxWalletChallenges').doc(input.sessionId).get(), session = snap.exists ? snap.data() : null;
  if (!session || session.kind !== 'fiat-sandbox' || session.uid !== uid || session.expiresAt.toMillis() <= Date.now()) fail('permission-denied', 'This checkout is not available to this account.');
  const result = await providerFetch(fetcher, `https://api-stg.transak.com/partners/api/v2/order/${input.orderId}`, { headers: { 'access-token': config.accessToken, 'x-api-key': config.apiKey } });
  const order = result.data;
  if (!order || order._id !== input.orderId || order.partnerOrderId !== input.sessionId || order.walletAddress?.toLowerCase() !== session.address.toLowerCase() || order.isBuyOrSell !== session.direction || order.network !== 'ethereum' || order.cryptoCurrency !== 'ETH' || order.fiatCurrency !== 'USD') fail('permission-denied', 'The provider order does not match this checkout.');
  if (typeof order.status !== 'string' || !/^[A-Z_]{3,60}$/.test(order.status)) fail('unavailable', 'Unrecognized provider order status.');
  // Return provider status only. Never credit a balance or trust a redirect/message as settlement.
  return { sandbox: true, status: order.status, message: `Provider sandbox status: ${order.status}. This is not a real payment or confirmation that ETH was delivered. Check balances independently.` };
}
