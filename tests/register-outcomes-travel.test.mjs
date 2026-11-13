// Pilot register: the last status-check answer of each FYNX transfer travels in the test report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reportMarkdown, parseReport } from '../wallet-src/launch-tracker.js';
import { addSubmitted, recordOutcome, markKnown, registerReportLines, parseRegisterReport, mergeRegisters, isRegisterLine, lastSubmitted, checkedCount, checkWords, CHECK_WORDS, REGISTER_SECTION } from '../wallet-src/pilot-register.js';
import { lastSentStatus } from '../wallet-src/today-brief.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const W = '0x1111111111111111111111111111111111111111';
const h = n => '0x' + String(n).padStart(64, 'c');
const T = Date.UTC(2026, 10, 13, 9, 30), M = 60000;
const sent = (r, n, at, label = '1 USDC') => addSubmitted(r, { hash: h(n), label, network: { id: 84532 }, address: W, submittedAt: at });
const travel = r => parseRegisterReport(reportMarkdown(plan, {}, { date: new Date(T), appendix: registerReportLines(r) }));

test('the fixed check words are the Today tile words, one per settled answer', () => {
  for (const [w, v] of Object.entries(CHECK_WORDS)) {
    assert.equal(lastSentStatus(v.outcome, v.deep), w);
    assert.equal(checkWords(v.outcome, v.deep), w);
  }
  assert.equal(checkWords('waiting'), '');
  assert.equal(checkWords('failed', true), 'failed on-chain', 'only a confirmation can be settled deep');
});

test('a FYNX line carries the last check in brackets; marks and unchecked transfers do not', () => {
  let r = sent({ entries: [] }, 1, T - 60 * M, '2.5 USDC');
  r = recordOutcome(r, { hash: h(1), chainId: 84532, status: 'confirmed', deep: true }, T - 40 * M);
  r = sent(r, 2, T - 30 * M);
  r = markKnown(r, { hash: h(3), chainId: 84532, reason: 'other-app' }, T - 20 * M);
  const lines = registerReportLines(r);
  assert.ok(lines.includes(`- From FYNX · Base Sepolia (chain 84532) · 2026-11-13 08:30 UTC · ${h(1)} · 2.5 USDC · [last check: confirmed and settled · 2026-11-13 08:50 UTC]`));
  assert.ok(lines.includes(`- From FYNX · Base Sepolia (chain 84532) · 2026-11-13 09:00 UTC · ${h(2)} · 1 USDC`));
  assert.equal(lines.filter(l => l.includes('[last check')).length, 1);
  assert.equal(lines.filter(isRegisterLine).length, 3);
  assert.equal(checkedCount(r), 1);
  // The report with these lines is still not mistaken for one holding a secret.
  assert.equal(parseReport(reportMarkdown(plan, {}, { appendix: lines }), plan).secret, false);
});

test('round trip keeps every answer, to the minute, and the Today tile on the other device says the same', () => {
  let r = { entries: [] };
  const answers = [['confirmed', false], ['confirmed', true], ['failed', false], ['replaced', false], ['dropped', false]];
  answers.forEach(([status, deep], i) => { r = sent(r, 10 + i, T - (50 - i) * M); r = recordOutcome(r, { hash: h(10 + i), chainId: 84532, status, deep }, T - (40 - i) * M + 17000); });
  const back = travel(r);
  assert.equal(back.unknown, 0); assert.equal(back.register.entries.length, 5);
  answers.forEach(([status, deep], i) => {
    const e = back.register.entries.find(x => x.hash === h(10 + i));
    assert.equal(e.outcome, status); assert.equal(Boolean(e.deep), deep); assert.equal(e.outcomeAt, T - (40 - i) * M);
  });
  const phone = lastSubmitted(r), computer = lastSubmitted(mergeRegisters({ entries: [] }, back.register).register);
  assert.equal(lastSentStatus(computer.outcome, computer.deep), lastSentStatus(phone.outcome, phone.deep));
  assert.equal(lastSentStatus(computer.outcome, computer.deep), 'dropped, nothing spent');
});

test('old report lines (no bracket) still read; forged or odd brackets are refused', () => {
  const plain = `- From FYNX · Base Sepolia (chain 84532) · 2026-11-13 08:30 UTC · ${h(1)} · 2.5 USDC`;
  assert.equal(isRegisterLine(plain), true);
  const okText = [`## ${REGISTER_SECTION}`, '', plain].join('\n');
  assert.equal(parseRegisterReport(okText).register.entries[0].outcome, undefined);
  const bad = [
    `${plain} · [last check: my seed phrase is here · 2026-11-13 08:50 UTC]`,
    `${plain} · [last check: confirmed · 2026-13-45 08:50 UTC]`,
    `- Marked as mine · Base (chain 8453) · 2026-11-13 09:00 UTC · ${h(4)} · Moved between my own wallets · [last check: confirmed · 2026-11-13 09:10 UTC]`,
    `${plain} · [last check: waiting · 2026-11-13 08:50 UTC]`,
  ];
  for (const line of bad) assert.equal(isRegisterLine(line), false, line);
  const parsed = parseRegisterReport([`## ${REGISTER_SECTION}`, '', ...bad].join('\n'));
  assert.equal(parsed.register.entries.length, 0); assert.equal(parsed.unknown, 4);
});

test('merge: a later check from the other device comes in; this browser keeps a newer or equal answer and its wallet', () => {
  let computer = sent({ entries: [] }, 1, T - 60 * M);
  computer = sent(computer, 2, T - 55 * M);
  computer = recordOutcome(computer, { hash: h(2), chainId: 84532, status: 'confirmed', deep: true }, T - 5 * M);
  computer = sent(computer, 3, T - 50 * M);
  computer = recordOutcome(computer, { hash: h(3), chainId: 84532, status: 'confirmed' }, T - 30 * M);
  let phone = sent({ entries: [] }, 1, T - 60 * M);
  phone = recordOutcome(phone, { hash: h(1), chainId: 84532, status: 'failed' }, T - 20 * M); // not checked on the computer
  phone = sent(phone, 2, T - 55 * M);
  phone = recordOutcome(phone, { hash: h(2), chainId: 84532, status: 'replaced' }, T - 25 * M); // older than the computer's
  phone = sent(phone, 3, T - 50 * M);
  phone = recordOutcome(phone, { hash: h(3), chainId: 84532, status: 'confirmed', deep: true }, T - 10 * M); // later and deeper
  const m = mergeRegisters(computer, travel(phone).register);
  assert.equal(m.added.length, 0); assert.equal(m.checks.length, 2); assert.equal(m.same.length, 1);
  const by = Object.fromEntries(m.register.entries.map(e => [e.hash, e]));
  assert.equal(by[h(1)].outcome, 'failed'); assert.equal(by[h(1)].address, W.toLowerCase());
  assert.equal(by[h(2)].outcome, 'confirmed'); assert.equal(by[h(2)].deep, true);
  assert.equal(by[h(3)].deep, true); assert.equal(by[h(3)].outcomeAt, T - 10 * M);
  const c1 = m.checks.find(e => e.hash === h(1));
  assert.equal(c1.before, null);
  assert.equal(m.checks.find(e => e.hash === h(3)).before, 'confirmed');
  // Importing again changes nothing.
  const again = mergeRegisters(m.register, travel(phone).register);
  assert.equal(again.checks.length + again.added.length + again.updated.length, 0);
});

test('workspace wiring: preview counts checks, apply saves them, register line explains it', () => {
  assert.match(app, /rgm\.checks\.length, 'checked later on the other device'/);
  assert.match(app, /transfers = rgm\.added\.length \+ rgm\.updated\.length \+ rgm\.checks\.length/);
  assert.match(app, /What the last status check said travels too/);
});
