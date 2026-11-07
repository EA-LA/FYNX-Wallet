import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { privacyAttention, addRequest, answerRequest } from '../wallet-src/privacy-requests.js';
import { waitingItems, autoCheckDue, batchSummary, AUTO_CHECK_MS, MAX_BATCH } from '../wallet-src/tx-tracker.js';

const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const owner = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
const today = '2026-11-07';
let n = 0;
const add = (log, received, type = 'access', ref = '') => addRequest(log, { received, type, ref }, { today, now: ++n, id: `pr-${n}` }).log;

test('privacy attention: nothing open means no badge and no next steps', () => {
  const a = privacyAttention({ entries: [] }, today);
  assert.deepEqual([a.open, a.badge, a.tone, a.next.length], [0, '', 'none', 0]);
  assert.equal(a.label, 'No open privacy requests');
});

test('privacy attention: overdue first, then due soon; answered ones never count', () => {
  let log = { entries: [] };
  log = add(log, '2026-11-05');              // due 12-05, open (28 days)
  log = add(log, '2026-10-12', 'delete', 'Ticket 9'); // due 11-11, due soon
  log = add(log, '2026-10-01', 'correct');   // due 10-31, overdue
  log = add(log, '2026-09-01');              // answered
  const answeredId = log.entries.find(e => e.received === '2026-09-01').id;
  log = answerRequest(log, answeredId, { answered: '2026-09-10', outcome: 'replied' }).log;
  const a = privacyAttention(log, today);
  assert.equal(a.open, 3); assert.equal(a.overdue, 1); assert.equal(a.dueSoon, 1);
  assert.equal(a.tone, 'overdue'); assert.equal(a.badge, '3');
  assert.equal(a.label, '3 open privacy requests, 1 overdue, 1 due within 7 days');
  assert.deepEqual(a.next.map(i => [i.state, i.due, i.title]), [['overdue', '2026-10-31', 'Asked to fix their address'], ['due-soon', '2026-11-11', 'Asked to be removed']]);
  assert.equal(a.next[1].ref, 'Ticket 9');
  assert.equal(privacyAttention(log, today, 1).next.length, 1);
  assert.equal(privacyAttention(log, today, 0).next.length, 0);
});

test('privacy attention: tone follows the most urgent state and stays email-free', () => {
  const soon = add({ entries: [] }, '2026-10-10');
  assert.equal(privacyAttention(soon, today).tone, 'due-soon');
  const calm = add({ entries: [] }, '2026-11-06');
  const a = privacyAttention(calm, today);
  assert.equal(a.tone, 'open'); assert.equal(a.next.length, 0); assert.equal(a.label, '1 open privacy request');
  assert.doesNotMatch(JSON.stringify(privacyAttention(soon, today)), /@/);
});

const item = (hash, id, submittedAt, result = null) => ({ hash, network: { id }, submittedAt, result });
test('waiting items: unsettled on this network only, newest first, capped', () => {
  const items = [
    item('a', 84532, 1), item('b', 84532, 3), item('c', 11155111, 2),
    item('d', 84532, 4, { status: 'confirmed', deep: true }),
    item('e', 84532, 5, { status: 'confirmed', deep: false }),
    item('f', 84532, 6, { status: 'replaced' }), item('g', 84532, 7, { status: 'pending' }),
  ];
  assert.deepEqual(waitingItems(items, 84532).map(i => i.hash), ['g', 'e', 'b', 'a']);
  assert.deepEqual(waitingItems(items, 11155111).map(i => i.hash), ['c']);
  const many = Array.from({ length: 25 }, (_, i) => item(`h${i}`, 1, i));
  assert.equal(waitingItems(many, 1).length, MAX_BATCH);
  assert.equal(waitingItems(many, 1)[0].hash, 'h24');
});

test('automatic re-check runs every 30 seconds only when it is safe and useful', () => {
  const ok = { enabled: true, hidden: false, busy: false, connected: true, waiting: 2, lastRun: null, now: 100000 };
  assert.equal(AUTO_CHECK_MS, 30000);
  assert.equal(autoCheckDue(ok), true);
  assert.equal(autoCheckDue({ ...ok, lastRun: 100000 - 29999 }), false);
  assert.equal(autoCheckDue({ ...ok, lastRun: 100000 - 30000 }), true);
  for (const key of ['enabled', 'connected']) assert.equal(autoCheckDue({ ...ok, [key]: false }), false, key);
  for (const key of ['hidden', 'busy']) assert.equal(autoCheckDue({ ...ok, [key]: true }), false, key);
  assert.equal(autoCheckDue({ ...ok, waiting: 0 }), false);
});

test('batch summary groups results in plain words', () => {
  assert.equal(batchSummary([]), 'Nothing is waiting on this network.');
  const s = batchSummary([{ result: { label: 'Confirmed' } }, { result: { label: 'Confirmed' } }, { result: { label: 'Waiting to be included' } }, { error: new Error('x') }]);
  assert.equal(s, 'Checked 4 transactions: 2 confirmed, 1 waiting to be included, 1 could not be checked.');
});

test('workspace wiring: badge, next steps, check-all and auto re-check are read-only', () => {
  assert.match(owner, /data-tab="registrations">Waitlist<span id="wl-tab-badge" class="tab-badge" hidden><\/span>/);
  assert.match(owner, /id="tx-check-all"[^>]*disabled/);
  assert.match(owner, /id="tx-auto" type="checkbox"/);
  assert.match(app, /privacyAttention\(privacyLog, localToday\(\)\)/);
  assert.match(app, /openPrivacyRequest\(item\.id\)/);
  const batch = app.slice(app.indexOf('async function checkWaiting'), app.indexOf('function trackTransaction'));
  assert.ok(batch.length > 200);
  assert.doesNotMatch(batch, /sendTransfer|sendAction|signMessage|eth_send|prepare/);
  assert.match(batch, /checkStatus\(item\.hash, checkSession\)/);
  assert.match(batch, /document\.hidden/);
  // Signing out stops the automatic re-check.
  const clear = app.slice(app.indexOf('function clearPrivateWorkspace'), app.indexOf('function clearPrivateWorkspace') + 400);
  assert.match(clear, /\$\('#tx-auto'\)\.checked = false/);
});
