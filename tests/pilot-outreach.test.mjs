import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  fingerprint, maskEmail, cleanOutreach, markInvited, markFollowedUp, markAnswer, undoLast, inviteState,
  outreachSummary, nextToInvite, trackedElsewhere, outreachHeadline, outreachAttention, outreachReport, addDays, entryFor,
} from '../wallet-src/pilot-outreach.js';

const empty = { entries: {} };

test('fingerprint: same inbox gives the same key; no address is kept, only a masked hint', () => {
  assert.match(fingerprint('anna@gmail.com'), /^[0-9a-f]{16}$/);
  assert.equal(fingerprint('a.n.n.a+wallet@googlemail.com'), fingerprint('Anna@gmail.com'));
  assert.notEqual(fingerprint('anna@gmail.com'), fingerprint('anne@gmail.com'));
  assert.equal(fingerprint('not an address'), '');
  assert.equal(maskEmail('Anna@Gmail.com'), 'a•••@gmail.com');
  assert.equal(maskEmail('_x@proton.me'), '••••@proton.me');
  assert.equal(maskEmail('nobody'), '');
  const { log } = markInvited(empty, 'anna@gmail.com', '2026-11-20');
  const stored = JSON.stringify(log);
  assert.ok(!stored.includes('anna@'), 'the address itself is never stored');
  assert.match(stored, /a•••@gmail\.com/);
});

test('invited → reminder → answer, with dates in order and clear errors', () => {
  let r = markInvited(empty, 'anna@gmail.com', '2026-11-20'); assert.ok(!r.error);
  assert.match(markInvited(r.log, 'anna+x@gmail.com', '2026-11-21').error, /Already marked: Invited/);
  assert.match(markAnswer(empty, 'ben@outlook.com', 'accepted', '2026-11-21').error, /Mark the invitation as sent first/);
  assert.match(markFollowedUp(r.log, 'anna@gmail.com', '2026-11-19').error, /cannot be before/);
  r = markFollowedUp(r.log, 'anna@gmail.com', '2026-11-27'); assert.equal(r.entry.state, 'followed');
  assert.match(markAnswer(r.log, 'anna@gmail.com', 'accepted', '2026-11-26').error, /cannot be before/);
  assert.match(markAnswer(r.log, 'anna@gmail.com', 'maybe', '2026-11-28').error, /Unknown answer/);
  r = markAnswer(r.log, 'anna@gmail.com', 'accepted', '2026-11-28');
  assert.deepEqual(r.entry, { hint: 'a•••@gmail.com', state: 'accepted', invitedOn: '2026-11-20', followedOn: '2026-11-27', answeredOn: '2026-11-28' });
  assert.match(markAnswer(r.log, 'anna@gmail.com', 'declined', '2026-11-29').error, /Already answered: Accepted/);
  assert.match(markFollowedUp(r.log, 'anna@gmail.com', '2026-11-29').error, /still waiting/);
  // Undo walks back one step at a time, then forgets the invitation.
  let log = undoLast(r.log, 'anna@gmail.com').log; assert.equal(entryFor(log, 'anna@gmail.com').state, 'followed');
  log = undoLast(log, 'anna@gmail.com').log; assert.equal(entryFor(log, 'anna@gmail.com').state, 'invited'); assert.equal(entryFor(log, 'anna@gmail.com').followedOn, undefined);
  log = undoLast(log, 'anna@gmail.com').log; assert.equal(entryFor(log, 'anna@gmail.com'), null);
  assert.match(undoLast(log, 'anna@gmail.com').error, /Nothing to undo/);
});

test('reminder after 7 days without an answer, No reply 7 days after the reminder', () => {
  let { log } = markInvited(empty, 'anna@gmail.com', '2026-11-20');
  const e = entryFor(log, 'anna@gmail.com');
  assert.equal(inviteState(e, '2026-11-26').due, false); assert.match(inviteState(e, '2026-11-26').action, /Reminder due 2026-11-27/);
  assert.equal(inviteState(e, '2026-11-27').due, true); assert.match(inviteState(e, '2026-11-27').action, /No answer for 7 days: send one reminder/);
  log = markFollowedUp(log, 'anna@gmail.com', '2026-11-28').log;
  const f = entryFor(log, 'anna@gmail.com');
  assert.equal(inviteState(f, '2026-12-04').due, false); assert.equal(inviteState(f, '2026-12-05').due, true);
  assert.match(inviteState(f, '2026-12-05').action, /mark No reply and invite the next person/);
  assert.equal(inviteState(null, '2026-12-05').state, 'none');
  assert.equal(addDays('2026-12-28', 7), '2027-01-04');
});

test('summary: places filled, waiting, due today, how many more to invite, counts-only report', () => {
  let log = empty;
  const add = (email, day) => { log = markInvited(log, email, day).log; };
  add('a@gmail.com', '2026-11-01'); add('b@gmail.com', '2026-11-01'); add('c@gmail.com', '2026-11-10');
  add('d@gmail.com', '2026-11-25'); add('e@gmail.com', '2026-11-25');
  log = markAnswer(log, 'a@gmail.com', 'accepted', '2026-11-03').log;
  log = markAnswer(log, 'b@gmail.com', 'declined', '2026-11-04').log;
  log = markFollowedUp(log, 'c@gmail.com', '2026-11-18').log; // due to close on 11-25
  const s = outreachSummary(log, { size: 4, today: '2026-11-27' });
  assert.deepEqual([s.invited, s.accepted, s.declined, s.waiting, s.reminders, s.close, s.due], [5, 1, 1, 3, 0, 1, 1]);
  assert.equal(s.seatsLeft, 3); assert.equal(s.inviteMore, 0); assert.equal(s.acceptRate, 50); assert.equal(s.oldestDue, '2026-11-25');
  assert.equal(outreachHeadline(s), '1 of 4 places filled · 3 invitations waiting for an answer · 1 needs you today');
  const later = outreachSummary(log, { size: 6, today: '2026-12-02' });
  assert.equal(later.reminders, 2); assert.equal(later.inviteMore, 2);
  const att = outreachAttention(log, { size: 6, today: '2026-12-02' });
  assert.equal(att.count, 3); assert.match(att.text, /2 invitations with no answer after 7 days: send a reminder; 1 reminder with no answer/);
  assert.equal(outreachAttention(empty, { size: 6, today: '2026-12-02' }), null);
  const report = outreachReport(log, { size: 6, today: '2026-12-02' });
  assert.match(report, /Places: 6 · Accepted: 1 · Waiting for an answer: 3 · Declined: 1 · No reply: 0/);
  assert.match(report, /Invite 2 more from the reserve/);
  assert.ok(!/@/.test(report), 'no addresses or hints in the report');
  assert.equal(outreachHeadline(outreachSummary(empty, { size: 4, today: '2026-11-27' })), 'No invitations marked as sent yet.');
});

test('next to invite skips tracked people and moves into the reserve; tracked people outside the loaded rows are counted', () => {
  const result = { invited: [{ email: 'a@gmail.com' }, { email: 'b@gmail.com' }], reserve: [{ email: 'c@gmail.com' }, { email: 'd@gmail.com' }] };
  let log = markInvited(empty, 'a@gmail.com', '2026-11-20').log;
  log = markInvited(log, 'c@gmail.com', '2026-11-20').log;
  log = markInvited(log, 'zed@gmail.com', '2026-11-20').log;
  assert.deepEqual(nextToInvite(result, log, 5).map(r => r.email), ['b@gmail.com', 'd@gmail.com']);
  assert.deepEqual(nextToInvite(result, log, 1).map(r => r.email), ['b@gmail.com']);
  assert.deepEqual(nextToInvite(null, log, 3), []);
  assert.equal(trackedElsewhere(log, [{ email: 'a@gmail.com' }, { email: 'c+1@gmail.com' }]), 1);
});

test('stored data is cleaned: bad keys, states, dates and unmasked hints are dropped', () => {
  const fp = fingerprint('anna@gmail.com');
  const clean = cleanOutreach({ entries: {
    [fp]: { hint: 'anna@gmail.com', state: 'accepted', invitedOn: '2026-11-01', answeredOn: '2026-11-02', email: 'anna@gmail.com' },
    ['0'.repeat(16)]: { state: 'invited', invitedOn: '2026-02-30' },
    ['1'.repeat(16)]: { state: 'followed', invitedOn: '2026-11-05' },
    ['2'.repeat(16)]: { state: 'declined', invitedOn: '2026-11-05', answeredOn: '2026-11-04' },
    ['3'.repeat(16)]: { state: 'hacked', invitedOn: '2026-11-05' },
    'not-a-key': { state: 'invited', invitedOn: '2026-11-05' },
    ['4'.repeat(16)]: { hint: 'b•••@outlook.com', state: 'followed', invitedOn: '2026-11-05', followedOn: '2026-11-12' },
  } });
  assert.deepEqual(Object.keys(clean.entries).sort(), [fp, '4'.repeat(16)].sort());
  assert.deepEqual(clean.entries[fp], { hint: '', state: 'accepted', invitedOn: '2026-11-01', answeredOn: '2026-11-02' });
  assert.equal(clean.entries['4'.repeat(16)].hint, 'b•••@outlook.com');
  assert.deepEqual(cleanOutreach(null), { entries: {} });
  assert.deepEqual(cleanOutreach('x'), { entries: {} });
});

test('workspace wiring: tracker in the pilot panel, next steps, section chip, search, nothing sent', () => {
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  for (const id of ['wl-out-box', 'wl-out-head', 'wl-out-stats', 'wl-out-next', 'wl-out-list', 'wl-out-date', 'wl-out-copy', 'wl-out-forget', 'wl-out-status']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /from '\.\/pilot-outreach\.js'/);
  assert.match(app, /localStorage\.setItem\(OUTREACH_KEY/);
  assert.match(app, /outreachAttention\(/);
  assert.match(app, /Pilot invitations · /);
  assert.ok(!/sendEmail|mailto:.*invite/i.test(app.slice(app.indexOf('function renderOutreach'), app.indexOf('function renderOutreach') + 6000)), 'nothing is sent from the tracker');
});
