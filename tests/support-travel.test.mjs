import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanTally, logRequest, removeRequest, clearTally, markExplained, setAgain, tallySummary, briefSupport, tallyReportLines, parseTallyReport, mergeTallies, TALLY_SECTION, KEEP_DAYS } from '../wallet-src/support-tally.js';
import { todayBrief, briefText } from '../wallet-src/today-brief.js';
import { reportMarkdown, parseReport } from '../wallet-src/launch-tracker.js';

const NOW = Date.UTC(2026, 10, 19, 12, 0);
const H = 3600000, DAY = 24 * H;
const log = (t, situation, at, extra = {}) => logRequest(t, { situation, at, ...extra });
const plan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));

test('removing a request leaves a marker that expires with it; clearing marks every request', () => {
  let t = log(log(cleanTally(null, NOW), 'pending', NOW - H, { id: 'r-one1' }), 'fees', NOW - 2 * H, { id: 'r-two2' });
  t = removeRequest(t, 'r-one1');
  assert.deepEqual(t.gone, { 'r-one1': NOW - H });
  assert.equal(removeRequest(t, 'r-missing'), t, 'removing nothing changes nothing');
  // A stored entry whose id was removed does not come back.
  assert.equal(cleanTally({ ...t, entries: [...t.entries, { id: 'r-one1', situation: 'pending', at: NOW - H }] }, NOW).entries.length, 1);
  // Markers older than the keep window are forgotten.
  assert.deepEqual(cleanTally({ entries: [], gone: { 'r-old1': NOW - (KEEP_DAYS + 1) * DAY, 'BAD!': NOW } }, NOW).gone, {});
  const cleared = clearTally(markExplained(t, 'fees', NOW - H));
  assert.equal(cleared.entries.length, 0);
  assert.deepEqual(Object.keys(cleared.gone).sort(), ['r-one1', 'r-two2']);
  assert.equal(cleared.cleared.fees, NOW - H, '"explained" times are kept');
});

test('report lines carry kinds, times, follow-ups, explained and removed marks only, and read back exactly', () => {
  let t = cleanTally(null, NOW);
  t = log(t, 'pending', NOW - 3 * H, { id: 'r-aaa1' });
  t = log(t, 'pending', NOW - 2 * H, { id: 'r-bbb2', again: true });
  t = log(t, 'secret-shared', NOW - H, { id: 'r-ccc3' });
  t = log(t, 'fees', NOW - 30 * 60000, { id: 'r-ddd4' });
  t = removeRequest(t, 'r-ddd4');
  t = markExplained(t, 'secret-shared', NOW - 10 * 60000);
  const lines = tallyReportLines(t, NOW);
  assert.equal(lines[0], `## ${TALLY_SECTION}`);
  assert.ok(lines.includes(`- r-bbb2 · pending · ${new Date(NOW - 2 * H).toISOString()} · follow-up · Transfer is pending or stuck`));
  assert.ok(lines.some(l => l.startsWith('- explained · secret-shared · ')));
  assert.ok(lines.some(l => l.startsWith('- removed · r-ddd4 · ')));
  assert.deepEqual(tallyReportLines(cleanTally(null, NOW), NOW), [], 'an empty tally adds nothing to the report');
  // Inside a whole test report, next to other sections.
  const report = reportMarkdown(plan, {}, { date: new Date(NOW), appendix: ['## Something else', '', '- r-zzz9 · pending · 2026-11-19T10:00:00.000Z', '', ...lines] });
  const back = parseTallyReport(report, NOW);
  assert.deepEqual(back.tally, cleanTally(t, NOW));
  assert.equal(back.count, 3); assert.equal(back.explained, 1); assert.equal(back.removed, 1); assert.equal(back.unknown, 0);
  assert.equal(parseReport(report, plan).secret, false, 'the section does not look like a key to the report reader');
});

test('the parser refuses what it does not understand and leaves out old or future lines', () => {
  const text = [`## ${TALLY_SECTION}`, '',
    `- r-good1 · pending · ${new Date(NOW - H).toISOString()} · Transfer is pending or stuck`,
    `- r-old01 · pending · ${new Date(NOW - (KEEP_DAYS + 2) * DAY).toISOString()}`,
    `- r-fut01 · pending · ${new Date(NOW + 5 * DAY).toISOString()}`,
    `- r-bad01 · not-a-kind · ${new Date(NOW - H).toISOString()}`,
    '- r-bad02 · pending · yesterday',
    `- explained · nope · ${new Date(NOW).toISOString()}`,
    `- alice@example.com · pending · ${new Date(NOW - H).toISOString()}`,
    '## Next section', `- r-out01 · fees · ${new Date(NOW - H).toISOString()}`].join('\n');
  const r = parseTallyReport(text, NOW);
  assert.deepEqual(r.tally.entries.map(e => e.id), ['r-good1']);
  assert.equal(r.unknown, 4);
  assert.equal(r.leftOut, 2);
  assert.ok(!JSON.stringify(r).includes('example.com'));
});

test('merging: union by id, removals win on either side, this browser keeps its follow-up mark, later explained wins', () => {
  let phone = cleanTally(null, NOW), laptop = cleanTally(null, NOW);
  phone = log(phone, 'pending', NOW - 3 * H, { id: 'r-p001' });
  phone = log(phone, 'fees', NOW - 2 * H, { id: 'r-p002', again: true });
  phone = log(phone, 'wrong-amount', NOW - 90 * 60000, { id: 'r-p003' });
  laptop = { ...laptop, entries: [...phone.entries.filter(e => e.id !== 'r-p003')] };
  laptop = setAgain(laptop, 'r-p002', false);
  laptop = log(laptop, 'pending', NOW - H, { id: 'r-l001' });
  laptop = removeRequest(laptop, 'r-p001');
  phone = markExplained(phone, 'wrong-amount', NOW - 30 * 60000);
  laptop = markExplained(laptop, 'wrong-amount', NOW - 80 * 60000);

  const report = tallyReportLines(phone, NOW).join('\n');
  const m = mergeTallies(laptop, parseTallyReport(report, NOW).tally, NOW);
  assert.deepEqual(m.added, ['r-p003']);
  assert.deepEqual(m.kept, ['r-p002']);
  assert.equal(m.tally.entries.find(e => e.id === 'r-p002').again, false, "this browser's mark stays");
  assert.ok(!m.tally.entries.some(e => e.id === 'r-p001'), 'removed on the laptop, not brought back by the phone');
  assert.equal(m.tally.cleared['wrong-amount'], NOW - 30 * 60000);
  assert.deepEqual(m.explained, ['wrong-amount']);
  assert.equal(m.changes, 2);

  // The other way: the laptop's removal reaches the phone.
  const back = mergeTallies(phone, parseTallyReport(tallyReportLines(laptop, NOW).join('\n'), NOW).tally, NOW);
  assert.deepEqual(back.removed, ['r-p001']);
  assert.deepEqual(back.added, ['r-l001']);
  assert.ok(!back.tally.entries.some(e => e.id === 'r-p001'));
  // Bringing in the same report twice changes nothing.
  const again = mergeTallies(m.tally, parseTallyReport(report, NOW).tally, NOW);
  assert.equal(again.changes, 0);
});

test('a rollback trigger that arrives from another device shows up in the merged summary', () => {
  let phone = cleanTally(null, NOW);
  phone = log(phone, 'wrong-amount', NOW - 2 * H, { id: 'r-x001' });
  let laptop = log(cleanTally(null, NOW), 'wrong-amount', NOW - H, { id: 'r-y001' });
  assert.equal(tallySummary(laptop, NOW).stop, 0);
  const m = mergeTallies(laptop, parseTallyReport(tallyReportLines(phone, NOW).join('\n'), NOW).tally, NOW);
  assert.equal(tallySummary(m.tally, NOW).stop, 1);
});

test('Today: no support line until something is logged; quiet days say so honestly', () => {
  assert.equal(briefSupport(tallySummary(cleanTally(null, NOW), NOW)), null);
  const b0 = todayBrief({ support: null });
  assert.ok(!b0.stats.some(s => s.id === 'support'));
  assert.deepEqual(b0.supportAlerts, []);
  const quiet = log(cleanTally(null, NOW), 'fees', NOW - 3 * DAY);
  const b = todayBrief({ support: briefSupport(tallySummary(quiet, NOW)) });
  const tile = b.stats.find(s => s.id === 'support');
  assert.deepEqual([tile.value, tile.label, tile.detail, tile.tone], ['0', 'pilot support requests today', '1 in 7 days · no repeat', 'info']);
  assert.doesNotMatch(b.headline, /support/i);
});

test('Today: a rollback trigger outranks overdue dates; requests to explain come next', () => {
  let t = cleanTally(null, NOW);
  t = log(t, 'pending', NOW - 2 * H); t = log(t, 'pending', NOW - H);
  const stop = todayBrief({ dates: { overdue: 3 }, support: briefSupport(tallySummary(t, NOW)) });
  assert.equal(stop.tone, 'overdue');
  assert.match(stop.headline, /^Rollback trigger: “Transfer is pending or stuck” came from 2 pilot users within a day\./);
  assert.equal(stop.stats.find(s => s.id === 'support').detail, '1 rollback trigger open');
  assert.equal(stop.supportAlerts[0].level, 'stop');
  assert.match(briefText(stop), /Pilot support:\n- Rollback trigger: Transfer is pending or stuck \(2 pilot users within a day\)/);

  let s = log(cleanTally(null, NOW), 'secret-shared', NOW - 20 * 60000);
  s = log(s, 'wrong-amount', NOW - 10 * 60000);
  const check = todayBrief({ dates: { overdue: 1 }, support: briefSupport(tallySummary(s, NOW)) });
  assert.match(check.headline, /^2 pilot support requests need explaining within 1 hour of arriving: /);
  assert.equal(check.supportAlerts.length, 2);
  assert.equal(check.stats.length, 6);

  // Explained → the alert goes, the tile stays honest.
  const done = todayBrief({ dates: { overdue: 1 }, support: briefSupport(tallySummary(markExplained(markExplained(s, 'secret-shared', NOW), 'wrong-amount', NOW), NOW)) });
  assert.match(done.headline, /^1 dated item is overdue/);
  assert.deepEqual(done.supportAlerts, []);
  assert.equal(done.stats.find(s2 => s2.id === 'support').detail, '2 in 7 days · no repeat');
});
