import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readRecipient, describeActivity, nameOffer, activityKey, pasteCheckDue, blockedAnswer, ACTIVITY_STATES } from '../wallet-src/recipient-activity.js';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';

const BASE_SEPOLIA = NETWORKS[84532], BASE = NETWORKS[8453];
const WHO = '0x5A3c00000000000000000000000000000000B7e9';
const hex = n => `0x${BigInt(n).toString(16)}`;
// A fake read-only connection: answers only the read methods the check is allowed to use and records every call.
function fakeRequest({ code = '0x', nonce = 0, eth = 0n, usdc = 0n, usdcFails = false, block = 123456, blocked = 0n, blockedFails = false } = {}) {
  const calls = [];
  const request = async ({ method, params }) => {
    calls.push({ method, params });
    if (method === 'eth_getCode') return code;
    if (method === 'eth_getTransactionCount') return hex(nonce);
    if (method === 'eth_getBalance') return hex(eth);
    if (method === 'eth_blockNumber') return hex(block);
    if (method === 'eth_call' && params[0].data.startsWith('0xfe575a87')) { if (blockedFails) throw new Error('execution reverted'); return typeof blocked === 'string' ? blocked : `0x${blocked.toString(16).padStart(64, '0')}`; }
    if (method === 'eth_call') { if (usdcFails) throw new Error('execution reverted'); return `0x${usdc.toString(16).padStart(64, '0')}`; }
    throw new Error(`unexpected method ${method}`);
  };
  return { request, calls };
}

test('reads code, transactions sent, ETH and USDC with read-only calls only', async () => {
  const { request, calls } = fakeRequest({ nonce: 7, eth: 10n ** 15n, usdc: 5_000_000n });
  const facts = await readRecipient(request, WHO, BASE_SEPOLIA);
  assert.deepEqual({ kind: facts.kind, sent: facts.sent, eth: facts.eth, usdc: facts.usdc, block: facts.block, chainId: facts.chainId }, { kind: 'wallet', sent: 7, eth: 10n ** 15n, usdc: 5_000_000n, block: 123456, chainId: 84532 });
  assert.equal(facts.address, WHO.toLowerCase());
  assert.deepEqual(calls.map(c => c.method).sort(), ['eth_blockNumber', 'eth_call', 'eth_call', 'eth_getBalance', 'eth_getCode', 'eth_getTransactionCount']);
  assert.equal(facts.usdcBlocked, false);
  const call = calls.find(c => c.method === 'eth_call' && c.params[0].data.startsWith('0x70a08231')).params[0];
  assert.equal(call.to, BASE_SEPOLIA.usdc.toLowerCase(), 'balanceOf goes to the pinned USDC contract');
  assert.equal(call.data, `0x70a08231${'0'.repeat(24)}${WHO.slice(2).toLowerCase()}`);
  assert.ok(!calls.some(c => /send|sign/i.test(c.method)), 'never signs or sends');
});

test('a failed USDC read only hides the USDC line; a network without USDC skips it', async () => {
  const failed = await readRecipient(fakeRequest({ nonce: 1, usdcFails: true }).request, WHO, BASE_SEPOLIA);
  assert.equal(failed.usdc, null);
  const { request, calls } = fakeRequest({ nonce: 1 });
  const none = await readRecipient(request, WHO, { id: 1, name: 'Elsewhere' });
  assert.equal(none.usdc, null);
  assert.ok(!calls.some(c => c.method === 'eth_call'));
});

test('refuses bad input and unreadable answers with plain sentences', async () => {
  await assert.rejects(readRecipient(fakeRequest().request, '0x123', BASE_SEPOLIA), /full wallet address/);
  const bad = async ({ method }) => (method === 'eth_getTransactionCount' ? 'nonsense' : method === 'eth_getCode' ? '0x' : '0x1');
  await assert.rejects(readRecipient(bad, WHO, BASE_SEPOLIA), /unreadable answer/);
  const badCode = async ({ method }) => (method === 'eth_getCode' ? 42 : '0x1');
  await assert.rejects(readRecipient(badCode, WHO, BASE_SEPOLIA), /unreadable answer/);
});

test('tells contracts, upgraded (EIP-7702) wallets and plain wallets apart', async () => {
  const contract = await readRecipient(fakeRequest({ code: '0x6080604052' }).request, WHO, BASE_SEPOLIA);
  assert.equal(contract.kind, 'contract');
  const delegate = '0x' + 'ab'.repeat(20);
  const upgraded = await readRecipient(fakeRequest({ code: `0xef0100${delegate.slice(2)}`, nonce: 3 }).request, WHO, BASE_SEPOLIA);
  assert.equal(upgraded.kind, 'delegated');
  assert.equal(upgraded.delegate, delegate);
  const v = describeActivity(contract, BASE_SEPOLIA);
  assert.equal(v.state, 'contract');
  assert.match(v.lines[0].text, /contract, not a personal wallet/);
  assert.equal(v.lines[0].tone, 'bad');
  const u = describeActivity(upgraded, BASE_SEPOLIA);
  assert.equal(u.state, 'delegated');
  assert.match(u.lines[0].text, /EIP-7702\): 0xabab…abab/);
  assert.match(u.lines[1].text, /refuse this address/);
  assert.equal((await readRecipient(fakeRequest({ code: '0x0' }).request, WHO, BASE_SEPOLIA)).kind, 'wallet');
});

test('verdicts for active, receive-only and unused wallets', () => {
  const base = { address: WHO.toLowerCase(), kind: 'wallet', block: 1, delegate: null };
  const active = describeActivity({ ...base, sent: 1, eth: 0n, usdc: 3n }, BASE_SEPOLIA);
  assert.equal(active.state, 'active');
  assert.match(active.lines[0].text, /sent 1 transaction on Base Sepolia.*It holds test USDC\./);
  assert.match(active.lines[1].text, /does not prove it belongs/);
  const receiving = describeActivity({ ...base, sent: 0, eth: 1n, usdc: null }, BASE);
  assert.equal(receiving.state, 'received-only');
  assert.match(receiving.lines[0].text, /never sent a transaction on Base\. It holds ETH\./);
  const unused = describeActivity({ ...base, sent: 0, eth: 0n, usdc: 0n }, BASE_SEPOLIA);
  assert.equal(unused.state, 'unused');
  assert.equal(unused.title, 'Never used on Base Sepolia');
  assert.match(unused.lines[0].text, /mistyped or invented address looks exactly the same\. Many real wallets have never been used on a test network/);
  const unusedMain = describeActivity({ ...base, sent: 0, eth: 0n, usdc: 0n }, BASE);
  assert.doesNotMatch(unusedMain.lines[0].text, /test network/);
  assert.equal(describeActivity(null), null);
  for (const v of [active, receiving, unused]) assert.ok(ACTIVITY_STATES.includes(v.state));
});

test('name offer appears only after a confirmed transfer from this page to an unnamed wallet', () => {
  const to = WHO.toLowerCase();
  const items = [
    { hash: '0x01', to, network: { id: 84532 }, result: { status: 'pending' }, submittedAt: 1 },
    { hash: '0x02', to, network: { id: 11155111 }, result: { status: 'confirmed' }, submittedAt: 2, checkedAt: 3 },
    { hash: '0x03', to: null, network: { id: 84532 }, result: { status: 'confirmed' }, submittedAt: 4 },
  ];
  assert.equal(nameOffer(items, WHO, 84532, {}), null, 'pending or other-network transfers do not count');
  items.push({ hash: '0x04', to, network: { id: 84532 }, result: { status: 'confirmed' }, submittedAt: 5, checkedAt: 9 });
  items.push({ hash: '0x05', to, network: { id: 84532 }, result: { status: 'failed' }, submittedAt: 6 });
  assert.deepEqual(nameOffer(items, WHO, 84532, {}), { hash: '0x04', at: 9 });
  assert.equal(nameOffer(items, WHO, 84532, { [to]: { label: 'Friend' } }), null, 'already named');
  assert.equal(nameOffer(items, 'not an address', 84532, {}), null);
  assert.equal(activityKey(84532, WHO), `84532:${to}`);
});

test('owner page wires the check and the name offer without touching transfer logic', () => {
  const html = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  for (const id of ['rcpt-net', 'rcpt-net-check', 'rcpt-net-result', 'rcpt-net-lines', 'rcpt-net-status', 'rcpt-name', 'rcpt-name-input', 'rcpt-name-save']) assert.match(html, new RegExp(`id="${id}"`));
  // The naming box sits inside the send form, so it must not be a nested form (Enter would submit the transfer form).
  const box = html.slice(html.indexOf('id="rcpt-name"'), html.indexOf('id="rcpt-say"'));
  assert.doesNotMatch(box, /<form/);
  assert.match(box, /type="button"/);
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /readRecipient\(request => current\.provider\.request\(request\)/);
  assert.match(app, /trackTransaction\(hash, 'ETH transfer', current\.tx\?\.to\)/);
});

test('USDC issuer block list: read with isBlacklisted on the pinned USDC contract, only a clear yes counts', async () => {
  const { request, calls } = fakeRequest({ nonce: 2, blocked: 1n });
  const facts = await readRecipient(request, WHO, BASE_SEPOLIA);
  assert.equal(facts.usdcBlocked, true);
  const call = calls.find(c => c.method === 'eth_call' && c.params[0].data.startsWith('0xfe575a87')).params[0];
  assert.equal(call.to, BASE_SEPOLIA.usdc.toLowerCase());
  assert.equal(call.data, `0xfe575a87${'0'.repeat(24)}${WHO.slice(2).toLowerCase()}`);
  assert.equal((await readRecipient(fakeRequest({ nonce: 2, blockedFails: true }).request, WHO, BASE_SEPOLIA)).usdcBlocked, null, 'a failed read is not known, never blocked');
  assert.equal((await readRecipient(fakeRequest({ nonce: 2, blocked: 2n }).request, WHO, BASE_SEPOLIA)).usdcBlocked, null, 'odd answers are not known');
  assert.equal((await readRecipient(fakeRequest({ nonce: 2 }).request, WHO, { id: 1, name: 'Elsewhere' })).usdcBlocked, null, 'no USDC on the network: not read');
  assert.equal(blockedAnswer('0x' + '0'.repeat(63) + '1'), true);
  assert.equal(blockedAnswer('0x' + '0'.repeat(64)), false);
  for (const odd of ['0x', '0x1', null, 42, '0x' + 'f'.repeat(64), '0x' + 'g'.repeat(64)]) assert.equal(blockedAnswer(odd), null);
});

test('a blocked address leads the verdict with a stop line on top of the wallet facts', () => {
  const base = { address: WHO.toLowerCase(), kind: 'wallet', block: 1, delegate: null, sent: 4, eth: 1n, usdc: 0n };
  const v = describeActivity({ ...base, usdcBlocked: true }, BASE);
  assert.equal(v.usdcBlocked, true);
  assert.equal(v.state, 'active', 'the wallet state is kept');
  assert.equal(v.title, 'USDC blocked · In use on Base');
  assert.equal(v.lines[0].tone, 'bad');
  assert.match(v.lines[0].text, /Circle, the company that issues USDC, has blocked this address on Base\. The USDC contract refuses every USDC transfer/);
  assert.match(v.lines[1].text, /Do not send USDC here\. ETH is not affected/);
  assert.match(v.lines[2].text, /sent 4 transactions/);
  const test = describeActivity({ ...base, usdcBlocked: true }, BASE_SEPOLIA);
  assert.match(test.lines[0].text, /every test USDC transfer/);
  for (const flag of [false, null, undefined]) {
    const plain = describeActivity({ ...base, usdcBlocked: flag }, BASE);
    assert.equal(plain.usdcBlocked, false);
    assert.equal(plain.title, 'In use on Base');
    assert.doesNotMatch(plain.lines.map(l => l.text).join(' '), /Circle/);
  }
  const contract = describeActivity({ ...base, kind: 'contract', usdcBlocked: true }, BASE);
  assert.equal(contract.state, 'contract');
  assert.match(contract.title, /^USDC blocked · A contract/);
});

test('automatic check after paste: once per network and address, only for well-formed addresses with a wallet connected', () => {
  const result = { state: 'caution', address: WHO, grouped: '0x5A3c 0000' };
  const network = { id: 84532 };
  const ok = { enabled: true, pasted: true, result, network, attempted: new Set(), busy: false };
  assert.equal(pasteCheckDue(ok), true);
  assert.equal(pasteCheckDue({ ...ok, enabled: false }), false, 'switched off');
  assert.equal(pasteCheckDue({ ...ok, pasted: false }), false, 'typing never triggers it');
  assert.equal(pasteCheckDue({ ...ok, busy: true }), false, 'another action is running');
  assert.equal(pasteCheckDue({ ...ok, network: null }), false, 'no wallet connected');
  assert.equal(pasteCheckDue({ ...ok, result: { ...result, state: 'invalid' } }), false, 'typos are not checked');
  assert.equal(pasteCheckDue({ ...ok, result: { state: 'empty' } }), false);
  assert.equal(pasteCheckDue({ ...ok, result: { ...result, grouped: '' } }), false);
  assert.equal(pasteCheckDue({ ...ok, attempted: new Set([activityKey(84532, WHO)]) }), false, 'already checked once');
  assert.equal(pasteCheckDue({ ...ok, attempted: new Set([activityKey(8453, WHO)]) }), true, 'another network counts separately');
  assert.equal(pasteCheckDue(), false);
});

test('owner page offers the paste auto-check switch and shows the blocked badge', () => {
  const html = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  assert.match(html, /id="rcpt-net-auto" type="checkbox" checked/);
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /addEventListener\('paste'/);
  assert.match(app, /verdict\.usdcBlocked \? 'USDC blocked'/);
  assert.match(app, /recipientAuto\.clear\(\)/, 'sign-out and wallet change forget the automatic checks');
});
