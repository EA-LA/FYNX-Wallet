import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECTIONS, GUIDE_TABS, securityChips, waitlistChips, cleanResume, rememberPart, resumeTarget, guideItems } from '../wallet-src/section-guide.js';
import { identityTests, gateTests } from '../wallet-src/security-checkup.js';
import { cleanLog, logSummary } from '../wallet-src/privacy-requests.js';

const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const plan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));

test('Account security and Waitlist have their own section bars', () => {
  assert.deepEqual(GUIDE_TABS, ['launch', 'wallet', 'security', 'registrations']);
  assert.deepEqual(SECTIONS.security.map(s => s.id), ['checkup', 'tests', 'access', 'emergency', 'passkeys', 'recovery']);
  assert.deepEqual(SECTIONS.registrations.map(s => s.id), ['find', 'insights', 'quality', 'pilot', 'rows', 'privacy', 'tests']);
});

test('security chips: a fresh browser shows honest starting states', () => {
  const tests = identityTests(plan, {});
  const c = securityChips({ checkup: { done: 2, total: 5 }, tests, access: { fine: 0, total: 5, urgent: 0, risk: 0 }, emergency: { done: 0, total: 6 }, passkeys: 0 });
  assert.deepEqual(c.checkup, { text: '2/5', tone: 'warn', say: '2 of 5 security checks done' });
  assert.equal(c.tests.text, `0/${tests.total}`);
  assert.deepEqual([c.access.text, c.access.tone], ['0/5', 'info']);
  assert.deepEqual([c.emergency.text, c.emergency.tone], ['0/6', 'warn']);
  assert.deepEqual(c.passkeys, { text: 'None', tone: 'warn', say: 'no passkey yet' });
  assert.equal(c.recovery, undefined, 'information only: no chip');
});

test('security chips: gaps and failures are red, finished parts green', () => {
  const c = securityChips({ checkup: { done: 5, total: 5 }, tests: { total: 6, done: 2, failed: 1 }, access: { fine: 3, total: 5, urgent: 2, risk: 1 }, emergency: { done: 6, total: 6 }, passkeys: 2 });
  assert.deepEqual(c.checkup, { text: '5/5', tone: 'ok', say: '5 of 5 security checks done, all done' });
  assert.deepEqual([c.tests.text, c.tests.tone], ['1 failed', 'block']);
  assert.deepEqual([c.access.text, c.access.tone, c.access.say], ['1 gap', 'block', '1 account with a gap']);
  assert.equal(c.emergency.tone, 'ok');
  assert.deepEqual([c.passkeys.text, c.passkeys.say], ['2', '2 passkeys registered']);
  assert.deepEqual([securityChips({ access: { fine: 3, total: 5, urgent: 2, risk: 0 } }).access.text], ['2 to review']);
  assert.equal(securityChips({ access: { fine: 5, total: 5, urgent: 0, risk: 0 } }).access.tone, 'ok');
  assert.deepEqual(securityChips({ checkup: null, emergency: null, passkeys: NaN }), {}, 'signed out: nothing guessed');
});

test('waitlist chips before loading: only what this browser knows', () => {
  const c = waitlistChips({ loaded: null, privacy: null, tests: gateTests(plan, {}, 'website') });
  assert.deepEqual(c.find, { text: 'Not loaded', tone: 'info', say: 'registrations not loaded yet' });
  for (const k of ['insights', 'quality', 'pilot', 'privacy']) assert.equal(c[k], undefined, k);
  assert.match(c.tests.text, /^0\/\d+$/);
});

test('waitlist chips after loading', () => {
  const c = waitlistChips({ loaded: { loaded: 50, total: 120 }, last7: 1, quality: { attention: 3 }, invited: 40, privacy: { open: 2, overdue: 0, dueSoon: 1 }, tests: { total: 2, done: 2, failed: 0 } });
  assert.deepEqual([c.find.text, c.find.tone], ['50 of 120', 'info']);
  assert.deepEqual([c.insights.text, c.insights.say], ['1 this week', '1 sign-up in the last 7 days']);
  assert.deepEqual([c.quality.text, c.quality.tone], ['3 to look at', 'warn']);
  assert.deepEqual([c.pilot.text, c.pilot.say], ['40 to invite', '40 people on the invite list']);
  assert.deepEqual([c.privacy.text, c.privacy.tone], ['1 due soon', 'warn']);
  assert.deepEqual([c.tests.text, c.tests.tone], ['2/2', 'ok']);
  const d = waitlistChips({ loaded: { loaded: 120, total: 120 }, last7: 0, quality: { attention: 0 }, invited: 0, privacy: { open: 3, overdue: 2, dueSoon: 1 } });
  assert.deepEqual([d.find.text, d.find.tone], ['120 loaded', 'ok']);
  assert.deepEqual([d.quality.text, d.quality.tone], ['All clear', 'ok']);
  assert.equal(d.pilot.tone, 'warn');
  assert.deepEqual([d.privacy.text, d.privacy.tone], ['2 overdue', 'block']);
  assert.equal(waitlistChips({ privacy: { open: 1, overdue: 0, dueSoon: 0 } }).privacy.text, '1 open');
  assert.equal(waitlistChips({ privacy: { open: 0, overdue: 0, dueSoon: 0 } }).privacy.text, 'None open');
  assert.equal(waitlistChips({ loaded: undefined, last7: 5 }).insights, undefined, 'while searching one address: no totals');
});

test('waitlist privacy chip reads the real privacy log summary', () => {
  const s = logSummary(cleanLog({ entries: [{ id: 'a1', received: '2026-10-01', type: 'delete' }] }), '2026-11-26');
  assert.deepEqual([s.open, s.overdue], [1, 1], 'arrived 56 days ago: overdue');
  assert.deepEqual(waitlistChips({ privacy: s }).privacy, { text: '1 overdue', tone: 'block', say: '1 request overdue' });
});

test('resume memory: keeps known parts only, forgets the top of a tab', () => {
  assert.deepEqual(cleanResume(null), {});
  assert.deepEqual(cleanResume([]), {});
  assert.deepEqual(cleanResume({ launch: 'decisions', wallet: 'evil', registrations: 'privacy', other: 'x', security: 3 }), { launch: 'decisions', registrations: 'privacy' });
  let s = rememberPart({}, 'security', 'emergency');
  assert.deepEqual(s, { security: 'emergency' });
  s = rememberPart(s, 'launch', 'services');
  assert.deepEqual(s, { security: 'emergency', launch: 'services' });
  s = rememberPart(s, 'security', 'checkup');
  assert.deepEqual(s, { launch: 'services' }, 'back at the top: nothing to return to');
  assert.deepEqual(rememberPart(s, 'launch', 'nope'), {});
  assert.deepEqual(rememberPart(s, 'dashboard', 'x'), { launch: 'services' });
});

test('resume target: only a part that is shown right now', () => {
  const state = { registrations: 'pilot', launch: 'services' };
  assert.equal(resumeTarget(state, 'registrations'), '#wl-pilot-box');
  assert.equal(resumeTarget(state, 'registrations', t => t !== '#wl-pilot-box'), '', 'list not loaded: stay at the top');
  assert.equal(resumeTarget(state, 'security'), '');
  assert.equal(resumeTarget({ launch: '#x' }, 'launch'), '');
  assert.equal(resumeTarget(state, 'dashboard'), '');
});

test('guide items: parts hidden until registrations are loaded are left out', () => {
  const hidden = new Set(['#waitlist-insights', '#wl-quality-box', '#wl-pilot-box']);
  assert.deepEqual(guideItems('registrations', {}, t => !hidden.has(t)).map(i => i.id), ['find', 'rows', 'privacy', 'tests']);
});

test('the page wires the new bars: renders refresh them, tabs remember and return, storage is guarded', () => {
  for (const fn of ['renderPrivacyLog\\(focus\\)', 'renderPilotInvites\\(\\)', 'renderWaitlistTests\\(\\)', 'renderSecurityTests\\(\\)', 'renderAccessReview\\(\\)', 'renderEmergencyPlan\\(\\)', 'renderPasskeys\\(\\)']) {
    assert.match(app, new RegExp(`function ${fn} \\{\\n  scheduleGuide\\(\\);`), fn);
  }
  assert.match(app, /const leaving = visibleGuideTab\(\);\n  if \(leaving && leaving !== name\) rememberActivePart\(leaving\);/);
  assert.match(app, /for \(const tab of GUIDE_TABS\)/);
  assert.match(app, /try \{ localStorage\.setItem\(RESUME_KEY, JSON\.stringify\(next\)\); \} catch/);
  assert.match(app, /try \{ return cleanResume\(JSON\.parse\(localStorage\.getItem\(RESUME_KEY\)/);
  assert.ok(app.indexOf('let guideFrame = 0') < app.indexOf('function selectTab('), 'guide state is declared before any render can schedule it');
});
