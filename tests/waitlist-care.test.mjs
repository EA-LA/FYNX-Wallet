import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { suggestDomain, inboxKey, addressFlags, checkCounts, matchesCheck, checkSummaryLine, testSignupCheck, findRemoveNote, accessReply, deletionReply, CHECKS, CONTACT } from '../wallet-src/waitlist-care.js';
import { gateTests, identityTests } from '../wallet-src/security-checkup.js';
import { looksSecret } from '../wallet-src/launch-tracker.js';

const now = Date.parse('2026-11-07T12:00:00Z'), DAY = 86400000;
const rec = (email, extra = {}) => ({ id: email, email, createdAt: new Date(now - 5 * DAY).toISOString(), status: 'waiting', consent: true, noticeVersion: 'prelaunch-v2', source: 'fynx-wallet-public', expiresAt: new Date(now + 360 * DAY).toISOString(), ...extra });

test('likely-mistyped domains get a suggestion; correct and test domains do not', () => {
  assert.equal(suggestDomain('ann@gmial.com'), 'gmail.com');
  assert.equal(suggestDomain('ann@HOTMIAL.COM'), 'hotmail.com');
  assert.equal(suggestDomain('ann@company.con'), 'company.com');
  assert.equal(suggestDomain('ann@yahoo.cmo'), 'yahoo.com');
  for (const e of ['ann@gmail.com', 'ann@outlook.com', 'ann@yahoo.co.uk', 'ann@gmail.co.uk', 'ann@example.com', 'ann@fynx.co', 'not-an-email', '']) assert.equal(suggestDomain(e), '', e);
});

test('one inbox under several spellings is recognised', () => {
  assert.equal(inboxKey('J.Smith+wallet@Gmail.com'), 'jsmith@gmail.com');
  assert.equal(inboxKey('jsmith@googlemail.com'), 'jsmith@gmail.com');
  assert.equal(inboxKey('j.smith+x@outlook.com'), 'j.smith@outlook.com'); // dots matter outside Gmail
  assert.notEqual(inboxKey('j.smith@outlook.com'), inboxKey('jsmith@outlook.com'));
});

test('address flags: duplicates, typos, disposable, shared, retention; test addresses only marked as tests', () => {
  const records = [
    rec('j.smith@gmail.com'), rec('jsmith+fynx@gmail.com'), rec('ann@gmial.com'), rec('tmp@mailinator.com'),
    rec('info@acme.com'), rec('old@gmail.com', { expiresAt: new Date(now - DAY).toISOString() }),
    rec('soon@gmail.com', { expiresAt: new Date(now + 10 * DAY).toISOString() }), rec('fine@gmail.com'),
    rec('owner-test@example.com'), rec('owner.test@example.com'),
  ];
  const flags = addressFlags(records, { now }), kinds = id => flags.get(id).map(f => f.kind);
  assert.deepEqual(kinds('j.smith@gmail.com'), ['duplicate']);
  assert.match(flags.get('j.smith@gmail.com')[0].detail, /jsmith\+fynx@gmail\.com/);
  assert.deepEqual(kinds('ann@gmial.com'), ['typo']);
  assert.match(flags.get('ann@gmial.com')[0].detail, /ann@gmail\.com/);
  assert.deepEqual(kinds('tmp@mailinator.com'), ['disposable']);
  assert.deepEqual(kinds('info@acme.com'), ['role']);
  assert.deepEqual(kinds('old@gmail.com'), ['expired']);
  assert.deepEqual(kinds('soon@gmail.com'), ['expiring']);
  assert.deepEqual(kinds('fine@gmail.com'), []);
  assert.deepEqual(kinds('owner-test@example.com'), ['test']); // test addresses are never "duplicates"
  const counts = checkCounts(records, flags);
  assert.equal(counts.groups, 1); assert.equal(counts.duplicate, 2); assert.equal(counts.typo, 1); assert.equal(counts.disposable, 1);
  assert.equal(counts.role, 1); assert.equal(counts.expired, 1); assert.equal(counts.expiring, 1);
  assert.equal(counts.attention, 5); // duplicates (2) + typo + disposable + expired; shared mailbox and "ends soon" are information only
  assert.equal(records.filter(r => matchesCheck(r, flags, 'attention')).length, 5);
  assert.equal(records.filter(r => matchesCheck(r, flags, 'all')).length, records.length);
  assert.deepEqual(records.filter(r => matchesCheck(r, flags, 'typo')).map(r => r.id), ['ann@gmial.com']);
  const line = checkSummaryLine(counts);
  assert.equal(line, 'Address check: 1 possible duplicate group (2 rows) · 1 likely mistyped · 1 disposable · 1 shared mailbox');
  assert.ok(!line.includes('@'), 'summary line has no addresses');
  for (const [kind] of CHECKS) assert.ok(kind in counts, kind);
});

test('test sign-up check confirms what the waitlist recorded', () => {
  const good = rec('owner-test@example.com', { createdAt: new Date(now - 3600000).toISOString(), expiresAt: new Date(now - 3600000 + 365 * DAY).toISOString() });
  const c = testSignupCheck(good, { now });
  assert.equal(c.total, 6); assert.equal(c.passed, 6); assert.ok(c.ok);
  assert.equal(c.checks[4].detail, '1 h ago'); assert.equal(c.checks[5].detail, '365 days');
  const bad = testSignupCheck(rec('real@gmail.com', { consent: false, noticeVersion: null, expiresAt: null }), { now });
  assert.equal(bad.ok, false); assert.equal(bad.passed, 2);
  assert.deepEqual(bad.checks.filter(x => !x.ok).map(x => x.label.split(' ')[0]), ['Test', 'Consent', 'Privacy', 'Deletion']);
  const note = findRemoveNote(good, c, { now });
  assert.equal(note, 'Found and removed a test address at example.com on 2026-11-07; sign-up checks 6/6 passed, notice prelaunch-v2.');
  assert.ok(!note.includes('owner-test'), 'note keeps the domain only'); assert.equal(looksSecret(note), false);
  assert.ok(note.length <= 280);
});

test('privacy replies list the stored fields and stay honest about backups', () => {
  const r = rec('ann@gmail.com', { createdAt: '2026-11-02T08:15:30Z', expiresAt: '2027-11-02T08:15:30Z' });
  const access = accessReply(r);
  for (const part of ['ann@gmail.com', '2026-11-02 08:15 UTC', 'waiting', 'recorded (notice version prelaunch-v2)', 'fynx-wallet-public', '2027-11-02', CONTACT]) assert.ok(access.includes(part), part);
  assert.match(accessReply({ ...r, consent: false, source: null, noticeVersion: null }), /privacy notice: not recorded\n- Where you signed up: not recorded/);
  const done = deletionReply(r, { removedAt: now });
  assert.match(done, /deleted ann@gmail\.com from the FYNX Wallet waitlist on 2026-11-07/);
  assert.match(done, /backups/); assert.ok(!/permanently|all copies|every copy/i.test(done), 'never claims backups are wiped');
});

test('gate tests: the website gate lists the two owner steps; identity unchanged', () => {
  const plan = { items: [{ id: 'website', steps: [{ id: 'a', by: 'engineering', done: true, text: 'built' }, { id: 'join-phone', by: 'you', text: 'join' }, { id: 'find-remove', by: 'you', text: 'remove' }] }, { id: 'identity', steps: [{ id: 'x', by: 'you', text: 'sign in' }] }] };
  const t = gateTests(plan, { 'website/find-remove': { result: 'pass', note: 'n', at: 1 } }, 'website');
  assert.equal(t.total, 2); assert.equal(t.done, 1);
  assert.deepEqual(t.steps.map(s => [s.step.id, s.result]), [['join-phone', ''], ['find-remove', 'pass']]);
  assert.equal(identityTests(plan, {}).total, 1);
  assert.equal(gateTests(plan, {}, 'missing').total, 0);
});

test('owner page has the address check, the reply panel and the waitlist launch tests', async () => {
  const html = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
  const tab = html.slice(html.indexOf('id="tab-registrations"'), html.indexOf('id="tab-launch"'));
  for (const id of ['wl-quality', 'wl-check', 'wl-reply', 'wl-reply-text', 'wl-reply-copy', 'wl-reply-close', 'wl-tests', 'wl-tests-count', 'wl-testcheck', 'wl-open-launch', 'wl-tests-status']) assert.match(tab, new RegExp(`id="${id}"`), id);
  assert.match(tab, /<textarea id="wl-reply-text"[^>]*readonly/);
  for (const [kind] of CHECKS) assert.match(tab, new RegExp(`<option value="${kind}">`), kind);
  const src = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  // Drafts and flags are cleared on sign-out together with the loaded registrations.
  const clear = src.slice(src.indexOf('function clearWaitlistInsights'), src.indexOf('const shortDate'));
  for (const part of ['closePrivacyReply(false)', "removedTest = null", "$('#wl-check').value = 'all'", 'waitlistFlags = new Map()']) assert.ok(clear.includes(part), part);
  assert.ok(!/api\(\{ action: 'waitlist-remove'[^}]*\}\)[\s\S]{0,40}for \(/.test(src), 'no bulk removal loop');
});

test('find-and-remove re-check: gone only when the exact search finds nothing for that address', async () => {
  const { removalRecheck, findRemoveResult, findRemoveNote, testSignupCheck } = await import('../wallet-src/waitlist-care.js');
  const rec = { id: 'abc', email: 'Owner.Test+1@example.com', createdAt: '2026-11-07T10:00:00.000Z', consent: true, noticeVersion: '2026-05', source: 'website', status: 'active', expiresAt: '2027-11-07T10:00:00.000Z' };
  const now = Date.UTC(2026, 10, 8, 10);
  assert.deepEqual(removalRecheck(rec, { total: 0, records: [] }, { now }), { gone: true, found: 0, at: now });
  assert.equal(removalRecheck(rec, { total: 1, records: [{ id: 'abc', email: rec.email }] }).gone, false);
  assert.equal(removalRecheck(rec, { total: 1, records: [{ id: 'zzz', email: 'owner.test+1@EXAMPLE.com' }] }).found, 1, 'same address, any case');
  assert.equal(removalRecheck(rec, { total: 2, records: [] }).gone, false, 'a total without rows is not taken as gone');
  assert.equal(removalRecheck(rec, null).gone, true);
  const check = testSignupCheck(rec, { now });
  assert.equal(findRemoveResult(check, null), check.ok ? 'pass' : 'fail');
  assert.equal(findRemoveResult({ ok: true }, { gone: true }), 'pass');
  assert.equal(findRemoveResult({ ok: true }, { gone: false, found: 1 }), 'fail');
  assert.equal(findRemoveResult({ ok: false }, { gone: true }), 'fail');
  const note = findRemoveNote(rec, { passed: 6, total: 6 }, { now, recheck: { gone: true } });
  assert.match(note, /exact search afterwards found nothing\.$/);
  assert.doesNotMatch(note, /Owner\.Test|owner\.test/i, 'the note keeps the domain only');
  assert.match(findRemoveNote(rec, { passed: 6, total: 6 }, { now, recheck: { gone: false, found: 1 } }), /still found 1\.$/);
});

test('workspace wiring: the removal offer re-checks with the read-only exact search before recording', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /api\(\{ action: 'waitlist', email: record\.email \}\)/);
  assert.match(app, /removalRecheck\(record, data\)/);
  assert.match(app, /findRemoveNote\(record, check, \{ now: removedTest\.at, recheck \}\)/);
  assert.doesNotMatch(app.slice(app.indexOf("'Check it is gone'"), app.indexOf("'Check it is gone'") + 900), /waitlist-remove/, 'the re-check never removes anything');
});
