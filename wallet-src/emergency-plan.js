// Owner emergency plan: what to do, in order, when something goes wrong with the accounts or wallets behind FYNX.
// Pure helpers shared by the Account security tab and tests. The plan is computed in this browser from the signed-in
// account (ways in, passkeys, wallet ownership, real-money switch), the access review and the owner's recorded launch
// tests. The only thing saved is when the emergency sheet was last copied or downloaded, with a fingerprint of the ways
// in at that moment (kinds and counts, never an address), so the page can say when the sheet is out of date.
import { stepKey } from './launch-tracker.js';

export const EMERGENCY_KEY = 'fynx-owner-emergency-v1';
export const SHEET_STALE_DAYS = 180;
const DAY = 86400000;
const PROJECT = 'fynx-c7a28';

export const LINKS = {
  googleRecovery: ['Google account recovery', 'https://accounts.google.com/signin/recovery'],
  googleSecurity: ['Google security settings', 'https://myaccount.google.com/security'],
  googleDevices: ['Google: your devices', 'https://myaccount.google.com/device-activity'],
  findApple: ['Find My (Apple)', 'https://www.icloud.com/find'],
  findGoogle: ['Find My Device (Google)', 'https://www.google.com/android/find'],
  authUsers: ['Firebase: Authentication → Users', `https://console.firebase.google.com/project/${PROJECT}/authentication/users`],
  firestore: ['Firebase: Firestore data (fynxWalletAudit)', `https://console.firebase.google.com/project/${PROJECT}/firestore`],
  iam: ['Google Cloud: who has access (IAM)', `https://console.cloud.google.com/iam-admin/iam?project=${PROJECT}`],
  github: ['GitHub: password and authentication', 'https://github.com/settings/security'],
  incident: ['FYNX incident procedure', 'https://github.com/EA-LA/FYNX-Wallet/blob/main/docs/OPERATIONS.md#incident-response'],
  reportPhish: ['Report a phishing site to Google', 'https://safebrowsing.google.com/safebrowsing/report_phish/'],
};

// Owner launch tests that prove a scenario has been practised (same records as Launch readiness).
export const PRACTICE = { drill: ['operations', 'drill'], restore: ['wallet-recovery', 'restore-test'], revoke: ['swaps', 'revoke'] };

const passed = (records, [gate, step]) => { const r = records?.[stepKey(gate, step)]; return r?.result === 'pass'; };

// What the plan needs to know. Everything is optional; missing facts count as "not set up".
export function planState({ providers = [], passkeys = 0, wallet = false, mainnet = false, access = null, records = {} } = {}) {
  const ids = new Set((Array.isArray(providers) ? providers : []).filter(p => typeof p === 'string'));
  const keys = Math.max(0, Number.isInteger(passkeys) ? passkeys : Array.isArray(passkeys) ? passkeys.length : 0);
  const google = ids.has('google.com'), password = ids.has('password');
  const row = id => (access?.rows || []).find(r => r?.service?.id === id);
  const googleRow = row('google'), cloudRow = row('cloud');
  return {
    google, password, passkeys: keys, ways: (google ? 1 : 0) + (password ? 1 : 0) + (keys ? 1 : 0),
    wallet: !!wallet, mainnet: !!mainnet,
    googleSafe: !!googleRow && googleRow.entry?.twoStep === 'yes' && googleRow.entry?.codes === 'yes',
    googleReviewed: !!googleRow && ['ok', 'soon'].includes(googleRow.state),
    cloudPeople: Number.isInteger(cloudRow?.entry?.people) ? cloudRow.entry.people : null,
    drill: passed(records, PRACTICE.drill), restore: passed(records, PRACTICE.restore), revoke: passed(records, PRACTICE.revoke),
  };
}

const waysText = s => {
  const out = [];
  if (s.google) out.push('Google');
  if (s.password) out.push('email & password');
  if (s.passkeys) out.push(s.passkeys === 1 ? '1 passkey' : `${s.passkeys} passkeys`);
  return out.length ? out.join(', ') : 'none recorded';
};
const mainnetStep = s => s.mainnet
  ? { text: 'Real-money sending is ON. Turn it off first in Crypto tools → Real-money sending (it takes effect at once).', action: 'mainnet', urgent: true }
  : { text: 'Real-money sending is off, so nothing can be sent from FYNX with real money. Leave it off until this is resolved.' };

// The six scenarios. steps(s) returns the ordered steps; ready(s) says whether the owner is prepared today.
export const SCENARIOS = [
  {
    id: 'device', title: 'A phone or computer with a FYNX passkey is lost or stolen',
    signs: 'A device you signed in to FYNX with is missing, stolen or sold without being wiped.',
    steps: s => [
      { text: `Sign in here from another device. Your ways in now: ${waysText(s)}.`, },
      { text: 'Account security → Passkeys: remove the passkey added on that device. FYNX numbers passkeys by the date they were added and stores no device names; if you are not sure which one it is, remove them all and add new ones on the devices you still have.', action: 'passkeys' },
      { text: 'Sign that device out of your Google account and, if you can, lock or erase it.', links: ['googleDevices', 'findApple', 'findGoogle'] },
      { text: 'If your wallet app was on that device too, follow “Your wallet device is lost or your recovery phrase may have been seen” as well.' },
    ],
    ready: s => (s.google || s.password ? true : s.passkeys >= 2)
      ? { ok: true, text: `You can still get in without that device (${waysText(s)}).` }
      : { ok: false, text: s.passkeys ? 'Your only way in is a single passkey. Add a second passkey on another device, or set up Google or an email password.' : 'No way in is recorded yet.', fix: 'passkeys' },
  },
  {
    id: 'google', title: 'Your owner Google account is locked or taken over',
    signs: 'You cannot sign in to Google, you get security alerts you did not cause, or your Gmail settings changed.',
    steps: s => [
      mainnetStep(s),
      { text: 'Start Google’s account recovery from a device and network you have used before.', links: ['googleRecovery'] },
      { text: 'If someone else may now control it: whoever owns the Google account also controls the Firebase project. Ask another person with Owner access in Google Cloud (if you have one) to disable the owner user in Firebase → Authentication → Users. That ends every FYNX sign-in at once: the workspace checks on every request for a disabled or signed-out account. Nobody, you included, can sign in until it is enabled again.', links: ['authUsers', 'iam'] },
      { text: 'Once you are back in: change the password, check 2-step verification, backup codes and “Your devices”, then check Google Cloud IAM for people you did not add.', links: ['googleSecurity', 'googleDevices', 'iam'] },
      { text: 'Enable the owner user again in Firebase, sign in here, check your passkeys and redo the access review.', action: 'access' },
    ],
    ready: s => {
      const gaps = [];
      if (!s.password && !s.passkeys) gaps.push('add a passkey so you are not locked out of FYNX while Google is being recovered');
      if (!s.googleSafe) gaps.push('record 2-step verification On and backup codes Saved for your Google account in the access review');
      return gaps.length ? { ok: false, text: `${gaps[0][0].toUpperCase()}${gaps.join('; ').slice(1)}.`, fix: !s.password && !s.passkeys ? 'passkeys' : 'access' } : { ok: true, text: `Google has 2-step verification and saved backup codes, and you can still reach FYNX with ${waysText({ ...s, google: false })}.` };
    },
  },
  {
    id: 'signin', title: 'Someone else may have signed in to FYNX',
    signs: 'A passkey you did not add, a wallet you did not verify, real-money sending changed, or a sign-in alert you cannot explain.',
    steps: s => [
      mainnetStep(s),
      { text: 'Look at the security audit log (Firestore collection fynxWalletAudit): passkey.registered, passkey.authenticated, passkey.removed, wallet.verified, wallet.unlinked, mainnet.on and mainnet.off, with times. Entries you did not cause are evidence: note the times before anything expires (90 days).', links: ['firestore'] },
      { text: 'Remove every passkey you do not recognise.', action: 'passkeys' },
      { text: 'To end every FYNX sign-in at once, disable the owner user in Firebase → Authentication → Users; enable it again when you have secured your accounts.', links: ['authUsers'] },
      { text: 'Change your Google password, check its devices and Google Cloud IAM, then follow the incident procedure (contain, preserve evidence, notify, recover).', links: ['googleSecurity', 'iam', 'incident'] },
    ],
    ready: s => s.drill
      ? { ok: true, text: 'You have walked through the incident procedure with your team.' }
      : { ok: false, text: 'Do the 30-minute incident practice run once (Launch readiness), so the steps are familiar before you need them.', fix: 'drill' },
  },
  {
    id: 'wallet', title: 'Your wallet device is lost or your recovery phrase may have been seen',
    signs: 'A Ledger or phone wallet is missing, or the recovery phrase was typed into a website, photographed, shared or stored online.',
    steps: () => [
      { text: 'If the phrase may have been seen: create a NEW wallet with a NEW phrase in the wallet’s own app and move everything to it now. An exposed phrase can never be made safe again, and FYNX cannot freeze, move or recover funds.' },
      { text: 'If only the device is lost and the phrase is safe: your funds are safe while the phrase is. Restore the wallet on a new device with the wallet maker’s official app (never on a website).' },
      { text: 'In FYNX: verify the new wallet in Crypto tools, and check “Who can spend your USDC?” for the old one.', action: 'spend' },
      { text: 'Never type the phrase into FYNX, a support chat or an email. No real support will ever ask for it.' },
    ],
    ready: s => s.restore
      ? { ok: true, text: 'You have practised restoring a test wallet from its phrase.' }
      : { ok: false, text: 'Practise restoring a test wallet from its recovery phrase in the wallet’s own app (launch test “Restore a test wallet”), with no real money in it.', fix: 'restore' },
  },
  {
    id: 'phishing', title: 'You approved or signed something you did not expect',
    signs: 'A website or message got you to approve a token, sign a message or connect your wallet, and something feels wrong.',
    steps: s => [
      { text: 'Stop: do not sign or approve anything else. Disconnect the site in your wallet’s connected-sites settings.' },
      { text: 'Crypto tools → “Who can spend your USDC?”: read the permissions and set any you do not recognise to zero (Revoke swap allowance for the swap router, or your wallet’s own revoke option).', action: 'spend' },
      { text: 'A signed message cannot be cancelled. If it might allow spending (for example a “permit”), move funds to a fresh wallet. If you typed your recovery phrase anywhere, follow the wallet scenario above.' },
      { text: 'Report the site, and if it pretends to be FYNX, follow the incident procedure (fake FYNX site).', links: ['reportPhish', 'incident'] },
      mainnetStep(s),
    ],
    ready: s => s.revoke
      ? { ok: true, text: 'You have practised setting a spending permission back to zero.' }
      : { ok: false, text: 'Practise setting a spending permission back to zero once on a test network (launch test “Revoke swap allowance”).', fix: 'revoke' },
  },
  {
    id: 'locked', title: 'You lost every way into this workspace',
    signs: 'Google, email password and passkeys all fail.',
    steps: s => [
      { text: `Ways in recorded now: ${waysText(s)}. Try each one before anything else; for an email password use “Set or reset an email password” on the sign-in screen.` },
      { text: 'Recover the Google account first: it is also the email address the workspace was set up with.', links: ['googleRecovery'] },
      { text: `The workspace opens only for one fixed owner account. A person with Owner access to the Firebase project${s.cloudPeople ? ` (your access review lists ${s.cloudPeople})` : ''} can send a password-reset email from Authentication → Users, but it still goes to the owner’s email address.`, links: ['authUsers'] },
      { text: 'A new account cannot take over without an engineering change to the backend owner setting and a backend redeploy. Plan for that with your engineer before it is needed, not during an emergency.' },
    ],
    ready: s => s.ways >= 2
      ? { ok: true, text: `You have ${s.ways} different ways in (${waysText(s)}).` }
      : { ok: false, text: s.ways === 1 ? `You have one way in (${waysText(s)}). Add a second: a passkey, or an email password.` : 'No way in is recorded yet.', fix: 'passkeys' },
  },
];

export function emergencyPlan(input = {}) {
  const s = input.ways !== undefined && input.googleSafe !== undefined ? input : planState(input);
  const scenarios = SCENARIOS.map(sc => ({ id: sc.id, title: sc.title, signs: sc.signs, steps: sc.steps(s).map(step => ({ ...step, links: (step.links || []).map(k => LINKS[k]).filter(Boolean) })), ready: sc.ready(s) }));
  const ready = scenarios.filter(x => x.ready.ok).length;
  return { state: s, scenarios, ready, total: scenarios.length, gaps: scenarios.filter(x => !x.ready.ok) };
}

// Fingerprint of the ways in and switches the sheet depends on (kinds and counts only).
export function fingerprint(s) {
  return `google:${s.google ? 1 : 0}|password:${s.password ? 1 : 0}|passkeys:${s.passkeys}|wallet:${s.wallet ? 1 : 0}|mainnet:${s.mainnet ? 1 : 0}`;
}
const FP_LABELS = { google: 'Google sign-in', password: 'email password', passkeys: 'passkeys', wallet: 'verified wallet', mainnet: 'real-money sending' };
const parseFp = fp => Object.fromEntries(String(fp || '').split('|').map(p => p.split(':')).filter(p => p.length === 2 && FP_LABELS[p[0]] && /^\d{1,2}$/.test(p[1])).map(([k, v]) => [k, Number(v)]));
function fpChanges(before, after) {
  const a = parseFp(before), b = parseFp(after), out = [];
  for (const k of Object.keys(FP_LABELS)) {
    if (!(k in a) || !(k in b) || a[k] === b[k]) continue;
    if (k === 'passkeys') out.push(`passkeys ${a[k]} → ${b[k]}`);
    else if (k === 'mainnet') out.push(`real-money sending turned ${b[k] ? 'on' : 'off'}`);
    else out.push(`${FP_LABELS[k]} ${b[k] ? 'added' : 'removed'}`);
  }
  return out;
}

const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
export function cleanEmergency(raw, today) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const savedOn = isDate(raw.savedOn) && raw.savedOn >= '2024-01-01' && (!today || raw.savedOn <= today) ? raw.savedOn : '';
  const fp = typeof raw.fp === 'string' && Object.keys(parseFp(raw.fp)).length === 5 ? raw.fp : '';
  return savedOn && fp ? { savedOn, fp } : {};
}
export const recordSheet = (s, today) => ({ savedOn: today, fp: fingerprint(s) });

// Is the saved sheet still right? never / changed / old / current.
export function sheetFreshness(saved, s, today) {
  const clean = cleanEmergency(saved, today);
  if (!clean.savedOn) return { state: 'never', text: 'Not saved yet. Copy or download the emergency sheet and keep a printed copy with your offline backup codes.' };
  const changes = fpChanges(clean.fp, fingerprint(s));
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${clean.savedOn}T00:00:00Z`)) / DAY);
  if (changes.length) return { state: 'changed', days, changes, text: `Out of date: since you saved it on ${clean.savedOn}, ${changes.join(', ')}. Save a new copy and replace the printed one.` };
  if (days > SHEET_STALE_DAYS) return { state: 'old', days, text: `Saved ${days} days ago (${clean.savedOn}). Read it again and save a fresh copy at least every ${SHEET_STALE_DAYS} days.` };
  return { state: 'current', days, text: `Up to date: saved ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`} (${clean.savedOn}).` };
}

export function planHeadline(plan) {
  if (plan.ready === plan.total) return `Ready for all ${plan.total} situations.`;
  return `Ready for ${plan.ready} of ${plan.total} situations · ${plan.gaps.length} to prepare: ${plan.gaps.map(g => SHORT[g.id]).join(', ')}.`;
}
export const SHORT = { device: 'lost device', google: 'Google account', signin: 'strange sign-in', wallet: 'wallet or phrase', phishing: 'unexpected approval', locked: 'locked out' };

// The emergency sheet: Markdown to print or keep offline. Fixed words, counts and public links only.
export function sheetMarkdown(plan, today) {
  const s = plan.state, lines = [
    '# FYNX emergency sheet', '',
    `Saved ${today}. Keep a printed copy with your offline backup codes. Never write a recovery phrase, password or code on this sheet.`, '',
    `- Ways into the owner workspace: ${waysText(s)}`,
    `- Wallet ownership verified: ${s.wallet ? 'yes' : 'no'}`,
    `- Real-money sending when saved: ${s.mainnet ? 'ON' : 'off'}`,
    `- Prepared for ${plan.ready} of ${plan.total} situations`, '',
  ];
  for (const sc of plan.scenarios) {
    lines.push(`## ${sc.title}`, '', `When: ${sc.signs}`, '');
    sc.steps.forEach((step, i) => {
      lines.push(`${i + 1}. ${step.text}`);
      for (const [label, href] of step.links) lines.push(`   - ${label}: ${href}`);
    });
    lines.push('', `${sc.ready.ok ? 'Prepared' : 'Not prepared yet'}: ${sc.ready.text}`, '');
  }
  lines.push('## What FYNX can and cannot do', '',
    '- FYNX never holds your keys and cannot move, freeze or recover funds in your wallet.',
    '- FYNX sign-ins live only in an open page and end after 15 minutes without activity.',
    '- Disabling the owner user in Firebase ends every FYNX sign-in at once.',
    '- No one from FYNX will ever ask for a recovery phrase, password or code.', '');
  return lines.join('\n');
}
