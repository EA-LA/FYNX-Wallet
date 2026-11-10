// Test timing and pace: how long the owner's launch tests really take, and how fast the owner's own steps
// are getting done. Pure helpers shared by the owner workspace and tests. Only step keys, whole minutes
// and times are stored (in this browser); nothing here is sent anywhere.
import { stepKey, stepState, stepIndex, shortStep } from './launch-tracker.js';
import { sessionable, MAX_MINUTES } from './test-session.js';

export const TIMING_KEY = 'fynx-owner-test-timings-v1';
export const KEEP_PER_TEST = 5;
const DAY = 86400000, WEEK = 7 * DAY;

// A gap longer than this between two results was a break, not the test: it is left untimed.
export const gapLimit = estimate => estimate * 3 + 15;

// Time each result recorded during a session: the minutes since the previous result in the session
// (or since the session started, for the first one). Results recorded before the session are ignored.
export function sessionTimings(session, plan, records) {
  const index = stepIndex(plan), rows = [];
  for (const key of session?.keys || []) {
    const entry = index.get(key), rec = records[key];
    if (!entry || !rec?.result || !Number.isFinite(rec.at) || rec.at < session.started) continue;
    rows.push({ key, gate: entry.gate, step: entry.step, estimate: entry.step.minutes, at: rec.at, took: null, long: false });
  }
  rows.sort((a, b) => a.at - b.at);
  let prev = session?.started || 0;
  for (const r of rows) {
    const took = Math.max(1, Math.round((r.at - prev) / 60000));
    if (took > gapLimit(r.estimate)) r.long = true; else r.took = took;
    prev = r.at;
  }
  const timed = rows.filter(r => r.took !== null);
  return {
    rows, byKey: Object.fromEntries(rows.map(r => [r.key, r])), timed: timed.length, untimed: rows.length - timed.length,
    estimate: timed.reduce((n, r) => n + r.estimate, 0), actual: timed.reduce((n, r) => n + r.took, 0),
  };
}

// Stored log: { "<gate>/<step>": [{ min, at }] }, newest KEEP_PER_TEST per test, only tests with an estimate.
export function cleanTimings(raw, plan) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const index = stepIndex(plan);
  for (const [key, list] of Object.entries(raw)) {
    const entry = index.get(key);
    if (!entry || !sessionable(entry.step) || !Array.isArray(list)) continue;
    const seen = new Set(), kept = [];
    for (const t of list) {
      if (!t || !Number.isInteger(t.min) || t.min < 1 || t.min > MAX_MINUTES * 4 || !Number.isFinite(t.at) || t.at <= 0 || seen.has(t.at)) continue;
      seen.add(t.at); kept.push({ min: t.min, at: t.at });
    }
    kept.sort((a, b) => b.at - a.at);
    if (kept.length) out[key] = kept.slice(0, KEEP_PER_TEST);
  }
  return out;
}

// Add a session's timed results to the log. The result time identifies a measurement, so adding the same
// session twice changes nothing. Returns a new log and how many measurements were new.
export function addTimings(log, timings) {
  const next = Object.fromEntries(Object.entries(log || {}).map(([k, v]) => [k, [...v]]));
  let added = 0;
  for (const r of timings.rows) {
    if (r.took === null) continue;
    const list = next[r.key] || [];
    if (list.some(t => t.at === r.at)) continue;
    list.push({ min: r.took, at: r.at }); list.sort((a, b) => b.at - a.at);
    next[r.key] = list.slice(0, KEEP_PER_TEST); added += 1;
  }
  return { log: next, added };
}

export function median(values) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

// The owner's own time per measured test (median of the kept measurements).
export function measuredTimes(log) {
  const out = {};
  for (const [key, list] of Object.entries(log || {})) if (list.length) out[key] = median(list.map(t => t.min));
  return out;
}

// Estimates in launch-checklist.json that the owner's measurements say are clearly off:
// at least 5 minutes and at least half as much again (or a third less) than the estimate.
export function estimateCorrections(plan, log) {
  const times = measuredTimes(log), out = [];
  for (const [key, { gate, step }] of stepIndex(plan)) {
    if (!sessionable(step) || times[key] === undefined) continue;
    const mine = times[key], diff = mine - step.minutes;
    if (Math.abs(diff) >= 5 && (mine >= step.minutes * 1.5 || mine * 1.5 <= step.minutes)) out.push({ key, gate, step, estimate: step.minutes, measured: mine, count: log[key].length, diff });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

// How the owner's measured times compare with the estimates overall (1.2 = 20% longer). Needs 3 tests.
export function paceRatio(plan, log) {
  const times = measuredTimes(log), index = stepIndex(plan);
  let est = 0, mine = 0, n = 0;
  for (const [key, m] of Object.entries(times)) {
    const entry = index.get(key); if (!entry) continue;
    est += entry.step.minutes; mine += m; n += 1;
  }
  return n >= 3 && est > 0 ? Math.round(mine / est * 100) / 100 : null;
}

const md = s => String(s).replace(/\s+/g, ' ').replace(/([\\`*_[\]<>|])/g, '\\$1').trim();
export const minutesText = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;

// Lines added to the copied session results: how long each recorded test took.
export function timingLines(timings) {
  if (!timings.rows.length) return [];
  const L = ['## Time taken', '', timings.timed ? `Timed ${timings.timed} ${timings.timed === 1 ? 'test' : 'tests'}: about ${minutesText(timings.actual)} against an estimate of ${minutesText(timings.estimate)}.` : 'No test could be timed (long gaps between results).', ''];
  for (const r of timings.rows) L.push(`- ${md(shortStep(r.step))}: ${r.took === null ? 'not timed (a break or long gap)' : `took ${r.took} min`} (estimate ${r.estimate} min)`);
  return L;
}

// A list for the engineer (or Claude) to correct the estimates in launch-checklist.json.
export function correctionsMarkdown(plan, log, { date = new Date() } = {}) {
  const fixes = estimateCorrections(plan, log), measured = Object.keys(log || {}).length;
  const L = ['# FYNX Wallet: test time estimates to correct', '', `Made ${date.toISOString().slice(0, 16).replace('T', ' ')} UTC from ${measured} measured ${measured === 1 ? 'test' : 'tests'} (the middle of up to ${KEEP_PER_TEST} measurements each).`, ''];
  if (!fixes.length) L.push('Every measured test is close to its estimate. Nothing to correct.');
  else {
    L.push('Change `minutes` for these steps in wallet-src/launch-checklist.json:', '');
    for (const f of fixes) L.push(`- ${f.key}: ${md(shortStep(f.step))}: estimate ${f.estimate} min, measured ${f.measured} min (${f.count} ${f.count === 1 ? 'time' : 'times'})`);
  }
  L.push('', 'Contains no keys, recovery phrases, passwords or notes.');
  return `${L.join('\n')}\n`;
}

// Pace of the owner's own launch steps (tests, decisions and sign-offs), from the result times in this
// browser. Weekly counts of steps finished (Passed or Not applicable), oldest week first, ending now.
// The forecast covers the owner's steps only, never engineering or outside parties.
export function launchPace(plan, records, { now = Date.now(), weeks = 8, log = {} } = {}) {
  const buckets = Array.from({ length: weeks }, (_, i) => ({ start: now - (weeks - i) * WEEK, end: now - (weeks - i - 1) * WEEK, count: 0 }));
  const times = measuredTimes(log);
  let open = 0, openTests = 0, minutesLeft = 0, mineLeft = 0, failed = 0, finished = 0, last28 = 0, lastAt = 0;
  for (const gate of plan.items) for (const step of gate.steps || []) {
    if (step.by !== 'you' || step.done) continue;
    const key = stepKey(gate.id, step.id), state = stepState(gate, step, records), rec = records[key];
    if (rec?.result && Number.isFinite(rec.at) && rec.at <= now) lastAt = Math.max(lastAt, rec.at);
    if (state === 'done') {
      finished += 1;
      const at = rec?.at || 0;
      if (at > now - 4 * WEEK && at <= now) last28 += 1;
      const b = buckets.find(x => at > x.start && at <= x.end); if (b) b.count += 1;
      continue;
    }
    open += 1; if (state === 'failed') failed += 1;
    if (sessionable(step)) { openTests += 1; minutesLeft += step.minutes; mineLeft += times[key] ?? step.minutes; }
  }
  const perWeek = Math.round(last28 / 4 * 10) / 10;
  let forecast = null, reason = '';
  if (!open) reason = 'done';
  else if (!finished) reason = 'not-started';
  else if (last28 < 2) reason = 'slow';
  else { const w = Math.ceil(open / perWeek); forecast = { weeks: w, date: new Date(now + w * WEEK) }; }
  return { buckets, open, openTests, otherOpen: open - openTests, minutesLeft, mineLeft, failed, finished, last28, perWeek, lastAt, forecast, reason, ratio: paceRatio(plan, log) };
}

export const daysAgo = (at, now = Date.now()) => Math.max(0, Math.floor((now - at) / DAY));
