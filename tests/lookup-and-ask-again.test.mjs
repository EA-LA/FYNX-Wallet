import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canFindReplacement, lookupFacts, lookupNext, formatWei, findReplacement, checkTransaction, lookbackBlocks } from '../wallet-src/tx-tracker.js';
import { missingAfterAnswer, missingAttention, evidenceItems } from '../wallet-src/outside-evidence.js';
import { CHASE_DAYS } from '../wallet-src/outside-requests.js';
import { outsideBrief } from '../wallet-src/outside-handoff.js';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';

const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const owner = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
const handoff = await readFile(new URL('../wallet-src/outside-handoff.js', import.meta.url), 'utf8');
const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const base = NETWORKS[84532];
const hex = n => '0x' + n.toString(16);
const h = byte => '0x' + byte.repeat(32);
const wallet = '0x' + '12'.repeat(20), recipient = '0x' + '34'.repeat(20);

// ---- Track: looking up a transaction ID that was not submitted on this page ----

test('a typed-in transaction still known by the network, whose number was used, can have its replacement searched', async () => {
  const original = h('ab'), replacement = h('cd');
  const origTx = { hash: original, from: wallet, to: recipient, nonce: hex(7), value: hex(10n ** 15n), input: '0x' };
  const repTx = { hash: replacement, from: wallet, to: recipient, nonce: hex(7), value: hex(10n ** 15n), input: '0x', blockNumber: hex(995) };
  const request = async ({ method, params }) => {
    if (method === 'eth_getTransactionByHash') return params[0] === original ? origTx : params[0] === replacement ? repTx : null;
    if (method === 'eth_getTransactionReceipt') return params[0] === replacement ? { transactionHash: replacement, blockNumber: hex(995), status: '0x1' } : null;
    if (method === 'eth_blockNumber') return hex(1000);
    if (method === 'eth_getTransactionCount') return hex(params[1] === 'latest' || Number(BigInt(params[1])) >= 995 ? 8 : 7);
    if (method === 'eth_getBlockByNumber') return { transactions: Number(BigInt(params[0])) === 995 ? [repTx] : [] };
    throw new Error('unexpected ' + method);
  };
  // No "known" facts: the lookup form passes nothing for IDs not submitted on this page.
  const result = await checkTransaction(request, original, {}, base);
  assert.equal(result.status, 'replaced');
  assert.equal(canFindReplacement(result), true);
  // No submit time: the search covers the full day window.
  assert.equal(lookbackBlocks(base, undefined), 24 * 60 * 60 / 2);
  const found = await findReplacement(request, { hash: original, from: result.from, nonce: result.nonce, original: result.call }, base);
  assert.equal(found.state, 'found');
  assert.equal(found.hash, replacement);
  assert.equal(found.kind, 'speed-up');
  assert.equal(found.status, 'confirmed');
  assert.match(lookupNext(result, { replacement: found }), /Check the replacement again/);
});

test('canFindReplacement needs a replaced status with the wallet and number known', () => {
  assert.equal(canFindReplacement({ status: 'replaced', from: wallet, nonce: 3 }), true);
  assert.equal(canFindReplacement({ status: 'replaced', from: null, nonce: 3 }), false);
  assert.equal(canFindReplacement({ status: 'replaced', from: wallet, nonce: null }), false);
  assert.equal(canFindReplacement({ status: 'pending', from: wallet, nonce: 3 }), false);
  assert.equal(canFindReplacement(null), false);
  assert.match(lookupNext({ status: 'replaced', from: null, nonce: null }), /search by wallet and number below/);
  assert.match(lookupNext({ status: 'replaced', from: wallet, nonce: 1 }), /Find the replacement/);
});

test('lookupFacts lists public facts, exact ETH amounts and whether FYNX sent it', () => {
  const confirmed = { status: 'confirmed', label: 'Confirmed', from: wallet, to: null, nonce: 4, block: 120, confirmations: 40, target: 30, deep: true, call: { to: null, value: '1500000000000000000', input: '0x' } };
  const rows = Object.fromEntries(lookupFacts(confirmed, { origin: 'register' }));
  assert.equal(rows.Status, 'Confirmed');
  assert.equal(rows.To, 'A new contract');
  assert.equal(rows['Number (nonce)'], '4');
  assert.equal(rows.Block, '120');
  assert.equal(rows.Confirmations, '40 of 30 (settled)');
  assert.equal(rows['Sends ETH'], '1.5 ETH');
  assert.match(rows['Sent from FYNX'], /earlier session/);
  // A token call (data present) does not claim an ETH amount; not found: only status and origin.
  assert.equal(Object.fromEntries(lookupFacts({ ...confirmed, call: { to: recipient, value: '0', input: '0xa9059cbb' } }))['Sends ETH'], undefined);
  assert.deepEqual(lookupFacts({ status: 'not-found', label: 'Not found on this network' }).map(r => r[0]), ['Status', 'Sent from FYNX']);
  assert.deepEqual(lookupFacts(null), []);
  assert.equal(formatWei('1'), '0.000000000000000001');
  assert.equal(formatWei('2000000000000000000'), '2');
});

test('the lookup card is wired: result region, find / check again, cleared on sign-out and network change, no register writes', () => {
  assert.match(owner, /id="lookup-result"[^>]*hidden/);
  assert.match(app, /function renderLookup\(\)/);
  assert.match(app, /lookupEntry = null; \$\('#lookup-result'\)\.replaceChildren\(\)/);
  assert.match(app, /renderJournal\(\); renderLookup\(\);/);
  assert.match(app, /#lookup-result \.tx-check, #lookup-result \.tx-find/);
  const block = app.slice(app.indexOf('async function findLookupReplacement'), app.indexOf('function renderLookup'));
  assert.doesNotMatch(block, /addSubmitted|savePilotRegister|eth_send|signTransaction/);
});

// ---- Outside hand-off: answered, but evidence still missing ----

const terms = 'counsel|legal/terms';
test('missingAfterAnswer counts from the answer date and turns due after CHASE_DAYS', () => {
  assert.equal(CHASE_DAYS, 14);
  const req = { sent: '2026-10-01', answered: '2026-10-20' };
  const early = missingAfterAnswer(terms, req, { got: ['terms'], changed: 1 }, '2026-10-30');
  assert.equal(early.due, false);
  assert.equal(early.days, 10);
  assert.equal(early.askOn, '2026-11-03');
  assert.equal(early.missing.length, evidenceItems(terms).length - 1);
  assert.match(early.label, /3 pieces still missing since their answer of 2026-10-20 · ask again from 2026-11-03/);
  const due = missingAfterAnswer(terms, req, { got: ['terms'], changed: 1 }, '2026-11-03');
  assert.equal(due.due, true);
  assert.match(due.label, /3 pieces still missing 14 days after their answer of 2026-10-20: ask again for them/);
  const one = missingAfterAnswer(terms, req, { got: ['terms', 'privacy-notice', 'risk'], changed: 1 }, '2026-11-09');
  assert.match(one.label, /^1 piece still missing .*ask again for it$/);
  assert.equal(missingAfterAnswer(terms, req, null, '2026-11-09').nothingTicked, true);
  // Nothing to ask for: not answered, complete, unknown request or bad date.
  assert.equal(missingAfterAnswer(terms, { sent: '2026-10-01', answered: '' }, null, '2026-11-09'), null);
  assert.equal(missingAfterAnswer(terms, req, { got: evidenceItems(terms).map(i => i.id), changed: 1 }, '2026-11-09'), null);
  assert.equal(missingAfterAnswer('counsel|nope/x', req, null, '2026-11-09'), null);
  assert.equal(missingAfterAnswer(terms, { sent: '2026-10-01', answered: '2026-13-40' }, null, '2026-11-09'), null);
});

test('missingAttention lists only open, due requests, longest first, with a limit', () => {
  const requests = { entries: {
    [terms]: { sent: '2026-10-01', answered: '2026-10-20', changed: 1 },
    'counsel|legal/analysis': { sent: '2026-09-01', answered: '2026-09-10', changed: 1 },
    'reviewer|production-security/audit': { sent: '2026-11-01', answered: '2026-11-05', changed: 1 },
    'data|assets/prices': { sent: '2026-09-01', answered: '2026-09-02', changed: 1 },
  } };
  const evidence = { entries: { 'data|assets/prices': { got: evidenceItems('data|assets/prices').map(i => i.id), changed: 1 } } };
  const open = [terms, 'counsel|legal/analysis', 'reviewer|production-security/audit', 'data|assets/prices'];
  const all = missingAttention(requests, evidence, open, '2026-11-09', { limit: 5 });
  assert.equal(all.count, 2);
  assert.deepEqual(all.next.map(x => x.id), ['counsel|legal/analysis', terms]);
  assert.equal(all.next[0].party.id, 'counsel');
  assert.equal(all.next[0].stepKey, 'legal/analysis');
  assert.equal(missingAttention(requests, evidence, open, '2026-11-09', { limit: 1 }).next.length, 1);
  // A step that is done is not in `open`, so it is never asked again.
  assert.equal(missingAttention(requests, evidence, [terms], '2026-11-09').count, 1);
  assert.equal(missingAttention(requests, evidence, [], '2026-11-09').count, 0);
});

test('the copied list says how long ago they answered once pieces are overdue', () => {
  const prices = 'data|assets/prices', items = evidenceItems(prices);
  const evidence = { 'assets/prices': { state: 'partial', received: [items[0]], missing: items.slice(1) } };
  const sent = { 'assets/prices': { sent: '2026-10-01', answered: '2026-10-20' } };
  const brief = date => { const s = outsideBrief(plan, {}, 'data', {}, { date: new Date(date), sent, evidence }); return s.slice(s.indexOf('`assets/prices`')); };
  const late = brief('2026-11-09T12:00:00Z'), early = brief('2026-10-25T12:00:00Z');
  assert.match(late, /Your answer of 2026-10-20 is noted, thank you\. Reminder: 20 days later these points are still needed to close this step:/);
  assert.match(late, /Please send back \(still missing\)/);
  assert.match(early, /Your answer of 2026-10-20 is noted, thank you\. These are the points still needed/);
  assert.doesNotMatch(early, /Reminder:/);
  // The copy of CHASE_DAYS in outside-handoff.js (avoids a circular import) must stay in step.
  assert.match(handoff, new RegExp(`const ASK_AGAIN_DAYS = ${CHASE_DAYS};`));
});

test('ask-again is wired into the hand-off box and Your next steps', () => {
  assert.match(app, /function outsideAskAgain\(/);
  assert.match(app, /Ask again for missing pieces · \$\{item\.party\.name\}/);
  assert.match(app, /to ask again for missing pieces/);
  assert.match(app, /openOutsideRequest\(item\.partyId, item\.stepKey, true\)/);
});
