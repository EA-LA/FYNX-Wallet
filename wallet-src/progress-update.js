// "Progress update": a short, plain-language note on how the launch is going over the last 7, 14 or 30
// days, for the team, a co-founder, an adviser or an investor. Built only from what the owner workspace
// already keeps in this browser: launch test results (times), outside-party request dates, the waitlist
// privacy request log (counts only), incident practice follow-ups (counts only) and "Your dates".
// Only fixed words travel into the update: gate titles, checklist step text, party names, request types and
// counts or dates. Notes, references, names typed into worksheets, email and wallet addresses stay out.
// Pure helpers shared by the owner workspace and tests.
import { stepKey, stepState, shortStep, overview, nextActions, resultLabels } from './launch-tracker.js';
import { partyStatus } from './outside-handoff.js';
import { requestId, requestState as outsideState } from './outside-requests.js';
import { requestState as privacyState, dayNumber, dayString } from './privacy-requests.js';
import { followUpProgress } from './incident-drill.js';
import { launchPace } from './test-timing.js';
import { KINDS as DATE_KINDS } from './owner-dates.js';

export const PERIODS = [7, 14, 30];
export const AHEAD_DAYS = 14;
const DAY = 86400000;
const plural = (n, w, many = `${w}s`) => `${n} ${n === 1 ? w : many}`;
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const md = s => clean(s).replace(/([\\`*_[\]<>|])/g, '\\$1');
const utcDay = ms => new Date(ms).toISOString().slice(0, 10);

// Inside the period: the last `days` calendar days up to and including `today` (dates), or the last
// `days` × 24 hours up to `now` (result times).
const dayIn = (date, today, days) => {
  const d = dayNumber(date), t = dayNumber(today);
  return d !== null && t !== null && d <= t && d > t - days;
};

export function progressUpdate({ plan, records = {}, answers = {}, requests = { entries: {} }, privacy = { entries: [] }, drill = null, dates = null, timings = {}, days = 7, today, now = Date.now() } = {}) {
  if (!PERIODS.includes(days)) days = 7;
  const from = dayNumber(today) === null ? '' : dayString(dayNumber(today) - days + 1);
  const since = now - days * DAY;
  const o = overview(plan, records);

  // Owner steps finished (Passed / Not applicable) in the period, and the percentage before them.
  const finished = [], failed = [];
  for (const gate of plan.items) for (const step of gate.steps || []) {
    if (step.by !== 'you' || step.done) continue;
    const key = stepKey(gate.id, step.id), rec = records[key], state = stepState(gate, step, records);
    const at = Number.isFinite(rec?.at) ? rec.at : 0;
    if (state === 'done' && at > since && at <= now) finished.push({ key, gate: gate.title, text: shortStep(step), result: rec.result, at });
    if (state === 'failed') failed.push({ key, gate: gate.title, text: shortStep(step), at, recent: at > since && at <= now });
  }
  finished.sort((a, b) => b.at - a.at || a.key.localeCompare(b.key));
  failed.sort((a, b) => b.at - a.at || a.key.localeCompare(b.key));
  const startDone = o.done - finished.length;
  const startPercent = o.total ? Math.round(startDone / o.total * 100) : 0;

  const next = nextActions(plan, records, 3).map(({ gate, step, failed: f, waiting }) => ({ key: stepKey(gate.id, step.id), gate: gate.title, text: shortStep(step), failed: f, waiting }));

  // Outside parties: requests waiting for an answer (open steps only) and answers that came in the period.
  const outside = [], parties = partyStatus(plan, records, answers);
  for (const s of parties) {
    const rows = [];
    for (const r of s.rows) {
      if (r.state === 'not-needed') continue;
      const e = requests.entries?.[requestId(s.party.id, r.key)];
      if (!e?.sent) continue;
      const st = outsideState(e, today), text = shortStep(r.step);
      if (st.state === 'answered') { if (dayIn(e.answered, today, days)) rows.push({ key: r.key, text, state: 'answered', sent: e.sent, answered: e.answered, days: st.days }); }
      else if (r.state !== 'done') rows.push({ key: r.key, text, state: st.state, sent: e.sent, days: st.days, chaseOn: st.chaseOn, newlySent: dayIn(e.sent, today, days) });
    }
    if (rows.length) outside.push({ id: s.party.id, name: s.party.name, rows });
  }
  const notAsked = parties.flatMap(s => s.rows.filter(r => r.state === 'ready' && !requests.entries?.[requestId(s.party.id, r.key)]?.sent).map(r => ({ party: s.party.name, text: shortStep(r.step) })));

  // Waitlist privacy requests: counts only (no references or notes).
  const pv = { received: 0, answered: 0, open: 0, overdue: 0 };
  for (const e of privacy.entries || []) {
    if (dayIn(e.received, today, days)) pv.received += 1;
    if (e.answered && dayIn(e.answered, today, days)) pv.answered += 1;
    if (!e.answered) { pv.open += 1; if (privacyState(e, today).state === 'overdue') pv.overdue += 1; }
  }

  const fu = followUpProgress(drill || { history: [] });
  const drills = (drill?.history || []).filter(r => r.finishedAt > since && r.finishedAt <= now).length;

  // Dated items: everything overdue and everything due in the next AHEAD_DAYS days.
  const coming = (dates?.items || []).filter(i => i.left !== null && i.left <= AHEAD_DAYS).map(i => ({ date: i.date, when: i.when, state: i.state, kind: DATE_KINDS[i.kind] || '', title: i.title }));

  const pace = launchPace(plan, records, { now, log: timings });
  return {
    days, from, to: today, product: plan.product,
    overall: { done: o.done, total: o.total, percent: o.percent, startDone, startPercent, yours: o.yours, yoursDone: o.yoursDone, failed: o.failed, gates: o.gates, gatesDone: o.counts.done },
    finished, failed, next, outside, notAsked, privacy: pv, followUps: { open: fu.total - fu.done, total: fu.total }, drills, coming,
    pace: { forecast: pace.forecast, reason: pace.reason, open: pace.open, perWeek: pace.perWeek, last28: pace.last28 },
  };
}

// One sentence for a chat message or the top of an email.
export function updateHeadline(u) {
  const parts = [`${u.product} launch: ${u.overall.percent}% of launch steps done (${u.overall.done} of ${u.overall.total})`];
  const moved = u.overall.percent - u.overall.startPercent;
  parts[0] += moved > 0 ? `, up ${moved} ${moved === 1 ? 'point' : 'points'} in the last ${u.days} days.` : `, unchanged in the last ${u.days} days.`;
  const bits = [];
  bits.push(u.finished.length ? `${plural(u.finished.length, 'step')} finished` : 'no steps finished');
  if (u.failed.length) bits.push(`${plural(u.failed.length, 'test')} to retest`);
  const waiting = u.outside.reduce((n, p) => n + p.rows.filter(r => r.state !== 'answered').length, 0);
  if (waiting) bits.push(`${plural(waiting, 'request')} waiting on outside parties`);
  const overdue = u.coming.filter(c => c.state === 'overdue').length;
  if (overdue) bits.push(`${overdue} overdue ${overdue === 1 ? 'date' : 'dates'}`);
  return `${parts[0]} ${bits.join(', ').replace(/^./, c => c.toUpperCase())}.`;
}

export function paceSentence(u) {
  const p = u.pace;
  if (p.forecast) return `At the current pace (${p.perWeek} a week over the last 4 weeks), the owner's ${plural(p.open, 'open step')} take about ${plural(p.forecast.weeks, 'week')} (around ${utcDay(p.forecast.date.getTime())}). Engineering and outside parties are not in this estimate.`;
  if (p.reason === 'done') return 'All of the owner’s own steps are finished; what remains is with engineering and outside parties.';
  if (p.reason === 'not-started') return 'No owner test results recorded yet, so there is no pace estimate.';
  return `Fewer than two owner steps finished in the last 4 weeks, so there is no pace estimate yet (${plural(p.open, 'open step')}).`;
}

const outsideLine = r => r.state === 'answered'
  ? `${md(r.text)}: answered ${r.answered} (${r.days ? `after ${plural(r.days, 'day')}` : 'same day'}).`
  : r.state === 'chase'
    ? `${md(r.text)}: asked ${r.sent}, no answer after ${plural(r.days, 'day')}; a reminder is due.`
    : `${md(r.text)}: asked ${r.sent}${r.newlySent ? ' (this period)' : ''}, waiting ${r.days ? plural(r.days, 'day') : 'since today'}; reminder from ${r.chaseOn} if still unanswered.`;

// The full update as Markdown (pastes cleanly into email, Slack, Notion or a Google Doc).
export function updateMarkdown(u, { generated = new Date() } = {}) {
  const L = [`# ${md(u.product)} launch progress update`, '', `Period: last ${u.days} days (${u.from} to ${u.to}). Written ${generated.toISOString().slice(0, 16).replace('T', ' ')} UTC.`, '', updateHeadline(u), ''];
  L.push('## Where things stand', '');
  L.push(`- ${u.overall.done} of ${u.overall.total} launch steps done (${u.overall.percent}%)${u.overall.percent !== u.overall.startPercent ? `, up from ${u.overall.startPercent}% at the start of the period` : ''}. ${u.overall.gatesDone} of ${u.overall.gates} release gates fully done.`);
  L.push(`- Owner tests and decisions: ${u.overall.yoursDone} of ${u.overall.yours} done${u.overall.failed ? `, ${u.overall.failed} failed and waiting for a retest` : ''}.`);
  L.push(`- ${paceSentence(u)}`, '');
  L.push(`## Finished in the last ${u.days} days`, '');
  if (u.finished.length) for (const f of u.finished) L.push(`- ${md(f.gate)}: ${md(f.text)} (${resultLabels[f.result]}, ${utcDay(f.at)})`);
  else L.push('- Nothing finished in this period.');
  L.push('');
  if (u.failed.length) {
    L.push('## Needs a retest', '');
    for (const f of u.failed) L.push(`- ${md(f.gate)}: ${md(f.text)}${f.at ? ` (failed ${utcDay(f.at)}${f.recent ? ', this period' : ''})` : ''}`);
    L.push('');
  }
  L.push('## Next for the owner', '');
  if (u.next.length) for (const n of u.next) L.push(`- ${n.failed ? 'Retest: ' : ''}${md(n.gate)}: ${md(n.text)}${n.waiting && !n.failed ? ' (waits on another step first)' : ''}`);
  else L.push('- All owner steps are recorded.');
  L.push('');
  L.push('## Outside parties', '');
  if (u.outside.length) {
    for (const p of u.outside) { L.push(`- **${md(p.name)}**`); for (const r of p.rows) L.push(`  - ${outsideLine(r)}`); }
  } else L.push('- No requests recorded as sent yet.');
  if (u.notAsked.length) L.push(`- Ready to ask but not sent yet: ${u.notAsked.map(n => `${md(n.text)} (${md(n.party)})`).join('; ')}.`);
  L.push('');
  L.push(`## Dates in the next ${AHEAD_DAYS} days`, '');
  if (u.coming.length) for (const c of u.coming) L.push(`- ${c.date} · ${c.when} · ${md(c.kind)}: ${md(c.title)}`);
  else L.push('- Nothing due.');
  L.push('');
  L.push('## Operations', '');
  L.push(`- Waitlist privacy requests: ${u.privacy.received} received and ${u.privacy.answered} answered in this period; ${u.privacy.open} open${u.privacy.overdue ? `, ${u.privacy.overdue} past FYNX’s 30-day target` : ''}.`);
  L.push(`- Incident practice: ${u.drills ? `${plural(u.drills, 'run')} finished in this period` : 'no run in this period'}; ${u.followUps.total ? `${u.followUps.open} of ${plural(u.followUps.total, 'follow-up')} still open` : 'no follow-ups recorded'}.`);
  L.push('');
  L.push('Prepared in the FYNX owner workspace from results recorded in one browser. No notes, references, email addresses, wallet addresses or keys are included. FYNX Wallet is not launched; public sign-up stays on the waitlist.');
  return L.join('\n');
}

