import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isTestAddress, perDay, perWeek, summarize, trendText, filterRecords, csvCell, toCSV, CSV_COLUMNS, summaryText } from '../wallet-src/waitlist-insights.js';

const now = Date.parse('2026-11-05T18:00:00Z'), DAY = 86400000;
const rec = (email, daysAgo, extra = {}) => ({ id: email, email, createdAt: daysAgo === null ? null : new Date(now - daysAgo * DAY).toISOString(), status: 'waiting', consent: true, noticeVersion: 'prelaunch-v2', source: 'fynx-wallet-public', expiresAt: new Date(now + 300 * DAY).toISOString(), ...extra });
const records = [
  rec('a@gmail.com', 0), rec('b@gmail.com', 1), rec('c@outlook.com', 3, { consent: false, noticeVersion: 'prelaunch-v1' }),
  rec('d@gmail.com', 8), rec('e@gmail.com', 10, { expiresAt: new Date(now + 10 * DAY).toISOString() }), rec('f@gmail.com', 40, { source: null, expiresAt: new Date(now - DAY).toISOString() }),
  rec('owner-test@example.com', 0), rec('x@mail.test', 2), rec('g@gmail.com', null),
];

test('test addresses are recognised; real domains are not', () => {
  for (const e of ['a@example.com', 'b@sub.example.org', 'c@example.net', 'd@foo.test', 'e@x.invalid', 'f@localhost', 'g@demo.example']) assert.ok(isTestAddress(e), e);
  for (const e of ['a@gmail.com', 'b@example.co', 'c@myexample.com', 'd@testing.com', '', null]) assert.ok(!isTestAddress(e), String(e));
});

test('summary leaves out test addresses and counts recent sign-ups, consent and retention', () => {
  const s = summarize(records, { total: 9, now, utc: true });
  assert.equal(s.loaded, 9); assert.equal(s.real, 7); assert.equal(s.tests, 2); assert.ok(s.complete);
  assert.equal(s.today, 1); assert.equal(s.last7, 3); assert.equal(s.prev7, 2); assert.equal(s.last30, 5);
  assert.equal(s.consented, 6); assert.equal(s.consentMissing, 1); assert.equal(s.consentPercent, 86);
  assert.equal(s.expiring, 1); assert.equal(s.expired, 1); assert.equal(s.noTimestamp, 1);
  assert.deepEqual(s.byNotice, [['prelaunch-v2', 6], ['prelaunch-v1', 1]]);
  assert.deepEqual(s.bySource, [['fynx-wallet-public', 6], ['Not recorded', 1]]);
  assert.equal(s.first.slice(0, 10), '2026-09-26'); assert.equal(s.latest.slice(0, 10), '2026-11-05');
  assert.equal(summarize(records.slice(0, 3), { total: 50, now }).complete, false);
  assert.equal(summarize([], { total: 0, now }).consentPercent, 0);
});

test('daily and weekly buckets cover the right calendar windows', () => {
  const days = perDay(records, { now, days: 30, utc: true });
  assert.equal(days.length, 30); assert.equal(days.at(-1).key, '2026-11-05'); assert.equal(days[0].key, '2026-10-07');
  assert.equal(days.at(-1).count, 2); // includes the test address: the caller filters
  assert.equal(days.reduce((n, d) => n + d.count, 0), 7);
  const weeks = perWeek(records, { now, weeks: 12, utc: true });
  assert.equal(weeks.length, 12); assert.equal(weeks.at(-1).key, '2026-11-02'); // Monday
  assert.equal(new Date(weeks[0].start).getUTCDay(), 1);
  assert.equal(weeks.at(-1).count, 5); assert.equal(weeks.reduce((n, w) => n + w.count, 0), 8);
  // Local-time buckets also produce whole, consecutive days.
  const local = perDay([], { now, days: 40 }); assert.equal(new Set(local.map(d => d.key)).size, 40);
});

test('trend wording', () => {
  assert.equal(trendText(0, 0), 'No sign-ups in the last two weeks');
  assert.equal(trendText(3, 0), '3 new this week, none the week before');
  assert.equal(trendText(3, 2), '+50% vs the previous 7 days (2)');
  assert.equal(trendText(1, 2), '-50% vs the previous 7 days (2)');
  assert.equal(trendText(2, 2), 'Same as the previous 7 days');
});

test('loaded rows can be filtered by text, consent and test addresses', () => {
  assert.equal(filterRecords(records, { query: 'GMAIL' }).length, 6);
  assert.equal(filterRecords(records, { query: 'prelaunch-v1' }).length, 1);
  assert.equal(filterRecords(records, { hideTests: true }).length, 7);
  assert.equal(filterRecords(records, { consent: 'missing' }).map(r => r.email).join(), 'c@outlook.com');
  assert.equal(filterRecords(records, { consent: 'recorded', hideTests: true, query: '' }).length, 6);
});

test('CSV export quotes cells and neutralises spreadsheet formulas', () => {
  assert.equal(csvCell('a"b'), '"a""b"'); assert.equal(csvCell(null), '""');
  for (const v of ['=HYPERLINK("x")', '+1', '-2', '@SUM(A1)', '\tx']) assert.ok(csvCell(v).startsWith(`"'`), v);
  const csv = toCSV([rec('=evil@gmail.com', 1), rec('t@example.com', 0, { consent: false })]);
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines.length, 3); assert.equal(lines[0], CSV_COLUMNS.map(c => `"${c}"`).join(','));
  assert.ok(lines[1].startsWith(`"'=evil@gmail.com"`));
  assert.match(lines[2], /"Not recorded".*"Yes"$/);
});

test('copied summary has counts only, never email addresses', () => {
  const text = summaryText(summarize(records, { total: 9, now, utc: true }), { date: '2026-11-05' });
  assert.match(text, /Registrations: 9/); assert.match(text, /Last 7 days: 3/); assert.match(text, /Consent recorded: 6 of 7 \(86%\)/);
  assert.doesNotMatch(text, /@/);
  assert.match(summaryText(summarize(records.slice(0, 2), { total: 20, now })), /figures below use 2 loaded/);
});

test('owner workspace has the insights panel, filter and export controls', async () => {
  const html = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
  for (const id of ['waitlist-insights', 'wl-stats', 'wl-chart', 'wl-breakdowns', 'wl-load-all', 'wl-download', 'wl-copy', 'wl-filter', 'wl-query', 'wl-consent', 'wl-hide-tests']) assert.match(html, new RegExp(`id="${id}"`), id);
  const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /clearWaitlistInsights\(\)/); // cleared on sign-out
});
