import { randomBytes } from 'node:crypto';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { FieldValue } from 'firebase-admin/firestore';
import { OWNER_UID, RP_ID, ORIGIN } from './config.js';
import { hash, fail, saveChallenge, consumeChallenge, audit } from './core.js';

const credentialRef = (db, id) => db.collection('fynxWalletPasskeys').doc(hash(id));
async function optionsChallenge(db, options, kind, uid = null) {
  const id = randomBytes(24).toString('hex');
  await saveChallenge(db, { id, kind, uid, challenge: options.challenge, expiresAt: Date.now() + 120000 });
  return { id, options };
}
export async function registrationOptions(db, user) {
  const existing = await db.collection('fynxWalletPasskeys').where('uid', '==', user.uid).get();
  if (existing.size >= 5) fail('resource-exhausted', 'Remove a passkey before adding another.');
  const options = await generateRegistrationOptions({
    rpName: 'FYNX Wallet', rpID: RP_ID,
    userID: new Uint8Array(Buffer.from(hash(user.uid), 'hex')),
    userName: user.email, userDisplayName: 'FYNX Wallet owner',
    attestationType: 'none',
    excludeCredentials: existing.docs.map(d => ({ id: d.data().id })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    supportedAlgorithmIDs: [-7, -257], timeout: 120000,
  });
  return optionsChallenge(db, options, 'passkey-register', user.uid);
}
export async function registerPasskey(db, user, input) {
  const challenge = await consumeChallenge(db, input.id, 'passkey-register', user.uid);
  let result;
  try { result = await verifyRegistrationResponse({ response: input.response, expectedChallenge: challenge.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true }); }
  catch { fail('permission-denied', 'Passkey verification failed. Please try again.'); }
  if (!result.verified || !result.registrationInfo) fail('permission-denied', 'Passkey verification failed.');
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  await credentialRef(db, credential.id).create({
    uid: user.uid, id: credential.id, publicKey: Buffer.from(credential.publicKey).toString('base64'),
    counter: credential.counter, deviceType: credentialDeviceType, backedUp: credentialBackedUp,
    createdAt: FieldValue.serverTimestamp(),
  });
  await audit(db, user.uid, 'passkey.registered');
  return { ok: true };
}
export async function authenticationOptions(db) {
  const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'required', timeout: 120000 });
  return optionsChallenge(db, options, 'passkey-login');
}
export async function authenticatePasskey(db, auth, input) {
  const challenge = await consumeChallenge(db, input.id, 'passkey-login');
  if (typeof input.response?.id !== 'string' || input.response.id.length > 2048) fail('invalid-argument', 'Invalid passkey.');
  const ref = credentialRef(db, input.response.id);
  const saved = await ref.get();
  if (!saved.exists || saved.data().uid !== OWNER_UID) fail('permission-denied', 'This passkey cannot open this workspace.');
  const key = saved.data();
  const user = await auth.getUser(key.uid);
  if (user.disabled || !user.emailVerified) fail('permission-denied', 'This account is unavailable.');
  let result;
  try { result = await verifyAuthenticationResponse({ response: input.response, expectedChallenge: challenge.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true, credential: { id: key.id, publicKey: new Uint8Array(Buffer.from(key.publicKey, 'base64')), counter: key.counter } }); }
  catch { fail('permission-denied', 'Passkey verification failed.'); }
  if (!result.verified) fail('permission-denied', 'Passkey verification failed.');
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (!current.exists || current.data().counter !== key.counter) fail('permission-denied', 'Passkey changed. Please try again.');
    tx.update(ref, { counter: result.authenticationInfo.newCounter, lastUsedAt: FieldValue.serverTimestamp() });
  });
  const token = await auth.createCustomToken(key.uid, { fynxWalletPasskey: true });
  await audit(db, key.uid, 'passkey.authenticated');
  return { token };
}
