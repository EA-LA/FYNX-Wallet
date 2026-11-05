// Waitlist insights: pure helpers for the owner workspace Waitlist tab and its tests.
// They only read registrations already loaded in this browser; nothing is sent or saved.
const DAY = 86400000;

// Addresses reserved for documentation/testing (RFC 2606/6761) are not real subscribers.
export function isTestAddress(email) {
  const domain = String(email || '').toLowerCase().split('@')[1] || '';
  return /(^|\.)example\.(com|org|net)$/.test(domain) || /(^|\.)(example|test|invalid|localhost)$/.test(domain) || domain === 'localhost';
}

const pad = n => String(n).padStart(2, '0');
// Calendar day key in local time (owner's browser) or UTC.
export function dayKey(time, utc = false) {
  const d = new Date(time);
  return utc ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function startOfDay(time, utc) {
  const d = new Date(time);
  return utc ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
// Step back whole calendar days (safe across daylight-saving changes in local time).
function addDays(dayStart, days, utc) {
  const d = new Date(dayStart);
  return utc ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days) : new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}
// Monday-based week start.
function startOfWeek(time, utc) {
  const day = startOfDay(time, utc), weekday = utc ? new Date(day).getUTCDay() : new Date(day).getDay();
  return addDays(day, -((weekday + 6) % 7), utc);
}

const timeOf = record => { const t = Date.parse(record?.createdAt || ''); return Number.isFinite(t) ? t : null; };
const tally = (records, pick) => {
  const counts = new Map();
  for (const r of records) { const key = pick(r) || 'Not recorded'; counts.set(key, (counts.get(key) || 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};

// Sign-ups per calendar day (oldest first) for the last `days` days ending today.
export function perDay(records, { now = Date.now(), days = 30, utc = false } = {}) {
  const today = startOfDay(now, utc), buckets = [];
  for (let i = days - 1; i >= 0; i--) { const start = addDays(today, -i, utc); buckets.push({ start, key: dayKey(start, utc), count: 0 }); }
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const r of records) { const t = timeOf(r); if (t === null) continue; const i = index.get(dayKey(t, utc)); if (i !== undefined) buckets[i].count++; }
  return buckets;
}

// Sign-ups per Monday-based week (oldest first) for the last `weeks` weeks including this one.
export function perWeek(records, { now = Date.now(), weeks = 12, utc = false } = {}) {
  const thisWeek = startOfWeek(now, utc), buckets = [];
  for (let i = weeks - 1; i >= 0; i--) { const start = addDays(thisWeek, -7 * i, utc); buckets.push({ start, key: dayKey(start, utc), count: 0 }); }
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const r of records) { const t = timeOf(r); if (t === null) continue; const i = index.get(dayKey(startOfWeek(t, utc), utc)); if (i !== undefined) buckets[i].count++; }
  return buckets;
}

export function summarize(records, { total = records.length, now = Date.now(), utc = false } = {}) {
  const list = [...records], real = list.filter(r => !isTestAddress(r.email));
  const today = startOfDay(now, utc), tomorrow = addDays(today, 1, utc);
  const since = days => addDays(today, -(days - 1), utc);
  const inRange = (from, to) => real.filter(r => { const t = timeOf(r); return t !== null && t >= from && t < to; }).length;
  const times = real.map(timeOf).filter(t => t !== null).sort((a, b) => a - b);
  const expiring = real.filter(r => { const t = Date.parse(r.expiresAt || ''); return Number.isFinite(t) && t >= now && t < now + 30 * DAY; }).length;
  const expired = real.filter(r => { const t = Date.parse(r.expiresAt || ''); return Number.isFinite(t) && t < now; }).length;
  const consented = real.filter(r => r.consent === true).length;
  return {
    total, loaded: list.length, complete: list.length >= total, real: real.length, tests: list.length - real.length,
    today: inRange(today, tomorrow), last7: inRange(since(7), tomorrow), prev7: inRange(since(14), since(7)), last30: inRange(since(30), tomorrow),
    consented, consentMissing: real.length - consented, consentPercent: real.length ? Math.round(consented / real.length * 100) : 0,
    noTimestamp: real.filter(r => timeOf(r) === null).length, expiring, expired,
    first: times.length ? new Date(times[0]).toISOString() : null, latest: times.length ? new Date(times.at(-1)).toISOString() : null,
    byNotice: tally(real, r => r.noticeVersion), bySource: tally(real, r => r.source), byStatus: tally(real, r => r.status),
  };
}

// Change against the previous seven days, in words.
export function trendText(last7, prev7) {
  if (!last7 && !prev7) return 'No sign-ups in the last two weeks';
  if (!prev7) return `${last7} new this week, none the week before`;
  const change = Math.round((last7 - prev7) / prev7 * 100);
  return change === 0 ? 'Same as the previous 7 days' : `${change > 0 ? '+' : ''}${change}% vs the previous 7 days (${prev7})`;
}

// Text filter over loaded rows (substring of email, status, source or notice), optional test-address hiding.
export function filterRecords(records, { query = '', hideTests = false, consent = 'all' } = {}) {
  const q = String(query).trim().toLowerCase();
  return [...records].filter(r => {
    if (hideTests && isTestAddress(r.email)) return false;
    if (consent === 'recorded' && r.consent !== true) return false;
    if (consent === 'missing' && r.consent === true) return false;
    if (!q) return true;
    return [r.email, r.status, r.source, r.noticeVersion].some(v => String(v || '').toLowerCase().includes(q));
  });
}

// CSV cell: quote everything and neutralise spreadsheet formulas (=, +, -, @, tab, CR at the start).
export function csvCell(value) {
  let v = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}
export const CSV_COLUMNS = ['Email', 'Registered (UTC)', 'Status', 'Consent', 'Notice version', 'Source', 'Expires (UTC)', 'Test address'];
export function toCSV(records) {
  const rows = [CSV_COLUMNS.map(csvCell).join(',')];
  for (const r of records) rows.push([r.email, r.createdAt || '', r.status || '', r.consent === true ? 'Recorded' : 'Not recorded', r.noticeVersion || '', r.source || '', r.expiresAt || '', isTestAddress(r.email) ? 'Yes' : 'No'].map(csvCell).join(','));
  return `﻿${rows.join('\r\n')}\r\n`;
}

// Plain-text summary without any email addresses, safe to paste into a message.
export function summaryText(s, { date = new Date().toISOString().slice(0, 10) } = {}) {
  const lines = [`FYNX Wallet waitlist summary (${date})`, `Registrations: ${s.total}${s.complete ? '' : ` (figures below use ${s.loaded} loaded)`}`];
  if (s.tests) lines.push(`Test addresses excluded: ${s.tests}`);
  lines.push(`Today: ${s.today} · Last 7 days: ${s.last7} · Last 30 days: ${s.last30}`, `Trend: ${trendText(s.last7, s.prev7)}`);
  lines.push(`Consent recorded: ${s.consented} of ${s.real} (${s.consentPercent}%)`);
  if (s.expiring) lines.push(`Retention ends within 30 days: ${s.expiring}`);
  if (s.expired) lines.push(`Past retention date: ${s.expired}`);
  const list = pairs => pairs.map(([k, v]) => `${k} ${v}`).join(', ') || 'None';
  lines.push(`Notice versions: ${list(s.byNotice)}`, `Sources: ${list(s.bySource)}`, `Statuses: ${list(s.byStatus)}`);
  if (s.first) lines.push(`First sign-up: ${s.first.slice(0, 10)} · Latest: ${s.latest.slice(0, 10)}`);
  return lines.join('\n');
}
