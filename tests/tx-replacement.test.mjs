import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findReplacement, replacementKind, replacementText, lookbackBlocks, classify, RECENT_BLOCKS, MAX_CANDIDATES, REPLACEMENT_KINDS } from '../wallet-src/tx-tracker.js';
import { reconcile, historyRetry } from '../wallet-src/reconcile.js';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';

const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../wallet-src/tx-tracker.js', import.meta.url), 'utf8');
const base = NETWORKS[84532], sepolia = NETWORKS[11155111];
const hex = n => '0x' + n.toString(16);
const h = byte => '0x' + byte.repeat(32);
const original = h('ab'), replacement = h('cd'), other = h('ef');
const wallet = '0x' + '12'.repeat(20), recipient = '0x' + '34'.repeat(20);
const NOW = Date.UTC(2026, 10, 9, 12, 0);

// A fake read-only chain. The wallet's nonce 7 is used by `replacement` in block `usedAt`.
// historyFrom: oldest block whose state the node can still read (non-archive nodes keep ~128 blocks).
function chain({ latest = 1000, usedAt = 990, tx = { to: recipient, value: hex(5), input: '0x' }, historyFrom = 0, receiptStatus = '0x1', mined = true, startNonce = 7, byHash = {} } = {}) {
  const calls = [];
  const replacementTx = { hash: replacement, from: wallet, nonce: hex(7), blockNumber: hex(usedAt), ...tx };
  const request = async ({ method, params }) => {
    calls.push([method, ...(params || [])]);
    if (method === 'eth_blockNumber') return hex(latest);
    if (method === 'eth_getTransactionCount') {
      assert.equal(params[0], wallet);
      const block = Number(BigInt(params[1]));
      if (block < historyFrom) throw new Error('missing trie node');
      return hex(block >= usedAt ? startNonce + 1 : startNonce);
    }
    if (method === 'eth_getBlockByNumber') {
      assert.equal(params[1], true);
      const block = Number(BigInt(params[0]));
      return { number: params[0], transactions: block === usedAt ? [{ hash: other, from: recipient, nonce: hex(7) }, replacementTx] : [] };
    }
    if (method === 'eth_getTransactionByHash') return params[0] === replacement ? replacementTx : byHash[params[0]] || null;
    if (method === 'eth_getTransactionReceipt') return params[0] === replacement && mined ? { transactionHash: replacement, blockNumber: hex(usedAt), status: receiptStatus } : null;
    throw new Error('unexpected ' + method);
  };
  return { request, calls, count: name => calls.filter(c => c[0] === name).length };
}
const known = (extra = {}) => ({ hash: original, from: wallet, nonce: 7, original: { to: recipient.toLowerCase(), value: '5', input: '0x' }, submittedAt: NOW - 10 * 60 * 1000, now: NOW, ...extra });

test('finds a sped-up replacement by searching blocks, verified by sender and nonce', async () => {
  const net = chain();
  const found = await findReplacement(net.request, known(), base);
  assert.equal(found.state, 'found');
  assert.equal(found.hash, replacement);
  assert.equal(found.kind, 'speed-up');
  assert.equal(found.status, 'confirmed');
  assert.equal(found.block, 990);
  assert.equal(found.confirmations, 11);
  assert.equal(found.target, 30);
  assert.equal(found.deep, false);
  assert.equal(found.method, 'blocks');
  assert.match(found.detail, /sped it up.*block 990 \(11 of 30 confirmations\)/);
  // A binary search: a handful of reads, not one per block, and only read methods.
  assert.ok(net.count('eth_getTransactionCount') <= 14, `too many reads: ${net.count('eth_getTransactionCount')}`);
  assert.equal(net.count('eth_getBlockByNumber'), 1);
  assert.ok(net.calls.every(([m]) => /^eth_(blockNumber|getTransactionCount|getBlockByNumber|getTransactionByHash|getTransactionReceipt)$/.test(m)));
});

test('a cancel (0 ETH to yourself, no data) is told apart from a speed-up and a different transaction', async () => {
  const cancel = await findReplacement(chain({ tx: { to: wallet, value: '0x0', input: '0x' } }).request, known(), base);
  assert.equal(cancel.kind, 'cancel');
  assert.match(cancel.detail, /cancelled it.*sends nothing/);
  const different = await findReplacement(chain({ tx: { to: recipient, value: hex(9), input: '0x' } }).request, known(), base);
  assert.equal(different.kind, 'different');
  const unknown = await findReplacement(chain().request, known({ original: null }), base);
  assert.equal(unknown.kind, 'unknown');
  assert.equal(replacementKind(wallet, null, { to: wallet.toLowerCase(), value: '0', input: '0x' }), 'cancel');
  assert.equal(replacementKind(wallet, { to: null, value: null, input: null }, { to: recipient, value: '1', input: '0x' }), 'unknown');
  assert.deepEqual(Object.keys(REPLACEMENT_KINDS).sort(), ['cancel', 'different', 'speed-up', 'unknown']);
});

test('failed and not-yet-confirmed replacements are reported as such', async () => {
  const failed = await findReplacement(chain({ receiptStatus: '0x0' }).request, known(), base);
  assert.equal(failed.status, 'failed');
  assert.match(failed.detail, /failed, so nothing moved/);
  const pending = await findReplacement(chain({ mined: false }).request, known(), base);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.confirmations, 0);
  assert.equal(pending.deep, false);
  const deep = await findReplacement(chain({ latest: 1100 }).request, known(), base);
  assert.equal(deep.deep, true);
});

test('a node without old state falls back to the recent window, then to history candidates', async () => {
  // Replacement 10 blocks ago, node keeps ~128 blocks: the long window fails, the short one finds it.
  const recent = chain({ historyFrom: 1000 - 128 });
  const found = await findReplacement(recent.request, known({ submittedAt: NOW - 60 * 60 * 1000 }), base);
  assert.equal(found.state, 'found');
  assert.equal(found.method, 'blocks');
  // Replacement older than the node's state: only the loaded history can tell which one it was.
  const old = chain({ usedAt: 500, historyFrom: 1000 - 128 });
  const viaHistory = await findReplacement(old.request, known({ submittedAt: NOW - 60 * 60 * 1000, candidates: [other, replacement] }), base);
  assert.equal(viaHistory.state, 'found');
  assert.equal(viaHistory.method, 'history');
  assert.equal(viaHistory.hash, replacement);
  const none = await findReplacement(chain({ usedAt: 500, historyFrom: 1000 - 128 }).request, known({ submittedAt: NOW - 60 * 60 * 1000, candidates: [other] }), base);
  assert.equal(none.state, 'not-found');
  assert.match(none.detail, /cannot read past blocks.*Load the history/);
});

test('candidates are verified on-chain and capped; the original ID is never its own replacement', async () => {
  const lookalike = h('99');
  const net = chain({ usedAt: 500, historyFrom: 990, byHash: { [lookalike]: { hash: lookalike, from: wallet, nonce: hex(8) }, [original]: { hash: original, from: wallet, nonce: hex(7) } } });
  const many = [original, lookalike, ...Array.from({ length: 30 }, (_, i) => '0x' + i.toString(16).padStart(64, '0'))];
  const result = await findReplacement(net.request, known({ submittedAt: NOW - 60 * 60 * 1000, candidates: many }), base);
  assert.equal(result.state, 'not-found');
  const lookups = net.calls.filter(c => c[0] === 'eth_getTransactionByHash');
  assert.ok(lookups.length <= MAX_CANDIDATES);
  assert.ok(!lookups.some(c => c[1] === original));
});

test('nonce not used yet, missing facts, and further back than a day', async () => {
  const unused = await findReplacement(chain({ usedAt: 2000 }).request, known(), base);
  assert.equal(unused.state, 'not-used');
  const noNonce = await findReplacement(chain().request, known({ nonce: null }), base);
  assert.equal(noNonce.state, 'unknown');
  const noWallet = await findReplacement(chain().request, known({ from: 'nope' }), base);
  assert.equal(noWallet.state, 'unknown');
  await assert.rejects(findReplacement(chain().request, known({ hash: 'bad' }), base), /valid transaction hash/);
  const older = await findReplacement(chain({ latest: 100000, usedAt: 10 }).request, known({ submittedAt: undefined }), base);
  assert.equal(older.state, 'not-found');
  assert.match(older.detail, /further back than this page searches/);
});

test('lookback follows the submit time with a margin, between the recent window and a day', () => {
  assert.equal(lookbackBlocks(base, NOW - 60 * 1000, NOW), RECENT_BLOCKS);
  assert.equal(lookbackBlocks(base, NOW - 60 * 60 * 1000, NOW), 1800 + 50);
  assert.equal(lookbackBlocks(sepolia, NOW - 60 * 60 * 1000, NOW), 300 + 50);
  assert.equal(lookbackBlocks(base, NOW - 3 * 24 * 60 * 60 * 1000, NOW), 43200);
  assert.equal(lookbackBlocks(sepolia, undefined, NOW), 7200);
  assert.equal(replacementText({ kind: 'speed-up', status: 'pending' }).endsWith('It is not confirmed yet.'), true);
});

test('classify keeps what the transaction does so a later replacement can be compared', () => {
  const tx = { hash: original, from: wallet, to: recipient, nonce: hex(7), value: hex(5), input: '0xA9059CBB', blockNumber: null };
  const result = classify({ hash: original, tx, latestBlock: 10, accountNonce: 7, network: base, now: NOW });
  assert.deepEqual(result.call, { to: recipient.toLowerCase(), value: '5', input: '0xa9059cbb' });
  assert.equal(classify({ hash: original, latestBlock: 10, network: base, now: NOW }).call, undefined);
});

const history = items => ({ chainId: 84532, network: 'Base Sepolia', items, more: false });
const entry = extra => ({ hash: original, label: 'ETH transfer', network: { id: 84532 }, address: wallet, status: 'replaced', ...extra });
const out = (hash, amount = '0.000000000000000005') => ({ hash, direction: 'out', token: 'ETH', amount, from: wallet, to: recipient, block: 990, time: '2026-11-09T11:55:00Z' });

test('reconciliation: a replacement in the history counts as from this page, not an outside transfer', () => {
  const r = reconcile({ history: history([out(replacement)]), journal: [entry({ replacement: { hash: replacement, kind: 'speed-up', status: 'confirmed' } })], wallet, now: NOW });
  assert.equal(r.outside.length, 0);
  assert.equal(r.transfers[0].source, 'this-page');
  assert.equal(r.transfers[0].label, 'ETH transfer (replacement)');
  assert.equal(r.missing[0].tone, 'ok');
  assert.match(r.missing[0].reason, /sped up in the wallet.*in the history/);
  // Without the replacement known, the same history row is flagged and the original stays a to-do.
  const before = reconcile({ history: history([out(replacement)]), journal: [entry()], wallet, now: NOW });
  assert.equal(before.outside.length, 1);
  assert.equal(before.missing[0].tone, 'todo');
});

test('reconciliation: cancelled, failed and not-yet-listed replacements are explained', () => {
  const cancel = reconcile({ history: history([]), journal: [entry({ replacement: { hash: replacement, kind: 'cancel', status: 'confirmed' } })], wallet, now: NOW });
  assert.equal(cancel.missing[0].tone, 'ok');
  assert.match(cancel.missing[0].reason, /Cancelled in the wallet/);
  const failed = reconcile({ history: history([]), journal: [entry({ replacement: { hash: replacement, kind: 'speed-up', status: 'failed' } })], wallet, now: NOW });
  assert.equal(failed.missing[0].tone, 'ok');
  const lagging = reconcile({ history: history([]), journal: [entry({ replacement: { hash: replacement, kind: 'speed-up', status: 'confirmed' } })], wallet, now: NOW });
  assert.equal(lagging.missing[0].tone, 'todo');
  assert.equal(lagging.missing[0].replacementConfirmed, true);
  assert.equal(historyRetry(lagging).due, true, 'a confirmed replacement missing from the history triggers the automatic re-load');
  const pending = reconcile({ history: history([]), journal: [entry({ replacement: { hash: replacement, kind: 'speed-up', status: 'pending' } })], wallet, now: NOW });
  assert.equal(historyRetry(pending).due, false);
  assert.match(pending.missing[0].reason, /not confirmed yet/);
  // A malformed replacement is ignored.
  const bad = reconcile({ history: history([out(replacement)]), journal: [entry({ replacement: { hash: 'nope' } })], wallet, now: NOW });
  assert.equal(bad.outside.length, 1);
});

test('page wiring: looks up once when a transaction turns out replaced, read-only, remembered for later sessions', () => {
  assert.match(app, /result\.status === 'replaced' && before !== 'replaced' && !item\.replacement/);
  assert.match(app, /Find the replacement/);
  assert.match(app, /\(replacement\)`\.slice\(0, 80\)/);
  assert.match(app, /\.tx-check, #transaction-journal \.tx-find/);
  const finder = source.slice(source.indexOf('export async function findReplacement'));
  assert.doesNotMatch(finder, /eth_send|personal_sign|eth_sign|wallet_/);
});
