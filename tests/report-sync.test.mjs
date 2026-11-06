import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DECISIONS, decisionKey, cleanAnswers, decisionNote, decisionReportLines, parseDecisions, mergeDecisions, cleanTimes, REPORT_SECTION } from '../wallet-src/owner-decisions.js';
import { reportMarkdown, parseReport, stepKey } from '../wallet-src/launch-tracker.js';
import { STAGES, startRun, answerStage, finishRun, cleanDrill, followUpList, followUpProgress, setFollowUpDone, followUpText, drillRecord } from '../wallet-src/incident-drill.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const owner = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const phrase = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
const T = Date.UTC(2026, 10, 6, 21, 15);

const answers = cleanAnswers({
  'wallet-recovery/decide': { model: 'connect' },
  'production-security/domain': { address: 'wallet.fynx_example.com', project: 'fynx-wallet-prod' },
  'operations/inbox': { primary: 'Elham [owner]', backup: 'co-founder', cadence: 'daily' },
  'legal/model': { model: 'different', fees: 'swap', details: 'Fee of 0.5% * on swaps | maybe' },
  'legal/entity': { state: 'Delaware', checked: 'no' },
  'pilot/limits': { people: '50', states: 'Texas, Florida', perTx: '100', perMonth: '500.5' },
});
const times = { 'wallet-recovery/decide': T, 'operations/inbox': T + 60000 };

test('every decision answer survives a copied test report and comes back identical', () => {
  // Fill every field of every decision so the whole worksheet round-trips.
  const all = {};
  for (const d of DECISIONS) {
    const a = {};
    for (const f of d.fields) a[f.id] = f.options ? f.options[f.options.length - 1].value : f.type === 'number' ? String(f.min + 7) : f.type === 'date' ? '2026-11-01' : `${f.id} value_1`;
    all[decisionKey(d)] = a;
  }
  const full = cleanAnswers(all);
  assert.equal(Object.keys(full).length, DECISIONS.length);
  const report = reportMarkdown(plan, {}, { date: new Date(T), appendix: decisionReportLines(full, {}) });
  assert.match(report, new RegExp(`## ${REPORT_SECTION}`));
  assert.deepEqual(parseDecisions(report).answers, full);
});

test('labels and escaped values are readable in the report; saved times travel with them', () => {
  const report = reportMarkdown(plan, {}, { date: new Date(T), appendix: decisionReportLines(answers, times) });
  assert.match(report, /### How customers get a wallet \(saved 2026-11-06 21:15 UTC\)/);
  assert.match(report, /- For launch: Customers connect their own wallet/);
  assert.match(report, /- State of incorporation: Delaware/);
  assert.match(report, /Fee of 0\.5% \\\* on swaps \\\| maybe/);
  assert.ok(report.trim().endsWith('Contains no keys, recovery phrases or passwords.'));
  const back = parseDecisions(report);
  assert.deepEqual(back.answers, answers);
  assert.deepEqual(back.times, times);
  // The results part of the import is not confused by the decision section.
  const parsed = parseReport(report, plan);
  assert.equal(parsed.secret, false); assert.deepEqual(parsed.records, {}); assert.deepEqual(parsed.unknown, []);
});

test('decision lines with chat-app damage, unknown titles or secrets are skipped, not guessed', () => {
  const text = [`## ${REPORT_SECTION}`, '', '### Not a real decision', '- Anything: x', '### Who reads the support inbox', '- Reads it every day (name or role): Elham', '- Backup person (name or role): ' + phrase, '- How often: Sometimes', '- Made up label: y',
    '### Company details (saved 2026-11-06 10:00 UTC)', '- State of incorporation: Atlantis', '- Checked in the official registry?: Yes, the name and status match', '## Other section', '### How customers get a wallet', '- For launch: Customers connect their own wallet (for example MetaMask or a Ledger)'].join('\n');
  const r = parseDecisions(text);
  assert.deepEqual(r.answers, { 'operations/inbox': { primary: 'Elham' }, 'legal/entity': { checked: 'yes' } });
  assert.equal(r.refused, 1);
  assert.ok(r.unknown >= 4);
  assert.deepEqual(r.times, { 'legal/entity': Date.UTC(2026, 10, 6, 10, 0) });
  assert.deepEqual(parseDecisions('').answers, {});
});

test('merging decisions adds new ones and keeps the later save when both browsers differ', () => {
  const local = { 'wallet-recovery/decide': { model: 'connect' }, 'operations/inbox': { primary: 'Elham', backup: 'Sam', cadence: 'daily' }, 'legal/entity': { state: 'Texas', checked: 'no' } };
  const localTimes = { 'wallet-recovery/decide': T, 'operations/inbox': T, 'legal/entity': T + 5000 };
  const incoming = { 'wallet-recovery/decide': { model: 'connect' }, 'operations/inbox': { primary: 'Elham', backup: 'Ana', cadence: 'weekdays' }, 'legal/entity': { state: 'Delaware', checked: 'yes' }, 'pilot/support': { who: 'owner', reply: '24h', hours: 'business' } };
  const incomingTimes = { 'wallet-recovery/decide': T, 'operations/inbox': T + 1000, 'legal/entity': T, 'pilot/support': T + 2000 };
  const m = mergeDecisions(local, localTimes, incoming, incomingTimes);
  assert.deepEqual(m.added, ['pilot/support']); assert.deepEqual(m.updated, ['operations/inbox']); assert.deepEqual(m.kept, ['legal/entity']); assert.deepEqual(m.same, ['wallet-recovery/decide']);
  assert.equal(m.answers['operations/inbox'].backup, 'Ana'); assert.equal(m.answers['legal/entity'].state, 'Texas');
  assert.equal(m.times['pilot/support'], T + 2000); assert.equal(m.times['operations/inbox'], T + 1000);
  // No saved time on either side: this browser's answer stays.
  assert.deepEqual(mergeDecisions(local, {}, { 'legal/entity': { state: 'Ohio', checked: 'yes' } }, {}).kept, ['legal/entity']);
  assert.deepEqual(cleanTimes({ 'legal/entity': T, 'gone/x': T, 'legal/model': 'soon' }, { 'legal/entity': {}, 'legal/model': {} }), { 'legal/entity': T });
});

test('a decided answer imported with its report also brings the done step', () => {
  const d = DECISIONS.find(x => x.gate === 'pilot' && x.step === 'support'), a = { who: 'owner', reply: '24h', hours: 'business' };
  const records = { [stepKey('pilot', 'support')]: { result: 'pass', note: decisionNote(d, a), at: T } };
  const report = reportMarkdown(plan, records, { appendix: decisionReportLines({ [decisionKey(d)]: a }, { [decisionKey(d)]: T }) });
  assert.deepEqual(parseReport(report, plan).records, records);
  assert.deepEqual(parseDecisions(report).answers, { [decisionKey(d)]: a });
});

test('the workspace puts decisions in the report, previews them on import and stores save times', () => {
  assert.match(app, /appendix: decisionReportLines\(decisionAnswers, decisionSavedTimes\(\)\)/);
  assert.match(app, /parseDecisions\(text\)/);
  assert.match(app, /mergeDecisions\(decisionAnswers, decisionSavedTimes\(\), dec\.answers, dec\.times\)/);
  assert.match(app, /localStorage\.removeItem\(DECISION_TIMES_KEY\)/);
  assert.match(owner, /Your answers in “Decisions only you can make” come along too/);
});

const T0 = Date.UTC(2026, 10, 6, 18, 0);
function finished(at, gaps) {
  let run = startRun('account', 'Elham, co-founder', at - 30 * 60000);
  for (const s of STAGES) run = answerStage(run, s.id, gaps[s.id] ? 'gap' : 'handled', gaps[s.id] || '');
  return run;
}

test('follow-ups from finished runs form a to-do list that can be ticked off and reopened', () => {
  let drill = { current: finished(T0, { contain: 'Write down who can revoke access', notify: 'Draft the customer email' }), history: [] };
  drill = finishRun(drill, T0);
  drill = finishRun({ ...drill, current: finished(T0 + 86400000, { record: 'Keep a shared incident log' }) }, T0 + 86400000);
  const list = followUpList(drill);
  assert.equal(list.length, 3); assert.equal(list[0].text, 'Keep a shared incident log');
  assert.deepEqual(followUpProgress(drill), { total: 3, done: 0 });
  const runAt = drill.history[1].finishedAt, stage = list.find(i => i.text === 'Draft the customer email').stage.id;
  drill = setFollowUpDone(drill, runAt, stage, T0 + 5000);
  assert.deepEqual(followUpProgress(drill), { total: 3, done: 1 });
  assert.equal(followUpList(drill).at(-1).text, 'Draft the customer email');
  // Survives storage cleaning; the record and the shared list show it done.
  const stored = cleanDrill(JSON.parse(JSON.stringify(drill)));
  assert.deepEqual(followUpProgress(stored), { total: 3, done: 1 });
  assert.match(drillRecord(plan, stored.history[1]), /Draft the customer email \(done 2026-11-06\)/);
  const text = followUpText(plan, stored, T0 + 6000);
  assert.match(text, /Open: 2 of 3\./); assert.match(text, /- \[x\] Draft the customer email/); assert.match(text, /- \[ \] Keep a shared incident log/);
  drill = setFollowUpDone(stored, runAt, stage, 0);
  assert.deepEqual(followUpProgress(drill), { total: 3, done: 0 });
  // Unknown run or a stage without a follow-up changes nothing.
  assert.equal(setFollowUpDone(drill, 1, stage, T0), drill);
  assert.equal(setFollowUpDone(drill, runAt, 'record', T0), drill);
  // A done time without a follow-up is dropped.
  const odd = cleanDrill({ history: [{ ...drill.history[0], answers: { record: { result: 'handled', followUp: '', doneAt: T0 } } }] });
  assert.equal(odd.history[0].answers.record.doneAt, undefined);
});

test('the practice-run card has the follow-up list', () => {
  for (const id of ['dr-followups', 'dr-follow-count', 'dr-follow-h']) assert.match(owner, new RegExp(`id="${id}"`));
  assert.match(app, /function renderFollowUps\(\)/);
});
