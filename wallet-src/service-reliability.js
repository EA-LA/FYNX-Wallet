// Service reliability: pure helpers for the owner workspace "Your services" box and its tests.
// Every "Check my services" answer (and every automatic re-check) is kept in this browser as a
// short record: the time, whether the FYNX owner server answered, and each service's state and
// response time. From those records the workspace measures, per service, how often it worked,
// how fast it answered, and when it stopped answering and came back. That is the "measured
// reliability" the controlled-launch gate asks for, and it feeds Pilot go / no-go.
// Only fixed service ids, fixed state words, times and milliseconds are kept: never keys, URLs,
// addresses or error text. Nothing here calls the network.

export const RELIABILITY_KEY = 'fynx-owner-service-checks-v1';
export const KEEP_DAYS = 90;
export const MAX_CHECKS = 1500;
export const AUTO_MINUTES = 10;
export const PILOT_WINDOW_DAYS = 14;
export const PILOT_MIN_CHECKS = 20;
export const PILOT_MIN_DAYS = 3;
export const PILOT_TARGET = 99;
const MIN = 60000, HOUR = 3600000, DAY = 86400000;

// Services whose answers can be measured. Transak and real-money sending are settings, not uptime.
export const SERVICES = Object.freeze([
  { id: 'server', name: 'FYNX owner server', role: 'Everything in this workspace goes through it.', network: true },
  { id: 'alchemy', name: 'Alchemy (network + full history)', role: 'Balances, sending checks and transaction history.', network: true },
  { id: 'backup', name: 'Public network backup', role: 'Used when Alchemy is missing or down.', network: true },
  { id: 'coingecko', name: 'CoinGecko (prices)', role: 'Dollar values only; transfers work without it.', network: false },
]);
const IDS = new Set(SERVICES.map(s => s.id));
const STATES = new Set(['working', 'error', 'missing', 'invalid']);
const MEASURED = new Set(['working', 'error']);

const finite = v => Number.isFinite(v) && v > 0;
const cleanMs = v => (Number.isFinite(v) && v >= 0 && v < 120000 ? Math.round(v) : null);

function cleanCheck(raw, now) {
  if (!raw || typeof raw !== 'object' || !finite(raw.at)) return null;
  const at = Math.round(raw.at);
  if (at > now + 5 * MIN || at < now - KEEP_DAYS * DAY) return null;
  const s = {};
  if (raw.s && typeof raw.s === 'object') for (const [id, v] of Object.entries(raw.s)) {
    if (!IDS.has(id) || id === 'server' || !Array.isArray(v) || !STATES.has(v[0])) continue;
    const ms = v[0] === 'working' ? cleanMs(v[1]) : null;
    s[id] = ms === null ? [v[0]] : [v[0], ms];
  }
  const server = raw.server === 'down' ? 'down' : 'ok';
  if (server === 'down') return { at, server, auto: raw.auto === true, s: {} };
  return { at, server, auto: raw.auto === true, ms: cleanMs(raw.ms), s };
}

// Storage is cleaned on read: unknown ids and states dropped, older than 90 days removed, newest 1500 kept.
export function cleanChecks(raw, now = Date.now()) {
  const list = Array.isArray(raw?.checks) ? raw.checks : [];
  const seen = new Set(), checks = [];
  for (const c of list) { const x = cleanCheck(c, now); if (x && !seen.has(x.at)) { seen.add(x.at); checks.push(x); } }
  checks.sort((a, b) => a.at - b.at);
  return { checks: checks.slice(-MAX_CHECKS) };
}

// One answer of the services-status call. `ms` is how long the whole call took in this browser.
export function recordStatus(log, data, { now = Date.now(), ms = null, auto = false } = {}) {
  const s = {};
  for (const svc of data?.services || []) if (IDS.has(svc?.id) && svc.id !== 'server' && STATES.has(svc.state)) s[svc.id] = svc.state === 'working' && cleanMs(svc.ms) !== null ? ['working', cleanMs(svc.ms)] : [svc.state];
  return cleanChecks({ checks: [...(log?.checks || []), { at: now, server: 'ok', ms, auto, s }] }, now);
}
// The owner server itself did not answer (unavailable, internal error or timeout).
export function recordServerDown(log, { now = Date.now(), auto = false } = {}) {
  return cleanChecks({ checks: [...(log?.checks || []), { at: now, server: 'down', auto }] }, now);
}
// Which call errors count as "the server did not answer". Sign-in, App Check, rate limits, a missing
// feature on the server or a cancelled session say nothing about uptime and are not recorded.
export function serverDownError(error) {
  const code = String(error?.code || '');
  return /(^|\/)(unavailable|internal|deadline-exceeded|unknown)$/.test(code);
}

// The state of one service in one check: 'working', 'error', 'missing', 'invalid' or null (not in that check).
export function stateOf(check, id) {
  if (id === 'server') return check.server === 'down' ? 'error' : 'working';
  if (check.server === 'down') return null;
  return check.s?.[id]?.[0] || null;
}
const msOf = (check, id) => (id === 'server' ? check.ms ?? null : check.s?.[id]?.[1] ?? null);

function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

// Times the service stopped answering: from the first failed check to the next check that worked.
// `ongoing` when no check has worked since. Durations are what the checks saw (at least that long).
export function outages(checks, id) {
  const out = []; let cur = null;
  for (const c of checks) {
    const st = stateOf(c, id); if (!MEASURED.has(st)) continue;
    if (st === 'error') { if (!cur) cur = { id, from: c.at, lastFailed: c.at, failed: 0, to: null }; cur.lastFailed = c.at; cur.failed += 1; }
    else if (cur) { cur.to = c.at; out.push(cur); cur = null; }
  }
  if (cur) out.push({ ...cur, ongoing: true });
  return out.map(o => ({ ...o, ongoing: !!o.ongoing, seenMs: (o.to ?? o.lastFailed) - o.from }));
}

// Summary per service over the last `days` (null = everything kept).
export function reliabilitySummary(log, { now = Date.now(), days = 7 } = {}) {
  const since = days ? now - days * DAY : -Infinity;
  const checks = (log?.checks || []).filter(c => c.at >= since && c.at <= now + 5 * MIN);
  const dayset = new Set(checks.map(c => new Date(c.at).toISOString().slice(0, 10)));
  const rows = SERVICES.map(svc => {
    let working = 0, failed = 0, notAdded = 0, last = null, lastFailedAt = null;
    const times = [];
    for (const c of checks) {
      const st = stateOf(c, svc.id); if (!st) continue;
      if (st === 'working') { working += 1; const ms = msOf(c, svc.id); if (ms !== null) times.push(ms); }
      else if (st === 'error') { failed += 1; lastFailedAt = c.at; }
      else notAdded += 1;
      last = { state: st, at: c.at };
    }
    times.sort((a, b) => a - b);
    const measured = working + failed;
    const percent = measured ? Math.floor((working / measured) * 1000) / 10 : null;
    const out = outages(checks, svc.id);
    const longest = out.reduce((m, o) => (o.seenMs > (m?.seenMs ?? -1) ? o : m), null);
    let verdict = 'none';
    if (last && !MEASURED.has(last.state)) verdict = 'not-added';
    else if (last?.state === 'error') verdict = 'down';
    else if (measured) verdict = failed ? (lastFailedAt >= now - DAY ? 'recent' : 'watch') : 'ok';
    return { ...svc, working, failed, measured, notAdded, percent, medianMs: percentile(times, 50), p95Ms: percentile(times, 95), last, lastFailedAt, outages: out, longest, verdict };
  });
  return { days, since: checks[0]?.at ?? null, count: checks.length, auto: checks.filter(c => c.auto).length, dayCount: dayset.size, rows };
}

export function msText(ms) { return ms === null || ms === undefined ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`; }
export function spanText(ms) {
  if (ms < MIN) return 'under a minute';
  if (ms < HOUR) { const m = Math.round(ms / MIN); return `${m} minute${m === 1 ? '' : 's'}`; }
  if (ms < 2 * DAY) { const h = Math.round((ms / HOUR) * 10) / 10; return `${h} hour${h === 1 ? '' : 's'}`; }
  const d = Math.round(ms / DAY); return `${d} days`;
}
const utc = ms => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
export const VERDICT = { ok: 'Dependable', recent: 'Failed in the last 24 hours', watch: 'Has failed', down: 'Not answering now', 'not-added': 'Not added yet', none: 'Not measured yet' };

// One line per outage for the panel and the report, newest first.
export function outageLines(summary, limit = 6) {
  return summary.rows.flatMap(r => r.outages.map(o => ({ ...o, name: r.name })))
    .sort((a, b) => b.from - a.from).slice(0, limit)
    .map(o => ({ ...o, text: o.ongoing
      ? `${o.name}: not answering since ${utc(o.from)} (${o.failed} failed check${o.failed === 1 ? '' : 's'}, at least ${spanText(o.seenMs)} so far).`
      : `${o.name}: stopped answering ${utc(o.from)}, back by ${utc(o.to)} (${o.failed} failed check${o.failed === 1 ? '' : 's'}, at least ${spanText(o.seenMs)}).` }));
}

// Pilot go / no-go check (group "safety"). Only network services count: CoinGecko is prices only.
export function reliabilityCheck(log, now = Date.now()) {
  if (!log) return null;
  const sum = reliabilitySummary(log, { now, days: PILOT_WINDOW_DAYS });
  const title = 'Services measured as dependable';
  const rows = sum.rows.filter(r => r.network && r.measured);
  const down = sum.rows.filter(r => r.network && r.verdict === 'down');
  // The network is reachable if Alchemy or the backup answered last time; one of the two down is a warning.
  const netDown = down.filter(r => r.id !== 'server');
  const netRows = rows.filter(r => r.id !== 'server');
  if (down.some(r => r.id === 'server') || (netRows.length && netDown.length === netRows.length)) {
    return { state: 'block', title, detail: `${down.map(r => r.name).join(' and ')} did not answer at the last check (${utc(Math.max(...down.map(r => r.last.at)))}). Your rollback plan says to stop when you can no longer check transfers. Check again in Your services.` };
  }
  if (!sum.count) return { state: 'warn', title, detail: `Not measured yet. During a test session, press Check my services or turn on the automatic re-check, so the pilot starts with at least ${PILOT_MIN_CHECKS} checks over ${PILOT_MIN_DAYS} days.` };
  const parts = rows.map(r => `${r.name.replace(/ \(.*\)$/, '')} ${r.percent}%`).join(', ');
  if (sum.count < PILOT_MIN_CHECKS || sum.dayCount < PILOT_MIN_DAYS) return { state: 'warn', title, detail: `Only ${sum.count} check${sum.count === 1 ? '' : 's'} on ${sum.dayCount} day${sum.dayCount === 1 ? '' : 's'} in the last ${PILOT_WINDOW_DAYS} days${parts ? ` (${parts})` : ''}. Measure at least ${PILOT_MIN_CHECKS} checks over ${PILOT_MIN_DAYS} days before the pilot.` };
  const weak = rows.filter(r => r.percent < PILOT_TARGET);
  if (netDown.length) return { state: 'warn', title, detail: `${netDown.map(r => r.name).join(' and ')} did not answer at the last check; the other network connection still works. ${parts}.` };
  if (weak.length) return { state: 'warn', title, detail: `Below ${PILOT_TARGET}% in the last ${PILOT_WINDOW_DAYS} days: ${weak.map(r => `${r.name} ${r.percent}%`).join(', ')}. Find out why before the pilot (see the outages in Your services).` };
  return { state: 'ok', title, detail: `${sum.count} checks over ${sum.dayCount} days: ${parts}.` };
}

const md = s => String(s).replace(/\s+/g, ' ').replace(/([\\`*_[\]<>|])/g, '\\$1').trim();
// Report for the pilot files: counts, percentages, response times and outage times only.
export function reliabilityMarkdown(log, { now = Date.now(), days = 7 } = {}) {
  const sum = reliabilitySummary(log, { now, days });
  const L = ['# FYNX service reliability', '', `Prepared: ${utc(now)}`, `Period: ${days ? `last ${days} days` : 'everything kept in this browser (up to 90 days)'} · ${sum.count} check${sum.count === 1 ? '' : 's'} on ${sum.dayCount} day${sum.dayCount === 1 ? '' : 's'}${sum.auto ? ` (${sum.auto} automatic)` : ''}`, '',
    'Measured from the owner workspace in one browser: a service counts as working when it answered the check. Checks happen only while the workspace is open, so time between checks is not observed.', '',
    '| Service | Checks | Working | Typical answer | Slowest 5% | Last failure | State |', '| --- | --- | --- | --- | --- | --- | --- |'];
  for (const r of sum.rows) L.push(`| ${md(r.name)} | ${r.measured}${r.notAdded ? ` (+${r.notAdded} not added)` : ''} | ${r.percent === null ? '—' : `${r.percent}%`} | ${msText(r.medianMs)} | ${msText(r.p95Ms)} | ${r.lastFailedAt ? utc(r.lastFailedAt) : '—'} | ${VERDICT[r.verdict]} |`);
  const lines = outageLines(sum, 50);
  L.push('', '## Times a service stopped answering', '');
  if (lines.length) for (const o of lines) L.push(`- ${md(o.text)}`); else L.push('- None in this period.');
  const pc = reliabilityCheck(log, now);
  if (pc) L.push('', `## For the pilot (last ${PILOT_WINDOW_DAYS} days)`, '', `${pc.state === 'ok' ? 'OK' : pc.state === 'block' ? 'Stop' : 'Look at'}: ${md(pc.detail)}`);
  return L.join('\n');
}

// Short form for "Today · What needs you" on the Dashboard tab. null until a check was kept. `down` lists the
// services whose last check failed; `block` is true when the owner server, or every measured network link,
// did not answer (the rollback plan's "cannot check transfers"). A last check older than a day is `stale`:
// it says how things were, not how they are, so it never leads the Today headline.
export function briefReliability(log, now = Date.now()) {
  const checks = log?.checks || [];
  if (!checks.length) return null;
  const sum = reliabilitySummary(log, { now, days: null });
  const lastAt = checks[checks.length - 1].at;
  const rows = sum.rows.filter(r => r.last && MEASURED.has(r.last.state));
  const down = rows.filter(r => r.verdict === 'down');
  const net = rows.filter(r => r.network && r.id !== 'server');
  const block = down.some(r => r.id === 'server') || (net.length > 0 && net.every(r => r.verdict === 'down'));
  const stale = now - lastAt > DAY;
  const since = id => outages(checks, id).find(o => o.ongoing)?.from ?? null;
  return {
    lastAt, stale, block, measured: rows.length, answering: rows.length - down.length,
    down: down.map(r => ({ id: r.id, name: r.name, since: since(r.id), network: r.network })),
    headline: !down.length ? '' : block
      ? `${down.filter(r => r.network).map(r => r.name.replace(/ \(.*\)$/, '')).join(' and ')} did not answer at the last check: transfers cannot be checked. Check your services again; if it lasts, the rollback plan says to stop new real-money transfers.`
      : `${down.map(r => r.name.replace(/ \(.*\)$/, '')).join(' and ')} did not answer at the last check; ${down.every(r => !r.network) ? 'only dollar values are affected' : 'the other network link still works'}.`,
  };
}

// Travel between devices inside the Launch readiness test report, so checks made on the phone and on the
// computer add up to the pilot's "20 checks over 3 days". One line per check: its exact time and each
// service's fixed state and milliseconds. Never keys, URLs, addresses or error text.
export const RELIABILITY_SECTION = 'Service checks (times and states only)';
export const REPORT_DAYS = 30;
export const REPORT_MAX = 300;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MS_WORD = /^(\d{1,6}) ms$/;

export function reliabilityReportLines(log, now = Date.now()) {
  const checks = cleanChecks(log, now).checks.filter(c => c.at >= now - REPORT_DAYS * DAY).slice(-REPORT_MAX);
  if (!checks.length) return [];
  const L = [`## ${RELIABILITY_SECTION}`, '', `From Launch readiness → Your services → “How dependable they have been”: the newest ${REPORT_MAX} checks of the last ${REPORT_DAYS} days. Each line is one check: its time, then each service with its answer time in ms, or its state (error, missing, invalid). “server down” means the FYNX owner server did not answer.`, ''];
  for (const c of checks) {
    const parts = [new Date(c.at).toISOString()];
    if (c.server === 'down') parts.push('server down');
    else {
      parts.push(c.ms === null || c.ms === undefined ? 'server ok' : `server ${c.ms} ms`);
      for (const svc of SERVICES) {
        const v = c.s?.[svc.id]; if (!v) continue;
        parts.push(v[0] === 'working' ? (v[1] === undefined ? `${svc.id} working` : `${svc.id} ${v[1]} ms`) : `${svc.id} ${v[0]}`);
      }
    }
    if (c.auto) parts.push('auto');
    L.push(`- ${parts.join(' · ')}`);
  }
  L.push('');
  return L;
}

export function parseReliabilityReport(text, now = Date.now()) {
  const raw = [];
  let inSection = false, unknown = 0, lines = 0;
  for (const line of String(text || '').split(/\r?\n/).slice(0, 20000)) {
    if (/^##\s/.test(line)) { inSection = line.replace(/^##\s+/, '').trim() === RELIABILITY_SECTION; continue; }
    if (!inSection || !/^\s*[-*]\s/.test(line)) continue;
    lines += 1;
    const [time, server, ...rest] = line.replace(/^\s*[-*]\s+/, '').trim().split(' · ');
    if (!ISO.test(time || '')) { unknown += 1; continue; }
    const at = Date.parse(time), auto = rest[rest.length - 1] === 'auto';
    if (auto) rest.pop();
    if (server === 'server down' && !rest.length) { raw.push({ at, server: 'down', auto }); continue; }
    const sm = /^server (?:ok|(\d{1,6}) ms)$/.exec(server || '');
    if (!sm) { unknown += 1; continue; }
    const s = {}; let bad = false;
    for (const part of rest) {
      const sp = part.indexOf(' '), id = part.slice(0, sp), word = part.slice(sp + 1), m = MS_WORD.exec(word);
      if (sp < 1 || !IDS.has(id) || id === 'server' || s[id]) { bad = true; break; }
      if (m) s[id] = ['working', Number(m[1])];
      else if (STATES.has(word)) s[id] = [word];
      else { bad = true; break; }
    }
    if (bad) { unknown += 1; continue; }
    raw.push({ at, server: 'ok', ms: sm[1] === undefined ? null : Number(sm[1]), auto, s });
  }
  const log = cleanChecks({ checks: raw }, now);
  return { log, count: log.checks.length, unknown, leftOut: Math.max(0, lines - unknown - log.checks.length) };
}

// Union by exact check time (each check is one moment in one browser). A check this browser already has stays
// as it is. "Forget kept checks" does not travel: forget on each device.
export function mergeServiceChecks(local, incoming, now = Date.now()) {
  const mine = cleanChecks(local, now), inc = cleanChecks(incoming, now);
  const have = new Set(mine.checks.map(c => c.at));
  const fresh = inc.checks.filter(c => !have.has(c.at));
  const merged = cleanChecks({ checks: [...mine.checks, ...fresh] }, now);
  const keptAt = new Set(merged.checks.map(c => c.at));
  const added = fresh.filter(c => keptAt.has(c.at)).length;
  const days = new Set(merged.checks.map(c => new Date(c.at).toISOString().slice(0, 10))).size;
  return { log: merged, added, same: inc.checks.length - fresh.length, dropped: fresh.length - added, days };
}
