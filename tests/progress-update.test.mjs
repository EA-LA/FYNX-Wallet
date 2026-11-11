import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { progressUpdate, updateMarkdown, updateHeadline, paceSentence, PERIODS } from '../wallet-src/progress-update.js';
import { collectDates } from '../wallet-src/owner-dates.js';
import { overview } from '../wallet-src/launch-tracker.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const TODAY = '2026-11-11';
const NOW = Date.parse('2026-11-11T12:00:00Z');
const DAY = 86400000;
const records = {
  'identity/google-desktop': { result: 'pass', note: 'secret-ish note Chrome 131', at: NOW - 2 * DAY },
  'identity/email-reset': { result: 'skip', note: '', at: NOW - 3 * DAY },
  'identity/passkey-add': { result: 'pass', note: '', at: NOW - 20 * DAY },
  'identity/idle': { result: 'fail', note: 'did not sign out', at: NOW - 1 * DAY },
};
const requests = { entries: {
  'counsel|legal/analysis': { sent: '2026-10-20', answered: '', changed: 1 },
  'reviewer|production-security/audit': { sent: '2026-11-08', answered: '2026-11-10', changed: 1 },
} };
const privacy = { entries: [
  { id: 'a', received: '2026-11-09', type: 'delete', ref: 'Ticket 9 private-ref', note: 'private note', added: 1, changed: 1 },
  { id: 'b', received: '2026-09-01', type: 'access', ref: '', note: '', added: 1, changed: 1 },
  { id: 'c', received: '2026-11-01', type: 'access', ref: '', note: '', added: 1, changed: 1, answered: '2026-11-06', outcome: 'replied' },
] };
const drill = { current: null, history: [{ scenario: 'phishing', people: ['A', 'B'], startedAt: NOW - 3 * DAY - 1800000, finishedAt: NOW - 3 * DAY, answers: { record: { result: 'gap', followUp: 'Write the takedown contact list', doneAt: 0 } } }] };
const build = (days = 7, recs = records) => progressUpdate({ plan, records: recs, requests, privacy, drill, days, today: TODAY, now: NOW,
  dates: collectDates({ privacy, requests, openRequests: [{ id: 'counsel|legal/analysis', title: 'Counsel review' }], today: TODAY }) });

test('the period picks owner steps finished inside it and the starting percentage', () => {
  const u = build(7);
  assert.deepEqual(u.finished.map(f => f.key), ['identity/google-desktop', 'identity/email-reset']);
  const o = overview(plan, records);
  assert.equal(u.overall.done, o.done);
  assert.equal(u.overall.startDone, o.done - 2);
  assert.ok(u.overall.startPercent <= u.overall.percent);
  assert.equal(u.from, '2026-11-05');
  const month = build(30);
  assert.equal(month.finished.length, 3);
  assert.equal(month.from, '2026-10-13');
  assert.equal(build(9).days, 7, 'unknown periods fall back to 7 days');
  assert.deepEqual(PERIODS, [7, 14, 30]);
});

test('failed tests are listed for a retest and lead the next steps', () => {
  const u = build(7);
  assert.equal(u.failed.length, 1);
  assert.equal(u.failed[0].key, 'identity/idle');
  assert.equal(u.failed[0].recent, true);
  assert.equal(u.next[0].key, 'identity/idle');
  assert.equal(u.next[0].failed, true);
  assert.ok(u.next.length <= 3);
});

test('outside requests: waiting ones with reminder state, answers inside the period', () => {
  const u = build(7);
  const counsel = u.outside.find(p => p.id === 'counsel');
  assert.equal(counsel.rows[0].state, 'chase');
  assert.equal(counsel.rows[0].days, 22);
  const reviewer = u.outside.find(p => p.id === 'reviewer');
  assert.equal(reviewer.rows[0].state, 'answered');
  assert.equal(reviewer.rows[0].days, 2);
  // An answer older than the period is left out.
  const old = progressUpdate({ plan, records, requests: { entries: { 'reviewer|production-security/audit': { sent: '2026-09-01', answered: '2026-09-10', changed: 1 } } }, days: 7, today: TODAY, now: NOW });
  assert.equal(old.outside.length, 0);
  assert.ok(u.notAsked.length > 0, 'steps ready to ask but not sent are counted');
});

test('privacy, practice and dates are counts and fixed words only', () => {
  const u = build(7);
  assert.deepEqual(u.privacy, { received: 1, answered: 1, open: 2, overdue: 1 });
  assert.deepEqual(u.followUps, { open: 1, total: 1 });
  assert.equal(u.drills, 1);
  assert.ok(u.coming.some(c => c.state === 'overdue'));
  assert.ok(u.coming.every(c => !/private|Ticket 9/.test(c.title)));
});

test('the Markdown update leaves notes, references and follow-up text out', () => {
  const text = updateMarkdown(build(7), { generated: new Date(NOW) });
  assert.match(text, /^# FYNX Wallet launch progress update/);
  assert.match(text, /Period: last 7 days \(2026-11-05 to 2026-11-11\)/);
  assert.match(text, /## Finished in the last 7 days/);
  assert.match(text, /\(Passed, 2026-11-09\)/);
  assert.match(text, /\(Not applicable, 2026-11-08\)/);
  assert.match(text, /## Needs a retest/);
  assert.match(text, /no answer after 22 days; a reminder is due/);
  assert.match(text, /answered 2026-11-10 \(after 2 days\)/);
  assert.match(text, /1 received and 1 answered in this period; 2 open, 1 past FYNX’s 30-day target/);
  assert.match(text, /1 run finished in this period; 1 of 1 follow-up still open/);
  for (const secret of ['secret-ish', 'did not sign out', 'private-ref', 'private note', 'Ticket 9', 'takedown']) assert.ok(!text.includes(secret), secret);
  assert.match(text, /not launched/);
});

test('headline and pace sentences stay honest with no data', () => {
  const empty = progressUpdate({ plan, records: {}, days: 14, today: TODAY, now: NOW });
  assert.match(updateHeadline(empty), /unchanged in the last 14 days\. No steps finished\.$/);
  assert.match(paceSentence(empty), /no pace estimate/);
  const text = updateMarkdown(empty, { generated: new Date(NOW) });
  assert.match(text, /Nothing finished in this period/);
  assert.match(text, /No requests recorded as sent yet/);
  assert.doesNotMatch(text, /up from/);
  const u = build(7);
  assert.match(updateHeadline(u), /up \d+ points? in the last 7 days\. 2 steps finished, 1 test to retest, 1 request waiting on outside parties, \d+ overdue dates?\./);
});

test('the workspace has the panel and wires it', async () => {
  const html = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
  assert.match(html, /<section id="launch-update" class="launch-order progress-update" aria-label="Progress update"><\/section>/);
  const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /renderLaunchUpdate\(\);/);
  assert.match(app, /fynx-progress-update-/);
});
