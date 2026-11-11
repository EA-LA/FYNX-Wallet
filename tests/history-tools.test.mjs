import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTransfers, filterTransfers, isFiltered, totals, byMonth, counterparties, setLabel, cleanLabels, cleanLabel, labelOf, historyCSV, csvName, summaryText, sourceOf, MAX_LABELS } from '../wallet-src/history-tools.js';

const ME = '0x1111111111111111111111111111111111111111';
const A = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa';
const B = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB';
const h = n => `0x${String(n).padStart(64, '0')}`;
const raw = [
  { hash: h(1), direction: 'in', token: 'ETH', amount: '0.1', from: A, to: ME, block: 10, time: '2026-10-02T08:00:00.000Z' },
  { hash: h(2), direction: 'out', token: 'ETH', amount: '0.03', from: ME, to: B, block: 20, time: '2026-11-03T09:30:00.000Z' },
  { hash: h(3), direction: 'in', token: 'USDC', amount: '10.5', from: A, to: ME, block: 30, time: '2026-11-04T10:00:00Z' },
  { hash: h(4), direction: 'out', token: 'USDC', amount: '2.000001', from: ME, to: A, block: 40, time: null },
  { hash: 'bad', direction: 'in', token: 'ETH', amount: '1', from: A },
  { hash: h(5), direction: 'in', token: 'DAI', amount: '1', from: A },
  { hash: h(6), direction: 'in', token: 'ETH', amount: '1e3', from: A },
];
const history = { chainId: 84532, network: 'Base Sepolia', explorer: 'https://sepolia.basescan.org', items: raw };

test('malformed transfers are left out; the other wallet is set by direction', () => {
  const list = cleanTransfers(raw);
  assert.equal(list.length, 4);
  assert.equal(list[0].other, A); assert.equal(list[1].other, B); assert.equal(list[3].other, A);
  assert.equal(list[2].time, '2026-11-04T10:00:00.000Z');
  assert.deepEqual(cleanTransfers(null), []);
});

test('totals are exact (no floating point) per asset with counts and a signed net', () => {
  const rows = totals(cleanTransfers([...raw, { hash: h(7), direction: 'in', token: 'ETH', amount: '0.2', from: A }]));
  const eth = rows.find(r => r.token === 'ETH'), usdc = rows.find(r => r.token === 'USDC');
  assert.deepEqual(eth, { token: 'ETH', received: '0.3', sent: '0.03', net: '+0.27', countIn: 2, countOut: 1 });
  assert.deepEqual(usdc, { token: 'USDC', received: '10.5', sent: '2.000001', net: '+8.499999', countIn: 1, countOut: 1 });
  const out = totals(cleanTransfers([raw[1]]));
  assert.deepEqual(out, [{ token: 'ETH', received: '0', sent: '0.03', net: '-0.03', countIn: 0, countOut: 1 }]);
  assert.deepEqual(totals([]), []);
});

test('filter by direction, asset and search across address, transaction ID and label', () => {
  const list = cleanTransfers(raw), labels = setLabel({}, B, 'Ledger test account', 1).labels;
  assert.equal(filterTransfers(list, { direction: 'in' }).length, 2);
  assert.equal(filterTransfers(list, { token: 'USDC' }).length, 2);
  assert.equal(filterTransfers(list, { direction: 'out', token: 'USDC' }).length, 1);
  assert.equal(filterTransfers(list, { query: 'aaaa' }).length, 3);
  assert.equal(filterTransfers(list, { query: h(3).slice(-6) }).length, 1);
  assert.equal(filterTransfers(list, { query: 'ledger', labels }).length, 1);
  assert.equal(filterTransfers(list, { direction: 'sideways', token: 'DOGE' }).length, 4);
  assert.equal(isFiltered({}), false); assert.equal(isFiltered({ query: '  ' }), false);
  assert.equal(isFiltered({ token: 'ETH' }), true); assert.equal(isFiltered({ direction: 'out' }), true);
});

test('by month: UTC months newest first, undated last', () => {
  const months = byMonth(cleanTransfers(raw));
  assert.deepEqual(months.map(m => m.month), ['2026-11', '2026-10', 'No date']);
  assert.equal(months[0].label, 'November 2026'); assert.equal(months[0].count, 2);
  assert.deepEqual(months[0].tokens.map(t => [t.token, t.received, t.sent]), [['ETH', '0', '0.03'], ['USDC', '10.5', '0']]);
  assert.equal(months[2].label, 'No date');
});

test('wallets you transact with: grouped case-insensitively, most transfers first, single transfers flagged', () => {
  const list = cleanTransfers([...raw, { hash: h(8), direction: 'in', token: 'ETH', amount: '0.5', from: A.toLowerCase(), to: ME, time: '2026-11-05T00:00:00Z' }]);
  const labels = setLabel({}, A, 'Base faucet', 1).labels;
  const people = counterparties(list, labels);
  assert.equal(people.length, 2);
  assert.equal(people[0].label, 'Base faucet'); assert.equal(people[0].count, 4);
  assert.equal(people[0].received, 3); assert.equal(people[0].sent, 1);
  assert.equal(people[0].first, '2026-10-02T08:00:00.000Z'); assert.equal(people[0].last, '2026-11-05T00:00:00.000Z');
  assert.equal(people[0].once, false);
  assert.equal(people[1].short, '0xbBbB…BBbB'); assert.equal(people[1].once, true); assert.equal(people[1].label, '');
  assert.deepEqual(people[0].tokens.find(t => t.token === 'ETH'), { token: 'ETH', received: '0.6', sent: '0', net: '+0.6', countIn: 2, countOut: 0 });
});

test('labels: trimmed, limited, refuse addresses, emails, keys and phrases; empty removes', () => {
  assert.deepEqual(cleanLabel('  My   phone  '), { label: 'My phone' });
  assert.ok(cleanLabel('x'.repeat(41)).error);
  assert.ok(cleanLabel(`send to ${A}`).error);
  assert.ok(cleanLabel('me@example.com').error);
  assert.ok(cleanLabel('abandon ability able about above absent absorb abstract absurd abuse access accident').error);
  assert.ok(setLabel({}, 'nope', 'x').error);
  let { labels } = setLabel({}, A, 'Faucet', 5);
  assert.equal(labelOf(labels, A.toLowerCase()), 'Faucet');
  assert.equal(labelOf(labels, A.toUpperCase().replace('0X', '0x')), 'Faucet');
  ({ labels } = setLabel(labels, A, '   ', 6));
  assert.deepEqual(labels, {});
  assert.deepEqual(cleanLabels({ nope: { label: 'x' }, [A]: { label: `${'y'.repeat(50)}` }, [B]: 'string' }), {});
  const many = {}; for (let i = 0; i < MAX_LABELS + 20; i += 1) many[`0x${String(i).padStart(40, '0')}`] = { label: `W${i}`, at: i };
  const kept = cleanLabels(many);
  assert.equal(Object.keys(kept).length, MAX_LABELS);
  assert.equal(kept[`0x${'0'.repeat(40)}`], undefined, 'oldest labels drop first');
});

test('FYNX record comes from the pilot register', () => {
  const [inbound, out] = cleanTransfers(raw);
  assert.equal(sourceOf(inbound, 84532, []), 'Received');
  assert.equal(sourceOf(out, 84532, []), 'Not from FYNX on this browser');
  assert.equal(sourceOf(out, 84532, [{ hash: h(2).toUpperCase().replace('0X', '0x'), chainId: 84532, kind: 'page' }]), 'Sent from FYNX');
  assert.equal(sourceOf(out, 84532, [{ hash: h(2), chainId: 84532, kind: 'marked', reason: 'other-app' }]), 'Marked yours: another wallet app');
  assert.equal(sourceOf(out, 8453, [{ hash: h(2), chainId: 84532, kind: 'page' }]), 'Not from FYNX on this browser', 'other network does not count');
});

test('CSV: exact amounts, full IDs, explorer links, labels, formula-safe cells, BOM and CRLF', () => {
  const labels = setLabel({}, B, '=HYPERLINK("x")', 1).labels;
  const csv = historyCSV(cleanTransfers(raw), history, { labels, known: [{ hash: h(2), chainId: 84532, kind: 'page' }] });
  assert.ok(csv.startsWith('﻿"Date (UTC)","Network","Direction"'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 5);
  assert.equal(lines[2], `"2026-11-03 09:30:00","Base Sepolia","Sent","ETH","0.03","${B}","'=HYPERLINK(""x"")","Sent from FYNX","${h(2)}","20","https://sepolia.basescan.org/tx/${h(2)}"`);
  assert.ok(lines[4].startsWith('"","Base Sepolia","Sent","USDC","2.000001"'));
  assert.ok(!historyCSV(cleanTransfers(raw), { ...history, explorer: 'javascript:alert(1)' }).includes('javascript'));
  assert.equal(csvName(history, '2026-11-11'), 'fynx-history-base-sepolia-2026-11-11.csv');
});

test('summary has totals and months but no addresses or transaction IDs', () => {
  const list = cleanTransfers(raw);
  const text = summaryText(filterTransfers(list, { token: 'ETH' }), history, { filter: { token: 'ETH' }, more: true, date: '2026-11-11' });
  assert.match(text, /^FYNX transaction history · Base Sepolia · 2026-11-11\n2 transfers \(ETH only\) · newest 100 loaded/);
  assert.match(text, /- ETH: received 0\.1 \(1\), sent 0\.03 \(1\), net \+0\.07/);
  assert.match(text, /- November 2026: 1 transfer · ETH in 0 \/ out 0\.03/);
  assert.match(text, /Other wallets: 2 \(2 with a single transfer\)\./);
  assert.ok(!/0x[0-9a-f]{6}/i.test(text));
  assert.equal(summaryText([], history, { date: '2026-11-11' }), 'FYNX transaction history · Base Sepolia · 2026-11-11\n0 transfers.\n');
});
