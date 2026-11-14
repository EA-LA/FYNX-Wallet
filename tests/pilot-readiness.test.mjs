import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pilotReadiness, approvalMarkdown, APPROVE_KEY, CEILINGS } from '../wallet-src/pilot-readiness.js';
import { MAINNET_CAPS } from '../firebase-wallet/functions/mainnet.js';
import { STAGES, startRun, answerStage, finishRun } from '../wallet-src/incident-drill.js';
import { emergencyPlan, planState } from '../wallet-src/emergency-plan.js';
import { looksSecret } from '../wallet-src/launch-tracker.js';

const plan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url)));
const NOW = Date.parse('2026-11-14T12:00:00Z');
const approve = plan.items.find(g => g.id === 'pilot').steps.find(s => s.id === 'approve');
const byKey = check => check.title;
const find = (r, title) => r.checks.find(c => c.title === title);

// Mark every step the approval waits for as finished: owner steps by a Passed record, others in a copy of the plan.
function finishedPlan() {
  const copy = structuredClone(plan), records = {};
  for (const key of approve.after) {
    const [g, s] = key.split('/'), step = copy.items.find(x => x.id === g).steps.find(x => x.id === s);
    if (step.by === 'you') records[key] = { result: 'pass', note: '', at: NOW }; else { step.done = true; step.doneOn = '2026-11-14'; }
  }
  return { plan: copy, records };
}
const limits = (perTx = 100, perMonth = 500) => ({ 'pilot/limits': { people: '50', states: 'Texas, Florida', perTx: String(perTx), perMonth: String(perMonth) }, 'pilot/support': { who: 'owner', reply: 'same', hours: 'always' } });
function practised(people = 'Elham, co-founder') {
  let run = startRun('pilot', people, NOW - 3600000);
  for (const st of STAGES) run = answerStage(run, st.id, 'handled');
  return finishRun({ current: run, history: [] }, NOW - 1800000);
}
const confirmed = { entries: [{ hash: `0x${'a'.repeat(64)}`, chainId: 84532, kind: 'page', label: 'ETH transfer', at: NOW - 86400000, outcome: 'confirmed', outcomeAt: NOW - 86000000 }] };
const goodEmergency = emergencyPlan(planState({ providers: ['google.com', 'password'], passkeys: 2, records: { 'operations/drill': { result: 'pass' }, 'wallet-recovery/restore-test': { result: 'pass' }, 'swaps/revoke': { result: 'pass' } }, access: { rows: [{ service: { id: 'google' }, entry: { twoStep: 'yes', codes: 'yes' } }] } }));

test('the ceilings shown match the server-side mainnet caps', () => {
  assert.deepEqual({ ...CEILINGS }, { ...MAINNET_CAPS });
});

test('an empty workspace is blocked, lists every step the approval waits for and never claims anything is fine', () => {
  const r = pilotReadiness({ plan, now: NOW });
  assert.equal(r.verdict, 'blocked');
  const steps = r.checks.filter(c => c.group === 'steps');
  assert.equal(steps.length, approve.after.length);
  assert.ok(steps.every(c => c.state === 'block' && c.action.kind === 'step'));
  assert.equal(find(r, 'Pilot limits decided').state, 'block');
  assert.equal(find(r, 'Rollback practice run').state, 'block');
  assert.equal(find(r, 'A transfer from FYNX was checked').state, 'block');
  assert.equal(find(r, 'Real-money sending').state, 'info');
  for (const t of ['Privacy requests', 'Accounts that control FYNX', 'Emergency plan']) assert.equal(find(r, t).state, 'info', `${t} is unknown, not OK`);
  assert.match(r.headline, /^Not ready for the pilot: \d+ things to finish first/);
});

test('everything finished: ready for the written approval, with the honest warnings kept', () => {
  const { plan: p, records } = finishedPlan();
  const r = pilotReadiness({ plan: p, records, answers: limits(), drill: practised(), register: confirmed, emergency: goodEmergency, sheet: { state: 'current', text: '' }, access: { total: 5, fine: 5, risk: 0, overdue: 0 }, privacy: { open: 0, overdue: 0, dueSoon: 0 }, now: NOW });
  assert.equal(r.blockers, 0, JSON.stringify(r.checks.filter(c => c.state === 'block')));
  assert.equal(r.verdict, 'ready');
  assert.equal(find(r, 'Monthly limit per person').state, 'warn', 'FYNX cannot enforce monthly totals yet and says so');
  assert.match(r.headline, /^Ready for your written approval · read the 1 point marked “Look at” first\.$/);
  assert.match(find(r, 'Rollback practice run').detail, /2 people \(7 of 7 stages handled\)/);
  assert.match(find(r, 'A transfer from FYNX was checked').detail, /Base Sepolia/);
});

test('a failed owner step blocks and says to retest', () => {
  const { plan: p, records } = finishedPlan();
  records['pilot/limits'] = { result: 'fail', note: '', at: NOW };
  const r = pilotReadiness({ plan: p, records, answers: limits(), now: NOW });
  const row = r.checks.find(c => c.action?.key === 'pilot/limits' && c.group === 'steps');
  assert.equal(row.state, 'block'); assert.match(row.detail, /Failed; retest/);
  assert.equal(find(r, 'No failed tests').state, 'block');
});

test('a pilot limit above FYNX’s ceiling blocks', () => {
  const r = pilotReadiness({ plan, answers: limits(300, 1000), now: NOW });
  const row = find(r, 'Limit fits FYNX’s pilot ceiling');
  assert.equal(row.state, 'block'); assert.match(row.detail, /US\$300 per transfer is above/);
  assert.equal(find(pilotReadiness({ plan, answers: limits(250), now: NOW }), 'Limit fits FYNX’s pilot ceiling').state, 'ok');
});

test('the real-money switch is compared with the pilot limit and flagged when on before approval', () => {
  const on = { enabled: true, ETH: '0.05', USDC: '200', updatedAt: '2026-11-10T09:00:00Z' };
  const r = pilotReadiness({ plan, answers: limits(100), mainnet: on, now: NOW });
  assert.equal(find(r, 'USDC limit matches your pilot limit').state, 'block');
  assert.match(find(r, 'USDC limit matches your pilot limit').detail, /200 USDC per transfer, more than your pilot limit of US\$100/);
  assert.equal(find(r, 'Real-money sending is already on').state, 'warn');
  assert.match(find(r, 'ETH limit in dollars').detail, /0\.05 ETH/);
  const fits = pilotReadiness({ plan, answers: limits(250), mainnet: on, now: NOW });
  assert.equal(find(fits, 'USDC limit matches your pilot limit').state, 'ok');
  assert.equal(find(r, 'Real-money sending'), undefined, 'the “off” note only shows when it is off');
});

test('a practice run with one person or another scenario does not count', () => {
  const solo = pilotReadiness({ plan, drill: practised('Elham'), now: NOW });
  assert.equal(find(solo, 'Rollback practice run').state, 'block');
  assert.match(find(solo, 'Rollback practice run').detail, /does not count yet: Add at least 2 people/);
  let other = startRun('phishing', 'Elham, co-founder', NOW - 3600000);
  for (const st of STAGES) other = answerStage(other, st.id, 'handled');
  const r = pilotReadiness({ plan, drill: finishRun({ current: other, history: [] }, NOW), now: NOW });
  assert.match(find(r, 'Rollback practice run').detail, /^Run the incident practice/);
});

test('open follow-ups from the pilot practice are listed; a dropped or failed transfer is not proof', () => {
  let run = startRun('pilot', 'Elham, co-founder', NOW - 3600000);
  for (const st of STAGES) run = answerStage(run, st.id, st.id === 'contain' ? 'gap' : 'handled', st.id === 'contain' ? 'Write the pause message' : '');
  const drill = finishRun({ current: run, history: [] }, NOW);
  const dropped = { entries: [{ ...confirmed.entries[0], outcome: 'dropped' }] };
  const r = pilotReadiness({ plan, drill, register: dropped, now: NOW });
  assert.equal(find(r, 'Rollback practice run').state, 'ok');
  assert.equal(find(r, 'Follow-ups from the practice').state, 'warn');
  assert.equal(find(r, 'A transfer from FYNX was checked').state, 'block');
});

test('overdue privacy answers and account gaps block; due-soon and old reviews only warn', () => {
  let r = pilotReadiness({ plan, privacy: { open: 2, overdue: 1, dueSoon: 1 }, access: { total: 5, fine: 4, risk: 1, overdue: 0 }, now: NOW });
  assert.equal(find(r, 'Privacy requests answered on time').state, 'block');
  assert.equal(find(r, 'Accounts that control FYNX').state, 'block');
  r = pilotReadiness({ plan, privacy: { open: 1, overdue: 0, dueSoon: 1 }, access: { total: 5, fine: 3, risk: 0, overdue: 2 }, now: NOW });
  assert.equal(find(r, 'Privacy requests answered on time').state, 'warn');
  assert.equal(find(r, 'Accounts that control FYNX').state, 'warn');
  assert.match(find(r, 'Accounts that control FYNX').detail, /3 of 5 .* \(2 overdue\)/);
});

test('emergency plan gaps and an unsaved sheet warn', () => {
  const weak = emergencyPlan(planState({ providers: ['google.com'], passkeys: 0 }));
  const r = pilotReadiness({ plan, emergency: weak, sheet: { state: 'never', text: '' }, now: NOW });
  assert.equal(find(r, 'Emergency plan').state, 'warn');
  assert.match(find(r, 'Emergency plan').detail, /Ready for 1 of 6 situations; to prepare: .*locked out/);
  assert.equal(find(r, 'Emergency sheet').state, 'warn');
});

test('once the approval step is recorded the verdict says so', () => {
  const r = pilotReadiness({ plan, records: { [APPROVE_KEY]: { result: 'pass', note: '', at: NOW } }, now: NOW });
  assert.equal(r.verdict, 'approved');
  assert.equal(r.headline, 'You recorded your written approval for the pilot.');
});

test('the approval sheet: draft while blocked, signable when ready, decisions in it, nothing secret', () => {
  const blocked = pilotReadiness({ plan, answers: limits(), now: NOW });
  const draft = approvalMarkdown(blocked, { plan, answers: limits(), date: new Date(NOW) });
  assert.match(draft, /^# FYNX Wallet pilot release approval \(DRAFT: not ready\)/);
  assert.match(draft, /Not ready to sign: \d+ checks still to finish/);
  const { plan: p, records } = finishedPlan();
  const ready = pilotReadiness({ plan: p, records, answers: limits(), drill: practised(), register: confirmed, emergency: goodEmergency, sheet: { state: 'current' }, access: { total: 5, fine: 5 }, privacy: { open: 0 }, now: NOW });
  const text = approvalMarkdown(ready, { plan: p, answers: limits(), mainnet: { enabled: true, ETH: '0.02', USDC: '100' }, date: new Date(NOW) });
  assert.match(text, /^# FYNX Wallet pilot release approval\n/);
  assert.match(text, /Prepared: 2026-11-14/);
  assert.match(text, /- Who: 50 people from the waitlist in Texas, Florida\./);
  assert.match(text, /at most US\$100 per transfer and US\$500 per person per month/);
  assert.match(text, /Real-money sending now: on, 100 USDC \/ 0\.02 ETH per transfer/);
  assert.match(text, /Support: owner, first reply within the same business day, around the clock for security problems\./);
  assert.match(text, /\| Rollback practised \| Rollback practice run \| OK \|/);
  assert.match(text, /Name: _+ +Signature: _+ +Date: _+/);
  assert.match(text, /docs\/PILOT-ROLLBACK\.md/);
  assert.equal(looksSecret(text), false);
  assert.doesNotMatch(text, /0x[0-9a-f]{40}/i, 'no addresses or transaction IDs');
  assert.ok(ready.checks.map(byKey).length > 10);
});
