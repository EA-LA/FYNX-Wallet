import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, search, ownText, snippet, resultLabel, countLine, MAX_OWN_TEXT, SNIPPET } from '../wallet-src/workspace-search.js';
import { DECISIONS, decisionKey } from '../wallet-src/owner-decisions.js';

const plan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const gate = plan.items.find(g => g.steps.some(s => s.by === 'you'));
const step = gate.steps.find(s => s.by === 'you'), key = `${gate.id}/${step.id}`;
const ALICE = '0x1111111111111111111111111111111111111111', BOB = '0x2222222222222222222222222222222222222222';

test('notes on launch tests are searched and shown as a snippet with the matched word', () => {
  const index = buildIndex({ plan, records: { [key]: { result: 'fail', note: 'Ledger froze on the second signature, retry with firmware 2.4', at: 1 } } });
  const r = search(index, 'firmware');
  assert.equal(r.results[0].id, `step:${key}`, 'a word only in the note finds the step');
  assert.equal(r.results[0].mineLabel, 'Your note');
  assert.match(r.results[0].snippet, /firmware 2\.4/);
  assert.match(resultLabel(r.results[0]), /Your note: .*firmware/);
  assert.equal(search(buildIndex({ plan }), 'firmware').total, 0, 'without the note there is nothing to find');
  // A result found by its title only carries no snippet, even when it has a note.
  const byTitle = search(index, step.text.split(/\s+/).filter(w => w.length > 4)[0]).results.find(e => e.id === `step:${key}`);
  if (byTitle) assert.equal(byTitle.snippet, undefined);
});

test('secret-looking or odd notes are never indexed; long text is capped', () => {
  const secret = 'abandon '.repeat(11) + 'about';
  assert.equal(ownText(`key 0x${'a'.repeat(64)}`), '');
  assert.equal(ownText(42), '');
  assert.equal(ownText('   '), '');
  assert.equal(ownText('a  \n b'), 'a b');
  assert.equal(ownText('x '.repeat(400)).length, MAX_OWN_TEXT);
  const index = buildIndex({ plan, records: { [key]: { result: 'pass', note: secret, at: 1 } } });
  assert.equal(index.find(e => e.id === `step:${key}`).mine, undefined);
  assert.equal(search(index, 'abandon').results.some(e => e.id === `step:${key}`), false);
});

test('decision worksheet answers are searched with their field names', () => {
  const d = DECISIONS.find(x => x.fields.some(f => f.type === 'text')), field = d.fields.find(f => f.type === 'text');
  const index = buildIndex({ plan, decisionAnswers: { [decisionKey(d)]: { [field.id]: 'wallet.fynxexample.com' } } });
  const hit = search(index, 'fynxexample').results[0];
  assert.equal(hit.id, `decision:${decisionKey(d)}`);
  assert.equal(hit.mineLabel, 'Your answer');
  assert.match(hit.snippet, /wallet\.fynxexample\.com/);
  assert.doesNotThrow(() => buildIndex({ plan, decisionAnswers: { [decisionKey(d)]: 'bad', other: null } }));
  assert.doesNotThrow(() => buildIndex({ plan, decisionAnswers: null }));
});

test('wallet names are found and open the history filtered to that wallet', () => {
  const index = buildIndex({ plan, walletNames: { [ALICE]: { label: 'Mum savings', at: 2 }, [BOB.toUpperCase().replace('0X', '0x')]: { label: 'Test buddy', at: 1 }, nope: { label: 'x', at: 1 }, [`${ALICE}00`]: { label: 'bad', at: 1 } } });
  const names = index.filter(e => e.kind === 'name');
  assert.equal(names.length, 2, 'only real addresses with clean names');
  const hit = search(index, 'mum').results[0];
  assert.deepEqual([hit.kind, hit.title, hit.tab, hit.stateText], ['name', 'Mum savings', 'wallet', '0x1111…1111']);
  assert.deepEqual(hit.go, { type: 'name', address: ALICE, label: 'Mum savings' });
  assert.equal(search(index, BOB.slice(0, 12)).results[0].title, 'Test buddy', 'the start of an address finds its name');
  assert.equal(new Set(index.map(e => e.id)).size, index.length);
  assert.match(resultLabel(hit), /^Wallet name: Mum savings, Crypto tools · Portfolio & history, 0x1111…1111$/);
  const unsafe = buildIndex({ plan, walletNames: { [ALICE]: { label: 'me@example.com', at: 1 } } });
  assert.equal(unsafe.filter(e => e.kind === 'name').length, 0, 'email-looking names are not kept');
});

test('snippet keeps short text whole and cuts long text around the first match', () => {
  assert.equal(snippet('short note', ['note']), 'short note');
  const long = `${'start words here '.repeat(10)}the matched firmware word ${'tail text '.repeat(10)}`;
  const s = snippet(long, ['firmware']);
  assert.ok(s.length <= SNIPPET + 2, s);
  assert.match(s, /firmware/);
  assert.ok(s.startsWith('…') && s.endsWith('…'));
  assert.ok(snippet(long, ['start']).startsWith('start'));
  assert.ok(snippet(long, ['zzz']).startsWith('start'), 'no match: the beginning');
});

test('the help line and app wiring mention and pass the owner\'s own words, still read-only', () => {
  assert.match(countLine({ query: 'zz', results: [], total: 0 }), /notes, decision answers, wallet names/);
  assert.match(app, /buildFindIndex\(\{ plan: launchPlan, records: launchRecords, decisionStates, decisionAnswers, walletNames(, rollbacks: rollbackLog, drill)? \}\)/);
  assert.match(app, /go\.type === 'name'.*openWalletName\(go\.address, go\.label\)/);
  const fn = app.slice(app.indexOf('function openWalletName('), app.indexOf('function clearFind('));
  assert.doesNotMatch(fn, /api\(|localStorage|fetch\(|saveWalletNames/, 'opening a name only filters what is already loaded');
  assert.match(fn, /'#hx-query'\)\.value = address/);
});
