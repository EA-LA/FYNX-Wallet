import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toUnits, fromUnits, transferLimit, reconcile, reconcileReport, shortAddress } from '../wallet-src/reconcile.js';

const W = '0x1111111111111111111111111111111111111111';
const A = '0x2222222222222222222222222222222222222222';
const h = n => '0x' + String(n).padStart(64, '0');
const base = { id: 8453 }, sepolia = { id: 84532 };
const item = (n, direction, token, amount, extra = {}) => ({ hash: h(n), direction, token, amount, from: direction === 'in' ? A : W, to: direction === 'in' ? W : A, block: 100 + n, time: `2026-11-0${(n % 9) + 1}T10:00:00.000Z`, ...extra });

test('decimal helpers use exact integer math', () => {
  assert.equal(toUnits('1.25', 6), 1250000n);
  assert.equal(toUnits('0.1', 18) + toUnits('0.2', 18), toUnits('0.3', 18));
  assert.equal(toUnits('1.0', 6), 1000000n);
  for (const bad of ['', '-1', '1e3', 'abc', '1.1234567', null, '0x10']) assert.equal(toUnits(bad, 6), null, String(bad));
  assert.equal(fromUnits(1250000n, 6), '1.25');
  assert.equal(fromUnits(-300000000000000n, 18), '-0.0003');
  assert.equal(fromUnits(0n, 18), '0');
  assert.equal(shortAddress(W), '0x1111…1111');
  assert.equal(shortAddress('nope'), 'unknown');
});

test('limits only apply on Base: the owner limit when on, otherwise the pilot ceiling', () => {
  assert.equal(transferLimit(84532, 'ETH', null), null);
  assert.deepEqual(transferLimit(8453, 'USDC', null).value, '250');
  assert.equal(transferLimit(8453, 'USDC', null).source, 'the pilot ceiling');
  const on = transferLimit(8453, 'ETH', { enabled: true, ETH: '0.02', USDC: '50' });
  assert.equal(on.value, '0.02'); assert.equal(on.source, 'your limit'); assert.equal(on.units, 20000000000000000n);
});

test('a clean test session balances: history matches the page and the balances', () => {
  const history = { chainId: 84532, network: 'Base Sepolia', more: false, items: [item(1, 'in', 'ETH', '0.05'), item(2, 'in', 'USDC', '10'), item(3, 'out', 'USDC', '2.5'), item(4, 'out', 'ETH', '0.01')] };
  const journal = [{ hash: h(3), label: '2.5 USDC', network: sepolia, address: W, status: 'confirmed' }, { hash: h(4), label: 'ETH transfer', network: sepolia, address: W, status: 'confirmed' }];
  const r = reconcile({ history, journal, wallet: W, balances: { chainId: 84532, ok: true, eth: '0.0399', usdc: '7.5' }, now: Date.UTC(2026, 10, 7, 21) });
  assert.equal(r.state, 'balanced');
  assert.equal(r.matched, 2);
  assert.equal(r.outside.length, 0);
  assert.deepEqual(r.totals.USDC, { in: '10', out: '2.5', net: '7.5', inCount: 1, outCount: 1 });
  assert.equal(r.balance.USDC.state, 'match');
  assert.equal(r.balance.ETH.state, 'fees');
  assert.equal(r.balance.ETH.difference, '-0.0001');
  assert.ok(r.findings.some(f => /0\.0001 ETH below/.test(f.text)));
  assert.equal(r.flags, 0);
});

test('outside transfers, a USDC gap and above-limit sends on Base need a look', () => {
  const history = { chainId: 8453, network: 'Base', more: false, items: [item(1, 'in', 'USDC', '400'), item(2, 'out', 'USDC', '300'), item(3, 'out', 'USDC', '40')] };
  const journal = [{ hash: h(3), label: '40 USDC', network: base, address: W, status: 'confirmed' }];
  const r = reconcile({ history, journal, wallet: W, balances: { chainId: 8453, ok: true, eth: '0', usdc: '50' }, policy: { enabled: true, ETH: '0.02', USDC: '50' } });
  assert.equal(r.state, 'review');
  assert.equal(r.outside.length, 1);
  assert.equal(r.outside[0].hash, h(2));
  assert.equal(r.overLimit.length, 1);
  assert.equal(r.overLimit[0].aboveLimit.source, 'your limit');
  assert.equal(r.balance.USDC.state, 'differs');
  assert.equal(r.balance.USDC.difference, '-10');
  assert.ok(r.flags >= 3);
  // With sending off, the pilot ceiling (250 USDC) is the limit.
  const off = reconcile({ history, journal, wallet: W, policy: null });
  assert.equal(off.overLimit[0].aboveLimit.source, 'the pilot ceiling');
  // Test networks never flag limits.
  assert.equal(reconcile({ history: { ...history, chainId: 84532 }, journal: [] }).overLimit.length, 0);
});

test('submitted-but-missing transactions are explained by their status', () => {
  const history = { chainId: 84532, network: 'Base Sepolia', more: false, items: [] };
  const journal = ['confirmed', 'failed', 'dropped', 'replaced', 'pending'].map((status, i) => ({ hash: h(10 + i), label: `Tx ${status}`, network: sepolia, address: W, status }));
  journal.push({ hash: h(20), label: 'Other network', network: base, address: W, status: 'confirmed' });
  journal.push({ hash: h(21), label: 'Other wallet', network: sepolia, address: A, status: 'confirmed' });
  const r = reconcile({ history, journal, wallet: W, balances: { chainId: 84532, ok: true, eth: '0', usdc: '0' } });
  assert.equal(r.missing.length, 5);
  const tone = Object.fromEntries(r.missing.map(m => [m.status, m.tone]));
  assert.deepEqual(tone, { confirmed: 'todo', failed: 'ok', dropped: 'ok', replaced: 'todo', pending: 'todo' });
  assert.ok(r.findings.some(f => /different connected wallet/.test(f.text)));
  assert.equal(r.state, 'incomplete');
});

test('a partial history or missing balances never reports balanced', () => {
  const items = [item(1, 'in', 'USDC', '5')];
  const partial = reconcile({ history: { chainId: 84532, network: 'Base Sepolia', more: true, items }, balances: { chainId: 84532, ok: true, eth: '0', usdc: '5' } });
  assert.equal(partial.balance.USDC.state, 'partial'); assert.equal(partial.state, 'incomplete');
  const noBalances = reconcile({ history: { chainId: 84532, network: 'Base Sepolia', more: false, items } });
  assert.equal(noBalances.balance.USDC.state, 'unknown'); assert.equal(noBalances.state, 'incomplete');
  const wrongChain = reconcile({ history: { chainId: 84532, network: 'Base Sepolia', more: false, items }, balances: { chainId: 8453, ok: true, eth: '0', usdc: '5' } });
  assert.equal(wrongChain.balance.USDC.state, 'unknown');
  const unreachable = reconcile({ history: { chainId: 84532, network: 'Base Sepolia', more: false, items }, balances: { chainId: 84532, ok: false } });
  assert.equal(unreachable.balance.USDC.state, 'unknown');
});

test('malformed history rows are ignored, not counted', () => {
  const items = [item(1, 'in', 'USDC', '5'), { hash: 'bad', direction: 'in', token: 'USDC', amount: '9' }, item(2, 'sideways', 'USDC', '1'), item(3, 'in', 'DAI', '1'), item(4, 'in', 'USDC', '-3'), item(5, 'in', 'USDC', '1.1234567')];
  const r = reconcile({ history: { chainId: 84532, network: 'Base Sepolia', more: false, items } });
  assert.equal(r.transfers.length, 1);
  assert.equal(r.totals.USDC.in, '5');
});

test('the report shortens addresses, keeps transaction IDs and links the rollback plan', () => {
  const history = { chainId: 8453, network: 'Base', more: false, items: [item(1, 'in', 'USDC', '400'), item(2, 'out', 'USDC', '300')] };
  const r = reconcile({ history, wallet: W, balances: { chainId: 8453, ok: true, eth: '0', usdc: '100' }, now: Date.UTC(2026, 10, 7, 21, 5) });
  const md = reconcileReport(r);
  assert.match(md, /^# FYNX reconciliation · Base/);
  assert.match(md, /Checked: 2026-11-07 21:05 UTC/);
  assert.match(md, /\| USDC \| 400 \(1\) \| 300 \(1\) \| 100 \| 100 \| matches \|/);
  assert.match(md, /ABOVE LIMIT/);
  assert.ok(md.includes(h(2)));
  assert.ok(!md.includes(W) && !md.includes(A), 'no full addresses');
  assert.match(md, /docs\/PILOT-ROLLBACK\.md/);
});

test('the rollback plan exists and the workspace wires the reconciliation in read-only', () => {
  const plan = readFileSync(new URL('../docs/PILOT-ROLLBACK.md', import.meta.url), 'utf8');
  for (const heading of ['## When to roll back', '## Roll back, step by step', '## Reconcile after a rollback', '## Practise it']) assert.ok(plan.includes(heading), heading);
  const owner = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  assert.match(owner, /id="rc-box"/);
  assert.match(owner, /docs\/PILOT-ROLLBACK\.md/);
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /from '\.\/reconcile\.js'/);
  const helper = readFileSync(new URL('../wallet-src/reconcile.js', import.meta.url), 'utf8');
  assert.doesNotMatch(helper, /sendTransaction|signMessage|eth_send|localStorage/);
});
