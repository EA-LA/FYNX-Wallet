import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { HttpsError } from '../firebase-wallet/functions/node_modules/firebase-functions/lib/esm/v2/providers/https.mjs';
import { appGuard, ownerGuard, fail } from '../firebase-wallet/functions/core.js';
import { APP_ID, ORIGIN, OWNER_UID } from '../firebase-wallet/functions/config.js';

const html = readFileSync(new URL('../firebase-wallet/functions/dashboard.html', import.meta.url), 'utf8');
const ownerHTML = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
test('The protected document permits only its exact script and no network or form submissions', () => {
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const digest = createHash('sha256').update(script).digest('base64');
  assert.ok(html.includes(`script-src 'sha256-${digest}'`));
  assert.ok(ownerHTML.includes(`'sha256-${digest}'`));
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("form-action 'none'"));
  assert.equal(/<script[^>]+src=/.test(html), false);
  assert.equal(script.includes('localStorage'), false);
  for (const path of ['wallet-assets/app.js', 'wallet-assets/styles.css']) {
    const bytes = readFileSync(new URL(`../${path}`, import.meta.url));
    const version = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    assert.ok(ownerHTML.includes(`${path}?v=${version}`), 'The page must load the exact current asset, even with an older browser cache');
  }
});

test('Actual dashboard and waitlist dispatch reject guests/nonowners; deletion also requires recent login', async () => {
  let calls = 0;
  const auth = { verifyIdToken: async (token, revoked) => {
    assert.equal(revoked, true); calls++;
    return { uid: ['owner-token', 'stale-owner-token'].includes(token) ? OWNER_UID : 'other-user', email_verified: true, auth_time: token === 'stale-owner-token' ? 1 : Date.now() / 1000 };
  } };
  let handler;
  const context = vm.createContext({
    initializeApp() {}, SERVICE_ACCOUNT: 'test', ORIGIN, HttpsError, appGuard, ownerGuard, fail,
    getAuth: () => auth, getFirestore: () => ({ collection: () => ({ doc: () => ({}) }) }),
    rateLimit: async () => {}, onCall: (options, fn) => { assert.equal(options.enforceAppCheck, true); handler = fn; },
    readFileSync: () => html, logger: { error() {} }, URL,
    listWaitlist: async () => ({ total: 0, records: [], nextCursor: null }),
    removeWaitlistRegistration: async () => ({ ok: true, removed: false }),
  });
  const source = readFileSync(new URL('../firebase-wallet/functions/index.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export const ', 'const ')
    .replace("new URL('./dashboard.html', import.meta.url)", "'dashboard.html'");
  vm.runInContext(source, context);
  const request = (token, action = 'dashboard') => ({ app: { appId: APP_ID }, data: { action }, rawRequest: { headers: { origin: ORIGIN, ...(token ? { authorization: `Bearer ${token}` } : {}) } } });
  for (const action of ['dashboard', 'waitlist', 'waitlist-remove']) {
    await assert.rejects(handler(request(undefined, action)), { code: 'unauthenticated' });
    await assert.rejects(handler(request('other-token', action)), { code: 'permission-denied' });
  }
  assert.equal((await handler(request('owner-token'))).html, html);
  assert.equal((await handler(request('owner-token', 'waitlist'))).total, 0);
  await assert.rejects(handler(request('stale-owner-token', 'waitlist-remove')), { code: 'unauthenticated' });
  assert.equal((await handler(request('owner-token', 'waitlist-remove'))).removed, false);
  assert.equal(calls, 7);
});
