// Data providers for the owner workspace: dependable network reads with a backup, full transaction
// history and market prices. Keys come only from the FYNX_PROVIDERS secret and never leave the server.
// Everything here is read-only: nothing signs, sends or moves funds.
import { Interface, getAddress, formatUnits } from 'ethers';
import { fail } from './core.js';
import { NETWORKS } from './networks.js';

const ALCHEMY_HOSTS = { 11155111: 'eth-sepolia', 84532: 'base-sepolia', 8453: 'base-mainnet' };
const ERC20 = new Interface(['function balanceOf(address) view returns(uint256)']);
const KEY = /^[A-Za-z0-9_-]{16,128}$/, CG_KEY = /^[A-Za-z0-9_-]{10,128}$/;
export const PRICE_IDS = { ETH: 'ethereum', USDC: 'usd-coin' };

// Parse the secret. Unknown fields are ignored; malformed values count as "not added".
export function providerConfig(raw) {
  let c = {};
  try { c = JSON.parse(raw || '{}') || {}; } catch { c = {}; }
  const alchemyKey = typeof c.alchemyKey === 'string' && KEY.test(c.alchemyKey) ? c.alchemyKey : null;
  const coingeckoKey = typeof c.coingeckoKey === 'string' && CG_KEY.test(c.coingeckoKey) ? c.coingeckoKey : null;
  return { alchemyKey, coingeckoKey, coingeckoPlan: c.coingeckoPlan === 'pro' ? 'pro' : 'demo', invalid: { alchemy: !!c.alchemyKey && !alchemyKey, coingecko: !!c.coingeckoKey && !coingeckoKey } };
}

// Provider first (when a key is added), the public endpoint as the backup.
export function rpcEndpoints(network, config) {
  const list = [];
  if (config.alchemyKey && ALCHEMY_HOSTS[network.id]) list.push({ name: 'Alchemy', url: `https://${ALCHEMY_HOSTS[network.id]}.g.alchemy.com/v2/${config.alchemyKey}` });
  list.push({ name: 'Public backup', url: network.rpc });
  return list;
}

async function postJSON(fetcher, url, body, timeout = 8000) {
  const response = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`status ${response.status}`);
  const data = await response.json();
  if (data?.error) throw new Error('rpc error');
  return data.result;
}

// JSON-RPC call with failover. Reports which endpoint answered; never includes the URL (it holds the key).
export async function rpc(network, method, params, config, fetcher = fetch) {
  for (const endpoint of rpcEndpoints(network, config)) {
    try { return { result: await postJSON(fetcher, endpoint.url, { jsonrpc: '2.0', id: 1, method, params }), via: endpoint.name }; }
    catch { /* try the next endpoint */ }
  }
  fail('unavailable', `${network.name} could not be reached right now. Try again shortly.`);
}

// Balances of the owner's verified wallet on every supported network (works without keys via the backup).
export async function portfolio(wallet, config, fetcher = fetch) {
  if (!wallet?.address) fail('failed-precondition', 'Verify your wallet in Crypto tools first.');
  const owner = getAddress(wallet.address);
  const rows = await Promise.all(Object.values(NETWORKS).map(async network => {
    try {
      const [eth, usdc] = await Promise.all([
        rpc(network, 'eth_getBalance', [owner, 'latest'], config, fetcher),
        rpc(network, 'eth_call', [{ to: network.usdc, data: ERC20.encodeFunctionData('balanceOf', [owner]) }, 'latest'], config, fetcher),
      ]);
      return { chainId: network.id, network: network.name, testnet: network.testnet, eth: formatUnits(BigInt(eth.result), 18), usdc: formatUnits(ERC20.decodeFunctionResult('balanceOf', usdc.result)[0], 6), via: eth.via, ok: true };
    } catch { return { chainId: network.id, network: network.name, testnet: network.testnet, ok: false }; }
  }));
  return { address: owner, rows, checkedAt: new Date().toISOString() };
}

// Full ETH + canonical USDC history for the verified wallet from the indexer (Alchemy Transfers API).
export async function history(wallet, input, config, fetcher = fetch) {
  if (!wallet?.address) fail('failed-precondition', 'Verify your wallet in Crypto tools first.');
  if (!config.alchemyKey) fail('failed-precondition', 'Full history needs your Alchemy key. See “Your services” in Launch readiness.');
  const network = NETWORKS[Number(input?.chainId)];
  if (!network) fail('invalid-argument', 'Choose a supported network.');
  const owner = getAddress(wallet.address), usdc = network.usdc.toLowerCase();
  const url = rpcEndpoints(network, config)[0].url;
  const ask = direction => postJSON(fetcher, url, { jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers', params: [{ fromBlock: '0x0', toBlock: 'latest', [direction]: owner, category: ['external', 'erc20'], withMetadata: true, excludeZeroValue: true, maxCount: '0x64', order: 'desc' }] }, 12000);
  let sent, received;
  try { [sent, received] = await Promise.all([ask('fromAddress'), ask('toAddress')]); }
  catch { fail('unavailable', 'The history provider did not respond. Check your Alchemy key in “Your services”.'); }
  const seen = new Set(), items = [];
  for (const [list, direction] of [[sent?.transfers, 'out'], [received?.transfers, 'in']]) {
    for (const t of Array.isArray(list) ? list : []) {
      const token = t.category === 'external' ? 'ETH' : String(t.rawContract?.address || '').toLowerCase() === usdc ? 'USDC' : null;
      if (!token || typeof t.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(t.hash)) continue;
      const id = `${t.uniqueId || t.hash}:${direction}`; if (seen.has(id)) continue; seen.add(id);
      let amount;
      try { amount = formatUnits(BigInt(t.rawContract?.value || '0x0'), token === 'ETH' ? 18 : 6); } catch { continue; }
      items.push({ hash: t.hash, direction, token, amount, from: safeAddress(t.from), to: safeAddress(t.to), block: Number.parseInt(t.blockNum, 16) || null, time: typeof t.metadata?.blockTimestamp === 'string' ? t.metadata.blockTimestamp : null });
    }
  }
  items.sort((a, b) => (b.block || 0) - (a.block || 0));
  return { chainId: network.id, network: network.name, explorer: network.explorer, items: items.slice(0, 100), more: (sent?.pageKey || received?.pageKey) ? true : false };
}
const safeAddress = value => { try { return getAddress(value); } catch { return null; } };

// Market prices in US dollars (CoinGecko). Cached for a minute per server instance.
let priceCache = null;
export async function prices(config, fetcher = fetch, now = Date.now()) {
  if (!config.coingeckoKey) fail('failed-precondition', 'Live prices need your CoinGecko key. See “Your services” in Launch readiness.');
  if (priceCache && now - priceCache.at < 60000) return priceCache.value;
  const pro = config.coingeckoPlan === 'pro';
  const url = `https://${pro ? 'pro-api' : 'api'}.coingecko.com/api/v3/simple/price?ids=${Object.values(PRICE_IDS).join(',')}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;
  let data;
  try {
    const response = await fetcher(url, { headers: { [pro ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key']: config.coingeckoKey, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('status');
    data = await response.json();
  } catch { fail('unavailable', 'The price provider did not respond. Check your CoinGecko key in “Your services”.'); }
  const out = {};
  for (const [symbol, id] of Object.entries(PRICE_IDS)) {
    const p = data?.[id];
    if (!Number.isFinite(p?.usd) || p.usd <= 0) fail('unavailable', 'The price provider returned an unexpected answer.');
    out[symbol] = { usd: p.usd, change24h: Number.isFinite(p.usd_24h_change) ? p.usd_24h_change : null, updatedAt: Number.isFinite(p.last_updated_at) ? new Date(p.last_updated_at * 1000).toISOString() : null };
  }
  const value = { prices: out, source: 'CoinGecko', fetchedAt: new Date(now).toISOString() };
  priceCache = { at: now, value };
  return value;
}
export function clearPriceCache() { priceCache = null; }

// "Your services": what is added and whether it answers right now. Never returns a key.
export async function servicesStatus(config, { transak, mainnet }, fetcher = fetch) {
  const check = async work => { const start = Date.now(); try { await work(); return { state: 'working', ms: Date.now() - start }; } catch { return { state: 'error' }; } };
  const alchemy = config.alchemyKey
    ? await check(() => postJSON(fetcher, rpcEndpoints(NETWORKS[84532], config)[0].url, { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }))
    : { state: config.invalid.alchemy ? 'invalid' : 'missing' };
  const coingecko = config.coingeckoKey
    ? await check(async () => { const pro = config.coingeckoPlan === 'pro'; const r = await fetcher(`https://${pro ? 'pro-api' : 'api'}.coingecko.com/api/v3/ping`, { headers: { [pro ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key']: config.coingeckoKey }, redirect: 'error', signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error('status'); })
    : { state: config.invalid.coingecko ? 'invalid' : 'missing' };
  const backup = await check(() => postJSON(fetcher, NETWORKS[84532].rpc, { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }));
  return {
    checkedAt: new Date().toISOString(),
    services: [
      { id: 'alchemy', name: 'Alchemy (network + full history)', ...alchemy, unlocks: 'Dependable balances, sending checks and full transaction history on all three networks.' },
      { id: 'coingecko', name: `CoinGecko ${config.coingeckoPlan === 'pro' ? 'Pro' : 'Demo'} (prices)`, ...coingecko, unlocks: 'Live ETH and USDC prices and your portfolio value in dollars.' },
      { id: 'backup', name: 'Public network backup', ...backup, unlocks: 'Used automatically when Alchemy is missing or down.' },
      { id: 'transak', name: 'Transak (card and bank)', state: transak?.sandboxReady ? 'working' : 'missing', unlocks: 'Buy and sell checkout in Transak’s test mode. Real payments need Transak’s business approval.' },
      { id: 'mainnet', name: 'Real-money sending (Base)', state: mainnet?.enabled ? 'on' : 'off', unlocks: 'Stays off until you turn it on yourself with limits, after the legal and security review.' },
    ],
  };
}
