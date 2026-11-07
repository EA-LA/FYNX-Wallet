// Read-only transaction status checks for the Crypto tools "Track" card.
// Nothing here signs, sends or changes a transaction: it only reads what the
// network reports and explains it, including replaced, dropped and
// reorganised transactions that a plain receipt check reports as "pending".
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const QUANTITY = /^0x[0-9a-fA-F]{1,64}$/;
export const DROP_AFTER_MS = 10 * 60 * 1000;
export const STATUSES = Object.freeze(['pending', 'unseen', 'confirmed', 'failed', 'replaced', 'dropped', 'reorged', 'lagging', 'not-found']);
export const STATUS_LABELS = Object.freeze({
  pending: 'Waiting to be included', unseen: 'Not seen by the network yet', confirmed: 'Confirmed', failed: 'Failed on-chain',
  replaced: 'Replaced by another transaction', dropped: 'Dropped by the network', reorged: 'Block replaced: re-checking needed',
  lagging: 'Network connection behind', 'not-found': 'Not found on this network',
});
// Blocks after which a test transaction is very unlikely to move. This is a
// practical threshold for testing, not a finality guarantee.
export function confirmationTarget(network) { return network?.id === 11155111 ? 12 : 30; }
export function quantity(value) {
  if (typeof value !== 'string' || !QUANTITY.test(value)) return null;
  const n = BigInt(value);
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null;
}
function minutes(ms) { const m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? 'under a minute' : m === 1 ? '1 minute' : `${m} minutes`; }
function invalid() { return new Error('Transaction status could not be verified. Check the block explorer.'); }

// facts: { hash, tx, receipt, latestBlock, canonicalBlockHash, accountNonce, knownNonce, submittedAt, now, network }
export function classify(facts) {
  const { hash, tx = null, receipt = null, network = null } = facts;
  if (typeof hash !== 'string' || !HASH.test(hash)) throw new Error('Enter a valid transaction hash.');
  if (tx && (typeof tx.hash !== 'string' || tx.hash.toLowerCase() !== hash.toLowerCase())) throw invalid();
  const latest = Number.isSafeInteger(facts.latestBlock) && facts.latestBlock >= 0 ? facts.latestBlock : null;
  const now = Number.isFinite(facts.now) ? facts.now : Date.now();
  const from = tx && ADDRESS.test(tx.from || '') ? tx.from : null;
  const to = tx && ADDRESS.test(tx.to || '') ? tx.to : null;
  const nonce = tx ? quantity(tx.nonce) : (Number.isSafeInteger(facts.knownNonce) ? facts.knownNonce : null);
  const base = { hash, from, to, nonce, block: null, confirmations: 0, target: confirmationTarget(network), deep: false };
  const result = (status, detail, extra = {}) => ({ ...base, ...extra, status, label: STATUS_LABELS[status], detail });
  if (receipt && receipt.blockNumber) {
    const block = quantity(receipt.blockNumber);
    if (receipt.transactionHash?.toLowerCase() !== hash.toLowerCase() || !['0x0', '0x1'].includes(receipt.status) || !Number.isSafeInteger(block) || block <= 0) throw invalid();
    if (latest === null || latest < block || !facts.canonicalBlockHash) return result('lagging', 'The network connection has not caught up with the block that holds this transaction. Check again in a moment, or open the explorer.', { block });
    if (typeof receipt.blockHash === 'string' && facts.canonicalBlockHash.toLowerCase() !== receipt.blockHash.toLowerCase()) {
      return result('reorged', `Block ${block} was replaced by the network (a reorganisation), so this inclusion no longer counts. The transaction usually comes back in a new block: check again in a minute and do not send it again yet.`, { block });
    }
    const confirmations = latest - block + 1, target = base.target, deep = confirmations >= target;
    if (receipt.status === '0x0') return result('failed', `The transaction was included in block ${block} but failed, so nothing moved. A network fee was still charged.`, { block, confirmations, deep });
    return result('confirmed', `Included in block ${block} with ${confirmations} confirmation${confirmations === 1 ? '' : 's'}.${deep ? ` Past ${target} blocks: very unlikely to change.` : ` Wait for ${target} confirmations before treating it as settled.`}`, { block, confirmations, deep });
  }
  const accountNonce = Number.isSafeInteger(facts.accountNonce) ? facts.accountNonce : null;
  const used = accountNonce !== null && nonce !== null && accountNonce > nonce;
  if (tx) {
    if (tx.blockNumber) return result('pending', 'Included in a block; the receipt is not available yet. Check again in a moment.');
    if (used) return result('replaced', 'This wallet already completed another transaction with the same number (nonce), so this one can no longer go through. Usually you pressed "Speed up" or "Cancel" in the wallet: look there for the version that confirmed under a different ID.');
    const age = Number.isFinite(facts.submittedAt) ? ` Submitted ${minutes(now - facts.submittedAt)} ago.` : '';
    return result('pending', `Waiting in the network queue.${age} Do not send it again: if it takes long, use "Speed up" in your wallet.`);
  }
  if (used) return result('replaced', 'The network no longer has this transaction and the wallet has already used its number (nonce) for another transaction. Look in the wallet for the sped-up or cancelled version.');
  if (!Number.isFinite(facts.submittedAt)) return result('not-found', 'This network does not know this transaction ID. Check that the network matches, or that the ID was copied in full.');
  if (now - facts.submittedAt >= DROP_AFTER_MS) return result('dropped', `The network has no record of it ${minutes(now - facts.submittedAt)} after submitting, and nothing was spent. Check the wallet's activity first; only then try again with a fresh review.`);
  return result('unseen', 'The network has not seen it yet. This can take a moment right after submitting. Check again shortly.');
}

// request: an EIP-1193 style read function ({ method, params }) => Promise.
// known: { from, nonce, submittedAt } remembered from this page session.
export async function checkTransaction(request, hash, known = {}, network = null, now = Date.now()) {
  if (typeof hash !== 'string' || !HASH.test(hash)) throw new Error('Enter a valid transaction hash.');
  const [tx, receipt, latestHex] = await Promise.all([
    request({ method: 'eth_getTransactionByHash', params: [hash] }),
    request({ method: 'eth_getTransactionReceipt', params: [hash] }),
    request({ method: 'eth_blockNumber', params: [] }),
  ]);
  const latestBlock = quantity(latestHex);
  if (latestBlock === null) throw invalid();
  let canonicalBlockHash = null, accountNonce = null;
  if (receipt?.blockNumber) {
    if (quantity(receipt.blockNumber) === null) throw invalid();
    if (quantity(receipt.blockNumber) <= latestBlock) {
      const block = await request({ method: 'eth_getBlockByNumber', params: [receipt.blockNumber, false] });
      canonicalBlockHash = typeof block?.hash === 'string' && HASH.test(block.hash) ? block.hash : null;
    }
  } else {
    const from = ADDRESS.test(tx?.from || '') ? tx.from : (ADDRESS.test(known.from || '') ? known.from : null);
    if (from) accountNonce = quantity(await request({ method: 'eth_getTransactionCount', params: [from, 'latest'] }));
  }
  const facts = { hash, tx, receipt, latestBlock, canonicalBlockHash, accountNonce, knownNonce: known.nonce, submittedAt: known.submittedAt, now, network };
  const result = classify(facts);
  if (result.status !== 'replaced') return result;
  // The nonce is read after the receipt: if the transaction was included in
  // between, its own receipt now exists. Look once more before saying "replaced".
  const late = await request({ method: 'eth_getTransactionReceipt', params: [hash] });
  if (!late?.blockNumber) return result;
  const lateBlock = quantity(late.blockNumber), latestNow = quantity(await request({ method: 'eth_blockNumber', params: [] }));
  if (lateBlock === null || latestNow === null) throw invalid();
  const block = lateBlock <= latestNow ? await request({ method: 'eth_getBlockByNumber', params: [late.blockNumber, false] }) : null;
  return classify({ ...facts, receipt: late, latestBlock: latestNow, canonicalBlockHash: typeof block?.hash === 'string' && HASH.test(block.hash) ? block.hash : null });
}
// Settled: nothing more to wait for on this page (deeply confirmed or failed, replaced, dropped).
export const isSettled = result => ['replaced', 'dropped', 'not-found'].includes(result?.status) || (['confirmed', 'failed'].includes(result?.status) && result.deep === true);

// Transactions still worth checking on this network: not settled, newest first.
// items: journal entries { hash, network: { id }, result, submittedAt }.
export const AUTO_CHECK_MS = 30 * 1000;
export const MAX_BATCH = 10;
export function waitingItems(items, networkId) {
  return [...items].filter(i => i && i.network?.id === networkId && !isSettled(i.result))
    .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)).slice(0, MAX_BATCH);
}
// Whether the automatic re-check should run now. It is read-only, but it still pauses while the page is
// hidden, while another action is in progress, without a connected wallet, or when nothing is waiting.
export function autoCheckDue({ enabled, hidden, busy, connected, waiting, lastRun, now }) {
  if (!enabled || hidden || busy || !connected || !waiting) return false;
  return !Number.isFinite(lastRun) || now - lastRun >= AUTO_CHECK_MS;
}
// One plain sentence about a batch check.
export function batchSummary(results) {
  const ok = results.filter(r => r.result), failed = results.length - ok.length;
  if (!results.length) return 'Nothing is waiting on this network.';
  const counts = new Map();
  for (const r of ok) counts.set(r.result.label, (counts.get(r.result.label) || 0) + 1);
  const parts = [...counts].map(([label, n]) => `${n} ${label.toLowerCase()}`);
  if (failed) parts.push(`${failed} could not be checked`);
  return `Checked ${results.length} transaction${results.length === 1 ? '' : 's'}: ${parts.join(', ')}.`;
}
