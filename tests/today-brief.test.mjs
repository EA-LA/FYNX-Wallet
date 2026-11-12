import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { todayBrief, briefText } from '../wallet-src/today-brief.js';
import { evidenceArrivals, cleanEvidence } from '../wallet-src/outside-evidence.js';
import { launchHistory, historyMarkdown, undatedLine } from '../wallet-src/launch-history.js';
import { ownBlockAge, OWN_BLOCK_FRESH_MS } from '../wallet-src/recipient-activity.js';

const ov = (x = {}) => ({ done: 40, total: 100, percent: 40, yours: 30, yoursDone: 10, failed: 0, ...x });
const dates = (x = {}) => ({ overdue: 0, today: 0, soon: 0, upcoming: 0, items: [], ...x });

test('today: the headline names the most pressing thing first', () => {
  assert.match(todayBrief({ overview: ov({ failed: 2 }), dates: dates({ overdue: 2, today: 1 }) }).headline, /^2 dated items are overdue/);
  assert.equal(todayBrief({ overview: ov(), dates: dates({ overdue: 1 }) }).tone, 'overdue');
  assert.match(todayBrief({ overview: ov({ failed: 1 }), dates: dates({ today: 1 }) }).headline, /^1 item is due today\.$/);
  assert.match(todayBrief({ overview: ov({ failed: 1 }), session: { recorded: 3, total: 5 } }).headline, /test session is under way: 3 of 5/);
  assert.match(todayBrief({ overview: ov({ failed: 1 }), dates: dates({ soon: 2 }) }).headline, /^1 test failed and needs a retest/);
  assert.match(todayBrief({ overview: ov(), dates: dates({ soon: 2 }) }).headline, /^Nothing is due today; 2 items within 7 days\.$/);
  assert.match(todayBrief({ overview: ov(), outside: { share: 1 } }).headline, /^1 outside request has all evidence back/);
  assert.match(todayBrief({ overview: ov() }).headline, /^Nothing is due\. 20 of your own steps are still open\.$/);
  assert.match(todayBrief({ overview: ov({ yoursDone: 30 }) }).headline, /with engineering and outside parties/);
  const done = todayBrief({ overview: ov({ done: 100, percent: 100, yoursDone: 30 }) });
  assert.equal(done.tone, 'done');
  assert.equal(done.headline, 'Every launch step is recorded done.');
});

test('today: five tiles with honest details and tones', () => {
  const b = todayBrief({
    overview: ov({ failed: 1 }),
    dates: dates({ overdue: 1, soon: 2, upcoming: 4, items: [
      { date: '2026-11-10', state: 'overdue', when: '2 days overdue', title: 'A' },
      { date: '2026-11-14', state: 'soon', when: 'In 2 days', title: 'B' },
      { date: '2026-12-30', state: 'later', when: 'In 48 days', title: 'C' },
    ] }),
    privacy: { open: 2, overdue: 0, dueSoon: 1 },
    outside: { waiting: 3, chase: 1, share: 0 },
  });
  assert.deepEqual(b.stats.map(s => s.id), ['launch', 'yours', 'dates', 'privacy', 'outside']);
  const by = Object.fromEntries(b.stats.map(s => [s.id, s]));
  assert.equal(by.launch.value, '40%'); assert.equal(by.launch.detail, '40 of 100');
  assert.equal(by.yours.value, '10/30'); assert.equal(by.yours.detail, '1 failed'); assert.equal(by.yours.tone, 'overdue');
  assert.equal(by.dates.value, '3'); assert.equal(by.dates.detail, '1 overdue'); assert.equal(by.dates.tone, 'overdue');
  assert.equal(by.privacy.label, 'privacy requests open'); assert.equal(by.privacy.detail, '1 due soon'); assert.equal(by.privacy.tone, 'soon');
  assert.equal(by.outside.value, '3'); assert.equal(by.outside.detail, '1 needs a reminder');
  assert.equal(todayBrief({ outside: { waiting: 2, chase: 2 } }).stats[4].detail, '2 need a reminder');
  assert.deepEqual(b.urgent.map(i => i.title), ['A', 'B'], 'only overdue, today and the coming week');
});

test('today: empty workspace says so without inventing anything', () => {
  const b = todayBrief({});
  assert.equal(b.stats.find(s => s.id === 'privacy').detail, 'none open');
  assert.equal(b.stats.find(s => s.id === 'outside').detail, 'none sent');
  assert.equal(b.stats.find(s => s.id === 'dates').detail, 'none dated');
  assert.equal(b.urgent.length, 0);
  assert.match(b.headline, /Nothing is waiting on you/);
});

test('today: copied text has counts and fixed titles only', () => {
  const b = todayBrief({ overview: ov(), dates: dates({ today: 1, items: [{ date: '2026-11-12', state: 'today', when: 'Today', title: 'Review the team inbox' }] }) });
  const text = briefText(b, { today: '2026-11-12' });
  assert.match(text, /^FYNX owner workspace · today \(2026-11-12\)/);
  assert.match(text, /- 40% launch steps done \(40 of 100\)/);
  assert.match(text, /- 2026-11-12 · Today: Review the team inbox/);
});

test('owner page shows Today on the Dashboard tab and shares the next-steps list', () => {
  const html = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  assert.match(html, /id="tab-dashboard" class="panel"><section id="today-brief" class="card tb-card" aria-labelledby="tb-title"><\/section><p id="dashboard-status"/);
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(name === 'dashboard'\) renderTodayBrief\(\);/);
  assert.match(app, /const steps = nextStepsList\(\);/, 'Launch readiness uses the shared list');
  assert.match(app, /const steps = nextStepsList\(2\);/, 'Today uses the shared list');
  assert.match(app, /box\.append\(wrap\);\n  renderTodayBrief\(\);/, 'Today is re-drawn with Launch readiness');
});

// Evidence ticked without an "Arrived" date (What's been finished).
const plan = { product: 'FYNX Wallet', started: '2026-11-05', items: [
  { id: 'legal', title: 'Legal', steps: [{ id: 'analysis', by: 'outside', text: 'Written legal analysis from U.S. counsel.' }] },
  { id: 'fiat', title: 'Payments', steps: [{ id: 'allowlist', by: 'outside', text: 'Provider allowlists the backend.' }] },
] };
const log = cleanEvidence({ entries: {
  'counsel|legal/analysis': { got: ['memo', 'licences', 'aml'], changed: 1, on: { memo: '2026-11-03' } },
  'provider|fiat/allowlist': { got: ['confirmed'], changed: 1, on: { confirmed: '2026-11-11' } },
} });

test('launch history lists evidence without an Arrived date for Everyone and Outside only', () => {
  const ev = evidenceArrivals(plan, log, {});
  const h = launchHistory(plan, {}, { today: '2026-11-12', arrivals: ev.arrivals, undatedArrivals: ev.undated });
  assert.deepEqual(h.undatedEvidence.map(a => [a.partyId, a.count, a.total]), [['counsel', 2, 5]]);
  assert.equal(undatedLine(h.undatedEvidence[0]), '2 of 5 pieces have no “Arrived” date.');
  assert.equal(undatedLine({ count: 1, total: 1 }), '1 of 1 piece has no “Arrived” date.');
  assert.equal(undatedLine({ count: 1, total: 3 }), '1 of 3 pieces has no “Arrived” date.');
  assert.equal(launchHistory(plan, {}, { today: '2026-11-12', who: 'outside', undatedArrivals: ev.undated }).undatedEvidence.length, 1);
  for (const who of ['you', 'engineering']) assert.equal(launchHistory(plan, {}, { today: '2026-11-12', who, undatedArrivals: ev.undated }).undatedEvidence.length, 0);
  assert.equal(launchHistory(plan, {}, { today: '2026-11-12', undatedArrivals: [{ count: 0 }] }).undatedEvidence.length, 0);
  assert.equal(h.done, launchHistory(plan, {}, { today: '2026-11-12' }).done, 'never changes the counts');
  const text = historyMarkdown(h, { generated: new Date('2026-11-12T06:00:00Z') });
  assert.match(text, /## Evidence ticked without an “Arrived” date\n\n- Lawyer \(U\.S\. counsel\) · for “Written legal analysis[^”]*”: 2 of 5 pieces have no “Arrived” date\./);
  assert.doesNotMatch(historyMarkdown(launchHistory(plan, {}, { today: '2026-11-12' })), /without an “Arrived” date/);
});

test('own wallet block list: age of the reading', () => {
  const t = Date.UTC(2026, 10, 12, 10, 0);
  assert.deepEqual(ownBlockAge(t, t + 20_000), { stale: false, text: 'Checked just now.' });
  assert.deepEqual(ownBlockAge(t, t + 61_000), { stale: false, text: 'Checked 1 minute ago.' });
  assert.equal(ownBlockAge(t, t + OWN_BLOCK_FRESH_MS - 1).stale, false);
  const stale = ownBlockAge(t, t + 25 * 60_000);
  assert.equal(stale.stale, true);
  assert.match(stale.text, /^Checked 25 minutes ago: Refresh balance to check again/);
  assert.match(ownBlockAge(t, t + 3 * 3_600_000).text, /^Checked 3 hours ago/);
  assert.match(ownBlockAge(t, t + 61 * 60_000).text, /^Checked 1 hour ago/);
  assert.equal(ownBlockAge(undefined).stale, true);
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(\$\('#send-asset'\)\.value === 'USDC'\) rereadOwnBlock\(\);/);
});

test('today: optional crypto tools tile (wallet tests, last transfer sent from FYNX)', () => {
  const base = { overview: ov() };
  assert.equal(todayBrief(base).stats.length, 5, 'no tile unless the page passes wallet figures');
  const none = todayBrief({ ...base, wallet: { total: 19, done: 4, failed: 0, lastSent: null } }).stats.at(-1);
  assert.deepEqual([none.id, none.value, none.label, none.detail, none.tone], ['wallet', '4/19', 'wallet tests recorded', 'no transfer sent from FYNX yet', 'info']);
  const failed = todayBrief({ ...base, wallet: { total: 19, done: 6, failed: 2, lastSent: { day: '2026-11-10', network: 'Base Sepolia' } } }).stats.at(-1);
  assert.equal(failed.detail, '2 failed · last sent 2026-11-10 · Base Sepolia');
  assert.equal(failed.tone, 'overdue');
  const short = todayBrief({ ...base, wallet: { total: 19, done: 1, lastSent: { day: '2026-11-10', when: 'Nov 10', network: 'Base Sepolia' } } }).stats.at(-1);
  assert.equal(short.detail, 'last sent Nov 10 · Base Sepolia');
  const done = todayBrief({ ...base, wallet: { total: 19, done: 19, failed: 0, lastSent: { day: 'bad' } } }).stats.at(-1);
  assert.equal(done.tone, 'done'); assert.equal(done.detail, 'all recorded · no transfer sent from FYNX yet');
  assert.match(briefText(todayBrief({ ...base, wallet: { total: 19, done: 4 } })), /- 4\/19 wallet tests recorded \(no transfer sent from FYNX yet\)/);
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /wallet: \{ \.\.\.walletTests\(launchPlan, launchRecords\), lastSent: lastSentFromFynx\(\) \}/);
  assert.match(app, /wallet: \(\) => goTo\('wallet', '\.cg-tests'\)/);
});
