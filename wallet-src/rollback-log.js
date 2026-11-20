// Rollback record: pure helpers for Launch readiness → "Rollback record" and its tests.
// docs/PILOT-ROLLBACK.md says to write the UTC time next to each rollback step as you do it. This keeps that
// record in this browser while a real rollback (or a practice of one) is under way: why it started, the time
// each of the seven steps was done (or why a step was not needed), the three conditions for reopening and how
// it ended. It never switches anything off or on by itself: the owner does each step in its own place.
// Only fixed choices, times and short notes are kept; notes that look like a recovery phrase or key are refused.
import { looksSecret } from './launch-tracker.js';

export const ROLLBACK_KEY = 'fynx-owner-rollback-log-v1';
export const MAX_PAST = 20;
export const MAX_NOTE = 240;
const DAY = 86400000;
const KEEP_DAYS = 400;

// "When to roll back" in docs/PILOT-ROLLBACK.md, plus a free reason.
export const TRIGGERS = Object.freeze([
  { id: 'reconcile', title: 'Reconciliation needs a look and cannot be explained within 1 hour' },
  { id: 'access', title: 'A session, passkey or wallet that is not yours appeared' },
  { id: 'release', title: 'A release behaves differently from the test sessions' },
  { id: 'support', title: 'Same complaint from two pilot users within a day' },
  { id: 'provider', title: 'History or network provider down too long to check transfers' },
  { id: 'other', title: 'Another reason (say which in the note)' },
]);

// "Roll back, step by step" in docs/PILOT-ROLLBACK.md. `optional` steps can be marked "Not needed".
// `place` tells the page which workspace control or document the step uses.
export const STEPS = Object.freeze([
  { id: 'stop', title: 'Stop new real-money transfers', how: 'Crypto tools → Real-money sending → Turn off. It takes effect at once and is written to the security audit log. If the workspace cannot be reached, contain the owner function as in OPERATIONS.md step 2.', place: 'mainnet' },
  { id: 'tell', title: 'Tell the pilot group', how: 'In the agreed support channel: new transfers are paused, funds in their own wallets are not affected, and when the next update will come. Do not promise a cause or a date you do not know.', place: 'support' },
  { id: 'freeze', title: 'Freeze releases', how: 'No new commits to main until the rollback is closed, except the rollback itself.', place: null },
  { id: 'site', title: 'Put the website back', how: 'Revert the faulty commit in Git, run npm run check, push, and confirm the GitHub Actions run and the published manifest. Not needed when the website did not change.', place: 'release', optional: true },
  { id: 'server', title: 'Put the server back', how: 'Only if the server changed: deploy the last reviewed source of the owner function only, with its matching website version. Never roll back database data or delete customer records.', place: 'release', optional: true },
  { id: 'reconcile', title: 'Reconcile every network used in the pilot', how: 'Crypto tools → Portfolio & history: Check balances, Load history for each network, then copy or download the Reconciliation report and keep it.', place: 'reconcile' },
  { id: 'reopen', title: 'Decide on reopening', how: 'Reopen only when all three conditions below are met. Turning real-money sending back on needs a fresh sign-in and the typed confirmation, as before.', place: 'mainnet' },
]);
export const STEP_IDS = STEPS.map(s => s.id);

// Step 7: all three must be true before the record can end as "Reopened".
export const REOPEN_CHECKS = Object.freeze([
  { id: 'balanced', title: 'The reconciliation is Balanced, or every flag is explained in writing' },
  { id: 'fixed', title: 'The cause is fixed and retested' },
  { id: 'approved', title: 'You gave written approval to reopen' },
]);

export const OUTCOMES = Object.freeze({
  reopened: 'Reopened after the checks',
  paused: 'Pilot stays paused',
  practice: 'Practice finished',
  cancelled: 'Started by mistake',
});

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cleanId = v => (typeof v === 'string' && /^[a-z0-9-]{4,40}$/.test(v) ? v : null);
const validTime = (v, now) => Number.isFinite(v) && v > now - KEEP_DAYS * DAY && v <= now + DAY;
const findTrigger = id => TRIGGERS.find(t => t.id === id) || null;
const findStepDef = id => STEPS.find(s => s.id === id) || null;

// A short note, or '' when empty, too long is cut, and null when it looks like a recovery phrase or key.
export function cleanNote(raw) {
  const v = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!v) return '';
  if (looksSecret(v)) return null;
  return v.slice(0, MAX_NOTE);
}

function cleanRun(r, now) {
  if (!r || typeof r !== 'object') return null;
  const id = cleanId(r.id), startedAt = Number(r.startedAt);
  if (!id || !findTrigger(r.trigger) || !validTime(startedAt, now)) return null;
  const run = { id, practice: r.practice === true, trigger: r.trigger, note: cleanNote(r.note) || '', startedAt, steps: {}, checks: {} };
  for (const [k, v] of Object.entries(r.steps && typeof r.steps === 'object' ? r.steps : {})) {
    const def = findStepDef(k), at = Number(v?.at);
    if (!def || !validTime(at, now) || at < startedAt) continue;
    const skip = v.skip === true && def.optional === true;
    run.steps[k] = { at, ...(skip ? { skip: true } : {}), ...(cleanNote(v.note) ? { note: cleanNote(v.note) } : {}) };
  }
  for (const c of REOPEN_CHECKS) if (r.checks?.[c.id] === true) run.checks[c.id] = true;
  const closedAt = Number(r.closedAt);
  if (OUTCOMES[r.outcome] && validTime(closedAt, now) && closedAt >= startedAt) { run.outcome = r.outcome; run.closedAt = closedAt; }
  return run;
}

// Anything read back from storage is checked: unknown steps, triggers, outcomes, old or future times and
// notes that look like a key go. At most one record is open; finished ones keep the newest MAX_PAST.
export function cleanLog(raw, now = Date.now()) {
  const out = { current: null, past: [] };
  if (!raw || typeof raw !== 'object') return out;
  const cur = cleanRun(raw.current, now);
  if (cur && !cur.outcome) out.current = cur;
  const seen = new Set(out.current ? [out.current.id] : []);
  for (const r of Array.isArray(raw.past) ? raw.past : []) {
    const run = cleanRun(r, now);
    if (!run || !run.outcome || seen.has(run.id)) continue;
    seen.add(run.id); out.past.push(run);
  }
  out.past.sort((a, b) => b.closedAt - a.closedAt);
  out.past = out.past.slice(0, MAX_PAST);
  return out;
}

const newId = at => `rb-${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Start a record. Refused (same log back, with a problem) while another one is open or the input is unclear.
export function startRollback(log, { trigger, practice = false, note = '', at = Date.now(), id } = {}) {
  if (log.current) return { log, problem: 'A rollback record is already open. Finish it first.' };
  if (!findTrigger(trigger)) return { log, problem: 'Choose why you are rolling back.' };
  const n = cleanNote(note);
  if (n === null) return { log, problem: 'secret' };
  if (trigger === 'other' && !n) return { log, problem: 'Say in the note why you are rolling back.' };
  return { log: { ...log, current: { id: cleanId(id) || newId(at), practice: practice === true, trigger, note: n, startedAt: at, steps: {}, checks: {} } }, problem: null };
}

// Record that a step was done now (or, for an optional step, that it was not needed). Recording it again keeps
// the first time but updates the note.
export function markStep(log, stepId, { at = Date.now(), skip = false, note } = {}) {
  const run = log.current, def = findStepDef(stepId);
  if (!run || !def) return { log, problem: 'No open rollback record.' };
  if (skip && !def.optional) return { log, problem: `“${def.title}” cannot be skipped.` };
  if (stepId === 'reopen' && !skip && !run.practice && !REOPEN_CHECKS.every(c => run.checks[c.id])) return { log, problem: 'Tick all three reopening conditions first.' };
  const n = note === undefined ? run.steps[stepId]?.note || '' : cleanNote(note);
  if (n === null) return { log, problem: 'secret' };
  const prev = run.steps[stepId];
  const entry = { at: prev && !!prev.skip === !!skip ? prev.at : Math.max(at, run.startedAt), ...(skip ? { skip: true } : {}), ...(n ? { note: n } : {}) };
  return { log: { ...log, current: { ...run, steps: { ...run.steps, [stepId]: entry } } }, problem: null };
}
export function unmarkStep(log, stepId) {
  const run = log.current;
  if (!run || !run.steps[stepId]) return log;
  const steps = { ...run.steps }; delete steps[stepId];
  return { ...log, current: { ...run, steps } };
}
export function setCheck(log, checkId, value) {
  const run = log.current;
  if (!run || !REOPEN_CHECKS.some(c => c.id === checkId)) return log;
  const checks = { ...run.checks };
  if (value === true) checks[checkId] = true; else delete checks[checkId];
  // Unticking a condition takes back a recorded "reopen" decision.
  const steps = { ...run.steps };
  if (value !== true && steps.reopen) delete steps.reopen;
  return { ...log, current: { ...run, checks, steps } };
}

// Which ways of closing the open record are allowed now, and why not for the others.
export function closeOptions(run) {
  if (!run) return [];
  const done = id => !!run.steps[id] && !run.steps[id].skip, handled = id => !!run.steps[id];
  const missing = STEPS.filter(s => s.id !== 'reopen' && !handled(s.id));
  const opts = [];
  if (run.practice) {
    const all = STEPS.filter(s => !handled(s.id));
    opts.push({ outcome: 'practice', ok: !all.length, why: all.length ? `Still to walk through: ${all.map(s => s.title).join(', ')}.` : '' });
  } else {
    const allChecks = REOPEN_CHECKS.every(c => run.checks[c.id]);
    const why = missing.length ? `Still open: ${missing.map(s => s.title).join(', ')}.` : !allChecks ? 'Tick all three reopening conditions.' : !done('reopen') ? 'Record step 7 “Decide on reopening”.' : '';
    opts.push({ outcome: 'reopened', ok: !why, why });
    opts.push({ outcome: 'paused', ok: done('stop'), why: done('stop') ? '' : 'Record step 1 “Stop new real-money transfers” first.' });
  }
  const anyStep = Object.keys(run.steps).length > 0;
  opts.push({ outcome: 'cancelled', ok: !anyStep, why: anyStep ? 'Steps are already recorded: close it another way so the record is kept.' : '' });
  return opts;
}

// Close the open record. A record started by mistake (nothing recorded) is dropped instead of kept.
export function closeRollback(log, { outcome, at = Date.now() } = {}) {
  const run = log.current;
  if (!run) return { log, problem: 'No open rollback record.' };
  const opt = closeOptions(run).find(o => o.outcome === outcome);
  if (!opt) return { log, problem: 'Choose how the rollback ended.' };
  if (!opt.ok) return { log, problem: opt.why };
  if (outcome === 'cancelled') return { log: { ...log, current: null }, problem: null };
  const closed = { ...run, outcome, closedAt: Math.max(at, run.startedAt) };
  return { log: { current: null, past: [closed, ...log.past].slice(0, MAX_PAST) }, problem: null };
}
export function removePast(log, id) {
  return { ...log, past: log.past.filter(r => r.id !== id) };
}

const utcTime = ms => new Date(ms).toISOString().slice(11, 16);
const utcStamp = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
export const durationText = minutes => (minutes < 60 ? plural(minutes, 'minute') : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`);

// Where an open (or finished) record stands: steps handled, the next one, minutes since the start and since
// the last recorded step, and the time from start to "Stop new real-money transfers".
export function rollbackProgress(run, now = Date.now()) {
  if (!run) return null;
  const handled = STEPS.filter(s => run.steps[s.id]);
  const next = STEPS.find(s => !run.steps[s.id]) || null;
  const end = run.closedAt || now;
  const times = Object.values(run.steps).map(s => s.at);
  const last = times.length ? Math.max(...times) : run.startedAt;
  const stop = run.steps.stop && !run.steps.stop.skip ? run.steps.stop.at : null;
  return {
    done: handled.length, total: STEPS.length, next,
    minutes: Math.max(0, Math.floor((end - run.startedAt) / 60000)),
    sinceLast: Math.max(0, Math.floor((end - last) / 60000)),
    stopMinutes: stop === null ? null : Math.max(0, Math.floor((stop - run.startedAt) / 60000)),
    checks: REOPEN_CHECKS.filter(c => run.checks[c.id]).length,
  };
}

// For "Today" and Pilot go / no-go: the open record in a few fixed words. null when none is open.
export function briefRollback(log, now = Date.now()) {
  const run = log?.current;
  if (!run) return null;
  const p = rollbackProgress(run, now);
  const stopped = !!run.steps.stop;
  return {
    practice: run.practice, done: p.done, total: p.total, minutes: p.minutes, stopped,
    next: p.next ? p.next.title : null, nextId: p.next ? p.next.id : null,
    trigger: findTrigger(run.trigger).title, startedAt: run.startedAt,
    headline: run.practice
      ? `Rollback practice under way: ${p.done} of ${p.total} steps walked through${p.next ? `; next “${p.next.title}”` : ''}.`
      : !stopped
        ? `Rollback under way for ${durationText(p.minutes)} and real-money transfers are not recorded as stopped yet: do step 1 “Stop new real-money transfers” now.`
        : `Rollback under way for ${durationText(p.minutes)}: ${p.done} of ${p.total} steps done${p.next ? `; next “${p.next.title}”` : ''}.`,
  };
}

// For Pilot go / no-go: an open real rollback stops the pilot; a finished practice record is good evidence.
export function rollbackCheck(log, now = Date.now()) {
  if (!log) return null;
  const cur = log.current;
  if (cur && !cur.practice) {
    const p = rollbackProgress(cur, now);
    return { state: 'block', stop: true, title: 'Rollback under way', detail: `Started ${utcStamp(cur.startedAt)} UTC (${findTrigger(cur.trigger).title.toLowerCase()}); ${p.done} of ${p.total} steps done. Reopen only after the three conditions in the rollback record are met.` };
  }
  const practice = log.past.find(r => r.outcome === 'practice');
  if (practice) return { state: 'ok', stop: false, title: 'Rollback steps walked through', detail: `A rollback practice record was finished on ${utcStamp(practice.closedAt).slice(0, 10)} with all seven steps (${durationText(rollbackProgress(practice).minutes)} from start to finish).` };
  if (cur) return { state: 'warn', stop: false, title: 'Rollback steps walked through', detail: `A rollback practice record is open: ${rollbackProgress(cur, now).done} of ${STEPS.length} steps walked through.` };
  return { state: 'warn', stop: false, title: 'Rollback steps walked through', detail: 'Start a rollback practice record and walk through all seven steps once, writing down the time of each, so you know how long stopping takes.' };
}

const md = s => String(s).replace(/\s+/g, ' ').replace(/([\\`*_[\]<>|])/g, '\\$1').trim();

// The written record for the pilot files: times in UTC, fixed step names, the owner's short notes.
export function rollbackMarkdown(run, { now = Date.now() } = {}) {
  const p = rollbackProgress(run, now);
  const L = [`# FYNX ${run.practice ? 'rollback practice' : 'pilot rollback'} record`, ''];
  L.push(`- Started: ${utcStamp(run.startedAt)} UTC`);
  L.push(`- Why: ${md(findTrigger(run.trigger).title)}${run.note ? ` (${md(run.note)})` : ''}`);
  L.push(run.outcome ? `- Ended: ${utcStamp(run.closedAt)} UTC · ${OUTCOMES[run.outcome]} (${durationText(p.minutes)})` : `- Status: open for ${durationText(p.minutes)}, ${p.done} of ${p.total} steps recorded`);
  if (p.stopMinutes !== null) L.push(`- Real-money transfers stopped ${p.stopMinutes ? `${durationText(p.stopMinutes)} after the start` : 'within a minute of the start'}`);
  L.push('', '| # | Step | Time (UTC) | Note |', '| --- | --- | --- | --- |');
  STEPS.forEach((s, i) => {
    const e = run.steps[s.id];
    const when = !e ? 'not recorded' : e.skip ? `not needed (${utcTime(e.at)})` : `${utcStamp(e.at).slice(5)}`;
    L.push(`| ${i + 1} | ${md(s.title)} | ${when} | ${e?.note ? md(e.note) : ''} |`);
  });
  if (!run.practice) {
    L.push('', 'Reopening conditions:');
    for (const c of REOPEN_CHECKS) L.push(`- [${run.checks[c.id] ? 'x' : ' '}] ${md(c.title)}`);
  }
  L.push('', 'FYNX is self-custody: a rollback stops new activity and puts the software back; it cannot reverse on-chain transfers. Keep this record with the reconciliation reports. It contains no keys, addresses or customer details.', '');
  return L.join('\n');
}

// Travel between devices inside the Launch readiness test report: a rollback started on the phone can be
// continued on the computer. Only the record id, real or practice, the fixed reason, each step's time (or
// "not needed"), the ticked reopening conditions and how it ended travel. Notes stay on the device where they
// were typed (they may name people or providers).
export const ROLLBACK_SECTION = 'Rollback records (times and fixed names only)';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const iso = ms => new Date(ms).toISOString();

export function rollbackReportLines(log, now = Date.now()) {
  const l = cleanLog(log, now), runs = [...(l.current ? [l.current] : []), ...l.past];
  if (!runs.length) return [];
  const L = [`## ${ROLLBACK_SECTION}`, '', 'From Launch readiness → Rollback record. Times in UTC; notes stay on the device where they were typed.', ''];
  for (const r of runs) {
    L.push(`- ${r.id} · started · ${iso(r.startedAt)} · ${r.practice ? 'practice' : 'real'} · ${r.trigger} · ${findTrigger(r.trigger).title}`);
    for (const s of STEPS) { const e = r.steps[s.id]; if (e) L.push(`- ${r.id} · step · ${iso(e.at)} · ${s.id}${e.skip ? ' · not needed' : ''} · ${s.title}`); }
    for (const c of REOPEN_CHECKS) if (r.checks[c.id]) L.push(`- ${r.id} · condition · ${iso(r.startedAt)} · ${c.id} · ${c.title}`);
    if (r.outcome) L.push(`- ${r.id} · ended · ${iso(r.closedAt)} · ${r.outcome} · ${OUTCOMES[r.outcome]}`);
  }
  L.push('');
  return L;
}

export function parseRollbackReport(text, now = Date.now()) {
  const runs = new Map();
  let inSection = false, unknown = 0;
  for (const line of String(text || '').split(/\r?\n/).slice(0, 20000)) {
    if (/^##\s/.test(line)) { inSection = line.replace(/^##\s+/, '').trim() === ROLLBACK_SECTION; continue; }
    if (!inSection || !/^\s*[-*]\s/.test(line)) continue;
    const [id, kind, time, a, b] = line.replace(/^\s*[-*]\s+/, '').trim().split(' · ');
    const at = ISO.test(time || '') ? Date.parse(time) : NaN;
    if (!cleanId(id) || !Number.isFinite(at)) { unknown += 1; continue; }
    const run = runs.get(id) || { id, steps: {}, checks: {} };
    if (kind === 'started' && (a === 'real' || a === 'practice') && findTrigger(b)) Object.assign(run, { startedAt: at, practice: a === 'practice', trigger: b });
    else if (kind === 'step' && findStepDef(a)) run.steps[a] = { at, ...(b === 'not needed' ? { skip: true } : {}) };
    else if (kind === 'condition' && REOPEN_CHECKS.some(c => c.id === a)) run.checks[a] = true;
    else if (kind === 'ended' && OUTCOMES[a]) Object.assign(run, { outcome: a, closedAt: at });
    else { unknown += 1; continue; }
    runs.set(id, run);
  }
  const all = [...runs.values()].map(r => cleanRun(r, now)).filter(Boolean);
  const open = all.filter(r => !r.outcome).sort((x, y) => y.startedAt - x.startedAt);
  const past = all.filter(r => r.outcome).sort((x, y) => y.closedAt - x.closedAt);
  return { open, past, count: all.length, unknown, leftOut: runs.size - all.length };
}

// Bring records from the report into this browser's log, matched by record id:
// - a record new here is added (an open one only when no other record is open here; otherwise it is left out
//   and named in `conflict`, so two rollbacks are never open at once);
// - for a record on both: steps and conditions recorded on either device are kept (this browser's time and note
//   win for a step on both); a record ended on either device is ended here too.
// Removing an earlier record and unticking a condition do not travel: do them on each device.
export function mergeRollbacks(local, parsed, now = Date.now()) {
  const mine = cleanLog(local, now);
  let current = mine.current;
  const past = new Map(mine.past.map(r => [r.id, r]));
  const added = [], updated = [], same = [], conflict = [], ended = [];
  const combine = (have, inc) => {
    const steps = { ...inc.steps, ...have.steps };
    const checks = { ...inc.checks, ...have.checks };
    const out = { ...have, steps, checks };
    if (!have.outcome && inc.outcome) { out.outcome = inc.outcome; out.closedAt = inc.closedAt; }
    return out;
  };
  const sameRun = (x, y) => JSON.stringify([x.steps, x.checks, x.outcome || null]) === JSON.stringify([y.steps, y.checks, y.outcome || null]);
  for (const inc of [...(parsed?.past || []), ...(parsed?.open || [])]) {
    const have = current?.id === inc.id ? current : past.get(inc.id);
    if (have) {
      const out = combine(have, inc);
      if (sameRun(out, have)) { same.push(inc.id); continue; }
      updated.push(inc.id);
      if (current?.id === inc.id && out.outcome) { current = null; past.set(out.id, out); ended.push(out.id); }
      else if (current?.id === inc.id) current = out;
      else past.set(out.id, out);
      continue;
    }
    if (inc.outcome) { past.set(inc.id, inc); added.push(inc.id); continue; }
    if (current) { conflict.push(inc.id); continue; }
    current = inc; added.push(inc.id);
  }
  const log = cleanLog({ current, past: [...past.values()] }, now);
  const keptIds = new Set([...(log.current ? [log.current.id] : []), ...log.past.map(r => r.id)]);
  return { log, added: added.filter(id => keptIds.has(id)), updated, same, conflict, ended, changes: added.filter(id => keptIds.has(id)).length + updated.length };
}

// For "Your dates" (owner-dates.js): an open real rollback is due today until it is closed. Practice records
// are left out: they are not urgent.
export function rollbackDate(log, now = Date.now()) {
  const run = log?.current;
  if (!run || run.practice) return null;
  const p = rollbackProgress(run, now);
  return {
    startedDay: new Date(run.startedAt).toISOString().slice(0, 10),
    title: p.next ? `Finish the rollback: next “${p.next.title}”` : 'Close the rollback record',
    detail: `Started ${utcStamp(run.startedAt)} UTC (${findTrigger(run.trigger).title.toLowerCase()}); ${p.done} of ${p.total} steps recorded. Launch readiness → Rollback record.`,
  };
}
