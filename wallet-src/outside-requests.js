// "Sent on / answered on" for every request in the outside-party hand-off lists (lawyer, payment
// provider, security reviewer, market-data provider). Dates only: no names, email text or notes.
// Kept in this browser and carried between devices inside the launch test report.
// Pure helpers shared by the owner workspace and tests.
import { PARTIES } from './outside-handoff.js';
import { dayNumber, dayString } from './privacy-requests.js';

export const OUTSIDE_KEY = 'fynx-owner-outside-requests-v1';
// After this many days without an answer the request is shown as "Send a reminder".
export const CHASE_DAYS = 14;
export const REQUESTS_SECTION = 'Outside party requests';

export const requestId = (partyId, stepKey) => `${partyId}|${stepKey}`;
const VALID = new Set(PARTIES.flatMap(p => Object.keys(p.steps).map(k => requestId(p.id, k))));
export const isRequestId = id => VALID.has(id);
export const splitId = id => { const i = String(id).indexOf('|'); return { partyId: id.slice(0, i), stepKey: id.slice(i + 1) }; };

const minute = ms => Math.floor((ms || 0) / 60000) * 60000;
const okDate = v => dayNumber(v) !== null;

// One entry per request: { sent, answered, changed }. An entry with no dates is a "cleared" marker so
// that clearing a date also travels to the other device (the later change wins).
export function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sent = okDate(raw.sent) ? raw.sent : '';
  const answered = sent && okDate(raw.answered) && dayNumber(raw.answered) >= dayNumber(sent) ? raw.answered : '';
  const changed = Number.isFinite(raw.changed) && raw.changed > 0 ? raw.changed : 0;
  if (!sent && !changed) return null;
  return { sent, answered, changed };
}
export function cleanRequests(raw) {
  const out = {};
  const entries = raw && typeof raw === 'object' && raw.entries && typeof raw.entries === 'object' ? raw.entries : {};
  for (const [id, value] of Object.entries(entries)) {
    if (!isRequestId(id)) continue;
    const e = cleanEntry(value);
    if (e) out[id] = e;
  }
  return { entries: out };
}

// Change one request's dates. `field` is 'sent' or 'answered'; an empty value clears it
// (clearing "sent" also clears "answered"). Dates in the future or an answer before the request
// was sent are refused with a plain reason.
export function setDate(log, id, field, value, { today, now = Date.now() } = {}) {
  if (!isRequestId(id)) return { log, error: 'Unknown request.' };
  if (field !== 'sent' && field !== 'answered') return { log, error: 'Unknown date.' };
  const cur = log.entries[id] || { sent: '', answered: '', changed: 0 };
  const v = String(value || '').trim();
  if (v && !okDate(v)) return { log, error: 'Use a full date (year, month and day).' };
  if (v && today && okDate(today) && dayNumber(v) > dayNumber(today)) return { log, error: 'That date is in the future. Use the day it actually happened.' };
  let next;
  if (field === 'sent') {
    if (v && cur.answered && dayNumber(cur.answered) < dayNumber(v)) return { log, error: `The answer date (${cur.answered}) is before that. Change the answer date first.` };
    next = { sent: v, answered: v ? cur.answered : '', changed: now };
  } else {
    if (v && !cur.sent) return { log, error: 'Add the date you sent the request first.' };
    if (v && dayNumber(v) < dayNumber(cur.sent)) return { log, error: `The answer cannot be before the request was sent (${cur.sent}).` };
    next = { sent: cur.sent, answered: v, changed: now };
  }
  if (next.sent === cur.sent && next.answered === cur.answered) return { log, unchanged: true };
  return { log: { entries: { ...log.entries, [id]: next } } };
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// Where one request stands today: not sent / waiting (n days) / reminder due / answered (n days taken).
export function requestState(entry, today) {
  if (!entry || !entry.sent) return { state: 'not-sent', label: 'Not sent yet' };
  const sent = dayNumber(entry.sent), now = dayNumber(today);
  if (entry.answered) {
    const days = dayNumber(entry.answered) - sent;
    return { state: 'answered', days, label: `Answered ${entry.answered} (${days ? `after ${plural(days, 'day')}` : 'same day'})` };
  }
  const days = now === null ? 0 : Math.max(0, now - sent), chaseOn = dayString(sent + CHASE_DAYS);
  if (days >= CHASE_DAYS) return { state: 'chase', days, chaseOn, label: `Sent ${entry.sent}, no answer after ${plural(days, 'day')}: send a reminder` };
  return { state: 'waiting', days, chaseOn, label: `Sent ${entry.sent} (${days ? `${plural(days, 'day')} ago` : 'today'}), waiting for an answer · reminder from ${chaseOn}` };
}

// Counts for one party's requests (only the step keys passed, so "not needed" steps can be left out).
export function partyRequests(log, partyId, stepKeys, today) {
  const s = { sent: 0, waiting: 0, chase: 0, answered: 0 };
  for (const key of stepKeys) {
    const st = requestState(log.entries[requestId(partyId, key)], today).state;
    if (st !== 'not-sent') s.sent += 1;
    if (st in s) s[st] += 1;
  }
  return s;
}
export function partyRequestLine(s) {
  const parts = [];
  if (s.chase) parts.push(`${s.chase} to chase`);
  if (s.waiting) parts.push(`${s.waiting} awaiting answer`);
  if (s.answered) parts.push(`${s.answered} answered`);
  return parts.join(', ');
}

// Requests with no answer after CHASE_DAYS, longest-waiting first, for "Your next steps".
// `skip` holds request ids that no longer need an answer (step done or not needed).
export function outsideAttention(log, today, { limit = 2, skip = new Set() } = {}) {
  const out = [];
  for (const [id, e] of Object.entries(log.entries || {})) {
    if (skip.has(id) || !isRequestId(id)) continue;
    const st = requestState(e, today);
    if (st.state !== 'chase') continue;
    const { partyId, stepKey } = splitId(id);
    out.push({ id, partyId, stepKey, party: PARTIES.find(p => p.id === partyId), sent: e.sent, days: st.days, label: st.label });
  }
  out.sort((a, b) => b.days - a.days || a.id.localeCompare(b.id));
  return { count: out.length, next: out.slice(0, Math.max(0, limit)) };
}

// Report section: one line per request with its dates. Party ids and step keys are fixed words, so
// nothing typed by the owner travels.
const stampUtc = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
export function requestReportLines(log) {
  const ids = Object.keys(log?.entries || {}).filter(isRequestId).sort();
  if (!ids.length) return [];
  const lines = [`## ${REQUESTS_SECTION}`, '', 'When each hand-off request was sent and answered (dates only), so the dates can be brought into another browser.', ''];
  for (const id of ids) {
    const e = log.entries[id], { partyId, stepKey } = splitId(id);
    const dates = e.sent ? `sent ${e.sent}${e.answered ? ` · answered ${e.answered}` : ''}` : 'not sent';
    lines.push(`- ${partyId} · ${stepKey} · ${dates}${e.changed ? ` · changed ${stampUtc(e.changed)} UTC` : ''}`);
  }
  lines.push('');
  return lines;
}

const LINE = /^\s*[-*]\s+([a-z]{2,20}) · ([a-z0-9-]{1,40}\/[a-z0-9-]{1,40}) · (?:(not sent)|sent (\d{4}-\d{2}-\d{2})(?: · answered (\d{4}-\d{2}-\d{2}))?)(?: · changed (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC)?\s*$/;
export const isRequestLine = line => LINE.test(String(line || ''));
export function parseRequestReport(text) {
  const entries = {};
  let inSection = false, unknown = 0;
  for (const line of String(text || '').split(/\r?\n/).slice(0, 2000)) {
    if (/^##\s/.test(line)) { inSection = line.replace(/^##\s+/, '').trim() === REQUESTS_SECTION; continue; }
    if (!inSection || !line.trim() || !/^\s*[-*]\s/.test(line)) continue;
    const m = line.match(LINE);
    const id = m && requestId(m[1], m[2]);
    if (!m || !isRequestId(id) || id in entries) { unknown += 1; continue; }
    const changed = m[6] ? Date.parse(`${m[6]}T${m[7]}:00Z`) : 0;
    const e = cleanEntry({ sent: m[3] ? '' : m[4], answered: m[5] || '', changed: Number.isFinite(changed) ? changed : 0 });
    if (!e || (m[4] && !e.sent) || (m[5] && !e.answered)) { unknown += 1; continue; }
    entries[id] = e;
  }
  return { log: { entries }, unknown };
}

// Combine an imported set with this browser's: new requests are added; when both have one and the
// dates differ, the one changed later wins (same minute: this browser's stays).
export function mergeRequests(local, incoming) {
  const merged = { ...(local?.entries || {}) }, changes = { added: [], updated: [], same: [], kept: [] };
  for (const [id, inc] of Object.entries(incoming?.entries || {})) {
    if (!isRequestId(id)) continue;
    const mine = merged[id];
    if (!mine) { if (inc.sent) { merged[id] = { ...inc }; changes.added.push(id); } continue; }
    if (mine.sent === inc.sent && mine.answered === inc.answered) { changes.same.push(id); continue; }
    if (minute(inc.changed) > minute(mine.changed)) { merged[id] = { ...inc }; changes.updated.push(id); } else changes.kept.push(id);
  }
  return { log: cleanRequests({ entries: merged }), ...changes };
}
