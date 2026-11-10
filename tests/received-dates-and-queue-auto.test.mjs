import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evidenceItems, cleanEvidence, setItem, setReceivedDate, evidenceState, evidenceSummary, evidenceReportLines, parseEvidenceReport, mergeEvidence, isEvidenceLine } from '../wallet-src/outside-evidence.js';
import { requestId } from '../wallet-src/outside-requests.js';
import { looksSecret } from '../wallet-src/launch-tracker.js';
import { queueAutoDue, queueChange, AUTO_CHECK_MS } from '../wallet-src/tx-tracker.js';

const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const A = requestId('counsel', 'legal/analysis'), D = requestId('data', 'assets/prices');
const T0 = Date.parse('2026-11-09T10:00:00Z');
const empty = { entries: {} };

test('received-on dates: only for ticked pieces, real days, not in the future; unticking drops the date', () => {
  let r = setItem(empty, A, 'memo', true, { now: T0 });
  assert.match(setReceivedDate(r.log, A, 'aml', '2026-11-01').error, /Tick the piece/);
  assert.match(setReceivedDate(r.log, A, 'nope', '2026-11-01').error, /Unknown piece/);
  assert.match(setReceivedDate(r.log, 'x|y/z', 'memo', '2026-11-01').error, /Unknown request/);
  assert.match(setReceivedDate(r.log, A, 'memo', '2026-02-30').error, /real date/);
  assert.match(setReceivedDate(r.log, A, 'memo', '2023-12-31').error, /real date/);
  assert.match(setReceivedDate(r.log, A, 'memo', '2026-11-12', { today: '2026-11-10' }).error, /future/);
  r = setReceivedDate(r.log, A, 'memo', '2026-11-03', { now: T0 + 1, today: '2026-11-10' });
  assert.deepEqual(r.log.entries[A], { got: ['memo'], changed: T0 + 1, on: { memo: '2026-11-03' } });
  assert.ok(setReceivedDate(r.log, A, 'memo', '2026-11-03').unchanged);
  r = setItem(r.log, A, 'aml', true, { now: T0 + 2 });
  assert.deepEqual(r.log.entries[A].on, { memo: '2026-11-03' }, 'ticking another piece keeps the dates');
  r = setItem(r.log, A, 'memo', false, { now: T0 + 3 });
  assert.deepEqual(r.log.entries[A], { got: ['aml'], changed: T0 + 3 }, 'date goes with the tick');
  r = setReceivedDate(r.log, A, 'aml', '2026-11-05', { now: T0 + 4 });
  r = setReceivedDate(r.log, A, 'aml', '', { now: T0 + 5 });
  assert.deepEqual(r.log.entries[A], { got: ['aml'], changed: T0 + 5 }, 'clearing removes it');
  assert.deepEqual(cleanEvidence({ entries: { [A]: { got: ['memo'], changed: 1, on: { memo: '2026-11-03', aml: '2026-11-04', x: 'junk' } } } }).entries[A], { got: ['memo'], changed: 1, on: { memo: '2026-11-03' } });
  assert.deepEqual(cleanEvidence({ entries: { [A]: { got: ['memo'], changed: 1, on: { memo: 'yesterday' } } } }).entries[A], { got: ['memo'], changed: 1 });
});

test('state and summary show when pieces arrived', () => {
  const part = evidenceState(A, { got: ['memo', 'licences'], on: { memo: '2026-11-03', licences: '2026-11-06' } });
  assert.match(part.label, /^2 of 5 received · still missing: .* · arrived 2026-11-03 to 2026-11-06$/);
  assert.deepEqual(part.receivedOn, { memo: '2026-11-03', licences: '2026-11-06' });
  assert.equal(part.firstReceived, '2026-11-03'); assert.equal(part.lastReceived, '2026-11-06');
  assert.match(evidenceState(A, { got: ['memo'], on: { memo: '2026-11-03' } }).label, / · arrived 2026-11-03$/);
  const ids = evidenceItems(D).map(i => i.id), on = Object.fromEntries(ids.map((x, i) => [x, `2026-11-0${i + 1}`]));
  assert.equal(evidenceState(D, { got: ids, on }).label, 'Everything is in (4 of 4) · last piece arrived 2026-11-04');
  assert.equal(evidenceState(D, { got: ids }).label, 'Everything is in (4 of 4)', 'unchanged without dates');
  const md = evidenceSummary({ entries: { [A]: { got: ['memo'], changed: 1, on: { memo: '2026-11-03' } } } }, [{ id: A, title: 'Legal analysis' }], { date: new Date(T0) });
  assert.match(md, /- \[x\] Written memo or email with the conclusions \(received 2026-11-03\)/);
  assert.match(md, /- \[ \] Covers federal/);
});

test('dates travel in the test report, old lines still read, and the later change wins', () => {
  const log = { entries: { [A]: { got: ['memo', 'aml'], changed: T0, on: { memo: '2026-11-03' } }, [D]: { got: ['plan'], changed: T0 } } };
  const lines = evidenceReportLines(log);
  const line = lines.find(l => l.includes('legal/analysis'));
  assert.equal(line, '- counsel · legal/analysis · got memo on 2026-11-03, aml · changed 2026-11-09 10:00 UTC');
  assert.ok(isEvidenceLine(line)); assert.equal(looksSecret(line), false);
  const back = parseEvidenceReport(lines.join('\n'));
  assert.equal(back.unknown, 0);
  assert.deepEqual(back.log, { entries: { [A]: { got: ['memo', 'aml'], changed: T0, on: { memo: '2026-11-03' } }, [D]: { got: ['plan'], changed: T0 } } });
  const old = parseEvidenceReport('## Outside evidence received\n\n- counsel · legal/analysis · got memo, aml · changed 2026-11-09 10:00 UTC\n');
  assert.deepEqual(old.log.entries[A], { got: ['memo', 'aml'], changed: T0 });
  const bad = parseEvidenceReport('## Outside evidence received\n\n- counsel · legal/analysis · got memo on 2026-02-30 · changed 2026-11-09 10:00 UTC\n- counsel · legal/terms · got terms on soon\n');
  assert.equal(bad.unknown, 2); assert.deepEqual(bad.log.entries, {});
  // Same ticks, different date: the later change wins; same minute keeps this browser's.
  const here = { entries: { [A]: { got: ['memo'], changed: T0, on: { memo: '2026-11-03' } } } };
  const later = { entries: { [A]: { got: ['memo'], changed: T0 + 120000, on: { memo: '2026-11-02' } } } };
  const m = mergeEvidence(here, later);
  assert.deepEqual(m.updated, [A]); assert.equal(m.log.entries[A].on.memo, '2026-11-02');
  assert.deepEqual(mergeEvidence(later, here).kept, [A]);
  assert.deepEqual(mergeEvidence(here, here).same, [A]);
});

test('wallet number auto re-check: 30-second rule, only on the same network and while something waits', () => {
  const q = { from: '0xab', used: 5, next: 6, waiting: 1 }, base = { enabled: true, hidden: false, busy: false, connected: true, sameNetwork: true, queue: q, lastRun: 0, now: AUTO_CHECK_MS };
  assert.equal(queueAutoDue(base), true);
  assert.equal(queueAutoDue({ ...base, now: AUTO_CHECK_MS - 1 }), false, 'too soon');
  for (const k of [['enabled', false], ['hidden', true], ['busy', true], ['connected', false], ['sameNetwork', false]]) assert.equal(queueAutoDue({ ...base, [k[0]]: k[1] }), false, k[0]);
  assert.equal(queueAutoDue({ ...base, queue: { ...q, waiting: 0 } }), false, 'nothing waiting');
  assert.equal(queueAutoDue({ ...base, queue: { ...q, waiting: 0 }, pageWaiting: 1 }), true, 'a page transaction not in the queue yet');
  assert.equal(queueAutoDue({ ...base, lastRun: null }), true);
});

test('wallet number change: what went through and what joined, in one sentence', () => {
  const a = { from: '0xab', used: 5, next: 8, waiting: 3 };
  assert.equal(queueChange(a, a), '');
  assert.equal(queueChange(a, { ...a, used: 6, waiting: 2 }), 'Number 5 went through; 2 are still waiting, starting with number 6.');
  assert.equal(queueChange(a, { ...a, used: 8, waiting: 0 }), 'Numbers 5 to 7 went through; nothing is waiting now.');
  assert.equal(queueChange(a, { ...a, used: 7, next: 9, waiting: 2 }), 'Numbers 5 and 6 went through; a new transaction joined the queue (number 8); 2 are still waiting, starting with number 7.');
  assert.equal(queueChange(a, { ...a, used: 5, next: 9, waiting: 4 }), 'A new transaction joined the queue (number 8); 4 are still waiting, starting with number 5.');
  assert.match(queueChange(a, { ...a, used: 4, waiting: 4 }), /^The network now reports fewer used numbers/);
  assert.equal(queueChange(a, { ...a, from: '0xcd', used: 9 }), '', 'another wallet');
  assert.equal(queueChange({ from: '0xab', used: 5, next: 6, waiting: 1 }, { from: '0xab', used: 6, next: 6, waiting: 0 }), 'Number 5 went through; nothing is waiting now.');
});

test('app wires the automatic wallet re-check and the received-on dates without touching signing', () => {
  assert.match(app, /setInterval\(queueAutoTick, 5000\)/);
  assert.match(app, /queueAutoDue\(\{ enabled: entry\.auto, hidden: document\.hidden, busy/);
  assert.match(app, /id = 'queue-auto'/);
  assert.match(app, /if \(!left\) now\.auto = false/);
  assert.match(app, /setReceivedDate\(outsideEvidence, id, it\.id, di\.value/);
  const tick = app.slice(app.indexOf('async function queueAutoTick'), app.indexOf('setInterval(queueAutoTick'));
  assert.doesNotMatch(tick, /sendTransaction|eth_send|signTypedData|personal_sign/);
});
