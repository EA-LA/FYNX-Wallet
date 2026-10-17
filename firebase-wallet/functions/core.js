import { createHash, randomBytes } from 'node:crypto';
import { getAddress, verifyMessage } from 'ethers';
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { OWNER_UID, APP_ID, ORIGIN, WALLET_URI, CHAIN_ID } from './config.js';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const fail = (code, message) => { throw new HttpsError(code, message); };
export function appGuard(request) {
  if (request.app?.appId !== APP_ID) fail('unauthenticated', 'App verification is required.');
  if (request.rawRequest?.headers?.origin !== ORIGIN) fail('permission-denied', 'This origin is not allowed.');
  if (!request.data || typeof request.data !== 'object' || Array.isArray(request.data) || JSON.stringify(request.data).length > 20000) fail('invalid-argument', 'Invalid request.');
}
export async function ownerGuard(request, auth, { fresh = false } = {}) {
  const bearer = request.rawRequest?.headers?.authorization;
  if (!/^Bearer \S+$/.test(bearer || '')) fail('unauthenticated', 'Please sign in.');
  let token;
  try { token = await auth.verifyIdToken(bearer.slice(7), true); }
  catch { fail('unauthenticated', 'Please sign in again.'); }
  if (token.uid !== OWNER_UID || token.email_verified !== true) fail('permission-denied', 'This workspace is limited to its verified owner. Public access remains on the waitlist.');
  if (fresh && (!Number.isFinite(token.auth_time) || Date.now() / 1000 - token.auth_time > 300)) fail('unauthenticated', 'Sign out and sign in again before changing security settings.');
  return token;
}
export function address(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) fail('invalid-argument', 'Enter a valid Ethereum address.');
  try { const result = getAddress(value); if (/^0x0{40}$/i.test(result)) throw new Error(); return result; }
  catch { fail('invalid-argument', 'Enter a valid Ethereum address with a valid checksum.'); }
}
export function createWalletChallenge(uid, input, now = Date.now()) {
  if (input.chainId !== CHAIN_ID) fail('failed-precondition', 'Only the Sepolia test network is enabled.');
  const wallet = address(input.address);
  const id = randomBytes(24).toString('hex');
  const issuedAt = new Date(now).toISOString();
  const expiresAt = now + 5 * 60000;
  const message = `${new URL(ORIGIN).host} wants you to sign in with your Ethereum account:\n${wallet}\n\nLink this wallet to your FYNX owner account. This does not authorize a transfer.\n\nURI: ${WALLET_URI}\nVersion: 1\nChain ID: ${CHAIN_ID}\nNonce: ${id}\nIssued At: ${issuedAt}\nExpiration Time: ${new Date(expiresAt).toISOString()}\nRequest ID: ${hash(uid).slice(0, 24)}`;
  return { id, uid, kind: 'wallet', address: wallet, chainId: CHAIN_ID, message, expiresAt };
}
export function verifyWalletChallenge(challenge, uid, signature, now = Date.now()) {
  if (challenge.kind !== 'wallet' || challenge.uid !== uid || challenge.expiresAt <= now || challenge.expiresAt > now + 5 * 60000) fail('failed-precondition', 'The signing request has expired. Connect again.');
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) fail('invalid-argument', 'Invalid wallet signature.');
  let signer;
  try { signer = verifyMessage(challenge.message, signature); }
  catch { fail('permission-denied', 'Wallet signature could not be verified.'); }
  if (signer !== challenge.address) fail('permission-denied', 'Wallet signature could not be verified.');
  return { address: signer, chainId: CHAIN_ID };
}
export async function saveChallenge(db, data) {
  await db.collection('fynxWalletChallenges').doc(data.id).create({ ...data, expiresAt: Timestamp.fromMillis(data.expiresAt) });
}
export async function consumeChallenge(db, id, kind, uid) {
  if (typeof id !== 'string' || !/^[0-9a-f]{48}$/.test(id)) fail('invalid-argument', 'Invalid challenge.');
  const ref = db.collection('fynxWalletChallenges').doc(id);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail('failed-precondition', 'The request has expired or was already used.');
    const data = snap.data();
    if (data.kind !== kind || (uid && data.uid !== uid) || data.expiresAt.toMillis() <= Date.now()) fail('failed-precondition', 'The request has expired or is invalid.');
    tx.delete(ref); // Consumed atomically even when signature verification later fails.
    return { ...data, expiresAt: data.expiresAt.toMillis() };
  });
}
export async function rateLimit(db, identity, maximum = 120) {
  const window = Math.floor(Date.now() / (15 * 60000));
  const ref = db.collection('fynxWalletRateLimits').doc(hash(`${identity}:${window}`));
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    const count = current.exists ? current.data().count : 0;
    if (count >= maximum) fail('resource-exhausted', 'Too many requests. Please try again in 15 minutes.');
    tx.set(ref, { count: count + 1, expiresAt: Timestamp.fromMillis(Date.now() + 86400000) });
  });
}
export async function audit(db, uid, action) {
  await db.collection('fynxWalletAudit').add({ actor: hash(uid), action, createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 90 * 86400000) });
}
