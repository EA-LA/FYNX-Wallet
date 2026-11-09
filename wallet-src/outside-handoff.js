// Hand-off lists for the outside parties in the launch checklist (lawyer, payment provider,
// independent security reviewer, market-data provider). Each list says which checklist steps the
// party owns, which of them can be asked for now and which still wait (and on what), the questions
// the party needs to answer, what to send them and what to ask them to send back as evidence.
// Built from the checklist text, its results and the owner's decision answers only: notes never
// travel. Questions are questions, not legal, security or provider advice or conclusions.
import { stepKey, stepIndex, stepState, waitingOn, shortStep, byLabels } from './launch-tracker.js';

const REPO = 'https://github.com/EA-LA/FYNX-Wallet/blob/main';
const doc = (title, path) => ({ title, url: path.startsWith('http') ? path : `${REPO}/${path}` });

// `who` names the owner decision that records the party (if there is one) and its name/status fields.
export const PARTIES = [
  {
    id: 'counsel', name: 'Lawyer (U.S. counsel)', short: 'lawyer',
    who: { key: 'legal/counsel', name: 'firm', status: 'status', done: ['engaged'], labels: { shortlist: 'comparing firms', call: 'first call booked', engaged: 'engaged' } },
    intro: 'Qualified U.S. counsel experienced with crypto and payments. For the first call, also use the “Questions for your lawyer” sheet in the decision worksheet: it is filled with your answers.',
    steps: {
      'legal/analysis': {
        questions: [
          'Please give us a written conclusion on whether FYNX needs federal (FinCEN) registration or state money-transmitter licences for the model described, and in which states.',
          'Which anti-money-laundering, sanctions-screening, age and eligibility checks must FYNX run itself, and which can rely on the payment provider?',
          'Which privacy and complaint-handling duties apply to the waitlist and to future customers, and what must change before launch?',
          'Is anything in the current product or website wording a problem we should fix before a pilot?',
        ],
        back: 'A written memo or email with the conclusions (licences, AML/sanctions, eligibility, privacy, complaints) and anything FYNX must do first.',
      },
      'legal/terms': {
        questions: [
          'Please draft or review the customer terms, the privacy notice and the risk disclosures (irreversible transfers, network fees, failed transactions, price changes, third-party providers).',
          'Does the current public privacy notice need changes before we email the waitlist at launch?',
        ],
        back: 'Final approved versions of the terms, privacy notice and risk disclosures, with the date approved.',
      },
      'international/country-review': {
        questions: [
          'What is allowed for FYNX in the first country after the U.S., what registrations would be needed there, and should we involve local counsel?',
        ],
        back: 'A short written answer for that country (allowed / not allowed / conditions), to be matched with the payment provider’s answer.',
      },
    },
    send: [
      doc('Legal and operating review brief', 'docs/LEGAL-OPERATING-REVIEW.md'),
      doc('Launch readiness overview', 'docs/LAUNCH-READINESS.md'),
      doc('Operating procedure', 'docs/OPERATIONS.md'),
      doc('Public privacy notice', 'https://ea-la.github.io/FYNX-Wallet/#privacy'),
    ],
  },
  {
    id: 'provider', name: 'Payment provider (Transak)', short: 'payment provider',
    prior: 'fiat/partner',
    intro: 'Transak handles card and bank purchases and its own identity checks. FYNX never collects card or bank details. The sandbox (test) connection is built and switched off until the staging key is added.',
    steps: {
      'fiat/allowlist': {
        questions: [
          'Please allowlist our backend’s fixed outbound IP address for the staging (test) environment. Which address format and how many addresses do you accept?',
          'Is there an approved alternative to IP allowlisting for server-to-server calls from Google Cloud Functions?',
        ],
        back: 'Confirmation that the address is allowlisted for staging (with the date), so the sandbox test can run.',
      },
      'fiat/approval': {
        questions: [
          'What do you need from us for business approval and a production contract (company documents, licences, compliance questionnaire)?',
          'Which U.S. states, products (buy, sell) and assets (ETH, USDC on Base) can you support for us at launch?',
          'How do signed webhooks, refunds, chargebacks and settlement reports work in production, and which events must we handle?',
          'What fees will customers see, and what must our app disclose before checkout?',
          'Which identity, sanctions and age checks do you run, and which stay with FYNX?',
        ],
        back: 'The signed production agreement, the approved states/products/assets list, the webhook and reconciliation documents, and the fee schedule.',
      },
      'international/country-review': {
        questions: [
          'Do you support customers in our first country after the U.S., and with which payment methods and assets?',
        ],
        back: 'A written yes/no per payment method and asset for that country.',
      },
    },
    send: [
      doc('Provider setup (what is built and what is left)', 'docs/PROVIDER-SETUP.md'),
      doc('Launch readiness overview', 'docs/LAUNCH-READINESS.md'),
    ],
  },
  {
    id: 'reviewer', name: 'Independent security reviewer', short: 'security reviewer',
    who: { key: 'production-security/auditor', name: 'reviewer', status: 'status', done: ['hired'], labels: { shortlist: 'comparing reviewers', quote: 'quote requested', hired: 'hired' } },
    intro: 'An outside firm that reviews sign-in, signing and the swap contracts before real money is involved.',
    steps: {
      'production-security/audit': {
        questions: [
          'Please review owner sign-in (Google, email, passkeys), App Check, replay protection, the single-use transfer review and the backend’s owner-only authorization.',
          'Please review how the app builds and asks the wallet to sign transfers and swaps, including the limits and the Base mainnet read-only switch.',
          'Please list every finding with a severity, then retest our fixes and confirm which findings are closed.',
        ],
        back: 'The final report with findings and severities, and a retest letter confirming the fixes.',
      },
      'swaps/review': {
        questions: [
          'Please confirm the pinned Uniswap v3 contract addresses on each network and check our quote, slippage, price-impact, expiry and minimum-received protections.',
          'Please check how approvals are requested and revoked (exact amounts only) and how any FYNX fee would be handled.',
        ],
        back: 'Findings on the swap path (contracts, pricing risks, approvals, fees) with fixes retested.',
      },
      'wallet-recovery/embedded-review': {
        onlyIf: { key: 'wallet-recovery/decide', field: 'model', not: 'connect', reason: 'Not needed: you decided customers connect their own wallet.' },
        questions: [
          'If FYNX creates wallets: please review key generation, encrypted storage, backup, export and recovery designs before any of it is built.',
        ],
        back: 'A design review with findings, before engineering starts building wallet creation.',
      },
    },
    send: [
      doc('Threat model', 'FYNX-Wallet-threat-model.md'),
      doc('Launch readiness overview', 'docs/LAUNCH-READINESS.md'),
      doc('Owner tools verification', 'docs/OWNER-TOOLS-VERIFICATION.md'),
      doc('Crypto tools verification', 'docs/CRYPTO-TOOLS-VERIFICATION.md'),
      doc('Release process', 'docs/RELEASE-PROCESS.md'),
    ],
  },
  {
    id: 'data', name: 'Market-data provider', short: 'market-data provider',
    intro: 'The workspace reads ETH and USDC prices from CoinGecko with a key you add (see the services guide). A free Demo key is for testing; showing prices to customers needs a plan whose licence allows it.',
    steps: {
      'assets/prices': {
        questions: [
          'Does your plan’s licence allow showing prices and portfolio values to our customers inside a consumer app, and what attribution must we show?',
          'What request limits, update frequency and uptime commitment come with that plan?',
          'Which plan and price fit a pilot, and what changes when we grow?',
        ],
        back: 'The plan name and licence terms that allow customer display, plus the attribution wording.',
      },
    },
    send: [
      doc('Services setup (prices and history)', 'docs/SERVICES-SETUP.md'),
    ],
  },
];

export const findParty = id => PARTIES.find(p => p.id === id) || null;

// Every outside step in the checklist should belong to at least one party (tests check this).
export function unassignedOutsideSteps(plan) {
  const owned = new Set(PARTIES.flatMap(p => Object.keys(p.steps)));
  const out = [];
  for (const gate of plan.items || []) for (const step of gate.steps || []) {
    const key = stepKey(gate.id, step.id);
    if (step.by === 'outside' && !owned.has(key)) out.push(key);
  }
  return out;
}

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const md = s => clean(s).replace(/([\\`*_[\]<>|])/g, '\\$1');

// Who the party is and where things stand, from the owner's decision answers.
export function partyContact(party, plan, records = {}, answers = {}, index = stepIndex(plan)) {
  if (party.who) {
    const a = answers[party.who.key] || {};
    const name = clean(a[party.who.name]);
    const status = a[party.who.status];
    const engaged = party.who.done.includes(status);
    return { name, engaged, known: Boolean(name), text: name ? `${name}${status ? ` (${party.who.labels[status] || status})` : ''}` : 'not chosen yet' };
  }
  if (party.prior) {
    const entry = index.get(party.prior);
    const done = entry ? stepState(entry.gate, entry.step, records) === 'done' : false;
    return { name: '', engaged: done, known: done, text: done ? 'partner account created' : 'partner account not created yet' };
  }
  return { name: '', engaged: false, known: false, text: 'plan not chosen yet' };
}

// Per party: each owned step with its state (done / not needed / ask now / waiting + on what).
export function partyStatus(plan, records = {}, answers = {}) {
  const index = stepIndex(plan);
  return PARTIES.map(party => {
    const rows = [];
    for (const [key, spec] of Object.entries(party.steps)) {
      const entry = index.get(key);
      if (!entry) continue;
      const { gate, step } = entry;
      let state;
      let on = [];
      const cond = spec.onlyIf;
      if (stepState(gate, step, records) === 'done') state = 'done';
      else if (cond && answers[cond.key]?.[cond.field] === cond.not) state = 'not-needed';
      else {
        on = waitingOn(plan, records, key, index);
        state = on.length ? 'waiting' : 'ready';
      }
      rows.push({ key, gate, step, spec, state, on });
    }
    const count = s => rows.filter(r => r.state === s).length;
    return {
      party, rows, contact: partyContact(party, plan, records, answers, index),
      open: count('ready') + count('waiting'), ready: count('ready'), waiting: count('waiting'), done: count('done'), notNeeded: count('not-needed'),
    };
  });
}

// One-line status for the party picker.
export function partyLine(s) {
  if (!s.open) return s.done || s.notNeeded ? 'Nothing open' : 'No steps';
  const parts = [];
  if (s.ready) parts.push(`${s.ready} to ask now`);
  if (s.waiting) parts.push(`${s.waiting} waiting`);
  return parts.join(', ');
}

const stateText = { ready: 'Ask now', waiting: 'Not yet', done: 'Done', 'not-needed': 'Not needed' };

// `sent` (optional): step key → { sent, answered } dates from the request tracker, so a list sent again
// says it is a reminder and when the request first went out.
export function outsideBrief(plan, records = {}, partyId, answers = {}, { date = new Date(), sent = {} } = {}) {
  const s = partyStatus(plan, records, answers).find(x => x.party.id === partyId);
  if (!s) return '';
  const { party, rows, contact } = s;
  const stamp = date.toISOString().slice(0, 16).replace('T', ' ');
  const L = [
    `# FYNX Wallet: hand-off for the ${party.short}`,
    '',
    `Made ${stamp} UTC from the Launch readiness checklist, the results recorded in this browser and your decision answers. Notes are not included. These are questions and requests, not legal, security or provider advice.`,
    '',
    `- Who: ${md(contact.text)}`,
    `- About: ${party.intro}`,
    `- Open requests: ${s.open} (${s.ready} can be asked now, ${s.waiting} waiting on another step first)${s.done ? `; ${s.done} done` : ''}${s.notNeeded ? `; ${s.notNeeded} not needed` : ''}.`,
  ];
  if (!contact.known && s.ready) L.push(`- First: ${party.who ? 'choose and record who this is in the decision worksheet' : party.prior ? 'create the partner account (Launch readiness)' : 'choose a provider and plan'}, then send this list.`);
  const ready = rows.filter(r => r.state === 'ready'), waiting = rows.filter(r => r.state === 'waiting');
  let n = 0;
  const block = r => {
    L.push('', `### ${shortStep(r.step)} (\`${r.key}\`)`, '', `Checklist step: ${clean(r.step.text)}`, '');
    const d = sent[r.key];
    if (d?.sent && d.answered) L.push(`Your answer of ${d.answered} is noted, thank you. These are the points still needed to close this step:`, '');
    else if (d?.sent) L.push(`Reminder: we first sent this request on ${d.sent}.`, '');
    for (const q of r.spec.questions) L.push(`${++n}. ${q}`);
    L.push('', `Please send back: ${r.spec.back}`);
  };
  L.push('', `## Ask now (${ready.length})`);
  if (!ready.length) L.push('', s.open ? 'Nothing can be asked yet: every open request waits on another step (below).' : 'Nothing open for this party.');
  for (const r of ready) block(r);
  if (waiting.length) {
    L.push('', `## Not yet: finish these first (${waiting.length})`, '');
    for (const r of waiting) {
      L.push(`- **${md(shortStep(r.step))}** (\`${r.key}\`) — waits for: ${r.on.map(b => `${md(shortStep(b.step))} [${byLabels[b.step.by] || b.step.by}]`).join('; ')}`);
    }
    L.push('', 'The questions for these requests appear under “Ask now” once the steps above are finished.');
  }
  const closed = rows.filter(r => r.state === 'done' || r.state === 'not-needed');
  if (closed.length) {
    L.push('', '## Already settled');
    for (const r of closed) L.push(`- ${md(shortStep(r.step))} (\`${r.key}\`): ${r.state === 'done' ? 'done' : md(r.spec.onlyIf.reason)}`);
  }
  if (s.open) {
    L.push('', '## Documents to send');
    for (const d of party.send) L.push(`- ${d.title}: ${d.url}`);
  }
  L.push('', 'When the evidence arrives, share it so the matching steps can be marked done in wallet-src/launch-checklist.json and recorded in docs/VERIFICATION.md. Never send passwords, API keys, recovery phrases or private keys to anyone.');
  return `${L.join('\n')}\n`;
}

export { stateText as handoffStateText };
