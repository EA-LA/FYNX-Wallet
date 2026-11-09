import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { requestId, isRequestId, cleanRequests, setDate, requestState, partyRequests, partyRequestLine, outsideAttention, requestReportLines, parseRequestReport, mergeRequests, isRequestLine, CHASE_DAYS } from '../wallet-src/outside-requests.js';
import { outsideBrief } from '../wallet-src/outside-handoff.js';
import { parseReport, reportMarkdown } from '../wallet-src/launch-tracker.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const A = requestId('counsel', 'legal/analysis'), D = requestId('data', 'assets/prices');
const T0 = Date.parse('2026-11-09T10:00:00Z');
const empty = { entries: {} };

test('only requests that exist in a hand-off list are accepted; junk is dropped', () => {
  assert.ok(isRequestId(A) && isRequestId(D));
  assert.ok(!isRequestId('counsel|assets/prices') && !isRequestId('nobody|legal/analysis'));
  const log = cleanRequests({ entries: { [A]: { sent: '2026-11-01', answered: '2026-10-01', changed: 5 }, 'x|y/z': { sent: '2026-11-01' }, [D]: { sent: 'soon' } } });
  assert.deepEqual(log, { entries: { [A]: { sent: '2026-11-01', answered: '', changed: 5 } } }, 'answer before sending is dropped; bad date with no change time is dropped');
  assert.deepEqual(cleanRequests(null), empty);
});

test('setting dates: sent first, no future dates, no answer before sending, clearing sent clears both', () => {
  const today = '2026-11-09';
  assert.match(setDate(empty, A, 'answered', '2026-11-05', { today }).error, /sent the request first/);
  assert.match(setDate(empty, A, 'sent', '2026-11-10', { today }).error, /future/);
  assert.match(setDate(empty, A, 'sent', '2026-02-30', { today }).error, /full date/);
  let r = setDate(empty, A, 'sent', '2026-11-01', { today, now: T0 });
  assert.deepEqual(r.log.entries[A], { sent: '2026-11-01', answered: '', changed: T0 });
  assert.match(setDate(r.log, A, 'answered', '2026-10-30', { today }).error, /cannot be before/);
  r = setDate(r.log, A, 'answered', '2026-11-08', { today, now: T0 + 1 });
  assert.equal(r.log.entries[A].answered, '2026-11-08');
  assert.match(setDate(r.log, A, 'sent', '2026-11-09', { today }).error, /answer date \(2026-11-08\) is before/);
  assert.ok(setDate(r.log, A, 'sent', '2026-11-01', { today }).unchanged);
  const cleared = setDate(r.log, A, 'sent', '', { today, now: T0 + 2 }).log;
  assert.deepEqual(cleared.entries[A], { sent: '', answered: '', changed: T0 + 2 }, 'a cleared marker stays so the clearing travels');
  assert.match(setDate(empty, 'x|y', 'sent', '2026-11-01').error, /Unknown/);
});

test('state: not sent, waiting with reminder date, reminder due after CHASE_DAYS, answered with days taken', () => {
  assert.equal(requestState(undefined, '2026-11-09').state, 'not-sent');
  const w = requestState({ sent: '2026-11-01', answered: '' }, '2026-11-09');
  assert.equal(w.state, 'waiting'); assert.equal(w.days, 8); assert.equal(w.chaseOn, '2026-11-15');
  assert.match(w.label, /8 days ago.*reminder from 2026-11-15/);
  assert.equal(requestState({ sent: '2026-11-09', answered: '' }, '2026-11-09').label.includes('today'), true);
  const c = requestState({ sent: '2026-10-20', answered: '' }, '2026-11-09');
  assert.equal(c.state, 'chase'); assert.equal(c.days, 20); assert.match(c.label, /send a reminder/);
  assert.equal(requestState({ sent: '2026-10-26', answered: '' }, '2026-11-09').state, 'chase', `exactly ${CHASE_DAYS} days is a reminder`);
  const a = requestState({ sent: '2026-11-01', answered: '2026-11-04' }, '2026-11-09');
  assert.equal(a.state, 'answered'); assert.equal(a.days, 3); assert.match(a.label, /after 3 days/);
  assert.match(requestState({ sent: '2026-11-01', answered: '2026-11-01' }, '2026-11-09').label, /same day/);
});

test('party counts and attention list (longest waiting first, done steps skipped)', () => {
  const log = { entries: {
    [A]: { sent: '2026-10-01', answered: '', changed: 1 },
    [requestId('counsel', 'legal/terms')]: { sent: '2026-11-05', answered: '', changed: 1 },
    [requestId('counsel', 'international/country-review')]: { sent: '2026-10-01', answered: '2026-10-03', changed: 1 },
    [D]: { sent: '2026-10-20', answered: '', changed: 1 },
  } };
  const s = partyRequests(log, 'counsel', ['legal/analysis', 'legal/terms', 'international/country-review'], '2026-11-09');
  assert.deepEqual(s, { sent: 3, waiting: 1, chase: 1, answered: 1 });
  assert.equal(partyRequestLine(s), '1 to chase, 1 awaiting answer, 1 answered');
  assert.equal(partyRequestLine({ sent: 0, waiting: 0, chase: 0, answered: 0 }), '');
  const att = outsideAttention(log, '2026-11-09');
  assert.deepEqual(att.next.map(x => x.id), [A, D]);
  assert.equal(att.next[0].party.id, 'counsel'); assert.equal(att.next[0].days, 39);
  assert.deepEqual(outsideAttention(log, '2026-11-09', { skip: new Set([A]) }).next.map(x => x.id), [D]);
  assert.equal(outsideAttention(log, '2026-11-09', { limit: 1 }).next.length, 1);
});

test('report round trip: dates travel, cleared markers travel, nothing else; secret check stays quiet', () => {
  const log = { entries: {
    [A]: { sent: '2026-11-01', answered: '2026-11-04', changed: T0 },
    [D]: { sent: '', answered: '', changed: T0 + 60000 },
    [requestId('reviewer', 'swaps/review')]: { sent: '2026-11-02', answered: '', changed: T0 },
  } };
  const lines = requestReportLines(log);
  assert.ok(lines.includes('- counsel · legal/analysis · sent 2026-11-01 · answered 2026-11-04 · changed 2026-11-09 10:00 UTC'));
  assert.ok(lines.includes('- data · assets/prices · not sent · changed 2026-11-09 10:01 UTC'));
  assert.ok(lines.filter(l => l.startsWith('- ')).every(isRequestLine));
  assert.deepEqual(requestReportLines(empty), []);
  const text = reportMarkdown(plan, {}, { appendix: lines });
  const back = parseRequestReport(text);
  assert.equal(back.unknown, 0);
  assert.deepEqual(back.log.entries, log.entries);
  const parsed = parseReport(text, plan);
  assert.equal(parsed.secret, false);
  const bad = parseRequestReport('## Outside party requests\n- counsel · legal/analysis · sent 2026-11-05 · answered 2026-11-01\n- counsel · assets/prices · sent 2026-11-05\n- counsel · legal/analysis · sent yesterday\n## Other\n- data · assets/prices · sent 2026-11-01');
  assert.equal(bad.unknown, 3); assert.deepEqual(bad.log.entries, {});
});

test('merge: new added, later change wins, same minute keeps this browser, cleared markers only update', () => {
  const local = { entries: { [A]: { sent: '2026-11-01', answered: '', changed: T0 }, [D]: { sent: '2026-11-02', answered: '', changed: T0 + 120000 } } };
  const incoming = { entries: {
    [A]: { sent: '2026-11-01', answered: '2026-11-06', changed: T0 + 60000 },
    [D]: { sent: '', answered: '', changed: T0 + 60000 },
    [requestId('reviewer', 'swaps/review')]: { sent: '2026-11-03', answered: '', changed: T0 },
    [requestId('provider', 'fiat/approval')]: { sent: '', answered: '', changed: T0 },
  } };
  const m = mergeRequests(local, incoming);
  assert.deepEqual(m.updated, [A]); assert.deepEqual(m.kept, [D]); assert.deepEqual(m.added, [requestId('reviewer', 'swaps/review')]);
  assert.equal(m.log.entries[A].answered, '2026-11-06');
  assert.equal(m.log.entries[D].sent, '2026-11-02');
  assert.ok(!(requestId('provider', 'fiat/approval') in m.log.entries), 'a cleared marker for something this browser never had adds nothing');
  const sameMinute = mergeRequests(local, { entries: { [A]: { sent: '2026-10-30', answered: '', changed: T0 + 30000 } } });
  assert.deepEqual(sameMinute.kept, [A]);
  assert.deepEqual(mergeRequests(local, { entries: { [A]: { ...local.entries[A] } } }).same, [A]);
  const clear = mergeRequests(local, { entries: { [A]: { sent: '', answered: '', changed: T0 + 60000 } } });
  assert.deepEqual(clear.updated, [A]); assert.equal(clear.log.entries[A].sent, '');
});

test('the hand-off list says when a request was first sent', () => {
  const date = new Date('2026-11-09T10:00:00Z');
  const plain = outsideBrief(plan, {}, 'data', {}, { date });
  assert.ok(!/Reminder:/.test(plain));
  const again = outsideBrief(plan, {}, 'data', {}, { date, sent: { 'assets/prices': { sent: '2026-10-20', answered: '' } } });
  assert.match(again, /Reminder: we first sent this request on 2026-10-20\./);
  const answered = outsideBrief(plan, {}, 'data', {}, { date, sent: { 'assets/prices': { sent: '2026-10-20', answered: '2026-10-25' } } });
  assert.match(answered, /Your answer of 2026-10-25 is noted/);
});
