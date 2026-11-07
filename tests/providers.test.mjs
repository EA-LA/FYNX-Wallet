import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Interface } from 'ethers';
import { providerConfig, rpcEndpoints, rpc, portfolio, history, prices, clearPriceCache, servicesStatus } from '../firebase-wallet/functions/providers.js';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';

const ALCHEMY = 'alchemy_test_key_0123456789', CG = 'CG-test-key-012345';
const config = providerConfig(JSON.stringify({ alchemyKey: ALCHEMY, coingeckoKey: CG }));
const none = providerConfig('{}');
const wallet = { address: '0x00000000000000000000000000000000000000aa', chainId: 84532 };
const json = (result, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => result });
const ERC20 = new Interface(['function balanceOf(address) view returns(uint256)']);

test('config: missing, malformed and odd values count as not added; keys never leak into status', async () => {
  for (const raw of ['', '{}', 'not json', 'null', JSON.stringify({ alchemyKey: 'short' }), JSON.stringify({ alchemyKey: 'has spaces in it 12345' })]) assert.equal(providerConfig(raw).alchemyKey, null, raw);
  assert.equal(providerConfig(JSON.stringify({ alchemyKey: 'short' })).invalid.alchemy, true);
  assert.equal(config.coingeckoPlan, 'demo'); assert.equal(providerConfig(JSON.stringify({ coingeckoKey: CG, coingeckoPlan: 'pro' })).coingeckoPlan, 'pro');
  const status = await servicesStatus(config, { transak: { sandboxReady: false }, mainnet: { enabled: false } }, async () => json({ result: '0x10' }));
  const text = JSON.stringify(status);
  assert.ok(!text.includes(ALCHEMY) && !text.includes(CG), 'no key in status');
  assert.deepEqual(status.services.map(s => [s.id, s.state]), [['alchemy', 'working'], ['coingecko', 'working'], ['backup', 'working'], ['transak', 'missing'], ['mainnet', 'off']]);
  const empty = await servicesStatus(providerConfig(JSON.stringify({ alchemyKey: 'bad' })), {}, async () => { throw new Error('down'); });
  assert.deepEqual(empty.services.map(s => s.state), ['invalid', 'missing', 'error', 'missing', 'off']);
});

test('network reads use Alchemy first and fall back to the public endpoint; errors hide the key', async () => {
  const base = NETWORKS[84532];
  assert.deepEqual(rpcEndpoints(base, none).map(e => e.name), ['Public backup']);
  assert.equal(rpcEndpoints(base, config)[0].url, `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY}`);
  assert.equal(rpcEndpoints(NETWORKS[8453], config)[0].url.startsWith('https://base-mainnet.g.alchemy.com/'), true);
  assert.equal(rpcEndpoints(NETWORKS[11155111], config)[0].url.startsWith('https://eth-sepolia.g.alchemy.com/'), true);
  const calls = [];
  const flaky = async url => { calls.push(url); if (url.includes('alchemy')) throw new Error('down'); return json({ result: '0x2a' }); };
  assert.deepEqual(await rpc(base, 'eth_blockNumber', [], config, flaky), { result: '0x2a', via: 'Public backup' });
  assert.equal(calls.length, 2);
  await assert.rejects(rpc(base, 'eth_blockNumber', [], config, async () => json({ error: { message: ALCHEMY } })), e => e.code === 'unavailable' && !e.message.includes(ALCHEMY));
});

test('portfolio reads the verified wallet on every network; a failing network is reported, not invented', async () => {
  const fetcher = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.includes('sepolia.base') || url.includes('base-sepolia')) return json({ result: body.method === 'eth_getBalance' ? '0xde0b6b3a7640000' : ERC20.encodeFunctionResult('balanceOf', [25_500000n]) });
    if (url.includes('base-mainnet') || url.includes('mainnet.base')) throw new Error('down');
    return json({ result: body.method === 'eth_getBalance' ? '0x0' : ERC20.encodeFunctionResult('balanceOf', [0n]) });
  };
  const p = await portfolio(wallet, config, fetcher);
  const byId = Object.fromEntries(p.rows.map(r => [r.chainId, r]));
  assert.equal(byId[84532].eth, '1.0'); assert.equal(byId[84532].usdc, '25.5'); assert.equal(byId[84532].via, 'Alchemy');
  assert.equal(byId[8453].ok, false); assert.equal(byId[8453].eth, undefined);
  assert.equal(byId[11155111].ok, true);
  await assert.rejects(portfolio(null, config, fetcher), { code: 'failed-precondition' });
});

test('history needs a key, merges sent and received, keeps only ETH and canonical USDC', async () => {
  await assert.rejects(history(wallet, { chainId: 84532 }, none, async () => json({})), { code: 'failed-precondition' });
  await assert.rejects(history(wallet, { chainId: 1 }, config, async () => json({})), { code: 'invalid-argument' });
  const usdc = NETWORKS[84532].usdc, h = n => `0x${String(n).repeat(64)}`;
  const fetcher = async (url, options) => {
    const p = JSON.parse(options.body).params[0];
    assert.equal(p.order, 'desc'); assert.deepEqual(p.category, ['external', 'erc20']);
    if (p.fromAddress) return json({ result: { transfers: [
      { hash: h(1), category: 'external', from: wallet.address, to: '0x00000000000000000000000000000000000000bb', blockNum: '0x10', rawContract: { value: '0x38d7ea4c68000' }, metadata: { blockTimestamp: '2026-11-07T10:00:00.000Z' } },
      { hash: h(2), category: 'erc20', from: wallet.address, to: '0x00000000000000000000000000000000000000bb', blockNum: '0x12', rawContract: { address: usdc.toLowerCase(), value: '0xf4240' } },
      { hash: h(3), category: 'erc20', from: wallet.address, to: '0x00000000000000000000000000000000000000bb', blockNum: '0x13', rawContract: { address: '0x00000000000000000000000000000000000000cc', value: '0x1' } },
      { hash: 'not-a-hash', category: 'external', blockNum: '0x1', rawContract: { value: '0x1' } },
    ] } });
    return json({ result: { transfers: [{ hash: h(4), category: 'external', from: '0x00000000000000000000000000000000000000bb', to: wallet.address, blockNum: '0x11', rawContract: { value: '0xde0b6b3a7640000' } }], pageKey: 'next' } });
  };
  const r = await history(wallet, { chainId: 84532 }, config, fetcher);
  assert.deepEqual(r.items.map(i => [i.hash.slice(0, 4), i.direction, i.token, i.amount]), [['0x22', 'out', 'USDC', '1.0'], ['0x44', 'in', 'ETH', '1.0'], ['0x11', 'out', 'ETH', '0.001']]);
  assert.equal(r.more, true); assert.equal(r.explorer, 'https://sepolia.basescan.org');
  await assert.rejects(history(wallet, { chainId: 84532 }, config, async () => json({}, false)), e => e.code === 'unavailable' && !e.message.includes(ALCHEMY));
});

test('prices need a key, validate the answer, use the right plan header and cache for a minute', async () => {
  clearPriceCache();
  await assert.rejects(prices(none, async () => json({})), { code: 'failed-precondition' });
  let calls = 0, seen;
  const fetcher = async (url, options) => { calls++; seen = { url, headers: options.headers }; return json({ ethereum: { usd: 3012.5, usd_24h_change: -1.25, last_updated_at: 1794000000 }, 'usd-coin': { usd: 0.9998, usd_24h_change: 0.01, last_updated_at: 1794000000 } }); };
  const p = await prices(config, fetcher, 1000);
  assert.equal(p.prices.ETH.usd, 3012.5); assert.equal(p.prices.USDC.change24h, 0.01); assert.equal(p.source, 'CoinGecko');
  assert.ok(seen.url.startsWith('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,usd-coin')); assert.equal(seen.headers['x-cg-demo-api-key'], CG);
  await prices(config, fetcher, 30000); assert.equal(calls, 1, 'cached');
  await prices(config, fetcher, 62000); assert.equal(calls, 2, 'refreshed');
  clearPriceCache();
  await prices(providerConfig(JSON.stringify({ coingeckoKey: CG, coingeckoPlan: 'pro' })), fetcher, 1); assert.ok(seen.url.startsWith('https://pro-api.coingecko.com/')); assert.equal(seen.headers['x-cg-pro-api-key'], CG);
  clearPriceCache();
  await assert.rejects(prices(config, async () => json({ ethereum: { usd: 'NaN' } })), { code: 'unavailable' });
  clearPriceCache();
});

test('backend wires the actions behind owner authorization and a separate secret', async () => {
  const src = await readFile(new URL('../firebase-wallet/functions/index.js', import.meta.url), 'utf8');
  assert.match(src, /defineSecret\('FYNX_PROVIDERS'\)/); assert.match(src, /secrets: \[transakSandbox, dataProviders\]/);
  const guard = src.indexOf('await ownerGuard(');
  for (const action of ['services-status', 'portfolio', 'history', 'prices']) { const at = src.indexOf(`case '${action}'`); assert.ok(at > guard, `${action} after the owner check`); }
  assert.ok(!/case 'portfolio'[^\n]*input\.address/.test(src), 'portfolio uses the server-side verified wallet, never a client address');
});
