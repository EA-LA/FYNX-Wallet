'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createHash } = require('node:crypto');
initializeApp();
exports.joinFynxWalletWaitlist = onCall({
  region: 'us-central1',
  enforceAppCheck: true,
  maxInstances: 5,
}, async (request) => {
  const input = request.data || {};
  if (typeof input.website === 'string' && input.website.trim()) throw new HttpsError('invalid-argument', 'Invalid submission.');
  if (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    throw new HttpsError('invalid-argument', 'A valid email is required.');
  }
  if (input.consent !== true || input.noticeVersion !== 'prelaunch-v1') {
    throw new HttpsError('invalid-argument', 'Current consent is required.');
  }
  const email = input.email.trim().toLowerCase();
  const id = createHash('sha256').update(email).digest('hex');
  const ref = getFirestore().collection('fynxWalletWaitlist').doc(id);
  // Stable IDs prevent duplicate rows; a repeat does not overwrite original consent or timestamps.
  await getFirestore().runTransaction(async tx => {
    const previous = await tx.get(ref);
    if (!previous.exists) tx.create(ref, {
      email,
      consent: true,
      noticeVersion: 'prelaunch-v1',
      createdAt: FieldValue.serverTimestamp(),
      source: 'fynx-wallet-public',
      status: 'waiting',
    });
  });
  // A uniform response avoids exposing whether another address is already registered.
  return { ok: true };
});
