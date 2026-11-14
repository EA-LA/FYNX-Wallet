// Pilot support playbook: pure helpers for Launch readiness → "Pilot support playbook" and its tests.
// Ready answers for the questions and problems pilot customers are most likely to send, filled in with the
// owner's own support and pilot-limit decisions, plus a finder that suggests the right answer for a pasted
// customer message. Everything is read in this browser; nothing is sent, saved or uploaded.
// The rules follow docs/OPERATIONS.md ("Signing and recovery support") and docs/PILOT-ROLLBACK.md.
import { LangEn } from 'ethers';
import { CONTACT } from './waitlist-care.js';

export const MAX_MESSAGE = 5000;
const REPO = 'https://github.com/EA-LA/FYNX-Wallet/blob/main';
export const LINKS = Object.freeze({
  incident: `${REPO}/docs/OPERATIONS.md#incident-response`,
  rollback: `${REPO}/docs/PILOT-ROLLBACK.md#when-to-roll-back`,
  privacy: `${REPO}/docs/OPERATIONS.md#registrations-and-deletion-requests`,
  support: `${REPO}/docs/OPERATIONS.md#signing-and-recovery-support`,
});

export const URGENCY = Object.freeze({
  security: { label: 'Security', order: 0 },
  money: { label: 'Money', order: 1 },
  account: { label: 'Account', order: 2 },
  general: { label: 'Question', order: 3 },
});

// What support may ask a customer for, and what it must never ask for (OPERATIONS.md).
export const MAY_ASK = ['public wallet address', 'network', 'transaction ID (hash)', 'wallet app and version', 'the exact error text or a screenshot without the recovery phrase'];
export const NEVER_ASK = ['recovery phrase (seed words)', 'private key', 'passwords or sign-in codes', 'passkey details', 'remote control of their screen', 'a “verification” transfer'];

const REPLY_LABELS = { '1h': '1 hour', same: 'the same business day', '24h': '24 hours', '48h': '48 hours' };
const HOURS_LABELS = { business: 'business hours, Monday to Friday', extended: 'every day, daytime', always: 'around the clock for security problems' };
const SIGN_OFF = 'FYNX will never ask for your recovery phrase, private key, passwords or a test transfer. If anyone does, it is not us.';

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const money = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? `US$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : ''; };

// The owner's decisions that the playbook uses, with what is still missing.
export function supportContext(answers = {}) {
  const support = answers['pilot/support'] || {}, limits = answers['pilot/limits'] || {}, inbox = answers['operations/inbox'] || {};
  const ctx = {
    who: clean(support.who), reply: REPLY_LABELS[support.reply] || '', hours: HOURS_LABELS[support.hours] || '', always: support.hours === 'always',
    perTx: money(limits.perTx), perMonth: money(limits.perMonth), states: clean(limits.states),
    inbox: clean(inbox.primary), backup: clean(inbox.backup), contact: CONTACT,
  };
  ctx.missing = [];
  if (!ctx.who || !ctx.reply || !ctx.hours) ctx.missing.push({ key: 'pilot/support', title: 'Support during the pilot', why: 'who answers, how fast and when' });
  if (!ctx.perTx || !ctx.perMonth) ctx.missing.push({ key: 'pilot/limits', title: 'Pilot size and limits', why: 'the limits quoted in the over-limit answer' });
  if (!ctx.inbox || !ctx.backup) ctx.missing.push({ key: 'operations/inbox', title: 'Who reads the support inbox', why: 'who covers the inbox and the backup' });
  return ctx;
}

// How fast to answer a situation, from the owner's support decision.
export function replyTarget(situation, ctx) {
  if (situation.urgency === 'security') return ctx.always ? 'Answer first, within 1 hour, any time of day' : 'Answer first, within 1 hour during support hours; check the inbox outside them too';
  if (!ctx.reply) return 'Reply time not decided yet';
  return situation.urgency === 'money' ? `Answer right after security problems, within ${ctx.reply}` : `First reply within ${ctx.reply}`;
}

const askLine = 'Please reply with only: the network (for example Base), the transaction ID (it starts with 0x), and your public wallet address.';

export const SITUATIONS = [
  {
    id: 'secret-shared', urgency: 'security', title: 'Shared their recovery phrase or private key',
    words: ['recovery phrase', 'seed phrase', 'seed words', 'secret phrase', 'private key', '12 words', '24 words', 'mnemonic', 'my words', 'gave my phrase', 'typed my phrase', 'shared my phrase'],
    ask: [], check: [
      'Do not copy, forward or store the message. Delete it from the support inbox after you reply, and empty the trash.',
      'If they shared it with someone else, treat the wallet as lost: every coin in it can be taken at any moment.',
    ],
    actions: [{ kind: 'doc', link: 'incident', label: 'Open the incident procedure ↗' }],
    escalate: 'Record it as a security event (UTC time, no phrase). FYNX cannot freeze, reverse or recover anything on the network.',
    reply: () => [
      'Thank you for telling us quickly. Please do not send your recovery phrase or private key to anyone again, including us — we have deleted your message.',
      'Anyone who has seen those words can take everything in that wallet, so please treat it as no longer safe:',
      '1. In your wallet app, create a brand-new wallet with a new recovery phrase, and write the new words on paper only.',
      '2. Move your funds from the old wallet to the new wallet’s address straight away, starting with the largest amount.',
      '3. Stop using the old wallet.',
      'FYNX never holds your funds and cannot freeze or reverse transfers on the network, which is why moving them quickly matters.',
    ],
  },
  {
    id: 'impersonation', urgency: 'security', title: 'Someone pretending to be FYNX',
    words: ['support agent', 'contacted me', 'dm', 'direct message', 'telegram', 'whatsapp', 'discord', 'called me', 'phone call', 'remote access', 'anydesk', 'teamviewer', 'verify my wallet', 'validate my wallet', 'fynx support', 'is this you', 'is this real', 'scam', 'fake'],
    ask: ['where the message came from (app or website) and the sender’s name or address', 'whether they clicked a link, signed anything or shared any words'],
    check: [
      'FYNX support only writes from the FYNX support inbox and never starts a chat on social apps or by phone.',
      'If they signed something or shared words, switch to “Shared their recovery phrase” or “Unexpected approval”.',
    ],
    actions: [{ kind: 'doc', link: 'support', label: 'What support may ask for ↗' }],
    escalate: 'Two reports of the same fake account in a day: warn the whole pilot group with the same text.',
    reply: ctx => [
      'Thank you for checking with us. That was not FYNX.',
      `FYNX support only writes from ${ctx.contact} and never contacts you first on Telegram, WhatsApp, Discord or by phone. We also never ask for remote access to your screen.`,
      'Please do not reply to them, do not click their links and block the account. If you already signed something or shared any words, tell us now and we will walk you through the next steps.',
    ],
  },
  {
    id: 'unknown-outgoing', urgency: 'security', title: 'Money left the wallet and they did not send it',
    words: ['did not send', "didn't send", 'didnt send', 'not me', 'stolen', 'hacked', 'drained', 'missing funds', 'funds gone', 'money gone', 'balance is zero', 'empty wallet', 'unauthorized', 'unauthorised'],
    ask: ['the network and the transaction ID of the transfer they do not recognise', 'whether they recently approved an app, signed a message or shared their words'],
    check: [
      'Look the transaction up on the network. If the customer’s own wallet signed it, the wallet’s keys or an approval were misused: FYNX cannot reverse it.',
      'Reconcile the pilot: a transfer that FYNX did not start, or one above the pilot limit, is a rollback trigger.',
    ],
    actions: [{ kind: 'lookup', label: 'Open Track confirmation ↗' }, { kind: 'reconcile', label: 'Open Reconciliation ↗' }, { kind: 'mainnet', label: 'Open Real-money sending ↗' }, { kind: 'doc', link: 'rollback', label: 'When to roll back ↗' }],
    escalate: 'If you cannot explain it within 1 hour, turn off real-money sending and follow the rollback plan.',
    rollback: true,
    reply: () => [
      'We are sorry — we are looking into this now and treat it as urgent.',
      'To protect what is left: if you might have shared your recovery phrase, signed an unfamiliar request or approved an unfamiliar app, create a new wallet in your wallet app and move any remaining funds there now.',
      askLine,
      'FYNX never holds your funds and cannot reverse a transfer on the network, but we will check what happened and tell you what we find.',
    ],
  },
  {
    id: 'unexpected-approval', urgency: 'security', title: 'Signed or approved something they did not expect',
    words: ['approved', 'approval', 'signed something', 'signature request', 'permit', 'allowance', 'spending cap', 'unlimited', 'set approval', 'connected to a site', 'connected my wallet'],
    ask: ['the website or app they approved, and the network', 'the transaction ID if the approval was sent to the network'],
    check: [
      'An approval lets that app take the token later. The customer removes it in their own wallet app (many wallets list approvals) or on the block explorer’s token approval page, paying a small network fee.',
      'If funds already moved, switch to “Money left the wallet”.',
    ],
    actions: [{ kind: 'lookup', label: 'Open Track confirmation ↗' }],
    escalate: 'If the site used FYNX’s name or look, treat it like “Someone pretending to be FYNX” and warn the pilot group.',
    reply: () => [
      'Thank you for telling us. Please do not sign anything else from that site.',
      'If you approved an app to spend a token, remove that permission in your wallet app (look for “approvals” or “connected sites”) or on your network’s block explorer. It costs a small network fee. If you are unsure which one, send us the network and the transaction ID (it starts with 0x) and we will tell you what it allowed.',
      'If you shared your recovery phrase at any point, create a new wallet and move your funds there first.',
    ],
  },
  {
    id: 'pending', urgency: 'money', title: 'Transfer is pending or stuck',
    words: ['pending', 'stuck', 'not confirmed', 'unconfirmed', 'still processing', 'processing', 'waiting', 'taking long', 'hours ago', 'speed up', 'cancel transaction', 'nonce'],
    ask: ['the network and transaction ID', 'their public wallet address if there is no transaction ID'],
    check: [
      'Look the transaction up: confirmed, waiting, dropped or replaced by a sped-up version.',
      'No transaction ID? Check the wallet’s numbers: one waiting transaction holds up every later one.',
    ],
    actions: [{ kind: 'lookup', label: 'Open Track confirmation ↗' }, { kind: 'queue', label: 'Check the wallet’s numbers ↗' }],
    escalate: 'Many pilot users stuck at once points to a network or provider problem: check Your services.',
    reply: () => [
      'Thanks for reaching out. Most transfers confirm within a few minutes; a busy network or a low fee can make one wait longer.',
      askLine,
      'Please do not send the same transfer again while the first one is waiting, or it may go through twice. If your wallet offers “Speed up”, that is safe to use.',
    ],
  },
  {
    id: 'not-arrived', urgency: 'money', title: 'Sent, but the recipient does not see it',
    words: ['not received', 'not arrived', "hasn't arrived", 'has not arrived', 'did not arrive', "didn't arrive", 'never arrived', 'not showing', "don't see", 'do not see', 'cannot see', "can't see", 'where is my', 'missing transfer'],
    ask: ['the network and the transaction ID', 'which network and token the recipient is looking at'],
    check: [
      'If the transaction is confirmed, compare the recipient address and network with what the recipient expected.',
      'A token can arrive but not show until the recipient adds it (USDC) in their wallet app, on the same network.',
    ],
    actions: [{ kind: 'lookup', label: 'Open Track confirmation ↗' }],
    escalate: 'Same complaint from two pilot users within a day is a rollback trigger.',
    rollback: true,
    reply: () => [
      'Thanks for letting us know. A confirmed transfer is final on the network, so the usual reasons are: the recipient is looking at a different network (for example Ethereum instead of Base), the token is not added in their wallet app yet, or the transfer is still waiting.',
      askLine,
      'We will check where it went and get back to you.',
    ],
  },
  {
    id: 'wrong-address', urgency: 'money', title: 'Sent to the wrong address or network',
    words: ['wrong address', 'wrong network', 'wrong chain', 'mistake', 'by mistake', 'sent to wrong', 'typo', 'reverse', 'refund', 'undo', 'get it back', 'recover my'],
    ask: ['the network and the transaction ID'],
    check: [
      'Confirm the transaction and the address it went to. If the address belongs to an exchange or a service, only that service can help.',
      'Never offer a “recovery” service and warn about people who do: it is a common scam after a mistake.',
    ],
    actions: [{ kind: 'lookup', label: 'Open Track confirmation ↗' }],
    escalate: 'If the wrong address came from a look-alike in their history, add it to the pilot warning about address poisoning.',
    reply: () => [
      'We are sorry this happened. Confirmed transfers on the network cannot be reversed by FYNX or anyone else.',
      'If the address belongs to an exchange or another company, contact their support with the transaction ID — they are the only ones who may be able to help. If it is a personal wallet, only its owner can send it back.',
      'Please be careful: people who offer to “recover” crypto for a fee are almost always scammers. Before your next transfer, copy the address from the recipient again and compare the first and last characters.',
    ],
  },
  {
    id: 'wrong-amount', urgency: 'money', title: 'Balance or amount looks wrong',
    words: ['wrong amount', 'wrong balance', 'balance wrong', 'less than', 'more than', 'amount is wrong', 'incorrect balance', 'shows zero', 'shows 0', 'different amount', 'fee too high', 'missing money'],
    ask: ['the network and transaction ID, or their public wallet address', 'the amount they expected and the amount they see'],
    check: [
      'Network fees are paid in ETH, so the ETH balance drops a little with every transfer; USDC amounts must match exactly.',
      'Reconcile the pilot transfers: a USDC difference that you cannot explain is a rollback trigger.',
    ],
    actions: [{ kind: 'reconcile', label: 'Open Reconciliation ↗' }, { kind: 'doc', link: 'rollback', label: 'When to roll back ↗' }],
    escalate: 'Same complaint from two pilot users within a day, or a USDC mismatch: turn off real-money sending and follow the rollback plan.',
    rollback: true,
    reply: () => [
      'Thanks for flagging this — we take any difference seriously.',
      'Each transfer also costs a small network fee paid in ETH, so the ETH balance goes down a little more than the amount sent. USDC amounts should always match exactly.',
      'Please reply with the network, your public wallet address, the amount you expected and the amount you see, and the transaction ID if there is one. We will check it against the network and come back to you.',
    ],
  },
  {
    id: 'over-limit', urgency: 'money', title: 'Transfer refused or above the pilot limit',
    words: ['limit', 'too much', 'too large', 'maximum', 'max amount', 'refused', 'rejected', 'blocked', 'not allowed', 'disabled', 'cannot send', "can't send", 'send button'],
    ask: ['the amount and token they tried to send', 'the exact message the page showed'],
    check: [
      'Compare the amount with the pilot limits and the real-money sending limits in Crypto tools.',
      'If sending is turned off on purpose (rollback or maintenance), say so plainly with the next update time.',
    ],
    actions: [{ kind: 'mainnet', label: 'Open Real-money sending ↗' }],
    escalate: 'A transfer above the limit that went through anyway is a rollback trigger.',
    reply: ctx => [
      'Thanks for trying FYNX during the pilot. To keep everyone safe while we test, transfers have limits' + (ctx.perTx ? `: up to ${ctx.perTx} per transfer${ctx.perMonth ? ` and ${ctx.perMonth} per person per month` : ''}.` : '.'),
      'Please try a smaller amount. If the page said sending is paused, that is on purpose and your funds stay safely in your own wallet; we will tell you as soon as it is back.',
      'If you saw a different message, reply with the exact text and we will look into it.',
    ],
  },
  {
    id: 'sign-in', urgency: 'account', title: 'Cannot sign in or lost a device',
    words: ['sign in', 'signin', 'log in', 'login', 'locked out', 'password', 'passkey', 'lost my phone', 'new phone', 'lost phone', 'reset', 'two-factor', '2fa', 'verification code', 'account access'],
    ask: ['which way they sign in (Google, email and password, or a passkey)', 'the exact error text'],
    check: [
      'Never ask for a password or code, and never sign in for them.',
      'Their wallet and funds do not depend on the FYNX sign-in: they stay in their own wallet app.',
    ],
    actions: [],
    escalate: 'A sign-in from a device they do not know is a security event: follow the incident procedure.',
    reply: () => [
      'Sorry you are having trouble signing in. Your wallet and funds are not affected: they stay in your own wallet app.',
      'If you use email and password, use “Set or reset an email password” on the sign-in page. If you lost the device that held your passkey, sign in another way you set up and remove that passkey.',
      'Please never send us your password, a sign-in code or your recovery phrase. Reply with the way you sign in and the exact error message, and we will help.',
    ],
  },
  {
    id: 'fees', urgency: 'general', title: 'Why did I pay a network fee?',
    words: ['gas', 'fee', 'fees', 'network fee', 'charged', 'cost', 'why did i pay', 'expensive'],
    ask: ['the network and transaction ID if they want a specific fee explained'],
    check: ['The fee goes to the network, not to FYNX. It changes with how busy the network is.'],
    actions: [{ kind: 'lookup', label: 'Open Track confirmation ↗' }],
    escalate: '',
    reply: () => [
      'Good question. Every transfer on a blockchain network pays a small fee to the network itself, in ETH — it does not go to FYNX. The fee depends on how busy the network is at that moment, and your wallet shows it before you approve.',
      'If a fee looked unusually high, send us the network and the transaction ID (it starts with 0x) and we will explain it.',
    ],
  },
  {
    id: 'privacy', urgency: 'general', title: 'Wants their data or to be removed',
    words: ['delete my', 'remove me', 'unsubscribe', 'my data', 'personal data', 'privacy', 'gdpr', 'ccpa', 'stop emailing', 'do not contact', 'what do you have'],
    ask: ['nothing extra: answer from the address the request came from'],
    check: ['Log it in the Waitlist privacy request log the same day; it shows the due date.', 'Do not ask for identity documents, keys or signatures.'],
    actions: [{ kind: 'privacy', label: 'Open Privacy requests ↗' }, { kind: 'doc', link: 'privacy', label: 'Privacy procedure ↗' }],
    escalate: '',
    reply: () => [
      'Thank you for your message. We have logged your request and will answer it in full as soon as possible, and within 30 days.',
      'FYNX never holds your wallet keys or funds, so this covers only what you shared with us (such as your email address and sign-up details). Information written to a public blockchain cannot be removed by anyone.',
    ],
  },
  {
    id: 'availability', urgency: 'general', title: 'When will FYNX open to everyone?',
    words: ['when', 'launch', 'available', 'release', 'waitlist', 'invite', 'access', 'open to everyone', 'other countries', 'my country', 'android', 'iphone app', 'app store'],
    ask: [],
    check: ['Do not promise a date, a country or a feature that is not approved.'],
    actions: [],
    escalate: '',
    reply: ctx => [
      'Thank you for your interest in FYNX. We are running a small, limited pilot' + (ctx.states ? ` (currently ${ctx.states})` : '') + ' and will open to more people step by step once it meets our safety checks.',
      'We have not announced a public date yet. People on the waitlist hear first — we will email you as soon as there is news.',
    ],
  },
];

export const findSituation = id => SITUATIONS.find(s => s.id === id) || null;

// The full reply text for one situation, with the owner's decisions filled in.
export function replyText(situation, ctx) {
  const hours = ctx.hours ? ` We answer ${ctx.hours}${ctx.reply ? ` and reply within ${ctx.reply}` : ''}.` : '';
  return ['Hello,', '', ...situation.reply(ctx).flatMap((p, i, all) => (i < all.length - 1 ? [p, ''] : [p])), '', `${SIGN_OFF}${hours}`, '', 'FYNX support', ctx.contact].join('\n');
}

// A recovery phrase is 12 to 24 words from the standard (BIP-39) English list in a row; a private key is 64 hex
// characters. A 0x-prefixed 64-hex value is usually a transaction ID, so it only counts next to the word "key".
let bip39 = null;
const isBip39 = w => { bip39 ||= LangEn.wordlist(); return bip39.getWordIndex(w) >= 0; };
export function looksLikeSecret(raw) {
  const text = String(raw ?? '');
  let run = 0, best = 0;
  for (const w of text.toLowerCase().split(/[^a-z]+/)) { if (!w) continue; run = isBip39(w) ? run + 1 : 0; best = Math.max(best, run); }
  if (best >= 12) return true;
  if (/(^|[^0-9a-fx])[0-9a-f]{64}([^0-9a-f]|$)/i.test(text)) return true;
  if (/private\s*key|secret\s*key/i.test(text) && /0x[0-9a-f]{64}/i.test(text)) return true;
  return /\b(xprv|xpriv)[1-9A-HJ-NP-Za-km-z]{20,}/.test(text) || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text);
}

const HASH = /\b0x[0-9a-fA-F]{64}\b/g, ADDRESS = /\b0x[0-9a-fA-F]{40}\b/g;
const normal = s => ` ${String(s).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ')} `;

// Suggest the right answers for a pasted customer message. Reads the text only; never stores it.
export function matchMessage(raw) {
  const text = String(raw ?? '').slice(0, MAX_MESSAGE);
  const empty = { matches: [], secret: false, hashes: [], addresses: [], empty: true };
  if (!text.trim()) return empty;
  const hashes = [...new Set(text.match(HASH) || [])].map(h => h.toLowerCase());
  const addresses = [...new Set((text.replace(HASH, ' ').match(ADDRESS) || []).map(a => a.toLowerCase()))];
  const secret = looksLikeSecret(text);
  const hay = normal(text), scores = new Map();
  for (const s of SITUATIONS) {
    let score = 0;
    for (const w of s.words) if (hay.includes(normal(w))) score += w.includes(' ') ? 2 : 1;
    if (score) scores.set(s.id, score);
  }
  if (secret) scores.set('secret-shared', 100);
  if (hashes.length && !scores.size) scores.set('pending', 1);
  const matches = [...scores.entries()]
    .map(([id, score]) => ({ situation: findSituation(id), score }))
    .sort((a, b) => b.score - a.score || URGENCY[a.situation.urgency].order - URGENCY[b.situation.urgency].order)
    .slice(0, 3);
  return { matches, secret, hashes, addresses, empty: false };
}

const md = s => String(s).replace(/\s+/g, ' ').replace(/([\\`*_[\]<>|])/g, '\\$1').trim();

// The whole playbook as a Markdown document for the support person (no customer data).
export function playbookMarkdown(ctx, { date = new Date() } = {}) {
  const tbd = '_not decided yet_';
  const lines = [
    '# FYNX pilot support playbook', '',
    `Prepared ${date.toISOString().slice(0, 10)} in the owner workspace. Ready answers for pilot customers; check every answer before you send it from ${ctx.contact}.`, '',
    '## Who answers', '',
    `- Answers pilot customers: ${ctx.who ? md(ctx.who) : tbd}`,
    `- Support hours: ${ctx.hours ? md(ctx.hours) : tbd}`,
    `- First reply within: ${ctx.reply ? md(ctx.reply) : tbd} (security problems: within 1 hour, before anything else)`,
    `- Support inbox: ${ctx.inbox ? md(ctx.inbox) : tbd}, backup ${ctx.backup ? md(ctx.backup) : tbd}`,
    `- Pilot limits: ${ctx.perTx ? `${ctx.perTx} per transfer` : tbd}${ctx.perMonth ? `, ${ctx.perMonth} per person per month` : ''}${ctx.states ? `, in ${md(ctx.states)}` : ''}`,
  ];
  if (ctx.missing.length) lines.push('', `Still to decide in Launch readiness → Decisions only you can make: ${ctx.missing.map(m => m.title).join('; ')}.`);
  lines.push('', '## Rules for every reply', '',
    `- You may ask for: ${MAY_ASK.join('; ')}.`,
    `- Never ask for: ${NEVER_ASK.join('; ')}.`,
    '- FYNX never holds customer funds and cannot reverse, freeze or recover a transfer on the network. Never suggest otherwise.',
    '- Do not promise a cause, a date or a refund you do not have.',
    '- If a message contains a recovery phrase or private key, do not copy or forward it; delete it after replying.',
    '', '## Order of work', '',
    '1. Security (answer within 1 hour): shared phrase, someone pretending to be FYNX, money left the wallet, unexpected approval.',
    '2. Money: stuck, not arrived, wrong address, wrong amount, over the limit.',
    '3. Account and questions.', '',
    `Turn off real-money sending and follow the rollback plan (${LINKS.rollback}) when a transfer cannot be explained within 1 hour, or the same complaint comes from two pilot users within a day.`, '');
  for (const s of [...SITUATIONS].sort((a, b) => URGENCY[a.urgency].order - URGENCY[b.urgency].order)) {
    lines.push(`## ${URGENCY[s.urgency].label}: ${s.title}`, '', `Reply time: ${replyTarget(s, ctx)}.`, '');
    if (s.ask.length) lines.push(`Ask for: ${s.ask.join('; ')}.`, '');
    lines.push('Check:', '', ...s.check.map(c => `- ${c}`), '');
    if (s.escalate) lines.push(`${s.rollback ? 'Rollback trigger' : 'Escalate'}: ${s.escalate}`, '');
    lines.push('Reply:', '', ...replyText(s, ctx).split('\n').map(l => (l ? `> ${l}` : '>')), '');
  }
  lines.push(`Incident procedure: ${LINKS.incident}`, `Support rules: ${LINKS.support}`);
  return lines.join('\n') + '\n';
}
