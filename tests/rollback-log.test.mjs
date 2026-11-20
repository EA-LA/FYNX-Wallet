import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLLBACK_KEY, TRIGGERS, STEPS, REOPEN_CHECKS, OUTCOMES, MAX_PAST, MAX_NOTE, cleanLog, cleanNote, startRollback, markStep, unmarkStep, setCheck, closeOptions, closeRollback, removePast, rollbackProgress, briefRollback, rollbackCheck, rollbackMarkdown, durationText } from '../wallet-src/rollback-log.js';
import { pilotReadiness } from '../wallet-src/pilot-readiness.js';
import { todayBrief, briefText } from '../wallet-src/today-brief.js';

const NOW = Date.UTC(2026, 10, 20, 12, 0);
const MIN = 60000, DAY = 86400000;
const PHRASE = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
const plan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const empty = () => cleanLog(null);
const start = (opts = {}) => startRollback(empty(), { trigger: 'support', at: NOW, id: 'rb-test-1', ...opts }).log;
const step = (log, id, minutes, extra = {}) => { const r = markStep(log, id, { at: NOW + minutes * MIN, ...extra }); assert.equal(r.problem, null, `${id}: ${r.problem}`); return r.log; };

test('steps and triggers follow docs/PILOT-ROLLBACK.md', () => {
  assert.match(ROLLBACK_KEY, /^fynx-owner-.*-v1$/);
  const doc = readFileSync(new URL('../docs/PILOT-ROLLBACK.md', import.meta.url), 'utf8');
  const docSteps = [...doc.matchAll(/^\d\. \*\*([^*]+?)\.?\*\*/gm)].map(m => m[1]).slice(0, 7);
  assert.equal(STEPS.length, 7);
  assert.equal(docSteps.length, 7);
  STEPS.forEach((s, i) => assert.ok(s.title.toLowerCase().startsWith(docSteps[i].toLowerCase()), `${s.title} vs ${docSteps[i]}`));
  assert.deepEqual(STEPS.filter(s => s.optional).map(s => s.id), ['site', 'server']);
  assert.equal(TRIGGERS.length, 6);
  assert.equal(REOPEN_CHECKS.length, 3);
  assert.match(doc, /Rollback record/, 'the plan points to the workspace record');
});

test('starting: one open record, a reason is needed, secret-looking notes are refused', () => {
  assert.equal(startRollback(empty(), { trigger: 'nope', at: NOW }).problem, 'Choose why you are rolling back.');
  assert.match(startRollback(empty(), { trigger: 'other', at: NOW }).problem, /note/);
  assert.equal(startRollback(empty(), { trigger: 'support', note: PHRASE, at: NOW }).problem, 'secret');
  const log = start({ note: '  two   users: wrong amount ' });
  assert.equal(log.current.note, 'two users: wrong amount');
  assert.equal(log.current.practice, false);
  assert.match(startRollback(log, { trigger: 'release', at: NOW }).problem, /already open/);
  assert.equal(cleanNote('x'.repeat(500)).length, MAX_NOTE);
  assert.equal(cleanNote(PHRASE), null);
});

test('marking steps: first time kept, notes updated, optional steps only can be skipped, undo', () => {
  let log = start();
  log = step(log, 'stop', 3);
  log = step(log, 'stop', 9, { note: 'switch off, audit log ok' });
  assert.equal(log.current.steps.stop.at, NOW + 3 * MIN, 'first time kept');
  assert.equal(log.current.steps.stop.note, 'switch off, audit log ok');
  assert.match(markStep(log, 'tell', { skip: true, at: NOW }).problem, /cannot be skipped/);
  assert.equal(markStep(log, 'tell', { note: PHRASE, at: NOW }).problem, 'secret');
  log = step(log, 'site', 10, { skip: true });
  assert.equal(log.current.steps.site.skip, true);
  log = unmarkStep(log, 'site');
  assert.equal(log.current.steps.site, undefined);
  assert.equal(markStep(empty(), 'stop').problem, 'No open rollback record.');
  // A step before the start is clamped to the start.
  assert.equal(markStep(start(), 'stop', { at: NOW - 5 * MIN }).log.current.steps.stop.at, NOW);
});

test('reopening needs every step handled, all three conditions and step 7; unticking takes step 7 back', () => {
  let log = start();
  let opts = closeOptions(log.current);
  assert.deepEqual(opts.map(o => o.outcome), ['reopened', 'paused', 'cancelled']);
  assert.equal(opts.find(o => o.outcome === 'paused').ok, false);
  assert.equal(opts.find(o => o.outcome === 'cancelled').ok, true);
  log = step(log, 'stop', 4);
  assert.equal(closeOptions(log.current).find(o => o.outcome === 'paused').ok, true);
  assert.equal(closeOptions(log.current).find(o => o.outcome === 'cancelled').ok, false, 'a record with steps is never discarded');
  for (const [id, m] of [['tell', 8], ['freeze', 10], ['reconcile', 50]]) log = step(log, id, m);
  log = step(log, 'site', 20, { skip: true }); log = step(log, 'server', 21, { skip: true });
  assert.match(closeOptions(log.current)[0].why, /Tick all three/);
  assert.match(markStep(log, 'reopen', { at: NOW }).problem, /Tick all three/);
  for (const c of REOPEN_CHECKS) log = setCheck(log, c.id, true);
  assert.match(closeOptions(log.current)[0].why, /Record step 7/);
  log = step(log, 'reopen', 90);
  assert.equal(closeOptions(log.current)[0].ok, true);
  const back = setCheck(log, 'fixed', false);
  assert.equal(back.current.steps.reopen, undefined);
  assert.equal(closeOptions(back.current)[0].ok, false);
  const r = closeRollback(log, { outcome: 'reopened', at: NOW + 95 * MIN });
  assert.equal(r.problem, null);
  assert.equal(r.log.current, null);
  assert.equal(r.log.past[0].outcome, 'reopened');
  assert.equal(r.log.past[0].closedAt, NOW + 95 * MIN);
  assert.match(closeRollback(start(), { outcome: 'reopened' }).problem, /Still open/);
  assert.equal(closeRollback(start(), { outcome: 'cancelled' }).log.past.length, 0, 'a mistaken start leaves nothing');
});

test('practice: all seven walked through, no reopening conditions needed', () => {
  let log = start({ practice: true, trigger: 'reconcile' });
  assert.deepEqual(closeOptions(log.current).map(o => o.outcome), ['practice', 'cancelled']);
  STEPS.forEach((s, i) => { log = step(log, s.id, (i + 1) * 5); });
  assert.equal(closeOptions(log.current)[0].ok, true);
  const closed = closeRollback(log, { outcome: 'practice', at: NOW + 40 * MIN }).log;
  assert.equal(closed.past[0].outcome, 'practice');
  assert.equal(OUTCOMES.practice, 'Practice finished');
});

test('progress and the Today brief', () => {
  let log = start();
  let b = briefRollback(log, NOW + 7 * MIN);
  assert.equal(b.stopped, false);
  assert.match(b.headline, /not recorded as stopped yet: do step 1/);
  log = step(log, 'stop', 6); log = step(log, 'tell', 12);
  const p = rollbackProgress(log.current, NOW + 75 * MIN);
  assert.deepEqual([p.done, p.total, p.next.id, p.minutes, p.sinceLast, p.stopMinutes], [2, 7, 'freeze', 75, 63, 6]);
  b = briefRollback(log, NOW + 75 * MIN);
  assert.match(b.headline, /1 h 15 min: 2 of 7 steps done; next “Freeze releases”/);
  assert.equal(briefRollback(empty()), null);
  assert.equal(durationText(1), '1 minute');
  assert.equal(durationText(125), '2 h 05 min');

  // A real rollback outranks a support rollback trigger on Today; a practice does not change the headline.
  const support = { total: 2, last24: 2, last7: 2, stop: 1, check: 0, alerts: [{ id: 'pending', title: 'Pending', level: 'stop', people: 2 }] };
  const real = todayBrief({ support, rollback: b });
  assert.equal(real.tone, 'overdue');
  assert.equal(real.headline, b.headline);
  const tile = real.stats.find(s => s.id === 'rollback');
  assert.deepEqual([tile.value, tile.detail], ['2/7', 'next: Freeze releases']);
  const practice = briefRollback(start({ practice: true }), NOW);
  const t = todayBrief({ rollback: practice });
  assert.notEqual(t.headline, practice.headline);
  assert.equal(t.stats.find(s => s.id === 'rollback').label, 'rollback practice steps');
  assert.match(briefText(t), /Rollback practice under way/);
  assert.equal(todayBrief({}).stats.some(s => s.id === 'rollback'), false, 'no tile without a record');
});

test('Pilot go / no-go: an open real rollback stops it; a finished practice counts', () => {
  const base = { plan, now: NOW };
  const without = pilotReadiness(base);
  assert.equal(without.checks.some(c => c.title === 'Rollback steps walked through' || c.title === 'Rollback under way'), false, 'unchanged when not passed in');
  const none = pilotReadiness({ ...base, rollback: empty() });
  const c0 = none.checks.find(c => c.title === 'Rollback steps walked through');
  assert.equal(c0.state, 'warn'); assert.deepEqual(c0.action, { kind: 'rollback' });
  assert.equal(none.blockers, without.blockers);

  const open = pilotReadiness({ ...base, rollback: step(start(), 'stop', 2), now: NOW + 10 * MIN });
  assert.equal(open.verdict, 'stop');
  assert.match(open.headline, /rollback is under way/);
  const blk = open.checks.find(c => c.title === 'Rollback under way');
  assert.equal(blk.state, 'block'); assert.equal(blk.group, 'support');
  assert.match(blk.detail, /1 of 7 steps done/);

  let pr = start({ practice: true });
  STEPS.forEach((s, i) => { pr = step(pr, s.id, i + 1); });
  pr = closeRollback(pr, { outcome: 'practice', at: NOW + 30 * MIN }).log;
  const done = pilotReadiness({ ...base, rollback: pr });
  const ok = done.checks.find(c => c.title === 'Rollback steps walked through');
  assert.equal(ok.state, 'ok'); assert.match(ok.detail, /2026-11-20 with all seven steps \(30 minutes/);
  assert.equal(rollbackCheck(null), null);
});

test('storage is checked: unknown steps, triggers, outcomes, bad times and secret notes go', () => {
  const raw = {
    current: { id: 'rb-aaaa', trigger: 'support', startedAt: NOW - 30 * MIN, practice: 'yes', note: PHRASE, email: 'x@example.com',
      steps: { stop: { at: NOW - 25 * MIN, note: 'ok' }, tell: { at: NOW - 40 * MIN }, nope: { at: NOW }, freeze: { at: NOW + 3 * DAY }, tell2: 1, site: { at: NOW - 20 * MIN, skip: true }, reconcile: { at: NOW - 10 * MIN, skip: true, note: PHRASE } },
      checks: { balanced: true, fixed: 'true', other: true } },
    past: [
      { id: 'rb-bbbb', trigger: 'release', startedAt: NOW - 2 * DAY, outcome: 'paused', closedAt: NOW - DAY, steps: {} },
      { id: 'rb-bbbb', trigger: 'release', startedAt: NOW - 2 * DAY, outcome: 'paused', closedAt: NOW - DAY },
      { id: 'rb-cccc', trigger: 'release', startedAt: NOW - 2 * DAY },
      { id: 'rb-dddd', trigger: 'zzz', startedAt: NOW - 2 * DAY, outcome: 'paused', closedAt: NOW - DAY },
      { id: 'rb-eeee', trigger: 'access', startedAt: NOW - 500 * DAY, outcome: 'paused', closedAt: NOW - 499 * DAY },
    ],
  };
  const log = cleanLog(raw, NOW);
  assert.equal(log.current.practice, false);
  assert.equal(log.current.note, '');
  assert.deepEqual(Object.keys(log.current.steps).sort(), ['reconcile', 'site', 'stop']);
  assert.equal(log.current.steps.reconcile.skip, undefined, 'a required step cannot be stored as skipped');
  assert.equal(log.current.steps.reconcile.note, undefined);
  assert.equal(log.current.steps.site.skip, true);
  assert.deepEqual(log.current.checks, { balanced: true });
  assert.equal(log.current.email, undefined);
  assert.deepEqual(log.past.map(r => r.id), ['rb-bbbb']);
  assert.deepEqual(cleanLog('nonsense', NOW), { current: null, past: [] });
  // A closed record stored as "current" is not treated as open.
  assert.equal(cleanLog({ current: { ...raw.past[0] } }, NOW).current, null);
  // At most MAX_PAST finished records, newest first.
  const many = Array.from({ length: MAX_PAST + 5 }, (_, i) => ({ id: `rb-x${String(i).padStart(3, '0')}`, trigger: 'release', startedAt: NOW - 10 * DAY + i * MIN, outcome: 'paused', closedAt: NOW - 9 * DAY + i * MIN }));
  const kept = cleanLog({ past: many }, NOW).past;
  assert.equal(kept.length, MAX_PAST); assert.equal(kept[0].id, `rb-x${String(MAX_PAST + 4).padStart(3, '0')}`);
  assert.deepEqual(removePast({ current: null, past: kept }, kept[0].id).past.length, MAX_PAST - 1);
});

test('the record: UTC times, fixed step names, notes escaped, never anything secret', () => {
  let log = start({ note: 'pending | wrong *amount*' });
  log = step(log, 'stop', 4, { note: 'turned off' });
  log = step(log, 'server', 15, { skip: true });
  const open = rollbackMarkdown(log.current, { now: NOW + 20 * MIN });
  assert.match(open, /^# FYNX pilot rollback record/);
  assert.match(open, /- Started: 2026-11-20 12:00 UTC/);
  assert.match(open, /- Why: Same complaint from two pilot users within a day \(pending \\\| wrong \\\*amount\\\*\)/);
  assert.match(open, /- Status: open for 20 minutes, 2 of 7 steps recorded/);
  assert.match(open, /- Real-money transfers stopped 4 minutes after the start/);
  assert.match(open, /\| 1 \| Stop new real-money transfers \| 11-20 12:04 \| turned off \|/);
  assert.match(open, /\| 5 \| Put the server back \| not needed \(12:15\) \|/);
  assert.match(open, /\| 7 \| Decide on reopening \| not recorded \|/);
  assert.match(open, /- \[ \] The cause is fixed and retested/);
  const closed = closeRollback(log, { outcome: 'paused', at: NOW + 61 * MIN }).log.past[0];
  assert.match(rollbackMarkdown(closed), /- Ended: 2026-11-20 13:01 UTC · Pilot stays paused \(1 h 01 min\)/);
  let pr = start({ practice: true });
  pr = step(pr, 'stop', 0);
  const pm = rollbackMarkdown(pr.current, { now: NOW });
  assert.match(pm, /^# FYNX rollback practice record/);
  assert.match(pm, /stopped within a minute of the start/);
  assert.doesNotMatch(pm, /Reopening conditions/);
  assert.doesNotMatch(open + pm, /0x[0-9a-f]{10}/i);
});

test('the workspace page has the rollback record box and wires it to Today and Pilot go / no-go', () => {
  const html = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  assert.match(html, /<section id="rollback-log" class="launch-order rollback-log" aria-labelledby="rbl-title"><\/section>/);
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /rollback: briefRollback\(rollbackLog\)/);
  assert.match(app, /rollback: rollbackLog,/);
  assert.match(app, /localStorage\.getItem\(ROLLBACK_KEY\)/);
  // The record never touches the real-money switch itself.
  const ui = app.slice(app.indexOf('// Rollback record (Launch readiness)'), app.indexOf('function recordStep('));
  assert.doesNotMatch(ui, /setMainnetPolicy|httpsCallable|fetch\(/);
});
