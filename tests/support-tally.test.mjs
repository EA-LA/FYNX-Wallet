import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TALLY_KEY, MAX_ENTRIES, KEEP_DAYS, cleanTally, logRequest, removeRequest, setAgain, markExplained, tallySummary, supportCheck, tallyMarkdown } from '../wallet-src/support-tally.js';
import { SITUATIONS } from '../wallet-src/support-playbook.js';
import { pilotReadiness, APPROVE_KEY, GROUPS } from '../wallet-src/pilot-readiness.js';

const NOW = Date.UTC(2026, 10, 14, 12, 0);
const H = 3600000, DAY = 24 * H;
const empty = () => cleanTally(null);
const log = (t, situation, at, extra = {}) => logRequest(t, { situation, at, ...extra });
const plan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));

test('storage is checked: unknown kinds, old or future times, duplicates and extra fields are dropped', () => {
  assert.match(TALLY_KEY, /^fynx-owner-.*-v1$/);
  const raw = { entries: [
    { id: 'r-aaaa', situation: 'pending', at: NOW - H, again: true, email: 'x@example.com', hash: '0xabc' },
    { id: 'r-aaaa', situation: 'pending', at: NOW - 2 * H },
    { id: 'r-bbbb', situation: 'nope', at: NOW - H },
    { id: 'r-cccc', situation: 'fees', at: NOW - (KEEP_DAYS + 1) * DAY },
    { id: 'r-dddd', situation: 'fees', at: NOW + 3 * DAY },
    { id: 'BAD ID!', situation: 'fees', at: NOW - H },
    { id: 'r-eeee', situation: 'fees', at: NOW - 3 * H },
  ], cleared: { pending: NOW - H, nope: NOW, fees: 'x' } };
  const t = cleanTally(raw, NOW);
  assert.deepEqual(t.entries, [{ id: 'r-eeee', situation: 'fees', at: NOW - 3 * H, again: false }, { id: 'r-aaaa', situation: 'pending', at: NOW - H, again: true }]);
  assert.deepEqual(t.cleared, { pending: NOW - H });
  assert.deepEqual(cleanTally('garbage', NOW), { entries: [], cleared: {} });
  assert.ok(!JSON.stringify(t).includes('example.com'), 'no customer data survives');
});

test('log, follow-up, undo and the cap', () => {
  let t = log(empty(), 'pending', NOW - H);
  assert.equal(t.entries.length, 1); assert.equal(t.entries[0].again, false);
  assert.equal(log(t, 'not-a-kind', NOW), t, 'unknown kind is ignored');
  t = setAgain(t, t.entries[0].id, true); assert.equal(t.entries[0].again, true);
  assert.equal(removeRequest(t, t.entries[0].id).entries.length, 0);
  let big = empty();
  for (let i = 0; i < MAX_ENTRIES + 5; i++) big = log(big, 'fees', NOW - i, { id: `r-${i.toString().padStart(4, '0')}` });
  assert.equal(big.entries.length, MAX_ENTRIES);
});

test('the same complaint from two pilot users within a day is a rollback trigger; a follow-up is not', () => {
  let t = log(empty(), 'wrong-amount', NOW - 5 * H);
  let s = tallySummary(t, NOW);
  assert.equal(s.alerts[0].kind, 'rollback', 'a rollback-type request alone asks to explain it within 1 hour');
  assert.equal(supportCheck(s).state, 'warn');
  t = log(t, 'wrong-amount', NOW - H, { again: true });
  s = tallySummary(t, NOW);
  assert.equal(s.stop, 0, 'the same person writing again does not count as two users');
  t = log(t, 'wrong-amount', NOW - 30 * 60000);
  s = tallySummary(t, NOW);
  assert.equal(s.stop, 1); assert.equal(s.alerts[0].people, 2); assert.equal(s.alerts[0].count, 3);
  assert.match(s.alerts[0].text, /two pilot users within a day/);
  const c = supportCheck(s); assert.equal(c.state, 'block'); assert.match(c.detail, /rollback trigger/);
  // Older than a day: no longer an alert.
  assert.equal(tallySummary(t, NOW + 2 * DAY).alerts.length, 0);
  // Explained: cleared until a new request of that kind arrives.
  t = markExplained(t, 'wrong-amount', NOW);
  assert.equal(tallySummary(t, NOW).alerts.length, 0);
  assert.equal(supportCheck(tallySummary(t, NOW)).state, 'ok');
  t = log(t, 'wrong-amount', NOW + 60000);
  assert.equal(tallySummary(t, NOW + 120000).alerts[0].kind, 'rollback');
});

test('ordinary questions never alert; security requests ask for a fast answer', () => {
  let t = log(log(empty(), 'fees', NOW - H), 'fees', NOW - 2 * H);
  let s = tallySummary(t, NOW);
  assert.equal(s.alerts.length, 1, 'two users with the same question still match the rollback rule wording');
  assert.equal(s.alerts[0].kind, 'repeat');
  t = log(empty(), 'availability', NOW - H);
  assert.equal(tallySummary(t, NOW).alerts.length, 0);
  assert.equal(supportCheck(tallySummary(t, NOW)).state, 'ok');
  t = log(empty(), 'impersonation', NOW - H);
  s = tallySummary(t, NOW);
  assert.equal(s.alerts[0].kind, 'security'); assert.match(s.alerts[0].text, /within 1 hour/);
});

test('counts per kind and the last seven days', () => {
  let t = empty();
  t = log(t, 'pending', NOW - H); t = log(t, 'pending', NOW - 3 * DAY); t = log(t, 'fees', NOW - 10 * DAY); t = log(t, 'sign-in', NOW - 2 * H);
  const s = tallySummary(t, NOW);
  assert.equal(s.total, 4); assert.equal(s.last24, 2); assert.equal(s.last7, 3);
  assert.equal(s.rows[0].situation.id, 'pending');
  assert.deepEqual(s.rows.map(r => [r.situation.id, r.last24, r.last7, r.total]), [['pending', 1, 2, 2], ['sign-in', 1, 1, 1], ['fees', 0, 0, 1]]);
  assert.equal(s.days.length, 7); assert.equal(s.days[6].day, '2026-11-14'); assert.equal(s.days[6].count, 2); assert.equal(s.days[3].count, 1);
  assert.equal(s.recent[0].situation, 'pending'); assert.equal(s.recent.length, 4);
  for (const r of s.rows) assert.ok(SITUATIONS.includes(r.situation));
});

test('the summary sheet is counts only and an empty tally says so', () => {
  assert.match(tallyMarkdown(tallySummary(empty(), NOW), { date: new Date(NOW) }), /No support requests logged yet/);
  let t = log(log(empty(), 'not-arrived', NOW - H), 'not-arrived', NOW - 2 * H);
  const md = tallyMarkdown(tallySummary(t, NOW), { date: new Date(NOW) });
  assert.match(md, /^# FYNX pilot support requests/);
  assert.match(md, /\*\*Rollback trigger\*\*/);
  assert.match(md, /\| Money \| Sent, but the recipient does not see it \| 2 \| 2 \| 2 \|/);
  assert.match(md, /PILOT-ROLLBACK\.md#when-to-roll-back/);
  assert.ok(!/0x[0-9a-f]{6}|@/.test(md));
});

test('Pilot go / no-go: support shows only when passed, and a trigger stops a running pilot', () => {
  assert.ok(GROUPS.some(([id]) => id === 'support'));
  const none = pilotReadiness({ plan, now: NOW });
  assert.equal(none.checks.filter(c => c.group === 'support').length, 0);
  const quiet = pilotReadiness({ plan, support: tallySummary(empty(), NOW), now: NOW });
  const sc = quiet.checks.find(c => c.group === 'support');
  assert.equal(sc.state, 'info', 'nothing logged is not called fine'); assert.equal(sc.action.kind, 'support');
  const trig = tallySummary(log(log(empty(), 'pending', NOW - H), 'pending', NOW - 2 * H), NOW);
  const approved = { [APPROVE_KEY]: { result: 'pass', note: '', at: NOW } };
  const r = pilotReadiness({ plan, records: approved, support: trig, now: NOW });
  assert.equal(r.verdict, 'stop'); assert.match(r.headline, /rollback trigger/);
  const calm = pilotReadiness({ plan, records: approved, support: tallySummary(log(empty(), 'fees', NOW - H), NOW), now: NOW });
  assert.equal(calm.verdict, 'approved');
  const before = pilotReadiness({ plan, support: trig, now: NOW });
  assert.equal(before.verdict, 'blocked');
  assert.equal(before.checks.find(c => c.group === 'support').state, 'block');
});

test('the workspace wires the tally into the playbook and go / no-go', () => {
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  assert.match(html, /id="spb-tally"/);
  assert.match(app, /support: tallySummary\(supportTally\)/);
  assert.match(app, /Log this request/);
  const doc = readFileSync(new URL('../docs/PILOT-ROLLBACK.md', import.meta.url), 'utf8');
  assert.match(doc, /same complaint from two pilot users within a day/);
});
