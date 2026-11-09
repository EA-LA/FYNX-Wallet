import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { walletQueue, queuePageItems, queueSummary, pageMatch, findByNonce } from '../wallet-src/tx-tracker.js';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';

const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const owner = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
const base = NETWORKS[84532];
const hex = n => '0x' + n.toString(16);
const wallet = '0x' + 'aB'.repeat(20);
const node = ({ used, pending, block = 500, calls = [], pendingFails = false }) => async ({ method, params }) => {
  calls.push([method, ...(params || [])]);
  if (method === 'eth_blockNumber') return hex(block);
  if (method === 'eth_getTransactionCount') {
    if (params[1] === 'pending') { if (pendingFails) throw new Error('pending not supported'); return hex(pending); }
    return hex(used);
  }
  throw new Error('unexpected ' + method);
};

test('walletQueue reads the used and pending counts read-only and reports what waits', async () => {
  const calls = [];
  const q = await walletQueue(node({ used: 7, pending: 9, calls }), ` ${wallet} `);
  assert.deepEqual(q, { from: wallet.toLowerCase(), used: 7, next: 9, waiting: 2, block: 500, pendingKnown: true });
  assert.ok(calls.every(([m]) => ['eth_getTransactionCount', 'eth_blockNumber'].includes(m)), 'only reads');
  assert.ok(calls.some(c => c[1] === wallet.toLowerCase() && c[2] === 'latest'));
});

test('walletQueue never reports fewer waiting than zero and survives connections without a pending count', async () => {
  assert.equal((await walletQueue(node({ used: 7, pending: 5 }), wallet)).waiting, 0);
  const q = await walletQueue(node({ used: 3, pending: 0, pendingFails: true }), wallet);
  assert.equal(q.pendingKnown, false); assert.equal(q.next, 3); assert.equal(q.waiting, 0);
  await assert.rejects(walletQueue(node({ used: 1, pending: 1 }), '0x123'), /wallet address/);
  await assert.rejects(walletQueue(async ({ method }) => method === 'eth_blockNumber' ? '0x10' : 'nonsense', wallet), /unreadable/);
});

test('queueSummary explains a waiting queue: the oldest number blocks the rest; FYNX never resends', () => {
  const s = queueSummary({ from: wallet.toLowerCase(), used: 7, next: 9, waiting: 2, block: 500, pendingKnown: true });
  assert.equal(s.state, 'waiting');
  assert.equal(s.title, '2 transactions are waiting');
  assert.match(s.detail, /Number 7 is the oldest waiting/);
  assert.match(s.detail, /Number 8 cannot go through until it does/);
  assert.match(queueSummary({ from: wallet, used: 2, next: 6, waiting: 4, block: 1, pendingKnown: true }).detail, /Numbers 3 to 5 cannot go through/);
  assert.match(s.detail, /Speed up/); assert.match(s.detail, /Do not send the same transfer again/); assert.match(s.detail, /never speeds up, cancels or resends/);
  assert.deepEqual(s.facts.find(f => f[0] === 'Waiting in the network queue'), ['Waiting in the network queue', '2 (numbers 7 to 8)']);
  assert.deepEqual(s.quick, [{ nonce: 6, label: 'Find the last used number (6)' }]);
  const one = queueSummary({ from: wallet, used: 4, next: 5, waiting: 1, block: 1, pendingKnown: true });
  assert.equal(one.title, 'One transaction is waiting'); assert.match(one.detail, /Anything you send next waits behind it/);
});

test('queueSummary for a clear queue, a fresh wallet and a connection that hides waiting transactions', () => {
  const clear = queueSummary({ from: wallet, used: 12, next: 12, waiting: 0, block: 1, pendingKnown: true });
  assert.equal(clear.state, 'clear'); assert.match(clear.detail, /next one you send gets number 12/);
  assert.equal(clear.facts[0][1], '12 (0 to 11)');
  const fresh = queueSummary({ from: wallet, used: 0, next: 0, waiting: 0, block: 1, pendingKnown: true });
  assert.equal(fresh.state, 'fresh'); assert.deepEqual(fresh.quick, []); assert.match(fresh.facts[0][1], /None yet/);
  const hidden = queueSummary({ from: wallet, used: 3, next: 3, waiting: 0, block: 1, pendingKnown: false });
  assert.match(hidden.detail, /does not report waiting/); assert.equal(hidden.facts[2][1], 'Not reported by this connection');
});

test('queuePageItems sorts this page\'s transactions for that wallet and network into the queue', () => {
  const other = { id: 11155111 };
  const items = [
    { hash: '0x1', label: 'A', address: wallet, nonce: 5, status: 'pending', network: base },
    { hash: '0x2', label: 'B', address: wallet, nonce: 7, status: 'pending', network: base },
    { hash: '0x3', label: 'C', address: wallet, nonce: 4, status: 'confirmed', network: base },
    { hash: '0x4', label: 'D', address: wallet, nonce: 8, status: 'pending', network: other },
    { hash: '0x5', label: 'E', address: '0x' + '11'.repeat(20), nonce: 7, status: 'pending', network: base },
    { hash: '0x6', label: 'F', address: wallet, nonce: null, status: 'unseen', network: base },
  ];
  const q = { from: wallet.toLowerCase(), used: 6, next: 6, waiting: 0, block: 1, pendingKnown: true };
  const page = queuePageItems(items, q, base.id);
  assert.deepEqual(page.waiting.map(i => i.hash), ['0x2']);
  assert.deepEqual(page.settle.map(i => i.hash), ['0x1']);
  const s = queueSummary(q, page);
  assert.match(s.detail, /number 7\) is not in this connection's queue/);
  assert.match(s.detail, /press "Check again" on it/);
  assert.equal(pageMatch(items, wallet.toUpperCase().replace('0X', '0x'), 7, base.id).hash, '0x2');
  assert.equal(pageMatch(items, wallet, 9, base.id), null);
});

test('searching a number not used yet says so (the network cannot list it), via findByNonce without an ID', async () => {
  const r = await findByNonce(node({ used: 3, pending: 3 }), { from: wallet, nonce: 5 }, base);
  assert.equal(r.state, 'not-used'); assert.match(r.detail, /has not used number 5 yet/);
});

test('the Track card wires the standalone check: sign-out clears it, network change hides it, read-only', () => {
  assert.match(owner, /id="queue-check"/); assert.match(owner, /id="queue-form"/); assert.match(owner, /id="queue-result"/);
  assert.match(app, /queueEntry = null; \$\('#queue-result'\)\.replaceChildren\(\); show\('#queue-result', false\)/);
  assert.match(app, /renderLookup\(\); setText\('#queue-status', ''\); renderQueue\(\);/);
  assert.match(app, /renderCryptoSetup\(\); renderQueue\(\);/);
  assert.match(app, /entry\.network\.id !== selectedNetwork\(\)\.id\) \{ show\('#queue-result', false\)/);
  const block = app.slice(app.indexOf('async function checkQueue'), app.indexOf("$('#provider-status')"));
  assert.ok(block.length > 1000);
  for (const banned of ['sendTransaction', 'eth_sign', 'personal_sign', 'pilotRegister', 'rememberSubmitted', 'localStorage']) assert.ok(!block.includes(banned), banned);
});
