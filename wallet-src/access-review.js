// Owner access review: the outside accounts that control FYNX (Google, Firebase/Google Cloud, billing, GitHub,
// the team inbox and the service dashboards), checked by the owner every REVIEW_DAYS days.
// Pure helpers shared by the Account security tab and tests. Answers are saved in this browser only and travel
// between devices inside the Launch readiness test report as fixed words (no free text, no addresses).
export const ACCESS_KEY = 'fynx-owner-access-review-v1';
export const REVIEW_DAYS = 90;
export const SOON_DAYS = 14;
const DAY = 86400000;
const PROJECT = 'fynx-c7a28';

// core: always counted. Optional services count once the owner reviews them (or stay out with "Not used yet").
export const ACCESS_SERVICES = [
  {
    id: 'google', core: true, name: 'Your owner Google account',
    controls: 'Signs you in to this workspace and owns the Firebase project. Whoever controls it controls FYNX.',
    check: 'In Google Account → Security: 2-Step Verification on, backup codes printed or saved offline, and no device you do not recognise under “Your devices”.',
    people: 'Usually 1: only you should know its password.',
    links: [['Security settings', 'https://myaccount.google.com/security'], ['Your devices', 'https://myaccount.google.com/device-activity']],
  },
  {
    id: 'cloud', core: true, name: `Firebase and Google Cloud project (${PROJECT})`,
    controls: 'The backend functions, the waitlist database, the provider keys in Secret Manager and the logs.',
    check: 'In IAM: only people who still need access, nobody who has left, no Owner role for an account you do not recognise, and each person uses 2-Step Verification on their Google account.',
    people: 'Count the people listed in IAM (leave out Google’s own service accounts).',
    links: [['Who has access (IAM)', `https://console.cloud.google.com/iam-admin/iam?project=${PROJECT}`], ['Secrets', `https://console.cloud.google.com/security/secret-manager?project=${PROJECT}`]],
  },
  {
    id: 'billing', core: true, name: 'Google Cloud billing',
    controls: 'Pays for the backend. If the card fails or a stranger is a billing admin, the service can stop.',
    check: 'Billing admins are people you trust, the payment method is current, and a budget alert is set.',
    people: 'Count the billing account’s admins.',
    links: [['Billing', 'https://console.cloud.google.com/billing']],
  },
  {
    id: 'github', core: true, name: 'GitHub (EA-LA)',
    controls: 'The code, the public website and this owner page are published from it: a change there changes what everyone sees.',
    check: 'Two-factor authentication on (a passkey or security key is best), recovery codes saved offline, only trusted collaborators, no installed app or deploy key you do not recognise.',
    people: 'Count the people listed under Collaborators, plus you.',
    links: [['Password and authentication', 'https://github.com/settings/security'], ['Collaborators', 'https://github.com/EA-LA/FYNX-Wallet/settings/access'], ['Installed apps', 'https://github.com/settings/installations']],
  },
  {
    id: 'inbox', core: true, name: 'Team inbox (fynxteam5@gmail.com)',
    controls: 'Receives privacy requests, support and provider emails, and can reset the passwords of other services.',
    check: 'Signed in as the inbox: 2-Step Verification on, backup codes saved offline, the recovery phone and email are yours, and no forwarding or filter you did not set up.',
    people: 'Count everyone who can sign in to the inbox.',
    links: [['Security settings', 'https://myaccount.google.com/security'], ['Forwarding settings', 'https://mail.google.com/mail/u/0/#settings/fwdandpop']],
  },
  {
    id: 'transak', core: false, name: 'Transak partner dashboard',
    controls: 'Holds the payment provider’s API key (test now, real later) and the order history.',
    check: 'Two-factor authentication on, only your team as dashboard users, and API keys only in Google Cloud Secret Manager.',
    people: 'Count the dashboard users.',
    links: [['How the dashboard works', 'https://docs.transak.com/guides/how-to-create-partner-dashboard-account']],
  },
  {
    id: 'alchemy', core: false, name: 'Alchemy',
    controls: 'The network connection key used for balances and transaction history.',
    check: 'Two-factor authentication on, only your team in the account, and the key restricted to the FYNX backend.',
    people: 'Count the account’s team members.',
    links: [['Dashboard', 'https://dashboard.alchemy.com/']],
  },
  {
    id: 'coingecko', core: false, name: 'CoinGecko API',
    controls: 'The market price key.',
    check: 'Two-factor authentication on and the key kept only in Google Cloud Secret Manager.',
    people: 'Count the people who can sign in.',
    links: [['Developer dashboard', 'https://www.coingecko.com/en/developers/dashboard']],
  },
];
export const findService = id => ACCESS_SERVICES.find(s => s.id === id) || null;

const ANSWERS = ['yes', 'no', 'unsure'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = d => typeof d === 'string' && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
export const localToday = (now = Date.now()) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

// Keep only known services and well-formed values. A review date in the future or before 2024 is dropped.
export function cleanEntry(raw, today = localToday()) {
  if (!raw || typeof raw !== 'object') return null;
  const at = Number(raw.at);
  if (!Number.isFinite(at) || at <= 0) return null;
  const people = raw.people === null || raw.people === undefined || raw.people === '' ? null : Number(raw.people);
  const entry = {
    twoStep: ANSWERS.includes(raw.twoStep) ? raw.twoStep : '',
    codes: ANSWERS.includes(raw.codes) ? raw.codes : '',
    people: Number.isInteger(people) && people >= 0 && people <= 99 ? people : null,
    reviewed: validDate(raw.reviewed) && raw.reviewed >= '2024-01-01' && raw.reviewed <= today ? raw.reviewed : '',
    unused: raw.unused === true,
    at: Math.round(at),
  };
  return entry;
}
export function cleanReview(raw, today = localToday()) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const s of ACCESS_SERVICES) { const e = cleanEntry(raw[s.id], today); if (e) out[s.id] = e; }
  return out;
}

// Change one service. "reviewed: 'today'" stamps today's date. The change time decides which device wins.
export function updateService(review, id, patch, now = Date.now()) {
  if (!findService(id)) return review;
  const today = localToday(now), prev = review[id] || { twoStep: '', codes: '', people: null, reviewed: '', unused: false, at: 0 };
  const next = { ...prev, ...patch, at: Math.max(now, (prev.at || 0) + 1) };
  if (patch.reviewed === 'today') next.reviewed = today;
  const clean = cleanEntry(next, today);
  return clean ? { ...review, [id]: clean } : review;
}

// State of one service on a day: unused / never / risk / check / overdue / soon / ok, with a plain title and the problems.
export function serviceState(service, entry, today = localToday()) {
  if (entry?.unused) return { state: 'unused', title: 'Not used yet', problems: [], counted: false };
  const counted = service.core || !!entry;
  const problems = [], unchecked = [];
  if (entry?.twoStep === 'no') problems.push(service.id === 'github' ? 'Two-factor authentication is off' : '2-step verification is off');
  else if (entry?.twoStep !== 'yes') unchecked.push('2-step verification');
  if (entry?.codes === 'no') problems.push('No recovery codes saved offline');
  else if (entry?.codes !== 'yes') unchecked.push('recovery codes');
  if (!entry?.reviewed) {
    return { state: problems.length ? 'risk' : 'never', title: problems.length ? problems.join(' · ') : 'Not reviewed yet', problems, unchecked, counted };
  }
  const due = addDays(entry.reviewed, REVIEW_DAYS), left = daysBetween(today, due);
  const base = { reviewed: entry.reviewed, due, daysLeft: left, problems, unchecked, counted };
  if (problems.length) return { ...base, state: 'risk', title: problems.join(' · ') };
  if (left < 0) return { ...base, state: 'overdue', title: `Review overdue since ${due}` };
  if (unchecked.length) return { ...base, state: 'check', title: `Reviewed ${entry.reviewed}, but ${unchecked.join(' and ')} not checked` };
  if (left <= SOON_DAYS) return { ...base, state: 'soon', title: left === 0 ? 'Review due today' : `Review due in ${left} day${left === 1 ? '' : 's'} (${due})` };
  return { ...base, state: 'ok', title: `Reviewed ${entry.reviewed} · next by ${due}` };
}

const ORDER = { risk: 0, overdue: 1, never: 2, check: 3, soon: 4, ok: 5, unused: 6 };
// Totals and the list that needs attention, most urgent first. "fine" counts ok and due-soon services.
export function accessSummary(review, today = localToday()) {
  const rows = ACCESS_SERVICES.map(service => ({ service, entry: review[service.id] || null, ...serviceState(service, review[service.id], today) }));
  const counted = rows.filter(r => r.counted);
  const by = state => counted.filter(r => r.state === state).length;
  const attention = counted.filter(r => !['ok', 'soon'].includes(r.state)).sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  const dues = counted.filter(r => r.due).map(r => r.due).sort();
  return {
    rows, total: counted.length, fine: by('ok') + by('soon'), ok: by('ok'), soon: by('soon'), overdue: by('overdue'), never: by('never'), risk: by('risk'), check: by('check'),
    unused: rows.filter(r => r.state === 'unused').length, attention, nextDue: dues[0] || '',
    // For "Your next steps" and the tab badge: only things with danger or a date, never the first-time reviews.
    urgent: counted.filter(r => r.state === 'risk' || r.state === 'overdue').sort((a, b) => ORDER[a.state] - ORDER[b.state]),
  };
}

// The checkup line on the Account security tab.
export function accessCheck(summary) {
  const done = summary.total > 0 && summary.fine === summary.total;
  let detail;
  if (done) detail = `All ${summary.total} accounts that control FYNX were reviewed in the last ${REVIEW_DAYS} days${summary.nextDue ? `; the next review is due by ${summary.nextDue}` : ''}.`;
  else if (summary.risk) detail = `${summary.risk} account${summary.risk === 1 ? ' has' : 's have'} a gap (2-step verification off or no recovery codes). Fix ${summary.risk === 1 ? 'it' : 'them'} first.`;
  else {
    const parts = [summary.never && `${summary.never} not reviewed yet`, summary.overdue && `${summary.overdue} overdue`, summary.check && `${summary.check} not fully checked`].filter(Boolean);
    detail = `${summary.fine} of ${summary.total} reviewed in the last ${REVIEW_DAYS} days (${parts.join(', ')}). Someone who takes over one of these accounts can change FYNX without touching your sign-in here.`;
  }
  return { id: 'access', state: done ? 'done' : 'todo', title: 'The accounts that control FYNX are reviewed', detail, fix: done ? null : 'access' };
}

const answerWord = { twoStep: { yes: 'on', no: 'off', unsure: 'not checked', '': 'not checked' }, codes: { yes: 'stored', no: 'missing', unsure: 'not checked', '': 'not checked' } };
export const answerLabel = (field, value) => answerWord[field][value || ''];

// A plain summary to paste into a message: service names and states only, no email or account addresses.
export function accessSummaryText(review, today = localToday()) {
  const s = accessSummary(review, today);
  const L = [`FYNX owner access review, ${today}`, `${s.fine} of ${s.total} accounts reviewed in the last ${REVIEW_DAYS} days${s.risk ? `, ${s.risk} with a gap` : ''}${s.overdue ? `, ${s.overdue} overdue` : ''}${s.never ? `, ${s.never} not reviewed yet` : ''}.`];
  for (const r of s.rows) {
    const name = r.service.id === 'inbox' ? 'Team inbox' : r.service.name;
    if (r.state === 'unused') { L.push(`- [i] ${name}: not used yet`); continue; }
    if (!r.counted) { L.push(`- [i] ${name}: not reviewed (optional until used)`); continue; }
    const e = r.entry || {};
    L.push(`- [${r.state === 'ok' || r.state === 'soon' ? 'x' : ' '}] ${name}: ${r.title}${r.entry ? ` (2-step ${answerLabel('twoStep', e.twoStep)}, recovery codes ${answerLabel('codes', e.codes)}${e.people !== null && e.people !== undefined ? `, ${e.people} ${e.people === 1 ? 'person' : 'people'} with access` : ''})` : ''}`);
  }
  return L.join('\n');
}

// Travel inside the Launch readiness test report ("Owner access review" section): one line per service with
// fixed words only, and the exact change time so the later change wins on import.
export const ACCESS_SECTION = 'Owner access review';
const stampMs = ms => new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
const LINE = /^\s*[-*]\s+([a-z]{2,20}) · (?:(not used yet)|2-step (on|off|not sure|not checked) · codes (stored|missing|not sure|not checked) · (?:(\d{1,2}) (?:person|people)|people not counted) · (?:reviewed (\d{4}-\d{2}-\d{2})|not reviewed)) · changed (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3}) UTC$/;
const toWord = { yes: 'on', no: 'off', unsure: 'not sure', '': 'not checked' }, toCodes = { yes: 'stored', no: 'missing', unsure: 'not sure', '': 'not checked' };
const fromWord = { on: 'yes', off: 'no', 'not sure': 'unsure', 'not checked': '' }, fromCodes = { stored: 'yes', missing: 'no', 'not sure': 'unsure', 'not checked': '' };

export function accessReportLines(review, today = localToday()) {
  const clean = cleanReview(review, today), ids = ACCESS_SERVICES.map(s => s.id).filter(id => clean[id]);
  if (!ids.length) return [];
  const L = [`## ${ACCESS_SECTION}`, '', `Your answers in Account security → “Accounts that control FYNX” (reviewed every ${REVIEW_DAYS} days). Fixed words only: no addresses, codes or notes.`, ''];
  for (const id of ids) {
    const e = clean[id];
    const body = e.unused ? 'not used yet' : `2-step ${toWord[e.twoStep]} · codes ${toCodes[e.codes]} · ${e.people === null ? 'people not counted' : `${e.people} ${e.people === 1 ? 'person' : 'people'}`} · ${e.reviewed ? `reviewed ${e.reviewed}` : 'not reviewed'}`;
    L.push(`- ${id} · ${body} · changed ${stampMs(e.at)} UTC`);
  }
  L.push('');
  return L;
}

export function parseAccessReport(text, today = localToday()) {
  const raw = {};
  let inSection = false, unknown = 0;
  for (const line of String(text || '').split(/\r?\n/).slice(0, 5000)) {
    if (/^##\s/.test(line)) { inSection = line.replace(/^##\s+/, '').trim() === ACCESS_SECTION; continue; }
    if (!inSection || !/^\s*[-*]\s/.test(line)) continue;
    const m = line.match(LINE), at = m ? Date.parse(`${m[7]}T${m[8]}Z`) : NaN;
    if (!m || !findService(m[1]) || !Number.isFinite(at)) { unknown += 1; continue; }
    const entry = m[2] ? { twoStep: '', codes: '', people: null, reviewed: '', unused: true, at } : { twoStep: fromWord[m[3]], codes: fromCodes[m[4]], people: m[5] === undefined ? null : Number(m[5]), reviewed: m[6] || '', unused: false, at };
    if (!raw[m[1]] || raw[m[1]].at < at) raw[m[1]] = entry;
  }
  const review = cleanReview(raw, today);
  // A line whose review date is in the future (or otherwise impossible) loses that date, it is not guessed.
  return { review, count: Object.keys(review).length, unknown };
}

// The later change wins per service; the same change time counts as the same answer.
export function mergeAccessReviews(local, incoming, today = localToday()) {
  const mine = cleanReview(local, today), inc = cleanReview(incoming, today), review = { ...mine };
  const added = [], updated = [], same = [], kept = [];
  for (const [id, e] of Object.entries(inc)) {
    const have = mine[id];
    if (!have) { review[id] = e; added.push(id); }
    else if (e.at > have.at) { review[id] = e; updated.push(id); }
    else if (e.at === have.at) same.push(id);
    else kept.push(id);
  }
  return { review, added, updated, same, kept };
}
