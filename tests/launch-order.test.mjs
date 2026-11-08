import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkDependencies, waitingOn, launchOrder, nextActions, stepIndex, shortStep, stepKey } from '../wallet-src/launch-tracker.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const pass = { result: 'pass', note: '', at: 1 };

// A tiny made-up plan: a → b → c, and d waits for an engineering step that is not done.
const mini = { items: [
  { id: 'g1', title: 'Gate one', status: 'device-testing', steps: [
    { id: 'a', by: 'you', text: 'Do A first. Then more.', done: false },
    { id: 'b', by: 'you', text: 'Do B.', after: ['g1/a'], done: false },
    { id: 'c', by: 'you', text: 'Do C.', after: ['g1/b'], done: false },
  ] },
  { id: 'g2', title: 'Gate two', status: 'external-dependency', steps: [
    { id: 'eng', by: 'engineering', text: 'Build the thing.', done: false },
    { id: 'd', by: 'you', text: 'Test the thing.', after: ['g2/eng'], done: false },
    { id: 'built', by: 'engineering', text: 'Already built.', done: true },
    { id: 'e', by: 'you', text: 'Test what is built.', after: ['g2/built'], done: false },
  ] },
] };

test('the real launch checklist order has no unknown steps, self references or loops', () => {
  assert.deepEqual(checkDependencies(plan), []);
  const index = stepIndex(plan);
  const withAfter = [...index.values()].filter(({ step }) => step.after);
  assert.ok(withAfter.length >= 30, 'most follow-on steps declare what they wait for');
  // A few orders that must hold.
  const after = key => index.get(key).step.after;
  assert.ok(after('identity/passkey-signin').includes('identity/passkey-add'));
  assert.ok(after('fiat/sandbox-test').includes('fiat/redeploy'));
  assert.ok(after('legal/analysis').includes('legal/counsel'));
  assert.ok(after('pilot/approve').includes('production-security/audit'));
});

test('dependency check finds unknown steps, self references, repeats and loops', () => {
  const bad = { items: [{ id: 'x', steps: [
    { id: 'p', by: 'you', text: 'P', after: ['x/q'], done: false },
    { id: 'q', by: 'you', text: 'Q', after: ['x/p', 'x/p'], done: false },
    { id: 'r', by: 'you', text: 'R', after: ['x/r', 'nope/z'], done: false },
    { id: 's', by: 'you', text: 'S', after: [], done: false },
  ] }] };
  const errors = checkDependencies(bad).join('\n');
  assert.match(errors, /loop: x\/(p|q) → x\/(q|p) → x\/(p|q)/);
  assert.match(errors, /x\/q: repeats/);
  assert.match(errors, /x\/r: waits for itself/);
  assert.match(errors, /unknown step nope\/z/);
  assert.match(errors, /x\/s: "after" must be a non-empty list/);
});

test('a step waits until what it depends on is done; a failed test still blocks', () => {
  assert.deepEqual(waitingOn(mini, {}, 'g1/b').map(w => w.step.id), ['a']);
  assert.deepEqual(waitingOn(mini, { 'g1/a': pass }, 'g1/b'), []);
  assert.deepEqual(waitingOn(mini, { 'g1/a': { result: 'fail', at: 1 } }, 'g1/b').map(w => w.step.id), ['a']);
  assert.deepEqual(waitingOn(mini, { 'g1/a': { result: 'skip', at: 1 } }, 'g1/b'), [], 'Not applicable counts as finished');
  assert.deepEqual(waitingOn(mini, {}, 'g2/e'), [], 'steps marked done in the checklist do not block');
  assert.deepEqual(waitingOn(mini, {}, 'g2/d').map(w => w.step.id), ['eng'], 'an open engineering step blocks');
  assert.deepEqual(waitingOn(mini, {}, 'missing/step'), []);
});

test('launch order splits ready and waiting steps and counts what each one frees', () => {
  const o = launchOrder(mini, {});
  assert.deepEqual(o.ready.map(r => r.key), ['g1/a', 'g2/eng', 'g2/e']);
  assert.deepEqual(o.waiting.map(r => r.key), ['g1/b', 'g1/c', 'g2/d']);
  assert.deepEqual(o.readyYou.map(r => r.key), ['g1/a', 'g2/e']);
  assert.deepEqual(o.readyOthers.map(r => r.key), ['g2/eng']);
  assert.equal(o.done, 1);
  const a = o.ready.find(r => r.key === 'g1/a');
  assert.equal(a.unblocks, 2, 'A frees B and, through it, C');
  assert.deepEqual(o.top.map(r => r.key), ['g1/a', 'g2/eng'], 'most freed first; steps that free nothing are left out');
  const later = launchOrder(mini, { 'g1/a': pass });
  assert.deepEqual(later.ready.map(r => r.key), ['g1/b', 'g2/eng', 'g2/e']);
  assert.equal(later.ready[0].unblocks, 1);
  const failed = launchOrder(mini, { 'g1/a': { result: 'fail', at: 1 } });
  assert.equal(failed.ready[0].failed, true);
  const all = Object.fromEntries(['g1/a', 'g1/b', 'g1/c', 'g2/d', 'g2/e'].map(k => [k, pass]));
  const finished = launchOrder(mini, all);
  assert.deepEqual(finished.waiting, []);
  assert.deepEqual(finished.ready.map(r => r.key), ['g2/eng']);
});

test('next steps prefer owner steps that can start now; waiting ones only fill in at the end', () => {
  assert.deepEqual(nextActions(mini, {}, 5).map(n => stepKey(n.gate.id, n.step.id)), ['g1/a', 'g2/e', 'g1/b', 'g1/c', 'g2/d']);
  assert.deepEqual(nextActions(mini, {}, 2).map(n => n.step.id), ['a', 'e']);
  const rec = { 'g1/c': { result: 'fail', at: 1 } };
  assert.equal(nextActions(mini, rec, 1)[0].step.id, 'c', 'a failed step still comes first');
  // On the real checklist the first suggestions are never waiting on another open step.
  for (const n of nextActions(plan, {}, 3)) assert.deepEqual(waitingOn(plan, {}, stepKey(n.gate.id, n.step.id)), [], n.step.id);
});

test('real checklist: before anything is recorded, sign in with a passkey waits for adding one', () => {
  const o = launchOrder(plan, {});
  const signin = o.waiting.find(r => r.key === 'identity/passkey-signin');
  assert.ok(signin);
  assert.deepEqual(signin.on.map(w => stepKey(w.gate.id, w.step.id)), ['identity/passkey-add']);
  assert.ok(o.ready.some(r => r.key === 'identity/passkey-add'));
  const later = launchOrder(plan, { 'identity/passkey-add': pass });
  assert.ok(later.ready.some(r => r.key === 'identity/passkey-signin'));
  // Every open step is in exactly one list.
  const keys = [...o.ready, ...o.waiting].map(r => r.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.length + o.done, stepIndex(plan).size);
});

test('short step names keep the first sentence and cut long ones at a word', () => {
  assert.equal(shortStep({ text: 'Do A first. Then more.' }), 'Do A first');
  assert.equal(shortStep({ text: 'Join with a test address ending in @example.com and confirm.' }), 'Join with a test address ending in @example.com and confirm');
  const long = shortStep({ text: 'word '.repeat(40) });
  assert.ok(long.length <= 91 && long.endsWith('…'));
  assert.equal(shortStep({ text: 'Hire qualified U.S. counsel experienced with crypto and payments.' }), 'Hire qualified U.S. counsel experienced with crypto and payments');
  assert.equal(shortStep({ text: 'Pick the first country after the U.S.' }), 'Pick the first country after the U.S.', 'an abbreviation at the end keeps its dot');
  assert.equal(shortStep({ text: 'Is it enough? Write it down.' }), 'Is it enough');
  assert.equal(shortStep({}), '');
});
