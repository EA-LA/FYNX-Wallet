import test from 'node:test';
import assert from 'node:assert/strict';
import { emergencyPlan, planState, planHeadline, sheetFreshness, sheetMarkdown, recordSheet, cleanEmergency, fingerprint, SCENARIOS, LINKS } from '../wallet-src/emergency-plan.js';
import { accessSummary, updateService } from '../wallet-src/access-review.js';

const TODAY = '2026-11-13';
const pass = { result: 'pass', note: '', at: 1 };

test('a fresh account with only Google is prepared for few situations and says what to do', () => {
  const plan = emergencyPlan(planState({ providers: ['google.com'], passkeys: 0 }));
  assert.equal(plan.total, 6);
  assert.equal(plan.scenarios.length, SCENARIOS.length);
  const by = Object.fromEntries(plan.scenarios.map(s => [s.id, s]));
  assert.equal(by.device.ready.ok, true, 'Google still works without a lost passkey device');
  assert.equal(by.google.ready.ok, false);
  assert.match(by.google.ready.text, /^Add a passkey/);
  assert.equal(by.google.ready.fix, 'passkeys');
  assert.equal(by.locked.ready.ok, false);
  assert.match(by.locked.ready.text, /one way in \(Google\)/);
  assert.equal(by.signin.ready.fix, 'drill');
  assert.equal(by.wallet.ready.fix, 'restore');
  assert.equal(by.phishing.ready.fix, 'revoke');
  assert.equal(plan.ready, 1);
  assert.match(planHeadline(plan), /^Ready for 1 of 6 situations · 5 to prepare: Google account, strange sign-in, wallet or phrase, unexpected approval, locked out\.$/);
});

test('a single passkey as the only way in is a gap for a lost device', () => {
  const plan = emergencyPlan(planState({ providers: [], passkeys: 1 }));
  const device = plan.scenarios.find(s => s.id === 'device');
  assert.equal(device.ready.ok, false);
  assert.match(device.ready.text, /only way in is a single passkey/);
  const two = emergencyPlan(planState({ providers: [], passkeys: 2 })).scenarios.find(s => s.id === 'device');
  assert.equal(two.ready.ok, true);
});

test('a well prepared owner is ready for everything', () => {
  let review = {};
  review = updateService(review, 'google', { twoStep: 'yes', codes: 'yes', people: 1, reviewed: 'today' }, Date.parse(`${TODAY}T12:00:00Z`));
  review = updateService(review, 'cloud', { twoStep: 'yes', codes: 'yes', people: 2, reviewed: 'today' }, Date.parse(`${TODAY}T12:00:00Z`));
  const access = accessSummary(review, TODAY);
  const records = { 'operations/drill': pass, 'wallet-recovery/restore-test': pass, 'swaps/revoke': pass };
  const s = planState({ providers: ['google.com', 'password'], passkeys: 2, wallet: true, access, records });
  assert.equal(s.googleSafe, true);
  assert.equal(s.cloudPeople, 2);
  const plan = emergencyPlan(s);
  assert.equal(plan.ready, 6);
  assert.equal(planHeadline(plan), 'Ready for all 6 situations.');
  const locked = plan.scenarios.find(x => x.id === 'locked');
  assert.ok(locked.steps.some(step => /your access review lists 2/.test(step.text)));
});

test('a failed or skipped practice test does not count as prepared', () => {
  const records = { 'operations/drill': { result: 'fail', note: '', at: 1 }, 'wallet-recovery/restore-test': { result: 'skip', note: '', at: 1 } };
  const s = planState({ providers: ['google.com'], records });
  assert.equal(s.drill, false);
  assert.equal(s.restore, false);
});

test('real-money sending on puts "turn it off" first and marks it urgent', () => {
  const on = emergencyPlan(planState({ providers: ['google.com'], mainnet: true }));
  for (const id of ['google', 'signin']) {
    const first = on.scenarios.find(s => s.id === id).steps[0];
    assert.equal(first.urgent, true);
    assert.equal(first.action, 'mainnet');
    assert.match(first.text, /ON\. Turn it off first/);
  }
  const off = emergencyPlan(planState({ providers: ['google.com'], mainnet: false }));
  const first = off.scenarios.find(s => s.id === 'signin').steps[0];
  assert.equal(first.urgent, undefined);
  assert.match(first.text, /is off/);
});

test('every step link resolves to a fixed https link', () => {
  const plan = emergencyPlan(planState({ providers: ['google.com'], passkeys: 1 }));
  const known = new Set(Object.values(LINKS).map(([, href]) => href));
  for (const sc of plan.scenarios) for (const step of sc.steps) for (const [label, href] of step.links) {
    assert.ok(label && href.startsWith('https://'), `${sc.id}: ${label}`);
    assert.ok(known.has(href));
  }
});

test('the emergency sheet carries fixed words and counts, never an address', () => {
  const plan = emergencyPlan(planState({ providers: ['google.com', 'password'], passkeys: 2, wallet: true }));
  const md = sheetMarkdown(plan, TODAY);
  assert.match(md, /^# FYNX emergency sheet/);
  assert.match(md, /Saved 2026-11-13\./);
  assert.match(md, /Ways into the owner workspace: Google, email & password, 2 passkeys/);
  assert.match(md, /Wallet ownership verified: yes/);
  assert.equal((md.match(/^## /gm) || []).length, 7);
  assert.doesNotMatch(md, /0x[0-9a-fA-F]{6,}/);
  assert.doesNotMatch(md, /@/);
});

test('sheet freshness: never, current, changed ways in, old', () => {
  const s = planState({ providers: ['google.com'], passkeys: 1 });
  assert.equal(sheetFreshness({}, s, TODAY).state, 'never');
  const saved = recordSheet(s, '2026-11-01');
  assert.equal(saved.fp, fingerprint(s));
  const cur = sheetFreshness(saved, s, TODAY);
  assert.equal(cur.state, 'current');
  assert.match(cur.text, /12 days ago \(2026-11-01\)/);
  assert.match(sheetFreshness(recordSheet(s, TODAY), s, TODAY).text, /saved today/);
  const more = planState({ providers: ['google.com', 'password'], passkeys: 2, mainnet: true });
  const changed = sheetFreshness(saved, more, TODAY);
  assert.equal(changed.state, 'changed');
  assert.deepEqual(changed.changes, ['email password added', 'passkeys 1 → 2', 'real-money sending turned on']);
  const old = sheetFreshness(recordSheet(s, '2026-04-01'), s, TODAY);
  assert.equal(old.state, 'old');
  assert.match(old.text, /226 days ago/);
});

test('saved sheet records are cleaned: bad, future or tampered values are dropped', () => {
  const s = planState({ providers: ['google.com'] });
  const good = recordSheet(s, '2026-11-01');
  assert.deepEqual(cleanEmergency(good, TODAY), good);
  assert.deepEqual(cleanEmergency({ ...good, savedOn: '2026-12-01' }, TODAY), {});
  assert.deepEqual(cleanEmergency({ ...good, savedOn: 'yesterday' }, TODAY), {});
  assert.deepEqual(cleanEmergency({ ...good, fp: 'google:1|seed:abandon' }, TODAY), {});
  assert.deepEqual(cleanEmergency({ ...good, extra: '0xabc' }, TODAY), good);
  assert.deepEqual(cleanEmergency(null, TODAY), {});
  assert.deepEqual(cleanEmergency([], TODAY), {});
});

test('gap texts start with a capital and never repeat the "To be ready" label', () => {
  const plan = emergencyPlan(planState({ providers: ['google.com'] }));
  for (const sc of plan.gaps) {
    assert.match(sc.ready.text, /^[A-Z]/, sc.id);
    assert.doesNotMatch(sc.ready.text, /To be ready/, sc.id);
  }
  assert.match(plan.scenarios.find(s => s.id === 'google').ready.text, /^Add a passkey so you are not locked out/);
});
