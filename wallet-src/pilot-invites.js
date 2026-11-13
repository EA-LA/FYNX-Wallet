// Pilot invite list: pure helpers for the owner workspace Waitlist tab and its tests.
// Picks who to invite first for the controlled pilot from registrations already loaded in this
// browser. Nothing is sent, saved or changed on the waitlist; the owner downloads the list.
import { isTestAddress, csvCell } from './waitlist-insights.js';
import { inboxKey } from './waitlist-care.js';

const DAY = 86400000;
export const DEFAULT_SIZE = 50;
export const MAX_SIZE = 100000;
export const ORDERS = [['first', 'Earliest sign-ups first'], ['draw', 'Fair draw (repeatable)']];

// Why a registration is left out, in the order they are checked (the first that applies is shown).
export const REASONS = [
  ['test', 'Test address'],
  ['consent', 'Consent not recorded'],
  ['expired', 'Past retention date (deletion queued)'],
  ['status', 'Not waiting (status changed)'],
  ['typo', 'Likely mistyped address'],
  ['disposable', 'Throwaway inbox'],
  ['role', 'Shared team mailbox (like info or support)'],
  ['duplicate', 'Same inbox as an earlier sign-up'],
];
export const reasonLabel = id => (REASONS.find(r => r[0] === id) || [id, id])[1];

const timeOf = value => { const t = Date.parse(value || ''); return Number.isFinite(t) ? t : null; };

// Whole number of people, 1 … MAX_SIZE, or null.
export function cleanSize(raw) {
  const n = Number(String(raw ?? '').trim());
  return Number.isInteger(n) && n >= 1 && n <= MAX_SIZE ? n : null;
}

// Draw code: letters, digits, spaces and dashes, at most 40 characters (never an email address).
export function cleanCode(raw) {
  return String(raw ?? '').replace(/[^A-Za-z0-9 -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

// 32-bit FNV-1a: the same code and the same registrations give the same draw on any device.
export function drawKey(code, email) {
  let h = 0x811c9dc5;
  for (const ch of `${code}|${inboxKey(email)}`) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

// Size from the "Pilot size and limits" decision (Launch readiness worksheet), or null.
export function decidedPilot(answers = {}) {
  const a = answers['pilot/limits'] || {};
  return { size: cleanSize(a.people), states: String(a.states || '').trim() };
}

function leaveOut(record, flags, { includeShared, now }) {
  if (isTestAddress(record.email)) return 'test';
  if (record.consent !== true) return 'consent';
  const expires = timeOf(record.expiresAt);
  if (expires !== null && expires < now) return 'expired';
  if (record.status && record.status !== 'waiting') return 'status';
  const kinds = new Set((flags.get(record.id) || []).map(f => f.kind));
  for (const kind of ['typo', 'disposable']) if (kinds.has(kind)) return kind;
  if (!includeShared && kinds.has('role')) return 'role';
  return '';
}

const byFirst = (a, b) => {
  const ta = timeOf(a.createdAt), tb = timeOf(b.createdAt);
  if (ta !== tb) return ta === null ? 1 : tb === null ? -1 : ta - tb;
  return String(a.email).localeCompare(String(b.email));
};

// The invite list: who is invited, who is next in line (reserve) and why the others are left out.
export function pilotList(records, flags = new Map(), { size = DEFAULT_SIZE, order = 'first', code = '', includeShared = false, now = Date.now(), total } = {}) {
  const list = [...records], want = cleanSize(size) || DEFAULT_SIZE, drawCode = cleanCode(code) || 'fynx';
  const counts = Object.fromEntries(REASONS.map(([k]) => [k, 0]));
  const ok = [];
  for (const r of list) { const why = leaveOut(r, flags, { includeShared, now }); if (why) counts[why]++; else ok.push(r); }
  // One invitation per inbox: keep its earliest sign-up, whatever the order chosen below.
  const kept = new Map();
  for (const r of [...ok].sort(byFirst)) { const key = inboxKey(r.email); if (kept.has(key)) counts.duplicate++; else kept.set(key, r); }
  const eligible = [...kept.values()];
  if (order === 'draw') {
    const keys = new Map(eligible.map(r => [r.id, drawKey(drawCode, r.email)]));
    eligible.sort((a, b) => keys.get(a.id) - keys.get(b.id) || String(a.email).localeCompare(String(b.email)));
  } else eligible.sort(byFirst);
  const reserveSize = Math.max(5, Math.ceil(want * 0.2));
  const note = r => {
    const expires = timeOf(r.expiresAt), parts = [];
    if (timeOf(r.createdAt) === null) parts.push('No sign-up time recorded');
    if (expires !== null && expires < now + 30 * DAY) parts.push(`Retention ends ${new Date(expires).toISOString().slice(0, 10)}: invite before then`);
    return parts.join('; ');
  };
  const row = (r, group, i) => ({ order: i + 1, group, id: r.id, email: r.email, createdAt: r.createdAt || '', expiresAt: r.expiresAt || '', note: note(r) });
  const invited = eligible.slice(0, want).map((r, i) => row(r, 'Invite', i));
  const reserve = eligible.slice(want, want + reserveSize).map((r, i) => row(r, 'Reserve', want + i));
  const loaded = list.length, all = Number.isFinite(total) ? total : loaded;
  return {
    size: want, order: order === 'draw' ? 'draw' : 'first', code: order === 'draw' ? drawCode : '', includeShared: !!includeShared,
    loaded, total: all, complete: loaded >= all, eligible: eligible.length, invited, reserve,
    shortBy: Math.max(0, want - invited.length), retentionSoon: invited.filter(r => /Retention ends/.test(r.note)).length,
    excluded: REASONS.map(([k, label]) => [k, label, counts[k]]).filter(x => x[2] > 0),
  };
}

export const INVITE_COLUMNS = ['Order', 'Group', 'Email', 'Signed up (UTC)', 'Retention ends (UTC)', 'Note'];
export function inviteCSV(result) {
  const rows = [INVITE_COLUMNS.map(csvCell).join(',')];
  for (const r of [...result.invited, ...result.reserve]) rows.push([r.order, r.group, r.email, r.createdAt, r.expiresAt, r.note].map(csvCell).join(','));
  return `﻿${rows.join('\r\n')}\r\n`;
}

// Open privacy requests that ask for removal or no contact: the log keeps no email addresses,
// so the owner checks these by hand before sending invitations.
export function openStopRequests(log = { entries: [] }) {
  return (log.entries || []).filter(e => !e.answered && (e.type === 'stop' || e.type === 'delete')).length;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Short state line for the panel and the Today/launch hints.
export function headline(result) {
  if (!result.loaded) return 'Load registrations to build the invite list.';
  if (!result.eligible) return 'Nobody on the loaded waitlist can be invited yet.';
  const base = `${plural(result.invited.length, 'person', 'people')} to invite${result.reserve.length ? ` and ${result.reserve.length} in reserve` : ''}, from ${plural(result.eligible, 'eligible sign-up')}`;
  return result.shortBy ? `${base}: ${result.shortBy} short of the ${result.size} you want` : base;
}

// Counts only, no email addresses: safe to paste into a message or the decision notes.
export function pilotSummary(result, { states = '', stopRequests = 0, date = new Date().toISOString().slice(0, 10) } = {}) {
  const lines = [`FYNX Wallet pilot invite list (${date})`];
  lines.push(`Group size wanted: ${result.size} · Invited: ${result.invited.length} · Reserve: ${result.reserve.length} · Eligible: ${result.eligible}`);
  lines.push(`Order: ${result.order === 'draw' ? `fair draw with code "${result.code}" (the same code and registrations give the same list)` : 'earliest sign-ups first'}`);
  lines.push(result.complete ? `Based on all ${result.total} registrations` : `Based on ${result.loaded} of ${result.total} registrations: load all before sending invitations`);
  if (result.excluded.length) lines.push(`Left out: ${result.excluded.map(([, label, n]) => `${label} ${n}`).join(' · ')}`);
  if (result.retentionSoon) lines.push(`${plural(result.retentionSoon, 'invited sign-up')} ${result.retentionSoon === 1 ? 'reaches' : 'reach'} the end of retention within 30 days`);
  lines.push(`States: the waitlist does not record where people live; confirm each person is in ${states || 'the pilot states (not decided yet)'} before giving access`);
  if (stopRequests) lines.push(`${plural(stopRequests, 'open privacy request')} asked for removal or no contact: check they are not on the list`);
  return lines.join('\n');
}
