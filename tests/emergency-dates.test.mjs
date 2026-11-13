import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDates, datesIcs, datesText, KINDS } from '../wallet-src/owner-dates.js';
import { emergencyPlan, planState, sheetFreshness, recordSheet, emergencyAttention, SHEET_STALE_DAYS } from '../wallet-src/emergency-plan.js';
import { ACCESS_SERVICES, accessSummary, updateService, findService, cleanReview } from '../wallet-src/access-review.js';

const TODAY = '2026-11-13';
const twoWays = planState({ providers: ['google.com'], passkeys: 2 });

test('a saved emergency sheet puts its re-save day in Your dates', () => {
  const saved = recordSheet(twoWays, '2026-06-01');
  const d = collectDates({ emergency: { saved, state: twoWays }, today: TODAY });
  assert.equal(d.items.length, 1);
  const item = d.items[0];
  assert.equal(item.kind, 'emergency');
  assert.equal(KINDS.emergency, 'Emergency sheet');
  assert.equal(item.uid, 'emergency-sheet');
  assert.equal(item.date, '2026-11-28', `${SHEET_STALE_DAYS} days after the save`);
  assert.equal(item.state, 'later');
  assert.equal(item.title, 'Read and save a fresh emergency sheet');
  assert.match(item.detail, /^Saved 2026-06-01\. .*every 180 days/);
  // Without a signed-in account the date still shows (no comparison of ways in).
  assert.equal(collectDates({ emergency: { saved, state: null }, today: TODAY }).items[0].date, '2026-11-28');
  // An older save is overdue.
  const old = collectDates({ emergency: { saved: recordSheet(twoWays, '2026-04-01'), state: twoWays }, today: TODAY });
  assert.equal(old.items[0].state, 'overdue');
  assert.equal(old.overdue, 1);
});

test('a sheet saved before the ways in changed is due today and says what changed', () => {
  const saved = recordSheet(planState({ providers: ['google.com'], passkeys: 1 }), '2026-11-01');
  const d = collectDates({ emergency: { saved, state: twoWays }, today: TODAY });
  const item = d.items[0];
  assert.equal(item.date, TODAY);
  assert.equal(item.state, 'today');
  assert.equal(item.title, 'Save a new emergency sheet');
  assert.match(item.detail, /passkeys 1 → 2/);
  // Fixed words only in the copy and the calendar file.
  assert.match(datesText(d, TODAY), /Emergency sheet: Save a new emergency sheet/);
  const ics = datesIcs(d, { today: TODAY, now: Date.parse(`${TODAY}T10:00:00Z`) });
  assert.match(ics, /UID:emergency-sheet@owner\.fynx-wallet/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261113/);
});

test('no date for a sheet that was never saved, or with a save date that cannot be right', () => {
  assert.equal(collectDates({ emergency: { saved: {}, state: twoWays }, today: TODAY }).items.length, 0);
  assert.equal(collectDates({ emergency: { saved: recordSheet(twoWays, '2026-12-01'), state: twoWays }, today: TODAY }).items.length, 0, 'future save dropped');
  assert.equal(collectDates({ emergency: { saved: { savedOn: '2026-11-01', fp: 'nonsense' }, state: twoWays }, today: TODAY }).items.length, 0);
  assert.equal(collectDates({ today: TODAY }).items.length, 0);
});

test('Your next steps: gaps in the ways back in are listed, practice gaps are not', () => {
  // Google only: the Google and locked-out situations are gaps (no second way in).
  const googleOnly = emergencyPlan(planState({ providers: ['google.com'], passkeys: 0 }));
  const [line] = emergencyAttention(googleOnly, sheetFreshness({}, googleOnly.state, TODAY));
  assert.equal(line.id, 'gaps');
  assert.equal(line.label, `Emergency plan · ${googleOnly.ready} of 6 prepared`);
  assert.match(line.text, /^Not ready if you lose a way in \(Google account, locked out\): Add a passkey/);
  assert.equal(line.scenario, 'google');
  assert.equal(line.fix, 'passkeys');
  // Two ways in and no Google review yet: nothing to list (a first review does not crowd the list),
  // even though the drill, restore and revoke practice is still open.
  const plan = emergencyPlan(twoWays);
  assert.ok(plan.gaps.length >= 3);
  assert.deepEqual(emergencyAttention(plan, sheetFreshness({}, plan.state, TODAY)), []);
  // A recorded Google problem is listed.
  const review = updateService({}, 'google', { twoStep: 'no', codes: 'yes', people: 1, reviewed: 'today' }, Date.parse(`${TODAY}T12:00:00Z`));
  const risky = emergencyPlan(planState({ providers: ['google.com'], passkeys: 2, access: accessSummary(review, TODAY) }));
  const lines = emergencyAttention(risky, sheetFreshness({}, risky.state, TODAY));
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /\(Google account\)/);
});

test('Your next steps: an out-of-date or old emergency sheet is listed', () => {
  const plan = emergencyPlan(twoWays);
  const changed = emergencyAttention(plan, sheetFreshness(recordSheet(planState({ providers: ['google.com'], passkeys: 1 }), '2026-11-01'), plan.state, TODAY));
  assert.equal(changed.length, 1);
  assert.equal(changed[0].label, 'Emergency sheet · out of date');
  assert.match(changed[0].text, /^Since you saved it on 2026-11-01: passkeys 1 → 2\./);
  const old = emergencyAttention(plan, sheetFreshness(recordSheet(twoWays, '2026-04-01'), plan.state, TODAY));
  assert.equal(old[0].label, 'Emergency sheet · saved 226 days ago');
  assert.deepEqual(emergencyAttention(plan, sheetFreshness(recordSheet(twoWays, '2026-11-01'), plan.state, TODAY)), [], 'a current sheet is not listed');
});

test('access review: the domain registrar is an optional account', () => {
  const s = findService('registrar');
  assert.ok(s);
  assert.equal(s.core, false);
  assert.equal(ACCESS_SERVICES.at(-1).id, 'registrar');
  assert.match(s.check, /transfer lock/);
  assert.ok(s.links.every(([, href]) => href.startsWith('https://')));
  const empty = accessSummary({}, TODAY);
  assert.equal(empty.rows.find(r => r.service.id === 'registrar').counted, false, 'not counted until reviewed');
  const review = updateService({}, 'registrar', { twoStep: 'yes', codes: 'yes', people: 1, reviewed: 'today' }, Date.parse(`${TODAY}T12:00:00Z`));
  assert.equal(accessSummary(review, TODAY).rows.find(r => r.service.id === 'registrar').counted, true);
  assert.ok(cleanReview(review, TODAY).registrar, 'kept when answers are read back');
  const d = collectDates({ access: review, today: TODAY });
  assert.equal(d.items[0].title, 'Review your domain registrar (web addresses)');
});
