// Incident practice run: pure helpers shared by the Launch readiness tab and tests.
// A facilitator walks the team through one made-up incident, stage by stage, using the written
// procedure in docs/OPERATIONS.md. Everything stays in this browser (localStorage). A finished run
// with at least two people records the "operations/drill" launch step as Passed with a short note.
import { looksSecret, stepKey } from './launch-tracker.js';

export const DRILL_KEY = 'fynx-owner-incident-drill-v1';
export const DRILL_STEP = stepKey('operations', 'drill');
export const MIN_PEOPLE = 2;
const MAX_NAME = 60, MAX_FOLLOW = 140, MAX_PEOPLE = 12, MAX_HISTORY = 5, NOTE_MAX = 280;
const REPO = 'https://github.com/EA-LA/FYNX-Wallet/blob/main/docs';

// The seven stages follow "Incident response" in docs/OPERATIONS.md, in order.
export const STAGES = [
  { id: 'record', title: 'Write down what is happening', procedure: 'Record the UTC start time, the affected function or page and its version, what people see, and any request IDs. Never paste tokens, email addresses, signatures or keys into a public GitHub issue.' },
  { id: 'contain', title: 'Contain only what is affected', procedure: 'Contain only the affected FYNX Wallet service: hide wallet actions in the frontend or deploy a deny-all handler to fynxWalletWorkspace. Do not switch off unrelated services in the shared project or rewrite shared rules. Keep the public waitlist up if it is not affected.' },
  { id: 'accounts', title: 'Protect accounts and wallets', procedure: 'For an owner account compromise: in Firebase Authentication disable the account or revoke its sessions, remove compromised passkeys, and recover the Google account through Google’s official process. Signing out in a browser does not revoke a stolen token. For a wallet compromise, follow the wallet maker’s recovery process. FYNX cannot reverse on-chain signatures or recover a phrase, and never asks for one.' },
  { id: 'evidence', title: 'Keep the evidence', procedure: 'Preserve the restricted logs and deployment records. Compare the source code, function revisions, access permissions (IAM), sign-in domains and App Check settings with the release records. Check other apps in the shared project if their credentials may be affected.' },
  { id: 'notify', title: 'Decide who must be told', procedure: 'Ask counsel whether anyone must be notified, for the places actually affected. Do not promise a deadline that applies everywhere, and do not call it harmless without evidence.' },
  { id: 'retest', title: 'Retest before reopening', procedure: 'Before reopening, retest that access is refused to others, signatures, challenge replay protection, passkeys and failed writes.' },
  { id: 'close', title: 'Close it out', procedure: 'Record the cause, what was changed to stop it happening again, and the owner’s approval to reopen.' },
];

// Made-up situations. Each prompt asks the team what they would do at that stage.
export const SCENARIOS = [
  {
    id: 'account', title: 'Strange sign-in to the owner account',
    story: 'At 21:40 your phone shows a Google security alert: a new sign-in to the owner account from a city you have never been to. Ten minutes later a passkey you do not recognise appears in Account security.',
    prompts: {
      record: 'What do you write down first, and where? Who is told?',
      contain: 'Does the public waitlist need to go offline? What do you switch off, and what do you leave running?',
      accounts: 'Which three things do you do in Firebase and Google to lock the intruder out? Why is “Sign out & exit” not enough?',
      evidence: 'Which logs and settings do you look at to see what the intruder could have done?',
      notify: 'Waitlist emails may have been viewed. Who decides whether anyone must be told?',
      retest: 'How do you prove the strange passkey and the old sessions no longer work?',
      close: 'What would stop this happening again (for example a second passkey kept somewhere safe)?',
    },
  },
  {
    id: 'outage', title: 'Waitlist sign-ups failing all evening',
    story: 'A friend texts: “your waitlist says something went wrong”. Cloud Logging shows hundreds of “Waitlist persistence failed” lines since 18:05 UTC, right after a change was published.',
    prompts: {
      record: 'What exactly do you note about the failure (time, function, version, sample request IDs)?',
      contain: 'Do you roll back, hide the form, or leave it? What must not be touched in the shared project?',
      accounts: 'Is any account or wallet at risk here? How do you check rather than assume?',
      evidence: 'How do you find which release introduced the failure and what changed in it?',
      notify: 'People who tried to join were not saved. Is there anything you must or should tell them?',
      retest: 'What do you test before calling the waitlist fixed (a real sign-up, a duplicate, a bad email)?',
      close: 'Which alert would have told you before your friend did?',
    },
  },
  {
    id: 'phishing', title: 'A fake FYNX site asking for recovery phrases',
    story: 'A waitlist member forwards a link to a site that copies the FYNX design and asks visitors to “verify” their wallet by typing their 12 words. It is being shared on social media.',
    prompts: {
      record: 'What do you capture about the fake site without typing anything into it?',
      contain: 'Where do you report it (for example the hosting company and Google Safe Browsing), and what warning goes on the official site?',
      accounts: 'Someone already typed their phrase in. What do you tell them, given FYNX cannot recover or freeze a wallet?',
      evidence: 'Is anything on the real FYNX side affected? How do you check?',
      notify: 'Do you email the waitlist? Who approves the wording?',
      retest: 'How do you confirm the fake site is down or flagged in browsers?',
      close: 'What would make the next fake easier to spot (for example the official addresses on the Security page)?',
    },
  },
  {
    id: 'export', title: 'Waitlist file sent to the wrong person',
    story: 'A CSV download of the waitlist with email addresses was attached to an email sent to an outside address by mistake. The recipient has not replied.',
    prompts: {
      record: 'What do you note: when, which file, how many addresses, who received it?',
      contain: 'What do you ask the recipient to do, and how do you confirm it was done?',
      accounts: 'Could anyone use this file to get into the owner account or a wallet? Why or why not?',
      evidence: 'Which records show who downloaded the file and when?',
      notify: 'Who decides whether the people on the list, or a regulator, must be told, and by when?',
      retest: 'What would you change about who can download the list?',
      close: 'How should waitlist files be shared in future, if at all?',
    },
  },
  {
    id: 'pilot', title: 'Pilot transfers do not add up',
    story: 'Day three of the pilot. The reconciliation in Crypto tools says “Needs a look”: a 240 USDC transfer on Base that nobody remembers starting, above your 50 USDC limit, and the USDC balance is 240 below what the history explains. The rollback plan is in docs/PILOT-ROLLBACK.md.',
    prompts: {
      record: 'What do you write down first (UTC time, network, the transaction ID, the saved reconciliation report)? Who is told?',
      contain: 'Which switch do you turn off first, and what happens to a transfer someone is reviewing right now? What if the workspace itself cannot be reached?',
      accounts: 'FYNX cannot reverse an on-chain transfer. What do you check about the owner account, passkeys and the connected wallet, and what do you tell the pilot user?',
      evidence: 'Which records show who changed the limits or turned sending on (the audit log), and which release was live at the time?',
      notify: 'What does the message to the pilot group say, and what must it not promise? Who decides whether anyone else must be told?',
      retest: 'What must the reconciliation show before reopening, and who signs off in writing?',
      close: 'What would have caught this sooner (daily reconciliation, an alert, lower limits)?',
    },
  },
];
export const findScenario = id => SCENARIOS.find(s => s.id === id) || null;
export const RESULTS = { handled: 'We knew what to do', gap: 'Gap found' };

const clean = (raw, max) => {
  const v = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!v || looksSecret(v)) return '';
  return v.replace(/[<>]/g, '').slice(0, max);
};
export const cleanName = raw => clean(raw, MAX_NAME);
export const cleanFollowUp = raw => clean(raw, MAX_FOLLOW);

// Split "Elham, co-founder; support" into a short list of people (names or roles), without duplicates.
export function parsePeople(raw) {
  const out = [];
  for (const part of String(raw ?? '').split(/[,;\n]+/)) {
    const v = cleanName(part);
    if (v && !out.some(p => p.toLowerCase() === v.toLowerCase())) out.push(v);
    if (out.length >= MAX_PEOPLE) break;
  }
  return out;
}

function cleanRun(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !findScenario(raw.scenario)) return null;
  const answers = {};
  if (raw.answers && typeof raw.answers === 'object' && !Array.isArray(raw.answers)) {
    for (const s of STAGES) {
      const a = raw.answers[s.id];
      if (!a || typeof a !== 'object' || !RESULTS[a.result]) continue;
      answers[s.id] = { result: a.result, followUp: cleanFollowUp(a.followUp) };
      if (answers[s.id].followUp && Number.isFinite(a.doneAt) && a.doneAt > 0) answers[s.id].doneAt = a.doneAt;
    }
  }
  const people = Array.isArray(raw.people) ? parsePeople(raw.people.join(',')) : [];
  const num = v => (Number.isFinite(v) && v > 0 ? v : 0);
  const run = { scenario: raw.scenario, people, startedAt: num(raw.startedAt), answers };
  if (num(raw.finishedAt) && num(raw.finishedAt) >= run.startedAt) run.finishedAt = raw.finishedAt;
  return run;
}

// Keep only a valid current run and up to five finished runs.
export function cleanDrill(raw) {
  const out = { current: null, history: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  out.current = cleanRun(raw.current);
  if (out.current?.finishedAt) out.current = null;
  if (Array.isArray(raw.history)) out.history = raw.history.map(cleanRun).filter(r => r && r.finishedAt).slice(0, MAX_HISTORY);
  return out;
}

export function startRun(scenarioId, peopleText, now = Date.now()) {
  if (!findScenario(scenarioId)) return null;
  return { scenario: scenarioId, people: parsePeople(peopleText), startedAt: now, answers: {} };
}

export function answerStage(run, stageId, result, followUp = '') {
  if (!run || !STAGES.some(s => s.id === stageId) || !RESULTS[result]) return run;
  return { ...run, answers: { ...run.answers, [stageId]: { result, followUp: cleanFollowUp(followUp) } } };
}

export const currentStage = run => (run ? STAGES.find(s => !run.answers[s.id]) || null : null);
export const minutesBetween = (from, to) => (from && to && to >= from ? Math.max(1, Math.round((to - from) / 60000)) : 0);

// What the run adds up to, and whether it can count as the team practice run.
export function runSummary(run, now = Date.now()) {
  if (!run) return null;
  const answered = STAGES.filter(s => run.answers[s.id]);
  const gaps = STAGES.filter(s => run.answers[s.id]?.result === 'gap');
  const followUps = STAGES.map(s => ({ stage: s, text: run.answers[s.id]?.followUp || '' })).filter(f => f.text);
  const complete = answered.length === STAGES.length;
  const reasons = [];
  if (!complete) reasons.push(`${STAGES.length - answered.length} of ${STAGES.length} stages still to discuss.`);
  if (run.people.length < MIN_PEOPLE) reasons.push(`Add at least ${MIN_PEOPLE} people (names or roles): the practice run is for your team, not one person.`);
  const gapsWithout = gaps.filter(s => !run.answers[s.id].followUp);
  if (gapsWithout.length) reasons.push(`Write a follow-up for every gap (${gapsWithout.map(s => s.title.toLowerCase()).join(', ')}).`);
  return {
    scenario: findScenario(run.scenario), total: STAGES.length, answered: answered.length, handled: answered.length - gaps.length,
    gaps, followUps, complete, minutes: minutesBetween(run.startedAt, run.finishedAt || now), canRecord: reasons.length === 0, reasons,
  };
}

// Short note stored on the launch step (fits the 280-character note limit).
export function drillNote(run, now = Date.now()) {
  const s = runSummary(run, now); if (!s) return '';
  const follow = s.followUps.length ? ` Follow-ups: ${s.followUps.map(f => f.text).join('; ')}` : ' No gaps found.';
  const text = `Practice run: ${s.scenario.title}; ${run.people.length} people; ${s.minutes} min; ${s.handled}/${s.total} stages handled.${follow}`;
  return text.length <= NOTE_MAX ? text : `${text.slice(0, NOTE_MAX - 1)}…`;
}

const md = s => String(s).replace(/\s+/g, ' ').replace(/([\\`*_[\]<>|])/g, '\\$1').trim();
const stamp = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

// A record of one run for the team, the engineer or Claude. Contains only what the owner typed.
export function drillRecord(plan, run, now = Date.now()) {
  const s = runSummary(run, now); if (!s) return '';
  const L = [`# ${plan.product} incident practice run`, '',
    `Scenario: ${md(s.scenario.title)}`,
    `Started: ${run.startedAt ? `${stamp(run.startedAt)} UTC` : 'not recorded'}${run.finishedAt ? ` · finished ${stamp(run.finishedAt)} UTC` : ''} · ${s.minutes} min`,
    `People: ${run.people.length ? run.people.map(md).join(', ') : 'none listed'}`,
    `Result: ${s.handled} of ${s.total} stages handled, ${s.gaps.length} gap${s.gaps.length === 1 ? '' : 's'}${s.complete ? '' : ' (not finished)'}.`, '',
    `> ${md(s.scenario.story)}`, '',
    '| Stage | Outcome | Follow-up |', '| --- | --- | --- |'];
  for (const stage of STAGES) {
    const a = run.answers[stage.id];
    L.push(`| ${md(stage.title)} | ${a ? (a.result === 'gap' ? 'Gap found' : 'Handled') : 'Not discussed'} | ${a?.followUp ? `${md(a.followUp)}${a.doneAt ? ` (done ${stamp(a.doneAt).slice(0, 10)})` : ''}` : '—'} |`);
  }
  L.push('', `Procedure used: ${REPO}/OPERATIONS.md#incident-response`, '', 'This was a practice discussion of a made-up situation, not a real incident. Recorded by the owner in the FYNX workspace; contains no keys, recovery phrases or passwords.');
  return L.join('\n');
}

// Finish the current run: it moves to the history (newest first) and the current slot is cleared.
export function finishRun(drill, now = Date.now()) {
  if (!drill.current) return drill;
  const done = { ...drill.current, finishedAt: Math.max(now, drill.current.startedAt || now) };
  return { current: null, history: [done, ...drill.history].slice(0, MAX_HISTORY) };
}

// Follow-ups from finished runs, as a to-do list the owner ticks off later (newest run first, open items first).
export function followUpList(drill) {
  const items = [];
  for (const run of drill?.history || []) {
    const scenario = findScenario(run.scenario);
    for (const stage of STAGES) {
      const a = run.answers[stage.id];
      if (a?.followUp) items.push({ runAt: run.finishedAt, scenario, stage, text: a.followUp, gap: a.result === 'gap', doneAt: a.doneAt || 0 });
    }
  }
  return [...items.filter(i => !i.doneAt), ...items.filter(i => i.doneAt)];
}

export function followUpProgress(drill) {
  const items = followUpList(drill);
  return { total: items.length, done: items.filter(i => i.doneAt).length };
}

// Mark one follow-up done (doneAt = time) or open again (doneAt = 0). Runs are identified by their finish time.
export function setFollowUpDone(drill, runAt, stageId, doneAt) {
  let changed = false;
  const history = (drill?.history || []).map(run => {
    const a = run.finishedAt === runAt ? run.answers[stageId] : null;
    if (!a?.followUp) return run;
    changed = true;
    const next = { ...a }; if (doneAt > 0) next.doneAt = doneAt; else delete next.doneAt;
    return { ...run, answers: { ...run.answers, [stageId]: next } };
  });
  return changed ? { ...drill, history } : drill;
}

// A short list of the still-open follow-ups to share with the team.
export function followUpText(plan, drill, now = Date.now()) {
  const items = followUpList(drill), open = items.filter(i => !i.doneAt);
  const L = [`# ${plan.product} practice-run follow-ups`, '', `Date: ${stamp(now)} UTC`, `Open: ${open.length} of ${items.length}.`, ''];
  for (const i of items) L.push(`- [${i.doneAt ? 'x' : ' '}] ${md(i.text)} (${md(i.stage.title)}; ${md(i.scenario?.title || 'practice run')}, ${stamp(i.runAt).slice(0, 10)})${i.doneAt ? ` done ${stamp(i.doneAt).slice(0, 10)}` : ''}`);
  if (!items.length) L.push('No follow-ups yet.');
  return L.join('\n');
}

// Finished practice runs (with their follow-ups and tick-offs) travel between devices inside the launch
// test report. Runs are matched by scenario and finish time (to the minute). A follow-up ticked off on
// any device stays ticked; the people and answers of a finished run do not change.
export const DRILL_SECTION = 'Incident practice runs';
const unmd = s => String(s).replace(/\\([\\`*_[\]<>|])/g, '$1').replace(/\s+/g, ' ').trim();
const minute = ms => Math.floor((ms || 0) / 60000);
const runKey = run => `${run.scenario}@${minute(run.finishedAt)}`;
const resultText = { handled: 'Handled', gap: 'Gap found' };

export function drillReportLines(drill) {
  const runs = (drill?.history || []).filter(r => r.finishedAt && findScenario(r.scenario));
  if (!runs.length) return [];
  const L = [`## ${DRILL_SECTION}`, '', 'Finished practice runs with their follow-ups, so they can be brought into another browser.', ''];
  for (const run of runs) {
    L.push(`### ${md(findScenario(run.scenario).title)} (finished ${stamp(run.finishedAt)} UTC)`, '');
    if (run.startedAt) L.push(`- Started: ${stamp(run.startedAt)} UTC`);
    L.push(`- People: ${run.people.length ? run.people.map(md).join(', ') : 'none listed'}`);
    for (const stage of STAGES) {
      const a = run.answers[stage.id]; if (!a) continue;
      L.push(`- ${md(stage.title)}: ${resultText[a.result]}${a.followUp ? ` · Follow-up: ${md(a.followUp)}` : ''}${a.followUp && a.doneAt ? ` · done ${stamp(a.doneAt)} UTC` : ''}`);
    }
    L.push('');
  }
  return L;
}

const RUN_HEAD = /^###\s+(.+?)\s+\(finished (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC\)\s*$/;
const DONE = /\s+·\s+done (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC$/;
const utc = (d, t) => { const v = Date.parse(`${d}T${t}:00Z`); return Number.isFinite(v) ? v : 0; };
export function parseDrillReport(text) {
  const runs = [];
  let inSection = false, run = null, unknown = 0, refused = 0;
  for (const line of String(text || '').split(/\r?\n/).slice(0, 2000)) {
    if (/^##\s/.test(line)) { inSection = unmd(line.replace(/^##\s+/, '')) === DRILL_SECTION; run = null; continue; }
    if (!inSection) continue;
    const h = line.match(RUN_HEAD);
    if (h) {
      const scenario = SCENARIOS.find(s => s.title === unmd(h[1]));
      run = scenario ? { scenario: scenario.id, people: [], startedAt: 0, finishedAt: utc(h[2], h[3]), answers: {} } : null;
      if (run) runs.push(run); else unknown += 1;
      continue;
    }
    const m = line.match(/^\s*[-*]\s+(.+)$/); if (!m || !run) { if (m) unknown += 1; continue; }
    let body = m[1].trim();
    const started = body.match(/^Started: (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC$/);
    if (started) { run.startedAt = utc(started[1], started[2]); continue; }
    if (body.startsWith('People: ')) {
      const list = body.slice(8).trim();
      if (looksSecret(unmd(list))) { refused += 1; continue; }
      run.people = list === 'none listed' ? [] : parsePeople(list.split(', ').map(unmd).join(','));
      continue;
    }
    let doneAt = 0;
    const d = body.match(DONE); if (d) { doneAt = utc(d[1], d[2]); body = body.slice(0, d.index); }
    const stage = STAGES.find(s => body.startsWith(`${md(s.title)}: `));
    const rest = stage ? body.slice(md(stage.title).length + 2) : '';
    const r = rest.match(/^(Handled|Gap found)(?: · Follow-up: (.+))?$/);
    if (!stage || !r) { unknown += 1; continue; }
    const raw = r[2] ? unmd(r[2]) : '';
    if (raw && looksSecret(raw)) refused += 1;
    const followUp = cleanFollowUp(raw);
    run.answers[stage.id] = { result: r[1] === 'Handled' ? 'handled' : 'gap', followUp, ...(followUp && doneAt ? { doneAt } : {}) };
  }
  const seen = new Set(), clean = [];
  for (const raw of runs) {
    const r = cleanDrill({ history: [raw] }).history[0];
    if (!r || seen.has(runKey(r))) { unknown += 1; continue; }
    seen.add(runKey(r)); clean.push(r);
  }
  return { runs: clean.slice(0, MAX_HISTORY), unknown, refused };
}

// Combine imported finished runs with this browser's. Returns the new drill state and what changed.
export function mergeDrills(local, incomingRuns = []) {
  const history = (local?.history || []).map(r => ({ ...r, answers: { ...r.answers } }));
  const index = new Map(history.map((r, i) => [runKey(r), i]));
  const changes = { added: [], ticked: 0, same: [] };
  for (const inc of incomingRuns) {
    const i = index.get(runKey(inc));
    if (i === undefined) { history.push(inc); index.set(runKey(inc), history.length - 1); changes.added.push(inc); continue; }
    let ticks = 0;
    const mine = history[i];
    for (const stage of STAGES) {
      const a = mine.answers[stage.id], b = inc.answers[stage.id];
      if (a?.followUp && b?.doneAt && !a.doneAt && a.followUp === b.followUp) { mine.answers[stage.id] = { ...a, doneAt: b.doneAt }; ticks += 1; }
    }
    if (ticks) changes.ticked += ticks; else changes.same.push(inc);
  }
  history.sort((a, b) => b.finishedAt - a.finishedAt);
  const kept = history.slice(0, MAX_HISTORY), keptKeys = new Set(kept.map(runKey));
  const dropped = changes.added.filter(r => !keptKeys.has(runKey(r))).length;
  return { drill: { current: local?.current || null, history: kept }, ...changes, dropped, total: history.length };
}
