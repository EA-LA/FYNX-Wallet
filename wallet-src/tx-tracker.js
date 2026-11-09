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
const DATA = /^0x(?:[0-9a-fA-F]{2}){0,4096}$/;
function callOf(tx) {
  return { to: ADDRESS.test(tx?.to || '') ? tx.to.toLowerCase() : null, value: QUANTITY.test(tx?.value || '') ? BigInt(tx.value).toString() : null, input: typeof tx?.input === 'string' && DATA.test(tx.input) ? tx.input.toLowerCase() : null };
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
  // What the transaction does (recipient, amount, call data): kept so a later replacement can be told
  // apart as a speed-up (same call) or a cancel. Public on-chain facts only.
  if (tx) base.call = callOf(tx);
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

// ---- Finding the replacement of a replaced transaction (read-only) ----
// "Speed up" and "Cancel" in a wallet send a new transaction with the same nonce. The network then
// drops the original, so its ID never confirms. To show which transaction took its place:
//   1. find the first block where the wallet's transaction count passed the nonce (binary search on
//      eth_getTransactionCount at past blocks), read that block and pick the wallet's transaction
//      with that nonce;
//   2. if the connection cannot read past blocks that far back (most non-archive nodes keep about
//      128 blocks), check candidate IDs (outgoing transfers from the loaded history) one by one.
// Every match is verified on-chain (same sender, same nonce, different ID). Nothing is signed or sent.
export const BLOCK_SECONDS = Object.freeze({ 11155111: 12, 84532: 2, 8453: 2 });
export const RECENT_BLOCKS = 120;
export const MAX_LOOKBACK_SECONDS = 24 * 60 * 60;
export const MAX_CANDIDATES = 20;
export const REPLACEMENT_KINDS = Object.freeze({
  'speed-up': 'Sped up', cancel: 'Cancelled', different: 'Different transaction', unknown: 'Same number, other transaction',
});
// How many blocks back to look: from the submit time (plus a margin), at least RECENT_BLOCKS, at most a day.
export function lookbackBlocks(network, submittedAt, now = Date.now()) {
  const seconds = BLOCK_SECONDS[network?.id] || 2, cap = Math.ceil(MAX_LOOKBACK_SECONDS / seconds);
  if (!Number.isFinite(submittedAt) || submittedAt > now) return cap;
  return Math.min(cap, Math.max(RECENT_BLOCKS, Math.ceil((now - submittedAt) / 1000 / seconds) + 50));
}
// original / found: { to, value, input } as made by callOf (lower-case, value as a decimal string).
export function replacementKind(from, original, found) {
  const self = typeof from === 'string' && found?.to === from.toLowerCase();
  if (self && found.value === '0' && (found.input === '0x' || found.input === null)) return 'cancel';
  if (!original || (original.to === null && original.value === null && original.input === null)) return 'unknown';
  return original.to === found?.to && original.value === found?.value && original.input === found?.input ? 'speed-up' : 'different';
}
const hexBlock = n => '0x' + n.toString(16);
const sameAddress = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

// known: { hash, from, nonce, original: { to, value, input } | null, submittedAt, candidates: [hash], now }
export async function findReplacement(request, known = {}, network = null) {
  const { hash, from, nonce } = known;
  if (typeof hash !== 'string' || !HASH.test(hash)) throw new Error('Enter a valid transaction hash.');
  if (!ADDRESS.test(from || '') || !Number.isSafeInteger(nonce) || nonce < 0) {
    return { state: 'unknown', detail: 'The wallet and transaction number (nonce) of this transaction are not known on this page, so its replacement cannot be looked up. Open the wallet\'s activity list instead.' };
  }
  const now = Number.isFinite(known.now) ? known.now : Date.now();
  const latest = quantity(await request({ method: 'eth_blockNumber', params: [] }));
  if (latest === null) throw invalid();
  const matches = tx => tx && typeof tx.hash === 'string' && HASH.test(tx.hash) && tx.hash.toLowerCase() !== hash.toLowerCase() && sameAddress(tx.from, from) && quantity(tx.nonce) === nonce;
  let found = null, method = null, olderThanWindow = false, unreadable = false;

  const countAt = async block => {
    const value = quantity(await request({ method: 'eth_getTransactionCount', params: [from, hexBlock(block)] }));
    if (value === null) throw invalid();
    return value;
  };
  const countNow = await countAt(latest).catch(() => null);
  if (countNow !== null && countNow <= nonce) return { state: 'not-used', detail: 'The wallet has not used this transaction number yet, so nothing has replaced it. Check the status again.' };
  const full = lookbackBlocks(network, known.submittedAt, now);
  // searchAll (the wallet + number search): try the whole chain first; connections that cannot read
  // old state fall back to the day window, then the recent blocks.
  const windows = known.searchAll === true ? [latest, full, RECENT_BLOCKS] : [full, RECENT_BLOCKS];
  for (const window of [...new Set(windows)]) {
    if (countNow === null) { unreadable = true; break; }
    let lo = Math.max(0, latest - window), hi = latest, atLo;
    try { atLo = await countAt(lo); } catch { unreadable = true; continue; }
    // Used before the full window: further back than this page searches. Before the short fallback
    // window only: the older blocks could not be read.
    if (atLo > nonce) { if (window === full || window === latest) olderThanWindow = true; else unreadable = true; break; }
    try {
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (await countAt(mid) > nonce) hi = mid; else lo = mid;
      }
    } catch { unreadable = true; continue; }
    const block = await request({ method: 'eth_getBlockByNumber', params: [hexBlock(hi), true] });
    const tx = Array.isArray(block?.transactions) ? block.transactions.find(t => typeof t === 'object' && matches(t)) : null;
    if (tx) { found = { ...tx, blockNumber: tx.blockNumber || hexBlock(hi) }; method = 'blocks'; }
    break;
  }
  if (!found) {
    const seen = new Set();
    for (const candidate of Array.isArray(known.candidates) ? known.candidates : []) {
      if (typeof candidate !== 'string' || !HASH.test(candidate) || candidate.toLowerCase() === hash.toLowerCase() || seen.has(candidate.toLowerCase())) continue;
      seen.add(candidate.toLowerCase());
      if (seen.size > MAX_CANDIDATES) break;
      const tx = await request({ method: 'eth_getTransactionByHash', params: [candidate] });
      if (matches(tx)) { found = tx; method = 'history'; break; }
    }
  }
  if (!found) {
    const why = olderThanWindow ? 'It happened before this transaction was submitted (or more than a day ago), which is further back than this page searches.'
      : unreadable ? 'This network connection cannot read past blocks, and none of the transfers in the loaded history has the same number. Load the history in Portfolio & history, then try again.'
        : 'The block where the number was used does not list it.';
    return { state: 'not-found', reason: olderThanWindow ? 'older' : unreadable ? 'unreadable' : 'missing', detail: `The replacement could not be found. ${why} The wallet's activity list shows it.` };
  }
  const receipt = await request({ method: 'eth_getTransactionReceipt', params: [found.hash] });
  const block = quantity(receipt?.blockNumber ?? found.blockNumber);
  const target = confirmationTarget(network);
  const call = callOf(found), kind = replacementKind(from, known.original || null, call);
  let status = 'pending', confirmations = 0;
  if (receipt?.blockNumber && block !== null && receipt.transactionHash?.toLowerCase() === found.hash.toLowerCase() && ['0x0', '0x1'].includes(receipt.status)) {
    status = receipt.status === '0x1' ? 'confirmed' : 'failed';
    confirmations = Math.max(0, latest - block + 1);
  }
  return { state: 'found', hash: found.hash.toLowerCase(), block, kind, status, confirmations, target, deep: status !== 'pending' && confirmations >= target, to: call.to, value: call.value, method, detail: replacementText({ kind, status, block, confirmations, target }) };
}
// ---- Searching by wallet and transaction number (nonce) ----
// For a looked-up ID the network no longer knows (or knows without its wallet): the owner copies the
// wallet and number from the explorer or the wallet's activity list, and FYNX finds the transaction
// that used that number. Read-only, like everything in this file.
export const NO_HASH = '0x' + '0'.repeat(64); // matches no real transaction: nothing is excluded
export function parseNonceSearch(wallet, nonce) {
  const from = String(wallet ?? '').trim(), text = String(nonce ?? '').trim();
  if (!ADDRESS.test(from)) return { ok: false, field: 'wallet', error: 'Enter the wallet address: 0x followed by 40 letters and numbers.' };
  if (!/^\d{1,15}$/.test(text)) return { ok: false, field: 'nonce', error: 'Enter the transaction number (nonce) as a whole number, for example 12. Explorers list it as "Nonce".' };
  const n = Number(text);
  if (!Number.isSafeInteger(n)) return { ok: false, field: 'nonce', error: 'That transaction number is too large.' };
  return { ok: true, from: from.toLowerCase(), nonce: n };
}
// exclude: the looked-up ID (left out of the matches), or omitted. candidates: transaction IDs from the
// loaded history to try when old blocks cannot be read.
export async function findByNonce(request, { from, nonce, exclude = null, candidates = [], now } = {}, network = null) {
  const parsed = parseNonceSearch(from, nonce);
  if (!parsed.ok) throw new Error(parsed.error);
  const hash = typeof exclude === 'string' && HASH.test(exclude) ? exclude : NO_HASH;
  const found = await findReplacement(request, { hash, from: parsed.from, nonce: parsed.nonce, original: null, candidates, searchAll: true, now }, network);
  const n = parsed.nonce;
  if (found.state === 'not-used') return { ...found, from: parsed.from, nonce: n, detail: `This wallet has not used number ${n} yet: its next transaction will use it. If you expected one, it is still waiting or was dropped; check the wallet's activity.` };
  if (found.state === 'not-found') {
    const why = found.reason === 'older' ? 'The number was used before the oldest block this connection can read.'
      : found.reason === 'unreadable' ? 'This network connection cannot read past blocks, and no transfer in the loaded history used it. Load the history in Portfolio & history, then search again.'
        : 'The block where the number was used does not list it.';
    return { ...found, from: parsed.from, nonce: n, detail: `No transaction with number ${n} from this wallet was found. ${why} The wallet's page on the explorer lists every transaction with its number.` };
  }
  if (found.state !== 'found') return { ...found, from: parsed.from, nonce: n };
  const what = found.kind === 'cancel' ? 'It sends nothing to anyone (a cancel in the wallet).' : 'Open it on the explorer to see what it did.';
  const where = found.status === 'confirmed' ? `Confirmed in block ${found.block} (${Math.min(found.confirmations, 9999)} of ${found.target} confirmations${found.deep ? ', settled' : ''}).`
    : found.status === 'failed' ? `Included in block ${found.block} but failed, so nothing moved.` : 'Not confirmed yet.';
  return { ...found, from: parsed.from, nonce: n, kind: found.kind === 'cancel' ? 'cancel' : 'unknown', detail: `Number ${n} from this wallet was used by this transaction. ${where} ${what}` };
}
// Whether the lookup card offers the wallet + number search: the network does not know the ID, or knows
// it was replaced without its wallet and number.
export function offersNonceSearch(result) {
  return result?.status === 'not-found' || (result?.status === 'replaced' && !canFindReplacement(result));
}

// ---- Looking up an ID typed into the Track card (not submitted on this page) ----
// Whether the replacement of a looked-up transaction can be searched: the network still knows the
// original (so its wallet and number are known) and the wallet already used that number elsewhere.
export function canFindReplacement(result) {
  return result?.status === 'replaced' && ADDRESS.test(result.from || '') && Number.isSafeInteger(result.nonce) && result.nonce >= 0;
}
// The facts shown for a looked-up transaction, as [name, value] rows. Public on-chain facts only.
// origin: 'page' (submitted on this page), 'register' (an earlier FYNX session) or null.
export function lookupFacts(result, { origin = null } = {}) {
  if (!result) return [];
  const rows = [['Status', result.label || STATUS_LABELS[result.status] || result.status]];
  if (result.from) rows.push(['From', result.from]);
  if (result.from) rows.push(['To', result.to || 'A new contract']);
  if (Number.isSafeInteger(result.nonce)) rows.push(['Number (nonce)', String(result.nonce)]);
  if (Number.isSafeInteger(result.block)) rows.push(['Block', String(result.block)]);
  if (['confirmed', 'failed'].includes(result.status)) rows.push(['Confirmations', `${Math.min(result.confirmations, 9999)} of ${result.target}${result.deep ? ' (settled)' : ''}`]);
  if (result.call?.value && result.call.value !== '0' && (result.call.input === '0x' || result.call.input === null)) rows.push(['Sends ETH', `${formatWei(result.call.value)} ETH`]);
  rows.push(['Sent from FYNX', origin === 'page' ? 'Yes, on this page' : origin === 'register' ? 'Yes, in an earlier session (remembered in this browser)' : 'Not that this browser knows']);
  return rows;
}
// Exact wei → ETH text without floating point (trailing zeros trimmed).
export function formatWei(wei) {
  const v = BigInt(wei), unit = 10n ** 18n, whole = v / unit, frac = (v % unit).toString().padStart(18, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}
// What to do next for a looked-up transaction, in one sentence (beside the status detail).
export function lookupNext(result, { canFind = canFindReplacement(result), replacement = null } = {}) {
  if (!result) return '';
  if (replacement?.state === 'found') return replacement.deep ? 'The replacement is settled: nothing more to check.' : 'Check the replacement again in a minute to follow its confirmations.';
  if (result.status === 'replaced') return canFind ? 'Press “Find the replacement” to see which transaction took its place. FYNX only reads the network.' : 'The network no longer knows this transaction\'s wallet and number. If you know them (from the explorer or the wallet\'s activity), search by wallet and number below.';
  if (isSettled(result)) return result.status === 'not-found' ? 'If you copied it from a wallet or explorer, check that the selected network matches. If it was sped up or cancelled and has gone, search by its wallet and number below.' : 'Settled: nothing more to check.';
  return 'Press “Check again” to follow it. Checking never signs or resends anything.';
}
// One plain sentence about a found replacement.
export function replacementText({ kind, status, block, confirmations, target }) {
  const what = kind === 'cancel' ? 'You cancelled it in the wallet: the replacement sends nothing to anyone and only cost a network fee.'
    : kind === 'speed-up' ? 'You sped it up in the wallet: the replacement does the same thing under a new ID.'
      : kind === 'different' ? 'Another transaction from this wallet used the same number and does something different. Check it on the explorer.'
        : 'Another transaction from this wallet used the same number. Open it on the explorer to see what it did.';
  const where = status === 'confirmed' ? `It is confirmed in block ${block} (${Math.min(confirmations, 9999)} of ${target} confirmations).`
    : status === 'failed' ? `It was included in block ${block} but failed, so nothing moved.`
      : 'It is not confirmed yet.';
  return `${what} ${where}`;
}
