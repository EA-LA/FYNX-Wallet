import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, search, resultLabel, countLine } from '../wallet-src/workspace-search.js';
import { cleanLog, startRollback, markStep, closeRollback } from '../wallet-src/rollback-log.js';
import { cleanDrill, startRun, answerStage, STAGES } from '../wallet-src/incident-drill.js';
import { SECTIONS } from '../wallet-src/section-guide.js';

const plan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const T0 = Date.UTC(2026, 10, 20, 9, 0);
const ok = r => { assert.equal(r.problem, null, r.problem); return r.log; };

function rollbacks() {
  let log = cleanLog(null, T0 + 3 * 3600000);
  log = ok(startRollback(log, { trigger: 'support', practice: true, note: 'Practice with Sam: two pilot users said the receive QR was blurry', at: T0, id: 'rb-practice1' }));
  log = ok(markStep(log, 'stop', { at: T0 + 60000, note: 'Switch off took 20 seconds on the iPad' }));
  for (const [i, id] of ['tell', 'freeze', 'site', 'server', 'reconcile', 'reopen'].entries()) log = ok(markStep(log, id, { at: T0 + (i + 2) * 60000 }));
  log = ok(closeRollback(log, { outcome: 'practice', at: T0 + 3600000 }));
  log = ok(startRollback(log, { trigger: 'reconcile', note: '', at: T0 + 2 * 3600000, id: 'rb-open00001' }));
  return log;
}

test('rollback notes are searched, with the record, its state and where it is', () => {
  const index = buildIndex({ plan, rollbacks: rollbacks() });
  const r = search(index, 'blurry');
  assert.equal(r.total, 1);
  const hit = r.results[0];
  assert.equal(hit.kind, 'record');
  assert.equal(hit.title, 'Practice rollback: Same complaint from two pilot users within a day');
  assert.equal(hit.where, 'Launch readiness · Rollback record');
  assert.equal(hit.stateText, 'Started 2026-11-20 · Practice finished');
  assert.deepEqual(hit.go, { type: 'part', tab: 'launch', target: '#rollback-log', part: 'rollback' });
  assert.match(hit.snippet, /blurry/);
  assert.match(resultLabel(hit), /^Your record: Practice rollback: .*Your notes: .*blurry/);
  assert.match(search(index, 'ipad seconds').results[0].snippet, /20 seconds on the iPad/, 'notes on a step are searched too');
  assert.equal(index.filter(e => e.id === 'rollback:rb-open00001').length, 0, 'a record with no notes adds nothing (the Rollback record part already finds it)');
});

test('practice-run follow-ups are searched; secret-looking text and empty runs are left out', () => {
  let run = startRun('export', 'Sam, Lee', T0);
  run = answerStage(run, STAGES[0].id, 'gap', 'Write down who may send the waitlist file');
  run = answerStage(run, STAGES[1].id, 'handled', '');
  const finished = { ...run, finishedAt: T0 + 1800000 };
  const open = answerStage(startRun('export', 'Sam', T0 + 86400000), STAGES[0].id, 'gap', 'abandon ability able about above absent absorb abstract absurd abuse access accident');
  const drill = cleanDrill({ current: open, history: [finished, { ...startRun('export', 'Lee', T0 - 86400000), finishedAt: T0 - 80000000 }] });
  const index = buildIndex({ plan, drill });
  const records = index.filter(e => e.kind === 'record');
  assert.equal(records.length, 1, 'only the finished run with a real follow-up is indexed');
  const r = search(index, 'waitlist file who');
  const hit = r.results.find(e => e.kind === 'record');
  assert.ok(hit, 'the follow-up finds its run');
  assert.equal(hit.title, 'Practice run: Waitlist file sent to the wrong person');
  assert.equal(hit.stateText, 'Started 2026-11-20 · Finished');
  assert.equal(hit.mineLabel, 'Your follow-ups');
  assert.deepEqual(hit.go, { type: 'part', tab: 'launch', target: '#launch-drill', part: 'drill' });
  assert.equal(search(index, 'absurd').total, 0, 'a follow-up that looks like a recovery phrase is never searched or shown');
});

test('bad stored data is ignored, and the page passes both logs in', () => {
  assert.doesNotThrow(() => buildIndex({ plan, rollbacks: { current: 'x', past: [null, 4, { id: 5 }] }, drill: { current: null, history: 'no' } }));
  assert.equal(buildIndex({ plan, rollbacks: 'nope', drill: 7 }).filter(e => e.kind === 'record').length, 0);
  for (const [tab, target] of [['launch', '#rollback-log'], ['launch', '#launch-drill']]) assert.ok(SECTIONS[tab].some(p => p.target === target), `${target} is a known part`);
  assert.match(app, /buildFindIndex\(\{ plan: launchPlan, records: launchRecords, decisionStates, decisionAnswers, walletNames, rollbacks: rollbackLog, drill \}\)/);
  assert.match(countLine({ query: 'zzz', total: 0, results: [] }), /rollback notes and practice-run follow-ups are searched too/);
});
