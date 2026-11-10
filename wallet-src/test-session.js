// Test session planner: turns the owner's open launch tests into a plan for one sitting.
// The owner says how long they have and what is at hand (phone, Ledger, a test wallet …); the plan
// keeps the checklist's "after" order, puts failed tests first for a retest and fits the time.
// Pure helpers shared by the owner workspace and tests. Only step keys and times are stored.
import { stepKey, stepState, stepIndex, waitingOn, shortStep, resultLabels } from './launch-tracker.js';

export const SESSION_KEY = 'fynx-owner-test-session-v1';
export const LENGTHS = [15, 30, 60, 90];
export const MAX_MINUTES = 240;
const MAX_STEPS = 40;
export const NEEDS = {
  'test-wallet': 'A wallet app with no real money in it (for example MetaMask)',
  phone: 'Your phone or iPad',
  ledger: 'A Ledger device',
  inbox: 'Your email inbox',
  'other-google': 'A second Google account (not the owner’s)',
  team: 'Your team (two or more people)',
};
export const needShort = { 'test-wallet': 'test wallet', phone: 'phone or iPad', ledger: 'Ledger', inbox: 'email inbox', 'other-google': 'second Google account', team: 'team' };

// Owner steps that can go into a session: they carry an estimated time in launch-checklist.json.
// Decisions, sign-offs and approvals have no time and are handled elsewhere.
export const sessionable = step => step.by === 'you' && Number.isInteger(step.minutes) && step.minutes > 0;

// Problems with the minutes / needs fields. Empty when fine (used by the checklist build).
export function checkSessionFields(plan) {
  const errors = [];
  for (const gate of plan.items) for (const step of gate.steps || []) {
    const key = stepKey(gate.id, step.id);
    if (step.minutes !== undefined && (step.by !== 'you' || !Number.isInteger(step.minutes) || step.minutes < 1 || step.minutes > MAX_MINUTES)) errors.push(`${key}: "minutes" must be a whole number from 1 to ${MAX_MINUTES} on one of your steps`);
    if (step.needs !== undefined && (step.minutes === undefined || !Array.isArray(step.needs) || !step.needs.length || step.needs.some(n => !NEEDS[n]) || new Set(step.needs).size !== step.needs.length)) errors.push(`${key}: "needs" must list known items (${Object.keys(NEEDS).join(', ')}) on a step with minutes`);
  }
  return errors;
}

// Build a plan. `have`: the NEEDS keys at hand. Failed tests come first (retest), then checklist order.
// A step joins when everything it waits for is done or already earlier in this plan, and it fits the time left.
export function planSession(plan, records, { minutes = 30, have = [] } = {}) {
  const index = stepIndex(plan), at = new Set(have), budget = Math.max(0, Math.min(MAX_MINUTES, Number(minutes) || 0));
  const open = [];
  for (const gate of plan.items) for (const step of gate.steps || []) {
    if (!sessionable(step)) continue;
    const state = stepState(gate, step, records);
    if (state !== 'done') open.push({ key: stepKey(gate.id, step.id), gate, step, minutes: step.minutes, needs: step.needs || [], retest: state === 'failed' });
  }
  const ordered = [...open.filter(o => o.retest), ...open.filter(o => !o.retest)];
  const chosen = [], inPlan = new Set();
  let used = 0, changed = true;
  while (changed) {
    changed = false;
    for (const o of ordered) {
      if (inPlan.has(o.key) || o.needs.some(n => !at.has(n))) continue;
      if (waitingOn(plan, records, o.key, index).some(({ gate, step }) => !inPlan.has(stepKey(gate.id, step.id)))) continue;
      if (used + o.minutes > budget) continue;
      chosen.push(o); inPlan.add(o.key); used += o.minutes; changed = true;
    }
  }
  const gear = [], noTime = [], waiting = [];
  for (const o of ordered) {
    if (inPlan.has(o.key)) continue;
    const missing = o.needs.filter(n => !at.has(n));
    const on = waitingOn(plan, records, o.key, index).filter(({ gate, step }) => !inPlan.has(stepKey(gate.id, step.id)));
    if (missing.length) gear.push({ ...o, missing });
    else if (on.length) waiting.push({ ...o, on });
    else noTime.push(o);
  }
  const elsewhere = plan.items.reduce((n, gate) => n + (gate.steps || []).filter(s => s.by === 'you' && !sessionable(s) && stepState(gate, s, records) !== 'done').length, 0);
  return { minutes: budget, steps: chosen, total: used, left: budget - used, gear, noTime, waiting, elsewhere, openTests: open.length };
}

// Stored session: { keys, minutes, have, started, finished }. Unknown keys and needs are dropped.
export function cleanSession(raw, plan) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const index = stepIndex(plan);
  const keys = Array.isArray(raw.keys) ? [...new Set(raw.keys.filter(k => typeof k === 'string' && index.has(k) && sessionable(index.get(k).step)))].slice(0, MAX_STEPS) : [];
  if (!keys.length || !Number.isFinite(raw.started) || raw.started <= 0) return null;
  const minutes = Number.isInteger(raw.minutes) && raw.minutes > 0 && raw.minutes <= MAX_MINUTES ? raw.minutes : 30;
  const have = Array.isArray(raw.have) ? [...new Set(raw.have.filter(n => NEEDS[n]))] : [];
  const finished = Number.isFinite(raw.finished) && raw.finished >= raw.started ? raw.finished : 0;
  return { keys, minutes, have, started: raw.started, finished };
}
export function startSession(planned, { minutes, have = [], now = Date.now() } = {}) {
  return { keys: planned.steps.map(s => s.key), minutes: planned.minutes || minutes || 30, have: [...have], started: now, finished: 0 };
}

// Where the session stands. A step counts as recorded in this session when its result was saved after
// the session started (an older failure being retested is not "recorded" until it is tested again).
export function sessionProgress(session, plan, records) {
  const index = stepIndex(plan), rows = [];
  for (const key of session?.keys || []) {
    const entry = index.get(key); if (!entry) continue;
    const rec = records[key], state = stepState(entry.gate, entry.step, records);
    const recorded = Boolean(rec?.result) && (rec.at || 0) >= session.started;
    rows.push({ key, gate: entry.gate, step: entry.step, minutes: entry.step.minutes, needs: entry.step.needs || [], result: recorded ? rec.result : '', recorded, state });
  }
  const recorded = rows.filter(r => r.recorded);
  const count = r => recorded.filter(x => x.result === r).length;
  const current = rows.find(r => !r.recorded) || null;
  return {
    rows, current, total: rows.length, recorded: recorded.length,
    passed: count('pass'), failed: count('fail'), skipped: count('skip'),
    minutesLeft: rows.filter(r => !r.recorded).reduce((n, r) => n + r.minutes, 0),
    complete: rows.length > 0 && recorded.length === rows.length,
  };
}

const md = s => String(s).replace(/\s+/g, ' ').replace(/([\\`*_[\]<>|])/g, '\\$1').trim();
const stamp = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const haveLine = have => have.length ? have.map(n => needShort[n]).join(', ') : 'nothing extra';

// A plan to print or keep beside you (before starting). No notes, addresses or transaction IDs.
export function planMarkdown(planned, { have = [], date = new Date() } = {}) {
  const L = ['# FYNX Wallet: test session plan', '', `Made ${stamp(date.getTime())} UTC. Time: ${planned.minutes} minutes. With you: ${haveLine(have)}.`, ''];
  if (!planned.steps.length) L.push('Nothing fits this session. Try more time or tick what you have with you.');
  else {
    L.push(`${planned.steps.length} ${planned.steps.length === 1 ? 'test' : 'tests'}, about ${planned.total} minutes. Record each result in Launch readiness as you go.`, '');
    planned.steps.forEach((s, i) => L.push(`${i + 1}. [ ] ${s.retest ? 'Retest: ' : ''}${md(s.step.text)} (${md(s.gate.title)}, about ${s.minutes} min)`));
  }
  if (planned.gear.length) L.push('', `Left out, needs something you did not tick: ${planned.gear.map(s => `${md(shortStep(s.step))} (${s.missing.map(n => needShort[n]).join(', ')})`).join('; ')}.`);
  if (planned.noTime.length) L.push('', `Left out for time: ${planned.noTime.length} ${planned.noTime.length === 1 ? 'test' : 'tests'} (about ${planned.noTime.reduce((n, s) => n + s.minutes, 0)} minutes).`);
  L.push('', 'Contains no keys, recovery phrases or passwords.');
  return `${L.join('\n')}\n`;
}

// Results of a session (results only, no notes), to share so the checklist evidence can be updated.
export function sessionSummary(session, plan, records, { date = new Date() } = {}) {
  const p = sessionProgress(session, plan, records);
  const L = ['# FYNX Wallet: test session results', '', `Session started ${stamp(session.started)} UTC${session.finished ? `, finished ${stamp(session.finished)} UTC` : `, summary made ${stamp(date.getTime())} UTC`}. Planned: ${p.total} ${p.total === 1 ? 'test' : 'tests'} in ${session.minutes} minutes. With you: ${haveLine(session.have)}.`, '',
    `Recorded ${p.recorded} of ${p.total}: ${p.passed} passed, ${p.failed} failed, ${p.skipped} not applicable.`, ''];
  for (const r of p.rows) L.push(`- ${r.recorded ? resultLabels[r.result] : 'Not recorded'}: ${md(shortStep(r.step))} (${md(r.gate.title)})`);
  if (p.failed) L.push('', 'Failed tests come first in the next session for a retest.');
  L.push('', 'Notes and transaction IDs are in the full test report (Launch readiness → Copy test report). Contains no keys, recovery phrases or passwords.');
  return `${L.join('\n')}\n`;
}
