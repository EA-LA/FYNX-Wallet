// Privacy request log for the waitlist: when a request came in, what it asked for, when the answer is due
// and when it was answered. Pure helpers shared by the owner workspace and tests.
// The log never holds an email address: a short reference (ticket number, email subject) is enough to find the
// message in the support inbox. It is kept only in this browser.
import { looksSecret } from './launch-tracker.js';

export const PRIVACY_KEY = 'fynx-owner-privacy-requests-v1';
export const TARGET_DAYS = 30; // FYNX's own answer target; counsel confirms the legal deadline per country.
export const DUE_SOON_DAYS = 7;
export const MAX_ENTRIES = 200;
const MAX_REF = 60, MAX_NOTE = 200, DAY = 86400000;

export const TYPES = [
  ['access', 'Asked what we hold'],
  ['delete', 'Asked to be removed'],
  ['correct', 'Asked to fix their address'],
  ['stop', 'Asked us not to contact them'],
  ['other', 'Other privacy question'],
];
export const OUTCOMES = [
  ['replied', 'Replied with what we hold'],
  ['removed', 'Removed and confirmed'],
  ['corrected', 'Corrected and confirmed'],
  ['no-record', 'No record found, told them'],
  ['not-verified', 'Could not verify, told them'],
  ['other', 'Other answer'],
];
const typeIds = new Set(TYPES.map(t => t[0])), outcomeIds = new Set(OUTCOMES.map(o => o[0]));
export const typeLabel = id => (TYPES.find(t => t[0] === id) || TYPES[4])[1];
export const outcomeLabel = id => (OUTCOMES.find(o => o[0] === id) || OUTCOMES[5])[1];
export const defaultOutcome = type => ({ access: 'replied', delete: 'removed', correct: 'corrected', stop: 'removed' })[type] || 'other';

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function dayNumber(value) {
  const m = DATE.exec(String(value || ''));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return Math.round(t / DAY);
}
export const dayString = n => new Date(n * DAY).toISOString().slice(0, 10);
export const addDays = (value, days) => { const n = dayNumber(value); return n === null ? '' : dayString(n + days); };
// Today's date in the owner's own time zone, as YYYY-MM-DD.
export const localToday = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// Free text must not carry an email address, a phrase or a key.
export function textProblem(value, label) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/@/.test(v)) return `${label} must not contain an email address. Use a ticket number or the email subject instead.`;
  if (looksSecret(v)) return `${label} looks like a recovery phrase or key, so it was not saved. Never type one into any website.`;
  return '';
}
const cleanText = (value, max) => { const v = String(value || '').replace(/\s+/g, ' ').trim().slice(0, max); return v && !textProblem(v, 'x') ? v : ''; };

export function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(raw.id)) return null;
  if (dayNumber(raw.received) === null || !typeIds.has(raw.type)) return null;
  const added = Number.isFinite(raw.added) && raw.added > 0 ? raw.added : 0;
  const entry = { id: raw.id, received: raw.received, type: raw.type, ref: cleanText(raw.ref, MAX_REF), note: cleanText(raw.note, MAX_NOTE), added, changed: Number.isFinite(raw.changed) && raw.changed > 0 ? raw.changed : added };
  if (dayNumber(raw.answered) !== null && dayNumber(raw.answered) >= dayNumber(raw.received)) {
    entry.answered = raw.answered; entry.outcome = outcomeIds.has(raw.outcome) ? raw.outcome : defaultOutcome(raw.type);
  }
  return entry;
}
const order = (a, b) => (a.answered ? 1 : 0) - (b.answered ? 1 : 0) || (a.answered ? b.answered.localeCompare(a.answered) : a.received.localeCompare(b.received)) || b.added - a.added;
export function cleanLog(raw) {
  const list = Array.isArray(raw?.entries) ? raw.entries : [], seen = new Set(), entries = [];
  for (const item of list) { const e = cleanEntry(item); if (e && !seen.has(e.id)) { seen.add(e.id); entries.push(e); } }
  return { entries: entries.sort(order).slice(0, MAX_ENTRIES) };
}

// Add a request. Returns { log, entry } or { error }.
export function addRequest(log, input, { today, now = Date.now(), id } = {}) {
  const received = String(input?.received || '').trim(), t = dayNumber(today);
  if (dayNumber(received) === null) return { error: 'Choose the date the request arrived.' };
  if (t !== null && dayNumber(received) > t) return { error: 'The date the request arrived cannot be in the future.' };
  if (t !== null && dayNumber(received) < t - 730) return { error: 'That date is more than two years ago. Check the year.' };
  if (!typeIds.has(input?.type)) return { error: 'Choose what the person asked for.' };
  const problem = textProblem(input.ref, 'The reference') || textProblem(input.note, 'The note');
  if (problem) return { error: problem };
  if (log.entries.length >= MAX_ENTRIES) return { error: `The log holds up to ${MAX_ENTRIES} requests. Copy it, then delete old answered requests.` };
  const entry = cleanEntry({ id: id || `pr-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`, received, type: input.type, ref: input.ref, note: input.note, added: now, changed: now });
  return { log: { entries: [...log.entries, entry].sort(order) }, entry };
}
export function answerRequest(log, id, { answered, outcome, now = Date.now() } = {}) {
  const target = log.entries.find(e => e.id === id);
  if (!target) return { error: 'That request is no longer in the log.' };
  if (dayNumber(answered) === null) return { error: 'Choose the date you answered.' };
  if (dayNumber(answered) < dayNumber(target.received)) return { error: 'The answer date cannot be before the request arrived.' };
  const next = { ...target, answered, outcome: outcomeIds.has(outcome) ? outcome : defaultOutcome(target.type), changed: now };
  return { log: { entries: log.entries.map(e => e.id === id ? next : e).sort(order) }, entry: next };
}
export function reopenRequest(log, id, now = Date.now()) {
  return { entries: log.entries.map(e => { if (e.id !== id) return e; const { answered, outcome, ...rest } = e; return { ...rest, changed: now }; }).sort(order) };
}
export const removeRequest = (log, id) => ({ entries: log.entries.filter(e => e.id !== id) });

// Where a request stands on a given day.
export function requestState(entry, today) {
  const due = addDays(entry.received, TARGET_DAYS), t = dayNumber(today), d = dayNumber(due);
  if (entry.answered) {
    const took = dayNumber(entry.answered) - dayNumber(entry.received), late = dayNumber(entry.answered) > d;
    return { due, state: late ? 'late' : 'on-time', took, label: `Answered ${entry.answered} · ${took} day${took === 1 ? '' : 's'}${late ? ` · ${dayNumber(entry.answered) - d} day${dayNumber(entry.answered) - d === 1 ? '' : 's'} late` : ''}` };
  }
  const left = d - t;
  if (left < 0) return { due, left, state: 'overdue', label: `Overdue by ${-left} day${left === -1 ? '' : 's'}` };
  if (left === 0) return { due, left, state: 'due-soon', label: 'Due today' };
  return { due, left, state: left <= DUE_SOON_DAYS ? 'due-soon' : 'open', label: `Due in ${left} day${left === 1 ? '' : 's'}` };
}

export function logSummary(log, today) {
  const t = dayNumber(today), out = { open: 0, overdue: 0, dueSoon: 0, answered: 0, onTime: 0, late: 0, avgDays: null, nextDue: '', recent: 0 };
  let took = 0;
  for (const e of log.entries) {
    const s = requestState(e, today);
    if (e.answered) {
      out.answered++; took += s.took; if (s.state === 'late') out.late++; else out.onTime++;
      if (t !== null && dayNumber(e.answered) >= t - 365) out.recent++;
    } else {
      out.open++; if (s.state === 'overdue') out.overdue++; else if (s.state === 'due-soon') out.dueSoon++;
      if (!out.nextDue || s.due < out.nextDue) out.nextDue = s.due;
    }
  }
  if (out.answered) out.avgDays = Math.round((took / out.answered) * 10) / 10;
  return out;
}

// Markdown record (no email addresses: the log never holds them).
export function logMarkdown(log, today) {
  const s = logSummary(log, today), cell = v => String(v || '').replace(/\|/g, '/');
  const lines = [
    '# FYNX Wallet waitlist privacy requests', '',
    `Exported ${today}. Answer target: ${TARGET_DAYS} days from arrival (FYNX's own target; counsel confirms the legal deadline).`, '',
    `- Open: ${s.open}${s.overdue ? ` (${s.overdue} overdue)` : ''}${s.dueSoon ? ` · ${s.dueSoon} due within ${DUE_SOON_DAYS} days` : ''}`,
    `- Answered: ${s.answered}${s.answered ? ` · ${s.onTime} on time, ${s.late} late · average ${s.avgDays} days` : ''}`, '',
  ];
  if (!log.entries.length) { lines.push('No requests logged.'); return lines.join('\n'); }
  lines.push('| Arrived | Request | Due | Status | Answer | Reference | Note |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const e of log.entries) {
    const st = requestState(e, today);
    lines.push(`| ${e.received} | ${typeLabel(e.type)} | ${st.due} | ${st.label} | ${e.answered ? outcomeLabel(e.outcome) : '—'} | ${cell(e.ref) || '—'} | ${cell(e.note) || '—'} |`);
  }
  return lines.join('\n');
}

// What needs the owner's attention, for the Waitlist tab button and the Launch readiness next steps.
// Counts and dates only: the log holds no email addresses and nothing here adds one.
export function privacyAttention(log, today, limit = 2) {
  const s = logSummary(log, today);
  const open = log.entries.filter(e => !e.answered).map(e => ({ entry: e, ...requestState(e, today) }));
  open.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.entry.received < b.entry.received ? -1 : 1));
  const urgent = open.filter(o => o.state === 'overdue' || o.state === 'due-soon');
  const tone = s.overdue ? 'overdue' : s.dueSoon ? 'due-soon' : s.open ? 'open' : 'none';
  const parts = [];
  if (s.open) parts.push(`${s.open} open privacy request${s.open === 1 ? '' : 's'}`);
  if (s.overdue) parts.push(`${s.overdue} overdue`);
  if (s.dueSoon) parts.push(`${s.dueSoon} due within ${DUE_SOON_DAYS} days`);
  return {
    open: s.open, overdue: s.overdue, dueSoon: s.dueSoon, tone,
    badge: s.open ? String(Math.min(s.open, 99)) + (s.open > 99 ? '+' : '') : '',
    label: parts.length ? parts.join(', ') : 'No open privacy requests',
    next: urgent.slice(0, Math.max(0, limit)).map(o => ({ id: o.entry.id, type: o.entry.type, title: typeLabel(o.entry.type), due: o.due, state: o.state, label: o.label, ref: o.entry.ref })),
  };
}

// The log travels between devices inside the launch test report: one line per request with its dates,
// request type and answer only. References and notes stay in the browser where they were typed.
export const PRIVACY_SECTION = 'Waitlist privacy requests';
const stampUtc = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const minute = ms => Math.floor((ms || 0) / 60000) * 60000;
export function privacyReportLines(log) {
  const entries = log?.entries || [];
  if (!entries.length) return [];
  const lines = [`## ${PRIVACY_SECTION}`, '', 'Dates, request types and answers only (no references, notes or email addresses), so the log can be brought into another browser.', ''];
  for (const e of entries) {
    lines.push(`- ${e.id} · arrived ${e.received} · ${typeLabel(e.type)} · ${e.answered ? `answered ${e.answered} (${outcomeLabel(e.outcome)})` : 'open'}${e.changed ? ` · changed ${stampUtc(e.changed)} UTC` : ''}`);
  }
  lines.push('');
  return lines;
}

const PR_LINE = /^\s*[-*]\s+([a-z0-9-]{1,40}) · arrived (\d{4}-\d{2}-\d{2}) · (.+?) · (open|answered (\d{4}-\d{2}-\d{2}) \((.+)\))(?: · changed (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC)?\s*$/;
export function parsePrivacyReport(text) {
  const entries = [];
  let inSection = false, unknown = 0;
  for (const line of String(text || '').split(/\r?\n/).slice(0, 2000)) {
    if (/^##\s/.test(line)) { inSection = line.replace(/^##\s+/, '').trim() === PRIVACY_SECTION; continue; }
    if (!inSection || !line.trim() || !/^\s*[-*]\s/.test(line)) continue;
    const m = line.match(PR_LINE);
    const type = m && TYPES.find(t => t[1] === m[3])?.[0];
    const outcome = m?.[6] ? OUTCOMES.find(o => o[1] === m[6])?.[0] : undefined;
    if (!m || !type || (m[5] && !outcome)) { unknown += 1; continue; }
    const changed = m[7] ? Date.parse(`${m[7]}T${m[8]}:00Z`) : 0;
    const e = cleanEntry({ id: m[1], received: m[2], type, answered: m[5], outcome, added: changed, changed });
    if (!e || entries.some(x => x.id === e.id) || (m[5] && !e.answered)) { unknown += 1; continue; }
    entries.push(e);
  }
  return { log: cleanLog({ entries }), unknown };
}

const sameRequest = (a, b) => a.received === b.received && a.type === b.type && (a.answered || '') === (b.answered || '') && (a.outcome || '') === (b.outcome || '');
// Combine an imported log with this browser's. New requests are added; when both have a request and it
// differs, the one changed later wins (this browser's reference and note are kept). Deleting a request
// does not travel: delete it on each device.
export function mergePrivacyLogs(local, incoming) {
  const byId = new Map((local?.entries || []).map(e => [e.id, e])), changes = { added: [], updated: [], same: [], kept: [] };
  for (const inc of incoming?.entries || []) {
    const mine = byId.get(inc.id);
    if (!mine) { byId.set(inc.id, { ...inc }); changes.added.push(inc.id); continue; }
    if (sameRequest(mine, inc)) { changes.same.push(inc.id); continue; }
    if (minute(inc.changed) > minute(mine.changed)) {
      const { answered, outcome, ...rest } = mine;
      const next = { ...rest, received: inc.received, type: inc.type, changed: inc.changed };
      if (inc.answered) { next.answered = inc.answered; next.outcome = inc.outcome; }
      byId.set(inc.id, next); changes.updated.push(inc.id);
    } else changes.kept.push(inc.id);
  }
  return { log: cleanLog({ entries: [...byId.values()] }), ...changes };
}
