// Pilot transfer register: pure helpers for the Crypto tools reconciliation and tests.
// The Track list only lasts for one page session (signing out or reloading clears it), so a
// pilot reconciliation run a day later would call every earlier FYNX transfer "not from this page".
// The register remembers, in this browser only, two kinds of public on-chain facts:
//   - "page": a transaction ID this page submitted (the network, the wallet, the label FYNX gave it, when);
//   - "marked": an outgoing transfer you looked at and marked as yours, with one fixed reason.
// No free text is stored, so nothing secret can end up here. Transaction IDs and wallet addresses are public.
export const REGISTER_KEY = 'fynx-owner-pilot-register-v1';
export const MAX_ENTRIES = 300;
export const REASONS = Object.freeze({
  'earlier-session': 'Sent from FYNX in an earlier session',
  'other-device': 'Sent by me from another device',
  'other-app': 'Sent by me from another wallet app',
  'own-transfer': 'Moved between my own wallets',
});
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const LABEL = /^[\p{L}\p{N} .,:·()+\-–→/%]{1,80}$/u;

export const reasonLabel = reason => REASONS[reason] || 'Marked as yours';

function cleanEntry(raw) {
  if (!raw || typeof raw.hash !== 'string' || !HASH.test(raw.hash)) return null;
  const chainId = Number(raw.chainId);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) return null;
  const kind = raw.kind === 'marked' ? 'marked' : raw.kind === 'page' ? 'page' : null;
  if (!kind) return null;
  const at = Number(raw.at);
  if (!Number.isFinite(at) || at <= 0) return null;
  const entry = { hash: raw.hash.toLowerCase(), chainId, kind, at };
  if (typeof raw.address === 'string' && ADDRESS.test(raw.address)) entry.address = raw.address.toLowerCase();
  if (kind === 'page') entry.label = typeof raw.label === 'string' && LABEL.test(raw.label.trim()) ? raw.label.trim() : 'Transaction';
  else { if (!REASONS[raw.reason]) return null; entry.reason = raw.reason; }
  return entry;
}
const keyOf = e => `${e.chainId}:${e.hash}:${e.kind}`;

// Anything malformed is dropped; one entry per network + ID + kind (the newest wins); newest MAX_ENTRIES kept.
export function cleanRegister(raw) {
  const byKey = new Map();
  for (const item of Array.isArray(raw?.entries) ? raw.entries : []) {
    const e = cleanEntry(item);
    if (e && (!byKey.has(keyOf(e)) || byKey.get(keyOf(e)).at < e.at)) byKey.set(keyOf(e), e);
  }
  return { entries: [...byKey.values()].sort((a, b) => a.at - b.at).slice(-MAX_ENTRIES) };
}

// A Track entry ({ hash, label, network: { id }, address, submittedAt }) becomes a "page" entry.
export function addSubmitted(register, item, now = Date.now()) {
  const at = Number.isFinite(item?.submittedAt) ? item.submittedAt : now;
  return cleanRegister({ entries: [...(register?.entries || []), { hash: item?.hash, chainId: item?.network?.id, kind: 'page', label: item?.label, address: item?.address, at }] });
}
export function markKnown(register, { hash, chainId, reason }, now = Date.now()) {
  if (!REASONS[reason]) throw new Error('Choose why this transfer is yours.');
  if (typeof hash !== 'string' || !HASH.test(hash)) throw new Error('That is not a transaction ID.');
  return cleanRegister({ entries: [...(register?.entries || []), { hash, chainId, kind: 'marked', reason, at: now }] });
}
export function unmark(register, { hash, chainId }) {
  const h = String(hash || '').toLowerCase();
  return cleanRegister({ entries: (register?.entries || []).filter(e => !(e.kind === 'marked' && e.hash === h && e.chainId === Number(chainId))) });
}
export function forNetwork(register, chainId) {
  return (register?.entries || []).filter(e => e.chainId === Number(chainId));
}
export function registerSummary(register) {
  const entries = register?.entries || [];
  const page = entries.filter(e => e.kind === 'page'), marked = entries.filter(e => e.kind === 'marked');
  const since = entries.length ? Math.min(...entries.map(e => e.at)) : null;
  return { page: page.length, marked: marked.length, since, networks: [...new Set(entries.map(e => e.chainId))].length };
}

// What reconciliation needs to know when one settles: did any of these transactions
// change from waiting to settled on the network the reconciliation covers?
export function settledChange(before, after, chainId) {
  const settled = s => ['confirmed', 'failed', 'replaced', 'dropped'].includes(s);
  return Number(after?.network?.id) === Number(chainId) && !settled(before) && settled(after?.status);
}

// Travel between devices inside the Launch readiness test report ("Pilot transfer register" section).
// One line per remembered transaction: kind, network, when (UTC minute), the public transaction ID and the
// FYNX label or the fixed reason. Wallet addresses stay on the device. Forgetting or undoing a mark does not
// travel: do it on each device.
export const REGISTER_SECTION = 'Pilot transfer register';
const NETWORKS = { 1: 'Ethereum', 11155111: 'Ethereum Sepolia', 8453: 'Base', 84532: 'Base Sepolia' };
export const networkName = id => NETWORKS[id] || `Chain ${id}`;
const stampUtc = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const minute = ms => Math.floor((ms || 0) / 60000) * 60000;
const reasonByLabel = label => Object.keys(REASONS).find(k => REASONS[k] === label);
const REGISTER_LINE = /^\s*[-*]\s+(From FYNX|Marked as mine) · [A-Za-z0-9 ]{1,30} \(chain (\d{1,12})\) · (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC · (0x[0-9a-fA-F]{64}) · (.{1,80}?)\s*$/u;

// True only for a line in exactly this section's format (used so a transaction ID is not mistaken for a key).
export function isRegisterLine(line) {
  const m = String(line || '').match(REGISTER_LINE);
  if (!m) return false;
  return m[1] === 'From FYNX' ? LABEL.test(m[6]) : Boolean(reasonByLabel(m[6]));
}

export function registerReportLines(register) {
  const entries = cleanRegister(register).entries;
  if (!entries.length) return [];
  const lines = [`## ${REGISTER_SECTION}`, '', 'Public transaction IDs remembered for the pilot reconciliation (no wallet addresses or notes), so they can be brought into another browser.', ''];
  for (const e of entries) {
    const what = e.kind === 'page' ? `From FYNX · ${networkName(e.chainId)} (chain ${e.chainId}) · ${stampUtc(e.at)} UTC · ${e.hash} · ${e.label}` : `Marked as mine · ${networkName(e.chainId)} (chain ${e.chainId}) · ${stampUtc(e.at)} UTC · ${e.hash} · ${REASONS[e.reason]}`;
    lines.push(`- ${what}`);
  }
  lines.push('');
  return lines;
}

export function parseRegisterReport(text) {
  const entries = [];
  let inSection = false, unknown = 0;
  for (const line of String(text || '').split(/\r?\n/).slice(0, 5000)) {
    if (/^##\s/.test(line)) { inSection = line.replace(/^##\s+/, '').trim() === REGISTER_SECTION; continue; }
    if (!inSection || !/^\s*[-*]\s/.test(line)) continue;
    const m = line.match(REGISTER_LINE);
    if (!m || !isRegisterLine(line)) { unknown += 1; continue; }
    const at = Date.parse(`${m[3]}T${m[4]}:00Z`);
    const kind = m[1] === 'From FYNX' ? 'page' : 'marked';
    const entry = kind === 'page' ? { hash: m[5], chainId: Number(m[2]), kind, label: m[6], at } : { hash: m[5], chainId: Number(m[2]), kind, reason: reasonByLabel(m[6]), at };
    if (!cleanEntry(entry)) { unknown += 1; continue; }
    entries.push(entry);
  }
  return { register: cleanRegister({ entries }), unknown };
}

// New entries are added. A transaction submitted from FYNX that both browsers know stays as this browser
// has it (with its wallet address). A mark both have with a different reason: the one marked later wins.
export function mergeRegisters(local, incoming) {
  const mine = cleanRegister(local), byKey = new Map(mine.entries.map(e => [keyOf(e), e]));
  const changes = { added: [], updated: [], same: [], kept: [] };
  for (const inc of cleanRegister(incoming).entries) {
    const k = keyOf(inc), have = byKey.get(k);
    if (!have) { byKey.set(k, inc); changes.added.push(inc); continue; }
    if (inc.kind === 'page' || have.reason === inc.reason) { changes.same.push(inc); continue; }
    if (minute(inc.at) > minute(have.at)) { byKey.set(k, { ...have, reason: inc.reason, at: inc.at }); changes.updated.push(inc); } else changes.kept.push(inc);
  }
  // Only the newest MAX_ENTRIES are kept, as in this browser; anything older that fell off is counted.
  const register = cleanRegister({ entries: [...byKey.values()] }), kept = new Set(register.entries.map(keyOf));
  const dropped = changes.added.filter(e => !kept.has(keyOf(e))).length;
  changes.added = changes.added.filter(e => kept.has(keyOf(e)));
  return { register, ...changes, dropped };
}
