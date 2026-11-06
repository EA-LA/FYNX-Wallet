import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DECISIONS, decisionKey, findDecision, cleanAnswers, cleanValue, problems, isReady, decisionNote, decisionState, decisionsProgress, decisionRecord, counselSheet, answerText, CURRENT_PROJECT, unsavedFields } from '../wallet-src/owner-decisions.js';
import { stepKey, overview, reportMarkdown, cleanRecords } from '../wallet-src/launch-tracker.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const owner = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const find = (gate, step) => DECISIONS.find(d => d.gate === gate && d.step === step);
const phrase = 'abandon ability able about above absent absorb abstract absurd abuse access accident';

test('every decision maps to one open owner step in the checklist, and the page says how many', () => {
  const keys = DECISIONS.map(decisionKey);
  assert.equal(new Set(keys).size, keys.length);
  for (const d of DECISIONS) {
    const gate = plan.items.find(g => g.id === d.gate), step = gate?.steps.find(s => s.id === d.step);
    assert.ok(step, `${decisionKey(d)} exists`);
    assert.equal(step.by, 'you', `${decisionKey(d)} is an owner step`);
    assert.equal(step.tab, undefined, `${decisionKey(d)} is not a device test`);
    assert.ok(d.fields.some(f => f.required), `${decisionKey(d)} has a required field`);
    for (const f of d.fields) if (['choice', 'select'].includes(f.type)) assert.ok(f.options.length >= 2);
  }
  assert.equal(DECISIONS.length, 12);
  assert.match(owner, /Twelve launch steps are business decisions/);
  // Device tests, final approvals and outside work are never offered as decisions.
  for (const key of ['pilot/approve', 'operations/drill', 'legal/registrations', 'releases/check-run', 'legal/analysis', 'wallet-recovery/restore-test']) assert.equal(findDecision(key), null, key);
});

test('values are cleaned: unknown options, bad numbers and secret-looking text are dropped', () => {
  const d = find('pilot', 'limits'), people = d.fields.find(f => f.id === 'people');
  assert.equal(cleanValue(people, ' 50 '), '50');
  assert.equal(cleanValue(people, '0'), '');
  assert.equal(cleanValue(people, '-5'), '');
  assert.equal(cleanValue(people, '1e3'), '');
  const text = find('legal', 'counsel').fields[0];
  assert.equal(cleanValue(text, phrase), '');
  assert.equal(cleanValue(text, 'Smith <b>& Co</b>'), 'Smith b& Co/b');
  assert.equal(cleanValue(text, 'x'.repeat(200)).length, 80);
  const date = find('legal', 'counsel').fields.find(f => f.id === 'date');
  assert.equal(cleanValue(date, '2026-11-06'), '2026-11-06');
  assert.equal(cleanValue(date, 'tomorrow'), '');
  const raw = { 'legal/entity': { state: 'Atlantis', checked: 'yes', extra: 'x' }, 'nope/nope': { a: 1 }, 'pilot/limits': [], 'legal/counsel': { firm: phrase } };
  assert.deepEqual(cleanAnswers(raw), { 'legal/entity': { checked: 'yes' } });
  assert.deepEqual(cleanAnswers(null), {});
  assert.deepEqual(cleanAnswers([1]), {});
});

test('a decision counts as made only when required answers are complete and meaningful', () => {
  const wallet = find('wallet-recovery', 'decide');
  assert.deepEqual(problems(wallet, {}), ['For launch is missing.']);
  assert.ok(isReady(wallet, { model: 'connect' }));
  const domain = find('production-security', 'domain');
  assert.match(problems(domain, { address: 'wallet.example.com', project: CURRENT_PROJECT }).join(' '), /new project/);
  assert.ok(isReady(domain, { address: 'wallet.example.com', project: 'fynx-wallet-prod' }));
  const counsel = find('legal', 'counsel');
  assert.match(problems(counsel, { firm: 'Firm', status: 'call' })[0], /Engaged/);
  assert.ok(isReady(counsel, { firm: 'Firm', status: 'engaged' }));
  const entity = find('legal', 'entity');
  assert.equal(isReady(entity, { state: 'Delaware', checked: 'no' }), false);
  assert.ok(isReady(entity, { state: 'Delaware', checked: 'yes' }));
  const inbox = find('operations', 'inbox');
  assert.match(problems(inbox, { primary: 'Elham', backup: 'elham', cadence: 'daily' }).join(' '), /different person/);
  const limits = find('pilot', 'limits');
  assert.match(problems(limits, { people: '50', states: 'Texas', perTx: '500', perMonth: '100' }).join(' '), /monthly limit/);
  assert.ok(isReady(limits, { people: '50', states: 'Texas', perTx: '100', perMonth: '500' }));
  const model = find('legal', 'model');
  assert.match(problems(model, { model: 'different', fees: 'none' }).join(' '), /Describe/);
});

test('notes are short, readable and fit the launch note limit', () => {
  const limits = find('pilot', 'limits');
  const note = decisionNote(limits, { people: '50', states: 'Texas, Florida', perTx: '100', perMonth: '1500' });
  assert.equal(note, 'Decision: Number of people: 50; Which states: Texas, Florida; Maximum per transaction: US$100; Maximum per person per month: US$1,500');
  const model = find('legal', 'model');
  const long = decisionNote(model, { model: 'different', fees: 'both', details: 'y'.repeat(80) });
  assert.ok(long.length <= 280);
  assert.equal(answerText(find('wallet-recovery', 'decide'), { model: 'connect' }), 'For launch: Customers connect their own wallet (for example MetaMask or a Ledger)');
  // A recorded decision survives the tracker's own cleaning and shows in the test report.
  const records = cleanRecords({ 'wallet-recovery/decide': { result: 'pass', note: decisionNote(find('wallet-recovery', 'decide'), { model: 'connect' }), at: Date.UTC(2026, 10, 6) } }, plan);
  assert.match(reportMarkdown(plan, records), /Passed \(2026-11-06\): Decide: is connecting.*Note: Decision: For launch: Customers connect their own wallet/);
});

test('progress and states follow the shared launch records', () => {
  const key = 'operations/backup', d = findDecision(key);
  assert.equal(decisionState(plan, d, {}, {}), 'open');
  assert.equal(decisionState(plan, d, {}, { [key]: { keep: '30d' } }), 'draft');
  const records = { [key]: { result: 'pass', note: 'Decision: x', at: 1 } };
  assert.equal(decisionState(plan, d, records, {}), 'decided');
  assert.equal(decisionState(plan, d, { [key]: { result: 'fail', note: '', at: 1 } }, { [key]: { keep: '30d' } }), 'draft');
  const p = decisionsProgress(plan, records, { 'legal/entity': { state: 'Delaware' } });
  assert.deepEqual(p, { total: 12, decided: 1, drafts: 1 });
  // Deciding moves the overall launch progress forward.
  assert.equal(overview(plan, records).done, overview(plan, {}).done + 1);
});

test('decision record lists every decision with escaped answers', () => {
  const answers = { 'pilot/limits': { people: '50', states: 'Texas | Florida', perTx: '100', perMonth: '500' } };
  const records = { 'pilot/limits': { result: 'pass', note: 'n', at: Date.UTC(2026, 10, 6) } };
  const md = decisionRecord(plan, records, answers, { date: new Date(Date.UTC(2026, 10, 6)) });
  assert.match(md, /^# FYNX Wallet owner decisions/);
  assert.match(md, /Decided: 1 of 12\./);
  assert.match(md, /\| Pilot size and limits \| .*Texas \\\| Florida.* \| Decided 2026-11-06 \|/);
  assert.match(md, /\| How customers get a wallet \| — \| Open \|/);
  assert.equal(md.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| Decision') && !l.startsWith('| ---')).length, 12);
  assert.doesNotMatch(md, /@/);
});

test('lawyer sheet asks questions, fills in known answers and never claims approvals', () => {
  const blank = counselSheet(plan, {}, { date: new Date(Date.UTC(2026, 10, 6)) });
  assert.match(blank, /^# Questions for our lawyer: FYNX Wallet/);
  assert.match(blank, /not legal advice/);
  assert.match(blank, /incorporated in to be confirmed/);
  assert.match(blank, /Pilot: size and states to be decided\./);
  assert.match(blank, /customers connect their own wallet/);
  const numbered = blank.split('\n').filter(l => /^\d+\. /.test(l));
  assert.equal(numbered.length, 14);
  assert.deepEqual(numbered.map(l => Number(l.split('.')[0])), numbered.map((_, i) => i + 1));
  for (const doc of ['docs/LEGAL-OPERATING-REVIEW.md', 'docs/LAUNCH-READINESS.md', 'docs/OPERATIONS.md', 'FYNX-Wallet-threat-model.md']) assert.ok(blank.includes(`https://github.com/EA-LA/FYNX-Wallet/blob/main/${doc}`), doc);
  assert.doesNotMatch(blank, /\b(licensed|registered|approved) (by|with) (FinCEN|the state)\b/i);
  const filled = counselSheet(plan, {
    'legal/entity': { state: 'Delaware', number: '1234567', checked: 'yes' },
    'legal/model': { model: 'external', fees: 'swap' },
    'international/first-country': { country: 'Canada', reason: 'demand' },
    'pilot/limits': { people: '50', states: 'Texas, Florida', perTx: '100', perMonth: '500' },
    'pilot/support': { who: 'Owner', reply: 'same', hours: 'business' },
  });
  assert.match(filled, /incorporated in Delaware, file number 1234567 \(checked in the state registry\)/);
  assert.match(filled, /Pilot: 50 people in Texas, Florida, at most US\$100 per transaction and US\$500 per person per month/);
  assert.match(filled, /Next country after the U\.S\.: Canada/);
  assert.match(filled, /given we plan to charge a fee/);
  assert.match(filled, /Before opening in Canada/);
  assert.match(filled, /first reply within the same business day/);
});

test('the workspace wires the worksheet into Launch readiness', () => {
  for (const id of ['launch-decisions', 'ld-list', 'ld-score', 'ld-copy-record', 'ld-copy-counsel', 'ld-download-counsel', 'ld-clear', 'ld-counsel-preview', 'ld-status']) assert.ok(owner.includes(`id="${id}"`), id);
  assert.match(app, /Answer in the decision worksheet/);
  assert.match(app, /launchRecords\[key\] = \{ result: 'pass', note: decisionNote\(decision, out\)/);
  assert.match(app, /renderDecisions\(\);\n\}/);
  assert.equal(stepKey('a', 'b'), 'a/b');
});

test('unsaved typing is detected per field so a re-render can keep it', () => {
  const inbox = find('operations', 'inbox');
  const saved = { primary: 'Elham', backup: 'Co-founder', cadence: 'daily' };
  assert.deepEqual(unsavedFields(inbox, { primary: 'Elham', backup: 'Co-founder', cadence: 'daily' }, saved), {});
  assert.deepEqual(unsavedFields(inbox, { primary: '  Elham ', backup: 'Co-founder', cadence: 'daily' }, saved), {}, 'spacing alone is not a change');
  assert.deepEqual(unsavedFields(inbox, { primary: 'Elham', backup: 'Sara', cadence: 'weekdays' }, saved), { backup: 'Sara', cadence: 'weekdays' });
  assert.deepEqual(unsavedFields(inbox, { primary: '', backup: 'Co-founder', cadence: 'daily' }, saved), { primary: '' }, 'a cleared field is an unsaved change');
  assert.deepEqual(unsavedFields(inbox, { primary: 'Elham' }, {}), { primary: 'Elham' }, 'typing into an unanswered decision');
  assert.deepEqual(unsavedFields(inbox, { primary: phrase }, {}), {}, 'secret-looking text is never carried over');
  assert.deepEqual(unsavedFields(inbox, { unknown: 'x' }, {}), {}, 'unknown fields are ignored');
});

test('the worksheet keeps unsaved typing across re-renders and drops it on save, clear and sign-out', () => {
  assert.match(app, /const drafts = decisionDrafts\(list\)/);
  assert.match(app, /applyDecisionDraft\(details, decision, drafts\[key\]\)/);
  assert.match(app, /discardDrafts\.add\(key\); saveDecision\(/, 'saving discards the draft');
  assert.match(app, /delete decisionAnswers\[key\]; saveDecisionAnswers\(\); discardDrafts\.add\(key\)/, 'clearing one answer discards its draft');
  assert.match(app, /clearSecurity\(\);\s*for \(const d of DECISIONS\) discardDrafts\.add\(decisionKey\(d\)\); renderDecisions\(\);/, 'sign-out wipes unsaved typing');
  assert.match(app, /'ld-unsaved'/);
  assert.doesNotMatch(app.slice(app.indexOf('function decisionDrafts'), app.indexOf('function renderDecisions')), /localStorage/, 'drafts are never stored');
});
