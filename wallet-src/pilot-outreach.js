// Pilot invitations: pure helpers for the owner workspace Waitlist tab and its tests.
// After the owner picks who to invite (pilot-invites.js) and sends the emails from the team inbox,
// this keeps track of who was invited, who needs a follow-up and who accepted or declined.
// Kept in this browser only. No email address is stored: each person is a fingerprint of their
// inbox plus a masked hint ("a•••@gmail.com"), so the list means something only next to the
// loaded waitlist. Nothing is sent and the waitlist is not changed.
import { inboxKey } from './waitlist-care.js';

export const OUTREACH_KEY = 'fynx-owner-pilot-outreach-v1';
export const FOLLOW_UP_DAYS = 7;   // no answer this long after the invitation: send one reminder
export const CLOSE_DAYS = 7;       // no answer this long after the reminder: mark "No reply" and invite the next person
export const MAX_ENTRIES = 5000;

export const STATES = [
  ['invited', 'Invited'], ['followed', 'Reminder sent'], ['accepted', 'Accepted'],
  ['declined', 'Declined'], ['noreply', 'No reply'],
];
export const stateLabel = id => (STATES.find(s => s[0] === id) || [id, id])[1];
const KNOWN = new Set(STATES.map(s => s[0]));
const ANSWERS = new Set(['accepted', 'declined', 'noreply']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = d => typeof d === 'string' && DATE_RE.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
export function addDays(date, days) { return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }

// 64-bit fingerprint of the inbox (two FNV-1a passes with different seeds), 16 hex characters.
// The same person signed up as a.n.n.a+x@gmail.com and anna@gmail.com gets the same fingerprint.
export function fingerprint(email) {
  const key = inboxKey(String(email || '').trim().toLowerCase());
  if (!key || !key.includes('@')) return '';
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (const ch of `fynx-pilot|${key}`) {
    const c = ch.codePointAt(0);
    a ^= c; a = Math.imul(a, 0x01000193) >>> 0;
    b ^= c; b = Math.imul(b, 0x01000193) >>> 0; b ^= b >>> 13;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

// "anna@gmail.com" → "a•••@gmail.com": enough to recognise next to the list, not an address.
export function maskEmail(email) {
  const [local = '', domain = ''] = String(email || '').trim().toLowerCase().split('@');
  if (!local || !domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return '';
  return `${local[0].replace(/[^a-z0-9]/, '•')}•••@${domain}`;
}
const HINT_RE = /^[a-z0-9•]•••@[a-z0-9.-]+\.[a-z]{2,}$/;

// Keeps only well-formed entries: known state, real dates in order, masked hint, fingerprint key.
export function cleanOutreach(value) {
  const entries = {};
  const src = value && typeof value === 'object' && value.entries && typeof value.entries === 'object' ? value.entries : {};
  for (const [fp, e] of Object.entries(src)) {
    if (Object.keys(entries).length >= MAX_ENTRIES) break;
    if (!/^[0-9a-f]{16}$/.test(fp) || !e || typeof e !== 'object' || !KNOWN.has(e.state) || !validDate(e.invitedOn)) continue;
    const out = { hint: typeof e.hint === 'string' && HINT_RE.test(e.hint) ? e.hint : '', state: e.state, invitedOn: e.invitedOn };
    if (e.state === 'followed' || (ANSWERS.has(e.state) && validDate(e.followedOn))) {
      if (!validDate(e.followedOn) || e.followedOn < e.invitedOn) continue;
      out.followedOn = e.followedOn;
    }
    if (ANSWERS.has(e.state)) {
      if (!validDate(e.answeredOn) || e.answeredOn < (out.followedOn || out.invitedOn)) continue;
      out.answeredOn = e.answeredOn;
    }
    entries[fp] = out;
  }
  return { entries };
}

export const entryFor = (log, email) => log.entries[fingerprint(email)] || null;

function withEntry(log, email, fn) {
  const fp = fingerprint(email);
  if (!fp) return { log, error: 'That is not an email address.' };
  const before = log.entries[fp] || null, r = fn(before);
  if (r.error) return { log, error: r.error };
  const entries = { ...log.entries };
  if (r.entry) entries[fp] = r.entry; else delete entries[fp];
  return { log: { entries }, entry: r.entry || null };
}

export function markInvited(log, email, today) {
  if (!validDate(today)) return { log, error: 'Pick the day the invitation was sent.' };
  return withEntry(log, email, before => {
    if (before) return { error: `Already marked: ${stateLabel(before.state)} (invited ${before.invitedOn}).` };
    if (Object.keys(log.entries).length >= MAX_ENTRIES) return { error: `At most ${MAX_ENTRIES} invitations can be tracked here.` };
    return { entry: { hint: maskEmail(email), state: 'invited', invitedOn: today } };
  });
}

export function markFollowedUp(log, email, today) {
  return withEntry(log, email, before => {
    if (!before || before.state !== 'invited') return { error: 'Only an invitation still waiting for an answer can get a reminder.' };
    if (!validDate(today) || today < before.invitedOn) return { error: 'The reminder date cannot be before the invitation.' };
    return { entry: { ...before, state: 'followed', followedOn: today } };
  });
}

export function markAnswer(log, email, answer, today) {
  return withEntry(log, email, before => {
    if (!ANSWERS.has(answer)) return { error: 'Unknown answer.' };
    if (!before) return { error: 'Mark the invitation as sent first.' };
    if (ANSWERS.has(before.state)) return { error: `Already answered: ${stateLabel(before.state)} on ${before.answeredOn}.` };
    if (!validDate(today) || today < (before.followedOn || before.invitedOn)) return { error: 'The answer date cannot be before the invitation.' };
    return { entry: { ...before, state: answer, answeredOn: today } };
  });
}

// Undo the last change: an answer goes back to waiting, a reminder back to invited, an invitation is forgotten.
export function undoLast(log, email) {
  return withEntry(log, email, before => {
    if (!before) return { error: 'Nothing to undo.' };
    if (ANSWERS.has(before.state)) { const { answeredOn, ...rest } = before; return { entry: { ...rest, state: rest.followedOn ? 'followed' : 'invited' } }; }
    if (before.state === 'followed') { const { followedOn, ...rest } = before; return { entry: { ...rest, state: 'invited' } }; }
    return { entry: null };
  });
}

// Where one invitation stands today: what to do next and when.
export function inviteState(entry, today) {
  if (!entry) return { state: 'none', label: 'Not invited yet', due: false };
  const label = stateLabel(entry.state);
  if (entry.state === 'invited') {
    const dueOn = addDays(entry.invitedOn, FOLLOW_UP_DAYS);
    return { state: 'invited', label, dueOn, due: today >= dueOn, action: today >= dueOn ? `No answer for ${daysBetween(entry.invitedOn, today)} days: send one reminder` : `Reminder due ${dueOn} if no answer` };
  }
  if (entry.state === 'followed') {
    const dueOn = addDays(entry.followedOn, CLOSE_DAYS);
    return { state: 'followed', label, dueOn, due: today >= dueOn, action: today >= dueOn ? 'No answer after the reminder: mark No reply and invite the next person' : `Mark No reply on ${dueOn} if still no answer` };
  }
  return { state: entry.state, label, due: false, action: `${label} on ${entry.answeredOn}` };
}

// Totals for the panel and the Launch readiness next steps.
export function outreachSummary(log, { size = 0, today }) {
  const s = { invited: 0, waiting: 0, accepted: 0, declined: 0, noreply: 0, reminders: 0, close: 0, size: Number(size) || 0 };
  let oldestDue = '';
  for (const e of Object.values(log.entries)) {
    s.invited++;
    if (ANSWERS.has(e.state)) { s[e.state]++; continue; }
    s.waiting++;
    const st = inviteState(e, today);
    if (st.due) { if (e.state === 'invited') s.reminders++; else s.close++; if (!oldestDue || st.dueOn < oldestDue) oldestDue = st.dueOn; }
  }
  s.due = s.reminders + s.close; s.oldestDue = oldestDue;
  s.seatsLeft = Math.max(0, s.size - s.accepted);
  // Invite more only for seats nobody is already holding an invitation for.
  s.inviteMore = Math.max(0, s.size - s.accepted - s.waiting);
  s.acceptRate = s.accepted + s.declined + s.noreply ? Math.round((100 * s.accepted) / (s.accepted + s.declined + s.noreply)) : null;
  return s;
}

// The next people to invite, in list order (invite group, then reserve), skipping anyone already tracked.
export function nextToInvite(result, log, count) {
  if (!result || !(count > 0)) return [];
  const out = [];
  for (const r of [...(result.invited || []), ...(result.reserve || [])]) {
    if (out.length >= count) break;
    if (!log.entries[fingerprint(r.email)]) out.push(r);
  }
  return out;
}

// How many tracked invitations are for people not in the loaded rows (removed, or not loaded yet).
export function trackedElsewhere(log, records) {
  const here = new Set();
  for (const r of records) { const fp = fingerprint(r.email); if (fp) here.add(fp); }
  return Object.keys(log.entries).filter(fp => !here.has(fp)).length;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function outreachHeadline(s) {
  if (!s.invited) return 'No invitations marked as sent yet.';
  const parts = [`${s.accepted} of ${s.size || '?'} places filled`, `${plural(s.waiting, 'invitation')} waiting for an answer`];
  if (s.due) parts.push(`${s.due} need${s.due === 1 ? 's' : ''} you today`);
  return parts.join(' · ');
}

// Launch readiness / Today line, or null when nothing is due.
export function outreachAttention(log, { size = 0, today }) {
  const s = outreachSummary(log, { size, today });
  if (!s.due) return null;
  const bits = [];
  if (s.reminders) bits.push(`${plural(s.reminders, 'invitation')} with no answer after ${FOLLOW_UP_DAYS} days: send a reminder`);
  if (s.close) bits.push(`${plural(s.close, 'reminder')} with no answer after ${CLOSE_DAYS} more days: mark No reply`);
  return { count: s.due, oldestDue: s.oldestDue, text: bits.join('; ') };
}

// Counts only, no addresses or hints: safe to paste into a message or the decision notes.
export function outreachReport(log, { size = 0, today }) {
  const s = outreachSummary(log, { size, today });
  const lines = [`FYNX Wallet pilot invitations (${today})`];
  lines.push(`Places: ${s.size || 'not decided'} · Accepted: ${s.accepted} · Waiting for an answer: ${s.waiting} · Declined: ${s.declined} · No reply: ${s.noreply}`);
  lines.push(`Invitations sent: ${s.invited}${s.acceptRate === null ? '' : ` · ${s.acceptRate}% of answered invitations accepted`}`);
  if (s.reminders) lines.push(`Reminders due: ${s.reminders}`);
  if (s.close) lines.push(`To close as No reply: ${s.close}`);
  lines.push(s.size ? (s.inviteMore ? `Invite ${s.inviteMore} more from the reserve to fill the open places` : s.seatsLeft ? 'Every open place has an invitation out: wait for answers' : 'Every place is filled') : 'Decide the pilot size to see how many more to invite');
  return lines.join('\n');
}
