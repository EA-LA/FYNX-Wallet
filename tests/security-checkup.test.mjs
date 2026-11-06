import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { methodLabel, relativeTime, passkeyRows, signInMethods, freshness, idleLeft, minutesText, checkup, summaryText, shortAddress, FRESH_SIGNIN_MS, IDLE_LIMIT_MS, identityTests } from '../wallet-src/security-checkup.js';

const now = Date.parse('2026-11-05T12:00:00Z');
const core = await readFile(new URL('../firebase-wallet/functions/core.js', import.meta.url), 'utf8');
const wallet = { address: '0x52908400098527886E0F7030069857D2E4169EE7' };

test('sign-in methods are named in plain words', () => {
  assert.equal(methodLabel('google.com'), 'Google');
  assert.equal(methodLabel('password'), 'Email & password');
  assert.equal(methodLabel('custom'), 'Passkey');
  assert.equal(methodLabel('phone'), 'Other sign-in');
  assert.deepEqual(signInMethods({ providers: ['google.com'], passkeys: [] }), ['Google']);
  assert.deepEqual(signInMethods({ providers: ['google.com', 'password'], passkeys: [{ id: 'a' }, { id: 'b' }] }), ['Google', 'Email & password', '2 passkeys']);
  assert.deepEqual(signInMethods({ providers: [], passkeys: [{ id: 'a' }] }), ['1 passkey']);
  assert.deepEqual(signInMethods(), []);
});

test('relative times', () => {
  assert.equal(relativeTime(now - 10000, now), 'just now');
  assert.equal(relativeTime(now - 60000, now), '1 minute ago');
  assert.equal(relativeTime(now - 3 * 3600000, now), '3 hours ago');
  assert.equal(relativeTime(now - 86400000, now), '1 day ago');
  assert.equal(relativeTime(now - 90 * 86400000, now), '3 months ago');
  assert.equal(relativeTime('not a date', now), 'date unknown');
  assert.equal(relativeTime(null, now), 'date unknown');
});

test('passkeys are numbered oldest first, unknown dates last, junk ignored', () => {
  const rows = passkeyRows([
    { id: 'new', createdAt: '2026-11-04T10:00:00Z' },
    { id: 'unknown', createdAt: null },
    { id: 'old', createdAt: '2026-10-01T10:00:00Z' },
    null, { id: 5 },
  ], now);
  assert.deepEqual(rows.map(r => [r.id, r.label]), [['old', 'Passkey 1'], ['new', 'Passkey 2'], ['unknown', 'Passkey 3']]);
  assert.equal(rows[1].ago, '1 day ago');
  assert.equal(rows[2].added, 'recently');
  assert.deepEqual(passkeyRows(undefined), []);
});

test('fresh sign-in window matches the backend five-minute rule and idle timer matches 15 minutes', () => {
  assert.equal(FRESH_SIGNIN_MS, 300000);
  assert.equal(IDLE_LIMIT_MS, 900000);
  assert.deepEqual(freshness(now - 60000, now), { fresh: true, leftMs: 240000 });
  assert.deepEqual(freshness(now - 301000, now), { fresh: false, leftMs: 0 });
  assert.deepEqual(freshness(0, now), { fresh: false, leftMs: 0 });
  assert.equal(idleLeft(now - 5 * 60000, now), 600000);
  assert.equal(idleLeft(now - 20 * 60000, now), 0);
  assert.equal(minutesText(600000), '10 minutes');
  assert.equal(minutesText(30000), 'under a minute');
  assert.match(core, /auth_time > 300/);
});

test('checkup: a Google-only owner without passkeys has work to do', () => {
  const r = checkup({ emailVerified: true, providers: ['google.com'], passkeys: [], wallet: null });
  assert.equal(r.total, 5); assert.equal(r.done, 1);
  const byId = Object.fromEntries(r.checks.map(c => [c.id, c]));
  assert.equal(byId.email.state, 'done');
  assert.equal(byId.passkey.state, 'todo'); assert.equal(byId.passkey.fix, 'add-passkey');
  assert.equal(byId.backup.state, 'todo'); assert.match(byId.backup.detail, /Set an email password/);
  assert.equal(byId.wallet.fix, 'wallet');
  assert.equal(byId.idle.state, 'info');
});

test('checkup: a well-protected owner passes every check', () => {
  const r = checkup({ emailVerified: true, providers: ['google.com', 'password'], passkeys: [{ id: 'a' }, { id: 'b' }], wallet });
  assert.equal(r.done, r.total);
  assert.ok(r.checks.every(c => !c.fix));
  assert.match(r.checks.find(c => c.id === 'wallet').detail, /0x5290…9EE7/);
  assert.match(r.checks.find(c => c.id === 'backup').detail, /Google, Email & password, 2 passkeys/);
});

test('checkup: one passkey plus Google counts as two ways in but still asks for a second device', () => {
  const r = checkup({ emailVerified: false, providers: ['google.com'], passkeys: [{ id: 'a' }] });
  const byId = Object.fromEntries(r.checks.map(c => [c.id, c.state]));
  assert.deepEqual(byId, { email: 'todo', passkey: 'done', 'second-passkey': 'todo', backup: 'done', wallet: 'todo', idle: 'info' });
});

test('summary has counts and dates only: no email, wallet address or passkey ids', () => {
  const passkeys = passkeyRows([{ id: 'secret-passkey-id', createdAt: '2026-11-01T00:00:00Z' }], now);
  const result = checkup({ emailVerified: true, providers: ['google.com'], passkeys, wallet });
  const text = summaryText({ result, methods: signInMethods({ providers: ['google.com'], passkeys }), passkeys, signInWith: 'Google', now });
  assert.match(text, /^FYNX owner account security checkup, 2026-11-05 12:00 UTC/);
  assert.match(text, /4 of 5 checks done/);
  assert.match(text, /\[ \] A passkey on a second device/);
  assert.match(text, /\[i\] Automatic sign-out is on/);
  assert.match(text, /This sign-in used: Google/);
  assert.doesNotMatch(text, /0x[0-9a-f]{4}|secret-passkey-id|@/i);
  assert.equal(shortAddress('nope'), 'linked');
});

test('owner page has the checkup and the security tab steps exist in the launch plan', async () => {
  const html = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
  for (const id of ['sec-score', 'sec-checks', 'sec-signin', 'sec-methods', 'sec-tests', 'sec-copy', 'sec-refresh', 'passkey-list', 'add-passkey']) assert.match(html, new RegExp(`id="${id}"`));
  const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
  const identity = plan.items.find(g => g.id === 'identity');
  assert.ok(identity.steps.filter(s => s.by === 'you').length >= 5);
});

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const ownerPage = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');

test('account-security launch tests come from the identity gate and share Launch readiness records', () => {
  const empty = identityTests(plan, {});
  const yours = plan.items.find(g => g.id === 'identity').steps.filter(s => s.by === 'you');
  assert.equal(empty.total, yours.length);
  assert.ok(empty.total >= 5);
  assert.equal(empty.done, yours.filter(s => s.done).length);
  assert.ok(empty.steps.every(s => s.key.startsWith('identity/')));
  const records = { 'identity/google-desktop': { result: 'pass', note: 'Chrome 131' }, 'identity/idle': { result: 'fail', note: '' }, 'identity/passkey-phone': { result: 'skip' }, 'signing/send-eth': { result: 'pass' } };
  const r = identityTests(plan, records);
  assert.equal(r.done, empty.done + 2, 'passed and not-applicable count as recorded');
  assert.equal(r.failed, 1);
  const google = r.steps.find(s => s.key === 'identity/google-desktop');
  assert.equal(google.state, 'done'); assert.equal(google.result, 'pass'); assert.equal(google.note, 'Chrome 131');
  assert.equal(r.steps.find(s => s.key === 'identity/idle').state, 'failed');
  assert.deepEqual(identityTests({ items: [] }, {}), { gate: null, steps: [], total: 0, done: 0, failed: 0 });
});

test('the checkup summary adds launch-test counts without step notes', () => {
  const result = checkup({ emailVerified: true, providers: ['google.com'], passkeys: [] });
  const tests = identityTests(plan, { 'identity/google-desktop': { result: 'pass', note: 'secret note text' }, 'identity/idle': { result: 'fail' } });
  const text = summaryText({ result, methods: ['Google'], passkeys: [], tests, now });
  assert.match(text, new RegExp(`Account-security launch tests: ${tests.done} of ${tests.total} recorded, 1 failed\\.`));
  assert.doesNotMatch(text, /secret note text/);
  assert.doesNotMatch(summaryText({ result, methods: ['Google'], passkeys: [], now }), /launch tests/);
});

test('Account security records test results inline', () => {
  assert.match(ownerPage, /id="sec-tests-count"/);
  assert.match(ownerPage, /id="sec-open-launch"/);
  assert.doesNotMatch(ownerPage, /Record each result there\./);
  assert.match(appSource, /function recordSecurityStep\(gate, step, patch, focusKey\)/);
  assert.match(appSource, /saveLaunchRecords\(\); renderLaunch\(\); renderSecurityTests\(\);/);
  assert.match(appSource, /tests: identityTests\(launchPlan, launchRecords\)/);
  assert.match(appSource, /list\.querySelector\(`\[data-step="\$\{CSS\.escape\(focusStep\)\}"\]/, 'checklist focus stays inside the checklist, not a hidden tab');
});
