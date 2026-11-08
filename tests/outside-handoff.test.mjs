import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PARTIES, findParty, unassignedOutsideSteps, partyStatus, partyLine, outsideBrief, partyContact } from '../wallet-src/outside-handoff.js';
import { stepIndex } from '../wallet-src/launch-tracker.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const date = new Date('2026-11-08T22:30:00Z');
const pass = { result: 'pass', note: 'my private note', at: 1 };

test('every outside step in the checklist belongs to a party, and every party step exists', () => {
  assert.deepEqual(unassignedOutsideSteps(plan), []);
  const index = stepIndex(plan);
  for (const p of PARTIES) for (const key of Object.keys(p.steps)) {
    assert.ok(index.has(key), `${p.id} names a step that exists: ${key}`);
    assert.equal(index.get(key).step.by, 'outside', `${key} is an outside step`);
    assert.ok(p.steps[key].questions.length > 0 && p.steps[key].back, `${key} has questions and evidence to ask back`);
  }
  assert.equal(new Set(PARTIES.map(p => p.id)).size, PARTIES.length);
  assert.equal(findParty('nope'), null);
});

test('a new outside step without a party is reported', () => {
  const extra = { items: [{ id: 'g', title: 'G', steps: [{ id: 'x', by: 'outside', text: 'Someone else.', done: false }] }] };
  assert.deepEqual(unassignedOutsideSteps(extra), ['g/x']);
});

test('nothing recorded: requests without prerequisites can be asked now, others wait and say on what', () => {
  const st = partyStatus(plan, {}, {});
  const provider = st.find(s => s.party.id === 'provider');
  const allow = provider.rows.find(r => r.key === 'fiat/allowlist');
  assert.equal(allow.state, 'waiting');
  assert.deepEqual(allow.on.map(b => `${b.gate.id}/${b.step.id}`), ['fiat/partner']);
  const data = st.find(s => s.party.id === 'data');
  assert.equal(data.rows[0].state, 'ready');
  assert.equal(partyLine(data), '1 to ask now');
  const reviewer = st.find(s => s.party.id === 'reviewer');
  assert.equal(reviewer.rows.find(r => r.key === 'swaps/review').state, 'ready');
  assert.equal(reviewer.rows.find(r => r.key === 'production-security/audit').state, 'waiting');
});

test('recording the prerequisites moves requests to "ask now"; the decision names the party', () => {
  const records = { 'legal/counsel': pass, 'legal/entity': pass, 'legal/model': pass, 'fiat/partner': pass };
  const answers = { 'legal/counsel': { firm: 'Example Law LLP', status: 'engaged' } };
  const st = partyStatus(plan, records, answers);
  const counsel = st.find(s => s.party.id === 'counsel');
  assert.equal(counsel.rows.find(r => r.key === 'legal/analysis').state, 'ready');
  assert.equal(counsel.rows.find(r => r.key === 'legal/terms').state, 'waiting', 'terms still wait for the analysis');
  assert.equal(counsel.contact.text, 'Example Law LLP (engaged)');
  assert.equal(counsel.contact.engaged, true);
  const provider = st.find(s => s.party.id === 'provider');
  assert.equal(provider.rows.find(r => r.key === 'fiat/allowlist').state, 'ready');
  assert.equal(provider.contact.text, 'partner account created');
});

test('wallet-creation review is not needed when customers connect their own wallet', () => {
  const answers = { 'wallet-recovery/decide': { model: 'connect' } };
  const reviewer = partyStatus(plan, { 'wallet-recovery/decide': pass }, answers).find(s => s.party.id === 'reviewer');
  const row = reviewer.rows.find(r => r.key === 'wallet-recovery/embedded-review');
  assert.equal(row.state, 'not-needed');
  const md = outsideBrief(plan, { 'wallet-recovery/decide': pass }, 'reviewer', answers, { date });
  assert.match(md, /## Already settled\n- .*`wallet-recovery\/embedded-review`\): Not needed: you decided customers connect their own wallet\./);
  const create = partyStatus(plan, { 'wallet-recovery/decide': pass }, { 'wallet-recovery/decide': { model: 'create' } }).find(s => s.party.id === 'reviewer');
  assert.equal(create.rows.find(r => r.key === 'wallet-recovery/embedded-review').state, 'ready');
});

test('brief: header, numbered questions under "Ask now", waiting list, documents, no notes', () => {
  const records = { 'legal/counsel': pass, 'legal/entity': pass, 'legal/model': pass };
  const md = outsideBrief(plan, records, 'counsel', { 'legal/counsel': { firm: 'Example *Law*', status: 'call' } }, { date });
  assert.match(md, /^# FYNX Wallet: hand-off for the lawyer\n/);
  assert.match(md, /Made 2026-11-08 22:30 UTC/);
  assert.match(md, /- Who: Example \\\*Law\\\* \(first call booked\)/);
  assert.match(md, /Open requests: 3 \(1 can be asked now, 2 waiting on another step first\)/);
  const now = md.split('## Ask now (1)')[1].split('## Not yet')[0];
  assert.match(now, /`legal\/analysis`/);
  assert.match(now, /\n1\. Please give us a written conclusion/);
  assert.match(now, /Please send back: A written memo/);
  const later = md.split('## Not yet: finish these first (2)')[1].split('## Documents')[0];
  assert.match(later, /`legal\/terms`\) — waits for: Counsel reviews federal and state licensing.* \[Outside party\]/);
  assert.match(later, /`international\/country-review`\) — waits for: Pick the first country after the U\.S\. \[You\]/);
  assert.match(md, /## Documents to send\n- Legal and operating review brief: https:\/\/github\.com\/EA-LA\/FYNX-Wallet\/blob\/main\/docs\/LEGAL-OPERATING-REVIEW\.md/);
  assert.doesNotMatch(md, /my private note/);
  assert.match(md, /Never send passwords, API keys, recovery phrases or private keys/);
});

test('brief numbers questions across every "ask now" request', () => {
  const md = outsideBrief(plan, { 'wallet-recovery/decide': pass }, 'reviewer', { 'wallet-recovery/decide': { model: 'create' } }, { date });
  const nums = [...md.matchAll(/^(\d+)\. /gm)].map(m => Number(m[1]));
  assert.deepEqual(nums, nums.map((_, i) => i + 1));
  assert.ok(nums.length >= 3);
  assert.match(md, /- First: choose and record who this is in the decision worksheet, then send this list\./);
});

test('brief when everything for a party is done, and for an unknown party', () => {
  const donePlan = structuredClone(plan);
  for (const g of donePlan.items) for (const s of g.steps) if (s.id === 'prices' && g.id === 'assets') s.done = true;
  const st = partyStatus(donePlan, {}, {}).find(s => s.party.id === 'data');
  assert.equal(partyLine(st), 'Nothing open');
  const md = outsideBrief(donePlan, {}, 'data', {}, { date });
  assert.match(md, /## Ask now \(0\)\n\nNothing open for this party\./);
  assert.match(md, /## Already settled\n- Market prices from a licensed data provider \(`assets\/prices`\): done/);
  assert.doesNotMatch(md, /## Documents to send/);
  assert.equal(outsideBrief(plan, {}, 'nope', {}, { date }), '');
});

test('contact text when nothing is recorded', () => {
  const index = stepIndex(plan);
  assert.equal(partyContact(findParty('reviewer'), plan, {}, {}, index).text, 'not chosen yet');
  assert.equal(partyContact(findParty('provider'), plan, {}, {}, index).text, 'partner account not created yet');
  assert.equal(partyContact(findParty('data'), plan, {}, {}, index).text, 'plan not chosen yet');
});
