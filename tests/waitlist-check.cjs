const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
let handler, options, failPersistence = false;
const records = new Map();
const db = {
  collection: name => ({ doc: id => ({ name, id }) }),
  runTransaction: async fn => {
    if (failPersistence) throw Object.assign(new Error('database unavailable'), { code: 14 });
    const writes = [];
    await fn({
      get: async ref => ({ exists: records.has(ref.id) }),
      create: (ref, data) => {
        assert.equal(ref.name, 'fynxWalletWaitlist');
        writes.push([ref.id, data]);
      },
    });
    for (const [id, data] of writes) records.set(id, data);
  },
};
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const context = {
  exports: {},
  require: name => ({
    'firebase-functions/v2/https': { onCall: (config, fn) => { options = config; handler = fn; return fn; }, HttpsError },
    'firebase-functions/logger': { error() {} },
    'firebase-admin/app': { initializeApp() {} },
    'firebase-admin/firestore': { getFirestore: () => db, FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' }, Timestamp: { fromMillis: value => value } },
  }[name] || require(name)),
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../firebase-waitlist/functions/index.js'), 'utf8'), context);
const app = { appId: '1:1011050657868:web:2b8f02ebdebf8b3bb05ce9' };
const valid = { email: 'User@Example.com', consent: true, noticeVersion: 'prelaunch-v2' };
(async () => {
  assert.equal(options.enforceAppCheck, true);
  assert.equal(options.cors[0], 'https://ea-la.github.io');
  for (const invalidApp of [undefined, { appId: 'another-app' }]) {
    await assert.rejects(handler({ data: valid, app: invalidApp }), { code: 'unauthenticated' });
  }
  for (const data of [null, [], {}, { ...valid, email: 'bad' }, { ...valid, email: 'x@@example.com' }, { ...valid, email: 'a'.repeat(255) + '@example.com' }, { ...valid, consent: false }, { ...valid, consent: 'true' }, { ...valid, consent: undefined }, { ...valid, noticeVersion: 'prelaunch-v1' }, { ...valid, website: 'spam' }]) {
    await assert.rejects(handler({ data, app }), { code: 'invalid-argument' });
  }
  assert.equal(records.size, 0);
  const started = Date.now();
  assert.equal((await handler({ data: valid, app })).ok, true);
  assert.equal(records.size, 1);
  const id = createHash('sha256').update('user@example.com').digest('hex');
  const original = records.get(id);
  assert.equal(original.email, 'user@example.com');
  assert.equal(original.consent, true);
  assert.equal(original.noticeVersion, 'prelaunch-v2');
  assert.equal(original.createdAt, 'SERVER_TIMESTAMP');
  assert.equal(original.status, 'waiting');
  assert.equal(original.source, 'fynx-wallet-public');
  assert.ok(original.expiresAt >= started + 365 * 86400000);
  assert.equal((await handler({ data: { ...valid, email: ' user@example.com ' }, app })).ok, true);
  assert.equal(records.size, 1);
  assert.equal(records.get(id), original);
  failPersistence = true;
  await assert.rejects(handler({ data: { ...valid, email: 'failure@example.com' }, app }), { code: 'unavailable' });
  assert.equal(records.size, 1);
  console.log('PASS: validation, consent, app identity, duplicate preservation, record fields, retention, and persistence failure. These unit checks do not replace live verification.');
})().catch(error => { console.error(error); process.exit(1); });
