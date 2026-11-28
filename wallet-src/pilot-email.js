// Pilot invitation emails: pure helpers for the owner workspace Waitlist tab and its tests.
// Builds the invitation and the one reminder the "Invitations sent" tracker asks for, filled in
// from the owner's own decisions (pilot size, states and limits; support reply time and hours;
// how customers get a wallet). Anything not decided yet becomes a [bracketed gap] that is listed,
// never a made-up value. Until the customer terms are approved (legal/terms) and the owner has
// given written approval to open the pilot (pilot/approve), the subject says DRAFT and the draft
// is marked not ready to send. Nothing is sent from here; the owner pastes it into the team inbox.
// No recipient address is ever part of the draft.
import { stepKey, stepState, looksSecret } from './launch-tracker.js';
import { supportContext } from './support-playbook.js';
import { CONTACT } from './waitlist-care.js';
import { FOLLOW_UP_DAYS, CLOSE_DAYS, addDays } from './pilot-outreach.js';

export const EMAIL_KEY = 'fynx-owner-pilot-email-v1';
export const KINDS = [['invite', 'Invitation'], ['reminder', 'Reminder (one only)']];
export const COMPANY = 'FYNX finance world inc.';
export const DEFAULT_SIGNOFF = 'The FYNX team';
// What has to be finished before an invitation may go out, from the launch checklist.
export const SEND_AFTER = [
  [stepKey('legal', 'terms'), 'Customer terms, privacy notice and risk disclosures are not approved yet (Legal, outside counsel).'],
  [stepKey('pilot', 'approve'), 'You have not given your written approval to open the pilot yet (Controlled public launch).'],
];
const MAX_URL = 200, MAX_SIGNOFF = 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = d => typeof d === 'string' && DATE_RE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const money = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? `US$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : ''; };
// "Texas, Florida, Ohio" → "Texas, Florida and Ohio" (or "… or Ohio"); anything else stays as typed.
export function joinStates(text, word = 'and') {
  const parts = clean(text).split(/\s*(?:,|;|\band\b|\bor\b|&)\s*/i).filter(Boolean);
  if (parts.length < 2) return clean(text);
  return `${parts.slice(0, -1).join(', ')} ${word} ${parts[parts.length - 1]}`;
}
const longDate = d => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// Only an https link to a page (no spaces, no secrets in it), and a short plain sign-off.
export function cleanTermsUrl(raw) {
  const v = clean(raw);
  if (!v) return { value: '' };
  if (v.length > MAX_URL) return { value: '', error: `Use a link of at most ${MAX_URL} characters.` };
  let url; try { url = new URL(v); } catch { return { value: '', error: 'That is not a full link. Paste it starting with https://' }; }
  if (url.protocol !== 'https:') return { value: '', error: 'Use a link that starts with https://' };
  if (url.username || url.password) return { value: '', error: 'Leave sign-in details out of the link.' };
  if (looksSecret(v) || /[?&](key|token|sig|signature|auth|code)=/i.test(url.search)) return { value: '', error: 'That link looks like it carries a key or token. Use the public page address.' };
  return { value: url.href };
}
export function cleanSignoff(raw) {
  const v = clean(raw).replace(/[<>]/g, '');
  if (!v) return { value: '' };
  if (v.length > MAX_SIGNOFF) return { value: '', error: `Keep the sign-off to ${MAX_SIGNOFF} characters.` };
  if (looksSecret(v) || /@/.test(v)) return { value: '', error: 'Use a name or role only, no email address or code.' };
  return { value: v };
}
export function cleanEmailSettings(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {}, url = cleanTermsUrl(src.termsUrl).value, sign = cleanSignoff(src.signoff).value;
  if (url) out.termsUrl = url;
  if (sign) out.signoff = sign;
  return out;
}

// Whether an invitation may go out yet: the checklist steps it waits for.
export function sendReadiness(plan, records = {}) {
  const blockers = [];
  for (const [key, text] of SEND_AFTER) {
    const [gateId, stepId] = key.split('/');
    const gate = plan?.items?.find(g => g.id === gateId), step = gate?.steps?.find(s => s.id === stepId);
    if (!gate || !step || stepState(gate, step, records) !== 'done') blockers.push({ key, text });
  }
  return { ready: blockers.length === 0, blockers };
}

// The facts the emails quote, from the decision worksheet. Missing ones are named, not guessed.
export function emailFacts(answers = {}) {
  const limits = answers['pilot/limits'] || {}, wallet = answers['wallet-recovery/decide'] || {}, ctx = supportContext(answers);
  const people = Number(limits.people) > 0 ? Math.floor(Number(limits.people)) : 0;
  return {
    people, states: clean(limits.states), perTx: money(limits.perTx), perMonth: money(limits.perMonth),
    reply: ctx.reply, hours: ctx.hours, wallet: wallet.model === 'connect' || wallet.model === 'create' ? wallet.model : '',
  };
}

function gapper() {
  const gaps = [];
  const gap = (text, key, label) => { if (!gaps.some(g => g.text === text)) gaps.push({ text, key, label }); return `[${text}]`; };
  return { gaps, gap };
}

// One email: { subject, body, text (subject + body, ready to paste), gaps, ready, blockers, replyBy }.
// sentOn is the day the owner sends it (the tracker's date box): the reply-by date follows the tracker's
// own timing (a reminder 7 days after the invitation, "No reply" 7 days after the reminder).
export function draftEmail(kind = 'invite', { answers = {}, plan = null, records = {}, settings = {}, sentOn = '' } = {}) {
  if (!KINDS.some(k => k[0] === kind)) throw new Error(`Unknown email kind: ${kind}`);
  const f = emailFacts(answers), s = cleanEmailSettings(settings), { gaps, gap } = gapper();
  const readiness = sendReadiness(plan, records);
  const day = validDate(sentOn) ? sentOn : '';
  const replyBy = day ? addDays(day, kind === 'invite' ? FOLLOW_UP_DAYS : CLOSE_DAYS) : '';
  const limitsKey = 'pilot/limits', supportKey = 'pilot/support';
  const size = f.people ? `${f.people.toLocaleString('en-US')} people` : gap('number of people', limitsKey, 'Pilot size and limits');
  const states = f.states ? joinStates(f.states) : gap('pilot states', limitsKey, 'Pilot size and limits');
  const statesOr = f.states ? joinStates(f.states, 'or') : states;
  const by = replyBy ? longDate(replyBy) : gap('reply-by date: pick the day you send it', '', '');
  const terms = s.termsUrl || gap('link to the approved customer terms and risk disclosures', '', '');
  const walletLine = f.wallet === 'connect'
    ? 'You connect a wallet you already own, such as MetaMask or a Ledger. Your crypto stays in your wallet, and FYNX never sees your recovery phrase or private keys.'
    : f.wallet === 'create'
      ? gap('how pilot members get their wallet: describe it once the in-app wallet has passed its independent review', 'wallet-recovery/decide', 'How customers get a wallet')
      : gap('how customers get a wallet: not decided yet', 'wallet-recovery/decide', 'How customers get a wallet');
  const limitLine = f.perTx && f.perMonth
    ? `During the pilot, transfers are limited to ${f.perTx} each and ${f.perMonth} per person per month.`
    : `During the pilot, transfers are limited to ${f.perTx || gap('limit per transfer', limitsKey, 'Pilot size and limits')} each and ${f.perMonth || gap('limit per person per month', limitsKey, 'Pilot size and limits')} per person per month.`;
  const help = f.reply && f.hours
    ? `Questions or problems: reply to this email or write to ${CONTACT}. We answer within ${f.reply} (${f.hours}).`
    : `Questions or problems: reply to this email or write to ${CONTACT}. We answer within ${f.reply || gap('first reply time', supportKey, 'Support during the pilot')} (${f.hours || gap('support hours', supportKey, 'Support during the pilot')}).`;
  const safety = `FYNX will never ask for your recovery phrase, private key, passwords or sign-in codes, never asks for remote access to your screen and never asks you to send crypto to “verify” your wallet. Our emails come only from ${CONTACT}. If anyone else asks, it is not us.`;
  const sign = s.signoff || DEFAULT_SIGNOFF;

  let subject, lines;
  if (kind === 'invite') {
    subject = 'Your invitation to the FYNX Wallet pilot';
    lines = [
      'Hello,', '',
      `Thank you for joining the FYNX Wallet waitlist. We are opening FYNX Wallet to a small first group of ${size} in ${states}, and we would like to invite you to be one of them.`, '',
      'What to expect', `- ${walletLine}`, `- ${limitLine}`,
      '- Blockchain transfers cannot be reversed once they are confirmed, and crypto prices can change quickly.',
      `- Please read the customer terms, privacy notice and risk disclosures before you start: ${terms}`, '',
      'How to accept',
      `- Reply to this email by ${by} to take your place, and tell us which state you live in (the pilot is open to residents of ${statesOr} only).`,
      '- Places are limited. If we have not heard from you by then, we will send one reminder before offering your place to the next person on the waitlist.',
      '- Not interested right now? Reply “no thanks”. To be removed from the waitlist completely, reply “remove me”.', '',
      'Help and safety', `- ${help}`, `- ${safety}`, '',
      'Thank you,', sign, COMPANY, '',
      'You are receiving this because you joined the FYNX Wallet waitlist.',
    ];
  } else {
    subject = 'Reminder: your place in the FYNX Wallet pilot';
    lines = [
      'Hello,', '',
      `A short reminder: we invited you to the FYNX Wallet pilot, a small first group of ${size} in ${states}, and we have not heard back yet.`, '',
      `If you would like to take part, reply to this email by ${by} and tell us which state you live in. After that date we will offer your place to the next person on the waitlist. This is the only reminder we will send.`, '',
      `Before you start, please read the customer terms, privacy notice and risk disclosures: ${terms}`, '',
      'Not interested right now? Reply “no thanks”. To be removed from the waitlist completely, reply “remove me”.', '',
      `${safety}`, '',
      'Thank you,', sign, COMPANY,
    ];
  }
  if (!readiness.ready) subject = `[DRAFT – do not send] ${subject}`;
  const body = lines.join('\n');
  return { kind, subject, body, text: `Subject: ${subject}\n\n${body}\n`, gaps, ready: readiness.ready && gaps.length === 0, blockers: readiness.blockers, replyBy };
}

// One line for the panel: can this be sent, and if not, why.
export function draftHeadline(draft) {
  if (draft.ready) return `Ready to send. Paste it into a new email from ${CONTACT}; the reply-by date is ${draft.replyBy}.`;
  const parts = [];
  if (draft.blockers.length) parts.push(`${draft.blockers.length === 1 ? '1 launch step' : `${draft.blockers.length} launch steps`} still open`);
  if (draft.gaps.length) parts.push(`${draft.gaps.length === 1 ? '1 gap' : `${draft.gaps.length} gaps`} to fill`);
  return `Not ready to send: ${parts.join(' and ')}. You can still read and copy the draft.`;
}
