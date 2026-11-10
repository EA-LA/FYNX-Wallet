import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stepIndex } from '../wallet-src/launch-tracker.js';
import { planSession, cleanSession, startSession, sessionProgress, sessionSummary } from '../wallet-src/test-session.js';
import { TIMING_KEY, KEEP_PER_TEST, gapLimit, sessionTimings, cleanTimings, addTimings, median, measuredTimes, estimateCorrections, paceRatio, timingLines, correctionsMarkdown, launchPace, minutesText } from '../wallet-src/test-timing.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const index = stepIndex(plan);
const MIN = 60000, DAY = 86400000, WEEK = 7 * DAY;
const T0 = Date.UTC(2026, 10, 10, 9, 0);
const est = key => index.get(key).step.minutes;

function session(keys, started = T0) { return { keys, minutes: 60, have: [], started, finished: 0, mine: false }; }

test('sessionTimings times each result from the previous one and leaves breaks untimed', () => {
  const s = session(['identity/passkey-add', 'identity/passkey-signin', 'identity/passkey-remove']);
  const a = est('identity/passkey-add'), b = est('identity/passkey-signin');
  const records = {
    'identity/passkey-add': { result: 'pass', note: '', at: T0 + 7 * MIN },
    'identity/passkey-signin': { result: 'fail', note: '', at: T0 + 7 * MIN + (gapLimit(b) + 20) * MIN },
  };
  const t = sessionTimings(s, plan, records);
  assert.equal(t.rows.length, 2);
  assert.equal(t.byKey['identity/passkey-add'].took, 7);
  assert.equal(t.byKey['identity/passkey-signin'].took, null);
  assert.equal(t.byKey['identity/passkey-signin'].long, true);
  assert.deepEqual([t.timed, t.untimed, t.actual, t.estimate], [1, 1, 7, a]);
  // Results from before the session started are not timed and not counted.
  const old = { 'identity/passkey-add': { result: 'pass', note: '', at: T0 - MIN } };
  assert.equal(sessionTimings(s, plan, old).rows.length, 0);
  // A result recorded within the same minute still counts as one minute.
  assert.equal(sessionTimings(s, plan, { 'identity/passkey-add': { result: 'skip', note: '', at: T0 + 5000 } }).byKey['identity/passkey-add'].took, 1);
});

test('results are ordered by time, not by the plan order', () => {
  const s = session(['identity/passkey-add', 'identity/passkey-signin']);
  const records = {
    'identity/passkey-signin': { result: 'pass', note: '', at: T0 + 4 * MIN },
    'identity/passkey-add': { result: 'pass', note: '', at: T0 + 10 * MIN },
  };
  const t = sessionTimings(s, plan, records);
  assert.equal(t.byKey['identity/passkey-signin'].took, 4);
  assert.equal(t.byKey['identity/passkey-add'].took, 6);
});

test('addTimings keeps the newest five per test and ignores the same session twice', () => {
  const s = session(['identity/passkey-add']);
  const records = { 'identity/passkey-add': { result: 'pass', note: '', at: T0 + 9 * MIN } };
  const t = sessionTimings(s, plan, records);
  const first = addTimings({}, t);
  assert.equal(first.added, 1);
  assert.deepEqual(first.log['identity/passkey-add'], [{ min: 9, at: T0 + 9 * MIN }]);
  const again = addTimings(first.log, t);
  assert.equal(again.added, 0);
  let log = {};
  for (let i = 0; i < 8; i += 1) {
    const start = T0 + i * DAY;
    log = addTimings(log, sessionTimings(session(['identity/passkey-add'], start), plan, { 'identity/passkey-add': { result: 'pass', note: '', at: start + (5 + i) * MIN } })).log;
  }
  assert.equal(log['identity/passkey-add'].length, KEEP_PER_TEST);
  assert.equal(log['identity/passkey-add'][0].min, 12, 'newest first');
  // The input log is not changed.
  assert.equal(first.log['identity/passkey-add'].length, 1);
});

test('cleanTimings drops unknown steps, decisions, bad minutes and duplicates', () => {
  const raw = {
    'identity/passkey-add': [{ min: 6, at: 5 }, { min: 6, at: 5 }, { min: 0, at: 6 }, { min: 2.5, at: 7 }, { min: 8, at: 9 }, 'x'],
    'nope/step': [{ min: 3, at: 1 }],
    'website/site-live': [{ min: 3, at: 1 }],
    'identity/passkey-signin': 'not a list',
  };
  assert.deepEqual(cleanTimings(raw, plan), { 'identity/passkey-add': [{ min: 8, at: 9 }, { min: 6, at: 5 }] });
  assert.deepEqual(cleanTimings(null, plan), {});
  assert.deepEqual(cleanTimings([], plan), {});
  assert.equal(TIMING_KEY, 'fynx-owner-test-timings-v1');
});

test('median, measured times, pace ratio and estimates to correct', () => {
  assert.equal(median([]), null);
  assert.equal(median([4, 1, 9]), 4);
  assert.equal(median([4, 10]), 7);
  const a = 'identity/passkey-add', b = 'identity/passkey-signin', c = 'website/join-phone';
  const log = { [a]: [{ min: est(a) * 3 + 6, at: 3 }, { min: est(a) * 3 + 6, at: 2 }], [b]: [{ min: est(b), at: 1 }] };
  assert.deepEqual(measuredTimes(log), { [a]: est(a) * 3 + 6, [b]: est(b) });
  assert.equal(paceRatio(plan, log), null, 'needs three measured tests');
  const fixes = estimateCorrections(plan, log);
  assert.deepEqual(fixes.map(f => f.key), [a]);
  assert.equal(fixes[0].count, 2);
  log[c] = [{ min: est(c), at: 4 }];
  const ratio = paceRatio(plan, log);
  assert.equal(ratio, Math.round((est(a) * 3 + 6 + est(b) + est(c)) / (est(a) + est(b) + est(c)) * 100) / 100);
  // Small differences are not worth correcting.
  assert.deepEqual(estimateCorrections(plan, { [b]: [{ min: est(b) + 4, at: 1 }] }), []);
  const text = correctionsMarkdown(plan, log, { date: new Date(T0) });
  assert.match(text, /identity\/passkey-add: .*estimate \d+ min, measured \d+ min \(2 times\)/);
  assert.match(text, /launch-checklist\.json/);
  assert.doesNotMatch(text, /@/);
  assert.match(correctionsMarkdown(plan, {}, { date: new Date(T0) }), /Nothing to correct/);
});

test('planSession uses measured times when given; the session keeps using them', () => {
  const a = 'identity/passkey-add';
  const plain = planSession(plan, {}, { minutes: 90, have: [] });
  const withMine = planSession(plan, {}, { minutes: 90, have: [], times: { [a]: 40 } });
  const row = withMine.steps.find(s => s.key === a);
  assert.ok(row && row.measured && row.minutes === 40 && row.estimate === est(a));
  assert.ok(plain.steps.find(s => s.key === a).measured === false);
  assert.ok(withMine.total <= 90);
  const s = startSession(withMine, { minutes: 90, mine: true, now: T0 });
  assert.equal(s.mine, true);
  assert.equal(cleanSession(JSON.parse(JSON.stringify(s)), plan).mine, true);
  assert.equal(cleanSession({ ...s, mine: 'yes' }, plan).mine, false);
  const p = sessionProgress(s, plan, {}, { [a]: 40 });
  assert.equal(p.rows.find(r => r.key === a).minutes, 40);
  assert.equal(p.rows.find(r => r.key === a).estimate, est(a));
  // Without "mine", the estimate is used even when times are passed.
  assert.equal(sessionProgress({ ...s, mine: false }, plan, {}, { [a]: 40 }).rows.find(r => r.key === a).minutes, est(a));
});

test('copied session results include the time taken', () => {
  const s = session(['identity/passkey-add', 'identity/passkey-signin']);
  const records = { 'identity/passkey-add': { result: 'pass', note: 'secret note text', at: T0 + 8 * MIN } };
  const lines = timingLines(sessionTimings(s, plan, records));
  const text = sessionSummary(s, plan, records, { appendix: lines });
  assert.match(text, /## Time taken/);
  assert.match(text, /took 8 min \(estimate \d+ min\)/);
  assert.doesNotMatch(text, /secret note text/);
  assert.ok(text.indexOf('## Time taken') < text.indexOf('Contains no keys'));
  assert.deepEqual(timingLines(sessionTimings(s, plan, {})), []);
  assert.equal(minutesText(45), '45 min');
  assert.equal(minutesText(60), '1 h');
  assert.equal(minutesText(135), '2 h 15 min');
});

test('launchPace counts finished owner steps per week and forecasts only with a steady pace', () => {
  const now = T0;
  const none = launchPace(plan, {}, { now });
  assert.equal(none.reason, 'not-started');
  assert.equal(none.forecast, null);
  assert.equal(none.buckets.length, 8);
  const owner = [...index].filter(([, { step }]) => step.by === 'you' && !step.done);
  assert.equal(none.open, owner.length);
  assert.equal(none.openTests + none.otherOpen, none.open);
  assert.equal(none.minutesLeft, owner.reduce((n, [, { step }]) => n + (step.minutes || 0), 0));

  const keys = owner.map(([k]) => k);
  const records = {
    [keys[0]]: { result: 'pass', note: '', at: now - 1 * DAY },
    [keys[1]]: { result: 'skip', note: '', at: now - 9 * DAY },
    [keys[2]]: { result: 'pass', note: '', at: now - 20 * DAY },
    [keys[3]]: { result: 'pass', note: '', at: now - 40 * DAY },
    [keys[4]]: { result: 'fail', note: '', at: now - 2 * DAY },
  };
  const p = launchPace(plan, records, { now });
  assert.equal(p.finished, 4);
  assert.equal(p.last28, 3);
  assert.equal(p.perWeek, 0.8);
  assert.equal(p.failed, 1);
  assert.equal(p.open, owner.length - 4);
  assert.equal(p.buckets[7].count, 1, 'this week');
  assert.equal(p.buckets[6].count, 1);
  assert.equal(p.buckets.reduce((n, b) => n + b.count, 0), 4);
  assert.equal(p.lastAt, now - 1 * DAY);
  assert.equal(p.forecast.weeks, Math.ceil(p.open / 0.8));
  assert.equal(p.forecast.date.getTime(), now + p.forecast.weeks * WEEK);

  const slow = launchPace(plan, { [keys[3]]: { result: 'pass', note: '', at: now - 40 * DAY } }, { now });
  assert.equal(slow.reason, 'slow');
  assert.equal(slow.forecast, null);

  // Measured times change the minutes left for the tests that were measured.
  const test0 = owner.find(([, { step }]) => step.minutes);
  const mine = launchPace(plan, {}, { now, log: { [test0[0]]: [{ min: test0[1].step.minutes + 30, at: 1 }] } });
  assert.equal(mine.mineLeft, none.minutesLeft + 30);

  const all = Object.fromEntries(keys.map(k => [k, { result: 'skip', note: '', at: now - DAY }]));
  const done = launchPace(plan, all, { now });
  assert.equal(done.reason, 'done');
  assert.equal(done.open, 0);
});

test('the workspace wires timing and pace, and keeps them in this browser only', async () => {
  const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /from '\.\/test-timing\.js'/);
  assert.match(app, /localStorage\.getItem\(TIMING_KEY\)/);
  assert.match(app, /archiveSessionTimes\(\)/);
  assert.match(app, /function launchPaceBlock\(\)/);
  assert.match(app, /Copy estimates to correct/);
  assert.match(app, /Forget measured times/);
  assert.match(app, /Engineering and outside parties are not in this estimate/);
  const timing = await readFile(new URL('../wallet-src/test-timing.js', import.meta.url), 'utf8');
  assert.doesNotMatch(timing, /fetch\(|httpsCallable|localStorage/);
});
