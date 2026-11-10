// "What came back": for every request in the outside-party hand-off lists, a short checklist of the
// pieces of evidence the party was asked to send back (a memo, a signed agreement, a report ...).
// The owner ticks each piece as it arrives, before sharing the documents and the test report, so it
// is clear which requests are complete and what is still missing. Ticks only: no file names, notes
// or document text. Kept in this browser and carried between devices inside the launch test report.
// Ticking everything does NOT mark a checklist step done: the documents themselves still have to be
// shared so the step can be checked and recorded in docs/VERIFICATION.md.
import { PARTIES } from './outside-handoff.js';
import { requestId, splitId, CHASE_DAYS } from './outside-requests.js';
import { dayNumber, dayString } from './privacy-requests.js';

export const EVIDENCE_KEY = 'fynx-owner-outside-evidence-v1';
export const EVIDENCE_SECTION = 'Outside evidence received';

const item = (id, label) => ({ id, label });
// One list per request (party + step). Item ids are fixed words so the report line can be strict.
export const EVIDENCE = {
  'counsel|legal/analysis': [
    item('memo', 'Written memo or email with the conclusions'),
    item('licences', 'Covers federal (FinCEN) registration and state money-transmitter licences'),
    item('aml', 'Covers anti-money-laundering, sanctions, age and eligibility checks'),
    item('privacy', 'Covers privacy and complaint-handling duties'),
    item('first-steps', 'Lists what FYNX must do or change before a pilot'),
  ],
  'counsel|legal/terms': [
    item('terms', 'Approved customer terms'),
    item('privacy-notice', 'Approved privacy notice'),
    item('risk', 'Approved risk disclosures'),
    item('approved-date', 'The date each document was approved'),
  ],
  'counsel|international/country-review': [
    item('answer', 'Written answer for the first country (allowed / not allowed / conditions)'),
    item('registrations', 'Registrations needed there, and whether local counsel is needed'),
  ],
  'provider|fiat/allowlist': [
    item('confirmed', 'Confirmation that the backend address is allowlisted for staging'),
    item('date', 'The date the allowlisting took effect'),
  ],
  'provider|fiat/approval': [
    item('agreement', 'Signed production agreement'),
    item('coverage', 'Approved list of U.S. states, products and assets'),
    item('webhooks', 'Webhook, refund, chargeback and reconciliation documents'),
    item('fees', 'Fee schedule and what customers must be shown before checkout'),
    item('checks', 'Which identity, sanctions and age checks the provider runs'),
  ],
  'provider|international/country-review': [
    item('answer', 'Written yes/no per payment method and asset for that country'),
  ],
  'reviewer|production-security/audit': [
    item('report', 'Final report with every finding and its severity'),
    item('retest', 'Retest letter confirming which findings are fixed'),
  ],
  'reviewer|swaps/review': [
    item('contracts', 'Pinned swap contract addresses confirmed per network'),
    item('protections', 'Findings on quotes, slippage, price impact, expiry and minimum received'),
    item('approvals', 'Findings on approvals and any FYNX fee'),
    item('retest', 'Fixes retested'),
  ],
  'reviewer|wallet-recovery/embedded-review': [
    item('design-review', 'Design review of key generation, storage, backup, export and recovery'),
    item('findings', 'Findings listed before building starts'),
  ],
  'data|assets/prices': [
    item('plan', 'Plan name and price'),
    item('licence', 'Licence terms that allow showing prices to customers'),
    item('attribution', 'Required attribution wording'),
    item('limits', 'Request limits, update frequency and uptime commitment'),
  ],
};

export const evidenceItems = id => EVIDENCE[id] || [];
const itemIds = id => new Set(evidenceItems(id).map(i => i.id));

// Every hand-off request has a "what came back" list (tests check this).
export function requestsWithoutEvidence() {
  return PARTIES.flatMap(p => Object.keys(p.steps).map(k => requestId(p.id, k))).filter(id => !evidenceItems(id).length);
}

// One entry per request: { got: [item ids in list order], changed, on? }. `on` (optional) holds the
// day each ticked piece arrived ({ itemId: 'YYYY-MM-DD' }); it is left out when no date is recorded. An entry with nothing ticked but
// a change time is a "cleared" marker, so un-ticking everything also travels (the later change wins).
export function cleanEntry(id, raw) {
  if (!raw || typeof raw !== 'object' || !EVIDENCE[id]) return null;
  const valid = itemIds(id), want = new Set(Array.isArray(raw.got) ? raw.got.filter(x => valid.has(x)) : []);
  const got = evidenceItems(id).map(i => i.id).filter(x => want.has(x));
  const changed = Number.isFinite(raw.changed) && raw.changed > 0 ? raw.changed : 0;
  if (!got.length && !changed) return null;
  const on = cleanDates(raw.on, got);
  return on ? { got, changed, on } : { got, changed };
}
// Received-on dates: real calendar days from FIRST_DAY on, only for ticked pieces, in list order.
export const FIRST_DAY = '2024-01-01';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDay = d => typeof d === 'string' && DAY_RE.test(d) && dayNumber(d) !== null && d >= FIRST_DAY;
function cleanDates(raw, got) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const x of got) if (validDay(raw[x])) out[x] = raw[x];
  return Object.keys(out).length ? out : null;
}
export function cleanEvidence(raw) {
  const out = {};
  const entries = raw && typeof raw === 'object' && raw.entries && typeof raw.entries === 'object' ? raw.entries : {};
  for (const [id, value] of Object.entries(entries)) {
    const e = cleanEntry(id, value);
    if (e) out[id] = e;
  }
  return { entries: out };
}

// Tick or untick one piece of evidence.
export function setItem(log, id, itemId, on, { now = Date.now() } = {}) {
  if (!EVIDENCE[id]) return { log, error: 'Unknown request.' };
  if (!itemIds(id).has(itemId)) return { log, error: 'Unknown piece of evidence.' };
  const cur = log.entries[id]?.got || [];
  if (cur.includes(itemId) === Boolean(on)) return { log, unchanged: true };
  const want = new Set(on ? [...cur, itemId] : cur.filter(x => x !== itemId));
  const got = evidenceItems(id).map(i => i.id).filter(x => want.has(x));
  const dates = cleanDates(log.entries[id]?.on, got);
  return { log: { entries: { ...log.entries, [id]: dates ? { got, changed: now, on: dates } : { got, changed: now } } } };
}
// Record (or clear, with '') the day a ticked piece arrived. Not before FIRST_DAY, not after today.
export function setReceivedDate(log, id, itemId, day, { now = Date.now(), today } = {}) {
  if (!EVIDENCE[id]) return { log, error: 'Unknown request.' };
  if (!itemIds(id).has(itemId)) return { log, error: 'Unknown piece of evidence.' };
  const cur = log.entries[id];
  if (!cur?.got?.includes(itemId)) return { log, error: 'Tick the piece as received first.' };
  const value = String(day ?? '').trim();
  if (value && !validDay(value)) return { log, error: `Enter a real date from ${FIRST_DAY} on.` };
  if (value && today && validDay(today) && value > today) return { log, error: 'The date it arrived cannot be in the future.' };
  if ((cur.on?.[itemId] || '') === value) return { log, unchanged: true };
  const next = { ...(cur.on || {}) };
  if (value) next[itemId] = value; else delete next[itemId];
  const on = cleanDates(next, cur.got);
  return { log: { entries: { ...log.entries, [id]: on ? { got: cur.got, changed: now, on } : { got: cur.got, changed: now } } } };
}

// Where one request's evidence stands: nothing yet / n of m / everything in.
export function evidenceState(id, entry) {
  const items = evidenceItems(id), got = new Set(entry?.got || []);
  const received = items.filter(i => got.has(i.id)), missing = items.filter(i => !got.has(i.id));
  const total = items.length, n = received.length;
  const state = !n ? 'none' : n === total ? 'complete' : 'partial';
  const receivedOn = Object.fromEntries(received.filter(i => validDay(entry?.on?.[i.id])).map(i => [i.id, entry.on[i.id]]));
  const days = Object.values(receivedOn).sort(), first = days[0] || '', last = days[days.length - 1] || '';
  const dated = !days.length ? '' : state === 'complete' && days.length === n ? ` · last piece arrived ${last}` : days.length === 1 ? ` · arrived ${last}` : ` · arrived ${first} to ${last}`;
  const label = state === 'none' ? `Nothing received yet (${total} to come back)`
    : state === 'complete' ? `Everything is in (${n} of ${total})${dated}`
      : `${n} of ${total} received · still missing: ${missing.map(i => i.label.charAt(0).toLowerCase() + i.label.slice(1)).join('; ')}${dated}`;
  return { state, total, count: n, received, missing, label, receivedOn, firstReceived: first, lastReceived: last };
}

// Counts across one party's requests (only the step keys passed).
export function partyEvidence(log, partyId, stepKeys) {
  const s = { complete: 0, partial: 0, none: 0, items: 0, got: 0 };
  for (const key of stepKeys) {
    const id = requestId(partyId, key), st = evidenceState(id, log.entries[id]);
    s[st.state] += 1; s.items += st.total; s.got += st.count;
  }
  return s;
}
export function partyEvidenceLine(s) {
  if (!s.got) return '';
  const parts = [];
  if (s.complete) parts.push(`${s.complete} complete`);
  if (s.partial) parts.push(`${s.partial} partly in`);
  return `Evidence: ${s.got} of ${s.items} pieces${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

// Requests whose evidence is complete while the checklist step is still open: the owner's next move is
// to share the documents. `open` holds the request ids whose step is still open.
export function readyToShare(log, open) {
  const out = [];
  for (const id of open) {
    if (!EVIDENCE[id]) continue;
    if (evidenceState(id, log.entries[id]).state !== 'complete') continue;
    const { partyId, stepKey } = splitId(id);
    out.push({ id, partyId, stepKey, party: PARTIES.find(p => p.id === partyId) });
  }
  return out;
}

// Answered, but pieces still missing: an answer often comes with only part of the evidence. Counted
// from the "Answered on" date; after CHASE_DAYS days the missing pieces are worth asking for again.
// `request`: the request's dates ({ sent, answered }); `entry`: its evidence ticks.
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export function missingAfterAnswer(id, request, entry, today) {
  if (!EVIDENCE[id] || !request?.answered) return null;
  const answered = dayNumber(request.answered), now = dayNumber(today);
  if (answered === null) return null;
  const st = evidenceState(id, entry);
  if (st.state === 'complete') return null;
  // Count from whichever came last: their answer or the last piece that arrived (a party still sending
  // documents is not chased). A piece dated after today is ignored.
  const lastDay = st.lastReceived ? dayNumber(st.lastReceived) : null;
  const last = lastDay !== null && lastDay > answered && (now === null || lastDay <= now) ? st.lastReceived : '';
  const from = last ? lastDay : answered, since = last ? `the last piece arrived on ${last}` : `their answer of ${request.answered}`;
  const days = now === null ? 0 : Math.max(0, now - from), askOn = dayString(from + CHASE_DAYS), due = days >= CHASE_DAYS;
  const pieces = plural(st.missing.length, 'piece');
  const label = due
    ? `${pieces} still missing ${plural(days, 'day')} after ${since}: ask again for ${st.missing.length === 1 ? 'it' : 'them'}`
    : `${pieces} still missing since ${since} · ask again from ${askOn} if ${st.missing.length === 1 ? 'it has' : 'they have'} not arrived`;
  return { id, due, days, askOn, answered: request.answered, countedFrom: last || request.answered, lastArrived: last, missing: st.missing, nothingTicked: st.state === 'none', label };
}
// Open requests answered CHASE_DAYS or more ago with evidence still missing, longest first, for
// "Your next steps". `open`: request ids whose checklist step is still open.
export function missingAttention(requests, evidence, open, today, { limit = 2 } = {}) {
  const out = [];
  for (const id of open) {
    const m = missingAfterAnswer(id, requests?.entries?.[id], evidence?.entries?.[id], today);
    if (!m?.due) continue;
    const { partyId, stepKey } = splitId(id);
    out.push({ ...m, partyId, stepKey, party: PARTIES.find(p => p.id === partyId) });
  }
  out.sort((a, b) => b.days - a.days || a.id.localeCompare(b.id));
  return { count: out.length, next: out.slice(0, Math.max(0, limit)) };
}

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
// Markdown summary to send with the documents (to engineering / Claude): per request what came back
// and what is missing. `rows`: [{ id, title }] in display order. No notes, names or document text.
export function evidenceSummary(log, rows, { date = new Date() } = {}) {
  const stamp = date.toISOString().slice(0, 16).replace('T', ' ');
  const L = ['# FYNX Wallet: evidence received from outside parties', '', `Made ${stamp} UTC from the ticks in the Launch readiness hand-off lists. Attach the documents themselves: a tick alone is not evidence, and no checklist step is marked done from this list.`, ''];
  const byParty = new Map();
  for (const r of rows) {
    const st = evidenceState(r.id, log.entries[r.id]);
    if (!st.count) continue;
    const { partyId } = splitId(r.id);
    if (!byParty.has(partyId)) byParty.set(partyId, []);
    byParty.get(partyId).push({ ...r, st });
  }
  if (!byParty.size) { L.push('Nothing has been ticked as received yet.'); return `${L.join('\n')}\n`; }
  for (const [partyId, list] of byParty) {
    L.push(`## ${PARTIES.find(p => p.id === partyId)?.name || partyId}`, '');
    for (const r of list) {
      const { stepKey } = splitId(r.id);
      L.push(`### ${clean(r.title)} (\`${stepKey}\`) — ${r.st.state === 'complete' ? 'complete' : `${r.st.count} of ${r.st.total}`}`, '');
      for (const i of evidenceItems(r.id)) L.push(`- [${r.st.received.includes(i) ? 'x' : ' '}] ${i.label}${r.st.receivedOn[i.id] ? ` (received ${r.st.receivedOn[i.id]})` : ''}`);
      L.push('');
    }
  }
  L.push('When a request is complete, check the documents, then mark the matching step done in wallet-src/launch-checklist.json and record the evidence in docs/VERIFICATION.md. Never send passwords, API keys, recovery phrases or private keys.');
  return `${L.join('\n')}\n`;
}

// Report section: one line per request with the ticked item ids. Party ids, step keys and item ids
// are fixed words, so nothing typed by the owner travels.
const stampUtc = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
export function evidenceReportLines(log) {
  const ids = Object.keys(log?.entries || {}).filter(id => EVIDENCE[id]).sort();
  if (!ids.length) return [];
  const lines = [`## ${EVIDENCE_SECTION}`, '', 'Which pieces of evidence each outside party has sent back (ticks only, no documents), so the ticks can be brought into another browser.', ''];
  for (const id of ids) {
    const e = log.entries[id], { partyId, stepKey } = splitId(id);
    lines.push(`- ${partyId} · ${stepKey} · ${e.got.length ? `got ${e.got.map(x => (e.on?.[x] ? `${x} on ${e.on[x]}` : x)).join(', ')}` : 'got nothing'}${e.changed ? ` · changed ${stampUtc(e.changed)} UTC` : ''}`);
  }
  lines.push('');
  return lines;
}

const LINE = /^\s*[-*]\s+([a-z]{2,20}) · ([a-z0-9-]{1,40}\/[a-z0-9-]{1,40}) · (?:(got nothing)|got ([a-z0-9-]{1,30}(?: on \d{4}-\d{2}-\d{2})?(?:, [a-z0-9-]{1,30}(?: on \d{4}-\d{2}-\d{2})?){0,11}))(?: · changed (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC)?\s*$/;
export const isEvidenceLine = line => LINE.test(String(line || ''));
export function parseEvidenceReport(text) {
  const entries = {};
  let inSection = false, unknown = 0;
  for (const line of String(text || '').split(/\r?\n/).slice(0, 2000)) {
    if (/^##\s/.test(line)) { inSection = line.replace(/^##\s+/, '').trim() === EVIDENCE_SECTION; continue; }
    if (!inSection || !line.trim() || !/^\s*[-*]\s/.test(line)) continue;
    const m = line.match(LINE);
    const id = m && requestId(m[1], m[2]);
    if (!m || !EVIDENCE[id] || id in entries) { unknown += 1; continue; }
    const parts = m[3] ? [] : m[4].split(', ').map(x => x.split(' on ')), listed = parts.map(p => p[0]), valid = itemIds(id);
    if (listed.some(x => !valid.has(x)) || parts.some(p => p[1] && !validDay(p[1]))) { unknown += 1; continue; }
    const changed = m[5] ? Date.parse(`${m[5]}T${m[6]}:00Z`) : 0, on = Object.fromEntries(parts.filter(p => p[1]).map(p => [p[0], p[1]]));
    const e = cleanEntry(id, { got: listed, changed: Number.isFinite(changed) ? changed : 0, on });
    if (!e) { unknown += 1; continue; }
    entries[id] = e;
  }
  return { log: { entries }, unknown };
}

const minute = ms => Math.floor((ms || 0) / 60000) * 60000;
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameTicks = (a, b) => sameList(a.got, b.got) && a.got.every(x => (a.on?.[x] || '') === (b.on?.[x] || ''));
const copyEntry = e => (e.on ? { got: [...e.got], changed: e.changed, on: { ...e.on } } : { got: [...e.got], changed: e.changed });
// Combine an imported set with this browser's: new requests are added; when both have one and the
// ticks differ, the one changed later wins (same minute: this browser's stays).
export function mergeEvidence(local, incoming) {
  const merged = { ...(local?.entries || {}) }, changes = { added: [], updated: [], same: [], kept: [] };
  for (const [id, inc] of Object.entries(incoming?.entries || {})) {
    if (!EVIDENCE[id]) continue;
    const mine = merged[id];
    if (!mine) { if (inc.got.length) { merged[id] = copyEntry(inc); changes.added.push(id); } continue; }
    if (sameTicks(mine, inc)) { changes.same.push(id); continue; }
    if (minute(inc.changed) > minute(mine.changed)) { merged[id] = copyEntry(inc); changes.updated.push(id); } else changes.kept.push(id);
  }
  return { log: cleanEvidence({ entries: merged }), ...changes };
}
