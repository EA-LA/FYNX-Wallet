'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { createHash } = require('node:crypto');
const logger = require('firebase-functions/logger');
initializeApp();

const WALLET_APP_ID = '1:1011050657868:web:2b8f02ebdebf8b3bb05ce9';
const NOTICE_VERSION = 'prelaunch-v2';
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

exports.joinFynxWalletWaitlist = onCall({
  region: 'us-central1',
  enforceAppCheck: true,
  cors: ['https://ea-la.github.io'],
  maxInstances: 5,
  timeoutSeconds: 30,
}, async (request) => {
  if (request.app?.appId !== WALLET_APP_ID) {
    throw new HttpsError('unauthenticated', 'App verification is required.');
  }
  const input = request.data || {};
  if (typeof input.website === 'string' && input.website.trim()) {
    throw new HttpsError('invalid-argument', 'Invalid submission.');
  }
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'A valid email is required.');
  }
  if (input.consent !== true || input.noticeVersion !== NOTICE_VERSION) {
    throw new HttpsError('invalid-argument', 'Current consent is required.');
  }
  const db = getFirestore();
  const id = createHash('sha256').update(email).digest('hex');
  const ref = db.collection('fynxWalletWaitlist').doc(id);
  try {
    // A transaction and stable ID prevent concurrent duplicates. A repeat preserves
    // the original consent, timestamp, status, and retention deadline.
    await db.runTransaction(async tx => {
      const previous = await tx.get(ref);
      if (!previous.exists) tx.create(ref, {
        email,
        consent: true,
        noticeVersion: NOTICE_VERSION,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + RETENTION_MS),
        source: 'fynx-wallet-public',
        status: 'waiting',
      });
    });
  } catch (error) {
    // Do not log emails, request payloads, or App Check tokens.
    logger.error('Waitlist persistence failed', { code: String(error.code || 'unknown') });
    throw new HttpsError('unavailable', 'Registration could not be confirmed. Please retry.');
  }
  // Sent only after Firestore commits. The same response for duplicates prevents
  // callers from checking whether someone else's address has already joined.
  return { ok: true };
});
