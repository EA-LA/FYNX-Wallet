import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseNonceSearch, findByNonce, offersNonceSearch, lookupNext, checkTransaction, NO_HASH } from '../wallet-src/tx-tracker.js';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';

const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const base = NETWORKS[84532];
const hex = n => '0x' + n.toString(16);
const h = byte => '0x' + byte.repeat(32);
const wallet = '0x' + 'aB'.repeat(20), recipient = '0x' + '34'.repeat(20);

// A chain of `latest` blocks where the wallet used number `nonce` in block `usedAt` with `tx`.
// oldestReadable: blocks below it fail like a connection without old state.
function chain({ latest = 2_000_000, usedAt = 1_234_567, nonce = 5, tx, oldestReadable = 0, calls = [] } = {}) {
  return async ({ method, params }) => {
    calls.push(method);
    if (method === 'eth_blockNumber') return hex(latest);
    if (method === 'eth_getTransactionCount') {
      const block = params[1] === 'latest' ? latest : Number(BigInt(params[1]));
      if (block < oldestReadable) throw new Error('missing trie node');
      return hex(block >= usedAt ? nonce + 1 : nonce);
    }
    if (method === 'eth_getBlockByNumber') return { transactions: Number(BigInt(params[0])) === usedAt && tx ? [tx] : [] };
    if (method === 'eth_getTransactionReceipt') return tx && params[0] === tx.hash ? { transactionHash: tx.hash, blockNumber: hex(usedAt), status: '0x1' } : null;
    if (method === 'eth_getTransactionByHash') return tx && params[0] === tx.hash ? { ...tx, blockNumber: hex(usedAt) } : null;
    throw new Error('unexpected ' + method);
  };
}

test('parseNonceSearch checks the wallet and the number and says which field is wrong', () => {
  assert.deepEqual(parseNonceSearch(` ${wallet} `, ' 12 '), { ok: true, from: wallet.toLowerCase(), nonce: 12 });
  assert.deepEqual(parseNonceSearch(wallet, 0), { ok: true, from: wallet.toLowerCase(), nonce: 0 });
  assert.equal(parseNonceSearch('0x123', '1').field, 'wallet');
  assert.equal(parseNonceSearch('', '1').field, 'wallet');
  for (const bad of ['', '-1', '1.5', '0x5', 'twelve', '1234567890123456']) assert.equal(parseNonceSearch(wallet, bad).field, 'nonce', bad);
});

test('the lookup card offers the search only when the ID is unknown or replaced without wallet and number', () => {
  assert.equal(offersNonceSearch({ status: 'not-found' }), true);
  assert.equal(offersNonceSearch({ status: 'replaced', from: null, nonce: null }), true);
  assert.equal(offersNonceSearch({ status: 'replaced', from: wallet, nonce: 3 }), false);
  for (const status of ['confirmed', 'pending', 'failed', 'dropped']) assert.equal(offersNonceSearch({ status }), false);
  assert.equal(offersNonceSearch(null), false);
  assert.match(lookupNext({ status: 'not-found' }), /search by its wallet and number below/);
});

test('an ID the network forgot: the wallet + number search finds the transaction over the whole chain', async () => {
  const gone = h('ee');
  const tx = { hash: h('cd'), from: wallet, to: recipient, nonce: hex(5), value: hex(10n ** 15n), input: '0x' };
  const calls = [], request = chain({ tx, calls });
  // The looked-up ID itself is unknown to the network: "not found", so the search is offered.
  const looked = await checkTransaction(request, gone, {}, base);
  assert.equal(looked.status, 'not-found');
  assert.equal(offersNonceSearch(looked), true);
  // Block 1,234,567 is weeks older than the one-day window: the whole-chain search still finds it.
  const found = await findByNonce(request, { from: wallet, nonce: '5', exclude: gone }, base);
  assert.equal(found.state, 'found');
  assert.equal(found.hash, tx.hash);
  assert.equal(found.block, 1_234_567);
  assert.equal(found.status, 'confirmed');
  assert.equal(found.kind, 'unknown');
  assert.equal(found.method, 'blocks');
  assert.match(found.detail, /^Number 5 from this wallet was used by this transaction\. Confirmed in block 1234567 \(.*settled\)/);
  // Read-only: nothing that signs or sends.
  assert.ok(calls.every(m => ['eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_blockNumber', 'eth_getTransactionCount', 'eth_getBlockByNumber'].includes(m)));
  // Binary search: about log2(2,000,000) reads, not one per block.
  assert.ok(calls.filter(m => m === 'eth_getTransactionCount').length < 30);
});

test('a self-sent zero-value transaction is reported as a cancel', async () => {
  const tx = { hash: h('c1'), from: wallet, to: wallet, nonce: hex(5), value: '0x0', input: '0x' };
  const found = await findByNonce(chain({ tx, usedAt: 1_999_990 }), { from: wallet, nonce: 5 }, base);
  assert.equal(found.kind, 'cancel');
  assert.match(found.detail, /a cancel in the wallet/);
});

test('the search excludes the looked-up ID and works without one', async () => {
  const tx = { hash: h('cd'), from: wallet, to: recipient, nonce: hex(5), value: '0x1', input: '0x' };
  const excluded = await findByNonce(chain({ tx }), { from: wallet, nonce: 5, exclude: tx.hash }, base);
  assert.equal(excluded.state, 'not-found');
  const plain = await findByNonce(chain({ tx }), { from: wallet, nonce: 5 }, base);
  assert.equal(plain.hash, tx.hash);
  assert.notEqual(plain.hash, NO_HASH);
});

test('a number the wallet has not used yet says so', async () => {
  const found = await findByNonce(chain({ nonce: 5 }), { from: wallet, nonce: 9 }, base);
  assert.equal(found.state, 'not-used');
  assert.match(found.detail, /has not used number 9 yet/);
});

test('a connection without old state falls back to the day window and says when the number is older', async () => {
  const tx = { hash: h('cd'), from: wallet, to: recipient, nonce: hex(5), value: '0x1', input: '0x' };
  // Readable only from block 1,950,000 (the day window reaches 1,956,800): the number was used at 1,234,567.
  const old = await findByNonce(chain({ tx, oldestReadable: 1_950_000 }), { from: wallet, nonce: 5 }, base);
  assert.equal(old.state, 'not-found');
  assert.equal(old.reason, 'older');
  assert.match(old.detail, /before the oldest block this connection can read/);
  // Only the last 120 blocks readable: the history is the remaining way, and the advice says so.
  const shallow = await findByNonce(chain({ tx, oldestReadable: 1_999_000 }), { from: wallet, nonce: 5 }, base);
  assert.equal(shallow.reason, 'unreadable');
  assert.match(shallow.detail, /Load the history/);
  // Used recently: the day window finds it although the whole chain cannot be read.
  const recent = await findByNonce(chain({ tx, usedAt: 1_995_000, oldestReadable: 1_950_000 }), { from: wallet, nonce: 5 }, base);
  assert.equal(recent.state, 'found');
  assert.equal(recent.block, 1_995_000);
});

test('when no blocks can be read, transfers from the loaded history are tried', async () => {
  const tx = { hash: h('cd'), from: wallet, to: recipient, nonce: hex(5), value: '0x1', input: '0x' };
  const inner = chain({ tx });
  const request = async call => {
    if (call.method === 'eth_getTransactionCount' && call.params[1] !== 'latest') throw new Error('no state');
    return inner(call);
  };
  const none = await findByNonce(request, { from: wallet, nonce: 5 }, base);
  assert.equal(none.reason, 'unreadable');
  assert.match(none.detail, /Load the history/);
  const viaHistory = await findByNonce(request, { from: wallet, nonce: 5, candidates: [h('11'), tx.hash] }, base);
  assert.equal(viaHistory.state, 'found');
  assert.equal(viaHistory.method, 'history');
});

test('invalid input is refused before any network read', async () => {
  let reads = 0;
  const request = async () => { reads++; return null; };
  await assert.rejects(findByNonce(request, { from: 'nope', nonce: 1 }, base), /wallet address/);
  await assert.rejects(findByNonce(request, { from: wallet, nonce: 'x' }, base), /whole number/);
  assert.equal(reads, 0);
});

test('the lookup card wires the search: form, connected-wallet button, look-up of the result, no register writes', () => {
  assert.match(app, /if \(offersNonceSearch\(r\)\) renderNonceSearch\(box, entry\);/);
  const fn = app.slice(app.indexOf('async function searchLookupByNonce'), app.indexOf('function renderLookup'));
  for (const id of ['nonce-form', 'nonce-wallet', 'nonce-number', 'nonce-go', 'nonce-mine', 'nonce-open', 'nonce-result']) assert.match(fn, new RegExp(`'${id}'`), id);
  assert.match(fn, /assertCurrent\(epoch\)/);
  assert.doesNotMatch(fn, /pilotRegister|rememberSubmitted|sendTransaction|eth_send/);
  // Typing survives re-renders; the draft lives on the lookup entry, which sign-out clears.
  assert.match(fn, /entry\.nonceDraft = \{ wallet: wi\.value, nonce: ni\.value \}/);
  assert.match(app, /lookupEntry = null; \$\('#lookup-result'\)\.replaceChildren\(\)/);
});
