import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECTIONS, launchChips, walletChips, guideItems, activeIndex, itemLabel } from '../wallet-src/section-guide.js';
import { overview } from '../wallet-src/launch-tracker.js';
import { decisionsProgress } from '../wallet-src/owner-decisions.js';
import { pilotReadiness } from '../wallet-src/pilot-readiness.js';
import { walletTests } from '../wallet-src/crypto-guide.js';
import { cleanLog, startRollback, briefRollback } from '../wallet-src/rollback-log.js';

const owner = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const plan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));

test('every section points at exactly one element in its own tab of owner.html', () => {
  for (const [tab, sections] of Object.entries(SECTIONS)) {
    const start = owner.indexOf(`<section id="tab-${tab}"`);
    const end = owner.indexOf('<section id="tab-', start + 10);
    assert.ok(start > 0, tab);
    const panel = owner.slice(start, end > 0 ? end : undefined);
    assert.ok(panel.includes(`<nav id="sec-guide-${tab}" class="sec-guide" aria-label="Sections in `), `${tab} has a guide row`);
    const ids = new Set();
    for (const s of sections) {
      assert.match(s.target, /^#[a-z-]+$/, s.id);
      const id = s.target.slice(1);
      assert.equal(owner.split(`id="${id}"`).length - 1, 1, `${id} is unique in owner.html`);
      assert.ok(panel.includes(`id="${id}"`), `${id} is inside tab-${tab}`);
      assert.ok(!ids.has(s.id), `${s.id} listed once`); ids.add(s.id);
      assert.ok(s.label.length > 0 && s.label.length <= 22, `${s.label} stays short`);
    }
  }
});

test('sections are listed in the order they appear on the page', () => {
  for (const sections of Object.values(SECTIONS)) {
    const at = sections.map(s => owner.indexOf(`id="${s.target.slice(1)}"`));
    assert.deepEqual([...at].sort((a, b) => a - b), at);
  }
});

test('the page keeps the guide up to date from the places that change its facts', () => {
  for (const fn of ['renderTodayBrief', 'renderPilotGate', 'renderCryptoSetup', 'renderDecisions', 'renderDrill']) {
    assert.match(app, new RegExp(`function ${fn}\\(\\) \\{\\n  scheduleGuide\\(\\);`), fn);
  }
  assert.match(app, /if \(name === 'launch'\) renderPilotGate\(\);[^\n]*\n  scheduleGuide\(\);\n\}/);
  assert.match(app, /window\.addEventListener\('scroll', \(\) => \{\n(?:[^\n]*\n){1,2}[^\n]*markActiveSection\(\)[^\n]*\n\}, \{ passive: true \}\);/);
});

test('launch chips: a fresh browser shows honest starting states', () => {
  const o = overview(plan, {});
  const c = launchChips({
    overview: o, dates: { items: [], overdue: 0, today: 0, soon: 0 }, readyYou: 26, session: null,
    pilot: pilotReadiness({ plan, records: {}, answers: {} }), support: null, rollback: null, services: null,
    decisions: decisionsProgress(plan, {}, {}), drill: { done: false, running: false },
  });
  assert.deepEqual(c.overview, { text: `${o.percent}%`, tone: 'info', say: `${o.percent}% of launch steps done` });
  assert.equal(c.checklist.text, `${o.done}/${o.total}`);
  assert.equal(c.dates, undefined, 'nothing dated: no chip');
  assert.equal(c.order.text, '26 ready');
  assert.equal(c.session, undefined);
  assert.equal(c.pilot.tone, 'warn'); assert.match(c.pilot.text, /^\d+ to finish$/);
  assert.equal(c.support, undefined); assert.equal(c.rollback, undefined);
  assert.deepEqual(c.services, { text: 'Not checked', tone: 'info', say: 'not checked yet' });
  assert.equal(c.decisions.text, '0/12'); assert.equal(c.decisions.tone, 'warn');
  assert.equal(c.drill.text, 'Not yet');
});

test('launch chips: urgent states win and use the red tone', () => {
  const c = launchChips({
    overview: { percent: 40, done: 30, total: 83, failed: 2 },
    dates: { items: [{}, {}, {}], overdue: 1, today: 1, soon: 1 },
    pilot: { verdict: 'stop', blockers: 0 },
    support: { total: 4, stop: 1, alerts: [{}] },
    rollback: { practice: false },
    services: { block: true, down: [{}], measured: 4, answering: 2 },
  });
  assert.deepEqual([c.checklist.text, c.checklist.tone], ['2 failed', 'block']);
  assert.deepEqual([c.dates.text, c.dates.tone], ['1 overdue', 'block']);
  assert.deepEqual([c.pilot.text, c.pilot.tone], ['Stop', 'block']);
  assert.deepEqual([c.support.text, c.support.tone], ['Rollback trigger', 'block']);
  assert.deepEqual([c.rollback.text, c.rollback.tone], ['Under way', 'block']);
  assert.deepEqual([c.services.text, c.services.tone], ['Down', 'block']);
});

test('launch chips: in-between states', () => {
  const c = launchChips({
    overview: { percent: 100, done: 83, total: 83, failed: 0 },
    dates: { items: [{}], overdue: 0, today: 0, soon: 2 },
    session: { total: 5, recorded: 2, complete: false },
    pilot: { verdict: 'ready' },
    support: { total: 3, stop: 0, alerts: [] },
    services: { block: false, down: [], stale: true, measured: 4, answering: 4 },
    decisions: { decided: 12, total: 12 },
    drill: { done: false, running: true },
  });
  assert.deepEqual([c.overview.tone, c.checklist.text, c.checklist.tone], ['ok', '83/83', 'ok']);
  assert.equal(c.dates.text, '2 soon');
  assert.deepEqual([c.session.text, c.session.tone], ['2/5', 'warn']);
  assert.deepEqual([c.pilot.text, c.pilot.tone], ['Ready', 'ok']);
  assert.equal(c.support.text, '3 logged');
  assert.equal(c.services.text, 'Check again');
  assert.deepEqual([c.decisions.text, c.decisions.tone], ['12/12', 'ok']);
  assert.equal(c.drill.text, 'Under way');
  assert.equal(launchChips({ services: { down: [], measured: 4, answering: 4 } }).services.text, '4/4 up');
  assert.equal(launchChips({ services: { down: [{}, {}], measured: 4, answering: 2 } }).services.text, '2 not answering');
  assert.equal(launchChips({ dates: { items: [{}, {}], overdue: 0, today: 0, soon: 0 } }).dates.text, '2');
  assert.equal(launchChips({ dates: { items: [{}], overdue: 0, today: 1, soon: 0 } }).dates.say, '1 date due today');
  assert.equal(launchChips({ session: { total: 3, recorded: 3, complete: true } }).session.text, 'Finished');
});

test('launch chips: a practice rollback is amber, read from the real rollback brief', () => {
  const { log, problem } = startRollback(cleanLog(null), { practice: true, trigger: 'reconcile', at: Date.UTC(2026, 10, 21) });
  assert.equal(problem, null);
  const brief = briefRollback(log, Date.UTC(2026, 10, 21, 1));
  assert.ok(brief && brief.practice);
  assert.deepEqual(launchChips({ rollback: brief }).rollback, { text: 'Practice open', tone: 'warn', say: 'a rollback practice is open' });
});

test('wallet chips', () => {
  const t = walletTests(plan, {});
  const c = walletChips({ tests: t, wallet: 'none', waiting: 0, mainnet: false });
  assert.equal(c.guide.text, `0/${t.total}`);
  assert.equal(c.wallet.text, 'Not connected');
  assert.equal(c.track, undefined);
  assert.deepEqual([c.mainnet.text, c.mainnet.tone], ['Off', 'info']);
  const d = walletChips({ tests: { total: 19, done: 3, failed: 1 }, wallet: 'verified', waiting: 2, mainnet: true });
  assert.deepEqual([d.guide.text, d.guide.tone], ['1 failed', 'block']);
  assert.deepEqual([d.wallet.text, d.wallet.tone], ['Verified', 'ok']);
  assert.equal(d.track.say, '2 transactions waiting');
  assert.deepEqual([d.mainnet.text, d.mainnet.tone], ['On', 'warn']);
  assert.equal(walletChips({ wallet: 'connected' }).wallet.text, 'Connected');
  assert.deepEqual(walletChips({}), {});
});

test('guide items keep only sections on the page and carry their chip', () => {
  const items = guideItems('launch', { decisions: { text: '0/12', tone: 'warn', say: '0 of 12 decisions recorded' } }, t => t !== '#rollback-log');
  assert.equal(items.length, SECTIONS.launch.length - 1);
  assert.ok(!items.some(i => i.id === 'rollback'));
  const d = items.find(i => i.id === 'decisions');
  assert.equal(itemLabel(d), 'Decisions: 0 of 12 decisions recorded');
  assert.equal(itemLabel(items[1]), 'Your dates');
  assert.deepEqual(guideItems('nope'), []);
});

test('active section: last top past the reading line; side-by-side keeps the first; before the first is the first', () => {
  assert.equal(activeIndex([-900, -200, 40, 600], 90), 2);
  assert.equal(activeIndex([-900, -200, 140, 600], 90), 1);
  assert.equal(activeIndex([-400, 50, 50, 700], 90), 1, 'two cards on one row: the first');
  assert.equal(activeIndex([300, 900], 90), 0);
  assert.equal(activeIndex([NaN, 300, 900], 90), 1, 'missing sections are skipped');
  assert.equal(activeIndex([], 90), -1);
});
