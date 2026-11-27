import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, search, normalize, highlight, resultLabel, countLine, moveActive, cleanQuery, MAX_QUERY, MAX_RESULTS, TAB_NAMES } from '../wallet-src/workspace-search.js';
import { SECTIONS } from '../wallet-src/section-guide.js';
import { SITUATIONS } from '../wallet-src/support-playbook.js';
import { SCENARIOS } from '../wallet-src/emergency-plan.js';
import { DECISIONS } from '../wallet-src/owner-decisions.js';
import { ACCESS_SERVICES } from '../wallet-src/access-review.js';

const plan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const owner = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
const index = buildIndex({ plan });
const steps = plan.items.flatMap(g => g.steps);

test('the index covers every tab, part, launch step, decision, support and emergency situation and account', () => {
  const count = kind => index.filter(e => e.kind === kind).length;
  assert.equal(count('tab'), Object.keys(TAB_NAMES).length);
  assert.equal(count('part'), Object.values(SECTIONS).flat().length);
  assert.equal(count('step'), steps.length);
  assert.equal(count('decision'), DECISIONS.length);
  assert.equal(count('situation'), SITUATIONS.length);
  assert.equal(count('scenario'), SCENARIOS.length);
  assert.equal(count('service'), ACCESS_SERVICES.length);
  assert.equal(new Set(index.map(e => e.id)).size, index.length, 'ids are unique');
  for (const e of index) {
    assert.ok(e.title && e.where && TAB_NAMES[e.tab], `${e.id} has a title, a place and a real tab`);
    assert.ok(['tab', 'part', 'step', 'decision', 'situation', 'scenario', 'service'].includes(e.go.type), e.id);
  }
  for (const e of index.filter(x => x.kind === 'part')) assert.match(e.go.target, /^#[a-z0-9-]+$/, `${e.id} jumps to an element id`);
});

test('plain words find the right place first', () => {
  const first = q => search(index, q).results[0];
  assert.equal(first('passkey').id, 'part:security:passkeys');
  assert.equal(first('privacy').id, 'part:registrations:privacy');
  assert.equal(first('swap').id, 'part:wallet:swap');
  assert.equal(first('lost phone').kind, 'scenario');
  assert.equal(first('stuck').id, 'situation:pending');
  assert.equal(first('Real-money switch').id, 'part:wallet:mainnet', 'an exact title wins');
  assert.equal(first('launch readiness').id, 'tab:launch');
  assert.equal(first('github').id, 'service:github');
  assert.equal(first('Pilot size').id, 'decision:pilot/limits');
  assert.equal(first('qr code').kind, 'step');
});

test('every word must match; matching ignores case, accents and punctuation', () => {
  assert.equal(normalize('  Sign-in & “Passkeys” — Café '), 'sign in passkeys cafe');
  const a = search(index, 'SIGN-IN'), b = search(index, 'sign in');
  assert.deepEqual(a.results.map(e => e.id), b.results.map(e => e.id));
  assert.ok(a.total > 0);
  assert.equal(search(index, 'passkey zzzzqq').total, 0, 'a word that matches nothing gives nothing');
  assert.deepEqual(search(index, '   '), { query: '', results: [], total: 0 });
  assert.equal(search(index, '!!!').total, 0);
});

test('results are capped and the open tab breaks ties', () => {
  const r = search(index, 'wallet');
  assert.ok(r.total > MAX_RESULTS);
  assert.equal(r.results.length, MAX_RESULTS);
  assert.equal(search(index, 'wallet', { limit: 3 }).results.length, 3);
  // "Launch tests" exists on Account security and on Waitlist: the open tab comes first.
  assert.equal(search(index, 'launch tests', { tab: 'security' }).results[0].tab, 'security');
  assert.equal(search(index, 'launch tests', { tab: 'registrations' }).results[0].tab, 'registrations');
});

test('launch steps show who does them and the owner\'s own result from this browser', () => {
  const gate = plan.items.find(g => g.steps.some(s => s.by === 'you'));
  const step = gate.steps.find(s => s.by === 'you'), key = `${gate.id}/${step.id}`;
  const fresh = index.find(e => e.id === `step:${key}`);
  assert.equal(fresh.state, 'open');
  assert.equal(fresh.stateText, 'You · To do');
  const failed = buildIndex({ plan, records: { [key]: { result: 'fail', note: '', at: 1 } } }).find(e => e.id === `step:${key}`);
  assert.deepEqual([failed.state, failed.stateText], ['failed', 'You · Failed, retest']);
  const passed = buildIndex({ plan, records: { [key]: { result: 'pass', note: '', at: 1 } } }).find(e => e.id === `step:${key}`);
  assert.equal(passed.stateText, 'You · Done');
  const eng = index.find(e => e.kind === 'step' && e.state === 'done');
  assert.match(eng.stateText, /^(Engineering|Outside party) · Done$/);
  const dec = buildIndex({ plan, decisionStates: { 'pilot/limits': 'draft' } }).find(e => e.id === 'decision:pilot/limits');
  assert.equal(dec.stateText, 'In progress');
  assert.equal(index.find(e => e.id === 'decision:pilot/limits').stateText, 'To decide');
});

test('highlight marks the typed words inside the title, keeping the original text', () => {
  const parts = highlight('Add a passkey on your iPhone', 'PASS iphone');
  assert.equal(parts.map(p => p.text).join(''), 'Add a passkey on your iPhone');
  assert.deepEqual(parts.filter(p => p.match).map(p => p.text), ['pass', 'iPhone']);
  assert.deepEqual(highlight('Swap', ''), [{ text: 'Swap', match: false }]);
  assert.deepEqual(highlight('', 'x'), [{ text: '', match: false }]);
  assert.deepEqual(highlight('aaa', 'a').filter(p => p.match).map(p => p.text), ['aaa']);
});

test('labels, count line, arrow keys and the query limit', () => {
  const e = index.find(x => x.id === 'part:security:passkeys');
  assert.equal(resultLabel(e), 'Part: Passkeys, Account security');
  assert.equal(countLine({ query: '', results: [], total: 0 }), '');
  assert.match(countLine({ query: 'zz', results: [], total: 0 }), /^Nothing found for “zz”/);
  assert.equal(countLine({ query: 'x', results: [1], total: 1 }), '1 match.');
  assert.equal(countLine({ query: 'x', results: [1, 2], total: 2 }), '2 matches.');
  assert.match(countLine({ query: 'x', results: new Array(8), total: 20 }), /^20 matches, showing the best 8/);
  assert.deepEqual([moveActive(-1, 1, 3), moveActive(-1, -1, 3), moveActive(2, 1, 3), moveActive(0, -1, 3), moveActive(1, 1, 0)], [0, 2, 0, 2, -1]);
  assert.equal(cleanQuery('x'.repeat(200)).length, MAX_QUERY);
  assert.equal(cleanQuery('  a   b '), 'a b ');
});

test('owner.html has an accessible search box and app.js wires it read-only and clears it on sign-out', () => {
  assert.match(owner, /<input id="ws-find-input" type="search" role="combobox" aria-label="Find in workspace"[^>]*aria-controls="ws-find-list"/);
  assert.match(owner, /<ul id="ws-find-list" role="listbox"/);
  assert.match(owner, /id="ws-find-live"[^>]*role="status"/);
  assert.ok(owner.indexOf('id="ws-find"') < owner.indexOf('<nav class="tabs"'), 'search sits above the tabs');
  assert.match(app, /from '\.\/workspace-search\.js'/);
  assert.match(app, /clearSupportFinder\(\); clearFind\(\);/);
  const block = app.slice(app.indexOf('// Find in workspace: one box'), app.indexOf('renderPermissions();\nready()'));
  assert.ok(block.length > 500);
  assert.doesNotMatch(block, /api\(|localStorage|sessionStorage|fetch\(/, 'the search never calls the server or stores the query');
  assert.match(block, /event\.key !== '\/'/);
  assert.match(block, /closest\('input, textarea, select/, 'slash does not steal typing in other fields');
});
