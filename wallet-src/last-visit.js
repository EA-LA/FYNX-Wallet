// "Since your last visit" on Today (Dashboard tab): what changed while the owner was away, so a returning
// owner does not have to compare the checklist by memory. This browser keeps one small record:
//   last      time the workspace was last open (refreshed while it is used),
//   current   a snapshot of the checklist steps recorded done and the outside evidence ticked as received,
//             taken whenever Today is drawn,
//   baseline  the snapshot (and its time and local day) from the end of the previous visit,
//   opening   the snapshot taken when this visit started.
// A visit starts when the workspace opens more than VISIT_GAP_MS after it was last used; a reload or a tab
// switch inside the gap continues the same visit, so the line does not reset on every reload.
// What is reported: checklist steps recorded done (opening vs baseline), outside evidence ticked (opening vs
// baseline, which covers evidence brought in from another device), the owner's own results recorded between
// the two visits (by their recorded time, here or brought in from another device) and dated items that have
// become overdue since then. Snapshots hold only step keys and evidence piece ids: no notes, no references.
// Pure helpers; the page reads and writes localStorage itself.
import { stepKey, shortStep } from './launch-tracker.js';
import { evidenceItems, EVIDENCE } from './outside-evidence.js';
import { splitId } from './outside-requests.js';
import { PARTIES } from './outside-handoff.js';

export const VISIT_KEY = 'fynx-owner-last-visit-v1';
export const VISIT_GAP_MS = 30 * 60 * 1000;
const MAX_KEYS = 400;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const plural = (n, w, many = `${w}s`) => `${n} ${n === 1 ? w : many}`;
const okTime = t => Number.isFinite(t) && t > 0;
const okKey = k => typeof k === 'string' && k.length > 0 && k.length <= 120 && !/\s/.test(k);

// What the checklist and the evidence log look like now (keys only).
export function snapshot(plan, evidence) {
  const done = [];
  for (const gate of plan?.items || []) for (const step of gate.steps || []) if (step.done) done.push(stepKey(gate.id, step.id));
  const pieces = [];
  for (const [id, entry] of Object.entries(evidence?.entries || {})) {
    if (!EVIDENCE[id]) continue;
    const valid = new Set(evidenceItems(id).map(i => i.id));
    for (const p of entry?.got || []) if (valid.has(p)) pieces.push(`${id}#${p}`);
  }
  return { done: done.sort(), pieces: pieces.sort() };
}

const cleanSnap = raw => {
  if (!raw || typeof raw !== 'object') return null;
  const list = v => (Array.isArray(v) ? [...new Set(v.filter(okKey))].slice(0, MAX_KEYS).sort() : []);
  return { done: list(raw.done), pieces: list(raw.pieces) };
};

// Read back whatever was stored; anything odd is dropped (a broken record means "no earlier visit").
export function cleanVisit(raw) {
  if (!raw || typeof raw !== 'object' || !okTime(raw.last)) return null;
  const out = { last: raw.last, current: cleanSnap(raw.current) || { done: [], pieces: [] } };
  if (okTime(raw.startedAt) && raw.startedAt <= raw.last) out.startedAt = raw.startedAt;
  const b = raw.baseline;
  if (b && typeof b === 'object' && okTime(b.at) && b.at <= raw.last && DAY_RE.test(b.day || '') && cleanSnap(b.snap)) {
    out.baseline = { at: b.at, day: b.day, snap: cleanSnap(b.snap) };
    out.opening = cleanSnap(raw.opening) || out.current;
    if (raw.seen === true) out.seen = true;
  }
  return out;
}

// Called once when the page opens. Returns the record to store.
//   - no record: the first visit in this browser (no baseline);
//   - last use within the gap: the same visit carries on (baseline and opening kept);
//   - otherwise a new visit: the previous visit's last snapshot becomes the baseline.
// `day` is the owner's local day at `last` (stored as lastDay) so overdue dates compare by local day.
export function startVisit(stored, { now, snap, day }) {
  const prev = cleanVisit(stored);
  if (!prev) return { last: now, lastDay: day, startedAt: now, current: snap };
  if (now - prev.last < VISIT_GAP_MS && now >= prev.last) return { ...prev, lastDay: day, last: now, current: snap, startedAt: prev.startedAt || now };
  const prevDay = typeof stored?.lastDay === 'string' && DAY_RE.test(stored.lastDay) ? stored.lastDay : new Date(prev.last).toISOString().slice(0, 10);
  return { last: now, lastDay: day, startedAt: now, current: snap, opening: snap, baseline: { at: prev.last, day: prevDay, snap: prev.current } };
}

// Called whenever Today is drawn or the page is left: refresh the time and the current snapshot.
export function touchVisit(stored, { now, snap, day }) {
  const prev = cleanVisit(stored);
  if (!prev) return startVisit(null, { now, snap, day });
  return { ...prev, lastDay: day, last: Math.max(prev.last, now), current: snap };
}

// "I've seen this": the next comparison starts from now.
export function markSeen(stored, { now, snap, day }) {
  return { last: now, lastDay: day, startedAt: now, current: snap, opening: snap, baseline: { at: now, day, snap }, seen: true };
}

// What changed between the baseline and the start of this visit.
//   plan, records: launch checklist and this browser's results (results carry `at`, the time recorded)
//   evidence: outside evidence log; dates: owner-dates.js collectDates() items
export function sinceLastVisit(stored, { plan, records = {}, dates = {} } = {}) {
  const v = cleanVisit(stored);
  if (!v || !v.baseline) return { first: true, total: 0, steps: [], results: { pass: 0, fail: 0, skip: 0, items: [] }, evidence: [], overdue: [] };
  const { baseline } = v, opening = v.opening || v.current, until = v.startedAt || v.last;
  const index = new Map();
  for (const gate of plan?.items || []) for (const step of gate.steps || []) index.set(stepKey(gate.id, step.id), { gate, step });

  const before = new Set(baseline.snap.done);
  const steps = opening.done.filter(k => !before.has(k) && index.has(k)).map(k => {
    const { gate, step } = index.get(k);
    return { key: k, gateId: gate.id, gate: gate.title, by: step.by, text: shortStep(step) };
  });

  const results = { pass: 0, fail: 0, skip: 0, items: [] };
  for (const [key, r] of Object.entries(records || {})) {
    if (!index.has(key) || !['pass', 'fail', 'skip'].includes(r?.result) || !okTime(r.at)) continue;
    if (r.at <= baseline.at || r.at > until) continue;
    results[r.result] += 1;
    const { gate, step } = index.get(key);
    results.items.push({ key, gateId: gate.id, result: r.result, at: r.at, text: shortStep(step) });
  }
  results.items.sort((a, b) => b.at - a.at);

  const had = new Set(baseline.snap.pieces), byRequest = new Map();
  for (const p of opening.pieces) {
    if (had.has(p)) continue;
    const [id, piece] = p.split('#');
    const label = evidenceItems(id).find(i => i.id === piece)?.label;
    if (!label) continue;
    if (!byRequest.has(id)) byRequest.set(id, []);
    byRequest.get(id).push(label);
  }
  const evidence = [];
  for (const [id, pieces] of byRequest) {
    const { partyId, stepKey: target } = splitId(id), party = PARTIES.find(p => p.id === partyId), t = index.get(target);
    if (!party || !t) continue;
    evidence.push({ id, party: party.name, step: target, stepText: shortStep(t.step), pieces, total: evidenceItems(id).length });
  }
  evidence.sort((a, b) => a.party.localeCompare(b.party) || a.step.localeCompare(b.step));

  // Dated items that were not yet overdue at the last visit (their date was that day or later) and are now.
  const overdue = (dates.items || []).filter(i => i.state === 'overdue' && DAY_RE.test(i.date || '') && i.date >= baseline.day);

  const pieces = evidence.reduce((n, e) => n + e.pieces.length, 0);
  const total = steps.length + results.items.length + pieces + overdue.length;
  return { first: false, at: baseline.at, day: baseline.day, seen: !!v.seen, total, steps, results, evidence, pieces, overdue };
}

// How long ago the last visit was, in plain words.
export function agoLabel(at, now) {
  const mins = Math.max(0, Math.round((now - at) / 60000));
  if (mins < 60) return mins <= 1 ? 'a minute ago' : `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// The one-line summary, e.g. "2 checklist steps recorded done (1 engineering, 1 outside party) · 3 of your
// results recorded (2 passed, 1 failed) · 2 pieces of outside evidence ticked · 1 date became overdue".
export function sinceHeadline(s) {
  if (s.first) return 'This is the first visit recorded in this browser. Next time, this shows what changed while you were away.';
  if (!s.total) return s.seen ? 'Nothing new since you marked this as seen.' : 'Nothing changed since your last visit.';
  const parts = [];
  if (s.steps.length) {
    const by = { you: 0, engineering: 0, outside: 0 };
    for (const x of s.steps) by[x.by] = (by[x.by] || 0) + 1;
    const who = [by.engineering && `${by.engineering} engineering`, by.outside && `${by.outside} outside ${by.outside === 1 ? 'party' : 'parties'}`, by.you && `${by.you} yours`].filter(Boolean);
    parts.push(`${plural(s.steps.length, 'checklist step')} recorded done${who.length ? ` (${who.join(', ')})` : ''}`);
  }
  if (s.results.items.length) {
    const r = s.results, how = [r.pass && `${r.pass} passed`, r.fail && `${r.fail} failed`, r.skip && `${r.skip} not applicable`].filter(Boolean);
    parts.push(`${plural(r.items.length, 'of your results', 'of your results')} recorded (${how.join(', ')})`);
  }
  if (s.pieces) parts.push(`${plural(s.pieces, 'piece')} of outside evidence ticked as received`);
  if (s.overdue.length) parts.push(`${plural(s.overdue.length, 'date')} became overdue`);
  return parts.join(' · ');
}

// Plain text for "Copy today" (fixed words and step text only).
export function sinceText(s, now) {
  if (s.first) return '';
  const lines = [`Since your last visit (${agoLabel(s.at, now)}): ${sinceHeadline(s)}`];
  for (const x of s.steps) lines.push(`- Done in the checklist: ${x.gate} · ${x.text}`);
  for (const x of s.results.items) lines.push(`- Your result: ${x.result === 'pass' ? 'Passed' : x.result === 'fail' ? 'Failed' : 'Not applicable'} · ${x.text}`);
  for (const e of s.evidence) lines.push(`- ${e.party} evidence for “${e.stepText}”: ${e.pieces.length} of ${e.total}`);
  for (const d of s.overdue) lines.push(`- Now overdue: ${d.date} · ${d.title}`);
  return lines.join('\n');
}
