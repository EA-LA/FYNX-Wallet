// "What's been finished": the launch history. One dated list of every finished launch step, from two sources:
//  - the checklist itself (wallet-src/launch-checklist.json): engineering, outside-party and owner steps that
//    were recorded as done carry `doneOn` (the date the checklist recorded them as done). Steps already done
//    when the checklist was started (`started` in the checklist) are the starting point, not progress;
//  - this browser's own test results (Passed / Not applicable, with the time they were recorded).
// Grouped by week (weeks start on Monday, UTC), with a running "done by the end of the week" count.
// Only fixed words leave this module (gate titles, step text, who did it, dates); notes never do.
// Pure helpers shared by the owner workspace, the checklist build and tests.
import { stepKey, shortStep, byLabels } from './launch-tracker.js';

export const WHO = ['all', 'you', 'engineering', 'outside'];
export const whoLabels = { all: 'Everyone', you: 'You', engineering: 'Engineering', outside: 'Outside parties' };
export const EARLIEST = '2024-01-01';
const DAY = 86400000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const md = s => clean(s).replace(/([\\`*_[\]<>|])/g, '\\$1');

export function validDate(s) {
  if (typeof s !== 'string' || !DATE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}
const dayMs = s => Date.parse(`${s}T00:00:00Z`);
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);

// Build-time check for launch-checklist.json: a step marked done must say when (doneOn, a real date from
// 2024 on and not after `today`), and an open step must not carry a date.
export function checkDoneDates(plan, today) {
  const errors = [];
  if (!validDate(plan.started) || plan.started < EARLIEST) errors.push('The checklist needs "started" (YYYY-MM-DD): the day it was first written.');
  for (const gate of plan.items || []) for (const step of gate.steps || []) {
    const key = stepKey(gate.id, step.id);
    if (step.done) {
      if (!validDate(step.doneOn)) errors.push(`${key}: a done step needs "doneOn" as YYYY-MM-DD.`);
      else if (step.doneOn < EARLIEST) errors.push(`${key}: "doneOn" ${step.doneOn} is before ${EARLIEST}.`);
      else if (validDate(today) && step.doneOn > today) errors.push(`${key}: "doneOn" ${step.doneOn} is in the future.`);
      else if (validDate(plan.started) && step.doneOn < plan.started) errors.push(`${key}: "doneOn" ${step.doneOn} is before the checklist started (${plan.started}).`);
    } else if (step.doneOn !== undefined) errors.push(`${key}: an open step must not have "doneOn".`);
  }
  return errors;
}

// Monday of the week (UTC) that holds the date.
export function weekOf(date) {
  const t = dayMs(date), wd = (new Date(t).getUTCDay() + 6) % 7;
  return isoDay(t - wd * DAY);
}

// Every finished step with its date, newest first. Owner steps finished in this browser use the time the
// result was recorded; results without a time are kept as undated (counted, but not placed in a week).
export function historyEntries(plan, records = {}) {
  const out = [];
  for (const gate of plan.items || []) for (const step of gate.steps || []) {
    const key = stepKey(gate.id, step.id), base = { key, gateId: gate.id, gate: gate.title, by: step.by, text: shortStep(step) };
    if (step.done) {
      const date = validDate(step.doneOn) ? step.doneOn : '';
      out.push({ ...base, source: 'checklist', date, at: 0, baseline: !date || (validDate(plan.started) && date <= plan.started) });
      continue;
    }
    if (step.by !== 'you') continue;
    const r = records[key];
    if (r?.result !== 'pass' && r?.result !== 'skip') continue;
    const at = Number.isFinite(r.at) && r.at > 0 ? r.at : 0;
    out.push({ ...base, source: 'result', result: r.result, date: at ? isoDay(at) : '', at });
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.at - a.at || a.key.localeCompare(b.key));
}

const totalSteps = plan => (plan.items || []).reduce((n, g) => n + (g.steps || []).length, 0);

// The history as weeks (newest first), filtered by who did the work, plus counts for the filter buttons and
// a running total of finished steps (all parties) at the end of each of the last `weeks` weeks.
// `arrivals` (optional): dated outside-party evidence from outside-evidence.js evidenceArrivals(); shown in its
// week for Everyone and Outside parties. Evidence is not a finished step, so it never changes the counts.
// `undatedArrivals` (optional): evidenceArrivals().undated, pieces ticked without an "Arrived" date; listed
// apart (for Everyone and Outside parties) so the owner can add the date.
export function launchHistory(plan, records = {}, { who = 'all', today, weeks = 8, arrivals = [], undatedArrivals = [] } = {}) {
  if (!WHO.includes(who)) who = 'all';
  const all = historyEntries(plan, records), total = totalSteps(plan);
  const counts = { all: all.length, you: 0, engineering: 0, outside: 0 };
  for (const e of all) counts[e.by] = (counts[e.by] || 0) + 1;
  const picked = who === 'all' ? all : all.filter(e => e.by === who);
  const groups = new Map(), undated = [], baseline = [];
  for (const e of picked) {
    if (e.baseline) { baseline.push(e); continue; }
    if (!e.date) { undated.push(e); continue; }
    const w = weekOf(e.date);
    if (!groups.has(w)) groups.set(w, { week: w, end: isoDay(dayMs(w) + 6 * DAY), entries: [], by: { you: 0, engineering: 0, outside: 0 } });
    const g = groups.get(w); g.entries.push(e); g.by[e.by] += 1;
  }
  const showsOutside = who === 'all' || who === 'outside';
  const evidence = showsOutside ? (arrivals || []).filter(a => a && validDate(a.date)) : [];
  const undatedEvidence = showsOutside ? (undatedArrivals || []).filter(a => a && a.count > 0) : [];
  for (const a of evidence) {
    const w = weekOf(a.date);
    if (!groups.has(w)) groups.set(w, { week: w, end: isoDay(dayMs(w) + 6 * DAY), entries: [], by: { you: 0, engineering: 0, outside: 0 } });
    const g = groups.get(w); (g.arrivals ||= []).push(a);
  }
  for (const g of groups.values()) g.arrivals ||= [];
  const list = [...groups.values()].sort((a, b) => b.week.localeCompare(a.week));

  // Running total: everything dated on or before the end of each week; the starting point and undated
  // results count from the start.
  const now = validDate(today) ? today : isoDay(Date.now());
  const thisWeek = weekOf(now), undatedAll = all.filter(e => !e.date || e.baseline).length, running = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = isoDay(dayMs(thisWeek) - i * 7 * DAY), end = isoDay(dayMs(start) + 6 * DAY);
    if (validDate(plan.started) && end < plan.started) continue; // no bars before the checklist existed
    const done = undatedAll + all.filter(e => e.date && !e.baseline && e.date <= end).length;
    const added = all.filter(e => e.date && !e.baseline && e.date >= start && e.date <= end).length;
    running.push({ week: start, end, done, added, percent: total ? Math.round(done / total * 100) : 0, current: i === 0 });
  }
  const progress = all.filter(e => e.date && !e.baseline).length;
  return { who, total, done: all.length, percent: total ? Math.round(all.length / total * 100) : 0, counts, weeks: list, undated, baseline, started: validDate(plan.started) ? plan.started : '', startDone: all.filter(e => e.baseline).length, progress, running, shown: picked.length, arrivals: evidence.length, undatedEvidence };
}

const fmt = d => { const t = new Date(dayMs(d)); return `${t.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.getUTCMonth()]} ${t.getUTCFullYear()}`; };
// "2 of 5 pieces have no Arrived date" for evidence ticked without a date.
export const undatedLine = a => `${a.count} of ${a.total} ${a.total === 1 ? 'piece' : 'pieces'} ${a.count === 1 ? 'has' : 'have'} no “Arrived” date.`;
export const weekTitle = w => `Week of ${fmt(w)}`;
// "3 steps", "2 evidence arrivals" or "1 step, 1 evidence arrival" for a week heading.
export function weekCount(w) {
  const n = w.entries.length, a = (w.arrivals || []).length, parts = [];
  if (n || !a) parts.push(`${n} ${n === 1 ? 'step' : 'steps'}`);
  if (a) parts.push(`${a} evidence ${a === 1 ? 'arrival' : 'arrivals'}`);
  return parts.join(', ');
}
export const entryLabel = e => e.source === 'checklist' ? `${byLabels[e.by]} · recorded done in the checklist` : `You · ${e.result === 'skip' ? 'Not applicable' : 'Passed'} in this browser`;

export function historyHeadline(h) {
  if (!h.done) return `Nothing finished yet: 0 of ${h.total} launch steps.`;
  const recent = h.running.length ? h.running[h.running.length - 1].added : 0;
  const start = h.started ? `${h.startDone} were already done when the checklist started on ${fmt(h.started)}, ${h.progress} finished since` : `${h.progress} with a date`;
  return `${h.done} of ${h.total} launch steps finished (${h.percent}%): ${start}; ${recent ? `${recent} this week` : 'none yet this week'}.`;
}

// Markdown for an email, a board update or the engineer. Fixed words and dates only.
export function historyMarkdown(h, { product = 'FYNX Wallet', generated = new Date() } = {}) {
  const L = [`# ${md(product)} launch history`, '', `Written ${generated.toISOString().slice(0, 16).replace('T', ' ')} UTC. Showing: ${whoLabels[h.who]}.`, '', historyHeadline(h), ''];
  L.push('## Done by the end of each week', '');
  for (const r of h.running) L.push(`- ${weekTitle(r.week)}: ${r.done} of ${h.total} (${r.percent}%)${r.added ? `, ${r.added} added` : ''}${r.current ? ' (this week so far)' : ''}`);
  L.push('');
  if (!h.weeks.length && !h.undated.length && !h.baseline.length) L.push('Nothing finished yet for this selection.', '');
  for (const w of h.weeks) {
    L.push(`## ${weekTitle(w.week)} (${weekCount(w)})`, '');
    for (const e of w.entries) L.push(`- ${e.date} · ${byLabels[e.by]} · ${md(e.gate)}: ${md(e.text)}${e.source === 'result' && e.result === 'skip' ? ' (not applicable)' : ''}`);
    if (w.arrivals.length) {
      if (w.entries.length) L.push('');
      L.push('Evidence that arrived:', '');
      for (const a of w.arrivals) L.push(`- ${a.date} · ${md(a.party)} · for “${md(a.stepText)}”: ${a.pieces.length} of ${a.total} (${a.pieces.map(md).join('; ')})${a.unlocks?.some(u => !u.done) ? `; then unlocks ${a.unlocks.filter(u => !u.done).map(u => `“${md(u.text)}”`).join(', ')}` : ''}`);
    }
    L.push('');
  }
  if (h.baseline.length) {
    L.push(`## Already done when the checklist started${h.started ? ` (${h.started})` : ''}`, '');
    for (const e of h.baseline) L.push(`- ${byLabels[e.by]} · ${md(e.gate)}: ${md(e.text)}`);
    L.push('');
  }
  if (h.undatedEvidence?.length) {
    L.push('## Evidence ticked without an “Arrived” date', '');
    for (const a of h.undatedEvidence) L.push(`- ${md(a.party)} · for “${md(a.stepText)}”: ${undatedLine(a)}`);
    L.push('');
  }
  if (h.undated.length) {
    L.push('## Finished, date not recorded', '');
    for (const e of h.undated) L.push(`- ${byLabels[e.by]} · ${md(e.gate)}: ${md(e.text)}`);
    L.push('');
  }
  L.push('Checklist dates are the day the step was recorded as done in the FYNX launch checklist. Evidence dates are the “Arrived” dates entered in one browser; evidence alone does not mark a step done. Owner results are the time they were recorded in one browser. No notes are included. FYNX Wallet is not launched; public sign-up stays on the waitlist.');
  return L.join('\n');
}

// Checklist steps (any party) recorded done within the last `days` days up to `today`, newest first.
export function checklistDoneIn(plan, { today, days = 7 } = {}) {
  if (!validDate(today)) return [];
  const from = isoDay(dayMs(today) - (days - 1) * DAY);
  return historyEntries(plan, {}).filter(e => e.source === 'checklist' && !e.baseline && e.date >= from && e.date <= today);
}
