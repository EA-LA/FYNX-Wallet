import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { engineeringBrief, gateBlockers, launchOrder } from '../wallet-src/launch-tracker.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const pass = { result: 'pass', note: 'secret note text', at: 1 };
const date = new Date('2026-11-08T18:00:00Z');

// Made-up plan: engineering step e2 waits on owner step y1; e1 can start now and frees e3; e4 failed.
const mini = { items: [
  { id: 'g1', title: 'Gate one', status: 'external-dependency', steps: [
    { id: 'y1', by: 'you', text: 'Choose the thing. More words here.', done: false },
    { id: 'e1', by: 'engineering', text: 'Build the base.', done: false },
    { id: 'e2', by: 'engineering', text: 'Build on the choice.', after: ['g1/y1'], done: false },
    { id: 'e3', by: 'engineering', text: 'Build on the base.', after: ['g1/e1'], done: false },
  ] },
  { id: 'g2', title: 'Gate two', status: 'external-dependency', steps: [
    { id: 'o1', by: 'outside', text: 'Partner approves.', done: false },
    { id: 'e4', by: 'engineering', text: 'Ship the fix.', done: false },
    { id: 't1', by: 'you', text: 'Test e2 and the partner.', after: ['g1/e2', 'g2/o1'], done: false },
    { id: 't2', by: 'you', text: 'Test e2 again.', after: ['g1/e2'], done: false },
    { id: 'done', by: 'engineering', text: 'Already built.', done: true },
  ] },
] };

test('brief lists engineering steps that can start now by what they free, and the owner tests that failed', () => {
  const md = engineeringBrief(mini, { 'g2/t2': { result: 'fail', note: 'private', at: 1 } }, { date });
  assert.match(md, /^# FYNX Wallet: what engineering can start now/);
  assert.match(md, /Made 2026-11-08 18:00 UTC/);
  assert.match(md, /Open engineering steps: 4 \(2 can start now, 2 waiting on another step\)/);
  const start = md.split('## Start now (2)')[1].split('##')[0];
  const e1 = start.indexOf('g1/e1'), e4 = start.indexOf('g2/e4');
  assert.ok(e1 > -1 && e4 > e1, 'the step that frees more comes first');
  assert.match(start, /- \[ \] \*\*Gate one\*\*: Build the base\. \(`g1\/e1`\) — frees 1 later step/);
  assert.match(start, /\*\*Gate two\*\*: Ship the fix\. \(`g2\/e4`\)\n/);
  assert.match(md, /## Failed in the owner's testing: look for a fix, then ask for a retest \(1\)\n- \*\*Gate two\*\*: Test e2 again \(`g2\/t2`\)/);
  assert.doesNotMatch(md, /private/);
  assert.doesNotMatch(md, /Already built/);
  assert.doesNotMatch(engineeringBrief(mini, {}, { date }), /Failed in the owner/);
});

test('brief says what each waiting step waits for and what the owner can do to unblock engineering', () => {
  const md = engineeringBrief(mini, {}, { date });
  assert.match(md, /## Waiting on another step first \(2\)/);
  assert.match(md, /Build on the choice \(`g1\/e2`\) — waits for: Choose the thing \[You\]/);
  assert.match(md, /Build on the base \(`g1\/e3`\) — waits for: Build the base \[Engineering\]/);
  const asks = md.split('## Needed from the owner or outside parties to unblock engineering (1)')[1];
  assert.ok(asks, 'unblock section present');
  assert.match(asks, /Choose the thing \(Gate one\) \[You\] \(`g1\/y1`\) — holds 1 engineering step/);
  assert.doesNotMatch(asks, /Build the base/, 'engineering blockers are not asks for the owner');
});

test('brief never includes notes and updates as the owner records results', () => {
  const md = engineeringBrief(mini, { 'g1/y1': pass }, { date });
  assert.doesNotMatch(md, /secret note text/);
  assert.match(md, /3 can start now, 1 waiting/);
  assert.match(md, /## Start now \(3\)[\s\S]*`g1\/e2`[\s\S]*## Waiting/, 'e2 can start once the owner chose');
  assert.doesNotMatch(md, /Needed from the owner/, 'only engineering blocks engineering now');
  const none = engineeringBrief({ items: [{ id: 'g', title: 'G', steps: [{ id: 'a', by: 'you', text: 'A', done: false }] }] }, {}, { date });
  assert.match(none, /Nothing for engineering can start right now\./);
  assert.match(none, /No engineering step is waiting\./);
});

test('gate blockers count how many waiting steps each open step holds, most first', () => {
  const g2 = gateBlockers(mini, {}, 'g2');
  assert.equal(g2.waiting, 2);
  assert.deepEqual(g2.blockers.map(b => [b.key, b.count]), [['g1/e2', 2], ['g2/o1', 1]]);
  assert.equal(g2.blockers[0].gate.id, 'g1');
  const g1 = gateBlockers(mini, {}, 'g1');
  assert.deepEqual(g1.blockers.map(b => b.key), ['g1/y1', 'g1/e1']);
  assert.deepEqual(gateBlockers(mini, { 'g1/y1': pass }, 'g1').blockers.map(b => b.key), ['g1/e1'], 'an owner result clears that blocker');
  assert.equal(gateBlockers(mini, { 'g1/y1': pass }, 'g1').waiting, 1);
  assert.deepEqual(gateBlockers(mini, {}, 'missing'), { waiting: 0, blockers: [] });
  // A done step that would still be waiting does not count.
  assert.equal(gateBlockers(mini, { 'g2/t2': pass }, 'g2').waiting, 1);
});

test('on the real checklist every engineering step is in the brief exactly once and blockers match the order', () => {
  const md = engineeringBrief(plan, {}, { date });
  const o = launchOrder(plan, {});
  const eng = [...o.ready, ...o.waiting].filter(r => r.step.by === 'engineering');
  assert.ok(eng.length > 0);
  for (const r of eng) assert.equal(md.split('`' + r.key + '`').length - 1, 1, r.key);
  for (const gate of plan.items) {
    const { waiting } = gateBlockers(plan, {}, gate.id);
    assert.equal(waiting, o.waiting.filter(r => r.gate.id === gate.id).length, gate.id);
  }
});
