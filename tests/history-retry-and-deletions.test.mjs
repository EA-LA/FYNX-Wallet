import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcile, historyRetry, retryText, HISTORY_RETRY } from '../wallet-src/reconcile.js';
import { cleanLog, addRequest, answerRequest, removeRequest, privacyReportLines, parsePrivacyReport, mergePrivacyLogs, MAX_DELETED } from '../wallet-src/privacy-requests.js';

const W = '0x1111111111111111111111111111111111111111';
const h = n => '0x' + String(n).padStart(64, '0');
const sepolia = { id: 84532 };
const sub = (n, status) => ({ hash: h(n), label: `Send ${n}`, network: sepolia, address: W, status });
const result = journal => reconcile({ history: { chainId: 84532, network: 'Base Sepolia', items: [] }, journal, wallet: W, now: Date.UTC(2026, 10, 8, 12) });

test('history re-load: only for confirmed transactions missing from the history, at most twice per set', () => {
  assert.equal(historyRetry(result([])).reason, 'none');
  assert.equal(historyRetry(result([sub(1, 'pending'), sub(2, 'failed'), sub(3, 'dropped')])).due, false, 'waiting, failed and dropped never trigger it');
  const r = result([sub(1, 'confirmed'), sub(2, 'pending')]);
  const first = historyRetry(r);
  assert.equal(first.due, true); assert.equal(first.attempt, 1); assert.equal(first.max, HISTORY_RETRY.max); assert.equal(first.count, 1);
  assert.equal(first.delayMs, HISTORY_RETRY.delayMs); assert.ok(first.delayMs >= 30000, 'gives the provider time to catch up');
  assert.equal(historyRetry(r, { key: first.key, attempts: 1 }).attempt, 2);
  const used = historyRetry(r, { key: first.key, attempts: 2 });
  assert.equal(used.due, false); assert.equal(used.reason, 'used-up');
  assert.match(retryText(used), /after 2 automatic re-loads/);
  // A new confirmed transaction is a new set: the count starts again.
  const more = historyRetry(result([sub(1, 'confirmed'), sub(4, 'confirmed')]), { key: first.key, attempts: 2 });
  assert.equal(more.due, true); assert.equal(more.attempt, 1); assert.equal(more.count, 2);
  // Turning it off sticks for the same set only.
  assert.equal(historyRetry(r, { key: first.key, attempts: 0, cancelled: true }).reason, 'cancelled');
  assert.match(retryText(historyRetry(r, { key: first.key, cancelled: true })), /Automatic re-load is off/);
  assert.match(retryText(first, '12:00:45'), /by itself at 12:00:45 \(try 1 of 2\)\. Read-only\./);
  assert.equal(retryText(historyRetry(result([]))), '');
  // Order of the journal does not change the key.
  assert.equal(historyRetry(result([sub(4, 'confirmed'), sub(1, 'confirmed')])).key, more.key);
  assert.equal(historyRetry(r, {}, { max: 0, delayMs: 10 }).reason, 'used-up');
  assert.equal(historyRetry(null).due, false);
});

test('history re-load: the workspace reloads read-only, pauses while hidden or busy and stops on sign-out', () => {
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  const owner = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  assert.match(owner, /id="rc-auto"[^>]*hidden/); assert.match(owner, /id="rc-auto-cancel"/); assert.match(owner, /id="rc-auto-text"[^>]*role="status"/);
  const block = app.slice(app.indexOf('const historyAuto'), app.indexOf("$('#rc-auto-cancel')"));
  assert.ok(app.includes("serverCall({ action: 'history', chainId }"), 'the re-load is the same read-only history call');
  assert.match(app, /function planHistoryAuto[\s\S]*document\.hidden[\s\S]*if \(busy\)/);
  assert.match(app, /expected !== generation \|\| !lastHistory/);
  assert.match(app, /function clearReconcile\(\) \{ stopHistoryAuto\(\);/);
  assert.ok(block.length > 0);
  for (const word of ['sendTransaction', 'eth_sendRawTransaction', 'signMessage']) assert.ok(!app.slice(app.indexOf('function planHistoryAuto'), app.indexOf("$('#rc-auto-cancel')")).includes(word));
});

const T = Date.UTC(2026, 10, 8, 9, 0), H = 3600000, today = '2026-11-08';
function twoRequests() {
  let log = { entries: [] };
  log = addRequest(log, { received: '2026-10-20', type: 'delete', ref: 'Ticket 7' }, { today, now: T - 200 * H, id: 'pr-a' }).log;
  log = addRequest(log, { received: '2026-11-01', type: 'access' }, { today, now: T - 100 * H, id: 'pr-b' }).log;
  return log;
}

test('privacy deletions: a marker is kept, travels in the report and is read back', () => {
  const log = removeRequest(twoRequests(), 'pr-a', T);
  assert.deepEqual(log.entries.map(e => e.id), ['pr-b']);
  assert.deepEqual(log.deleted, [{ id: 'pr-a', at: T }]);
  assert.deepEqual(removeRequest(log, 'pr-missing', T).deleted, log.deleted, 'removing nothing adds no marker');
  // Other changes keep the markers.
  const answered = answerRequest(log, 'pr-b', { answered: today, outcome: 'replied', now: T + H }).log;
  assert.deepEqual(answered.deleted, log.deleted);
  const added = addRequest(answered, { received: today, type: 'other' }, { today, now: T + 2 * H, id: 'pr-c' }).log;
  assert.deepEqual(added.deleted, log.deleted);
  const lines = privacyReportLines(added).join('\n');
  assert.match(lines, /- pr-a · deleted 2026-11-08 09:00 UTC/);
  assert.ok(!lines.includes('Ticket 7'));
  const back = parsePrivacyReport(lines);
  assert.equal(back.unknown, 0); assert.deepEqual(back.log.deleted, [{ id: 'pr-a', at: T }]);
  // A log with only deletions still writes its section.
  assert.ok(privacyReportLines(removeRequest(removeRequest(twoRequests(), 'pr-a', T), 'pr-b', T)).length > 0);
  // Stored markers are cleaned: bad ids/times dropped, newest kept per id, capped.
  const raw = { entries: [], deleted: [{ id: 'pr-x', at: 5 }, { id: 'pr-x', at: 9 }, { id: 'Bad Id', at: 3 }, { id: 'pr-y', at: -1 }, null, { id: 'pr-z' }] };
  assert.deepEqual(cleanLog(raw).deleted, [{ id: 'pr-x', at: 9 }]);
  const many = cleanLog({ entries: [], deleted: Array.from({ length: MAX_DELETED + 20 }, (_, i) => ({ id: `pr-${i}`, at: i + 1 })) });
  assert.equal(many.deleted.length, MAX_DELETED); assert.equal(many.deleted[0].at, MAX_DELETED + 20);
});

test('privacy deletions merge: deleted on the other device goes here; an older report cannot bring it back; a later change here is kept', () => {
  const here = twoRequests();
  const there = removeRequest(twoRequests(), 'pr-a', T);
  const m = mergePrivacyLogs(here, parsePrivacyReport(privacyReportLines(there).join('\n')).log);
  assert.deepEqual(m.removed.map(e => e.id), ['pr-a']); assert.equal(m.removed[0].ref, 'Ticket 7', 'the preview can say which local reference goes with it');
  assert.deepEqual(m.log.entries.map(e => e.id), ['pr-b']);
  assert.deepEqual(m.log.deleted.map(d => d.id), ['pr-a']);
  // Importing an older report (from before the deletion) does not resurrect the request.
  const old = mergePrivacyLogs(m.log, parsePrivacyReport(privacyReportLines(twoRequests()).join('\n')).log);
  assert.deepEqual(old.gone, ['pr-a']); assert.deepEqual(old.added, []);
  assert.deepEqual(old.log.entries.map(e => e.id), ['pr-b']);
  // This browser answered pr-a after the other device deleted it: the answer is kept, the marker dropped.
  const answeredLater = answerRequest(twoRequests(), 'pr-a', { answered: today, outcome: 'removed', now: T + 2 * H }).log;
  const k = mergePrivacyLogs(answeredLater, there);
  assert.deepEqual(k.keptDeleted, ['pr-a']); assert.deepEqual(k.removed, []);
  assert.ok(k.log.entries.some(e => e.id === 'pr-a' && e.answered === today));
  assert.ok(!k.log.deleted.some(d => d.id === 'pr-a'));
  // Same minute: the deletion wins.
  const sameMinute = removeRequest(twoRequests(), 'pr-b', T - 100 * H + 30000);
  assert.deepEqual(mergePrivacyLogs(twoRequests(), sameMinute).removed.map(e => e.id), ['pr-b']);
  // Both devices deleted it: nothing to do, one marker.
  const both = mergePrivacyLogs(there, there);
  assert.deepEqual(both.removed, []); assert.equal(both.log.deleted.length, 1);
});

test('privacy deletions: forged or broken deletion lines are not understood', () => {
  const text = ['## Waitlist privacy requests', '', '- pr-a · deleted 2026-13-40 99:99 UTC', '- pr-b · deleted yesterday', '- Bad · deleted 2026-11-08 09:00 UTC'].join('\n');
  const r = parsePrivacyReport(text);
  assert.deepEqual(r.log.deleted, []); assert.equal(r.unknown, 3);
});

test('privacy deletions: the import preview lists and applies them', () => {
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /deleted on the other device, will be deleted here/);
  assert.match(app, /already deleted here, not brought back/);
  assert.match(app, /privacy request deletion/);
  assert.ok(!app.includes('A request deleted on one device must be deleted on each device'));
});
