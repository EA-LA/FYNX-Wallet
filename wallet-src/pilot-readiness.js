// Pilot go / no-go: pure helpers for the owner workspace Launch readiness tab and its tests.
// Before the owner gives written approval to open the pilot (checklist step pilot/approve), this
// gathers everything the workspace already knows into one list: the steps the approval waits for,
// whether the pilot limits the owner decided fit the wallet's real-money switch and its hard
// ceilings, whether the rollback was practised and a transfer from FYNX was checked, and anything
// overdue (failed tests, privacy answers, access reviews, emergency plan). It never approves
// anything by itself and never changes a setting: the owner decides and records the step.
import { stepKey, stepState, overview } from './launch-tracker.js';
import { runSummary, STAGES } from './incident-drill.js';
import { supportCheck } from './support-tally.js';

export const APPROVE_KEY = stepKey('pilot', 'approve');
export const PILOT_SCENARIO = 'pilot';
// FYNX's own hard ceilings for real-money sending during the pilot (firebase-wallet/functions/mainnet.js).
export const CEILINGS = Object.freeze({ ETH: '0.1', USDC: '250' });
const NETWORKS = { 1: 'Ethereum', 11155111: 'Ethereum Sepolia', 8453: 'Base', 84532: 'Base Sepolia' };
const SHORT = { device: 'lost device', google: 'Google account', signin: 'strange sign-in', wallet: 'wallet or phrase', phishing: 'unexpected approval', locked: 'locked out' };
export const GROUPS = [
  ['steps', 'Finished before you approve'],
  ['limits', 'Your pilot limits and the wallet'],
  ['practice', 'Rollback practised'],
  ['safety', 'Nothing overdue'],
  ['support', 'Support during the pilot'],
];
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const usd = n => `US$${Number(n).toLocaleString('en-US')}`;
const utcDay = ms => new Date(ms).toISOString().slice(0, 10);
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

function findStep(plan, key) {
  for (const gate of plan?.items || []) for (const step of gate.steps || []) if (stepKey(gate.id, step.id) === key) return { gate, step };
  return null;
}
const shortText = text => { const t = String(text || '').replace(/\s+/g, ' ').trim(); const cut = t.split(/(?<=[a-z0-9)])\.\s|:\s/i)[0]; return cut.length < t.length && cut.length > 12 ? cut : t.replace(/\.$/, ''); };

// Everything optional; a missing fact is reported honestly, never assumed fine.
export function pilotReadiness({ plan, records = {}, answers = {}, drill = null, register = null, mainnet = null, emergency = null, sheet = null, access = null, privacy = null, support = null, now = Date.now() } = {}) {
  const checks = [];
  const add = (group, state, title, detail, action = null) => checks.push({ group, state, title, detail, action });
  const approve = findStep(plan, APPROVE_KEY);
  const approved = approve ? stepState(approve.gate, approve.step, records) === 'done' : false;

  // 1. The steps the approval waits for, as listed in the launch checklist.
  for (const key of approve?.step?.after || []) {
    const entry = findStep(plan, key); if (!entry) continue;
    const st = stepState(entry.gate, entry.step, records), who = entry.step.by === 'you' ? 'you' : entry.step.by === 'outside' ? 'an outside party' : 'engineering';
    if (st === 'done') add('steps', 'ok', shortText(entry.step.text), `${entry.gate.title}: done.`, { kind: 'step', key });
    else add('steps', 'block', shortText(entry.step.text), `${entry.gate.title}: ${st === 'failed' ? 'your last result was Failed; retest it' : `still open (${who})`}.`, { kind: 'step', key });
  }

  // 2. The pilot limits decided by the owner against the wallet's switch and FYNX's hard ceilings.
  const limits = answers[stepKey('pilot', 'limits')] || {}, perTx = num(limits.perTx), perMonth = num(limits.perMonth), people = num(limits.people);
  const policy = mainnet && mainnet.enabled === true ? mainnet : null;
  if (!perTx) add('limits', 'block', 'Pilot limits decided', 'Fill in “Pilot size and limits” under Decisions only you can make. Then this check compares them with the wallet.', { kind: 'decision', key: stepKey('pilot', 'limits') });
  else {
    add('limits', 'ok', 'Pilot limits decided', `${people ? `${plural(people, 'person', 'people')}` : 'Group size not set'}${limits.states ? ` in ${limits.states}` : ''} · at most ${usd(perTx)} per transfer${perMonth ? ` and ${usd(perMonth)} per person per month` : ''}.`, { kind: 'decision', key: stepKey('pilot', 'limits') });
    if (perTx > Number(CEILINGS.USDC)) add('limits', 'block', 'Limit fits FYNX’s pilot ceiling', `Your limit of ${usd(perTx)} per transfer is above what FYNX allows during the pilot (${CEILINGS.USDC} USDC or ${CEILINGS.ETH} ETH per transfer). Lower it in the decision; raising the ceiling is a code change that needs a security review.`, { kind: 'decision', key: stepKey('pilot', 'limits') });
    else add('limits', 'ok', 'Limit fits FYNX’s pilot ceiling', `${usd(perTx)} per transfer is within FYNX’s ceiling of ${CEILINGS.USDC} USDC per transfer.`);
  }
  if (!policy) add('limits', 'info', 'Real-money sending', 'Off. Turn it on (Crypto tools → Real-money sending) only after your written approval, with limits at or below your pilot limit.', { kind: 'mainnet' });
  else {
    if (!approved) add('limits', 'warn', 'Real-money sending is already on', `It is on before your written approval for the pilot${policy.updatedAt ? ` (changed ${String(policy.updatedAt).slice(0, 10)})` : ''}. Turn it off until you approve, unless you are testing it yourself.`, { kind: 'mainnet' });
    const usdc = Number(policy.USDC);
    if (perTx && usdc > perTx) add('limits', 'block', 'USDC limit matches your pilot limit', `The switch allows ${policy.USDC} USDC per transfer, more than your pilot limit of ${usd(perTx)}. Lower the USDC limit in Real-money sending.`, { kind: 'mainnet' });
    else if (perTx) add('limits', 'ok', 'USDC limit matches your pilot limit', `${policy.USDC} USDC per transfer, within your ${usd(perTx)} (1 USDC is designed to be worth US$1).`, { kind: 'mainnet' });
    add('limits', 'warn', 'ETH limit in dollars', `The switch allows ${policy.ETH} ETH per transfer. The ETH price moves, so FYNX does not compare it with ${perTx ? usd(perTx) : 'your limit'} here: check it at today’s price before you approve and again during the pilot.`, { kind: 'mainnet' });
  }
  if (perMonth) add('limits', 'warn', 'Monthly limit per person', `FYNX does not add up each person’s transfers per month yet (that needs tracking on the server). Until it does, check monthly totals in the reconciliation during the pilot and stop anyone who reaches ${usd(perMonth)}.`, { kind: 'reconcile' });

  // 3. Rollback practised (docs/PILOT-ROLLBACK.md "Practise it").
  const runs = (drill?.history || []).filter(r => r?.scenario === PILOT_SCENARIO && r.finishedAt).sort((a, b) => b.finishedAt - a.finishedAt);
  const good = runs.find(r => runSummary(r, now)?.canRecord);
  if (good) {
    const s = runSummary(good, now);
    add('practice', 'ok', 'Rollback practice run', `“Pilot transfers do not add up” practised on ${utcDay(good.finishedAt)} with ${plural(good.people.length, 'person', 'people')} (${s.handled} of ${STAGES.length} stages handled).`, { kind: 'drill' });
  } else if (runs.length) add('practice', 'block', 'Rollback practice run', `Your last “Pilot transfers do not add up” run (${utcDay(runs[0].finishedAt)}) does not count yet: ${runSummary(runs[0], now).reasons.join(' ')}`, { kind: 'drill' });
  else add('practice', 'block', 'Rollback practice run', 'Run the incident practice “Pilot transfers do not add up” with at least two people.', { kind: 'drill' });
  const open = runs.flatMap(r => STAGES.map(st => r.answers?.[st.id]).filter(a => a?.followUp && !a.doneAt));
  if (open.length) add('practice', 'warn', 'Follow-ups from the practice', `${plural(open.length, 'follow-up')} from the pilot practice ${open.length === 1 ? 'is' : 'are'} still open. Tick them off once handled.`, { kind: 'drill' });
  const sent = (register?.entries || []).filter(e => e.kind === 'page' && e.outcome === 'confirmed').sort((a, b) => b.at - a.at)[0];
  if (sent) add('practice', 'ok', 'A transfer from FYNX was checked', `Confirmed on ${NETWORKS[sent.chainId] || `chain ${sent.chainId}`} (sent ${utcDay(sent.at)}). Reconcile that network in Portfolio & history and keep the report with the pilot records.`, { kind: 'reconcile' });
  else add('practice', 'block', 'A transfer from FYNX was checked', 'Send one small test transfer from Crypto tools, check it in Track until it is confirmed, then reconcile and save the report.', { kind: 'wallet' });

  // 4. Nothing overdue.
  const failed = plan ? overview(plan, records).failed : 0;
  if (failed) add('safety', 'block', 'No failed tests', `${plural(failed, 'of your launch tests', 'of your launch tests')} last ended Failed. Retest ${failed === 1 ? 'it' : 'them'} before the pilot.`, { kind: 'failed' });
  else add('safety', 'ok', 'No failed tests', 'None of your recorded launch tests ended Failed.');
  if (!privacy) add('safety', 'info', 'Privacy requests', 'Not loaded in this browser.');
  else if (privacy.overdue) add('safety', 'block', 'Privacy requests answered on time', `${plural(privacy.overdue, 'privacy request')} ${privacy.overdue === 1 ? 'is' : 'are'} past the 30-day answer date.`, { kind: 'privacy' });
  else if (privacy.dueSoon) add('safety', 'warn', 'Privacy requests answered on time', `${plural(privacy.dueSoon, 'privacy request')} due within 7 days.`, { kind: 'privacy' });
  else add('safety', 'ok', 'Privacy requests answered on time', privacy.open ? `${plural(privacy.open, 'open request')}, none due within 7 days.` : 'No open privacy requests.');
  if (!access) add('safety', 'info', 'Accounts that control FYNX', 'Not loaded in this browser.');
  else if (access.risk) add('safety', 'block', 'Accounts that control FYNX', `${plural(access.risk, 'account')} ${access.risk === 1 ? 'has' : 'have'} 2-step verification off or no recovery codes.`, { kind: 'access' });
  else if (access.total && access.fine < access.total) add('safety', 'warn', 'Accounts that control FYNX', `${access.fine} of ${access.total} reviewed in the last 90 days${access.overdue ? ` (${access.overdue} overdue)` : ''}.`, { kind: 'access' });
  else add('safety', 'ok', 'Accounts that control FYNX', access.total ? `All ${access.total} reviewed in the last 90 days.` : 'Nothing recorded yet.', access.total ? null : { kind: 'access' });
  if (!emergency) add('safety', 'info', 'Emergency plan', 'Sign in to check it against your account.');
  else {
    if (emergency.gaps?.length) add('safety', 'warn', 'Emergency plan', `Ready for ${emergency.ready} of ${emergency.total} situations; to prepare: ${emergency.gaps.map(g => SHORT[g.id] || g.id).join(', ')}.`, { kind: 'emergency' });
    else add('safety', 'ok', 'Emergency plan', `Ready for all ${emergency.total} situations.`);
    if (sheet && sheet.state !== 'current') add('safety', 'warn', 'Emergency sheet', sheet.state === 'never' ? 'Not saved yet. Download it and keep a printed copy before the pilot.' : sheet.text, { kind: 'emergency' });
  }

  // 5. Support during the pilot: the tally from the support playbook (only when it was passed in).
  const sc = supportCheck(support);
  if (sc) add('support', sc.state, sc.title, sc.detail, sc.state === 'ok' ? null : { kind: 'support' });

  const count = s => checks.filter(c => c.state === s).length;
  const blockers = count('block'), warnings = count('warn');
  // Once the pilot is approved, a rollback trigger from support still has to stop it.
  const stop = approved && sc?.state === 'block';
  const verdict = stop ? 'stop' : approved ? 'approved' : blockers ? 'blocked' : 'ready';
  const headline = stop ? 'Pilot running, but support shows a rollback trigger: the same complaint from two pilot users in a day. Follow the rollback plan.'
    : approved ? 'You recorded your written approval for the pilot.'
    : blockers ? `Not ready for the pilot: ${plural(blockers, 'thing')} to finish first${warnings ? `, ${warnings} more to look at` : ''}.`
      : `Ready for your written approval${warnings ? ` · read the ${plural(warnings, 'point')} marked “Look at” first` : ''}.`;
  return { checks, blockers, warnings, ok: count('ok'), verdict, headline, approved };
}

const md = s => String(s).replace(/\s+/g, ' ').replace(/([\\`*_[\]<>|])/g, '\\$1').trim();
const STATE_WORD = { ok: 'OK', warn: 'Look at', block: 'To finish', info: 'Note' };
const SUPPORT_REPLY = { '1h': '1 hour', same: 'the same business day', '24h': '24 hours', '48h': '48 hours' };
const SUPPORT_HOURS = { business: 'business hours, Monday to Friday', extended: 'every day, daytime', always: 'around the clock for security problems' };
const REPO = 'https://github.com/EA-LA/FYNX-Wallet/blob/main';

// The written approval for checklist step pilot/approve, ready to print or paste into an email to yourself.
// Fixed words, the owner's own decision answers and counts only: no addresses, emails or keys.
export function approvalMarkdown(result, { plan, answers = {}, mainnet = null, date = new Date() } = {}) {
  const limits = answers[stepKey('pilot', 'limits')] || {}, support = answers[stepKey('pilot', 'support')] || {};
  const ready = result.verdict !== 'blocked';
  const L = [`# ${plan?.product || 'FYNX Wallet'} pilot release approval${ready ? '' : ' (DRAFT: not ready)'}`, '',
    `Prepared: ${date.toISOString().slice(0, 10)}`,
    ready ? 'Every check below is finished. Read the points marked “Look at”, then sign.' : `Not ready to sign: ${plural(result.blockers, 'check')} still to finish (marked “To finish”).`, '',
    '## The pilot', '',
    `- Who: ${limits.people ? `${md(limits.people)} people from the waitlist` : 'group size to be decided'}${limits.states ? ` in ${md(limits.states)}` : ''}. Everyone else stays on the waitlist.`,
    `- Limits: ${limits.perTx ? `at most ${usd(limits.perTx)} per transfer` : 'per-transfer limit to be decided'}${limits.perMonth ? ` and ${usd(limits.perMonth)} per person per month` : ''}. FYNX ceiling: ${CEILINGS.USDC} USDC or ${CEILINGS.ETH} ETH per transfer.`,
    `- Real-money sending now: ${mainnet?.enabled ? `on, ${md(mainnet.USDC)} USDC / ${md(mainnet.ETH)} ETH per transfer` : 'off'}. Swaps stay off.`,
    `- Support: ${support.who ? md(support.who) : 'to be decided'}${support.reply ? `, first reply within ${SUPPORT_REPLY[support.reply] || md(support.reply)}` : ''}${support.hours ? `, ${SUPPORT_HOURS[support.hours] || md(support.hours)}` : ''}.`, '',
    '## Checks', '', '| Area | Check | State | Detail |', '| --- | --- | --- | --- |'];
  for (const [id, label] of GROUPS) for (const c of result.checks.filter(x => x.group === id)) L.push(`| ${md(label)} | ${md(c.title)} | ${STATE_WORD[c.state]} | ${md(c.detail)} |`);
  L.push('', '## We stop the pilot at once if', '',
    '- a reconciliation shows something we cannot explain within one hour,',
    '- a session, passkey or wallet that is not ours appears,',
    '- a release changes how the wallet, transfers or sign-in behave,',
    '- two pilot users report the same problem within a day, or',
    '- we can no longer check transfers because a provider is down.', '',
    `Rollback steps: ${REPO}/docs/PILOT-ROLLBACK.md`, '',
    '## Approval', '',
    'I approve opening FYNX Wallet to the pilot group above, within these limits, and only while the checks above stay finished.', '',
    'Name: ______________________    Signature: ______________________    Date: ____________', '',
    'Then record “Give final written approval” as Passed in Launch readiness (pilot gate) with the date. FYNX never approves or switches anything on by itself.');
  return L.join('\n');
}
