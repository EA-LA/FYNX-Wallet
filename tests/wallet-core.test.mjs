import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { appGuard, ownerGuard, createWalletChallenge, verifyWalletChallenge, consumeChallenge } from '../firebase-wallet/functions/core.js';
import { OWNER_UID, APP_ID, ORIGIN } from '../firebase-wallet/functions/config.js';

const wallet = Wallet.createRandom();
const validRequest = { data: { action: 'session' }, app: { appId: APP_ID }, rawRequest: { headers: { origin: ORIGIN, authorization: 'Bearer test-token' } } };
test('App Check app identity, exact origin, and payload limits are mandatory', () => {
  assert.doesNotThrow(() => appGuard(validRequest));
  for (const req of [{ ...validRequest, app: null }, { ...validRequest, app: { appId: 'other-app' } }, { ...validRequest, rawRequest: { headers: { origin: 'https://attacker.example' } } }, { ...validRequest, data: [] }, { ...validRequest, data: { value: 'x'.repeat(20001) } }]) assert.throws(() => appGuard(req));
});
test('Owner checks a revoked-aware Firebase token, UID, verified email and fresh login', async () => {
  let checkedRevocation;
  const auth = { verifyIdToken: async (token, revoked) => { assert.equal(token, 'test-token'); checkedRevocation = revoked; return { uid: OWNER_UID, email_verified: true, auth_time: Date.now() / 1000 }; } };
  await ownerGuard(validRequest, auth, { fresh: true }); assert.equal(checkedRevocation, true);
  for (const token of [{ uid: 'someone-else', email_verified: true }, { uid: OWNER_UID, email_verified: false }]) await assert.rejects(ownerGuard(validRequest, { verifyIdToken: async () => token }), { code: 'permission-denied' });
  // The former automatically selected operator account must lose workspace access.
  await assert.rejects(ownerGuard(validRequest, { verifyIdToken: async () => ({ uid: 'nnT2ymHgi5bNcFHTFl49hXL7rdT2', email_verified: true }) }), { code: 'permission-denied' });
  await assert.rejects(ownerGuard(validRequest, { verifyIdToken: async () => { throw new Error('revoked'); } }), { code: 'unauthenticated' });
  await assert.rejects(ownerGuard(validRequest, { verifyIdToken: async () => ({ uid: OWNER_UID, email_verified: true, auth_time: 1 }) }, { fresh: true }), { code: 'unauthenticated' });
});
test('Real ECDSA wallet signature verifies only the exact server challenge and account', async () => {
  const challenge = createWalletChallenge(OWNER_UID, { address: wallet.address, chainId: 11155111 });
  const signature = await wallet.signMessage(challenge.message);
  assert.deepEqual(verifyWalletChallenge(challenge, OWNER_UID, signature), { address: wallet.address, chainId: 11155111 });
  assert.ok(challenge.message.includes(`URI: ${ORIGIN}/FYNX-Wallet/owner.html`));
  assert.throws(() => verifyWalletChallenge(challenge, 'other-user', signature));
  assert.throws(() => verifyWalletChallenge(challenge, OWNER_UID, signature, challenge.expiresAt));
  assert.throws(() => verifyWalletChallenge({ ...challenge, message: challenge.message.replace('ea-la.github.io', 'evil.example') }, OWNER_UID, signature));
  assert.throws(() => verifyWalletChallenge(challenge, OWNER_UID, '0x1234'));
  assert.throws(() => createWalletChallenge(OWNER_UID, { address: wallet.address, chainId: 1 }));
  const wrongSignature = await Wallet.createRandom().signMessage(challenge.message);
  assert.throws(() => verifyWalletChallenge(challenge, OWNER_UID, wrongSignature));
});
test('Challenge use is atomic: parallel replay has one winner; another user cannot consume it', async () => {
  const data = createWalletChallenge(OWNER_UID, { address: wallet.address, chainId: 11155111 });
  let exists = true, chain = Promise.resolve();
  const db = { collection: () => ({ doc: () => ({}) }), runTransaction: fn => {
    const task = chain.then(() => fn({ get: async () => ({ exists, data: () => ({ ...data, expiresAt: { toMillis: () => data.expiresAt } }) }), delete: () => { exists = false; } })); chain = task.catch(() => {}); return task;
  } };
  await assert.rejects(consumeChallenge(db, data.id, 'wallet', 'other-user'));
  assert.equal(exists, true);
  const results = await Promise.allSettled([consumeChallenge(db, data.id, 'wallet', OWNER_UID), consumeChallenge(db, data.id, 'wallet', OWNER_UID)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
});
