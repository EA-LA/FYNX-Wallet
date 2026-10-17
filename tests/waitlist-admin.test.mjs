import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { listWaitlist, removeWaitlistRegistration } from '../firebase-wallet/functions/waitlist.js';
import { hash } from '../firebase-wallet/functions/core.js';
const require = createRequire(new URL('../firebase-wallet/functions/package.json', import.meta.url));
const { Timestamp } = require('firebase-admin/firestore');

function database(count = 121) {
  const records = new Map(), audits = new Map();
  for (let i = 0; i < count; i++) {
    const email = `test-${i}@example.com`;
    records.set(hash(email), { email, createdAt: new Timestamp(1700000000 + Math.floor(i / 3), 123456789), expiresAt: new Timestamp(1800000000, 0), consent: true, noticeVersion: 'prelaunch-v2', source: 'fynx-wallet-public', status: 'waiting' });
  }
  const snapshot = id => ({ id, exists: records.has(id), data: () => records.get(id) });
  const db = { records, audits, failCommit: false, collection(name) {
    assert.ok(['fynxWalletWaitlist', 'fynxWalletAudit'].includes(name));
    const query = { cursor: null, maximum: Infinity,
      doc: id => ({ name, id: id || 'audit-id', get: async () => snapshot(id) }),
      orderBy(field, direction) { assert.equal(direction, 'desc'); return this; },
      startAfter(time, id) { this.cursor = { time, id }; return this; },
      limit(maximum) { this.maximum = maximum; return this; },
      count: () => ({ get: async () => ({ data: () => ({ count: records.size }) }) }),
      async get() {
        const time = doc => doc.data().createdAt;
        const compare = (a, b) => time(b).seconds - time(a).seconds || time(b).nanoseconds - time(a).nanoseconds || b.id.localeCompare(a.id);
        let docs = [...records.keys()].map(snapshot).sort(compare);
        if (this.cursor) { const cursorDoc = { id: this.cursor.id, data: () => ({ createdAt: this.cursor.time }) }; docs = docs.filter(doc => compare(doc, cursorDoc) > 0); }
        return { docs: docs.slice(0, this.maximum) };
      },
    }; return query;
  }, async runTransaction(work) {
    const writes = [];
    const result = await work({ get: async ref => snapshot(ref.id), delete: ref => writes.push(() => records.delete(ref.id)), create: (ref, value) => writes.push(() => audits.set(ref.id, value)) });
    if (this.failCommit) throw new Error('Database unavailable');
    writes.forEach(write => write()); return result;
  } }; return db;
}
test('All registrations can be paged without omission or duplicates, including equal timestamps', async () => {
  const db = database(), ids = [];
  let cursor;
  do {
    const page = await listWaitlist(db, { cursor, pageSize: 25 });
    assert.equal(page.total, 121); assert.ok(page.records.length <= 25);
    ids.push(...page.records.map(r => r.id)); cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 121); assert.equal(new Set(ids).size, 121);
  assert.deepEqual(new Set(ids), new Set(db.records.keys()));
});
test('Pagination continues when the last row is deleted; email lookup normalizes and includes consent evidence', async () => {
  const db = database();
  const first = await listWaitlist(db, { pageSize: 50 });
  db.records.delete(first.nextCursor.id);
  const next = await listWaitlist(db, { cursor: first.nextCursor });
  assert.equal(next.records.length, 50);
  assert.ok(next.records.every(r => !first.records.some(a => a.id === r.id)));
  const found = await listWaitlist(db, { email: '  TEST-1@example.com  ' });
  assert.equal(found.total, 1); assert.equal(found.records[0].consent, true);
  assert.equal(found.records[0].noticeVersion, 'prelaunch-v2'); assert.ok(found.records[0].expiresAt);
  assert.equal((await listWaitlist(db, { email: 'missing@example.com' })).total, 0);
});
test('Malformed email, cursor paths, timestamps and oversized pages are rejected', async () => {
  const db = database();
  for (const input of [{ email: {} }, { email: 'bad' }, { pageSize: 51 }, { pageSize: 0 }, { cursor: 'bad' }, { cursor: { id: '../other', seconds: 1, nanoseconds: 0 } }, { cursor: { id: 'a'.repeat(64), seconds: 1, nanoseconds: 1e9 } }]) await assert.rejects(listWaitlist(db, input), { code: 'invalid-argument' });
  await assert.rejects(removeWaitlistRegistration(db, 'owner', { id: '../other' }), { code: 'invalid-argument' });
});
test('Deletion and its privacy-preserving audit commit together; retries are idempotent', async () => {
  const db = database(1), id = hash('test-0@example.com');
  db.failCommit = true;
  await assert.rejects(removeWaitlistRegistration(db, 'owner', { id }), /unavailable/);
  assert.equal(db.records.size, 1); assert.equal(db.audits.size, 0);
  db.failCommit = false;
  assert.equal((await removeWaitlistRegistration(db, 'owner', { id })).removed, true);
  assert.equal(db.records.size, 0); assert.equal(db.audits.size, 1);
  const audit = [...db.audits.values()][0];
  assert.equal(audit.action, 'waitlist.removed'); assert.equal(audit.actor, hash('owner'));
  assert.equal(JSON.stringify(audit).includes('test-0@example.com'), false);
  assert.equal((await removeWaitlistRegistration(db, 'owner', { id })).removed, false);
});
