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
// `gone` remembers removed requests (id → the request's own time) so a test report from another device
// does not bring them back; each marker is forgotten with the request it stands for, after KEEP_DAYS.
export function cleanTally(raw, now = Date.now()) {
  const out = { entries: [], cleared: {}, gone: {} };
  if (!raw || typeof raw !== 'object') return out;
  if (raw.gone && typeof raw.gone === 'object') {
    const marks = Object.entries(raw.gone).map(([k, v]) => [cleanId(k), Number(v)]).filter(([k, t]) => k && validTime(t, now)).sort((a, b) => a[1] - b[1]);
    out.gone = Object.fromEntries(marks.slice(-MAX_ENTRIES));
  }
  const seen = new Set();
  for (const e of Array.isArray(raw.entries) ? raw.entries : []) {
    if (!e || typeof e !== 'object') continue;
    const id = cleanId(e.id), at = Number(e.at);
    if (!id || seen.has(id) || out.gone[id] !== undefined || !findSituation(e.situation) || !validTime(at, now)) continue;
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
  const hit = tally.entries.find(e => e.id === id);
  if (!hit) return tally;
  return { ...tally, entries: tally.entries.filter(e => e.id !== id), gone: { ...(tally.gone || {}), [id]: hit.at } };
}
// "Clear the tally": every request is removed and remembered as removed, so another device's report does not
// bring them back. "Explained" times are kept: they only ever quieten older requests.
export function clearTally(tally) {
  const gone = { ...(tally.gone || {}) };
  for (const e of tally.entries) gone[e.id] = e.at;
  return { ...tally, entries: [], gone };
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

// Short form for "Today · What needs you" on the Dashboard tab: counts and fixed titles only.
export function briefSupport(summary) {
  if (!summary || !summary.total) return null;
  return {
    total: summary.total, last24: summary.last24, last7: summary.last7, stop: summary.stop, check: summary.check,
    alerts: summary.alerts.map(a => ({ id: a.situation.id, title: a.situation.title, level: a.level, kind: a.kind, people: a.people || 0, lastAt: a.lastAt })),
  };
}

// Travel between devices inside the Launch readiness test report: request kinds, times, the follow-up flag,
// "explained" times and removals. Never names, emails, addresses, transaction IDs or message text.
export const TALLY_SECTION = 'Pilot support requests (kinds and times only)';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const iso = ms => new Date(ms).toISOString();

export function tallyReportLines(tally, now = Date.now()) {
  const t = cleanTally(tally, now), gone = Object.entries(t.gone), explained = Object.entries(t.cleared);
  if (!t.entries.length && !gone.length && !explained.length) return [];
  const L = [`## ${TALLY_SECTION}`, '', 'From Launch readiness → Pilot support playbook → “Support requests during the pilot”. Only the kind of request, its time and whether it was a follow-up: no names, emails, addresses, transaction IDs or message text.', ''];
  for (const e of t.entries) L.push(`- ${e.id} · ${e.situation} · ${iso(e.at)}${e.again ? ' · follow-up' : ''} · ${findSituation(e.situation).title}`);
  for (const [situation, at] of explained) L.push(`- explained · ${situation} · ${iso(at)}`);
  for (const [id, at] of gone) L.push(`- removed · ${id} · ${iso(at)}`);
  L.push('');
  return L;
}

export function parseTallyReport(text, now = Date.now()) {
  const raw = { entries: [], cleared: {}, gone: {} };
  let inSection = false, unknown = 0, lines = 0;
  for (const line of String(text || '').split(/\r?\n/).slice(0, 20000)) {
    if (/^##\s/.test(line)) { inSection = line.replace(/^##\s+/, '').trim() === TALLY_SECTION; continue; }
    if (!inSection || !/^\s*[-*]\s/.test(line)) continue;
    lines += 1;
    const [first, second, third, ...rest] = line.replace(/^\s*[-*]\s+/, '').trim().split(' · ');
    const at = ISO.test(third || '') ? Date.parse(third) : NaN;
    if (!Number.isFinite(at)) { unknown += 1; continue; }
    if (first === 'explained' && findSituation(second)) { raw.cleared[second] = Math.max(raw.cleared[second] || 0, at); continue; }
    if (first === 'removed' && cleanId(second)) { raw.gone[second] = at; continue; }
    if (cleanId(first) && findSituation(second)) { raw.entries.push({ id: first, situation: second, at, again: rest[0] === 'follow-up' }); continue; }
    unknown += 1;
  }
  const tally = cleanTally(raw, now);
  // Lines that were understood but are older than KEEP_DAYS (or in the future) are left out, not guessed.
  const kept = tally.entries.length + Object.keys(tally.cleared).length + Object.keys(tally.gone).length;
  return { tally, count: tally.entries.length, explained: Object.keys(tally.cleared).length, removed: Object.keys(tally.gone).length, unknown, leftOut: Math.max(0, lines - unknown - kept) };
}

// Union by request id. A removal on either device wins (removing is the deliberate act). When both have the
// same request with a different follow-up flag, this browser's flag stays. The later "explained" time wins.
export function mergeTallies(local, incoming, now = Date.now()) {
  const mine = cleanTally(local, now), inc = cleanTally(incoming, now);
  const gone = { ...mine.gone }, removed = [];
  for (const [id, at] of Object.entries(inc.gone)) {
    if (gone[id] === undefined) gone[id] = at;
    if (mine.entries.some(e => e.id === id)) removed.push(id);
  }
  const byId = new Map(mine.entries.filter(e => gone[e.id] === undefined).map(e => [e.id, e]));
  const added = [], same = [], kept = [];
  for (const e of inc.entries) {
    if (gone[e.id] !== undefined) continue;
    const have = byId.get(e.id);
    if (!have) { byId.set(e.id, e); added.push(e.id); }
    else if (have.again === e.again && have.situation === e.situation) same.push(e.id);
    else kept.push(e.id);
  }
  const cleared = { ...mine.cleared }, explained = [];
  for (const [s, at] of Object.entries(inc.cleared)) if (!(cleared[s] >= at)) { cleared[s] = at; explained.push(s); }
  const merged = cleanTally({ entries: [...byId.values()], cleared, gone }, now);
  const dropped = added.filter(id => !merged.entries.some(e => e.id === id)).length;
  return { tally: merged, added: added.filter(id => merged.entries.some(e => e.id === id)), same, kept, removed, explained, dropped, changes: added.length - dropped + removed.length + explained.length };
}
