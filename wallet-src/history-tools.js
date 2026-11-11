// Transaction history tools for Crypto tools → Portfolio & history: pure helpers (no DOM, no network) and tests.
// Filter the loaded history, add it up exactly (whole-unit integer math, no floating point), group it by month and by
// the other wallet, keep the owner's own names for wallets ("address labels", this browser only) and export a
// spreadsheet-safe CSV. Read-only: nothing here signs, sends or changes anything on any network.
import { DECIMALS, toUnits, fromUnits, shortAddress } from './reconcile.js';
import { csvCell } from './waitlist-insights.js';
import { looksSecret } from './launch-tracker.js';

const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const MAX_LABEL = 40;
export const MAX_LABELS = 200;
export const TOKENS = Object.freeze(Object.keys(DECIMALS));

// One clean transfer, or null when anything is malformed. `other` is the wallet on the other side.
export function cleanTransfer(item) {
  if (!item || typeof item.hash !== 'string' || !HASH.test(item.hash)) return null;
  if (!['in', 'out'].includes(item.direction) || !DECIMALS[item.token]) return null;
  const units = toUnits(item.amount, DECIMALS[item.token]);
  if (units === null) return null;
  const from = ADDRESS.test(item.from || '') ? item.from : null, to = ADDRESS.test(item.to || '') ? item.to : null;
  const time = typeof item.time === 'string' && !Number.isNaN(Date.parse(item.time)) ? new Date(item.time).toISOString() : null;
  return { hash: item.hash.toLowerCase(), direction: item.direction, token: item.token, units, amount: fromUnits(units, DECIMALS[item.token]), from, to, other: item.direction === 'in' ? from : to, block: Number.isSafeInteger(item.block) ? item.block : null, time };
}
export const cleanTransfers = items => (Array.isArray(items) ? items : []).map(cleanTransfer).filter(Boolean);

// ---- Address labels: the owner's own names for wallets, e.g. "Ledger test account" or "Base faucet". ----
export function cleanLabel(raw) {
  const text = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return { label: '' };
  if (looksSecret(text) || /0x[0-9a-f]{40}/i.test(text)) return { error: 'Use a short name, not an address, key or phrase.' };
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return { error: 'Use a short name, not an email address.' };
  if (text.length > MAX_LABEL) return { error: `Keep the name to ${MAX_LABEL} characters.` };
  return { label: text };
}
export function cleanLabels(raw) {
  const out = {};
  const entries = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.entries(raw) : [];
  const kept = [];
  for (const [address, value] of entries) {
    if (!ADDRESS.test(address) || !value || typeof value !== 'object') continue;
    const { label } = cleanLabel(value.label);
    if (!label) continue;
    kept.push([address.toLowerCase(), { label, at: Number.isFinite(value.at) ? value.at : 0 }]);
  }
  kept.sort((a, b) => b[1].at - a[1].at);
  for (const [address, value] of kept.slice(0, MAX_LABELS)) if (!out[address]) out[address] = value;
  return out;
}
// Returns { labels } with the change applied, or { error }. An empty name removes the label.
export function setLabel(labels, address, raw, now = Date.now()) {
  if (typeof address !== 'string' || !ADDRESS.test(address)) return { error: 'That is not a wallet address.' };
  const result = cleanLabel(raw);
  if (result.error) return result;
  const next = { ...cleanLabels(labels) }, key = address.toLowerCase();
  if (result.label) next[key] = { label: result.label, at: now }; else delete next[key];
  return { labels: cleanLabels(next) };
}
export const labelOf = (labels, address) => (typeof address === 'string' && labels?.[address.toLowerCase()]?.label) || '';

// Where FYNX knows a transfer from (pilot register: [{ hash, chainId, kind: 'page' | 'marked', reason? }]).
const REASON_TEXT = { 'earlier-session': 'Marked yours: FYNX, earlier session', 'other-device': 'Marked yours: another device', 'other-app': 'Marked yours: another wallet app', 'own-transfer': 'Marked yours: between own wallets' };
export function sourceOf(transfer, chainId, known) {
  const entry = (Array.isArray(known) ? known : []).find(k => k && Number(k.chainId) === Number(chainId) && String(k.hash || '').toLowerCase() === transfer.hash);
  if (!entry) return transfer.direction === 'in' ? 'Received' : 'Not from FYNX on this browser';
  return entry.kind === 'page' ? 'Sent from FYNX' : REASON_TEXT[entry.reason] || 'Marked yours';
}

// ---- Filter ----
// filter: { direction: 'all' | 'in' | 'out', token: 'all' | 'ETH' | 'USDC', query, labels }
// The query matches the other wallet's address, the transaction ID or the owner's label (case-insensitive).
export function filterTransfers(transfers, filter = {}) {
  const direction = ['in', 'out'].includes(filter.direction) ? filter.direction : 'all';
  const token = DECIMALS[filter.token] ? filter.token : 'all';
  const q = String(filter.query || '').trim().toLowerCase();
  return transfers.filter(t => {
    if (direction !== 'all' && t.direction !== direction) return false;
    if (token !== 'all' && t.token !== token) return false;
    if (!q) return true;
    return [t.other, t.hash, labelOf(filter.labels, t.other)].some(v => String(v || '').toLowerCase().includes(q));
  });
}
export const isFiltered = (filter = {}) => ['in', 'out'].includes(filter.direction) || Boolean(DECIMALS[filter.token]) || Boolean(String(filter.query || '').trim());

// ---- Totals ----
const zero = () => Object.fromEntries(TOKENS.map(t => [t, { in: 0n, out: 0n, countIn: 0, countOut: 0 }]));
function add(bucket, t) { const b = bucket[t.token]; if (t.direction === 'in') { b.in += t.units; b.countIn += 1; } else { b.out += t.units; b.countOut += 1; } }
const show = (units, token) => fromUnits(units, DECIMALS[token]);
function rowsOf(bucket) {
  return TOKENS.filter(token => bucket[token].countIn + bucket[token].countOut > 0).map(token => {
    const b = bucket[token];
    return { token, received: show(b.in, token), sent: show(b.out, token), net: `${b.in - b.out > 0n ? '+' : ''}${show(b.in - b.out, token)}`, countIn: b.countIn, countOut: b.countOut };
  });
}
export function totals(transfers) { const bucket = zero(); for (const t of transfers) add(bucket, t); return rowsOf(bucket); }

// By calendar month (UTC), newest first. Transfers without a time are counted under "No date".
export function byMonth(transfers) {
  const months = new Map();
  for (const t of transfers) {
    const key = t.time ? t.time.slice(0, 7) : 'No date';
    if (!months.has(key)) months.set(key, { bucket: zero(), count: 0 });
    const m = months.get(key); add(m.bucket, t); m.count += 1;
  }
  return [...months.entries()].sort((a, b) => (a[0] === 'No date' ? 1 : b[0] === 'No date' ? -1 : b[0].localeCompare(a[0])))
    .map(([month, m]) => ({ month, label: month === 'No date' ? 'No date' : monthName(month), count: m.count, tokens: rowsOf(m.bucket) }));
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = ym => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

// ---- Wallets you transact with ----
// Grouped by the other wallet: transfers each way, exact totals per asset, first and last time, the owner's label,
// and "once" when there was a single transfer (worth a second look: one-off recipients are where mistakes happen).
export function counterparties(transfers, labels = {}) {
  const groups = new Map();
  for (const t of transfers) {
    const key = t.other ? t.other.toLowerCase() : 'unknown';
    if (!groups.has(key)) groups.set(key, { address: t.other || null, bucket: zero(), count: 0, first: null, last: null, lastBlock: 0 });
    const g = groups.get(key); add(g.bucket, t); g.count += 1;
    if (t.time) { if (!g.first || t.time < g.first) g.first = t.time; if (!g.last || t.time > g.last) g.last = t.time; }
    g.lastBlock = Math.max(g.lastBlock, t.block || 0);
  }
  return [...groups.values()].map(g => ({
    address: g.address, short: g.address ? shortAddress(g.address) : 'Unknown wallet', label: labelOf(labels, g.address), count: g.count,
    received: TOKENS.reduce((n, token) => n + g.bucket[token].countIn, 0), sent: TOKENS.reduce((n, token) => n + g.bucket[token].countOut, 0),
    tokens: rowsOf(g.bucket), first: g.first, last: g.last, once: g.count === 1, lastBlock: g.lastBlock,
  })).sort((a, b) => b.count - a.count || (b.last || '').localeCompare(a.last || '') || b.lastBlock - a.lastBlock);
}

// ---- Exports ----
export const CSV_COLUMNS = ['Date (UTC)', 'Network', 'Direction', 'Asset', 'Amount', 'Other wallet', 'Your label', 'FYNX record', 'Transaction ID', 'Block', 'Explorer link'];
// history: { chainId, network, explorer }. Exact amounts as text (never rounded), full addresses and IDs.
export function historyCSV(transfers, history = {}, { labels = {}, known = [] } = {}) {
  const explorer = typeof history.explorer === 'string' && /^https:\/\/[^\s"]+$/.test(history.explorer) ? history.explorer.replace(/\/$/, '') : '';
  const rows = [CSV_COLUMNS.map(csvCell).join(',')];
  for (const t of transfers) {
    rows.push([t.time ? t.time.slice(0, 19).replace('T', ' ') : '', history.network || '', t.direction === 'in' ? 'Received' : 'Sent', t.token, t.amount, t.other || '', labelOf(labels, t.other), sourceOf(t, history.chainId, known), t.hash, t.block ?? '', explorer ? `${explorer}/tx/${t.hash}` : ''].map(csvCell).join(','));
  }
  return `﻿${rows.join('\r\n')}\r\n`;
}
export const csvName = (history = {}, date = new Date().toISOString().slice(0, 10)) => `fynx-history-${String(history.network || 'network').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${date}.csv`;

// A short summary to paste into notes or a message: totals and months only — no wallet addresses or transaction IDs.
export function summaryText(transfers, history = {}, { filter = {}, more = false, date = new Date().toISOString().slice(0, 10) } = {}) {
  const lines = [`FYNX transaction history · ${history.network || 'network'} · ${date}`];
  const parts = [];
  if (['in', 'out'].includes(filter.direction)) parts.push(filter.direction === 'in' ? 'received only' : 'sent only');
  if (DECIMALS[filter.token]) parts.push(`${filter.token} only`);
  if (String(filter.query || '').trim()) parts.push('matching a search');
  lines.push(`${transfers.length} transfer${transfers.length === 1 ? '' : 's'}${parts.length ? ` (${parts.join(', ')})` : ''}${more ? ' · newest 100 loaded; older ones are not included' : ''}.`);
  if (!transfers.length) return `${lines.join('\n')}\n`;
  lines.push('', 'Totals:');
  for (const r of totals(transfers)) lines.push(`- ${r.token}: received ${r.received} (${r.countIn}), sent ${r.sent} (${r.countOut}), net ${r.net}`);
  lines.push('', 'By month (UTC):');
  for (const m of byMonth(transfers)) lines.push(`- ${m.label}: ${m.count} transfer${m.count === 1 ? '' : 's'} · ${m.tokens.map(r => `${r.token} in ${r.received} / out ${r.sent}`).join(' · ')}`);
  const people = counterparties(transfers);
  lines.push('', `Other wallets: ${people.length} (${people.filter(p => p.once).length} with a single transfer).`);
  return `${lines.join('\n')}\n`;
}
