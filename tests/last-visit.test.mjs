import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshot, cleanVisit, startVisit, touchVisit, markSeen, sinceLastVisit, sinceHeadline, sinceText, agoLabel, VISIT_GAP_MS } from '../wallet-src/last-visit.js';
import { EVIDENCE, evidenceItems } from '../wallet-src/outside-evidence.js';
import { splitId } from '../wallet-src/outside-requests.js';

const realPlan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const H = 3600000, T0 = Date.UTC(2026, 10, 10, 9, 0);
const plan = {
  items: [
    { id: 'g1', title: 'Gate one', steps: [{ id: 'a', text: 'Engineering thing.', by: 'engineering', done: true }, { id: 'b', text: 'Outside thing.', by: 'outside' }, { id: 'c', text: 'Your test.', by: 'you' }] },
    { id: 'g2', title: 'Gate two', steps: [{ id: 'd', text: 'Another test.', by: 'you' }, { id: 'e', text: 'Engineering two.', by: 'engineering' }] },
  ],
};
const withDone = (p, keys) => ({ items: p.items.map(g => ({ ...g, steps: g.steps.map(s => (keys.includes(`${g.id}/${s.id}`) ? { ...s, done: true } : s)) })) });
const args = (now, p = plan, ev = { entries: {} }, day = '2026-11-10') => ({ now, snap: snapshot(p, ev), day });

test('last visit: first visit has no baseline and says so', () => {
  const v = startVisit(null, args(T0));
  const s = sinceLastVisit(v, { plan });
  assert.equal(s.first, true);
  assert.match(sinceHeadline(s), /first visit recorded in this browser/);
  assert.equal(sinceText(s, T0), '');
  assert.equal(cleanVisit('nonsense'), null);
  assert.equal(cleanVisit({ last: -5 }), null);
});

test('last visit: a reload within 30 minutes continues the same visit; a later open starts a new one', () => {
  const v1 = startVisit(null, args(T0));
  const p2 = withDone(plan, ['g1/a', 'g2/e']);
  const same = startVisit(touchVisit(v1, args(T0 + 10 * 60000)), args(T0 + 20 * 60000, p2));
  assert.equal(same.baseline, undefined, 'still the first visit');
  assert.equal(same.startedAt, T0);
  // Last used at T0+20min; open again two hours later with a newly finished engineering step.
  const next = startVisit(same, args(T0 + 20 * 60000 + 2 * H, p2, { entries: {} }, '2026-11-10'));
  assert.equal(next.baseline.at, T0 + 20 * 60000);
  const s = sinceLastVisit(next, { plan: p2 });
  // g2/e appeared while away? No: the previous visit's last snapshot already had it (it was taken at T0+20min).
  assert.equal(s.steps.length, 0);
  assert.equal(s.total, 0);
  assert.equal(sinceHeadline(s), 'Nothing changed since your last visit.');
  // Exactly at the gap a new visit starts.
  assert.ok(startVisit(v1, args(T0 + VISIT_GAP_MS)).baseline);
  assert.equal(startVisit(v1, args(T0 + VISIT_GAP_MS - 1)).baseline, undefined);
});

test('last visit: steps recorded done, your results and overdue dates while away', () => {
  const v1 = startVisit(null, args(T0));
  const p2 = withDone(plan, ['g1/a', 'g1/b', 'g2/e']);
  const v2 = startVisit(v1, args(T0 + 26 * H, p2, { entries: {} }, '2026-11-11'));
  const records = {
    'g1/c': { result: 'pass', note: 'secret-free note', at: T0 + 3 * H },
    'g2/d': { result: 'fail', note: '', at: T0 + 5 * H },
    'g1/x': { result: 'pass', at: T0 + 4 * H }, // unknown step: ignored
  };
  const dates = { items: [
    { date: '2026-11-10', state: 'overdue', title: 'Answer privacy request', kind: 'privacy' },
    { date: '2026-11-03', state: 'overdue', title: 'Already overdue last time', kind: 'remind' },
    { date: '2026-11-12', state: 'soon', title: 'Not overdue', kind: 'access' },
  ] };
  const s = sinceLastVisit(v2, { plan: p2, records, dates });
  assert.deepEqual(s.steps.map(x => x.key), ['g1/b', 'g2/e']);
  assert.equal(s.results.pass, 1); assert.equal(s.results.fail, 1);
  assert.deepEqual(s.results.items.map(x => x.key), ['g2/d', 'g1/c'], 'newest first');
  assert.deepEqual(s.overdue.map(x => x.title), ['Answer privacy request']);
  assert.equal(s.total, 5);
  assert.equal(sinceHeadline(s), '2 checklist steps recorded done (1 engineering, 1 outside party) · 2 of your results recorded (1 passed, 1 failed) · 1 date became overdue');
  const text = sinceText(s, T0 + 26 * H);
  assert.match(text, /^Since your last visit \(yesterday\)/);
  assert.match(text, /Done in the checklist: Gate one · /);
  assert.match(text, /Your result: Failed · /);
  assert.doesNotMatch(text, /secret-free note/, 'notes never leave');
});

test('last visit: results recorded before the last visit or during this one are not news', () => {
  const v1 = startVisit(null, args(T0));
  const v2 = startVisit(touchVisit(v1, args(T0 + H)), args(T0 + 5 * H));
  const records = { 'g1/c': { result: 'pass', at: T0 + 0.5 * H }, 'g2/d': { result: 'skip', at: T0 + 6 * H } };
  const s = sinceLastVisit(touchVisit(v2, args(T0 + 7 * H)), { plan, records });
  assert.equal(s.results.items.length, 0);
});

test('last visit: outside evidence ticked while away (real evidence lists)', () => {
  const id = Object.keys(EVIDENCE)[0], pieces = evidenceItems(id).map(i => i.id);
  const ev1 = { entries: { [id]: { got: pieces.slice(0, 1) } } };
  const ev2 = { entries: { [id]: { got: pieces.slice(0, 2) }, 'nobody|x/y': { got: ['z'] } } };
  const v1 = startVisit(null, args(T0, realPlan, ev1));
  const v2 = startVisit(v1, args(T0 + 3 * H, realPlan, ev2));
  const s = sinceLastVisit(v2, { plan: realPlan });
  if (pieces.length < 2) { assert.equal(s.pieces, 0); return; }
  assert.equal(s.pieces, 1);
  assert.equal(s.evidence.length, 1);
  assert.equal(s.evidence[0].step, splitId(id).stepKey);
  assert.equal(s.evidence[0].pieces[0], evidenceItems(id)[1].label);
  assert.match(sinceHeadline(s), /^1 piece of outside evidence ticked as received$/);
  assert.match(sinceText(s, T0 + 3 * H), /evidence for “/);
});

test('last visit: Mark as seen starts the comparison again and survives a reload', () => {
  const v1 = startVisit(null, args(T0));
  const p2 = withDone(plan, ['g1/b']);
  const v2 = startVisit(v1, args(T0 + 2 * H, p2));
  assert.equal(sinceLastVisit(v2, { plan: p2 }).total, 1);
  const seen = markSeen(v2, args(T0 + 2 * H + 60000, p2));
  const s = sinceLastVisit(JSON.parse(JSON.stringify(seen)), { plan: p2 });
  assert.equal(s.total, 0);
  assert.equal(sinceHeadline(s), 'Nothing new since you marked this as seen.');
  const reloaded = startVisit(JSON.parse(JSON.stringify(seen)), args(T0 + 2 * H + 5 * 60000, p2));
  assert.equal(sinceLastVisit(reloaded, { plan: p2 }).seen, true);
});

test('last visit: stored record is cleaned (odd keys, future baseline, broken snapshot)', () => {
  const v = cleanVisit({ last: T0, current: { done: ['g1/a', 'has space', 5, 'g1/a'], pieces: 'x' }, baseline: { at: T0 + 1, day: '2026-11-10', snap: { done: [] } } });
  assert.deepEqual(v.current, { done: ['g1/a'], pieces: [] });
  assert.equal(v.baseline, undefined, 'a baseline after the last visit is dropped');
  assert.equal(cleanVisit({ last: T0, baseline: { at: T0 - 1, day: 'yesterday', snap: {} } }).baseline, undefined);
});

test('last visit: ago labels', () => {
  assert.equal(agoLabel(T0, T0 + 30000), 'a minute ago');
  assert.equal(agoLabel(T0, T0 + 45 * 60000), '45 minutes ago');
  assert.equal(agoLabel(T0, T0 + H), 'an hour ago');
  assert.equal(agoLabel(T0, T0 + 5 * H), '5 hours ago');
  assert.equal(agoLabel(T0, T0 + 30 * H), 'yesterday');
  assert.equal(agoLabel(T0, T0 + 72 * H), '3 days ago');
});

test('last visit: the owner page wires the block into Today and Copy today', () => {
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /from '\.\/last-visit\.js'/);
  assert.match(app, /box\.append\(stats, sinceBlock\(\)\)/);
  assert.match(app, /sinceText\(sinceLastVisit\(visitRecord/);
});
