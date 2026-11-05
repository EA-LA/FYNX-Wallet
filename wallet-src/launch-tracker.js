// Launch readiness tracker: pure helpers shared by the owner workspace and tests.
// Owner test results are kept only in this browser (step id → result, short note, time). Nothing here is sent anywhere.
export const TRACKER_KEY = 'fynx-owner-launch-tests-v1';
export const RESULTS = ['pass', 'fail', 'skip'];
export const resultLabels = { pass: 'Passed', fail: 'Failed', skip: 'Not applicable' };
export const byLabels = { you: 'You', engineering: 'Engineering', outside: 'Outside party' };
export const tabLabels = { dashboard: 'Dashboard', wallet: 'Crypto tools', security: 'Account security', registrations: 'Waitlist', public: 'Public website' };
export const groupOf = status => status === 'implemented' ? 'done' : ['device-testing', 'decision-required'].includes(status) ? 'you' : 'others';
export const groupLabels = { all: 'All gates', you: 'Needs you', others: 'Waiting on others', done: 'Done' };
const MAX_NOTE = 280;

export const stepKey = (gate, step) => `${gate}/${step}`;

// Refuse anything that looks like a recovery phrase, private key or long secret token.
export function looksSecret(raw) {
  const v = String(raw || '').trim();
  if (!v) return false;
  const words = v.toLowerCase().split(/\s+/);
  let run = 0, best = 0;
  for (const w of words) { run = /^[a-z]{3,8}$/.test(w) ? run + 1 : 0; best = Math.max(best, run); }
  if (best >= 12 && words.length <= 30) return true;
  if (/(^|[^0-9a-f])(0x)?[0-9a-f]{64}([^0-9a-f]|$)/i.test(v) && /key|secret|private/i.test(v)) return true;
  if (/\b(xprv|xpriv)[1-9A-HJ-NP-Za-km-z]{20,}/.test(v)) return true;
  if (/\b(sk|pk)_(live|test)_[A-Za-z0-9]{12,}/.test(v) || /AIza[0-9A-Za-z_-]{30,}/.test(v) || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(v)) return true;
  return false;
}

export function cleanRecords(raw, plan) {
  const valid = new Set(plan.items.flatMap(item => (item.steps || []).filter(s => s.by === 'you').map(s => stepKey(item.id, s.id))));
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, rec] of Object.entries(raw)) {
    if (!valid.has(key) || !rec || typeof rec !== 'object') continue;
    const result = RESULTS.includes(rec.result) ? rec.result : '';
    const note = typeof rec.note === 'string' && !looksSecret(rec.note) ? rec.note.slice(0, MAX_NOTE) : '';
    const at = Number.isFinite(rec.at) ? rec.at : 0;
    if (result || note) out[key] = { result, note, at };
  }
  return out;
}

export function stepState(gate, step, records) {
  if (step.done) return 'done';
  if (step.by !== 'you') return 'open';
  const r = records[stepKey(gate.id, step.id)];
  return r?.result === 'pass' || r?.result === 'skip' ? 'done' : r?.result === 'fail' ? 'failed' : 'open';
}

export function gateProgress(gate, records) {
  const steps = gate.steps || [];
  const states = steps.map(step => stepState(gate, step, records));
  const mine = steps.filter(s => s.by === 'you' && !s.done);
  return {
    total: steps.length,
    done: states.filter(s => s === 'done').length,
    failed: states.filter(s => s === 'failed').length,
    yours: mine.length,
    yoursDone: mine.filter(s => stepState(gate, s, records) === 'done').length,
  };
}

export function overview(plan, records) {
  const counts = { done: 0, you: 0, others: 0 };
  let total = 0, done = 0, yours = 0, yoursDone = 0, failed = 0;
  for (const gate of plan.items) {
    counts[groupOf(gate.status)] += 1;
    const p = gateProgress(gate, records);
    total += p.total; done += p.done; yours += p.yours; yoursDone += p.yoursDone; failed += p.failed;
  }
  return { gates: plan.items.length, counts, total, done, yours, yoursDone, failed, percent: total ? Math.round(done / total * 100) : 0 };
}

// The next few owner steps, failed ones first, then in checklist order.
export function nextActions(plan, records, limit = 3) {
  const open = [];
  for (const gate of plan.items) for (const step of gate.steps || []) {
    if (step.by !== 'you') continue;
    const state = stepState(gate, step, records);
    if (state !== 'done') open.push({ gate, step, failed: state === 'failed' });
  }
  return [...open.filter(o => o.failed), ...open.filter(o => !o.failed)].slice(0, limit);
}

const mdLine = s => String(s).replace(/\s+/g, ' ').replace(/([\\`*_[\]<>|])/g, '\\$1').trim();

export function reportMarkdown(plan, records, { date = new Date(), browser = '' } = {}) {
  const o = overview(plan, records);
  const lines = [`# ${plan.product} launch test report`, '', `Date: ${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`];
  if (browser) lines.push(`Browser: ${mdLine(browser)}`);
  lines.push(`Overall: ${o.done} of ${o.total} steps done (${o.percent}%). Your tests: ${o.yoursDone} of ${o.yours} done, ${o.failed} failed.`, '');
  let any = false;
  for (const gate of plan.items) {
    const rows = (gate.steps || []).filter(s => s.by === 'you' && records[stepKey(gate.id, s.id)]);
    if (!rows.length) continue;
    any = true;
    lines.push(`## ${gate.title}`, '');
    for (const step of rows) {
      const r = records[stepKey(gate.id, step.id)];
      const when = r.at ? ` (${new Date(r.at).toISOString().slice(0, 10)})` : '';
      lines.push(`- ${r.result ? resultLabels[r.result] : 'Note only'}${when}: ${mdLine(step.text)}${r.note ? ` Note: ${mdLine(r.note)}` : ''}`);
    }
    lines.push('');
  }
  if (!any) lines.push('No test results recorded yet.', '');
  lines.push('Recorded by the owner in the FYNX workspace. Contains no keys, recovery phrases or passwords.');
  return lines.join('\n');
}

export function browserSummary(ua = '') {
  const s = String(ua);
  const browser = /Edg\//.test(s) ? 'Edge' : /Firefox\//.test(s) ? 'Firefox' : /CriOS|Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Browser';
  const os = /iPad/.test(s) ? 'iPad' : /iPhone/.test(s) ? 'iPhone' : /Android/.test(s) ? 'Android' : /Mac OS X|Macintosh/.test(s) ? 'Mac' : /Windows/.test(s) ? 'Windows' : /Linux/.test(s) ? 'Linux' : 'unknown device';
  return `${browser} on ${os}`;
}
