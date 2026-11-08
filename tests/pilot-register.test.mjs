import test from 'node:test';
import assert from 'node:assert/strict';
import { REGISTER_KEY, MAX_ENTRIES, REASONS, cleanRegister, addSubmitted, markKnown, unmark, forNetwork, registerSummary, settledChange, reasonLabel } from '../wallet-src/pilot-register.js';
import { reconcile, reconcileReport } from '../wallet-src/reconcile.js';

const W = '0x1111111111111111111111111111111111111111';
const A = '0x2222222222222222222222222222222222222222';
const OTHER = '0x3333333333333333333333333333333333333333';
const h = n => '0x' + String(n).padStart(64, '0');
const sepolia = { id: 84532 }, base = { id: 8453 };
const item = (n, direction, token, amount) => ({ hash: h(n), direction, token, amount, from: direction === 'in' ? A : W, to: direction === 'in' ? W : A, block: 100 + n, time: '2026-11-08T10:00:00.000Z' });
const now = Date.UTC(2026, 10, 8, 12);

test('the register keeps public facts only and drops anything malformed', () => {
  assert.match(REGISTER_KEY, /^fynx-owner-/);
  const r = cleanRegister({ entries: [
    { hash: h(1), chainId: 84532, kind: 'page', label: '2.5 USDC', address: W, at: now },
    { hash: 'not-a-hash', chainId: 84532, kind: 'page', at: now },
    { hash: h(2), chainId: 84532, kind: 'marked', reason: 'made-up', at: now },
    { hash: h(3), chainId: 'x', kind: 'page', at: now },
    { hash: h(4), chainId: 84532, kind: 'page', label: 'seed phrase: <script>', at: now },
    { hash: h(5), chainId: 84532, kind: 'other', at: now },
    { hash: h(6), chainId: 84532, kind: 'marked', reason: 'other-app', note: 'free text never kept', at: now },
  ] });
  assert.equal(r.entries.length, 3);
  assert.equal(r.entries.find(e => e.hash === h(4)).label, 'Transaction', 'odd labels are replaced, not kept');
  assert.equal(r.entries.find(e => e.hash === h(1)).address, W.toLowerCase());
  assert.equal('note' in r.entries.find(e => e.hash === h(6)), false);
  assert.deepEqual(cleanRegister(null), { entries: [] });
  assert.deepEqual(cleanRegister({ entries: 'x' }), { entries: [] });
});

test('submitted transactions are added once and the newest entries are kept', () => {
  let r = { entries: [] };
  const entry = { hash: h(1).toUpperCase().replace('0X', '0x'), label: 'ETH transfer', network: sepolia, address: W, submittedAt: now };
  r = addSubmitted(r, entry); r = addSubmitted(r, entry);
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].hash, h(1));
  for (let i = 0; i < MAX_ENTRIES + 20; i++) r = addSubmitted(r, { hash: h(1000 + i), label: 'ETH transfer', network: base, address: W, submittedAt: now + i });
  assert.equal(r.entries.length, MAX_ENTRIES);
  assert.equal(r.entries.at(-1).hash, h(1000 + MAX_ENTRIES + 19));
  assert.equal(forNetwork(r, 84532).length, 0, 'the oldest fell off');
});

test('marking needs a fixed reason and can be undone', () => {
  assert.throws(() => markKnown({ entries: [] }, { hash: h(1), chainId: 8453, reason: '' }), /Choose why/);
  assert.throws(() => markKnown({ entries: [] }, { hash: 'abc', chainId: 8453, reason: 'other-app' }), /transaction ID/);
  let r = markKnown({ entries: [] }, { hash: h(7), chainId: 8453, reason: 'other-device' }, now);
  r = addSubmitted(r, { hash: h(7), label: 'x', network: base, address: W, submittedAt: now });
  assert.equal(r.entries.length, 2);
  r = unmark(r, { hash: h(7), chainId: 8453 });
  assert.deepEqual(r.entries.map(e => e.kind), ['page'], 'undo removes only the mark');
  assert.equal(reasonLabel('other-device'), REASONS['other-device']);
  const sum = registerSummary(markKnown(r, { hash: h(8), chainId: 84532, reason: 'own-transfer' }, now + 5));
  assert.deepEqual(sum, { page: 1, marked: 1, since: now, networks: 2 });
  assert.deepEqual(registerSummary({ entries: [] }), { page: 0, marked: 0, since: null, networks: 0 });
});

test('a reload no longer turns earlier FYNX transfers into "outside" transfers', () => {
  const history = { chainId: 84532, network: 'Base Sepolia', more: false, items: [item(1, 'in', 'USDC', '10'), item(2, 'out', 'USDC', '2'), item(3, 'out', 'USDC', '1')] };
  const balances = { chainId: 84532, ok: true, eth: '0', usdc: '7' };
  const without = reconcile({ history, journal: [], wallet: W, balances, now });
  assert.equal(without.outside.length, 2);
  assert.equal(without.state, 'review');

  let reg = addSubmitted({ entries: [] }, { hash: h(2), label: '2 USDC', network: sepolia, address: W, submittedAt: now - 86400000 });
  const half = reconcile({ history, journal: [], wallet: W, balances, now, known: forNetwork(reg, 84532) });
  assert.equal(half.fromEarlier, 1);
  assert.equal(half.outside.length, 1);
  assert.equal(half.transfers.find(t => t.hash === h(2)).label, '2 USDC');

  reg = markKnown(reg, { hash: h(3), chainId: 84532, reason: 'other-device' }, now);
  const done = reconcile({ history, journal: [], wallet: W, balances, now, known: forNetwork(reg, 84532) });
  assert.equal(done.outside.length, 0);
  assert.equal(done.explained.length, 1);
  assert.equal(done.state, 'balanced');
  assert.ok(done.findings.some(f => /earlier session/.test(f.text)));
  assert.ok(done.findings.some(f => /marked as yours: sent from another device/.test(f.text)));
  const report = reconcileReport(done);
  assert.match(report, /from FYNX, earlier session/);
  assert.match(report, /marked yours \(sent from another device\)/);
});

test('remembered entries from another network or another wallet do not count; incoming transfers cannot be marked', () => {
  const history = { chainId: 84532, network: 'Base Sepolia', more: false, items: [item(1, 'in', 'USDC', '5'), item(2, 'out', 'USDC', '1')] };
  const known = [
    { hash: h(2), chainId: 8453, kind: 'page', label: 'x', address: W },
    { hash: h(2), chainId: 84532, kind: 'page', label: 'x', address: OTHER },
    { hash: h(1), chainId: 84532, kind: 'marked', reason: 'other-app' },
  ];
  const r = reconcile({ history, journal: [], wallet: W, balances: null, now, known });
  assert.equal(r.outside.length, 1);
  assert.equal(r.fromEarlier, 0);
  assert.equal(r.explained.length, 0);
  assert.equal(r.transfers.find(t => t.hash === h(1)).source, 'outside');
});

test('a marked transfer above the limit is still flagged', () => {
  const history = { chainId: 8453, network: 'Base', more: false, items: [item(1, 'in', 'USDC', '500'), item(2, 'out', 'USDC', '300')] };
  const known = forNetwork(markKnown({ entries: [] }, { hash: h(2), chainId: 8453, reason: 'other-app' }, now), 8453);
  const r = reconcile({ history, journal: [], wallet: W, balances: { chainId: 8453, ok: true, eth: '0', usdc: '200' }, now, known });
  assert.equal(r.outside.length, 0);
  assert.equal(r.overLimit.length, 1);
  assert.equal(r.state, 'review');
});

test('settledChange spots a waiting transaction settling on the reconciled network only', () => {
  assert.equal(settledChange('pending', { network: sepolia, status: 'confirmed' }, 84532), true);
  assert.equal(settledChange('unseen', { network: sepolia, status: 'dropped' }, 84532), true);
  assert.equal(settledChange('confirmed', { network: sepolia, status: 'confirmed' }, 84532), false);
  assert.equal(settledChange('pending', { network: sepolia, status: 'pending' }, 84532), false);
  assert.equal(settledChange('pending', { network: base, status: 'confirmed' }, 84532), false);
});
