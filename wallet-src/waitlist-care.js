// Waitlist care: pure helpers for the owner workspace Waitlist tab and its tests.
// Address checks (likely typos, disposable inboxes, shared mailboxes, possible duplicates),
// retention flags, the website-gate test sign-up check and privacy-request reply drafts.
// They only read registrations already loaded in this browser; nothing is sent or saved.
import { isTestAddress } from './waitlist-insights.js';

const DAY = 86400000;
export const CONTACT = 'fynxteam5@gmail.com';
export const RETENTION_DAYS = 365;

// Common misspellings of the largest mailbox providers. A suggestion only: the owner decides.
const TYPOS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmaill.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gmail.comm': 'gmail.com',
  'gmail.cpm': 'gmail.com', 'gmali.com': 'gmail.com', 'gmeil.com': 'gmail.com', 'gimail.com': 'gmail.com', 'gmsil.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotnail.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
  'hotmil.com': 'hotmail.com', 'hormail.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.co': 'outlook.com',
  'oulook.com': 'outlook.com', 'outllook.com': 'outlook.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yhoo.com': 'yahoo.com',
  'yahoo.cm': 'yahoo.com', 'iclod.com': 'icloud.com', 'icoud.com': 'icloud.com', 'icloud.co': 'icloud.com', 'iclould.com': 'icloud.com',
  'aol.co': 'aol.com', 'protonmail.co': 'protonmail.com', 'protonmal.com': 'protonmail.com',
};
// Well-known throwaway-inbox services: sign-ups there usually cannot be reached later.
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', 'grr.la', '10minutemail.com', 'temp-mail.org', 'tempmail.com',
  'yopmail.com', 'trashmail.com', 'dispostable.com', 'getnada.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mintemail.com',
  'mohmal.com', 'emailondeck.com', 'tempmailo.com', 'burnermail.io', 'mailnesia.com', 'mytemp.email', 'spamgourmet.com', 'tempail.com',
]);
// Shared mailboxes that usually belong to a team or system rather than one person.
const ROLES = new Set(['admin', 'info', 'support', 'noreply', 'no-reply', 'postmaster', 'abuse', 'webmaster', 'sales', 'contact', 'billing', 'office']);

const split = email => {
  const value = String(email || '').trim().toLowerCase(), at = value.lastIndexOf('@');
  return at < 1 ? { local: value, domain: '' } : { local: value.slice(0, at), domain: value.slice(at + 1) };
};

// Suggested correction for a likely-mistyped domain, or ''.
export function suggestDomain(email) {
  const { domain } = split(email);
  if (!domain || isTestAddress(email)) return '';
  if (TYPOS[domain]) return TYPOS[domain];
  const fixed = domain.replace(/\.(con|cmo|ocm|vom|xom)$/, '.com');
  return fixed !== domain ? fixed : '';
}

// One inbox can receive mail under several spellings: case, a "+tag", and (at Gmail) dots.
export function inboxKey(email) {
  let { local, domain } = split(email);
  if (!domain) return local;
  if (domain === 'googlemail.com') domain = 'gmail.com';
  local = local.split('+')[0];
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

const timeOf = value => { const t = Date.parse(value || ''); return Number.isFinite(t) ? t : null; };

export const CHECKS = [
  ['attention', 'Needs a look'], ['duplicate', 'Possible duplicates'], ['typo', 'Likely mistyped'],
  ['disposable', 'Disposable inbox'], ['role', 'Shared mailbox'], ['expiring', 'Retention ends within 30 days'],
  ['expired', 'Past retention date'],
];
const ATTENTION = new Set(['duplicate', 'typo', 'disposable', 'expired']);

// Flags per registration id: [{ kind, label, detail }]. Test addresses get only a test flag.
export function addressFlags(records, { now = Date.now() } = {}) {
  const list = [...records], flags = new Map(), groups = new Map();
  for (const r of list) {
    if (isTestAddress(r.email)) continue;
    const key = inboxKey(r.email); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r);
  }
  for (const r of list) {
    const out = [];
    if (isTestAddress(r.email)) { flags.set(r.id, [{ kind: 'test', label: 'Test address', detail: 'Reserved for testing; not a subscriber.' }]); continue; }
    const same = groups.get(inboxKey(r.email)).filter(o => o.id !== r.id);
    if (same.length) out.push({ kind: 'duplicate', label: 'Possible duplicate', detail: `Same inbox as ${same.map(o => o.email).join(', ')}. Keep one and remove the rest if the person asks.` });
    const fix = suggestDomain(r.email);
    if (fix) out.push({ kind: 'typo', label: 'Likely mistyped', detail: `Probably meant ${split(r.email).local}@${fix}. Mail to this address will probably bounce.` });
    const { local, domain } = split(r.email);
    if (DISPOSABLE.has(domain)) out.push({ kind: 'disposable', label: 'Disposable inbox', detail: `${domain} is a throwaway-inbox service; the person may not be reachable later.` });
    if (ROLES.has(local.split('+')[0])) out.push({ kind: 'role', label: 'Shared mailbox', detail: `${local}@ is usually a team or system mailbox rather than one person.` });
    const expires = timeOf(r.expiresAt);
    if (expires !== null && expires < now) out.push({ kind: 'expired', label: 'Past retention date', detail: 'Automatic deletion is queued; it normally completes within a day of the expiry date.' });
    else if (expires !== null && expires < now + 30 * DAY) out.push({ kind: 'expiring', label: 'Retention ends soon', detail: `Deleted automatically after ${new Date(expires).toISOString().slice(0, 10)}.` });
    flags.set(r.id, out);
  }
  return flags;
}

// Counts for the Address check panel. Duplicates count groups and the rows inside them.
export function checkCounts(records, flags) {
  const counts = Object.fromEntries(CHECKS.map(([k]) => [k, 0])), seen = new Set();
  let groups = 0;
  for (const r of records) {
    const f = flags.get(r.id) || [];
    for (const { kind } of f) if (kind in counts) counts[kind]++;
    if (f.some(x => ATTENTION.has(x.kind))) counts.attention++;
    if (f.some(x => x.kind === 'duplicate')) { const key = inboxKey(r.email); if (!seen.has(key)) { seen.add(key); groups++; } }
  }
  return { ...counts, groups };
}

export function matchesCheck(record, flags, check = 'all') {
  if (!check || check === 'all') return true;
  const f = flags.get(record.id) || [];
  return check === 'attention' ? f.some(x => ATTENTION.has(x.kind)) : f.some(x => x.kind === check);
}

// One line, counts only, for the copied summary.
export function checkSummaryLine(counts) {
  const parts = [`${counts.groups} possible duplicate group${counts.groups === 1 ? '' : 's'} (${counts.duplicate} rows)`, `${counts.typo} likely mistyped`, `${counts.disposable} disposable`, `${counts.role} shared mailbox${counts.role === 1 ? '' : 'es'}`];
  return `Address check: ${parts.join(' · ')}`;
}

// Website-gate test: does a test sign-up carry everything the waitlist should record?
export function testSignupCheck(record, { now = Date.now() } = {}) {
  const created = timeOf(record?.createdAt), expires = timeOf(record?.expiresAt);
  const days = created !== null && expires !== null ? (expires - created) / DAY : null;
  const checks = [
    { label: 'Test address (not a real subscriber)', ok: isTestAddress(record?.email) },
    { label: 'Consent recorded', ok: record?.consent === true },
    { label: 'Privacy notice version recorded', ok: !!record?.noticeVersion, detail: record?.noticeVersion || '' },
    { label: 'Where they signed up recorded', ok: !!record?.source, detail: record?.source || '' },
    { label: 'Sign-up time recorded', ok: created !== null, detail: created !== null ? relative(created, now) : '' },
    { label: `Deletion date about ${RETENTION_DAYS} days after sign-up`, ok: days !== null && Math.abs(days - RETENTION_DAYS) <= 2, detail: days !== null ? `${Math.round(days)} days` : '' },
  ];
  return { checks, passed: checks.filter(c => c.ok).length, total: checks.length, ok: checks.every(c => c.ok) };
}
function relative(time, now) {
  const mins = Math.round((now - time) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

// Short note for the "find and remove" launch test (domain only, never the full address).
export function findRemoveNote(record, check, { now = Date.now() } = {}) {
  const domain = split(record?.email).domain || 'unknown domain';
  return `Found and removed a test address at ${domain} on ${new Date(now).toISOString().slice(0, 10)}; sign-up checks ${check.passed}/${check.total} passed${record?.noticeVersion ? `, notice ${record.noticeVersion}` : ''}.`;
}

const fullDate = value => { const t = timeOf(value); return t === null ? 'not recorded' : `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`; };
const dayOnly = value => { const t = timeOf(value); return t === null ? 'not recorded' : new Date(t).toISOString().slice(0, 10); };

// Draft reply to "what do you hold about me?" built from the loaded record. Review before sending.
export function accessReply(record) {
  return [
    'Subject: Your FYNX Wallet waitlist information', '',
    'Hello,', '',
    'You asked what information FYNX holds about you. The FYNX Wallet waitlist has this record for your email address:', '',
    `- Email address: ${record.email}`,
    `- Joined the waitlist: ${fullDate(record.createdAt)}`,
    `- Waitlist status: ${record.status || 'not recorded'}`,
    `- Agreement to the waitlist privacy notice: ${record.consent === true ? 'recorded' : 'not recorded'}${record.noticeVersion ? ` (notice version ${record.noticeVersion})` : ''}`,
    `- Where you signed up: ${record.source || 'not recorded'}`,
    `- Automatic deletion date: ${dayOnly(record.expiresAt)}`, '',
    'The waitlist record contains only the details above. If you would like it removed sooner, reply to this email and we will delete it.', '',
    'FYNX finance world inc.', CONTACT,
  ].join('\n');
}

// Draft confirmation after a deletion request has been carried out. Honest about backups.
export function deletionReply(record, { removedAt = Date.now() } = {}) {
  return [
    'Subject: Your FYNX Wallet waitlist record has been deleted', '',
    'Hello,', '',
    `As you asked, we deleted ${record.email} from the FYNX Wallet waitlist on ${new Date(removedAt).toISOString().slice(0, 10)}. We will not contact you about the waitlist again.`, '',
    'A copy may remain for a limited time in our hosting provider’s restricted backups; it is deleted automatically when those backups expire.', '',
    'If you join again later, a new record will be created.', '',
    'FYNX finance world inc.', CONTACT,
  ].join('\n');
}
