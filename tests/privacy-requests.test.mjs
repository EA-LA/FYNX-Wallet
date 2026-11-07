import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PRIVACY_KEY, TARGET_DAYS, TYPES, OUTCOMES, dayNumber, addDays, localToday, textProblem, cleanLog, addRequest, answerRequest, reopenRequest, removeRequest, requestState, logSummary, logMarkdown, defaultOutcome, MAX_ENTRIES } from '../wallet-src/privacy-requests.js';

const today = '2026-11-07', empty = { entries: [] };
const add = (log, input, n = 1) => addRequest(log, { type: 'access', ...input }, { today, now: 1000 + n, id: `pr-${n}` });

test('dates are strict calendar days', () => {
  assert.equal(dayNumber('2026-02-30'), null);
  assert.equal(dayNumber('2026-11-7'), null);
  assert.equal(dayNumber('nope'), null);
  assert.equal(addDays('2026-11-07', 30), '2026-12-07');
  assert.equal(addDays('2026-01-31', 30), '2026-03-02');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(localToday(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('a request is added with a due date 30 days after it arrived', () => {
  const { log, entry, error } = add(empty, { received: '2026-11-01', ref: 'Ticket 12' });
  assert.equal(error, undefined);
  assert.equal(log.entries.length, 1);
  assert.deepEqual({ ...entry }, { id: 'pr-1', received: '2026-11-01', type: 'access', ref: 'Ticket 12', note: '', added: 1001 });
  const st = requestState(entry, today);
  assert.equal(TARGET_DAYS, 30);
  assert.equal(st.due, '2026-12-01');
  assert.equal(st.state, 'open');
  assert.equal(st.label, 'Due in 24 days');
});

test('bad input is refused with a plain reason', () => {
  assert.match(add(empty, { received: '' }).error, /date the request arrived/);
  assert.match(add(empty, { received: '2026-11-08' }).error, /future/);
  assert.match(add(empty, { received: '2023-01-01' }).error, /two years/);
  assert.match(add(empty, { received: today, type: 'spam' }).error, /what the person asked/);
  assert.match(add(empty, { received: today, ref: 'ann@gmail.com' }).error, /email address/);
  assert.match(add(empty, { received: today, note: 'from bob at bob@x.io' }).error, /email address/);
  const phrase = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
  assert.match(add(empty, { received: today, note: phrase }).error, /recovery phrase/);
  assert.equal(textProblem('Subject: delete me', 'x'), '');
});

test('due soon, due today and overdue are told apart', () => {
  const s = r => requestState({ received: r, type: 'delete' }, today);
  assert.equal(s('2026-10-15').state, 'due-soon');
  assert.equal(s('2026-10-15').label, 'Due in 7 days');
  assert.equal(s('2026-10-08').label, 'Due today');
  assert.equal(s('2026-10-07').state, 'overdue');
  assert.equal(s('2026-10-07').label, 'Overdue by 1 day');
  assert.equal(s('2026-10-01').label, 'Overdue by 7 days');
});

test('answering records the outcome and whether it was on time', () => {
  let { log } = add(empty, { received: '2026-10-01', type: 'delete' }, 1);
  ({ log } = add(log, { received: '2026-11-05' }, 2));
  assert.match(answerRequest(log, 'pr-1', { answered: '2026-09-30' }).error, /before the request/);
  assert.match(answerRequest(log, 'pr-x', { answered: today }).error, /no longer/);
  const late = answerRequest(log, 'pr-1', { answered: '2026-11-03' });
  assert.equal(late.entry.outcome, 'removed');
  assert.equal(requestState(late.entry, today).state, 'late');
  assert.equal(requestState(late.entry, today).label, 'Answered 2026-11-03 · 33 days · 3 days late');
  const onTime = answerRequest(late.log, 'pr-2', { answered: '2026-11-06', outcome: 'no-record' });
  assert.equal(requestState(onTime.entry, today).label, 'Answered 2026-11-06 · 1 day');
  const sum = logSummary(onTime.log, today);
  assert.deepEqual({ open: sum.open, answered: sum.answered, onTime: sum.onTime, late: sum.late, avgDays: sum.avgDays, recent: sum.recent }, { open: 0, answered: 2, onTime: 1, late: 1, avgDays: 17, recent: 2 });
  const reopened = reopenRequest(onTime.log, 'pr-2');
  assert.equal(reopened.entries.find(e => e.id === 'pr-2').answered, undefined);
  assert.equal(removeRequest(reopened, 'pr-2').entries.length, 1);
  for (const t of TYPES) assert.ok(OUTCOMES.some(o => o[0] === defaultOutcome(t[0])));
});

test('open requests come first, oldest (most urgent) on top; summary counts urgency', () => {
  let log = empty;
  for (const [n, received] of [[1, '2026-11-06'], [2, '2026-10-01'], [3, '2026-10-12']]) ({ log } = add(log, { received }, n));
  ({ log } = answerRequest(log, 'pr-1', { answered: today }));
  assert.deepEqual(log.entries.map(e => e.id), ['pr-2', 'pr-3', 'pr-1']);
  const s = logSummary(log, today);
  assert.equal(s.open, 2); assert.equal(s.overdue, 1); assert.equal(s.dueSoon, 1); assert.equal(s.nextDue, '2026-10-31');
});

test('stored logs are re-cleaned: emails, secrets, bad dates and duplicates are dropped', () => {
  const raw = { entries: [
    { id: 'pr-a', received: '2026-11-01', type: 'access', ref: 'ann@gmail.com', note: 'ok note', added: 1 },
    { id: 'pr-a', received: '2026-11-02', type: 'access' },
    { id: 'pr-b', received: '2026-13-01', type: 'access' },
    { id: 'pr-c', received: '2026-11-01', type: 'hack' },
    { id: 'BAD ID', received: '2026-11-01', type: 'access' },
    { id: 'pr-d', received: '2026-11-01', type: 'delete', answered: '2026-10-01', outcome: 'removed' },
    { id: 'pr-e', received: '2026-11-01', type: 'stop', answered: '2026-11-02', outcome: 'weird' },
  ] };
  const log = cleanLog(raw);
  assert.deepEqual(log.entries.map(e => e.id), ['pr-a', 'pr-d', 'pr-e']);
  assert.equal(log.entries[0].ref, '');
  assert.equal(log.entries[0].note, 'ok note');
  assert.equal(log.entries[1].answered, undefined);
  assert.equal(log.entries[2].outcome, 'removed');
  assert.deepEqual(cleanLog(null), empty);
  assert.deepEqual(cleanLog({ entries: 'x' }), empty);
});

test('the log has a size limit', () => {
  const full = { entries: Array.from({ length: MAX_ENTRIES }, (_, i) => ({ id: `pr-${i}`, received: today, type: 'other', ref: '', note: '', added: i })) };
  assert.match(add(full, { received: today }, 999).error, /up to 200/);
});

test('the markdown record is readable and never contains an email address', () => {
  let { log } = add(empty, { received: '2026-10-01', type: 'delete', ref: 'Re: remove | me' }, 1);
  ({ log } = answerRequest(log, 'pr-1', { answered: '2026-10-10' }));
  ({ log } = add(log, { received: '2026-11-02', note: 'Asked twice' }, 2));
  const md = logMarkdown(log, today);
  assert.match(md, /^# FYNX Wallet waitlist privacy requests/);
  assert.match(md, /Open: 1/);
  assert.match(md, /Answered: 1 · 1 on time, 0 late · average 9 days/);
  assert.match(md, /\| 2026-11-02 \| Asked what we hold \| 2026-12-02 \| Due in 25 days \| — \| — \| Asked twice \|/);
  assert.match(md, /Re: remove \/ me/);
  assert.doesNotMatch(md, /@/);
  assert.match(logMarkdown(empty, today), /No requests logged/);
});

test('the owner workspace wires the log into the Waitlist tab', async () => {
  const [html, app, ops] = await Promise.all([readFile('owner.html', 'utf8'), readFile('wallet-src/app.js', 'utf8'), readFile('docs/OPERATIONS.md', 'utf8')]);
  for (const id of ['wl-requests', 'pr-form', 'pr-received', 'pr-type', 'pr-ref', 'pr-note', 'pr-list', 'pr-stats', 'pr-copy', 'pr-download', 'pr-status', 'wl-reply-log']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(app, /from '\.\/privacy-requests\.js'/);
  assert.match(app, /PRIVACY_KEY/);
  assert.equal(PRIVACY_KEY, 'fynx-owner-privacy-requests-v1');
  assert.match(ops, /Privacy requests/);
});
