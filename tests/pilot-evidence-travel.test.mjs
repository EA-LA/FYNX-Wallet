import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanChecks, recordStatus, recordServerDown, reliabilitySummary, reliabilityCheck, briefReliability, reliabilityReportLines, parseReliabilityReport, mergeServiceChecks, RELIABILITY_SECTION, REPORT_MAX, MAX_CHECKS } from '../wallet-src/service-reliability.js';
import { cleanLog, startRollback, markStep, setCheck, closeRollback, rollbackReportLines, parseRollbackReport, mergeRollbacks, rollbackDate, ROLLBACK_SECTION } from '../wallet-src/rollback-log.js';
import { collectDates } from '../wallet-src/owner-dates.js';
import { todayBrief, briefText } from '../wallet-src/today-brief.js';
import { reportMarkdown, parseReport } from '../wallet-src/launch-tracker.js';

const NOW = Date.UTC(2026, 10, 20, 18, 0);
const MIN = 60000, H = 3600000, DAY = 86400000;
const plan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const PHRASE = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
const ok = (log, at, extra = {}) => recordStatus(log, { services: [
  { id: 'alchemy', state: extra.alchemy || 'working', ms: 230 },
  { id: 'backup', state: extra.backup || 'working', ms: 410 },
  { id: 'coingecko', state: extra.coingecko || 'missing' },
] }, { now: at, ms: 512, auto: !!extra.auto });

test('service checks: report lines carry times, fixed states and ms only, and read back exactly', () => {
  let log = cleanChecks(null, NOW);
  log = ok(log, NOW - 3 * DAY + 1234);
  log = ok(log, NOW - 2 * DAY, { alchemy: 'error', auto: true });
  log = recordServerDown(log, { now: NOW - DAY });
  log = recordStatus(log, { services: [{ id: 'alchemy', state: 'working' }, { id: 'coingecko', state: 'invalid' }] }, { now: NOW - H, ms: null });
  const lines = reliabilityReportLines(log, NOW);
  assert.equal(lines[0], `## ${RELIABILITY_SECTION}`);
  const body = lines.filter(l => l.startsWith('- '));
  assert.equal(body.length, 4);
  assert.equal(body[0], `- ${new Date(NOW - 3 * DAY + 1234).toISOString()} · server 512 ms · alchemy 230 ms · backup 410 ms · coingecko missing`);
  assert.match(body[1], / · alchemy error · backup 410 ms · coingecko missing · auto$/);
  assert.match(body[2], / · server down$/);
  assert.match(body[3], / · server ok · alchemy working · coingecko invalid$/);
  assert.doesNotMatch(lines.join('\n'), /https?:|key|0x/i);
  const back = parseReliabilityReport(['# Report', '', ...lines].join('\n'), NOW);
  assert.deepEqual(back.log, log);
  assert.equal(back.count, 4); assert.equal(back.unknown, 0); assert.equal(back.leftOut, 0);
  assert.deepEqual(reliabilityReportLines(cleanChecks(null), NOW), [], 'no section when nothing is kept');
});

test('service checks: the report keeps the newest checks of 30 days; bad and old lines are not guessed', () => {
  let log = cleanChecks(null, NOW);
  log = ok(log, NOW - 40 * DAY);
  for (let i = REPORT_MAX + 19; i >= 0; i -= 1) log = ok(log, NOW - i * 20 * MIN);
  const lines = reliabilityReportLines(log, NOW).filter(l => l.startsWith('- '));
  assert.equal(lines.length, REPORT_MAX);
  assert.ok(!lines.some(l => l.includes(new Date(NOW - 40 * DAY).toISOString())), 'older than 30 days stays out of the report');
  const text = [`## ${RELIABILITY_SECTION}`, '',
    `- ${new Date(NOW - H).toISOString()} · server 300 ms · alchemy 200 ms`,
    `- ${new Date(NOW - 2 * H).toISOString()} · server 300 ms · stripe 200 ms`,
    `- ${new Date(NOW - 3 * H).toISOString()} · server 300 ms · alchemy maybe`,
    `- ${new Date(NOW - 4 * H).toISOString()} · server down · alchemy 20 ms`,
    `- 2026-11-20 10:00 · server 300 ms`,
    `- ${new Date(NOW - 100 * DAY).toISOString()} · server 300 ms`,
    `- ${new Date(NOW - 5 * H).toISOString()} · server 300 ms · alchemy ${PHRASE}`,
    '## Another section', `- ${new Date(NOW - 6 * H).toISOString()} · server 300 ms`].join('\n');
  const p = parseReliabilityReport(text, NOW);
  assert.equal(p.count, 1);
  assert.equal(p.unknown, 5);
  assert.equal(p.leftOut, 1, 'the 100-day-old check is understood but left out');
});

test('service checks: merging adds checks from the other device so the pilot measurement adds up', () => {
  let phone = cleanChecks(null, NOW), laptop = cleanChecks(null, NOW);
  for (let d = 1; d >= 0; d -= 1) for (let i = 5; i >= 0; i -= 1) laptop = ok(laptop, NOW - d * DAY - i * H);
  for (let i = 9; i >= 0; i -= 1) phone = ok(phone, NOW - 2 * DAY - i * H - 30 * MIN);
  phone = ok(phone, NOW - 5 * H); // same moment as one laptop check
  assert.equal(reliabilityCheck(laptop, NOW).state, 'warn', 'one device alone is short of 20 checks over 3 days');
  const incoming = parseReliabilityReport(reliabilityReportLines(phone, NOW).join('\n'), NOW).log;
  const m = mergeServiceChecks(laptop, incoming, NOW);
  assert.equal(m.added, 10); assert.equal(m.same, 1); assert.equal(m.dropped, 0); assert.equal(m.days, 3);
  assert.equal(m.log.checks.length, 22);
  assert.equal(reliabilityCheck(m.log, NOW).state, 'ok');
  assert.deepEqual(mergeServiceChecks(m.log, incoming, NOW).added, 0, 'bringing the same report in twice adds nothing');
  // A check this browser already has is left as it is.
  const changed = { checks: incoming.checks.map(c => ({ ...c, s: { alchemy: ['error'] } })) };
  const again = mergeServiceChecks(m.log, changed, NOW);
  assert.equal(again.added, 0);
  assert.equal(reliabilitySummary(again.log, { now: NOW, days: null }).rows.find(r => r.id === 'alchemy').failed, 0);
  // The 1,500-check cap still holds.
  let big = cleanChecks(null, NOW); for (let i = MAX_CHECKS - 1; i >= 0; i -= 1) big = ok(big, NOW - i * MIN);
  const capped = mergeServiceChecks(big, { checks: [{ at: NOW - MAX_CHECKS * MIN - DAY, server: 'down' }] }, NOW);
  assert.equal(capped.log.checks.length, MAX_CHECKS); assert.equal(capped.added, 0); assert.equal(capped.dropped, 1);
});

test('service checks on Today: a tile with the last check, and a headline only when transfers cannot be checked', () => {
  assert.equal(briefReliability(cleanChecks(null), NOW), null);
  assert.equal(todayBrief({ services: null }).stats.some(s => s.id === 'services'), false);
  let log = ok(cleanChecks(null, NOW), NOW - 12 * MIN);
  let b = todayBrief({ services: briefReliability(log, NOW), now: NOW });
  let tile = b.stats.find(s => s.id === 'services');
  assert.deepEqual([tile.value, tile.detail, tile.tone], ['3/3', 'checked 12 min ago', 'done']);
  assert.doesNotMatch(b.headline, /answer/);
  // CoinGecko down only: a warning tile, no headline.
  log = recordStatus(log, { services: [{ id: 'alchemy', state: 'working', ms: 1 }, { id: 'backup', state: 'working', ms: 1 }, { id: 'coingecko', state: 'error' }] }, { now: NOW - 5 * MIN, ms: 1 });
  b = todayBrief({ services: briefReliability(log, NOW), now: NOW });
  tile = b.stats.find(s => s.id === 'services');
  assert.equal(tile.value, '3/4'); assert.equal(tile.tone, 'soon'); assert.match(tile.detail, /^CoinGecko not answering · checked 5 min ago$/);
  assert.match(briefReliability(log, NOW).headline, /only dollar values are affected/);
  // Both network links down: the headline says transfers cannot be checked, names the rollback plan.
  log = ok(log, NOW - 2 * MIN, { alchemy: 'error', backup: 'error' });
  const sv = briefReliability(log, NOW);
  assert.equal(sv.block, true); assert.equal(sv.down.length, 2); assert.equal(sv.down[0].since, NOW - 2 * MIN);
  b = todayBrief({ services: sv, now: NOW, dates: { overdue: 2 } });
  assert.equal(b.tone, 'overdue');
  assert.match(b.headline, /^Alchemy and Public network backup did not answer at the last check: transfers cannot be checked\./);
  assert.ok(b.services);
  assert.match(briefText(b), /Services:\n- Not answering at the last check: Alchemy \(network \+ full history\)/);
  // A real rollback still comes first; a support rollback trigger is joined with the services line.
  assert.match(todayBrief({ services: sv, rollback: { practice: false, headline: 'Rollback under way.', done: 1, total: 7, stopped: true } }).headline, /^Rollback under way/);
  const both = todayBrief({ services: sv, support: { total: 2, stop: 1, check: 0, last24: 2, last7: 2, alerts: [{ id: 'pending', title: 'Transfer still pending', level: 'stop', people: 2 }] } });
  assert.match(both.headline, /^Rollback trigger: “Transfer still pending” came from 2 pilot users within a day, and Alchemy and Public network backup did not answer/);
  // The server itself down blocks too.
  const down = recordServerDown(ok(cleanChecks(null, NOW), NOW - H), { now: NOW - MIN });
  assert.equal(briefReliability(down, NOW).block, true);
  assert.match(briefReliability(down, NOW).headline, /^FYNX owner server did not answer/);
  // A last check older than a day never leads the headline, and asks for a fresh check.
  const old = briefReliability(down, NOW + 2 * DAY);
  assert.equal(old.stale, true);
  b = todayBrief({ services: old, now: NOW + 2 * DAY });
  assert.doesNotMatch(b.headline, /did not answer/);
  assert.equal(b.services, null);
  tile = b.stats.find(s => s.id === 'services');
  assert.equal(tile.tone, 'soon'); assert.match(tile.detail, /checked 2 days ago/);
});

const rbStart = (log, opts) => { const r = startRollback(log, { trigger: 'support', at: NOW - 2 * H, id: 'rb-phone-1', ...opts }); assert.equal(r.problem, null); return r.log; };
const rbStep = (log, id, at, extra = {}) => { const r = markStep(log, id, { at, ...extra }); assert.equal(r.problem, null, `${id}: ${r.problem}`); return r.log; };

test('rollback records: report lines carry times and fixed names only, notes stay on the device', () => {
  let log = rbStart(cleanLog(null), { note: 'Two people said it is stuck' });
  log = rbStep(log, 'stop', NOW - 2 * H + 3 * MIN, { note: 'turned off from the phone' });
  log = rbStep(log, 'site', NOW - H, { skip: true });
  log = setCheck(log, 'fixed', true);
  const practice = rbStart(cleanLog(null), { id: 'rb-prac-1', practice: true, at: NOW - 3 * DAY, trigger: 'release' });
  let p = practice; for (const [i, s] of ['stop', 'tell', 'freeze', 'site', 'server', 'reconcile', 'reopen'].entries()) p = rbStep(p, s, NOW - 3 * DAY + (i + 1) * MIN);
  p = closeRollback(p, { outcome: 'practice', at: NOW - 3 * DAY + 10 * MIN }).log;
  log = { ...log, past: p.past };
  const lines = rollbackReportLines(log, NOW);
  assert.equal(lines[0], `## ${ROLLBACK_SECTION}`);
  const text = lines.join('\n');
  assert.doesNotMatch(text, /stuck|from the phone/, 'notes are not in the report');
  assert.match(text, /- rb-phone-1 · started · 2026-11-20T16:00:00\.000Z · real · support · Same complaint/);
  assert.match(text, /- rb-phone-1 · step · [^·]+ · site · not needed · Put the website back/);
  assert.match(text, /- rb-phone-1 · condition · [^·]+ · fixed · /);
  assert.match(text, /- rb-prac-1 · ended · [^·]+ · practice · Practice finished/);
  const back = parseRollbackReport(text, NOW);
  assert.equal(back.count, 2); assert.equal(back.unknown, 0);
  assert.equal(back.open[0].id, 'rb-phone-1');
  assert.deepEqual(Object.keys(back.open[0].steps), ['stop', 'site']);
  assert.equal(back.open[0].steps.site.skip, true);
  assert.deepEqual(back.open[0].checks, { fixed: true });
  assert.equal(back.past[0].outcome, 'practice');
  assert.deepEqual(rollbackReportLines(cleanLog(null), NOW), []);
  // Unknown kinds, steps and bad times are counted, not guessed; a skip on a required step is dropped.
  const bad = parseRollbackReport([`## ${ROLLBACK_SECTION}`, '- rb-x-1 · started · 2026-11-20T10:00:00.000Z · real · support',
    '- rb-x-1 · step · 2026-11-20T10:05:00.000Z · stop · not needed', '- rb-x-1 · step · 2026-11-20T10:06:00.000Z · dance',
    '- rb-x-1 · ended · yesterday · paused', '- rb-y-1 · step · 2026-11-20T10:05:00.000Z · stop'].join('\n'), NOW);
  assert.equal(bad.unknown, 2); assert.equal(bad.count, 1); assert.equal(bad.leftOut, 1, 'a record without its start is left out');
  assert.deepEqual(bad.open[0].steps.stop, { at: Date.parse('2026-11-20T10:05:00.000Z') });
});

test('rollback records: continue on the other device, an ending travels, never two open at once', () => {
  let phone = rbStart(cleanLog(null));
  phone = rbStep(phone, 'stop', NOW - 2 * H + 2 * MIN, { note: 'from phone' });
  // The laptop knows nothing: it takes the open record.
  let m = mergeRollbacks(cleanLog(null), parseRollbackReport(rollbackReportLines(phone, NOW).join('\n'), NOW), NOW);
  assert.deepEqual(m.added, ['rb-phone-1']); assert.equal(m.log.current.id, 'rb-phone-1');
  let laptop = rbStep(m.log, 'tell', NOW - H, { note: 'laptop note' });
  laptop = rbStep(laptop, 'stop', NOW - H);
  assert.equal(laptop.current.steps.stop.at, NOW - 2 * H + 2 * MIN, 'the first time is kept');
  // Back on the phone: the laptop's step arrives, the phone's note and time stay.
  m = mergeRollbacks(phone, parseRollbackReport(rollbackReportLines(laptop, NOW).join('\n'), NOW), NOW);
  assert.deepEqual(m.updated, ['rb-phone-1']);
  assert.deepEqual(Object.keys(m.log.current.steps).sort(), ['stop', 'tell']);
  assert.equal(m.log.current.steps.stop.note, 'from phone');
  assert.equal(m.log.current.steps.tell.note, undefined, 'notes never travel');
  phone = m.log;
  // The laptop closes it as paused; the phone's open record ends too.
  const closed = closeRollback(laptop, { outcome: 'paused', at: NOW - 10 * MIN });
  assert.equal(closed.problem, null);
  m = mergeRollbacks(phone, parseRollbackReport(rollbackReportLines(closed.log, NOW).join('\n'), NOW), NOW);
  assert.equal(m.log.current, null); assert.deepEqual(m.ended, ['rb-phone-1']);
  assert.equal(m.log.past[0].outcome, 'paused'); assert.equal(m.log.past[0].steps.stop.note, 'from phone');
  // Same report again: nothing changes.
  const again = mergeRollbacks(m.log, parseRollbackReport(rollbackReportLines(closed.log, NOW).join('\n'), NOW), NOW);
  assert.equal(again.changes, 0); assert.deepEqual(again.same, ['rb-phone-1']);
  // Another open record here: the incoming open one is left out, not opened alongside.
  const other = rbStart(cleanLog(null), { id: 'rb-other-1', trigger: 'provider', at: NOW - 30 * MIN });
  const c = mergeRollbacks(other, parseRollbackReport(rollbackReportLines(phone, NOW).join('\n'), NOW), NOW);
  assert.deepEqual(c.conflict, ['rb-phone-1']); assert.equal(c.changes, 0); assert.equal(c.log.current.id, 'rb-other-1');
});

test('an open real rollback is in Your dates every day until it is closed; practice is not', () => {
  assert.equal(rollbackDate(cleanLog(null), NOW), null);
  assert.equal(rollbackDate(rbStart(cleanLog(null), { practice: true }), NOW), null);
  let log = rbStep(rbStart(cleanLog(null)), 'stop', NOW - H);
  const rd = rollbackDate(log, NOW);
  assert.equal(rd.title, 'Finish the rollback: next “Tell the pilot group”');
  assert.match(rd.detail, /^Started 2026-11-20 16:00 UTC \(same complaint from two pilot users within a day\); 1 of 7 steps recorded\./);
  const d = collectDates({ rollback: rd, today: '2026-11-21' });
  assert.equal(d.items.length, 1); assert.equal(d.today, 1);
  assert.deepEqual([d.items[0].kind, d.items[0].date, d.items[0].uid], ['rollback', '2026-11-21', 'pilot-rollback']);
  assert.equal(collectDates({ rollback: null, today: '2026-11-21' }).items.length, 0);
});

test('both sections sit in the test report without confusing the results reader', () => {
  const log = ok(cleanChecks(null, NOW), NOW - H);
  const rb = rbStep(rbStart(cleanLog(null)), 'stop', NOW - H);
  const report = reportMarkdown(plan, {}, { date: new Date(NOW), appendix: [...reliabilityReportLines(log, NOW), ...rollbackReportLines(rb, NOW)] });
  const parsed = parseReport(report, plan);
  assert.equal(parsed.secret, false);
  assert.deepEqual(parsed.records, {});
  assert.equal(parseReliabilityReport(report, NOW).count, 1);
  assert.equal(parseRollbackReport(report, NOW).count, 1);
});
