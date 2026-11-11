import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectDates, datesHeadline, datesText, datesIcs, icsEscape, icsFold, dateState, whenLabel, HORIZON_DAYS } from '../wallet-src/owner-dates.js';

const TODAY = '2026-11-11';
const NOW = Date.parse('2026-11-11T08:00:00Z');
const privacy = {
  entries: [
    { id: 'pr-old', received: '2026-10-01', type: 'delete', ref: 'Ticket 42 secret-subject', note: 'my note', added: 1, changed: 1 },
    { id: 'pr-new', received: '2026-11-05', type: 'access', ref: '', note: '', added: 2, changed: 2 },
    { id: 'pr-done', received: '2026-10-20', type: 'access', ref: '', note: '', added: 3, changed: 3, answered: '2026-10-25', outcome: 'replied' },
  ],
};
const requests = {
  entries: {
    'counsel|legal/analysis': { sent: '2026-11-01', answered: '', changed: 1 },
    'counsel|legal/terms': { sent: '2026-10-01', answered: '2026-10-10', changed: 1 },
    'reviewer|production-security/audit': { sent: '2026-10-01', answered: '', changed: 1 },
  },
};
const evidence = { entries: { 'counsel|legal/terms': { got: ['terms'], on: { terms: '2026-10-12' }, changed: 1 } } };
const openRequests = [
  { id: 'counsel|legal/analysis', title: 'Counsel reviews licensing' },
  { id: 'counsel|legal/terms', title: 'Customer terms approved' },
  { id: 'not|valid', title: 'ignored' },
];
const access = { google: { twoStep: 'yes', codes: 'yes', people: 1, reviewed: '2026-09-01', unused: false, at: 5 } };

test('dateState and whenLabel describe a date against today', () => {
  assert.deepEqual(dateState('2026-11-10', TODAY), { left: -1, state: 'overdue' });
  assert.equal(dateState(TODAY, TODAY).state, 'today');
  assert.equal(dateState('2026-11-18', TODAY).state, 'soon');
  assert.equal(dateState('2026-11-19', TODAY).state, 'later');
  assert.equal(dateState('nonsense', TODAY).state, 'later');
  assert.equal(whenLabel(-3), '3 days overdue');
  assert.equal(whenLabel(0), 'Today');
  assert.equal(whenLabel(1), 'Tomorrow');
  assert.equal(whenLabel(12), 'In 12 days');
});

test('collectDates gathers privacy answers, reminders, evidence and access reviews, soonest first', () => {
  const d = collectDates({ privacy, requests, evidence, openRequests, access, today: TODAY });
  const byUid = Object.fromEntries(d.items.map(i => [i.uid, i]));
  // Privacy: open requests only, due 30 days after arrival.
  assert.equal(byUid['privacy-pr-old'].date, '2026-10-31');
  assert.equal(byUid['privacy-pr-old'].state, 'overdue');
  assert.equal(byUid['privacy-pr-new'].date, '2026-12-05');
  assert.ok(!byUid['privacy-pr-done']);
  // Outside: waiting request -> reminder 14 days after sending.
  assert.equal(byUid['remind-counsel-legal-analysis'].date, '2026-11-15');
  assert.equal(byUid['remind-counsel-legal-analysis'].state, 'soon');
  // A request whose step is not open (not in openRequests) is left out.
  assert.ok(!Object.keys(byUid).some(u => u.includes('reviewer')));
  // Answered with evidence missing: ask again 14 days after the last piece that arrived.
  const ev = byUid['evidence-counsel-legal-terms'];
  assert.equal(ev.date, '2026-10-26');
  assert.equal(ev.state, 'overdue');
  assert.match(ev.detail, /Still missing: approved privacy notice; approved risk disclosures; the date each document was approved/);
  assert.match(ev.detail, /last piece that arrived \(2026-10-12\)/);
  // Access review: 90 days after the last review.
  assert.equal(byUid['access-google'].date, '2026-11-30');
  assert.equal(byUid['access-google'].title, 'Review your owner Google account');
  // Sorted by date.
  const dates = d.items.map(i => i.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(d.overdue, 2); assert.equal(d.soon, 1); assert.equal(d.upcoming, 2); assert.equal(d.today, 0);
  assert.equal(datesHeadline(d), '2 overdue · 1 within 7 days · 2 later');
});

test('nothing typed by the owner (references, notes) reaches the list, the copy or the calendar file', () => {
  const d = collectDates({ privacy, requests, evidence, openRequests, access, today: TODAY });
  const text = datesText(d, TODAY), ics = datesIcs(d, { today: TODAY, now: NOW });
  for (const out of [JSON.stringify(d.items.map(({ title, detail }) => [title, detail])), text, ics]) {
    assert.ok(!out.includes('secret-subject') && !out.includes('Ticket 42') && !out.includes('my note'));
  }
});

test('a shortened step title is not given a second full stop', () => {
  const d = collectDates({ requests, openRequests: [{ id: 'counsel|legal/analysis', title: 'Counsel reviews licensing and...' }], today: TODAY });
  assert.match(d.items[0].detail, /^Counsel reviews licensing and\.\.\. Sent 2026-11-01/);
});

test('empty inputs give an honest empty result', () => {
  const d = collectDates({ today: TODAY });
  assert.deepEqual(d.items, []);
  assert.equal(datesHeadline(d), 'Nothing dated yet');
  assert.match(datesText(d, TODAY), /No dated items yet/);
  const ics = datesIcs(d, { today: TODAY, now: NOW });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!ics.includes('BEGIN:VEVENT'));
});

test('dates further than the horizon are counted, not listed', () => {
  const far = { entries: [{ id: 'far', received: '2027-12-01', type: 'other', ref: '', note: '', added: 1, changed: 1 }] };
  const d = collectDates({ privacy: far, today: TODAY });
  assert.equal(d.items.length, 0); assert.equal(d.later, 1);
  assert.equal(collectDates({ privacy: far, today: TODAY, horizon: 1000 }).items.length, 1);
  assert.ok(HORIZON_DAYS >= 90);
});

test('the calendar file is valid RFC 5545: CRLF, all-day events, stable UIDs, folded lines, overdue on today', () => {
  const d = collectDates({ privacy, requests, evidence, openRequests, access, today: TODAY });
  const ics = datesIcs(d, { today: TODAY, now: NOW, link: 'https://ea-la.github.io/FYNX-Wallet/owner.html' });
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends with CRLF');
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.equal((unfolded.match(/BEGIN:VEVENT/g) || []).length, d.items.length);
  assert.equal((unfolded.match(/END:VEVENT/g) || []).length, d.items.length);
  assert.match(unfolded, /UID:privacy-pr-new@owner\.fynx-wallet\r\n/);
  // Due in the future: on its own day, with a reminder 3 days before and one on the day.
  assert.match(unfolded, /DTSTART;VALUE=DATE:20261205\r\nDTEND;VALUE=DATE:20261206\r\nSUMMARY:FYNX · Answer the privacy request \(asked what we hold\)/);
  assert.match(unfolded, /TRIGGER:-P2DT15H/);
  // Overdue: placed on today and titled as overdue.
  assert.match(unfolded, /DTSTART;VALUE=DATE:20261111\r\nDTEND;VALUE=DATE:20261112\r\nSUMMARY:Overdue: FYNX · Answer the privacy request \(asked to be removed\)/);
  assert.match(unfolded, /Was due 2026-10-31/);
  assert.match(unfolded, /URL:https:\/\/ea-la\.github\.io\/FYNX-Wallet\/owner\.html/);
  assert.match(unfolded, /DTSTAMP:20261111T080000Z/);
  // Same input, same UIDs: re-importing updates the same events.
  const again = datesIcs(d, { today: TODAY, now: NOW + 3600000 }).replace(/\r\n /g, '');
  assert.deepEqual(again.match(/UID:[^\r]+/g), unfolded.match(/UID:[^\r]+/g));
});

test('icsEscape and icsFold handle special characters and multi-byte text', () => {
  assert.equal(icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const long = `DESCRIPTION:${'é'.repeat(80)}`;
  const folded = icsFold(long);
  for (const part of folded.split('\r\n')) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), long);
  assert.equal(icsFold('SHORT:line'), 'SHORT:line');
});

test('the Launch readiness tab has the Your dates panel wired to the page, read-only', async () => {
  const [html, app] = await Promise.all([readFile('owner.html', 'utf8'), readFile('wallet-src/app.js', 'utf8')]);
  assert.match(html, /<section id="launch-dates" class="launch-order owner-dates" aria-label="Your dates"><\/section>/);
  assert.match(app, /function renderLaunchDates\(\)/);
  assert.match(app, /renderLaunchDates\(\);\n\}/, 'rendered with the launch overview');
  assert.match(app, /renderPrivacyBadge\(\); renderLaunchDates\(\); \}/, 're-rendered when the privacy log changes');
  assert.match(app, /type: 'text\/calendar;charset=utf-8'/);
  const fn = app.slice(app.indexOf('function renderLaunchDates()'), app.indexOf('function openOutsideRequest('));
  assert.ok(!/callOwner|fetch\(|localStorage\.setItem/.test(fn), 'the panel only reads');
});
