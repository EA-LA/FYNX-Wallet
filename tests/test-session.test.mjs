import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stepIndex, stepKey } from '../wallet-src/launch-tracker.js';
import { DECISIONS, decisionKey } from '../wallet-src/owner-decisions.js';
import { NEEDS, sessionable, checkSessionFields, planSession, cleanSession, startSession, sessionProgress, planMarkdown, sessionSummary } from '../wallet-src/test-session.js';
import { missingAfterAnswer } from '../wallet-src/outside-evidence.js';
import { outsideBrief } from '../wallet-src/outside-handoff.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const index = stepIndex(plan);
const all = Object.keys(NEEDS);

test('every open owner test has a time estimate; only decisions and sign-offs do not', () => {
  assert.deepEqual(checkSessionFields(plan), []);
  const decisions = new Set(DECISIONS.map(decisionKey));
  const without = [...index].filter(([, { step }]) => step.by === 'you' && !step.done && !sessionable(step)).map(([k]) => k).filter(k => !decisions.has(k)).sort();
  // Sign-offs and paperwork that are not done in one sitting. Add a "minutes" estimate to any new test.
  assert.deepEqual(without, ['legal/registrations', 'pilot/approve', 'public-accounts/approve-open']);
  for (const k of decisions) assert.equal(sessionable(index.get(k).step), false, `${k} is a decision, not a session test`);
});

test('checkSessionFields refuses bad minutes and unknown needs', () => {
  const bad = { items: [{ id: 'g', steps: [
    { id: 'a', by: 'you', text: 'x', done: false, minutes: 0 },
    { id: 'b', by: 'engineering', text: 'x', done: false, minutes: 5 },
    { id: 'c', by: 'you', text: 'x', done: false, minutes: 5, needs: ['jetpack'] },
    { id: 'd', by: 'you', text: 'x', done: false, needs: ['phone'] },
    { id: 'e', by: 'you', text: 'x', done: false, minutes: 5, needs: ['phone', 'phone'] },
    { id: 'f', by: 'you', text: 'x', done: false, minutes: 2.5 },
  ] }] };
  const errs = checkSessionFields(bad);
  assert.equal(errs.length, 6);
  assert.match(errs.join('\n'), /g\/a: "minutes"/);
  assert.match(errs.join('\n'), /g\/c: "needs"/);
});

test('planSession keeps the checklist order inside the session and fits the time', () => {
  const p = planSession(plan, {}, { minutes: 30, have: [] });
  assert.ok(p.total <= 30 && p.steps.length > 0);
  assert.equal(p.left, 30 - p.total);
  const keys = p.steps.map(s => s.key);
  // Nothing needing a phone, wallet or inbox without them.
  assert.ok(p.steps.every(s => s.needs.length === 0));
  assert.ok(!keys.includes('website/join-phone') && p.gear.some(g => g.key === 'website/join-phone' && g.missing.includes('phone')));
  // Passkey: add comes before sign-in with it; both can be in one session.
  assert.ok(keys.includes('identity/passkey-add') && keys.includes('identity/passkey-signin'));
  assert.ok(keys.indexOf('identity/passkey-add') < keys.indexOf('identity/passkey-signin'));
  // Every step in the plan waits only on done steps or steps earlier in the plan.
  for (const s of p.steps) for (const ref of s.step.after || []) {
    const dep = index.get(ref);
    assert.ok(dep.step.done || keys.indexOf(ref) > -1 && keys.indexOf(ref) < keys.indexOf(s.key), `${s.key} after ${ref}`);
  }
  // The find-remove test waits on the phone sign-up, which is left out.
  assert.ok(p.waiting.some(w => w.key === 'website/find-remove'));
  assert.ok(p.elsewhere >= 12);
});

test('planSession puts failed tests first and skips recorded ones', () => {
  const records = { 'identity/google-desktop': { result: 'pass', note: '', at: 1 }, 'releases/check-run': { result: 'fail', note: '', at: 2 } };
  const p = planSession(plan, records, { minutes: 15, have: [] });
  assert.equal(p.steps[0].key, 'releases/check-run');
  assert.equal(p.steps[0].retest, true);
  assert.ok(!p.steps.some(s => s.key === 'identity/google-desktop'));
});

test('planSession with everything at hand and a long session uses the time but never over', () => {
  const p = planSession(plan, {}, { minutes: 90, have: all });
  assert.ok(p.total <= 90 && p.total > 60, String(p.total));
  assert.equal(p.gear.length, 0);
  const zero = planSession(plan, {}, { minutes: 0, have: all });
  assert.equal(zero.steps.length, 0);
  assert.ok(zero.noTime.length > 0);
  const huge = planSession(plan, {}, { minutes: 99999, have: all });
  assert.equal(huge.minutes, 240);
});

test('a dependency left out for time keeps its dependants out too', () => {
  const tiny = { items: [{ id: 'g', steps: [
    { id: 'big', by: 'you', text: 'Big', done: false, minutes: 20 },
    { id: 'small', by: 'you', text: 'Small', done: false, minutes: 2, after: ['g/big'] },
    { id: 'other', by: 'you', text: 'Other', done: false, minutes: 3 },
  ] }] };
  const p = planSession(tiny, {}, { minutes: 10 });
  assert.deepEqual(p.steps.map(s => s.key), ['g/other']);
  assert.deepEqual(p.noTime.map(s => s.key), ['g/big']);
  assert.deepEqual(p.waiting.map(s => s.key), ['g/small']);
});

test('session progress counts results saved after the start only, and finds the current test', () => {
  const records = { 'releases/check-run': { result: 'fail', note: '', at: 50 } };
  const planned = planSession(plan, records, { minutes: 15 });
  const s = startSession(planned, { minutes: 15, have: [], now: 100 });
  assert.equal(s.keys[0], 'releases/check-run');
  let p = sessionProgress(s, plan, records);
  assert.equal(p.recorded, 0);
  assert.equal(p.current.key, 'releases/check-run');
  assert.equal(p.minutesLeft, planned.total);
  const r2 = { ...records, 'releases/check-run': { result: 'pass', note: '', at: 150 }, [s.keys[1]]: { result: 'fail', note: 'n', at: 160 } };
  p = sessionProgress(s, plan, r2);
  assert.equal(p.recorded, 2); assert.equal(p.passed, 1); assert.equal(p.failed, 1);
  assert.equal(p.current.key, s.keys[2] || undefined);
  const done = Object.fromEntries(s.keys.map(k => [k, { result: 'skip', note: '', at: 200 }]));
  p = sessionProgress(s, plan, done);
  assert.equal(p.complete, true); assert.equal(p.current, null); assert.equal(p.minutesLeft, 0);
});

test('cleanSession drops unknown keys and bad values, round-trips a real session', () => {
  const planned = planSession(plan, {}, { minutes: 30 });
  const s = startSession(planned, { minutes: 30, have: ['phone'], now: 1000 });
  assert.deepEqual(cleanSession(JSON.parse(JSON.stringify(s)), plan), s);
  assert.equal(cleanSession(null, plan), null);
  assert.equal(cleanSession({ keys: ['nope/x', 'legal/counsel'], started: 1 }, plan), null);
  const c = cleanSession({ keys: ['identity/idle', 'identity/idle', 'nope/x'], started: 5, minutes: 999, have: ['phone', 'jetpack'], finished: 1 }, plan);
  assert.deepEqual(c, { keys: ['identity/idle'], minutes: 30, have: ['phone'], started: 5, finished: 0, mine: false });
});

test('plan and summary texts carry results only, no notes', () => {
  const planned = planSession(plan, {}, { minutes: 15, have: ['phone'] });
  const md = planMarkdown(planned, { have: ['phone'], date: new Date('2026-11-10T08:00:00Z') });
  assert.match(md, /# FYNX Wallet: test session plan/);
  assert.match(md, /Time: 15 minutes\. With you: phone or iPad\./);
  assert.match(md, /^1\. \[ \] /m);
  const s = startSession(planned, { minutes: 15, have: ['phone'], now: Date.parse('2026-11-10T08:00:00Z') });
  const records = { [s.keys[0]]: { result: 'pass', note: 'secret-ish note text', at: Date.parse('2026-11-10T08:05:00Z') } };
  const sum = sessionSummary(s, plan, records, { date: new Date('2026-11-10T08:20:00Z') });
  assert.match(sum, /Recorded 1 of \d+: 1 passed, 0 failed, 0 not applicable\./);
  assert.match(sum, /^- Passed: /m);
  assert.match(sum, /^- Not recorded: /m);
  assert.doesNotMatch(sum, /secret-ish/);
  assert.match(planMarkdown(planSession(plan, {}, { minutes: 0 })), /Nothing fits this session/);
});

test('the workspace wires the planner: container, render, storage key, next-steps entry', async () => {
  const html = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(html, /<section id="test-session"/);
  assert.match(app, /renderLaunchOrder\(\); renderTestSession\(\);/);
  assert.match(app, /localStorage\.getItem\(SESSION_KEY\)/);
  assert.match(app, /Test session · \$\{run\.recorded\} of \$\{run\.total\} recorded/);
  const md = await readFile(new URL('../docs/LAUNCH-CHECKLIST.md', import.meta.url), 'utf8');
  assert.match(md, /_\(about 5 min; needs: phone or iPad\)_/);
});

// ---- Ask again: counted from the last piece that arrived when that is later than the answer ----
const terms = 'counsel|legal/terms';
test('missingAfterAnswer counts from the last arrival when it came after the answer', () => {
  const req = { sent: '2026-10-01', answered: '2026-10-20' };
  const entry = { got: ['terms'], on: { terms: '2026-10-28' }, changed: 1 };
  const early = missingAfterAnswer(terms, req, entry, '2026-11-05');
  assert.equal(early.due, false);
  assert.equal(early.days, 8);
  assert.equal(early.askOn, '2026-11-11');
  assert.equal(early.lastArrived, '2026-10-28');
  assert.match(early.label, /since the last piece arrived on 2026-10-28 · ask again from 2026-11-11/);
  const due = missingAfterAnswer(terms, req, entry, '2026-11-11');
  assert.equal(due.due, true);
  assert.match(due.label, /14 days after the last piece arrived on 2026-10-28: ask again/);
  // Arrived before the answer, undated, or dated after today: counted from the answer.
  assert.equal(missingAfterAnswer(terms, req, { got: ['terms'], on: { terms: '2026-10-10' }, changed: 1 }, '2026-11-05').countedFrom, '2026-10-20');
  assert.equal(missingAfterAnswer(terms, req, { got: ['terms'], changed: 1 }, '2026-11-05').lastArrived, '');
  assert.equal(missingAfterAnswer(terms, req, { got: ['terms'], on: { terms: '2026-11-08' }, changed: 1 }, '2026-11-05').countedFrom, '2026-10-20');
});

test('the copied hand-off reminder counts from the last arrival too', () => {
  const key = 'legal/analysis';
  const ev = { state: 'partial', received: [{ id: 'terms', label: 'Terms' }], missing: [{ id: 'privacy-notice', label: 'Privacy notice' }], lastReceived: '2026-10-28' };
  const sent = { [key]: { sent: '2026-10-01', answered: '2026-10-20' } };
  const records = Object.fromEntries(['legal/counsel', 'legal/entity', 'legal/model'].map(k => [k, { result: 'pass', note: '', at: 1 }]));
  const soon = outsideBrief(plan, records, 'counsel', {}, { date: new Date('2026-11-05T10:00:00Z'), sent, evidence: { [key]: ev } });
  assert.match(soon, /These are the points still needed/);
  assert.doesNotMatch(soon, /Reminder: \d+ days later/);
  const late = outsideBrief(plan, records, 'counsel', {}, { date: new Date('2026-11-12T10:00:00Z'), sent, evidence: { [key]: ev } });
  assert.match(late, /as is what you sent up to 2026-10-28\. Reminder: 15 days later/);
});
