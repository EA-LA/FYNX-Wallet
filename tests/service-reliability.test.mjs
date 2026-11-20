import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RELIABILITY_KEY, KEEP_DAYS, MAX_CHECKS, AUTO_MINUTES, SERVICES, cleanChecks, recordStatus, recordServerDown, serverDownError, stateOf, outages, reliabilitySummary, outageLines, reliabilityCheck, reliabilityMarkdown, msText, spanText } from '../wallet-src/service-reliability.js';
import { pilotReadiness } from '../wallet-src/pilot-readiness.js';

const NOW = Date.UTC(2026, 10, 20, 12, 0);
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const plan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
// A services-status answer shaped like firebase-wallet/functions/providers.js servicesStatus().
const status = ({ alchemy = ['working', 120], coingecko = ['missing'], backup = ['working', 300] } = {}) => ({
  checkedAt: new Date(NOW).toISOString(),
  services: [
    { id: 'alchemy', name: 'Alchemy', state: alchemy[0], ms: alchemy[1], unlocks: 'x' },
    { id: 'coingecko', name: 'CoinGecko', state: coingecko[0], ms: coingecko[1], unlocks: 'x' },
    { id: 'backup', name: 'Backup', state: backup[0], ms: backup[1], unlocks: 'x' },
    { id: 'transak', name: 'Transak', state: 'missing', unlocks: 'x' },
    { id: 'mainnet', name: 'Real-money sending', state: 'off', unlocks: 'x' },
  ],
});
// n healthy checks, one every `every` ms, ending at `end`.
function healthy(n, every, end = NOW, log = cleanChecks(null, end)) {
  for (let i = n - 1; i >= 0; i--) log = recordStatus(log, status(), { now: end - i * every, ms: 400 });
  return log;
}

test('key, limits and services are fixed; the server backend shape matches', () => {
  assert.match(RELIABILITY_KEY, /^fynx-owner-.*-v1$/);
  assert.equal(KEEP_DAYS, 90); assert.equal(MAX_CHECKS, 1500); assert.equal(AUTO_MINUTES, 10);
  assert.deepEqual(SERVICES.map(s => s.id), ['server', 'alchemy', 'backup', 'coingecko']);
  const providers = readFileSync(new URL('../firebase-wallet/functions/providers.js', import.meta.url), 'utf8');
  for (const id of ['alchemy', 'coingecko', 'backup']) assert.match(providers, new RegExp(`id: '${id}'`), `backend still reports ${id}`);
  assert.match(providers, /state: 'working', ms: Date\.now\(\) - start/);
});

test('recording keeps only ids, fixed states and milliseconds; settings and unknown data are dropped', () => {
  const data = status({ alchemy: ['working', 123.6], coingecko: ['invalid', 50] });
  data.services.push({ id: 'evil', state: 'working', ms: 1 }, { id: 'backup', state: 'exploded' });
  data.services[0].url = 'https://base-sepolia.g.alchemy.com/v2/SECRETKEY';
  const log = recordStatus(cleanChecks(null), data, { now: NOW, ms: 812, auto: true });
  assert.equal(log.checks.length, 1);
  const c = log.checks[0];
  assert.deepEqual(c, { at: NOW, server: 'ok', auto: true, ms: 812, s: { alchemy: ['working', 124], coingecko: ['invalid'], backup: ['working', 300] } });
  assert.doesNotMatch(JSON.stringify(log), /SECRET|alchemy\.com|transak|mainnet|evil/);
  assert.equal(stateOf(c, 'server'), 'working'); assert.equal(stateOf(c, 'coingecko'), 'invalid'); assert.equal(stateOf(c, 'transak'), null);
  const down = recordServerDown(log, { now: NOW + MIN });
  assert.deepEqual(down.checks[1], { at: NOW + MIN, server: 'down', auto: false, s: {} });
  assert.equal(stateOf(down.checks[1], 'server'), 'error');
  assert.equal(stateOf(down.checks[1], 'alchemy'), null, 'no answer from the server says nothing about Alchemy');
});

test('storage is cleaned on read: bad entries, duplicates, future and old checks; newest 1500 kept', () => {
  const raw = { checks: [
    { at: NOW - 91 * DAY, server: 'ok', s: {} },
    { at: NOW + HOUR, server: 'ok', s: {} },
    { at: 'x' }, null, 5,
    { at: NOW - HOUR, server: 'ok', ms: -4, s: { alchemy: ['working', 999999], backup: ['nope'], server: ['error'] } },
    { at: NOW - HOUR, server: 'ok', s: {} },
    { at: NOW - 2 * HOUR, server: 'weird', s: { coingecko: ['error', 40] } },
  ] };
  const log = cleanChecks(raw, NOW);
  assert.equal(log.checks.length, 2);
  assert.deepEqual(log.checks[0], { at: NOW - 2 * HOUR, server: 'ok', auto: false, ms: null, s: { coingecko: ['error'] } });
  assert.deepEqual(log.checks[1].s, { alchemy: ['working'] }, 'impossible times are dropped, state kept');
  assert.deepEqual(cleanChecks(null).checks, []);
  assert.deepEqual(cleanChecks({ checks: 'no' }).checks, []);
  const many = { checks: Array.from({ length: 1600 }, (_, i) => ({ at: NOW - i * MIN, server: 'ok', s: {} })) };
  const kept = cleanChecks(many, NOW);
  assert.equal(kept.checks.length, MAX_CHECKS);
  assert.equal(kept.checks.at(-1).at, NOW, 'the newest are kept');
  assert.ok(kept.checks[0].at < kept.checks[1].at, 'sorted oldest first');
});

test('only "did not answer" errors count as the server being down', () => {
  for (const code of ['functions/unavailable', 'functions/internal', 'functions/deadline-exceeded', 'unavailable']) assert.equal(serverDownError({ code }), true, code);
  for (const code of ['functions/unauthenticated', 'functions/permission-denied', 'functions/resource-exhausted', 'functions/failed-precondition', 'auth/network', '']) assert.equal(serverDownError({ code }), false, code);
  assert.equal(serverDownError(null), false);
  assert.equal(serverDownError(new Error('Unknown operation')), false, 'a feature missing on the server is not an outage');
});

test('summary: share working, typical and slowest answers, verdicts and periods', () => {
  let log = healthy(18, 10 * MIN, NOW - 2 * HOUR);
  log = recordStatus(log, status({ alchemy: ['error'] }), { now: NOW - HOUR });
  log = recordStatus(log, status({ alchemy: ['working', 2000] }), { now: NOW - 30 * MIN });
  const sum = reliabilitySummary(log, { now: NOW, days: 7 });
  assert.equal(sum.count, 20); assert.equal(sum.dayCount, 1);
  const row = id => sum.rows.find(r => r.id === id);
  assert.equal(row('alchemy').measured, 20); assert.equal(row('alchemy').failed, 1);
  assert.equal(row('alchemy').percent, 95);
  assert.equal(row('alchemy').medianMs, 120); assert.equal(row('alchemy').p95Ms, 2000); assert.equal(row('alchemy').lastFailedAt, NOW - HOUR);
  assert.equal(row('alchemy').verdict, 'recent');
  assert.equal(row('server').percent, 100); assert.equal(row('server').verdict, 'ok'); assert.equal(row('server').medianMs, 400);
  assert.equal(row('coingecko').verdict, 'not-added'); assert.equal(row('coingecko').percent, null); assert.equal(row('coingecko').notAdded, 20);
  assert.equal(reliabilitySummary(log, { now: NOW + 2 * DAY, days: 7 }).rows.find(r => r.id === 'alchemy').verdict, 'watch', 'older than 24 hours');
  assert.equal(reliabilitySummary(log, { now: NOW + 8 * DAY, days: 7 }).count, 0);
  assert.equal(reliabilitySummary(log, { now: NOW + 8 * DAY, days: 0 }).count, 20, 'everything kept');
  assert.equal(reliabilitySummary(cleanChecks(null), { now: NOW }).rows.every(r => r.verdict === 'none'), true);
  // Percent is rounded down, so 1 failure in 1000 never shows as 100%.
  let big = recordStatus(cleanChecks(null), status({ backup: ['error'] }), { now: NOW - 999 * MIN }); for (let i = 998; i >= 0; i--) big = recordStatus(big, status(), { now: NOW - i * MIN });
  assert.equal(reliabilitySummary(big, { now: NOW, days: 0 }).rows.find(r => r.id === 'backup').percent, 99.9);
});

test('outages run from the first failed check to the next one that worked; an open one is ongoing', () => {
  let log = healthy(3, 10 * MIN, NOW - 3 * HOUR);
  log = recordServerDown(log, { now: NOW - 2 * HOUR });
  log = recordServerDown(log, { now: NOW - 2 * HOUR + 10 * MIN });
  log = recordStatus(log, status(), { now: NOW - HOUR, ms: 300 });
  log = recordStatus(log, status({ backup: ['error'] }), { now: NOW - 20 * MIN });
  log = recordStatus(log, status({ backup: ['error'] }), { now: NOW - 10 * MIN });
  const server = outages(log.checks, 'server');
  assert.equal(server.length, 1);
  assert.deepEqual({ from: server[0].from, to: server[0].to, failed: server[0].failed, ongoing: server[0].ongoing, seenMs: server[0].seenMs }, { from: NOW - 2 * HOUR, to: NOW - HOUR, failed: 2, ongoing: false, seenMs: HOUR });
  assert.equal(outages(log.checks, 'alchemy').length, 0, 'a server outage is not counted against Alchemy');
  const backup = outages(log.checks, 'backup');
  assert.equal(backup[0].ongoing, true); assert.equal(backup[0].seenMs, 10 * MIN);
  const sum = reliabilitySummary(log, { now: NOW, days: 1 });
  assert.equal(sum.rows.find(r => r.id === 'backup').verdict, 'down');
  assert.equal(sum.rows.find(r => r.id === 'server').longest.seenMs, HOUR);
  const lines = outageLines(sum);
  assert.equal(lines.length, 2);
  assert.match(lines[0].text, /^Public network backup: not answering since 2026-11-20 11:40 UTC \(2 failed checks, at least 10 minutes so far\)\.$/);
  assert.match(lines[1].text, /^FYNX owner server: stopped answering 2026-11-20 10:00 UTC, back by 2026-11-20 11:00 UTC \(2 failed checks, at least 1 hour\)\.$/);
});

test('pilot check: not measured, too few, server down, network down, below target, dependable', () => {
  assert.equal(reliabilityCheck(null, NOW), null, 'only when the log is passed in');
  assert.equal(reliabilityCheck(cleanChecks(null), NOW).state, 'warn');
  assert.match(reliabilityCheck(cleanChecks(null), NOW).detail, /Not measured yet/);
  const few = reliabilityCheck(healthy(10, HOUR), NOW);
  assert.equal(few.state, 'warn'); assert.match(few.detail, /Only 10 checks on 1 day/);
  const good = healthy(24, 12 * HOUR);
  const ok = reliabilityCheck(good, NOW);
  assert.equal(ok.state, 'ok', ok.detail); assert.match(ok.detail, /24 checks over 1[23] days: FYNX owner server 100%, Alchemy 100%, Public network backup 100%\./);
  assert.doesNotMatch(ok.detail, /CoinGecko/, 'prices do not decide the pilot');
  const serverDown = reliabilityCheck(recordServerDown(good, { now: NOW + MIN }), NOW + MIN);
  assert.equal(serverDown.state, 'block'); assert.match(serverDown.detail, /FYNX owner server did not answer/);
  const bothDown = reliabilityCheck(recordStatus(good, status({ alchemy: ['error'], backup: ['error'] }), { now: NOW + MIN }), NOW + MIN);
  assert.equal(bothDown.state, 'block'); assert.match(bothDown.detail, /Alchemy .* and Public network backup did not answer/);
  const oneDown = reliabilityCheck(recordStatus(good, status({ backup: ['error'] }), { now: NOW + MIN }), NOW + MIN);
  assert.equal(oneDown.state, 'warn'); assert.match(oneDown.detail, /the other network connection still works/);
  let weak = good; for (let i = 1; i <= 3; i++) weak = recordStatus(weak, status({ alchemy: ['error'] }), { now: NOW + i * MIN });
  weak = recordStatus(weak, status(), { now: NOW + 4 * MIN });
  const w = reliabilityCheck(weak, NOW + 4 * MIN);
  assert.equal(w.state, 'warn'); assert.match(w.detail, /Below 99% .*Alchemy \(network \+ full history\) 89\.2%/);
  const cgDown = reliabilityCheck(recordStatus(good, status({ coingecko: ['error'] }), { now: NOW + MIN }), NOW + MIN);
  assert.equal(cgDown.state, 'ok', 'CoinGecko down alone does not hold up the pilot');
});

test('Pilot go / no-go shows the check under "Nothing overdue" only when the log is passed in', () => {
  const without = pilotReadiness({ plan, now: NOW });
  assert.equal(without.checks.some(c => c.title === 'Services measured as dependable'), false);
  const down = pilotReadiness({ plan, reliability: recordServerDown(healthy(24, 12 * HOUR), { now: NOW + MIN }), now: NOW + MIN });
  const c = down.checks.find(x => x.title === 'Services measured as dependable');
  assert.equal(c.group, 'safety'); assert.equal(c.state, 'block'); assert.deepEqual(c.action, { kind: 'services' });
  assert.equal(down.blockers, without.blockers + 1);
  const fine = pilotReadiness({ plan, reliability: healthy(24, 12 * HOUR), now: NOW }).checks.find(x => x.title === 'Services measured as dependable');
  assert.equal(fine.state, 'ok'); assert.equal(fine.action, null);
});

test('report: table, outages and pilot line; counts and times only', () => {
  let log = healthy(24, 12 * HOUR);
  log = recordServerDown(log, { now: NOW + 10 * MIN, auto: true });
  log = recordStatus(log, status(), { now: NOW + 20 * MIN, auto: true });
  const md = reliabilityMarkdown(log, { now: NOW + 20 * MIN, days: 30 });
  assert.match(md, /^# FYNX service reliability/);
  assert.match(md, /last 30 days · 26 checks on 1[234] days \(2 automatic\)/);
  assert.match(md, /\| FYNX owner server \| 26 \| 96\.1% \| 400 ms \| 400 ms \| 2026-11-20 12:10 UTC \| Failed in the last 24 hours \|/);
  assert.match(md, /\| CoinGecko \(prices\) \| 0 \(\+25 not added\) \| — \|/);
  assert.match(md, /- FYNX owner server: stopped answering 2026-11-20 12:10 UTC, back by 2026-11-20 12:20 UTC/);
  assert.match(md, /## For the pilot \(last 14 days\)\n\nLook at: Below 99%/);
  assert.doesNotMatch(md, /0x[0-9a-f]{6}|@|key=|https?:/i);
  assert.match(reliabilityMarkdown(cleanChecks(null), { now: NOW }), /- None in this period\./);
});

test('text helpers', () => {
  assert.equal(msText(null), '—'); assert.equal(msText(87), '87 ms'); assert.equal(msText(1530), '1.5 s');
  assert.equal(spanText(20000), 'under a minute'); assert.equal(spanText(MIN), '1 minute'); assert.equal(spanText(25 * MIN), '25 minutes');
  assert.equal(spanText(HOUR), '1 hour'); assert.equal(spanText(90 * MIN), '1.5 hours'); assert.equal(spanText(3 * DAY), '3 days');
});

test('the workspace wires it: markup, timing, sign-out stops the re-check, go / no-go gets the log', () => {
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  for (const id of ['svc-auto', 'svc-auto-status', 'svc-reliability']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /recordStatus\(serviceLog, data, \{ now: Date\.now\(\), ms: Date\.now\(\) - started, auto \}\)/);
  assert.match(app, /if \(serverDownError\(error\)\) \{ serviceLog = recordServerDown/);
  assert.match(app, /function clearServices\(\) \{[^\n]*stopServiceAuto\(\)/, 'sign-out stops automatic checks');
  assert.match(app, /if \(!svcAuto \|\| !session\) return;/);
  assert.match(app, /if \(document\.hidden \|\| busy\)/);
  assert.match(app, /reliability: serviceLog/);
  assert.doesNotMatch(app.slice(app.indexOf('async function servicesCheck'), app.indexOf('function renderReliability')), /lastActivity/, 'automatic checks never keep the session alive');
});
