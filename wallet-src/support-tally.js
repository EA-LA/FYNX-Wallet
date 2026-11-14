// Pilot support tally: pure helpers for Launch readiness → "Pilot support playbook" → "Support requests
// during the pilot", and its tests. The owner presses "Log this request" on an answer each time a pilot
// customer writes in. Only the kind of request and the time are kept in this browser: no names, emails,
// addresses, transaction IDs or message text. The tally spots the rollback rule in docs/PILOT-ROLLBACK.md
// ("support receives the same complaint from two pilot users within a day") and feeds Pilot go / no-go.
import { SITUATIONS, URGENCY, findSituation, LINKS } from './support-playbook.js';

export const TALLY_KEY = 'fynx-owner-support-tally-v1';
export const MAX_ENTRIES = 1000;
export const KEEP_DAYS = 90;
const DAY = 86400000;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const validTime = (v, now) => Number.isFinite(v) && v > now - KEEP_DAYS * DAY && v <= now + DAY;
const cleanId = v => (typeof v === 'string' && /^[a-z0-9-]{4,40}$/.test(v) ? v : null);

// Anything read back from storage is checked: unknown kinds, old or future times, duplicates and extra fields go.
export function cleanTally(raw, now = Date.now()) {
  const out = { entries: [], cleared: {} };
  if (!raw || typeof raw !== 'object') return out;
  const seen = new Set();
  for (const e of Array.isArray(raw.entries) ? raw.entries : []) {
    if (!e || typeof e !== 'object') continue;
    const id = cleanId(e.id), at = Number(e.at);
    if (!id || seen.has(id) || !findSituation(e.situation) || !validTime(at, now)) continue;
    seen.add(id);
    out.entries.push({ id, situation: e.situation, at, again: e.again === true });
  }
  out.entries.sort((a, b) => a.at - b.at);
  if (out.entries.length > MAX_ENTRIES) out.entries = out.entries.slice(-MAX_ENTRIES);
  if (raw.cleared && typeof raw.cleared === 'object') {
    for (const [k, v] of Object.entries(raw.cleared)) { const t = Number(v); if (findSituation(k) && validTime(t, now)) out.cleared[k] = t; }
  }
  return out;
}

const newId = (at, entries) => { let id; do id = `r-${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`; while (entries.some(e => e.id === id)); return id; };

// Log one request. `again` = a follow-up from someone already counted (does not count toward "two users").
export function logRequest(tally, { situation, again = false, at = Date.now(), id } = {}) {
  if (!findSituation(situation)) return tally;
  const entries = [...tally.entries, { id: cleanId(id) || newId(at, tally.entries), situation, at, again: again === true }];
  return { ...tally, entries: entries.slice(-MAX_ENTRIES) };
}
export function removeRequest(tally, id) {
  const entries = tally.entries.filter(e => e.id !== id);
  return entries.length === tally.entries.length ? tally : { ...tally, entries };
}
export function setAgain(tally, id, again) {
  return { ...tally, entries: tally.entries.map(e => (e.id === id ? { ...e, again: again === true } : e)) };
}
// "Explained": the owner checked the alert (for example it was one person writing twice, or the cause is
// known and fixed). Requests logged before this time no longer raise that alert; new ones do.
export function markExplained(tally, situation, at = Date.now()) {
  if (!findSituation(situation)) return tally;
  return { ...tally, cleared: { ...tally.cleared, [situation]: at } };
}

const utcDay = ms => new Date(ms).toISOString().slice(0, 10);

// Counts per kind, the last seven UTC days and the alerts to act on. Never says "fine" for an empty tally.
export function tallySummary(tally, now = Date.now()) {
  const entries = (tally?.entries || []).filter(e => e.at <= now + DAY);
  const cleared = tally?.cleared || {};
  const in24 = e => e.at > now - DAY, in7 = e => e.at > now - 7 * DAY;
  const rows = [];
  for (const s of SITUATIONS) {
    const mine = entries.filter(e => e.situation === s.id);
    if (!mine.length) continue;
    rows.push({ situation: s, total: mine.length, last24: mine.filter(in24).length, last7: mine.filter(in7).length, lastAt: Math.max(...mine.map(e => e.at)) });
  }
  rows.sort((a, b) => b.last24 - a.last24 || b.last7 - a.last7 || URGENCY[a.situation.urgency].order - URGENCY[b.situation.urgency].order || b.lastAt - a.lastAt);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const day = utcDay(now - i * DAY);
    days.push({ day, count: entries.filter(e => utcDay(e.at) === day).length });
  }

  const alerts = [];
  for (const s of SITUATIONS) {
    const open = entries.filter(e => e.situation === s.id && in24(e) && e.at > (cleared[s.id] || 0));
    if (!open.length) continue;
    const people = open.filter(e => !e.again).length;
    const base = { situation: s, count: open.length, firstAt: Math.min(...open.map(e => e.at)), lastAt: Math.max(...open.map(e => e.at)) };
    if (people >= 2) {
      alerts.push({ ...base, kind: 'repeat', level: 'stop', people,
        text: `“${s.title}” came from ${people} different pilot users in the last 24 hours. Your rollback plan says to stop the pilot when the same complaint comes from two pilot users within a day: turn off real-money sending and follow the rollback steps, unless you already know the cause and it is not a fault in FYNX.` });
    } else if (s.rollback) {
      alerts.push({ ...base, kind: 'rollback', level: 'check',
        text: `“${s.title}” was logged in the last 24 hours. If you cannot explain it within 1 hour, turn off real-money sending and follow the rollback plan.` });
    } else if (s.urgency === 'security') {
      alerts.push({ ...base, kind: 'security', level: 'check',
        text: `Security request “${s.title}” in the last 24 hours. Answer it first, within 1 hour, and record it as a security event if anything was misused.` });
    }
  }
  alerts.sort((a, b) => (a.level === 'stop' ? 0 : 1) - (b.level === 'stop' ? 0 : 1) || b.lastAt - a.lastAt);

  return {
    total: entries.length, last24: entries.filter(in24).length, last7: entries.filter(in7).length,
    since: entries.length ? entries[0].at : null, rows, days, alerts,
    stop: alerts.filter(a => a.level === 'stop').length, check: alerts.filter(a => a.level === 'check').length,
    recent: [...entries].sort((a, b) => b.at - a.at).slice(0, 10).map(e => ({ ...e, title: findSituation(e.situation).title })),
  };
}

// The support line for Pilot go / no-go (docs/PILOT-ROLLBACK.md "When to roll back").
export function supportCheck(summary) {
  if (!summary) return null;
  if (!summary.total) return { state: 'info', title: 'Support requests', detail: 'Nothing logged yet. During the pilot, press “Log this request” on the answer you used each time a customer writes in, so a repeated complaint is spotted.' };
  const stop = summary.alerts.filter(a => a.level === 'stop');
  if (stop.length) return { state: 'block', title: 'Same complaint from two pilot users in a day', detail: stop.map(a => `“${a.situation.title}”: ${a.people} users in the last 24 hours.`).join(' ') + ' That is a rollback trigger: turn off real-money sending and follow the rollback plan, or mark it explained once you know the cause.' };
  const check = summary.alerts.filter(a => a.level === 'check');
  if (check.length) return { state: 'warn', title: 'Support requests to explain', detail: `${check.map(a => `“${a.situation.title}”`).join(', ')} logged in the last 24 hours. Explain each within 1 hour or roll back.` };
  return { state: 'ok', title: 'No repeated complaint', detail: `${plural(summary.last24, 'request')} in the last 24 hours, ${summary.last7} in 7 days; no complaint from two pilot users within a day.` };
}

const md = s => String(s).replace(/\s+/g, ' ').replace(/([\\`*_[\]<>|])/g, '\\$1').trim();

// A shareable summary for the pilot records: kinds, counts and UTC days only.
export function tallyMarkdown(summary, { date = new Date() } = {}) {
  const L = ['# FYNX pilot support requests', '', `Prepared ${date.toISOString().slice(0, 16).replace('T', ' ')} UTC from the owner workspace. Counts only: no names, emails, addresses, transaction IDs or message text.`, ''];
  if (!summary.total) return [...L, 'No support requests logged yet.', ''].join('\n');
  L.push(`- Last 24 hours: ${summary.last24}`, `- Last 7 days: ${summary.last7}`, `- Logged since ${utcDay(summary.since)}: ${summary.total}`, '');
  if (summary.alerts.length) {
    L.push('## To act on', '');
    for (const a of summary.alerts) L.push(`- ${a.level === 'stop' ? '**Rollback trigger**' : 'Check'}: ${md(a.text)}`);
    L.push('', `Rollback plan: ${LINKS.rollback}`, '');
  }
  L.push('## By kind', '', '| Kind | Request | 24 hours | 7 days | All |', '| --- | --- | --- | --- | --- |');
  for (const r of summary.rows) L.push(`| ${URGENCY[r.situation.urgency].label} | ${md(r.situation.title)} | ${r.last24} | ${r.last7} | ${r.total} |`);
  L.push('', '## Last 7 days (UTC)', '', '| Day | Requests |', '| --- | --- |', ...summary.days.map(d => `| ${d.day} | ${d.count} |`), '');
  return L.join('\n');
}
