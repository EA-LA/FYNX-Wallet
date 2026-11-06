// Owner decisions worksheet: pure helpers shared by the Launch readiness tab and tests.
// Answers stay in this browser only (localStorage). A completed decision is recorded as a "Passed" result
// with a short note on the matching launch step, so it appears in the owner's test report.
import { looksSecret, stepKey, stepState } from './launch-tracker.js';

export const DECISIONS_KEY = 'fynx-owner-decisions-v1';
const MAX_TEXT = 80;
const NOTE_MAX = 280;
export const CURRENT_PROJECT = 'fynx-c7a28';

export const US_STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'];

const opt = (value, label, hint = '') => ({ value, label, hint });

// Each decision maps to exactly one owner ("you") step in launch-checklist.json.
// `doneWhen` names a choice field whose listed values are required before the step counts as decided.
export const DECISIONS = [
  {
    gate: 'wallet-recovery', step: 'decide', title: 'How customers get a wallet',
    why: 'This decides how much security review is needed before launch. Connecting an existing wallet is what is built and tested today.',
    fields: [
      { id: 'model', type: 'choice', label: 'For launch', required: true, options: [
        opt('connect', 'Customers connect their own wallet (for example MetaMask or a Ledger)', 'Matches what is built. FYNX never sees recovery words or keys. The independent review of wallet creation is then not needed.'),
        opt('create', 'FYNX must create wallets inside the app', 'Needs an independent review of key generation, encrypted storage, backup, export and recovery before any of it is built. Expect this to add months.'),
      ] },
    ],
    unlocks: { connect: 'Engineering keeps the external-wallet design; the wallet-creation review is not needed.', create: 'Engineering scopes wallet creation and you choose a reviewer for it before any build.' },
  },
  {
    gate: 'production-security', step: 'domain', title: 'Production web address and project',
    why: 'Real customers should use their own address and a Firebase project that holds nothing else, so a problem in another app cannot reach the wallet.',
    fields: [
      { id: 'address', type: 'text', label: 'Web address for the wallet', placeholder: 'for example wallet.yourdomain.com', required: true },
      { id: 'project', type: 'text', label: 'Name for the new Firebase project', placeholder: 'for example fynx-wallet-prod', required: true, hint: `Must be a new project, not the shared ${CURRENT_PROJECT}.` },
    ],
  },
  {
    gate: 'production-security', step: 'auditor', title: 'Independent security reviewer',
    why: 'An outside reviewer checks signing and sign-in before real money is involved. Only “hired” counts as done.',
    fields: [
      { id: 'reviewer', type: 'text', label: 'Reviewer or firm', placeholder: 'Company name', required: true },
      { id: 'status', type: 'choice', label: 'Where it stands', required: true, options: [opt('shortlist', 'Comparing reviewers'), opt('quote', 'Quote requested'), opt('hired', 'Hired, contract signed')] },
      { id: 'date', type: 'date', label: 'Date hired (optional)' },
    ],
    doneWhen: { field: 'status', values: ['hired'] },
  },
  {
    gate: 'operations', step: 'inbox', title: 'Who reads the support inbox',
    why: 'Deletion requests, security reports and provider emails arrive at fynxteam5@gmail.com. Someone must read it, with a backup for holidays and sick days.',
    fields: [
      { id: 'primary', type: 'text', label: 'Reads it every day (name or role)', placeholder: 'for example Elham', required: true },
      { id: 'backup', type: 'text', label: 'Backup person (name or role)', placeholder: 'for example co-founder', required: true },
      { id: 'cadence', type: 'choice', label: 'How often', required: true, options: [opt('daily', 'Every day, weekends included'), opt('weekdays', 'Every business day')] },
    ],
    check: a => a.primary && a.backup && a.primary.toLowerCase() === a.backup.toLowerCase() ? 'The backup should be a different person.' : '',
  },
  {
    gate: 'operations', step: 'alert-dest', title: 'Where alerts go',
    why: 'Google Cloud can warn you about errors, sign-in failures and unusual billing. An alert only helps if it reaches someone who will see it quickly.',
    fields: [
      { id: 'channel', type: 'choice', label: 'Send alerts by', required: true, options: [
        opt('email', 'Email only', 'Easy, but slow to notice at night.'),
        opt('sms', 'Text message (SMS) to a phone'),
        opt('app', 'Google Cloud mobile app notification'),
        opt('email-sms', 'Email and text message', 'Recommended: one record you can search, one that wakes you up.'),
      ] },
      { id: 'who', type: 'text', label: 'Who receives them (name or role)', placeholder: 'for example owner + backup person', required: true },
    ],
    unlocks: { any: 'Engineering sets up the alerts in Google Cloud and sends you a test alert.' },
  },
  {
    gate: 'operations', step: 'backup', title: 'Backups and recovery time',
    why: 'Two promises to decide: how much recent data you could afford to lose, and how long the service may be down after an outage. Shorter means more cost and work.',
    fields: [
      { id: 'keep', type: 'choice', label: 'Keep backups for', required: true, options: [opt('7d', '7 days'), opt('30d', '30 days'), opt('90d', '90 days'), opt('1y', '1 year')] },
      { id: 'loss', type: 'choice', label: 'Most recent data you could lose', required: true, options: [opt('minutes', 'A few minutes'), opt('1d', 'Up to one day'), opt('1w', 'Up to one week')] },
      { id: 'restore', type: 'choice', label: 'Back online within', required: true, options: [opt('4h', '4 hours'), opt('1bd', 'One business day'), opt('3d', 'Three days')] },
    ],
    unlocks: { any: 'Engineering matches the backup settings to these answers, then restores a backup into a separate test project to prove it works.' },
  },
  {
    gate: 'legal', step: 'entity', title: 'Company details',
    why: 'Counsel, payment providers and app stores all ask for the exact registered company. Check it in the state’s official business registry, not from memory.',
    fields: [
      { id: 'state', type: 'select', label: 'State of incorporation', required: true, options: US_STATES.map(s => opt(s, s)) },
      { id: 'number', type: 'text', label: 'State file or registration number (optional)', placeholder: 'as shown in the registry' },
      { id: 'checked', type: 'choice', label: 'Checked in the official registry?', required: true, options: [opt('yes', 'Yes, the name and status match'), opt('no', 'Not yet')] },
    ],
    doneWhen: { field: 'checked', values: ['yes'] },
  },
  {
    gate: 'legal', step: 'model', title: 'Business model to show counsel',
    why: 'Lawyers advise on the exact model you describe. A change later (holding keys, adding fees, new countries) means asking them again.',
    fields: [
      { id: 'model', type: 'choice', label: 'The model', required: true, options: [
        opt('external', 'Confirmed: customers keep their own keys and a licensed provider handles card and bank payments'),
        opt('different', 'Different: describe it below', 'Engineering and counsel will need to review the change before launch.'),
      ] },
      { id: 'fees', type: 'choice', label: 'Will FYNX charge its own fee at launch?', required: true, options: [opt('none', 'No FYNX fee'), opt('swap', 'A fee on swaps'), opt('buy', 'A fee on buying or selling'), opt('both', 'Fees on both'), opt('unsure', 'Not decided yet')] },
      { id: 'details', type: 'text', label: 'Anything different (optional)', placeholder: 'short description' },
    ],
    check: a => a.model === 'different' && !a.details ? 'Describe what is different in one line.' : '',
  },
  {
    gate: 'legal', step: 'counsel', title: 'U.S. counsel',
    why: 'You need a lawyer experienced with crypto and payments. Use the “Questions for your lawyer” sheet below for the first call. Only “engaged” counts as done.',
    fields: [
      { id: 'firm', type: 'text', label: 'Law firm or lawyer', placeholder: 'Firm name', required: true },
      { id: 'status', type: 'choice', label: 'Where it stands', required: true, options: [opt('shortlist', 'Comparing firms'), opt('call', 'First call booked'), opt('engaged', 'Engaged, engagement letter signed')] },
      { id: 'date', type: 'date', label: 'Date engaged (optional)' },
    ],
    doneWhen: { field: 'status', values: ['engaged'] },
  },
  {
    gate: 'international', step: 'first-country', title: 'First country after the U.S.',
    why: 'Counsel and the payment provider then check what is allowed and supported there. Nothing opens until they confirm.',
    fields: [
      { id: 'country', type: 'text', label: 'Country', placeholder: 'for example Canada', required: true },
      { id: 'reason', type: 'choice', label: 'Main reason', required: true, options: [opt('demand', 'Most waitlist interest'), opt('provider', 'Payment provider already supports it'), opt('team', 'Team or company presence'), opt('other', 'Another reason')] },
    ],
  },
  {
    gate: 'pilot', step: 'limits', title: 'Pilot size and limits',
    why: 'A small, capped first group limits the damage if something goes wrong. Owner testing today is capped at 0.01 ETH or 25 USDC per transfer, on test networks only.',
    fields: [
      { id: 'people', type: 'number', label: 'Number of people', placeholder: 'for example 50', required: true, min: 1, max: 100000 },
      { id: 'states', type: 'text', label: 'Which states', placeholder: 'for example Texas, Florida', required: true },
      { id: 'perTx', type: 'number', label: 'Maximum per transaction (US$)', placeholder: 'for example 100', required: true, min: 1, max: 1000000 },
      { id: 'perMonth', type: 'number', label: 'Maximum per person per month (US$)', placeholder: 'for example 500', required: true, min: 1, max: 10000000 },
    ],
    check: a => Number(a.perTx) > Number(a.perMonth) ? 'The monthly limit should be at least the per-transaction limit.' : '',
  },
  {
    gate: 'pilot', step: 'support', title: 'Support during the pilot',
    why: 'Pilot customers will have questions and some will report problems. Decide who answers and how fast you promise to reply.',
    fields: [
      { id: 'who', type: 'text', label: 'Who answers (name or role)', placeholder: 'for example owner, backup: co-founder', required: true },
      { id: 'reply', type: 'choice', label: 'First reply within', required: true, options: [opt('1h', '1 hour'), opt('same', 'The same business day'), opt('24h', '24 hours'), opt('48h', '48 hours')] },
      { id: 'hours', type: 'choice', label: 'Support hours', required: true, options: [opt('business', 'Business hours, Monday to Friday'), opt('extended', 'Every day, daytime'), opt('always', 'Around the clock for security problems')] },
    ],
  },
];

export const decisionKey = d => stepKey(d.gate, d.step);
export const findDecision = key => DECISIONS.find(d => decisionKey(d) === key) || null;

const optionLabel = (field, value) => field.options?.find(o => o.value === value)?.label || '';

export function cleanValue(field, raw) {
  if (raw === undefined || raw === null) return '';
  const v = String(raw).replace(/\s+/g, ' ').trim();
  if (!v || looksSecret(v)) return '';
  if (field.type === 'choice' || field.type === 'select') return field.options.some(o => o.value === v) ? v : '';
  if (field.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : '';
  if (field.type === 'number') {
    if (!/^\d+(\.\d{1,2})?$/.test(v)) return '';
    const n = Number(v);
    return n >= (field.min ?? 0) && n <= (field.max ?? Infinity) ? String(n) : '';
  }
  return v.replace(/[<>]/g, '').slice(0, MAX_TEXT);
}

// Keep only known decisions and fields with valid values.
export function cleanAnswers(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const d of DECISIONS) {
    const src = raw[decisionKey(d)];
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    const clean = {};
    for (const f of d.fields) { const v = cleanValue(f, src[f.id]); if (v) clean[f.id] = v; }
    if (Object.keys(clean).length) out[decisionKey(d)] = clean;
  }
  return out;
}

// What still stops this decision from counting as made (empty list = ready to record).
export function problems(decision, answers = {}) {
  const out = [];
  for (const f of decision.fields) if (f.required && !answers[f.id]) out.push(`${f.label} is missing.`);
  if (decision.gate === 'production-security' && decision.step === 'domain' && answers.project && answers.project.toLowerCase() === CURRENT_PROJECT) out.push(`Choose a new project; ${CURRENT_PROJECT} is the shared test project.`);
  const extra = decision.check?.(answers); if (extra) out.push(extra);
  if (!out.length && decision.doneWhen && !decision.doneWhen.values.includes(answers[decision.doneWhen.field])) {
    const f = decision.fields.find(x => x.id === decision.doneWhen.field);
    out.push(`Saved as progress. It counts as done once “${f.label}” is “${optionLabel(f, decision.doneWhen.values[0])}”.`);
  }
  return out;
}
export const isReady = (decision, answers) => problems(decision, answers).length === 0;

export function answerText(decision, answers = {}) {
  const parts = [];
  for (const f of decision.fields) {
    const v = answers[f.id]; if (!v) continue;
    const shown = f.type === 'choice' || f.type === 'select' ? optionLabel(f, v) : f.type === 'number' && /US\$/.test(f.label) ? `US$${Number(v).toLocaleString('en-US')}` : v;
    parts.push(`${f.label.replace(/\s*\(.*?\)\s*$/, '').replace(/\?$/, '')}: ${shown}`);
  }
  return parts.join('; ');
}

// Short note stored on the launch step (fits the 280-character note limit).
export function decisionNote(decision, answers) {
  const text = `Decision: ${answerText(decision, answers)}`;
  return text.length <= NOTE_MAX ? text : `${text.slice(0, NOTE_MAX - 1)}…`;
}

export function decisionState(plan, decision, records, answers = {}) {
  const gate = plan.items.find(g => g.id === decision.gate), step = gate?.steps?.find(s => s.id === decision.step);
  if (!step) return 'missing';
  const s = stepState(gate, step, records);
  if (s === 'done') return 'decided';
  return Object.keys(answers[decisionKey(decision)] || {}).length ? 'draft' : 'open';
}

export function decisionsProgress(plan, records, answers = {}) {
  const states = DECISIONS.map(d => decisionState(plan, d, records, answers)).filter(s => s !== 'missing');
  return { total: states.length, decided: states.filter(s => s === 'decided').length, drafts: states.filter(s => s === 'draft').length };
}

const md = s => String(s).replace(/\s+/g, ' ').replace(/([\\`*_[\]<>|])/g, '\\$1').trim();
const day = d => d.toISOString().slice(0, 10);

export function decisionRecord(plan, records, answers, { date = new Date() } = {}) {
  const p = decisionsProgress(plan, records, answers);
  const lines = [`# ${plan.product} owner decisions`, '', `Date: ${day(date)}`, `Decided: ${p.decided} of ${p.total}.`, '', '| Decision | Answer | Status |', '| --- | --- | --- |'];
  for (const d of DECISIONS) {
    const state = decisionState(plan, d, records, answers); if (state === 'missing') continue;
    const a = answers[decisionKey(d)] || {}, rec = records[decisionKey(d)];
    const status = state === 'decided' ? `Decided${rec?.at ? ` ${day(new Date(rec.at))}` : ''}` : state === 'draft' ? 'In progress' : 'Open';
    lines.push(`| ${md(d.title)} | ${md(answerText(d, a) || '—')} | ${status} |`);
  }
  lines.push('', 'Recorded by the owner in the FYNX workspace. These are business decisions, not legal, security or provider approvals.');
  return lines.join('\n');
}

const pick = (answers, gate, step) => answers[stepKey(gate, step)] || {};
const label = (gate, step, field, value) => { const d = DECISIONS.find(x => x.gate === gate && x.step === step); return optionLabel(d.fields.find(f => f.id === field), value); };
const REPO = 'https://github.com/EA-LA/FYNX-Wallet/blob/main';

// A first-call sheet for U.S. counsel, filled with the owner's answers where they exist. Questions, not advice.
export function counselSheet(plan, answers = {}, { date = new Date() } = {}) {
  const entity = pick(answers, 'legal', 'entity'), model = pick(answers, 'legal', 'model'), wallet = pick(answers, 'wallet-recovery', 'decide');
  const country = pick(answers, 'international', 'first-country'), pilot = pick(answers, 'pilot', 'limits'), support = pick(answers, 'pilot', 'support');
  const tbd = 'to be confirmed';
  const states = pilot.states || 'the pilot states (to be decided)';
  const fees = model.fees ? label('legal', 'model', 'fees', model.fees) : 'not decided yet';
  const L = [
    `# Questions for our lawyer: ${plan.product}`, '', `Prepared ${day(date)} by FYNX finance world inc. for a first call with U.S. counsel experienced in crypto and payments. This is a list of questions, not legal advice or a conclusion.`, '',
    '## About us', '',
    `- Company: FYNX finance world inc., incorporated in ${md(entity.state || tbd)}${entity.number ? `, file number ${md(entity.number)}` : ''}${entity.checked === 'yes' ? ' (checked in the state registry)' : ''}.`,
    `- First market: the United States. Pilot: ${!pilot.people && !pilot.states ? 'size and states to be decided' : `${pilot.people ? `${md(pilot.people)} people` : 'size to be decided'} in ${md(pilot.states || 'states to be decided')}`}${pilot.perTx ? `, at most US$${Number(pilot.perTx).toLocaleString('en-US')} per transaction and US$${Number(pilot.perMonth || 0).toLocaleString('en-US')} per person per month` : ''}.`,
    `- Next country after the U.S.: ${md(country.country || tbd)}.`,
    `- Wallet model: ${wallet.model === 'create' ? 'FYNX would create wallets inside the app (not built yet).' : 'customers connect their own wallet; FYNX never receives recovery phrases or signing keys.'}`,
    `- Payments: ${model.model === 'different' ? `different model: ${md(model.details || tbd)}.` : 'card and bank purchases would go through a licensed payment provider; FYNX does not collect card or bank details.'} FYNX fee at launch: ${md(fees)}.`,
    `- Support during the pilot: ${support.who ? md(support.who) : tbd}${support.reply ? `, first reply within ${md(label('pilot', 'support', 'reply', support.reply)).toLowerCase()}` : ''}.`,
    '',
    '## What exists today', '',
    '- A public website with a free waitlist (email and consent only; entries expire after 365 days).',
    '- A private owner-only workspace for testing. Transfers and swaps (ETH and USDC through Uniswap pools) work on test networks only; Base mainnet is read-only.',
    '- A payment-provider sandbox connection is prepared but switched off. No real card or bank payments, no customer accounts and no custody.',
    '',
    '## Questions', '',
  ];
  const qs = [
    ['Licensing and registration', [
      'Given that customers keep their own keys and FYNX never holds customer funds, does FYNX need to register with FinCEN as a money services business, or hold state money-transmitter licenses?',
      `Does letting customers swap tokens through a third-party protocol inside the app change that answer${model.fees && !['none', 'unsure'].includes(model.fees) ? ', given we plan to charge a fee' : ''}?`,
      'If a licensed provider handles card and bank purchases, which obligations stay with FYNX, and what must our contract with the provider say?',
      `Which of ${md(states)} have their own virtual-currency rules that affect us, and are there states we should leave out of the pilot?`,
    ]],
    ['Anti-money-laundering and sanctions', [
      'Do we need our own anti-money-laundering program, or can we rely on the payment provider’s checks for purchases?',
      'What sanctions screening must we do on customers and wallet addresses (for example against OFAC lists), and how often?',
    ]],
    ['Customers and eligibility', [
      'What minimum age and eligibility checks are required, and must we verify identity before someone can connect a wallet?',
      'What do the customer terms and risk disclosures need to say about irreversible transfers, network fees, failed transactions and price changes?',
      'What complaint and dispute process must we offer, and how quickly must we respond?',
    ]],
    ['Privacy and marketing', [
      'Which privacy laws apply to our waitlist and to future customer data, and do our current privacy notices and 365-day retention meet them?',
      'May we email the waitlist when we launch under the consent we collect today?',
      'Which claims must our website and marketing avoid (for example about safety, insurance, audits or launch dates)?',
    ]],
    ['Incidents', [
      'If customer data or accounts are affected by a security incident, who must we notify, and by when?',
    ]],
    ['International', [
      `Before opening in ${md(country.country || 'our first country after the U.S.')}, what would you need from us, and should we involve local counsel there?`,
    ]],
  ];
  let n = 0;
  for (const [area, list] of qs) { L.push(`### ${area}`, ''); for (const q of list) L.push(`${++n}. ${q}`); L.push(''); }
  L.push('## Documents we can share', '',
    `- Legal and operating review brief: ${REPO}/docs/LEGAL-OPERATING-REVIEW.md`,
    `- Launch readiness: ${REPO}/docs/LAUNCH-READINESS.md`,
    `- Operating procedure: ${REPO}/docs/OPERATIONS.md`,
    `- Threat model: ${REPO}/FYNX-Wallet-threat-model.md`,
    '- Public privacy notice: https://ea-la.github.io/FYNX-Wallet/#privacy',
    '',
    'References for counsel (not determinations): FinCEN guidance on convertible virtual currency business models (2019) and OFAC sanctions compliance guidance for the virtual currency industry.');
  return L.join('\n');
}

// Typed-but-unsaved fields: raw form values (field id → string) that differ from the saved answer.
// Used to keep the owner's typing when the worksheet re-renders. Memory only; secret-looking values are dropped.
export function unsavedFields(decision, raw = {}, saved = {}) {
  const out = {}, norm = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  for (const f of decision.fields) {
    if (!(f.id in raw)) continue;
    const value = String(raw[f.id] ?? '');
    if (looksSecret(value)) continue;
    if (norm(value) !== norm(saved[f.id])) out[f.id] = value;
  }
  return out;
}
