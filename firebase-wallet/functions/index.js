import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { SERVICE_ACCOUNT, ORIGIN } from './config.js';
import { appGuard, ownerGuard, fail, rateLimit, createWalletChallenge, verifyWalletChallenge, saveChallenge, consumeChallenge, audit } from './core.js';
import { registrationOptions, registerPasskey, authenticationOptions, authenticatePasskey } from './passkeys.js';
import { readFileSync } from 'node:fs';
const dashboardHTML = readFileSync(new URL('./dashboard.html', import.meta.url), 'utf8');
initializeApp({ serviceAccountId: SERVICE_ACCOUNT });

export const fynxWalletWorkspace = onCall({
  region: 'us-central1', serviceAccount: SERVICE_ACCOUNT,
  enforceAppCheck: true, cors: [ORIGIN], maxInstances: 3,
  timeoutSeconds: 30, memory: '256MiB',
}, async request => {
  appGuard(request);
  const db = getFirestore();
  const auth = getAuth();
  const input = request.data;
  try {
    // No email, IP, credential, signature, ID token, or request body is logged.
    if (['passkey-login-options', 'passkey-login'].includes(input.action)) {
      await rateLimit(db, `login:${request.rawRequest.ip || 'unknown'}`, 30);
      return input.action === 'passkey-login-options' ? await authenticationOptions(db) : await authenticatePasskey(db, auth, input);
    }
    const fresh = ['passkey-register-options', 'passkey-register', 'passkey-remove', 'waitlist-remove'].includes(input.action);
    const user = await ownerGuard(request, auth, { fresh });
    await rateLimit(db, user.uid);
    const profile = db.collection('fynxWalletProfiles').doc(user.uid);
    switch (input.action) {
      case 'dashboard': return { html: dashboardHTML };
      case 'session': {
        const wallet = await profile.get();
        const keys = await db.collection('fynxWalletPasskeys').where('uid', '==', user.uid).get();
        return { ok: true, role: 'owner', wallet: wallet.exists ? wallet.data().wallet || null : null, passkeys: keys.docs.map(d => ({ id: d.id, createdAt: d.data().createdAt?.toDate().toISOString() || null })) };
      }
      case 'wallet-challenge': {
        const challenge = createWalletChallenge(user.uid, input);
        await saveChallenge(db, challenge);
        return { id: challenge.id, message: challenge.message, address: challenge.address, chainId: challenge.chainId, expiresAt: challenge.expiresAt };
      }
      case 'wallet-verify': {
        const challenge = await consumeChallenge(db, input.id, 'wallet', user.uid);
        const wallet = verifyWalletChallenge(challenge, user.uid, input.signature);
        await profile.set({ wallet, verifiedAt: FieldValue.serverTimestamp() }, { merge: true });
        await audit(db, user.uid, 'wallet.verified');
        return { ok: true, wallet };
      }
      case 'wallet-unlink':
        await profile.set({ wallet: FieldValue.delete(), verifiedAt: FieldValue.delete() }, { merge: true });
        await audit(db, user.uid, 'wallet.unlinked');
        return { ok: true };
      case 'passkey-register-options': return await registrationOptions(db, user);
      case 'passkey-register': return await registerPasskey(db, user, input);
      case 'passkey-remove': {
        if (typeof input.id !== 'string' || !/^[a-f0-9]{64}$/.test(input.id)) fail('invalid-argument', 'Invalid passkey.');
        const ref = db.collection('fynxWalletPasskeys').doc(input.id);
        const snap = await ref.get();
        if (!snap.exists || snap.data().uid !== user.uid) fail('permission-denied', 'Passkey not found.');
        await ref.delete();
        await audit(db, user.uid, 'passkey.removed');
        return { ok: true };
      }
      case 'waitlist': {
        const [rows, total] = await Promise.all([db.collection('fynxWalletWaitlist').orderBy('createdAt', 'desc').limit(50).get(), db.collection('fynxWalletWaitlist').count().get()]);
        return { total: total.data().count, records: rows.docs.map(d => ({ id: d.id, email: d.data().email, createdAt: d.data().createdAt?.toDate().toISOString() || null, status: d.data().status, noticeVersion: d.data().noticeVersion })) };
      }
      case 'waitlist-remove': {
        if (typeof input.id !== 'string' || !/^[a-f0-9]{64}$/.test(input.id)) fail('invalid-argument', 'Invalid registration.');
        await db.collection('fynxWalletWaitlist').doc(input.id).delete();
        await audit(db, user.uid, 'waitlist.removed');
        return { ok: true };
      }
      default: fail('invalid-argument', 'Unknown operation.');
    }
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error('Wallet workspace operation failed', { code: String(error.code || 'unknown').slice(0, 80) });
    throw new HttpsError('unavailable', 'The operation could not be confirmed. Please try again.');
  }
});
