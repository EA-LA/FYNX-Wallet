import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reportMarkdown, parseReport } from '../wallet-src/launch-tracker.js';
import { decisionReportLines, cleanAnswers } from '../wallet-src/owner-decisions.js';
import { cleanLog, addRequest, answerRequest, reopenRequest, privacyReportLines, parsePrivacyReport, mergePrivacyLogs, PRIVACY_SECTION } from '../wallet-src/privacy-requests.js';
import { STAGES, startRun, answerStage, finishRun, setFollowUpDone, followUpProgress, cleanDrill, drillReportLines, parseDrillReport, mergeDrills, DRILL_SECTION } from '../wallet-src/incident-drill.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const owner = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
const phrase = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
const H = 3600000, T = Date.UTC(2026, 10, 7, 9, 30);
const today = '2026-11-07';

function sampleLog() {
  let log = { entries: [] };
  log = addRequest(log, { received: '2026-10-01', type: 'delete', ref: 'Ticket 41', note: 'Asked twice' }, { today, now: T - 900 * H, id: 'pr-a' }).log;
  log = addRequest(log, { received: '2026-11-02', type: 'access', ref: 'Subject: my data' }, { today, now: T - 100 * H, id: 'pr-b' }).log;
  log = answerRequest(log, 'pr-a', { answered: '2026-10-20', outcome: 'removed', now: T - 400 * H }).log;
  return log;
}
function sampleDrill(finish = T - 20 * H, scenario = 'account') {
  let run = startRun(scenario, 'Elham, co-founder_x; support', finish - 35 * 60000);
  for (const s of STAGES) run = answerStage(run, s.id, s.id === 'contain' || s.id === 'notify' ? 'gap' : 'handled', s.id === 'contain' ? 'Write a *night* checklist | v2' : s.id === 'notify' ? 'Ask counsel which states need notice' : '');
  return finishRun({ current: run, history: [] }, finish);
}

test('privacy requests: dates, types and answers survive the report; references and notes never leave the browser', () => {
  const log = sampleLog();
  const report = reportMarkdown(plan, {}, { date: new Date(T), appendix: privacyReportLines(log) });
  assert.match(report, new RegExp(`## ${PRIVACY_SECTION}`));
  assert.match(report, /- pr-a · arrived 2026-10-01 · Asked to be removed · answered 2026-10-20 \(Removed and confirmed\) · changed \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
  assert.match(report, /- pr-b · arrived 2026-11-02 · Asked what we hold · open/);
  assert.doesNotMatch(report, /Ticket 41|Asked twice|my data|@/);
  assert.equal(parseReport(report, plan).secret, false);
  const back = parsePrivacyReport(report).log;
  assert.equal(back.entries.length, 2);
  const a = back.entries.find(e => e.id === 'pr-a');
  assert.deepEqual({ received: a.received, type: a.type, answered: a.answered, outcome: a.outcome, ref: a.ref, note: a.note }, { received: '2026-10-01', type: 'delete', answered: '2026-10-20', outcome: 'removed', ref: '', note: '' });
  assert.equal(parsePrivacyReport(reportMarkdown(plan, {}, { date: new Date(T) })).log.entries.length, 0);
  assert.deepEqual(privacyReportLines({ entries: [] }), []);
});

test('privacy requests merge: new added, later change wins, this browser keeps its reference and note', () => {
  const phone = sampleLog();
  // Computer has only pr-b, then answers it later than the phone's state; phone has pr-a that is new to the computer.
  let computer = { entries: [phone.entries.find(e => e.id === 'pr-b')] };
  computer = answerRequest(computer, 'pr-b', { answered: '2026-11-06', outcome: 'replied', now: T }).log;
  const fromComputer = parsePrivacyReport(reportMarkdown(plan, {}, { appendix: privacyReportLines(computer) })).log;
  const m = mergePrivacyLogs(phone, fromComputer);
  assert.deepEqual(m.updated, ['pr-b']); assert.deepEqual(m.added, []);
  const b = m.log.entries.find(e => e.id === 'pr-b');
  assert.equal(b.answered, '2026-11-06'); assert.equal(b.ref, 'Subject: my data');
  const back = mergePrivacyLogs(computer, parsePrivacyReport(reportMarkdown(plan, {}, { appendix: privacyReportLines(phone) })).log);
  assert.deepEqual(back.added, ['pr-a']); assert.deepEqual(back.kept, ['pr-b']);
  assert.equal(back.log.entries.find(e => e.id === 'pr-b').answered, '2026-11-06');
  // A reopen done later travels too.
  const reopened = reopenRequest(m.log, 'pr-a', T + H);
  const r = mergePrivacyLogs(m.log, parsePrivacyReport(reportMarkdown(plan, {}, { appendix: privacyReportLines(reopened) })).log);
  assert.deepEqual(r.updated, ['pr-a']); assert.equal(r.log.entries.find(e => e.id === 'pr-a').answered, undefined);
  assert.equal(r.log.entries.find(e => e.id === 'pr-a').note, 'Asked twice');
  // Same content is reported as already here.
  assert.deepEqual(mergePrivacyLogs(phone, parsePrivacyReport(reportMarkdown(plan, {}, { appendix: privacyReportLines(phone) })).log).same.sort(), ['pr-a', 'pr-b']);
});

test('privacy import rejects broken lines and older stored entries get a change time', () => {
  const text = [`## ${PRIVACY_SECTION}`, '', '- pr-x · arrived 2026-02-30 · Asked to be removed · open', '- pr-y · arrived 2026-10-01 · Made up type · open', '- pr-z · arrived 2026-10-05 · Asked to be removed · answered 2026-10-01 (Removed and confirmed)', '- pr-ok · arrived 2026-10-05 · Other privacy question · open', '- pr-ok · arrived 2026-10-06 · Other privacy question · open'].join('\n');
  const p = parsePrivacyReport(text);
  assert.deepEqual(p.log.entries.map(e => e.id), ['pr-ok']); assert.equal(p.unknown, 4);
  assert.equal(cleanLog({ entries: [{ id: 'old', received: '2026-10-01', type: 'other', added: 5 }] }).entries[0].changed, 5);
});

test('practice runs: follow-ups and tick-offs survive the report and merge without duplicates', () => {
  let laptop = sampleDrill();
  const runAt = laptop.history[0].finishedAt;
  const report = reportMarkdown(plan, {}, { date: new Date(T), appendix: drillReportLines(laptop) });
  assert.match(report, new RegExp(`## ${DRILL_SECTION}`));
  assert.match(report, /### Strange sign-in to the owner account \(finished \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\)/);
  assert.match(report, /- People: Elham, co-founder\\_x, support/);
  assert.match(report, /- Contain only what is affected: Gap found · Follow-up: Write a \\\*night\\\* checklist \\\| v2/);
  assert.equal(parseReport(report, plan).secret, false);
  const parsed = parseDrillReport(report);
  assert.equal(parsed.runs.length, 1); assert.equal(parsed.unknown, 0);
  const run = parsed.runs[0];
  assert.deepEqual(run.people, ['Elham', 'co-founder_x', 'support']);
  assert.equal(run.answers.contain.followUp, 'Write a *night* checklist | v2');
  assert.equal(run.answers.contain.result, 'gap'); assert.equal(run.answers.record.result, 'handled');
  // Onto an empty phone: the run is added with its follow-ups open.
  const phone = mergeDrills({ current: null, history: [] }, parsed.runs);
  assert.equal(phone.added.length, 1); assert.deepEqual(followUpProgress(phone.drill), { total: 2, done: 0 });
  // Phone ticks one off; the laptop brings it in; the run is not duplicated.
  const ticked = setFollowUpDone(cleanDrill(phone.drill), phone.drill.history[0].finishedAt, 'contain', T);
  const back = mergeDrills(laptop, parseDrillReport(reportMarkdown(plan, {}, { appendix: drillReportLines(ticked) })).runs);
  assert.equal(back.added.length, 0); assert.equal(back.ticked, 1);
  assert.equal(back.drill.history.length, 1); assert.equal(back.drill.history[0].finishedAt, runAt);
  assert.deepEqual(followUpProgress(back.drill), { total: 2, done: 1 });
  // Bringing the same report again changes nothing; an unticked follow-up on the other device does not untick here.
  const again = mergeDrills(back.drill, parseDrillReport(reportMarkdown(plan, {}, { appendix: drillReportLines(laptop) })).runs);
  assert.equal(again.ticked, 0); assert.equal(again.same.length, 1); assert.deepEqual(followUpProgress(again.drill), { total: 2, done: 1 });
  // The current (unfinished) run on this device is kept.
  const withCurrent = mergeDrills({ current: startRun('outage', 'a, b'), history: [] }, parsed.runs);
  assert.equal(withCurrent.drill.current.scenario, 'outage');
});

test('practice runs: at most five kept (newest), secret-looking text refused, empty drill adds nothing', () => {
  const runs = [0, 1, 2, 3, 4, 5].map(i => sampleDrill(T - (i + 1) * 24 * H, ['account', 'outage', 'phishing', 'export'][i % 4]).history[0]);
  const local = { current: null, history: runs.slice(0, 3) };
  const m = mergeDrills(local, runs.slice(3));
  assert.equal(m.drill.history.length, 5); assert.equal(m.dropped, 1);
  assert.deepEqual(m.drill.history.map(r => r.finishedAt), runs.slice(0, 5).map(r => r.finishedAt));
  const text = [`## ${DRILL_SECTION}`, '', '### Strange sign-in to the owner account (finished 2026-11-06 20:35 UTC)', `- People: ${phrase}`, `- Contain only what is affected: Gap found · Follow-up: ${phrase}`, '- Made-up stage: Handled', '### Not a scenario (finished 2026-11-06 20:35 UTC)'].join('\n');
  const p = parseDrillReport(text);
  assert.equal(p.refused, 2); assert.equal(p.unknown, 2);
  assert.deepEqual(p.runs[0].people, []); assert.equal(p.runs[0].answers.contain.followUp, '');
  assert.deepEqual(drillReportLines({ current: null, history: [] }), []);
});

test('a full report with results, decisions, privacy log and practice runs still reads back cleanly', () => {
  const answers = cleanAnswers({ 'operations/inbox': { primary: 'Elham', backup: 'co-founder', cadence: 'daily' } });
  const records = { 'operations/drill': { result: 'pass', note: 'Practice run: 3 people', at: T } };
  const report = reportMarkdown(plan, records, { date: new Date(T), appendix: [...decisionReportLines(answers, {}), ...privacyReportLines(sampleLog()), ...drillReportLines(sampleDrill())] });
  const r = parseReport(report, plan);
  assert.equal(r.secret, false); assert.equal(r.records['operations/drill'].result, 'pass'); assert.equal(r.unknown.length, 0);
  assert.equal(parsePrivacyReport(report).log.entries.length, 2);
  assert.equal(parseDrillReport(report).runs.length, 1);
  assert.ok(report.trim().endsWith('Contains no keys, recovery phrases or passwords.'));
});

test('the workspace puts the log and practice runs in the report and offers them on import', () => {
  assert.match(app, /privacyReportLines\(privacyLog\)/);
  assert.match(app, /drillReportLines\(drill\)/);
  assert.match(app, /mergePrivacyLogs\(privacyLog, prIn\.log\)/);
  assert.match(app, /mergeDrills\(drill, drIn\.runs\)/);
  assert.match(owner, /waitlist privacy request log \(dates and answers only/);
});
