// Pilot reconciliation: pure helpers for the Crypto tools "Portfolio & history" card and tests.
// Compares three read-only sources for one network and the verified wallet:
//   1. the transfer history from the FYNX server's history provider,
//   2. the transactions submitted from this page session (the Track list),
//   3. the balances the FYNX server read for the same wallet.
// It never signs, sends or saves anything. Amounts use whole-unit integer math (no floating point).
import { MAINNET_ID, MAINNET_CAPS } from '../firebase-wallet/functions/mainnet.js';

export const DECIMALS = Object.freeze({ ETH: 18, USDC: 6 });
const TOKENS = Object.keys(DECIMALS);
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

// "1.25" → 1250000n for 6 decimals. Returns null for anything that is not a plain non-negative decimal.
export function toUnits(value, decimals) {
  const text = String(value ?? '').trim();
  const match = /^(\d{1,30})(?:\.(\d+))?$/.exec(text);
  if (!match || !Number.isInteger(decimals) || decimals < 0) return null;
  const fraction = (match[2] || '').replace(/0+$/, '');
  if (fraction.length > decimals) return null;
  return BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt((fraction || '0').padEnd(decimals, '0'));
}
// 1250000n → "1.25" for 6 decimals; keeps the sign.
export function fromUnits(units, decimals) {
  const negative = units < 0n, abs = negative ? -units : units, base = 10n ** BigInt(decimals);
  const whole = abs / base, fraction = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}
export const shortAddress = value => (typeof value === 'string' && ADDRESS.test(value) ? `${value.slice(0, 6)}…${value.slice(-4)}` : 'unknown');

// The per-transfer limit used to flag real-money transfers: the owner's limit when sending is on,
// otherwise the pilot ceiling (anything above it should never have come from FYNX).
export function transferLimit(chainId, token, policy) {
  if (chainId !== MAINNET_ID || !DECIMALS[token]) return null;
  const value = policy?.enabled && policy[token] ? policy[token] : MAINNET_CAPS[token];
  return { value, units: toUnits(value, DECIMALS[token]), source: policy?.enabled ? 'your limit' : 'the pilot ceiling' };
}

// Why a transaction submitted from this page is not (yet) in the history.
const MISSING = {
  confirmed: ['todo', 'Confirmed, but the history provider has not listed it yet. It can lag a few minutes: load the history again.'],
  failed: ['ok', 'Failed on-chain, so no ETH or USDC moved (only the network fee). It is not expected in the history.'],
  replaced: ['todo', 'Replaced by another transaction with the same nonce. Check the replacement on the explorer: it may be the one in the history.'],
  dropped: ['ok', 'Dropped by the network, so nothing moved. It is not expected in the history.'],
};
// Lower-case on purpose: they sit inside sentences. Kept in step with REASONS in pilot-register.js.
const REASON_TEXT = { 'earlier-session': 'sent from FYNX in an earlier session', 'other-device': 'sent from another device', 'other-app': 'sent from another wallet app', 'own-transfer': 'moved between own wallets' };
const SOURCE_TEXT = { 'this-page': 'from this page', earlier: 'from FYNX, earlier session', marked: 'marked yours', outside: 'not from this page' };
const WAITING = ['todo', 'Not settled yet. Use “Check status” in Step 5 · Track, then load the history again.'];

function cleanItem(item) {
  if (!item || typeof item.hash !== 'string' || !HASH.test(item.hash)) return null;
  if (!['in', 'out'].includes(item.direction) || !DECIMALS[item.token]) return null;
  const units = toUnits(item.amount, DECIMALS[item.token]);
  if (units === null) return null;
  const time = typeof item.time === 'string' && !Number.isNaN(Date.parse(item.time)) ? new Date(item.time).toISOString() : null;
  return { hash: item.hash.toLowerCase(), direction: item.direction, token: item.token, units, amount: fromUnits(units, DECIMALS[item.token]), from: ADDRESS.test(item.from || '') ? item.from : null, to: ADDRESS.test(item.to || '') ? item.to : null, block: Number.isSafeInteger(item.block) ? item.block : null, time };
}

// input: { history: { chainId, network, items, more }, journal: [{ hash, label, network: { id }, address, status }],
//          balances: { chainId, eth, usdc, ok } | null, wallet: address | null, policy: mainnet setting | null, now,
//          known: pilot register entries [{ hash, chainId, kind: 'page' | 'marked', label?, reason?, address? }] }
export function reconcile(input = {}) {
  const history = input.history || {};
  const chainId = Number(history.chainId);
  const network = typeof history.network === 'string' ? history.network : 'this network';
  const wallet = typeof input.wallet === 'string' && ADDRESS.test(input.wallet) ? input.wallet.toLowerCase() : null;
  const items = (Array.isArray(history.items) ? history.items : []).map(cleanItem).filter(Boolean);
  const complete = history.more !== true;
  const now = Number.isFinite(input.now) ? input.now : Date.now();

  // Transactions submitted from this page on the same network (and, when known, the same wallet).
  const submitted = new Map(), otherWallet = [];
  for (const entry of Array.isArray(input.journal) ? input.journal : []) {
    if (!entry || typeof entry.hash !== 'string' || !HASH.test(entry.hash) || Number(entry.network?.id) !== chainId) continue;
    if (wallet && typeof entry.address === 'string' && entry.address.toLowerCase() !== wallet) { otherWallet.push(entry); continue; }
    submitted.set(entry.hash.toLowerCase(), entry);
  }
  // Remembered in this browser (wallet-src/pilot-register.js): earlier FYNX sessions and transfers you marked as yours.
  const earlier = new Map(), marked = new Map();
  for (const entry of Array.isArray(input.known) ? input.known : []) {
    if (!entry || typeof entry.hash !== 'string' || !HASH.test(entry.hash) || Number(entry.chainId) !== chainId) continue;
    if (wallet && typeof entry.address === 'string' && entry.address.toLowerCase() !== wallet) continue;
    (entry.kind === 'marked' ? marked : entry.kind === 'page' ? earlier : new Map()).set(entry.hash.toLowerCase(), entry);
  }

  const totals = {};
  for (const token of TOKENS) totals[token] = { inUnits: 0n, outUnits: 0n, inCount: 0, outCount: 0 };
  const transfers = [], outside = [], overLimit = [];
  for (const item of items) {
    const t = totals[item.token];
    if (item.direction === 'in') { t.inUnits += item.units; t.inCount += 1; } else { t.outUnits += item.units; t.outCount += 1; }
    const fromPage = submitted.has(item.hash);
    const source = fromPage ? 'this-page' : earlier.has(item.hash) ? 'earlier' : (item.direction === 'out' && marked.has(item.hash)) ? 'marked' : 'outside';
    const limit = item.direction === 'out' ? transferLimit(chainId, item.token, input.policy) : null;
    const above = Boolean(limit && limit.units !== null && item.units > limit.units);
    const row = { ...item, source, label: fromPage ? submitted.get(item.hash).label : source === 'earlier' ? earlier.get(item.hash).label || null : null, reason: source === 'marked' ? marked.get(item.hash).reason : null, aboveLimit: above ? limit : null };
    transfers.push(row);
    if (item.direction === 'out' && source === 'outside') outside.push(row);
    if (above) overLimit.push(row);
  }
  const inHistory = new Set(items.map(i => i.hash));
  const missing = [];
  for (const [hash, entry] of submitted) {
    if (inHistory.has(hash)) continue;
    const [tone, reason] = MISSING[entry.status] || WAITING;
    missing.push({ hash, label: typeof entry.label === 'string' ? entry.label : 'Transaction', status: entry.status || 'pending', tone, reason });
  }
  const matched = transfers.filter(t => t.source === 'this-page').length;
  const fromEarlier = transfers.filter(t => t.source === 'earlier').length;
  const explained = transfers.filter(t => t.source === 'marked');

  const totalsOut = {};
  for (const token of TOKENS) {
    const t = totals[token], d = DECIMALS[token];
    totalsOut[token] = { in: fromUnits(t.inUnits, d), out: fromUnits(t.outUnits, d), net: fromUnits(t.inUnits - t.outUnits, d), inCount: t.inCount, outCount: t.outCount };
  }

  // Balance checks. USDC must match exactly when the history is complete; ETH also pays network fees,
  // which the history does not list, so the balance is normally a little below what the history explains.
  const balances = input.balances && input.balances.ok !== false && Number(input.balances.chainId) === chainId ? input.balances : null;
  const balance = {};
  for (const token of TOKENS) {
    const d = DECIMALS[token], actual = balances ? toUnits(balances[token.toLowerCase()], d) : null;
    const expected = totals[token].inUnits - totals[token].outUnits;
    if (actual === null) { balance[token] = { state: 'unknown', expected: fromUnits(expected, d), actual: null, difference: null }; continue; }
    const diff = actual - expected;
    let state;
    if (!complete) state = 'partial';
    else if (diff === 0n) state = 'match';
    else if (token === 'ETH' && diff < 0n) state = 'fees';
    else state = 'differs';
    balance[token] = { state, expected: fromUnits(expected, d), actual: fromUnits(actual, d), difference: fromUnits(diff, d) };
  }

  const findings = [];
  const add = (tone, text) => findings.push({ tone, text });
  if (!complete) add('todo', 'The history has more than 100 transfers, so only the newest 100 were checked. Totals and balance checks cover those only.');
  if (!items.length) add('ok', `No ETH or USDC transfers on ${network} for this wallet yet.`);
  if (matched) add('ok', `${matched} transfer${matched === 1 ? '' : 's'} in the history ${matched === 1 ? 'was' : 'were'} submitted from this page.`);
  if (fromEarlier) add('ok', `${fromEarlier} transfer${fromEarlier === 1 ? '' : 's'} in the history ${fromEarlier === 1 ? 'was' : 'were'} submitted from FYNX in an earlier session on this browser.`);
  if (explained.length) add('ok', `${explained.length} outgoing transfer${explained.length === 1 ? '' : 's'} you marked as yours: ${[...new Set(explained.map(t => REASON_TEXT[t.reason] || 'marked'))].join('; ')}.`);
  if (outside.length) add('flag', `${outside.length} outgoing transfer${outside.length === 1 ? ' was' : 's were'} not submitted from FYNX on this browser. Check each one below and mark it as yours, or follow the rollback plan if it was not.`);
  for (const row of overLimit) add('flag', `Sent ${row.amount} ${row.token} (${row.time ? row.time.slice(0, 10) : `block ${row.block ?? '—'}`}): above ${row.aboveLimit.source} of ${row.aboveLimit.value} ${row.token} per transfer.`);
  for (const m of missing) add(m.tone, `${m.label} (${m.hash.slice(0, 10)}…): ${m.reason}`);
  if (otherWallet.length) add('todo', `${otherWallet.length} transaction${otherWallet.length === 1 ? '' : 's'} on this page came from a different connected wallet and ${otherWallet.length === 1 ? 'is' : 'are'} not part of this check.`);
  if (balance.USDC.state === 'match') add('ok', `USDC balance ${balance.USDC.actual} matches the history exactly.`);
  if (balance.USDC.state === 'differs') add('flag', `USDC balance is ${balance.USDC.actual} but the history explains ${balance.USDC.expected} (difference ${balance.USDC.difference}). Find the missing transfer before going on.`);
  if (balance.ETH.state === 'match') add('ok', `ETH balance ${balance.ETH.actual} matches the history exactly.`);
  if (balance.ETH.state === 'fees') add('ok', `ETH balance is ${balance.ETH.difference.replace(/^-/, '')} ETH below what the history explains: that is what network fees cost.`);
  if (balance.ETH.state === 'differs') add('todo', `ETH balance is ${balance.ETH.difference} ETH above what the history explains. ETH sent by a contract (for example a swap) is not listed in this history; check the explorer.`);
  if (balance.USDC.state === 'unknown') add('todo', 'Press “Check balances” to compare the balances with the history.');

  const flags = findings.filter(f => f.tone === 'flag').length, todos = findings.filter(f => f.tone === 'todo').length;
  const state = flags ? 'review' : (!complete || balance.USDC.state === 'unknown' || todos) ? 'incomplete' : 'balanced';
  return { chainId, network, wallet, complete, checkedAt: new Date(now).toISOString(), state, totals: totalsOut, balance, transfers, outside, overLimit, missing, matched, fromEarlier, explained, findings, flags, todos };
}

export const STATE_TEXT = Object.freeze({
  balanced: 'Balanced: everything in the history is explained.',
  review: 'Needs a look: something does not add up.',
  incomplete: 'Not finished: a step is still open.',
});

// Markdown record for the pilot file. Shortened addresses only; transaction IDs are public and needed to trace a transfer.
export function reconcileReport(result) {
  const lines = [`# FYNX reconciliation · ${result.network}`, '', `Checked: ${result.checkedAt.replace('T', ' ').slice(0, 16)} UTC`, `Wallet: ${shortAddress(result.wallet)}`, `Result: ${STATE_TEXT[result.state]}`, ''];
  lines.push('## Totals', '', '| Asset | In | Out | Net | Balance | Check |', '|---|---|---|---|---|---|');
  const check = { match: 'matches', fees: 'below by network fees', differs: 'DIFFERS', partial: 'history partial', unknown: 'not checked' };
  for (const token of TOKENS) {
    const t = result.totals[token], b = result.balance[token];
    lines.push(`| ${token} | ${t.in} (${t.inCount}) | ${t.out} (${t.outCount}) | ${t.net} | ${b.actual ?? '—'} | ${check[b.state]} |`);
  }
  lines.push('', '## Findings', '');
  for (const f of result.findings) lines.push(`- ${f.tone === 'flag' ? '[!] ' : f.tone === 'todo' ? '[ ] ' : '[x] '}${f.text}`);
  lines.push('', '## Transfers', '');
  if (!result.transfers.length) lines.push('None.');
  for (const t of result.transfers) {
    const other = t.direction === 'in' ? t.from : t.to;
    lines.push(`- ${t.time ? t.time.slice(0, 16).replace('T', ' ') : `block ${t.block ?? '—'}`} · ${t.direction === 'in' ? 'received' : 'sent'} ${t.amount} ${t.token} ${t.direction === 'in' ? 'from' : 'to'} ${shortAddress(other)} · ${SOURCE_TEXT[t.source] || 'not from this page'}${t.source === 'marked' ? ` (${REASON_TEXT[t.reason] || 'marked'})` : ''}${t.aboveLimit ? ' · ABOVE LIMIT' : ''} · ${t.hash}`);
  }
  lines.push('', 'Read-only check. Network fees are not listed in the history. Rollback steps: docs/PILOT-ROLLBACK.md.');
  return lines.join('\n') + '\n';
}
