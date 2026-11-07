import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classify, checkTransaction, confirmationTarget, quantity, isSettled, STATUSES, STATUS_LABELS, DROP_AFTER_MS } from '../wallet-src/tx-tracker.js';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';

const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const owner = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../wallet-src/tx-tracker.js', import.meta.url), 'utf8');
const base = NETWORKS[84532], sepolia = NETWORKS[11155111];
const hash = '0x' + 'ab'.repeat(32), blockHash = '0x' + '11'.repeat(32), otherBlock = '0x' + '22'.repeat(32);
const from = '0x' + '12'.repeat(20), to = '0x' + '34'.repeat(20);
const hex = n => '0x' + n.toString(16);
const tx = (extra = {}) => ({ hash, from, to, nonce: hex(7), blockNumber: null, ...extra });
const receipt = (extra = {}) => ({ transactionHash: hash, blockNumber: hex(100), blockHash, status: '0x1', ...extra });

// A fake read-only network: records every method called.
function network({ tx: t = null, receipt: r = null, latest = 100, blocks = { [hex(100)]: blockHash }, nonce = 7 } = {}) {
  const calls = [];
  const request = async ({ method, params }) => {
    calls.push(method);
    if (method === 'eth_getTransactionByHash') return t;
    if (method === 'eth_getTransactionReceipt') return r;
    if (method === 'eth_blockNumber') return hex(latest);
    if (method === 'eth_getBlockByNumber') return blocks[params[0]] ? { hash: blocks[params[0]] } : null;
    if (method === 'eth_getTransactionCount') { assert.equal(params[1], 'latest'); return hex(nonce); }
    throw new Error('unexpected ' + method);
  };
  return { request, calls };
}

test('quantities and confirmation targets', () => {
  assert.equal(quantity('0x0'), 0); assert.equal(quantity('0x64'), 100);
  for (const bad of ['', '0x', '64', 100, null, '0xzz', '0x' + 'f'.repeat(65)]) assert.equal(quantity(bad), null);
  assert.equal(quantity('0x' + 'f'.repeat(20)), null, 'unsafe numbers are refused');
  assert.equal(confirmationTarget(sepolia), 12); assert.equal(confirmationTarget(base), 30);
  for (const s of STATUSES) assert.ok(STATUS_LABELS[s], s);
});

test('confirmed: counts confirmations and says when it is settled', () => {
  const shallow = classify({ hash, tx: tx({ blockNumber: hex(100) }), receipt: receipt(), latestBlock: 104, canonicalBlockHash: blockHash, network: base });
  assert.equal(shallow.status, 'confirmed'); assert.equal(shallow.confirmations, 5); assert.equal(shallow.deep, false);
  assert.match(shallow.detail, /block 100 with 5 confirmations/); assert.match(shallow.detail, /Wait for 30/);
  assert.equal(isSettled(shallow), false);
  const one = classify({ hash, receipt: receipt(), latestBlock: 100, canonicalBlockHash: blockHash, network: base });
  assert.equal(one.confirmations, 1); assert.match(one.detail, /1 confirmation\./);
  const deep = classify({ hash, receipt: receipt(), latestBlock: 111, canonicalBlockHash: blockHash, network: sepolia });
  assert.equal(deep.confirmations, 12); assert.equal(deep.deep, true); assert.match(deep.detail, /very unlikely to change/); assert.equal(isSettled(deep), true);
});

test('failed on-chain says nothing moved but the fee was charged', () => {
  const r = classify({ hash, receipt: receipt({ status: '0x0' }), latestBlock: 101, canonicalBlockHash: blockHash, network: base });
  assert.equal(r.status, 'failed'); assert.match(r.detail, /nothing moved/); assert.match(r.detail, /fee/);
});

test('reorganised: receipt block no longer on the chain', () => {
  const r = classify({ hash, receipt: receipt(), latestBlock: 105, canonicalBlockHash: otherBlock, network: base });
  assert.equal(r.status, 'reorged'); assert.match(r.detail, /reorganisation/); assert.match(r.detail, /do not send it again/);
  assert.equal(isSettled(r), false);
});

test('lagging: the connection is behind the receipt block', () => {
  assert.equal(classify({ hash, receipt: receipt(), latestBlock: 99, canonicalBlockHash: null, network: base }).status, 'lagging');
  assert.equal(classify({ hash, receipt: receipt(), latestBlock: 101, canonicalBlockHash: null, network: base }).status, 'lagging');
});

test('pending vs replaced: an already-used nonce means a speed-up or cancel won', () => {
  const waiting = classify({ hash, tx: tx(), accountNonce: 7, submittedAt: 0, now: 3 * 60000, network: base });
  assert.equal(waiting.status, 'pending'); assert.match(waiting.detail, /3 minutes ago/); assert.match(waiting.detail, /Do not send it again/);
  const replaced = classify({ hash, tx: tx(), accountNonce: 8, network: base });
  assert.equal(replaced.status, 'replaced'); assert.match(replaced.detail, /Speed up|Cancel/); assert.equal(replaced.nonce, 7);
  assert.equal(isSettled(replaced), true);
  // Gone from the node, but we remembered the nonce from an earlier check.
  const gone = classify({ hash, tx: null, knownNonce: 7, accountNonce: 9, submittedAt: 0, now: 60000, network: base });
  assert.equal(gone.status, 'replaced');
  // Included in a block but no receipt yet is still pending, not replaced.
  assert.equal(classify({ hash, tx: tx({ blockNumber: hex(100) }), accountNonce: 8, network: base }).status, 'pending');
});

test('unseen, dropped and not found', () => {
  assert.equal(classify({ hash, submittedAt: 0, now: 30000, network: base }).status, 'unseen');
  const dropped = classify({ hash, submittedAt: 0, now: DROP_AFTER_MS, knownNonce: 7, accountNonce: 7, network: base });
  assert.equal(dropped.status, 'dropped'); assert.match(dropped.detail, /10 minutes/); assert.match(dropped.detail, /nothing was spent/);
  const lookup = classify({ hash, network: base });
  assert.equal(lookup.status, 'not-found'); assert.match(lookup.detail, /network matches/);
});

test('refuses malformed input and mismatched network answers', () => {
  assert.throws(() => classify({ hash: '0x12' }), /valid transaction hash/);
  assert.throws(() => classify({ hash, tx: tx({ hash: '0x' + 'cd'.repeat(32) }) }), /could not be verified/);
  assert.throws(() => classify({ hash, receipt: receipt({ transactionHash: '0x' + 'cd'.repeat(32) }), latestBlock: 100, canonicalBlockHash: blockHash }), /could not be verified/);
  assert.throws(() => classify({ hash, receipt: receipt({ status: '0x2' }), latestBlock: 100, canonicalBlockHash: blockHash }), /could not be verified/);
  assert.throws(() => classify({ hash, receipt: receipt({ blockNumber: '0x0' }), latestBlock: 100, canonicalBlockHash: blockHash }), /could not be verified/);
});

test('checkTransaction reads the network only and combines the answers', async () => {
  const confirmed = network({ tx: tx({ blockNumber: hex(100) }), receipt: receipt(), latest: 103 });
  const r = await checkTransaction(confirmed.request, hash, {}, base);
  assert.equal(r.status, 'confirmed'); assert.equal(r.confirmations, 4); assert.equal(r.from, from); assert.equal(r.to, to);
  assert.ok(confirmed.calls.includes('eth_getBlockByNumber'));
  const reorg = network({ receipt: receipt(), latest: 103, blocks: { [hex(100)]: otherBlock } });
  assert.equal((await checkTransaction(reorg.request, hash, {}, base)).status, 'reorged');
  const replaced = network({ tx: tx(), nonce: 8 });
  assert.equal((await checkTransaction(replaced.request, hash, {}, base)).status, 'replaced');
  const remembered = network({ tx: null, nonce: 9 });
  const gone = await checkTransaction(remembered.request, hash, { from, nonce: 7, submittedAt: 0 }, base, 60000);
  assert.equal(gone.status, 'replaced'); assert.ok(remembered.calls.includes('eth_getTransactionCount'));
  const dropped = network({ tx: null, nonce: 7 });
  assert.equal((await checkTransaction(dropped.request, hash, { from, nonce: 7, submittedAt: 0 }, base, DROP_AFTER_MS + 1)).status, 'dropped');
  // Included between the receipt read and the nonce read: not "replaced".
  let reads = 0;
  const race = { request: async ({ method, params }) => {
    if (method === 'eth_getTransactionReceipt') return ++reads === 1 ? null : receipt();
    if (method === 'eth_getTransactionByHash') return tx();
    if (method === 'eth_blockNumber') return hex(100);
    if (method === 'eth_getBlockByNumber') return { hash: blockHash };
    if (method === 'eth_getTransactionCount') return hex(8);
    throw new Error('unexpected ' + method + params);
  } };
  assert.equal((await checkTransaction(race.request, hash, {}, base)).status, 'confirmed');
  const unknown = network();
  assert.equal((await checkTransaction(unknown.request, hash, {}, base)).status, 'not-found');
  await assert.rejects(checkTransaction(unknown.request, 'nope'), /valid transaction hash/);
  const broken = { request: async ({ method }) => method === 'eth_blockNumber' ? 'garbage' : null };
  await assert.rejects(checkTransaction(broken.request, hash), /could not be verified/);
  const all = [...confirmed.calls, ...reorg.calls, ...replaced.calls, ...remembered.calls, ...dropped.calls, ...unknown.calls];
  assert.ok(all.every(m => ['eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getTransactionCount'].includes(m)), 'read-only calls only');
});

test('the tracker never signs or sends', () => {
  assert.doesNotMatch(source, /eth_send|eth_sign|personal_sign|signTypedData|wallet_/);
});

test('Crypto tools uses the tracker for every status check', () => {
  assert.match(app, /from '\.\/tx-tracker\.js'/);
  assert.match(app, /async function checkStatus\(/);
  assert.doesNotMatch(app, /connection\.receipt\(/, 'the plain receipt check that showed replaced transactions as pending is no longer used');
  assert.doesNotMatch(app, /connection\.inspectTransaction\(/);
  assert.match(app, /submittedAt: Date\.now\(\)/);
  assert.match(app, /tx-check/);
  assert.match(owner, /replaced by a sped-up or cancelled version, dropped, or moved by a block reorganisation/);
  assert.match(owner, /Checking never signs or resends anything/);
});

test('launch checklist records the replaced/dropped/reorg step with this test as evidence', () => {
  const step = plan.items.find(i => i.id === 'assets').steps.find(s => s.id === 'replace');
  assert.equal(step.done, true); assert.equal(step.by, 'engineering'); assert.match(step.text, /tests\/tx-tracker\.test\.mjs/);
});
