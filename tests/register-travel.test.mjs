import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reportMarkdown, parseReport, looksSecret } from '../wallet-src/launch-tracker.js';
import { decisionReportLines } from '../wallet-src/owner-decisions.js';
import { addSubmitted, markKnown, unmark, cleanRegister, registerReportLines, parseRegisterReport, mergeRegisters, isRegisterLine, REGISTER_SECTION, MAX_ENTRIES } from '../wallet-src/pilot-register.js';
import { reconcile } from '../wallet-src/reconcile.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const owner = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
const W = '0x1111111111111111111111111111111111111111';
const A = '0x2222222222222222222222222222222222222222';
const h = n => '0x' + String(n).padStart(64, 'a');
const T = Date.UTC(2026, 10, 8, 9, 30), M = 60000;

function phone() {
  let r = { entries: [] };
  r = addSubmitted(r, { hash: h(1), label: '2.5 USDC', network: { id: 84532 }, address: W, submittedAt: T - 90 * M });
  r = markKnown(r, { hash: h(2), chainId: 84532, reason: 'other-app' }, T - 60 * M);
  r = markKnown(r, { hash: h(3), chainId: 8453, reason: 'own-transfer' }, T - 30 * M);
  return r;
}

test('register lines: public transaction IDs, network, time and FYNX label or fixed reason; no wallet address', () => {
  const lines = registerReportLines(phone());
  const report = reportMarkdown(plan, {}, { date: new Date(T), appendix: lines });
  assert.match(report, new RegExp(`## ${REGISTER_SECTION}`));
  assert.ok(report.includes(`- From FYNX · Base Sepolia (chain 84532) · 2026-11-08 08:00 UTC · ${h(1)} · 2.5 USDC`));
  assert.ok(report.includes(`- Marked as mine · Base (chain 8453) · 2026-11-08 09:00 UTC · ${h(3)} · Moved between my own wallets`));
  assert.ok(!report.toLowerCase().includes(W.toLowerCase()), 'wallet addresses stay on the device');
  assert.deepEqual(registerReportLines({ entries: [] }), []);
  assert.equal(lines.filter(isRegisterLine).length, 3);
});

test('a report with transaction IDs is not mistaken for one with a private key, even next to the word “key”', () => {
  const decisions = decisionReportLines({ reviewer: { name: 'Key Security LLC' } }, {});
  const report = reportMarkdown(plan, {}, { date: new Date(T), appendix: [...decisions, '## Notes', '', '- private key handling reviewed', '', ...registerReportLines(phone())] });
  assert.equal(parseReport(report, plan).secret, false);
  // A bare 64-hex value outside the register format, next to “private”, is still refused.
  const bad = `${report}\n\nmy private key ${'b'.repeat(64)}`;
  assert.equal(parseReport(bad, plan).secret, true);
  // A line that looks like a register line but carries free text in place of a reason is not exempt.
  const forged = `- Marked as mine · Base (chain 8453) · 2026-11-08 09:00 UTC · ${h(9)} · my private key is below`;
  assert.equal(isRegisterLine(forged), false);
  assert.equal(parseReport(`${report}\n${forged}`, plan).secret, true);
  assert.equal(looksSecret(forged), true);
});

test('round trip: what one browser remembers comes back identical (to the minute), minus wallet addresses', () => {
  const src = phone();
  const back = parseRegisterReport(reportMarkdown(plan, {}, { appendix: registerReportLines(src) }));
  assert.equal(back.unknown, 0);
  assert.equal(back.register.entries.length, 3);
  for (const e of src.entries) {
    const b = back.register.entries.find(x => x.hash === e.hash && x.kind === e.kind);
    assert.ok(b, e.hash);
    assert.equal(b.chainId, e.chainId); assert.equal(b.at, Math.floor(e.at / M) * M);
    assert.equal(b.label, e.label); assert.equal(b.reason, e.reason); assert.equal(b.address, undefined);
  }
  // Lines outside the section, malformed lines and odd values are not read.
  const text = [`## ${REGISTER_SECTION}`, '', `- From FYNX · Base Sepolia (chain 84532) · 2026-11-08 08:00 UTC · 0x1234 · Send`, `- Marked as mine · Base (chain 8453) · 2026-11-08 09:00 UTC · ${h(5)} · Because I said so`, `- From FYNX · Base (chain 0) · 2026-11-08 09:00 UTC · ${h(6)} · Send`, '## Other', `- From FYNX · Base (chain 8453) · 2026-11-08 09:00 UTC · ${h(7)} · Send`].join('\n');
  const odd = parseRegisterReport(text);
  assert.equal(odd.register.entries.length, 0); assert.equal(odd.unknown, 3);
  assert.equal(parseRegisterReport('').register.entries.length, 0);
});

test('merge: new transfers added, page entries keep this browser’s wallet, a later mark wins, nothing duplicated', () => {
  const p = phone();
  let computer = addSubmitted({ entries: [] }, { hash: h(1), label: '2.5 USDC', network: { id: 84532 }, address: W, submittedAt: T - 90 * M });
  computer = markKnown(computer, { hash: h(2), chainId: 84532, reason: 'other-device' }, T - 10 * M); // marked later than the phone
  computer = markKnown(computer, { hash: h(3), chainId: 8453, reason: 'earlier-session' }, T - 50 * M); // marked earlier than the phone
  const incoming = parseRegisterReport(reportMarkdown(plan, {}, { appendix: registerReportLines(p) })).register;
  const m = mergeRegisters(computer, incoming);
  assert.deepEqual(m.added, []); assert.equal(m.same.length, 1); assert.equal(m.kept.length, 1); assert.equal(m.updated.length, 1);
  const byHash = Object.fromEntries(m.register.entries.map(e => [e.hash, e]));
  assert.equal(byHash[h(1)].address, W.toLowerCase(), 'this browser keeps the wallet it knew');
  assert.equal(byHash[h(2)].reason, 'other-device');
  assert.equal(byHash[h(3)].reason, 'own-transfer');
  // Into an empty browser everything is new; importing twice changes nothing.
  const fresh = mergeRegisters({ entries: [] }, incoming);
  assert.equal(fresh.added.length, 3);
  const again = mergeRegisters(fresh.register, incoming);
  assert.equal(again.added.length + again.updated.length, 0); assert.equal(again.same.length, 3);
  // Undo does not travel: a mark undone here comes back if the other device still has it (documented in the preview).
  const undone = unmark(fresh.register, { hash: h(2), chainId: 84532 });
  assert.equal(mergeRegisters(undone, incoming).added.length, 1);
});

test('merge keeps the newest entries within the limit and counts what fell off', () => {
  let local = { entries: [] };
  for (let i = 0; i < MAX_ENTRIES; i++) local = addSubmitted(local, { hash: h(1000 + i), label: 'ETH transfer', network: { id: 84532 }, submittedAt: T + i * M });
  const old = markKnown({ entries: [] }, { hash: h(5), chainId: 84532, reason: 'other-app' }, T - 1000 * M);
  const m = mergeRegisters(local, old);
  assert.equal(m.register.entries.length, MAX_ENTRIES); assert.equal(m.added.length, 0); assert.equal(m.dropped, 1);
  assert.equal(cleanRegister(m.register).entries.length, MAX_ENTRIES);
});

test('an imported register lets reconciliation on the second device recognise the phone’s FYNX transfers and marks', () => {
  const imported = mergeRegisters({ entries: [] }, parseRegisterReport(reportMarkdown(plan, {}, { appendix: registerReportLines(phone()) })).register).register;
  const item = (n, amount) => ({ hash: h(n), direction: 'out', token: 'USDC', amount, from: W, to: A, block: 100 + n, time: '2026-11-08T08:00:00.000Z' });
  const result = reconcile({ history: { chainId: 84532, network: 'Base Sepolia', items: [item(1, '2.5'), item(2, '1')], more: false }, journal: [], balances: null, wallet: W, policy: null, known: imported.entries.filter(e => e.chainId === 84532), now: T });
  assert.equal(result.outside.length, 0);
  assert.equal(result.transfers.find(t => t.hash === h(1)).source, 'earlier');
  assert.equal(result.transfers.find(t => t.hash === h(2)).source, 'marked');
});

test('workspace wiring: report appendix, import preview and apply, and the owner-facing explanation', () => {
  assert.match(app, /registerReportLines\(pilotRegister\)/);
  assert.match(app, /parseRegisterReport\(text\)/);
  assert.match(app, /mergeRegisters\(pilotRegister, rgIn\.register\)/);
  assert.match(app, /if \(transfers\) \{ pilotRegister = rgi\.register; savePilotRegister\(\); renderReconcile\(\); \}/);
  assert.match(app, /They travel to your other devices in the Launch readiness test report\./);
  assert.match(owner, /the pilot transfer register from Crypto tools → Reconciliation/);
});

test('an unlisted network still round-trips', () => {
  const r = addSubmitted({ entries: [] }, { hash: h(8), label: 'ETH transfer', network: { id: 421614 }, submittedAt: T });
  const back = parseRegisterReport(registerReportLines(r).join('\n'));
  assert.equal(back.unknown, 0); assert.equal(back.register.entries[0].chainId, 421614);
});
