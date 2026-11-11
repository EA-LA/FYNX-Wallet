import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkDoneDates, weekOf, historyEntries, launchHistory, historyHeadline, historyMarkdown, checklistDoneIn, validDate, weekTitle } from '../wallet-src/launch-history.js';
import { overview } from '../wallet-src/launch-tracker.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const TODAY = '2026-11-11';
const T = s => Date.parse(`${s}Z`);

// A small plan so the numbers are exact.
const mini = {
  started: '2026-11-05',
  items: [
    { id: 'a', title: 'Gate A', steps: [
      { id: 'one', by: 'engineering', text: 'Engineering thing one.', done: true, doneOn: '2026-11-05' },
      { id: 'two', by: 'engineering', text: 'Engineering thing two.', done: true, doneOn: '2026-11-10' },
      { id: 'mine', by: 'you', text: 'Owner test one.', done: false },
      { id: 'mine2', by: 'you', text: 'Owner test two.', done: false },
    ] },
    { id: 'b', title: 'Gate B', steps: [
      { id: 'law', by: 'outside', text: 'Lawyer memo.', done: true, doneOn: '2026-11-02' },
      { id: 'mine3', by: 'you', text: 'Owner test three.', done: false },
      { id: 'open', by: 'engineering', text: 'Still open.', done: false },
    ] },
  ],
};
const records = {
  'a/mine': { result: 'pass', note: 'private note 123', at: T('2026-11-09T10:00:00') },
  'a/mine2': { result: 'skip', note: '', at: 0 },
  'b/mine3': { result: 'fail', note: 'broke', at: T('2026-11-10T10:00:00') },
};

test('the real checklist: every done step has a valid date, open steps have none', () => {
  assert.deepEqual(checkDoneDates(plan, TODAY), []);
  assert.ok(validDate(plan.started));
  for (const g of plan.items) for (const s of g.steps) if (s.done) assert.ok(s.doneOn >= plan.started && s.doneOn <= TODAY, `${g.id}/${s.id}`);
});

test('done-date check refuses missing, impossible, early, future and stray dates', () => {
  const p = structuredClone(mini);
  p.items[0].steps[0].doneOn = '2026-02-30';
  delete p.items[0].steps[1].doneOn;
  p.items[0].steps[2].doneOn = '2026-11-01';
  p.items[1].steps[0].doneOn = '2026-12-01';
  const errors = checkDoneDates(p, TODAY).join('\n');
  assert.match(errors, /a\/one: a done step needs "doneOn"/);
  assert.match(errors, /a\/two: a done step needs "doneOn"/);
  assert.match(errors, /a\/mine: an open step must not have "doneOn"/);
  assert.match(errors, /b\/law: "doneOn" 2026-12-01 is in the future/);
  const q = structuredClone(mini); q.items[0].steps[0].doneOn = '2026-11-01';
  assert.match(checkDoneDates(q, TODAY).join('\n'), /before the checklist started/);
  assert.match(checkDoneDates({ items: [] }, TODAY).join('\n'), /needs "started"/);
});

test('weeks start on Monday (UTC)', () => {
  assert.equal(weekOf('2026-11-11'), '2026-11-09');
  assert.equal(weekOf('2026-11-09'), '2026-11-09');
  assert.equal(weekOf('2026-11-08'), '2026-11-02');
  assert.equal(weekOf('2027-01-01'), '2026-12-28');
  assert.equal(weekTitle('2026-11-09'), 'Week of 9 Nov 2026');
});

test('entries come from the checklist and from passed / not applicable results only', () => {
  const e = historyEntries(mini, records);
  assert.deepEqual(e.map(x => x.key), ['a/two', 'a/mine', 'a/one', 'b/law', 'a/mine2']);
  assert.equal(e.find(x => x.key === 'a/one').baseline, true, 'done on the start day is the starting point');
  assert.equal(e.find(x => x.key === 'b/law').baseline, true, 'done before the start day too');
  assert.equal(e.find(x => x.key === 'a/two').baseline, false);
  assert.equal(e.find(x => x.key === 'a/mine').date, '2026-11-09');
  assert.equal(e.find(x => x.key === 'a/mine2').date, '', 'no time recorded: undated');
  assert.ok(!e.some(x => x.key === 'b/mine3'), 'failed results are not finished');
  // Total matches the launch overview.
  assert.equal(historyEntries(plan, {}).length, overview(plan, {}).done);
});

test('history groups by week, filters by who and keeps a running total', () => {
  const h = launchHistory(mini, records, { today: TODAY, weeks: 3 });
  assert.equal(h.total, 7);
  assert.equal(h.done, 5);
  assert.deepEqual(h.counts, { all: 5, you: 2, engineering: 2, outside: 1 });
  assert.deepEqual(h.weeks.map(w => [w.week, w.entries.map(x => x.key)]), [['2026-11-09', ['a/two', 'a/mine']]]);
  assert.deepEqual(h.weeks[0].by, { you: 1, engineering: 1, outside: 0 });
  assert.deepEqual(h.baseline.map(x => x.key), ['a/one', 'b/law']);
  assert.deepEqual(h.undated.map(x => x.key), ['a/mine2']);
  assert.equal(h.startDone, 2);
  assert.equal(h.progress, 2);
  // No bars for weeks before the checklist started (the week of 26 Oct ends before 5 Nov).
  assert.deepEqual(h.running.map(r => [r.week, r.done, r.added, r.current]), [['2026-11-02', 3, 0, false], ['2026-11-09', 5, 2, true]]);
  assert.equal(h.running[1].percent, 71);
  const mine = launchHistory(mini, records, { who: 'you', today: TODAY });
  assert.equal(mine.shown, 2);
  assert.deepEqual(mine.weeks[0].entries.map(x => x.key), ['a/mine']);
  assert.equal(mine.baseline.length, 0);
  assert.equal(launchHistory(mini, records, { who: 'nobody', today: TODAY }).who, 'all');
  const later = launchHistory(mini, records, { today: '2027-03-01' }).running;
  assert.equal(later.length, 8, 'at most 8 weeks');
  assert.equal(later[7].week, '2027-03-01');
});

test('headline and markdown: fixed words and dates only, honest about the starting point', () => {
  const h = launchHistory(mini, records, { today: TODAY, weeks: 2 });
  assert.equal(historyHeadline(h), '5 of 7 launch steps finished (71%): 2 were already done when the checklist started on 5 Nov 2026, 2 finished since; 2 this week.');
  const text = historyMarkdown(h, { generated: new Date(T('2026-11-11T12:00:00')) });
  assert.match(text, /^# FYNX Wallet launch history/);
  assert.match(text, /## Week of 9 Nov 2026 \(2 steps\)/);
  assert.match(text, /- 2026-11-10 · Engineering · Gate A: Engineering thing two$/m);
  assert.match(text, /- 2026-11-09 · You · Gate A: Owner test one$/m);
  assert.match(text, /## Already done when the checklist started \(2026-11-05\)/);
  assert.match(text, /- Outside party · Gate B: Lawyer memo$/m);
  assert.match(text, /## Finished, date not recorded/);
  assert.match(text, /- Week of 9 Nov 2026: 5 of 7 \(71%\), 2 added \(this week so far\)/);
  assert.ok(!text.includes('private note') && !text.includes('broke'));
  assert.match(text, /not launched/);
  const none = launchHistory({ started: '2026-11-05', items: [{ id: 'x', title: 'X', steps: [{ id: 'y', by: 'you', text: 'Y.', done: false }] }] }, {}, { today: TODAY });
  assert.equal(historyHeadline(none), 'Nothing finished yet: 0 of 1 launch steps.');
  assert.match(historyMarkdown(none), /Nothing finished yet for this selection/);
});

test('checklistDoneIn picks steps recorded done in the period, never the starting point', () => {
  assert.deepEqual(checklistDoneIn(mini, { today: TODAY, days: 7 }).map(e => e.key), ['a/two']);
  assert.deepEqual(checklistDoneIn(mini, { today: '2026-11-09', days: 7 }).map(e => e.key), []);
  assert.deepEqual(checklistDoneIn(mini, { today: 'bad', days: 7 }), []);
});

test('the workspace has the panel and wires it', async () => {
  const html = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
  assert.match(html, /<section id="launch-history" class="launch-order launch-history" aria-label="What’s been finished"><\/section>/);
  const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /renderLaunchHistory\(\);/);
  assert.match(app, /fynx-launch-history-/);
  const md = await readFile(new URL('../docs/LAUNCH-CHECKLIST.md', import.meta.url), 'utf8');
  assert.match(md, /_\(done 2026-11-0\d\)_/);
});
