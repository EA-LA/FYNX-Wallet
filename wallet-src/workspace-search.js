// Find in workspace: one search box that finds any part of the owner workspace (tabs, the parts of each
// tab, every launch step, the support playbook situations, emergency plan situations, owner decisions and
// the accounts in the access review) and says where it is. It also finds the owner's own words that are
// already in this browser: notes on launch tests, decision worksheet answers and the names given to wallets. Pure: the page passes in the launch plan and the
// owner's own results; nothing here reads storage, the network or the page, and the query is never stored.
import { SECTIONS } from './section-guide.js';
import { stepKey, stepState, byLabels, shortStep, looksSecret } from './launch-tracker.js';
import { cleanLabels } from './history-tools.js';
import { SITUATIONS } from './support-playbook.js';
import { SCENARIOS } from './emergency-plan.js';
import { DECISIONS, decisionKey, answerText } from './owner-decisions.js';
import { ACCESS_SERVICES } from './access-review.js';

export const MAX_QUERY = 80;
export const MAX_RESULTS = 8;
export const MAX_OWN_TEXT = 280; // longest note or answer the search will read
export const SNIPPET = 90; // characters of the owner's own words shown under a result

// The owner's own words, cleaned: text only, secret-looking text left out, capped.
export function ownText(raw) {
  if (typeof raw !== 'string') return '';
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text || looksSecret(text)) return '';
  return text.slice(0, MAX_OWN_TEXT);
}
const shortAddress = a => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const TAB_NAMES = { dashboard: 'Dashboard', wallet: 'Crypto tools', security: 'Account security', registrations: 'Waitlist', launch: 'Launch readiness' };

// Words people are likely to type for each part, in addition to its label (plain words, no jargon needed).
const PART_WORDS = {
  launch: {
    overview: 'progress percent gates summary report next steps pace', dates: 'calendar deadlines due overdue reminders ics',
    update: 'weekly update progress report share', history: 'finished done completed what happened',
    order: 'what can move now hand off engineering outside lawyer reviewer blocked waiting', session: 'plan a test session time minutes',
    pilot: 'go no-go launch pilot ready release approve', support: 'customer help reply message inbox complaint',
    rollback: 'pause stop pilot undo reopen', services: 'alchemy coingecko providers keys api status reliability uptime outage',
    checklist: 'steps gates tests passed failed filters', decisions: 'decide worksheet choices answers',
    drill: 'incident practice exercise rehearsal', connections: 'connection checks firebase app check network',
  },
  wallet: {
    guide: 'test session setup faucet free test eth usdc start', wallet: 'connect metamask ledger extension verify ownership network',
    balance: 'balance receive qr address request amount payment deposit', send: 'send transfer pay recipient address poisoning look-alike',
    swap: 'swap exchange uniswap convert slippage quote', permissions: 'approval allowance revoke spend spender',
    track: 'track transaction hash stuck pending nonce speed up cancel replaced dropped confirmations',
    fiat: 'buy sell card bank transak checkout on-ramp', mainnet: 'real money mainnet limits switch base turn on',
    portfolio: 'portfolio history transfers reconciliation register statement',
  },
  security: {
    checkup: 'score protected sign-in session', tests: 'identity tests results', access: '2-step two-factor 2fa recovery codes github billing google cloud registrar',
    emergency: 'lost stolen locked out hacked compromised sheet print', passkeys: 'passkey face id touch id biometric add remove device',
    recovery: 'recover recovery phrase seed ledger',
  },
  registrations: {
    find: 'search email load registrations sign-ups', insights: 'chart totals trend growth per day week', quality: 'duplicates typos throwaway address check',
    pilot: 'invite pilot list first users', rows: 'table csv export remove delete', privacy: 'privacy request gdpr ccpa delete my data access removal 30 days',
    tests: 'waitlist tests join remove',
  },
};
const TAB_WORDS = {
  dashboard: 'today home what needs you preview overview', wallet: 'crypto wallet tools blockchain test networks',
  security: 'account security sign-in protection', registrations: 'waitlist sign-ups emails subscribers', launch: 'launch readiness checklist gates',
};
const stateWords = { done: 'Done', failed: 'Failed, retest', open: 'To do' };

// Lower case, accents and punctuation removed, so "Sign-in", "sign in" and "signin" all match.
export function normalize(raw) {
  return String(raw ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
export const tokens = raw => normalize(raw).split(' ').filter(Boolean);
export const cleanQuery = raw => String(raw ?? '').replace(/\s+/g, ' ').trimStart().slice(0, MAX_QUERY);

// Every searchable thing. `go` tells the page what to open; `tab` is where it lives.
// `mine` is the owner's own text on an entry (a note or an answer); it is searched and shown as a snippet.
export function buildIndex({ plan = { items: [] }, records = {}, decisionStates = {}, decisionAnswers = {}, walletNames = {} } = {}) {
  const out = [];
  const add = e => out.push({ ...e, hay: { title: normalize(e.title), words: normalize(e.words || ''), detail: normalize(e.detail || ''), mine: normalize(e.mine || '') } });
  for (const [tab, name] of Object.entries(TAB_NAMES)) add({ kind: 'tab', id: `tab:${tab}`, title: name, where: 'Tab', tab, go: { type: 'tab', tab }, words: TAB_WORDS[tab] });
  for (const [tab, parts] of Object.entries(SECTIONS)) {
    for (const p of parts) add({ kind: 'part', id: `part:${tab}:${p.id}`, title: p.label, where: TAB_NAMES[tab], tab, go: { type: 'part', tab, target: p.target, part: p.id }, words: PART_WORDS[tab]?.[p.id] || '' });
  }
  for (const gate of plan.items || []) {
    for (const step of gate.steps || []) {
      const key = stepKey(gate.id, step.id), state = stepState(gate, step, records), note = ownText(records?.[key]?.note);
      add({ ...(note ? { mine: note, mineLabel: 'Your note' } : {}),
        kind: 'step', id: `step:${key}`, title: shortStep(step), where: `Launch readiness · ${gate.title}`, tab: 'launch',
        state, stateText: `${byLabels[step.by] || ''} · ${stateWords[state] || 'To do'}`.replace(/^ · /, ''),
        go: { type: 'step', key }, words: `${gate.title} ${byLabels[step.by] || ''}`, detail: step.text,
      });
    }
  }
  for (const d of DECISIONS) {
    const key = decisionKey(d), state = decisionStates[key];
    const answer = decisionAnswers && typeof decisionAnswers === 'object' && decisionAnswers[key] && typeof decisionAnswers[key] === 'object' ? ownText(answerText(d, decisionAnswers[key])) : '';
    add({ ...(answer ? { mine: answer, mineLabel: 'Your answer' } : {}), kind: 'decision', id: `decision:${key}`, title: d.title, where: 'Launch readiness · Decisions', tab: 'launch', go: { type: 'decision', key },
      stateText: state === 'decided' ? 'Decided' : state === 'draft' ? 'In progress' : 'To decide', words: 'decision decide', detail: d.why });
  }
  for (const s of SITUATIONS) {
    add({ kind: 'situation', id: `situation:${s.id}`, title: s.title, where: 'Launch readiness · Support playbook', tab: 'launch', go: { type: 'situation', id: s.id },
      words: `customer support ${(s.words || []).join(' ')}` });
  }
  for (const s of SCENARIOS) add({ kind: 'scenario', id: `scenario:${s.id}`, title: s.title, where: 'Account security · Emergency plan', tab: 'security', go: { type: 'scenario', id: s.id }, words: 'emergency', detail: s.signs });
  for (const s of ACCESS_SERVICES) add({ kind: 'service', id: `service:${s.id}`, title: s.name, where: 'Account security · Access review', tab: 'security', go: { type: 'service', id: s.id }, words: 'account access review', detail: `${s.controls} ${s.check}` });
  // Names given to wallets in Portfolio & history (this browser only). The address is shown shortened.
  for (const [address, v] of Object.entries(cleanLabels(walletNames))) {
    add({ kind: 'name', id: `name:${address}`, title: v.label, where: 'Crypto tools · Portfolio & history', tab: 'wallet', stateText: shortAddress(address),
      go: { type: 'name', address, label: v.label }, words: `wallet name named saved ${address}` });
  }
  return out;
}

const KIND_ORDER = { tab: 0, part: 1, name: 2, decision: 3, scenario: 4, situation: 5, service: 6, step: 7 };
const wordStarts = (hay, t) => hay === t || hay.startsWith(`${t} `) || hay.includes(` ${t}`);

// Score one query word against one entry: title beats extra words beats the long description, and a match
// at the start of a word beats one in the middle. 0 = not found (every word must be found somewhere).
function wordScore(h, t) {
  if (wordStarts(h.title, t)) return 10;
  if (h.title.includes(t)) return 6;
  if (wordStarts(h.words, t)) return 5;
  if (t.length >= 3 && h.words.includes(t)) return 3;
  if (wordStarts(h.mine, t)) return 4;
  if (t.length >= 3 && h.mine.includes(t)) return 2;
  if (wordStarts(h.detail, t)) return 2;
  if (t.length >= 4 && h.detail.includes(t)) return 1;
  return 0;
}

// Ranked matches for a query. Every word typed must match; whole-title matches and the open tab come first.
export function search(index, raw, { limit = MAX_RESULTS, tab = '' } = {}) {
  const words = tokens(cleanQuery(raw));
  if (!words.length) return { query: '', results: [], total: 0 };
  const q = words.join(' ');
  const scored = [];
  for (const e of index) {
    let score = 0, ok = true;
    for (const t of words) { const s = wordScore(e.hay, t); if (!s) { ok = false; break; } score += s; }
    if (!ok) continue;
    const inMine = Boolean(e.hay.mine) && words.some(t => e.hay.mine.includes(t));
    if (e.hay.title === q) score += 30; else if (e.hay.title.startsWith(q)) score += 12;
    if (tab && e.tab === tab) score += 1;
    if (e.state === 'done') score -= 1; // finished steps last among equals
    scored.push({ e, score, inMine });
  }
  scored.sort((a, b) => b.score - a.score || KIND_ORDER[a.e.kind] - KIND_ORDER[b.e.kind] || a.e.title.localeCompare(b.e.title));
  const results = scored.slice(0, Math.max(1, limit)).map(x => (x.inMine ? { ...x.e, snippet: snippet(x.e.mine, words) } : x.e));
  return { query: q, results, total: scored.length };
}

// A short piece of the owner's own text around the first matched word, for showing under a result.
export function snippet(text, words, max = SNIPPET) {
  const raw = String(text ?? '');
  if (raw.length <= max) return raw;
  const lower = raw.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let at = -1;
  if (lower.length === raw.length) for (const w of words) { const i = lower.indexOf(w); if (i !== -1 && (at === -1 || i < at)) at = i; }
  let start = at <= 0 ? 0 : Math.max(0, at - Math.floor(max / 3));
  if (start > 0) { const space = raw.lastIndexOf(' ', start); start = space > start - 15 ? space + 1 : start; }
  let end = Math.min(raw.length, start + max);
  if (end < raw.length) { const space = raw.lastIndexOf(' ', end); if (space > start + max / 2) end = space; }
  return `${start > 0 ? '…' : ''}${raw.slice(start, end).trim()}${end < raw.length ? '…' : ''}`;
}

// Title split into plain and matched pieces, for bold highlighting (case and accents kept as written).
export function highlight(title, raw) {
  const text = String(title ?? ''), words = tokens(raw).sort((a, b) => b.length - a.length);
  if (!words.length || !text) return [{ text, match: false }];
  const lower = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (lower.length !== text.length) return [{ text, match: false }]; // ligatures or similar: no highlight rather than a wrong one
  const marks = new Array(text.length).fill(false);
  for (const w of words) {
    let i = lower.indexOf(w);
    while (i !== -1) { for (let k = i; k < i + w.length; k++) marks[k] = true; i = lower.indexOf(w, i + w.length); }
  }
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.match === marks[i]) last.text += text[i]; else out.push({ text: text[i], match: marks[i] });
  }
  return out;
}

export const KIND_LABELS = { tab: 'Tab', part: 'Part', step: 'Launch step', decision: 'Decision', situation: 'Support', scenario: 'Emergency', service: 'Account', name: 'Wallet name' };

// Spoken label for one result, e.g. "Launch step: Restore a test wallet…, Launch readiness · Wallet creation, You · To do".
export function resultLabel(e) {
  return [`${KIND_LABELS[e.kind] || ''}: ${e.title}`, e.where, e.stateText, e.snippet ? `${e.mineLabel || 'Your words'}: ${e.snippet}` : ''].filter(Boolean).join(', ');
}

// One line for the live region: how many matched and how many are shown.
export function countLine(r) {
  if (!r.query) return '';
  if (!r.total) return `Nothing found for “${r.query}”. Try a shorter word, for example “passkey”, “privacy” or “swap”. Your notes, decision answers and wallet names are searched too.`;
  return r.total > r.results.length ? `${r.total} matches, showing the best ${r.results.length}. Type more to narrow it down.` : `${r.total} ${r.total === 1 ? 'match' : 'matches'}.`;
}

// Arrow keys move through the list and wrap; -1 = nothing highlighted.
export function moveActive(current, delta, count) {
  if (!count) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return (current + delta + count) % count;
}
