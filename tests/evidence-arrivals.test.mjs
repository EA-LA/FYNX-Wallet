import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evidenceArrivals, arrivalLine, arrivalNext, cleanEvidence } from '../wallet-src/outside-evidence.js';
import { launchHistory, historyMarkdown, weekCount } from '../wallet-src/launch-history.js';

// A small checklist: the lawyer's analysis unlocks the terms step and the country review.
const plan = {
  product: 'FYNX Wallet', started: '2026-11-05',
  items: [
    { id: 'legal', title: 'Legal', steps: [
      { id: 'analysis', by: 'outside', text: 'Written legal analysis from U.S. counsel.' },
      { id: 'terms', by: 'outside', text: 'Approved customer terms.', after: ['legal/analysis'] },
      { id: 'own', by: 'you', text: 'Read the memo.', after: ['legal/analysis'], done: true, doneOn: '2026-11-06' },
    ] },
    { id: 'fiat', title: 'Payments', steps: [{ id: 'allowlist', by: 'outside', text: 'Provider allowlists the backend.' }] },
  ],
};
const log = cleanEvidence({ entries: {
  'counsel|legal/analysis': { got: ['memo', 'licences', 'aml'], changed: 1, on: { memo: '2026-11-03', licences: '2026-11-03', aml: '2026-11-10' } },
  'provider|fiat/allowlist': { got: ['confirmed', 'date'], changed: 1, on: { confirmed: '2026-11-11' } },
  'counsel|nonsense': { got: ['memo'], changed: 1 },
} });

test('evidence arrivals: one entry per request and day, newest first, undated pieces counted apart', () => {
  const { arrivals, undated } = evidenceArrivals(plan, log, {});
  assert.deepEqual(arrivals.map(a => [a.date, a.partyId, a.step, a.pieces.length]), [
    ['2026-11-11', 'provider', 'fiat/allowlist', 1],
    ['2026-11-10', 'counsel', 'legal/analysis', 1],
    ['2026-11-03', 'counsel', 'legal/analysis', 2],
  ]);
  assert.deepEqual(undated.map(u => [u.id, u.count]), [['provider|fiat/allowlist', 1]]);
  const lawyer = arrivals[2];
  assert.equal(lawyer.total, 5);
  assert.equal(lawyer.stepDone, false);
  assert.deepEqual(lawyer.unlocks.map(u => [u.key, u.done]), [['legal/terms', false], ['legal/own', true]]);
});

test('evidence arrivals: plain lines say what came and what it unlocks', () => {
  const [, , lawyer] = evidenceArrivals(plan, log, {}).arrivals;
  assert.match(arrivalLine(lawyer), /^Lawyer \(U\.S\. counsel\) sent 2 of 5 pieces for “Written legal analysis from U\.S\. counsel\.?”: written memo/);
  const next = arrivalNext(lawyer);
  assert.match(next, /stays open until every piece is in/);
  assert.match(next, /this step can start: “Approved customer terms\.?”/);
  assert.doesNotMatch(next, /Read the memo/, 'steps already done are not listed as unlocked');
  // Complete evidence and a step recorded done read differently.
  assert.match(arrivalNext({ ...lawyer, complete: true }), /share the documents/);
  assert.match(arrivalNext({ ...lawyer, stepDone: true, unlocks: [] }), /^That step is recorded done\.$/);
  assert.match(arrivalNext({ ...lawyer, unlocks: [{ key: 'x', text: 'X', done: true }] }), /already done/);
  // The owner's own test result counts as done for the dependants.
  const [, , again] = evidenceArrivals(plan, log, { 'legal/terms': { result: 'pass', at: 1 } }).arrivals;
  assert.equal(again.unlocks.find(u => u.key === 'legal/terms').done, false, 'an outside step is done only in the checklist');
});

test('launch history: arrivals sit in their week for Everyone and Outside, never change the counts', () => {
  const { arrivals } = evidenceArrivals(plan, log, {});
  const without = launchHistory(plan, {}, { today: '2026-11-12' });
  const withEv = launchHistory(plan, {}, { today: '2026-11-12', arrivals });
  assert.equal(withEv.done, without.done);
  assert.deepEqual(withEv.running, without.running);
  assert.equal(withEv.arrivals, 3);
  const week = withEv.weeks.find(w => w.week === '2026-11-09');
  assert.equal(week.entries.length, 0);
  assert.equal(week.arrivals.length, 2);
  assert.equal(weekCount(week), '2 evidence arrivals');
  const early = withEv.weeks.find(w => w.week === '2026-11-02');
  assert.equal(early.arrivals.length, 1, 'before the checklist started still shows when evidence came');
  const mixed = withEv.weeks.find(w => w.week === '2026-11-02');
  assert.equal(weekCount({ ...mixed, entries: [{}] }), '1 step, 1 evidence arrival');
  assert.equal(weekCount({ entries: [], arrivals: [] }), '0 steps');
  assert.equal(launchHistory(plan, {}, { today: '2026-11-12', arrivals, who: 'outside' }).arrivals, 3);
  for (const who of ['you', 'engineering']) {
    const h = launchHistory(plan, {}, { today: '2026-11-12', arrivals, who });
    assert.equal(h.arrivals, 0);
    assert.ok(h.weeks.every(w => w.arrivals.length === 0));
  }
  assert.equal(launchHistory(plan, {}, { today: '2026-11-12', arrivals: [{ date: 'soon' }] }).arrivals, 0, 'bad dates are dropped');
});

test('launch history markdown lists evidence per week with what it unlocks', () => {
  const { arrivals } = evidenceArrivals(plan, log, {});
  const text = historyMarkdown(launchHistory(plan, {}, { today: '2026-11-12', arrivals }), { generated: new Date('2026-11-12T06:00:00Z') });
  assert.match(text, /## Week of 9 Nov 2026 \(2 evidence arrivals\)/);
  assert.match(text, /Evidence that arrived:/);
  assert.match(text, /- 2026-11-03 · Lawyer \(U\.S\. counsel\) · for “Written legal analysis[^”]*”: 2 of 5 \(Written memo.*\); then unlocks “Approved customer terms\.?”/);
  assert.match(text, /evidence alone does not mark a step done/);
});

test('owner page wires evidence arrivals into What’s been finished', () => {
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /arrivals: evidenceArrivals\(launchPlan, outsideEvidence, launchRecords\)\.arrivals/);
  assert.match(app, /for \(const a of w\.arrivals\) list\.append\(arrivalRow\(a\)\)/);
  assert.match(app, /openOutsideRequest\(a\.partyId, a\.step, true\)/);
});
