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
});

test('The actual dashboard dispatch rejects guests/nonowners and returns HTML only after owner verification', async () => {
  let calls = 0;
  const auth = { verifyIdToken: async (token, revoked) => {
    assert.equal(revoked, true); calls++;
    return { uid: token === 'owner-token' ? OWNER_UID : 'other-user', email_verified: true };
  } };
  let handler;
  const context = vm.createContext({
    initializeApp() {}, SERVICE_ACCOUNT: 'test', ORIGIN, HttpsError, appGuard, ownerGuard, fail,
    getAuth: () => auth, getFirestore: () => ({ collection: () => ({ doc: () => ({}) }) }),
    rateLimit: async () => {}, onCall: (options, fn) => { assert.equal(options.enforceAppCheck, true); handler = fn; },
    readFileSync: () => html, logger: { error() {} }, URL,
  });
  const source = readFileSync(new URL('../firebase-wallet/functions/index.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export const ', 'const ')
    .replace("new URL('./dashboard.html', import.meta.url)", "'dashboard.html'");
  vm.runInContext(source, context);
  const request = token => ({ app: { appId: APP_ID }, data: { action: 'dashboard' }, rawRequest: { headers: { origin: ORIGIN, ...(token ? { authorization: `Bearer ${token}` } : {}) } } });
  await assert.rejects(handler(request()), { code: 'unauthenticated' });
  await assert.rejects(handler(request('other-token')), { code: 'permission-denied' });
  assert.equal((await handler(request('owner-token'))).html, html);
  assert.equal(calls, 2);
});
