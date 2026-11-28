import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Interface } from 'ethers';
import {
  SWAP_TOPIC, swapLogs, verifyPool, networkFee, summarizeSwap, quoteLine, swapRows, swapStep, swapEvidence, swapEvidenceNote,
  readSwapResult, looksLikeSwap, amountText,
} from '../wallet-src/swap-result.js';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';
import { looksSecret } from '../wallet-src/launch-tracker.js';

const NET = NETWORKS[84532], BASE = NETWORKS[8453];
const WALLET = '0x5a3c00000000000000000000000000000000b7e9';
const POOL = '0x9999999999999999999999999999999999999999';
const FAKE_POOL = '0x8888888888888888888888888888888888888888';
const HASH = `0x${'ab'.repeat(32)}`;
const TWO_256 = 1n << 256n;
const word = n => (n < 0n ? n + TWO_256 : n).toString(16).padStart(64, '0');
const topicAddr = a => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
// Base Sepolia: USDC (0x036c…) sorts before WETH (0x4200…), so token0 = USDC and token1 = WETH.
const usdcIs0 = BigInt(NET.usdc) < BigInt(NET.weth);
function swapLog({ pool = POOL, eth, usdc, recipient = WALLET }) {
  const [a0, a1] = usdcIs0 ? [usdc, eth] : [eth, usdc];
  return { address: pool, topics: [SWAP_TOPIC, topicAddr(NET.router), topicAddr(recipient)], data: `0x${word(a0)}${word(a1)}${word(1n)}${word(1n)}${word(0n)}` };
}
const receipt = (logs, extra = {}) => ({ transactionHash: HASH, blockNumber: '0x1f4', status: '0x1', gasUsed: '0x249f0', effectiveGasPrice: '0x3b9aca00', logs, ...extra });
const POOL_IFACE = new Interface(['function token0() view returns(address)', 'function token1() view returns(address)', 'function fee() view returns(uint24)']);
const FACTORY_IFACE = new Interface(['function getPool(address,address,uint24) view returns(address)']);

function fakeRequest({ rc, tx = { hash: HASH, from: WALLET, to: NET.router }, pools = { [POOL]: { fee: 500, real: POOL } } } = {}) {
  const calls = [];
  const request = async ({ method, params }) => {
    calls.push(method);
    if (method === 'eth_getTransactionByHash') return tx;
    if (method === 'eth_getTransactionReceipt') return rc;
    if (method === 'eth_call') {
      const { to, data } = params[0], target = to.toLowerCase();
      if (target === NET.factory.toLowerCase()) {
        const [, , fee] = FACTORY_IFACE.decodeFunctionData('getPool', data);
        const hit = Object.values(pools).find(p => p.fee === Number(fee));
        return FACTORY_IFACE.encodeFunctionResult('getPool', [hit?.real || `0x${'0'.repeat(40)}`]);
      }
      const p = pools[target];
      if (!p) throw new Error('execution reverted');
      const fn = POOL_IFACE.parseTransaction({ data }).name;
      const [t0, t1] = usdcIs0 ? [NET.usdc, NET.weth] : [NET.weth, NET.usdc];
      return POOL_IFACE.encodeFunctionResult(fn, [fn === 'token0' ? (p.token0 || t0) : fn === 'token1' ? (p.token1 || t1) : p.fee]);
    }
    throw new Error(`unexpected ${method}`);
  };
  return { request, calls };
}

test('ETH → USDC: paid, received, the quote, the pool rate and the fee, read from the receipt', async () => {
  const rc = receipt([swapLog({ eth: 1_000_000_000_000_000n, usdc: -2_512_345n })], { l1Fee: '0x64' });
  const quote = { amountIn: 1_000_000_000_000_000n, expectedOut: 2_520_000n, minimum: 2_507_400n, slippageBps: 50, inSymbol: 'ETH', outSymbol: 'USDC' };
  const { request, calls } = fakeRequest({ rc });
  const r = await readSwapResult(request, HASH, { network: NET, wallet: WALLET, quote });
  assert.equal(r.state, 'swap');
  assert.equal(r.direction, 'eth-usdc');
  assert.equal(r.paid.symbol, 'ETH'); assert.equal(r.paid.units, 1_000_000_000_000_000n);
  assert.equal(r.received.symbol, 'USDC'); assert.equal(r.received.units, 2_512_345n);
  assert.equal(r.headline, 'You paid 0.001 ETH and received 2.512345 USDC.');
  assert.equal(r.price, '1 ETH = 2,512.34 USDC'); // rounded down, never up
  assert.equal(r.poolFee, 500);
  assert.equal(r.feeWei, 150000n * 1_000_000_000n + 100n); // gas × price + Base's L1 data fee
  assert.equal(r.quote.diff, -7_655n);
  assert.equal(quoteLine(r), '0.30% less than quoted (0.007655 USDC), within your 0.5% slippage limit.');
  const rows = Object.fromEntries(swapRows(r, { testnet: true }));
  assert.equal(rows['You paid'], '0.001 ETH');
  assert.equal(rows['You received'], '2.512345 USDC');
  assert.equal(rows['Quote you approved'], '2.52 USDC expected, at least 2.5074');
  assert.match(rows['Rate in this test pool'], /test network, not a market price/);
  assert.equal(rows.Pool, 'Uniswap v3 ETH/USDC, 0.05% pool fee');
  assert.equal(rows['Network fee paid'], '0.00015 ETH');
  assert.equal(rows.Block, '500');
  // Reads only: nothing that signs or sends.
  assert.ok(calls.every(m => ['eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_call'].includes(m)));
});

test('USDC → ETH: received as ETH via the router; no quote means no comparison', async () => {
  const rc = receipt([swapLog({ eth: -390_000_000_000_000n, usdc: 1_000_000n, recipient: NET.router })]);
  const r = await readSwapResult(fakeRequest({ rc }).request, HASH, { network: NET, wallet: WALLET });
  assert.equal(r.direction, 'usdc-eth');
  assert.equal(r.paid.symbol, 'USDC'); assert.equal(r.received.units, 390_000_000_000_000n);
  assert.equal(r.toRouter, true);
  assert.equal(r.quote, undefined); assert.equal(quoteLine(r), '');
  const rows = Object.fromEntries(swapRows(r, { testnet: true }));
  assert.equal(rows['You received'], '0.00039 ETH (paid out as ETH by the swap router)');
  assert.equal(rows['Quote you approved'], undefined);
  assert.equal(r.price, '1 ETH = 2,564.10 USDC');
  assert.equal(swapStep(r, NET), 'swaps/swap-usdc');
  // A quote for another direction or amount is never compared.
  const other = summarizeSwap({ hash: HASH, tx: { from: WALLET }, receipt: rc, network: NET, wallet: WALLET, pools: new Map([[POOL, { pool: POOL, token0: usdcIs0 ? NET.usdc.toLowerCase() : NET.weth, token1: usdcIs0 ? NET.weth : NET.usdc.toLowerCase(), fee: 500 }]]), quote: { amountIn: 1n, expectedOut: 5n, inSymbol: 'ETH', outSymbol: 'USDC' } });
  assert.equal(other.quote, undefined);
});

test('a look-alike pool emitting the same event is never reported as the ETH/USDC swap', async () => {
  // Wrong tokens.
  const rc = receipt([swapLog({ pool: FAKE_POOL, eth: 10n ** 15n, usdc: -2_500_000n })]);
  const wrongTokens = fakeRequest({ rc, pools: { [FAKE_POOL]: { fee: 500, real: POOL, token0: '0x1111111111111111111111111111111111111111' } } });
  assert.equal((await readSwapResult(wrongTokens.request, HASH, { network: NET, wallet: WALLET })).state, 'unknown-pool');
  // Right tokens, but the factory says the real pool is another address.
  const copy = fakeRequest({ rc, pools: { [FAKE_POOL]: { fee: 500, real: POOL } } });
  assert.equal((await readSwapResult(copy.request, HASH, { network: NET, wallet: WALLET })).state, 'unknown-pool');
  // A contract that is not a pool at all (calls revert).
  const none = fakeRequest({ rc, pools: {} });
  assert.equal(await verifyPool(none.request, FAKE_POOL, NET), null);
  assert.equal((await readSwapResult(none.request, HASH, { network: NET, wallet: WALLET })).state, 'unknown-pool');
});

test('failed, waiting, no swap, several swaps and malformed events', async () => {
  const failed = await readSwapResult(fakeRequest({ rc: receipt([], { status: '0x0' }) }).request, HASH, { network: NET, wallet: WALLET });
  assert.equal(failed.state, 'failed'); assert.match(failed.headline, /nothing was swapped/);
  assert.deepEqual(Object.fromEntries(swapRows(failed)), { 'Network fee paid': '0.00015 ETH', Block: '500' });
  assert.equal(swapStep(failed, NET), null);
  assert.equal((await readSwapResult(fakeRequest({ rc: null }).request, HASH, { network: NET })).state, 'waiting');
  assert.equal((await readSwapResult(fakeRequest({ rc: receipt([]) }).request, HASH, { network: NET })).state, 'not-swap');
  const two = receipt([swapLog({ eth: 10n ** 15n, usdc: -2n }), swapLog({ eth: 10n ** 15n, usdc: -3n })]);
  assert.equal((await readSwapResult(fakeRequest({ rc: two }).request, HASH, { network: NET })).state, 'several');
  assert.deepEqual(swapLogs({ logs: [{ address: POOL, topics: [SWAP_TOPIC], data: '0x12' }, { address: 'nope', topics: [SWAP_TOPIC], data: '0x' }, null] }), []);
  assert.equal(networkFee({ gasUsed: 'x' }), null);
  await assert.rejects(readSwapResult(fakeRequest({ rc: null }).request, 'nope', { network: NET }), /valid transaction hash/);
  await assert.rejects(readSwapResult(fakeRequest({ rc: { ...receipt([]), transactionHash: `0x${'cd'.repeat(32)}` } }).request, HASH, { network: NET }), /different transaction/);
});

test('launch-test evidence: only your own swap on a test network, short ID, replaces the same swap, never looks secret', async () => {
  const rc = receipt([swapLog({ eth: 10n ** 15n, usdc: -2_512_345n })]);
  const quote = { amountIn: 10n ** 15n, expectedOut: 2_520_000n, minimum: 2_507_400n, slippageBps: 50, inSymbol: 'ETH', outSymbol: 'USDC' };
  const r = await readSwapResult(fakeRequest({ rc }).request, HASH, { network: NET, wallet: WALLET, quote });
  assert.equal(swapStep(r, NET), 'swaps/swap-eth');
  assert.equal(swapStep(r, BASE), null); // never on real money
  const someoneElse = await readSwapResult(fakeRequest({ rc, tx: { hash: HASH, from: '0x' + '7'.repeat(40) } }).request, HASH, { network: NET, wallet: WALLET });
  assert.equal(someoneElse.mine, false); assert.equal(swapStep(someoneElse, NET), null);
  assert.match(Object.fromEntries(swapRows(someoneElse))['Sent by'], /not the connected wallet/);
  const line = swapEvidence(r);
  assert.equal(line, `Swap ${HASH.slice(0, 10)}… on Base Sepolia, block 500: paid 0.001 ETH, received 2.512345 USDC (quoted 2.52), network fee 0.00015 ETH.`);
  assert.ok(!line.includes(HASH));
  assert.equal(looksSecret(line), false);
  const first = swapEvidenceNote(line, 'Ledger Nano X');
  assert.equal(first, `Ledger Nano X; ${line.replace(/\.$/, '')}`);
  assert.equal(swapEvidenceNote(line, first), first); // the same swap again replaces, not repeats
  assert.equal(swapEvidenceNote(line, 'x'.repeat(270)), null);
  assert.equal(swapEvidence(await readSwapResult(fakeRequest({ rc: null }).request, HASH, { network: NET })), '');
});

test('amounts, the quote sentence and which transactions are worth reading', () => {
  assert.equal(amountText(1_234_567_890n, 6), '1,234.56789');
  assert.equal(amountText(10n ** 18n, 18), '1');
  assert.equal(amountText(1n, 18, 8), '0');
  assert.equal(amountText(null, 6), '—');
  const r = { received: { symbol: 'USDC', decimals: 6 }, quote: { diff: 0n, diffBps: 0, slippageBps: 50 } };
  assert.equal(quoteLine(r), 'Exactly the amount quoted.');
  assert.equal(quoteLine({ ...r, quote: { diff: 1_000n, diffBps: 4 } }), '0.04% more than quoted (0.001 USDC extra).');
  assert.equal(quoteLine({ ...r, quote: { diff: -1n, diffBps: 0, slippageBps: 50 } }), 'Under 0.01% less than quoted (0.000001 USDC), within your 0.5% slippage limit.');
  assert.match(quoteLine({ ...r, quote: { diff: -9n, diffBps: -90, belowMinimum: true } }), /Less than the minimum/);
  assert.equal(looksLikeSwap({ status: 'confirmed', call: { to: NET.router.toLowerCase() } }, NET), true);
  assert.equal(looksLikeSwap({ status: 'pending', call: { to: NET.router.toLowerCase() } }, NET), false);
  assert.equal(looksLikeSwap({ status: 'confirmed', call: { to: NET.usdc.toLowerCase() } }, NET), false);
  assert.equal(looksLikeSwap({ status: 'confirmed', call: { to: NET.router } }, { router: null }), false);
});

test('the page reads swap results without signing and offers the evidence to the right launch tests', () => {
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  const mod = readFileSync(new URL('../wallet-src/swap-result.js', import.meta.url), 'utf8');
  assert.doesNotMatch(mod, /eth_sendTransaction|eth_sign|personal_sign|localStorage/);
  assert.match(app, /swapQuote: swapQuoteOf\(current\)/);
  assert.match(app, /'swaps\/swap-eth': 'Complete the ETH → USDC swap'/);
  assert.match(app, /'swaps\/swap-usdc': 'Swap USDC back to ETH'/);
  const plan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
  const swaps = plan.items.find(i => i.id === 'swaps').steps.map(s => s.id);
  assert.ok(swaps.includes('swap-eth') && swaps.includes('swap-usdc'));
});
