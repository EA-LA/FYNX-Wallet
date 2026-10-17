import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { fail, hash } from './core.js';

const validId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const serialize = doc => {
  const data = doc.data();
  return { id: doc.id, email: data.email, createdAt: data.createdAt?.toDate().toISOString() || null,
    status: data.status, noticeVersion: data.noticeVersion, consent: data.consent === true,
    source: data.source || null, expiresAt: data.expiresAt?.toDate().toISOString() || null };
};

// Called only after the workspace's App Check, origin, verified-owner and rate-limit guards.
export async function listWaitlist(db, input) {
  const collection = db.collection('fynxWalletWaitlist');
  if (input.email !== undefined && typeof input.email !== 'string') fail('invalid-argument', 'Enter a valid email address.');
  const email = (input.email || '').trim().toLowerCase();
  if (email) {
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || input.cursor) fail('invalid-argument', 'Enter a valid email address and start a new search.');
    const doc = await collection.doc(hash(email)).get();
    return { total: doc.exists ? 1 : 0, records: doc.exists ? [serialize(doc)] : [], nextCursor: null };
  }
  const size = input.pageSize ?? 50;
  if (!Number.isInteger(size) || size < 1 || size > 50) fail('invalid-argument', 'Invalid page size.');
  let query = collection.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (input.cursor !== undefined && input.cursor !== null) {
    const cursor = input.cursor;
    if (!cursor || typeof cursor !== 'object' || !validId(cursor.id) || !Number.isInteger(cursor.seconds) || cursor.seconds < 0 || cursor.seconds > 253402300799 || !Number.isInteger(cursor.nanoseconds) || cursor.nanoseconds < 0 || cursor.nanoseconds > 999999999) fail('invalid-argument', 'Invalid page. Reload registrations.');
    // Timestamp + ID is stable for equal timestamps and survives deletion of the last row.
    query = query.startAfter(new Timestamp(cursor.seconds, cursor.nanoseconds), cursor.id);
  }
  const [rows, total] = await Promise.all([query.limit(size + 1).get(), collection.count().get()]);
  const docs = rows.docs.slice(0, size), last = docs.at(-1), createdAt = last?.data().createdAt;
  const nextCursor = rows.docs.length > size ? { id: last.id, seconds: createdAt.seconds, nanoseconds: createdAt.nanoseconds } : null;
  return { total: total.data().count, records: docs.map(serialize), nextCursor };
}

export async function removeWaitlistRegistration(db, uid, input) {
  if (!validId(input.id)) fail('invalid-argument', 'Invalid registration.');
  const ref = db.collection('fynxWalletWaitlist').doc(input.id);
  const auditRef = db.collection('fynxWalletAudit').doc();
  const removed = await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists) return false;
    tx.delete(ref);
    tx.create(auditRef, { actor: hash(uid), action: 'waitlist.removed', createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 90 * 86400000) });
    return true;
  });
  return { ok: true, removed };
}
