import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DRILL_STEP, MIN_PEOPLE, STAGES, SCENARIOS, findScenario, cleanDrill, startRun, answerStage, currentStage, runSummary, drillNote, drillRecord, finishRun, parsePeople, cleanFollowUp, minutesBetween } from '../wallet-src/incident-drill.js';
import { cleanRecords, stepState, reportMarkdown, parseReport } from '../wallet-src/launch-tracker.js';
import { findDecision } from '../wallet-src/owner-decisions.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const owner = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
const ops = await readFile(new URL('../docs/OPERATIONS.md', import.meta.url), 'utf8');
const phrase = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
const T0 = Date.UTC(2026, 10, 6, 18, 0);

function fullRun({ people = 'Elham, co-founder', gaps = {} } = {}) {
  let run = startRun('account', people, T0);
  for (const s of STAGES) run = answerStage(run, s.id, gaps[s.id] ? 'gap' : 'handled', gaps[s.id] || '');
  return run;
}

test('the drill records the open owner practice-run step and follows the written procedure', () => {
  const gate = plan.items.find(g => g.id === 'operations'), step = gate.steps.find(s => s.id === 'drill');
  assert.equal(DRILL_STEP, 'operations/drill');
  assert.equal(step.by, 'you');
  assert.equal(findDecision(DRILL_STEP), null, 'not also a decision');
  assert.match(ops, /## Incident response/);
  const numbered = ops.split('## Incident response')[1].split('\n## ')[0].match(/^\d+\./gm);
  assert.equal(numbered.length, STAGES.length, 'one stage per numbered procedure step');
  for (const sc of SCENARIOS) {
    assert.ok(sc.story.length > 40);
    for (const s of STAGES) assert.ok(sc.prompts[s.id], `${sc.id} has a question for ${s.id}`);
  }
  assert.match(owner, /id="launch-drill"/);
  assert.match(owner, /docs\/OPERATIONS\.md#incident-response/);
  assert.match(owner, /docs\/BACKUP-RESTORE\.md/);
});

test('people are parsed, de-duplicated and secret-looking text is refused', () => {
  assert.deepEqual(parsePeople(' Elham ,co-founder; elham\nSupport '), ['Elham', 'co-founder', 'Support']);
  assert.deepEqual(parsePeople(phrase), []);
  assert.deepEqual(parsePeople('<b>Bob</b>'), ['bBob/b']);
  assert.equal(parsePeople(Array.from({ length: 30 }, (_, i) => `p${i}`).join(',')).length, 12);
  assert.equal(cleanFollowUp(phrase), '');
  assert.equal(cleanFollowUp('x'.repeat(500)).length, 140);
});

test('stages are discussed in order; a run counts only when finished, with two people and follow-ups for gaps', () => {
  let run = startRun('outage', 'Elham', T0);
  assert.equal(startRun('nope', 'a, b'), null);
  assert.equal(currentStage(run).id, 'record');
  run = answerStage(run, 'record', 'handled');
  assert.equal(currentStage(run).id, 'contain');
  assert.equal(answerStage(run, 'contain', 'maybe'), run, 'unknown result ignored');
  let s = runSummary(run, T0 + 5 * 60000);
  assert.equal(s.answered, 1); assert.equal(s.minutes, 5); assert.equal(s.canRecord, false);
  assert.ok(s.reasons.some(r => /6 of 7 stages/.test(r)));
  assert.ok(s.reasons.some(r => /at least 2 people/.test(r)));

  const solo = fullRun({ people: 'Elham' });
  assert.equal(runSummary(solo, T0).canRecord, false);
  const gapNoNote = answerStage(fullRun(), 'notify', 'gap', '');
  assert.ok(runSummary(gapNoNote, T0).reasons.some(r => /follow-up for every gap/.test(r)));
  const good = fullRun({ gaps: { accounts: 'Keep a second passkey in the safe', notify: 'Ask counsel for a notice template' } });
  s = runSummary(good, T0 + 31 * 60000);
  assert.equal(s.canRecord, true); assert.equal(s.handled, 5); assert.equal(s.gaps.length, 2); assert.equal(s.minutes, 31);
  assert.equal(MIN_PEOPLE, 2);
});

test('the note fits the checklist, survives cleaning and travels in the test report', () => {
  const run = fullRun({ gaps: { accounts: 'Keep a second passkey in the safe', notify: 'x'.repeat(140), retest: 'y'.repeat(140) } });
  const note = drillNote(run, T0 + 30 * 60000);
  assert.ok(note.length <= 280);
  assert.match(note, /^Practice run: Strange sign-in to the owner account; 2 people; 30 min; 4\/7 stages handled\. Follow-ups: Keep a second passkey/);
  assert.match(drillNote(fullRun(), T0 + 60000), /No gaps found\.$/);
  const records = cleanRecords({ [DRILL_STEP]: { result: 'pass', note, at: T0 } }, plan);
  assert.equal(records[DRILL_STEP].note, note);
  const gate = plan.items.find(g => g.id === 'operations');
  assert.equal(stepState(gate, gate.steps.find(s => s.id === 'drill'), records), 'done');
  const back = parseReport(reportMarkdown(plan, records, { date: new Date(T0) }), plan);
  assert.equal(back.records[DRILL_STEP].result, 'pass');
});

test('finished runs move to a five-run history; stored data is cleaned', () => {
  let drill = { current: fullRun(), history: [] };
  drill = finishRun(drill, T0 + 20 * 60000);
  assert.equal(drill.current, null); assert.equal(drill.history.length, 1); assert.equal(drill.history[0].finishedAt, T0 + 20 * 60000);
  for (let i = 0; i < 7; i++) drill = finishRun({ ...drill, current: fullRun() }, T0 + i);
  assert.equal(drill.history.length, 5);
  const stored = cleanDrill(JSON.parse(JSON.stringify(drill)));
  assert.equal(stored.history.length, 5);
  const messy = cleanDrill({ current: { scenario: 'account', people: ['a', phrase], startedAt: T0, answers: { record: { result: 'handled', followUp: phrase }, contain: { result: 'bad' }, bogus: { result: 'gap' } } }, history: [{ scenario: 'x' }, 'no'] });
  assert.deepEqual(messy.current.people, ['a']);
  assert.deepEqual(Object.keys(messy.current.answers), ['record']);
  assert.equal(messy.current.answers.record.followUp, '');
  assert.deepEqual(messy.history, []);
  assert.deepEqual(cleanDrill('nonsense'), { current: null, history: [] });
  assert.deepEqual(cleanDrill([]), { current: null, history: [] });
  assert.equal(minutesBetween(T0, T0 + 1000), 1);
  assert.equal(minutesBetween(0, T0), 0);
});

test('the record is a readable markdown table with only what the owner typed', () => {
  const run = finishRun({ current: fullRun({ gaps: { contain: 'Write down how to deploy the deny-all handler' } }), history: [] }, T0 + 25 * 60000).history[0];
  const text = drillRecord(plan, run, T0 + 25 * 60000);
  assert.match(text, /^# FYNX Wallet incident practice run/);
  assert.match(text, /Scenario: Strange sign-in to the owner account/);
  assert.match(text, /2026-11-06 18:00 UTC · finished 2026-11-06 18:25 UTC · 25 min/);
  assert.match(text, /People: Elham, co-founder/);
  assert.match(text, /\| Contain only what is affected \| Gap found \| Write down how to deploy the deny-all handler \|/);
  assert.match(text, /not a real incident/);
  assert.equal(text.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| Stage') && !l.startsWith('| ---')).length, STAGES.length);
  assert.ok(findScenario('export'));
});
