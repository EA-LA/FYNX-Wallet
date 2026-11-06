import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setupSteps, faucetsFor, FAUCETS, amountOf, walletTests, TX_STEPS, txNote } from '../wallet-src/crypto-guide.js';
import { looksSecret, stepKey } from '../wallet-src/launch-tracker.js';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const owner = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
const base = NETWORKS[84532], sepolia = NETWORKS[11155111], mainnet = NETWORKS[8453];
const hash = '0x' + 'ab'.repeat(32);

test('balance text is read as a number, unknown stays unknown', () => {
  assert.equal(amountOf('0.0123'), 0.0123);
  assert.equal(amountOf('12.5 USDC'), 12.5);
  assert.equal(amountOf('0.0'), 0);
  assert.equal(amountOf('ETH unavailable'), null);
  assert.equal(amountOf(null), null);
  assert.equal(amountOf(''), null);
});

test('a fresh page points at the first missing step', () => {
  const r = setupSteps({ walletsFound: false, network: base });
  assert.equal(r.total, 6);
  assert.equal(r.done, 1); // test network already selected
  assert.equal(r.ready, false);
  assert.equal(r.steps[0].state, 'current');
  assert.equal(r.steps.filter(s => s.state === 'current').length, 1);
  assert.match(r.steps[0].detail, /Install or unlock/);
});

test('steps progress in order as the owner connects, verifies and funds', () => {
  let r = setupSteps({ walletsFound: true, network: base, connected: true });
  assert.equal(r.steps.find(s => s.state === 'current').id, 'verify');
  r = setupSteps({ walletsFound: true, network: base, connected: true, verified: true, eth: '0.0', usdc: '0.0' });
  const eth = r.steps.find(s => s.id === 'eth');
  assert.equal(eth.state, 'current'); assert.equal(eth.faucet, 'eth'); assert.match(eth.detail, /Balance is 0/);
  r = setupSteps({ walletsFound: true, network: base, connected: true, verified: true, eth: '0.05', usdc: '0.0' });
  // USDC is optional, so the next required step is a confirmed transaction.
  assert.equal(r.steps.find(s => s.state === 'current').id, 'confirmed');
  assert.equal(r.steps.find(s => s.id === 'usdc').state, 'todo');
  r = setupSteps({ walletsFound: true, network: base, connected: true, verified: true, eth: '0.05', usdc: '0', transactions: [{ status: 'pending', network: base }] });
  assert.match(r.steps.find(s => s.id === 'confirmed').detail, /1 submitted and waiting/);
  r = setupSteps({ walletsFound: true, network: base, connected: true, verified: true, eth: '0.05', usdc: '2', transactions: [{ status: 'confirmed', network: base }] });
  assert.equal(r.ready, true); assert.equal(r.done, r.total);
  assert.ok(r.steps.every(s => s.state === 'done'));
});

test('transactions on another network do not count', () => {
  const r = setupSteps({ walletsFound: true, network: sepolia, connected: true, verified: true, eth: '1', transactions: [{ status: 'confirmed', network: base }] });
  assert.equal(r.steps.find(s => s.id === 'confirmed').done, false);
});

test('Base mainnet is never treated as a ready test network', () => {
  const r = setupSteps({ walletsFound: true, network: mainnet, connected: true, verified: true, eth: '1', usdc: '5', transactions: [{ status: 'confirmed', network: mainnet }] });
  assert.equal(r.ready, false);
  assert.equal(r.steps.find(s => s.id === 'network').state, 'current');
  assert.match(r.steps.find(s => s.id === 'network').detail, /read-only/);
  assert.equal(r.steps.find(s => s.id === 'eth').done, false);
  assert.deepEqual(faucetsFor(8453), { eth: [], usdc: [] });
});

test('unverified wallets never show balances as funded', () => {
  const r = setupSteps({ walletsFound: true, network: base, connected: true, verified: false, eth: '1' });
  assert.match(r.steps.find(s => s.id === 'eth').detail, /Verify your wallet/);
});

test('faucet links are https, cover both test networks and include Circle USDC', () => {
  for (const id of [84532, 11155111]) {
    const f = FAUCETS[id];
    assert.ok(f.eth.length >= 1 && f.usdc.length >= 1);
    for (const link of [...f.eth, ...f.usdc]) assert.match(link.url, /^https:\/\/[a-z0-9.-]+\.(org|com)\//);
    assert.ok(f.usdc.some(l => l.url === 'https://faucet.circle.com/'));
  }
  assert.ok(FAUCETS[84532].eth.some(l => l.url.startsWith('https://docs.base.org/')), 'Base’s own faucet list, as the checklist step says');
});

test('wallet tests list only open owner steps for the Crypto tools tab, in checklist order', () => {
  const r = walletTests(plan, {});
  const keys = r.groups.flatMap(g => g.steps.map(s => s.key));
  assert.ok(keys.includes('signing/test-funds'));
  assert.ok(keys.includes('signing/send-eth'));
  assert.ok(keys.includes('swaps/revoke'));
  assert.ok(keys.includes('assets/lookup'));
  assert.ok(!keys.some(k => k.startsWith('identity/')), 'account tests stay on Account security');
  for (const g of r.groups) for (const s of g.steps) assert.equal(s.step.by, 'you');
  assert.equal(r.total, keys.length); assert.equal(r.done, 0);
  for (const key of TX_STEPS) assert.ok(keys.includes(key), `${key} exists in the checklist`);
});

test('recorded results are counted', () => {
  const r = walletTests(plan, { [stepKey('signing', 'send-eth')]: { result: 'pass' }, [stepKey('swaps', 'quote')]: { result: 'fail' }, [stepKey('fiat', 'failures')]: { result: 'skip' } });
  assert.equal(r.done, 2); assert.equal(r.failed, 1);
  const send = r.groups.find(g => g.gate.id === 'signing').steps.find(s => s.step.id === 'send-eth');
  assert.equal(send.state, 'done'); assert.equal(send.result, 'pass');
});

test('transaction notes add the ID once and are never mistaken for a secret', () => {
  const item = { hash, status: 'confirmed', network: base };
  const note = txNote(item);
  assert.equal(note, `Base Sepolia tx ${hash} (confirmed)`);
  assert.equal(looksSecret(note), false);
  assert.equal(txNote(item, note), note);
  assert.equal(txNote(item, 'Chrome on Mac'), `Chrome on Mac; ${note}`);
  assert.equal(txNote({ hash: '0x1234', network: base }), null);
  assert.equal(txNote(null), null);
  assert.equal(txNote(item, 'x'.repeat(250)), null);
});

test('owner page has the guide and the guide never touches signing or sending', () => {
  for (const id of ['crypto-guide', 'cg-score', 'cg-steps', 'cg-faucets', 'cg-tests', 'cg-tests-count', 'cg-open-launch', 'cg-status']) assert.match(owner, new RegExp(`id="${id}"`));
  const start = app.indexOf('// Crypto tools test guide'), end = app.indexOf("$('#cg-open-launch')");
  assert.ok(start > 0 && end > start);
  const guide = app.slice(start, end);
  assert.doesNotMatch(guide, /sendTransfer|sendAction|signChallenge|prepare(Transfer|TokenTransfer|Swap|Revoke)|api\(/);
});
