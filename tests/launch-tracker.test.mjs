import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { looksSecret, cleanRecords, stepState, gateProgress, overview, nextActions, reportMarkdown, browserSummary, groupOf, stepKey, byLabels, tabLabels, RESULTS } from '../wallet-src/launch-tracker.js';
import { statusLabels } from '../wallet-src/launch-status.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const ownerSteps = plan.items.flatMap(g => g.steps.filter(s => s.by === 'you' && !s.done).map(s => [g, s]));

test('every gate has steps with valid owners, unique ids and known tabs', () => {
  for (const gate of plan.items) {
    assert.ok(statusLabels[gate.status], gate.id);
    assert.ok(gate.steps.length >= 2, gate.id);
    const ids = new Set();
    for (const s of gate.steps) {
      assert.match(s.id, /^[a-z0-9-]+$/); assert.ok(!ids.has(s.id), `${gate.id}/${s.id}`); ids.add(s.id);
      assert.ok(byLabels[s.by]); assert.equal(typeof s.done, 'boolean'); assert.ok(s.text.length > 20);
      if (s.tab) assert.ok(tabLabels[s.tab], s.tab);
      assert.doesNotMatch(s.text, /<|>/);
    }
  }
  assert.ok(ownerSteps.length >= 20);
  // Implemented gates have every engineering step done; blocked/external gates are not marked done.
  for (const gate of plan.items.filter(g => g.status === 'implemented')) assert.ok(gate.steps.filter(s => s.by === 'engineering').every(s => s.done), gate.id);
  for (const gate of plan.items.filter(g => g.status !== 'implemented')) assert.ok(gate.steps.some(s => !s.done), gate.id);
});

test('gates are grouped by who they wait on', () => {
  assert.equal(groupOf('implemented'), 'done');
  assert.equal(groupOf('device-testing'), 'you');
  assert.equal(groupOf('decision-required'), 'you');
  assert.equal(groupOf('external-dependency'), 'others');
  assert.equal(groupOf('blocked'), 'others');
  assert.equal(groupOf('not-started'), 'others');
});

test('secret-looking notes are refused', () => {
  const phrase = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
  assert.equal(looksSecret(phrase), true);
  assert.equal(looksSecret(`my words: ${phrase} thanks`), true);
  assert.equal(looksSecret(`private key 0x${'ab'.repeat(32)}`), true);
  assert.equal(looksSecret('xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi'), true);
  assert.equal(looksSecret('-----BEGIN EC PRIVATE KEY-----'), true);
  assert.equal(looksSecret('Safari 18 on iPhone 15, tx 0x' + 'ab'.repeat(32)), false, 'a transaction ID alone is fine');
  assert.equal(looksSecret('Worked fine on Chrome 131 on my Mac, took about two minutes to confirm'), false);
  assert.equal(looksSecret(''), false);
});

test('stored records are cleaned: unknown steps, bad results, secret notes and long notes', () => {
  const [g, s] = ownerSteps[0];
  const key = stepKey(g.id, s.id);
  const raw = { [key]: { result: 'pass', note: 'x'.repeat(500), at: 5 }, 'nope/nope': { result: 'pass' }, [stepKey(...ownerSteps[1].map(x => x.id))]: { result: 'hack', note: 'abandon ability able about above absent absorb abstract absurd abuse access accident' } };
  const clean = cleanRecords(raw, plan);
  assert.deepEqual(Object.keys(clean), [key]);
  assert.equal(clean[key].note.length, 280);
  assert.equal(clean[key].at, 5);
  assert.deepEqual(cleanRecords(null, plan), {});
  assert.deepEqual(cleanRecords([], plan), {});
  const engineering = plan.items.flatMap(g2 => g2.steps.filter(x => x.by !== 'you').map(x => stepKey(g2.id, x.id)));
  assert.deepEqual(cleanRecords({ [engineering[0]]: { result: 'pass' } }, plan), {}, 'only owner steps can be recorded');
});

test('progress counts passed and not-applicable as done, failed separately', () => {
  const gate = plan.items.find(g => g.id === 'identity');
  const base = gateProgress(gate, {});
  assert.equal(base.done, gate.steps.filter(s => s.done).length);
  const mine = gate.steps.filter(s => s.by === 'you');
  const rec = { [stepKey('identity', mine[0].id)]: { result: 'pass' }, [stepKey('identity', mine[1].id)]: { result: 'skip' }, [stepKey('identity', mine[2].id)]: { result: 'fail' }, [stepKey('identity', mine[3].id)]: { note: 'started' } };
  assert.equal(stepState(gate, mine[0], rec), 'done');
  assert.equal(stepState(gate, mine[2], rec), 'failed');
  assert.equal(stepState(gate, mine[3], rec), 'open');
  const p = gateProgress(gate, rec);
  assert.equal(p.done, base.done + 2); assert.equal(p.failed, 1); assert.equal(p.yoursDone, 2); assert.equal(p.yours, mine.length);
  const o = overview(plan, rec);
  assert.equal(o.gates, plan.items.length);
  assert.equal(o.counts.done + o.counts.you + o.counts.others, plan.items.length);
  assert.equal(o.failed, 1);
  assert.ok(o.percent > overview(plan, {}).percent);
});

test('next actions put failed steps first and skip finished ones', () => {
  const first = nextActions(plan, {}, 3);
  assert.equal(first.length, 3);
  assert.equal(first[0].step.id, ownerSteps[0][1].id);
  const [g, s] = ownerSteps[5];
  const rec = { [stepKey(g.id, s.id)]: { result: 'fail' }, [stepKey(ownerSteps[0][0].id, ownerSteps[0][1].id)]: { result: 'pass' } };
  const next = nextActions(plan, rec, 3);
  assert.equal(next[0].step.id, s.id); assert.equal(next[0].failed, true);
  assert.ok(!next.some(n => n.step.id === ownerSteps[0][1].id && n.gate.id === ownerSteps[0][0].id));
  const all = Object.fromEntries(ownerSteps.map(([gg, ss]) => [stepKey(gg.id, ss.id), { result: 'pass' }]));
  assert.equal(nextActions(plan, all).length, 0);
});

test('report lists recorded steps with results and escaped notes, never other data', () => {
  assert.match(reportMarkdown(plan, {}, { date: new Date('2026-11-05T15:00:00Z') }), /No test results recorded yet/);
  const [g, s] = ownerSteps.find(([gg]) => gg.id === 'signing');
  const md = reportMarkdown(plan, { [stepKey(g.id, s.id)]: { result: 'fail', note: 'Faucet *empty* <b>', at: Date.UTC(2026, 10, 5) } }, { date: new Date('2026-11-05T15:00:00Z'), browser: 'Safari on Mac' });
  assert.match(md, /Date: 2026-11-05 15:00 UTC/);
  assert.match(md, /Browser: Safari on Mac/);
  assert.match(md, new RegExp(`## ${g.title}`));
  assert.match(md, /- Failed \(2026-11-05\): /);
  assert.match(md, /Note: Faucet \\\*empty\\\* \\<b\\>/);
  assert.match(md, /1 failed/);
  for (const r of RESULTS) assert.ok(['pass', 'fail', 'skip'].includes(r));
});

test('browser summary names the browser and device without the full user agent', () => {
  assert.equal(browserSummary('Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'), 'Safari on iPad');
  assert.equal(browserSummary('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'), 'Chrome on Mac');
  assert.equal(browserSummary('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0'), 'Edge on Windows');
  assert.equal(browserSummary(''), 'Browser on unknown device');
});

test('owner page has the tracker controls and the generated checklist lists the steps', async () => {
  const owner = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
  for (const id of ['launch-overview', 'launch-filters', 'launch-checklist', 'copy-launch-report', 'download-launch-report', 'clear-launch-results', 'launch-save-status']) assert.match(owner, new RegExp(`id="${id}"`));
  const doc = await readFile(new URL('../docs/LAUNCH-CHECKLIST.md', import.meta.url), 'utf8');
  for (const gate of plan.items) assert.match(doc, new RegExp(`Steps \\(${gate.steps.filter(s => s.done).length} of ${gate.steps.length} recorded as done\\)`));
  assert.match(doc, /- \[ \] You: Sign in with Google/);
});
