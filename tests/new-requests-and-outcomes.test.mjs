import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshot, startVisit, sinceLastVisit, sinceHeadline, sinceText, cleanVisit } from '../wallet-src/last-visit.js';
import { cleanRegister, addSubmitted, recordOutcome, lastSubmitted, mergeRegisters, registerReportLines, parseRegisterReport, OUTCOMES } from '../wallet-src/pilot-register.js';
import { todayBrief, briefText, lastSentStatus } from '../wallet-src/today-brief.js';

const realPlan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const H = 3600000, T0 = Date.UTC(2026, 10, 10, 9, 0);
const ASK = 'counsel|legal/analysis', ASK2 = 'transak|payments/provider-review';

// ---- Since your last visit: privacy requests logged and outside requests sent between visits ----

test('since last visit: new privacy requests logged and outside requests sent are listed (ids only in the record)', () => {
  const privacyBefore = { entries: [{ id: 'pr-old', received: '2026-10-01', type: 'access' }] };
  const outsideBefore = { entries: { [ASK]: { sent: '', answered: '', changed: T0 } } };
  const snap0 = snapshot(realPlan, { entries: {} }, { privacy: privacyBefore, outside: outsideBefore });
  assert.deepEqual(snap0.logged, ['pr-old']);
  assert.deepEqual(snap0.sent, []);
  const v1 = startVisit(null, { now: T0, snap: snap0, day: '2026-11-10' });

  // Brought in from another device while this browser was away: two requests logged, one already answered.
  const privacyAfter = { entries: [
    privacyBefore.entries[0],
    { id: 'pr-fresh', received: '2026-11-11', type: 'delete', ref: 'Ticket 77', note: 'private words' },
    { id: 'pr-stale', received: '2026-10-01', type: 'correct' },
    { id: 'pr-done', received: '2026-11-10', type: 'access', answered: '2026-11-11', outcome: 'replied' },
  ] };
  const outsideAfter = { entries: { [ASK]: { sent: '2026-11-11', answered: '', changed: T0 + H } } };
  const snap1 = snapshot(realPlan, { entries: {} }, { privacy: privacyAfter, outside: outsideAfter });
  const v2 = startVisit(v1, { now: T0 + 30 * H, snap: snap1, day: '2026-11-11' });
  assert.doesNotMatch(JSON.stringify(v2), /Ticket 77|private words|received|"sent":\["20/, 'the record keeps ids only');

  const s = sinceLastVisit(v2, { plan: realPlan, privacy: privacyAfter, outside: outsideAfter, today: '2026-11-12' });
  assert.deepEqual(s.logged.map(p => p.id), ['pr-fresh', 'pr-stale'], 'the answered one is listed once, under answered');
  const fresh = s.logged[0], stale = s.logged[1];
  assert.equal(fresh.type, 'Asked to be removed'); assert.equal(fresh.due, '2026-12-11'); assert.equal(fresh.overdue, false);
  assert.equal(stale.overdue, true, 'received 2026-10-01, answer target 2026-10-31');
  assert.equal(s.privacy.length, 1); assert.equal(s.privacy[0].id, 'pr-done');
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].party, 'Lawyer (U.S. counsel)'); assert.equal(s.sent[0].sent, '2026-11-11');
  assert.equal(s.total, 4);

  const line = sinceHeadline(s);
  assert.match(line, /1 outside request sent/);
  assert.match(line, /2 new privacy requests logged \(1 overdue\)/);
  assert.match(line, /1 privacy request answered/);
  const text = sinceText(s, T0 + 30 * H);
  assert.match(text, /- Request sent to Lawyer \(U\.S\. counsel\) on 2026-11-11: /);
  assert.match(text, /- New privacy request received 2026-11-11: Asked to be removed · answer by 2026-12-11/);
  assert.match(text, /- New privacy request received 2026-10-01: Asked to fix their address · answer by 2026-10-31 · overdue/);
  assert.doesNotMatch(text, /Ticket 77|private words/);
});

test('since last visit: a request sent and answered while away is listed once (answered); older records report nothing new', () => {
  const outside0 = { entries: {} }, privacy = { entries: [{ id: 'pr-a', received: '2026-11-01', type: 'other' }] };
  const v1 = startVisit(null, { now: T0, snap: snapshot(realPlan, { entries: {} }, { privacy, outside: outside0 }), day: '2026-11-10' });
  const outside1 = { entries: { [ASK]: { sent: '2026-11-10', answered: '2026-11-11', changed: T0 + H } } };
  const v2 = startVisit(v1, { now: T0 + 30 * H, snap: snapshot(realPlan, { entries: {} }, { privacy, outside: outside1 }), day: '2026-11-11' });
  const s = sinceLastVisit(v2, { plan: realPlan, privacy, outside: outside1 });
  assert.equal(s.asks.length, 1); assert.deepEqual(s.sent, []); assert.deepEqual(s.logged, []);

  // A record written before these lists existed: nothing is reported for them (not every request at once).
  const old = { last: T0, lastDay: '2026-11-10', startedAt: T0, current: { done: [], pieces: [], privacy: [], asks: [] } };
  assert.equal(cleanVisit(old).current.logged, undefined);
  const outside2 = { entries: { [ASK2]: { sent: '2026-11-10', answered: '', changed: T0 } } };
  const v3 = startVisit(old, { now: T0 + 5 * H, snap: snapshot(realPlan, { entries: {} }, { privacy, outside: outside2 }), day: '2026-11-10' });
  const s3 = sinceLastVisit(v3, { plan: realPlan, privacy, outside: outside2 });
  assert.deepEqual(s3.logged, []); assert.deepEqual(s3.sent, []);
  // Odd ids and unknown parties are left out.
  const outside3 = { entries: { ...outside2.entries, 'nobody|legal/analysis': { sent: '2026-11-11' } } };
  const v4 = startVisit(v3, { now: T0 + 40 * H, snap: snapshot(realPlan, { entries: {} }, { privacy, outside: outside3 }), day: '2026-11-11' });
  assert.deepEqual(sinceLastVisit(v4, { plan: realPlan, privacy, outside: outside3 }).sent, []);
});

test('since last visit: the page passes today and shows new-request and sent rows', () => {
  assert.match(app, /const sinceInputs = \(\) => \(\{[^\n]*today: localToday\(\) \}\)/);
  assert.match(app, /row\('New request'/);
  assert.match(app, /row\('Sent'/);
  assert.match(app, /s\.logged\.length \+ s\.sent\.length;/);
});

// ---- Pilot register: the last status check's answer is kept with transfers sent from FYNX ----

const HASH = n => `0x${String(n).padStart(64, 'a')}`;
const item = (n, at, chainId = 84532) => ({ hash: HASH(n), label: 'Send 0.01 ETH', network: { id: chainId }, address: `0x${'b'.repeat(40)}`, submittedAt: at });

test('pilot register: a settled status answer is kept with the transfer; waiting answers change nothing', () => {
  let reg = addSubmitted({ entries: [] }, item(1, T0));
  assert.equal(recordOutcome(reg, { hash: HASH(1), chainId: 84532, status: 'pending' }), reg, 'waiting: same object, nothing to save');
  assert.equal(recordOutcome(reg, { hash: HASH(1), chainId: 84532, status: 'not-found' }), reg);
  assert.equal(recordOutcome(reg, { hash: HASH(1), chainId: 1, status: 'confirmed' }), reg, 'other network: no match');
  assert.equal(recordOutcome(reg, { hash: HASH(9), chainId: 84532, status: 'confirmed' }), reg, 'not sent from FYNX: not added');
  assert.equal(recordOutcome(reg, { hash: 'nope', chainId: 84532, status: 'confirmed' }), reg);

  reg = recordOutcome(reg, { hash: HASH(1).toUpperCase().replace('0X', '0x'), chainId: 84532, status: 'confirmed', deep: false }, T0 + H);
  assert.equal(reg.entries[0].outcome, 'confirmed'); assert.equal(reg.entries[0].outcomeAt, T0 + H); assert.equal(reg.entries[0].deep, undefined);
  const same = recordOutcome(reg, { hash: HASH(1), chainId: 84532, status: 'confirmed', deep: false }, T0 + 2 * H);
  assert.equal(same, reg, 'an unchanged answer is not saved again');
  reg = recordOutcome(reg, { hash: HASH(1), chainId: 84532, status: 'confirmed', deep: true }, T0 + 2 * H);
  assert.equal(reg.entries[0].deep, true);
  // A later "waiting" (slow node) never wipes it.
  assert.equal(recordOutcome(reg, { hash: HASH(1), chainId: 84532, status: 'pending' }).entries[0].outcome, 'confirmed');
  // The answer survives saving and reading back; odd values are dropped.
  const back = cleanRegister(JSON.parse(JSON.stringify(reg)));
  assert.deepEqual(back.entries[0], reg.entries[0]);
  const odd = cleanRegister({ entries: [{ ...reg.entries[0], outcome: 'stolen', outcomeAt: T0 }, { ...reg.entries[0], hash: HASH(2), outcome: 'failed', outcomeAt: -1 }] });
  assert.equal(odd.entries.every(e => !e.outcome && !e.outcomeAt), true);
  // Marks never carry an outcome.
  const marked = cleanRegister({ entries: [{ hash: HASH(3), chainId: 84532, kind: 'marked', reason: 'other-app', at: T0, outcome: 'confirmed', outcomeAt: T0 }] });
  assert.equal(marked.entries[0].outcome, undefined);
  assert.deepEqual(Object.keys(OUTCOMES), ['confirmed', 'failed', 'replaced', 'dropped']);
});

test('pilot register: newest transfer sent from FYNX with its answer; the report carries it and parses back', () => {
  assert.equal(lastSubmitted({ entries: [] }), null);
  let reg = addSubmitted(addSubmitted({ entries: [] }, item(1, T0)), item(2, T0 + H));
  reg = recordOutcome(reg, { hash: HASH(1), chainId: 84532, status: 'failed' }, T0 + 2 * H);
  let last = lastSubmitted(reg);
  assert.equal(last.hash, HASH(2)); assert.equal(last.outcome, null);
  reg = recordOutcome(reg, { hash: HASH(2), chainId: 84532, status: 'replaced' }, T0 + 3 * H);
  last = lastSubmitted(reg);
  assert.equal(last.outcome, 'replaced'); assert.equal(last.deep, false);
  // Since 2026-11-13 the last answer travels in the test report (fixed words in brackets) and parses back.
  const lines = registerReportLines(reg).join('\n');
  assert.match(lines, /\[last check: replaced in the wallet · /); assert.match(lines, /\[last check: failed on-chain · /);
  const parsed = parseRegisterReport(lines);
  assert.equal(parsed.unknown, 0); assert.equal(parsed.register.entries.length, 2);
  assert.equal(parsed.register.entries.find(e => e.hash === HASH(2)).outcome, 'replaced');
  // Bringing in another device's report keeps this browser's answers.
  const merged = mergeRegisters(reg, parsed.register);
  assert.equal(merged.register.entries.find(e => e.hash === HASH(2)).outcome, 'replaced');
});

test('today: the wallet tile says whether the last transfer from FYNX went through', () => {
  assert.equal(lastSentStatus(null), 'result not checked yet');
  assert.equal(lastSentStatus('confirmed'), 'confirmed');
  assert.equal(lastSentStatus('confirmed', true), 'confirmed and settled');
  assert.equal(lastSentStatus('failed'), 'failed on-chain');
  assert.equal(lastSentStatus('replaced'), 'replaced in the wallet');
  assert.equal(lastSentStatus('dropped'), 'dropped, nothing spent');
  assert.equal(lastSentStatus('weird'), '');
  const base = { overview: { done: 1, total: 10, percent: 10, yours: 4, yoursDone: 1, failed: 0 } };
  const tile = todayBrief({ ...base, wallet: { total: 19, done: 3, lastSent: { day: '2026-11-12', when: 'Nov 12', network: 'Base Sepolia', status: 'confirmed and settled' } } }).stats.at(-1);
  assert.equal(tile.detail, 'last sent Nov 12 · Base Sepolia · confirmed and settled');
  const plain = todayBrief({ ...base, wallet: { total: 19, done: 3, lastSent: { day: '2026-11-12', network: 'Base Sepolia', status: '' } } }).stats.at(-1);
  assert.equal(plain.detail, 'last sent 2026-11-12 · Base Sepolia');
  assert.match(briefText(todayBrief({ ...base, wallet: { total: 19, done: 3, lastSent: { day: '2026-11-12', network: 'Base', status: 'failed on-chain' } } })), /last sent 2026-11-12 · Base · failed on-chain/);
  // The page records answers from Track checks and lookups (checkStatus) and found replacements.
  assert.match(app, /const before = item\?\.status;\n  rememberOutcome\(hash, current\.network\.id, result\);/);
  assert.match(app, /rememberOutcome\(found\.hash, item\.network\.id, found\);/);
  assert.match(app, /status: lastSentStatus\(last\.outcome, last\.deep\)/);
});
