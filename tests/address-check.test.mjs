import test from 'node:test';
import assert from 'node:assert/strict';
import { getAddress } from 'ethers';
import { checkRecipient, poisoningSuspects, sharedEnds, isLookalike, knownWallets, knownContracts, grouped, suspectSet } from '../wallet-src/address-check.js';
import { cleanTransfers } from '../wallet-src/history-tools.js';

const ME = getAddress('0x1111111111111111111111111111111111111111');
const FRIEND = getAddress('0x5a3c00000000000000000000000000000000b7e9');
// Same first 4 and last 4 hex characters as FRIEND, different middle: a classic poisoning address.
const FAKE = getAddress('0x5a3c9999999999999999999999999999999fb7e9');
const STRANGER = getAddress('0x2222222222222222222222222222222222222222');
const h = n => `0x${String(n).padStart(64, '0')}`;
const history = cleanTransfers([
  { hash: h(1), direction: 'out', token: 'ETH', amount: '0.002', from: ME, to: FRIEND, block: 1, time: '2026-11-01T10:00:00Z' },
  { hash: h(2), direction: 'out', token: 'USDC', amount: '5', from: ME, to: FRIEND, block: 2, time: '2026-11-04T10:00:00Z' },
  { hash: h(3), direction: 'in', token: 'USDC', amount: '0', from: FAKE, to: ME, block: 3, time: '2026-11-04T10:05:00Z' },
  { hash: h(4), direction: 'in', token: 'ETH', amount: '0.1', from: STRANGER, to: ME, block: 4, time: '2026-11-02T10:00:00Z' },
]);
const ctx = { chainId: 84532, own: [ME], labels: {}, transfers: history, register: [], historyLoaded: true };

test('shared start/end characters and the look-alike threshold', () => {
  assert.deepEqual(sharedEnds(FRIEND, FAKE), { start: 4, end: 4 });
  assert.equal(isLookalike(FRIEND, FAKE), true);
  assert.equal(isLookalike(FRIEND, FRIEND), false, 'an address is not its own look-alike');
  assert.equal(isLookalike(FRIEND.toLowerCase(), FRIEND), false, 'case does not matter');
  assert.equal(isLookalike(ME, STRANGER), false);
  // 3 + 3 shared characters is below the threshold; 5 at the start and the rest at the end reaches it.
  assert.equal(isLookalike('0xabc1110000000000000000000000000000000def', '0xabc2220000000000000000000000000000001def'), false);
  assert.equal(isLookalike('0xabcde10000000000000000000000000000000def', '0xabcde20000000000000000000000000000000def'), true);
});

test('format problems are named specifically', () => {
  assert.equal(checkRecipient('', ctx).state, 'empty');
  assert.equal(checkRecipient('   ', ctx).state, 'empty');
  assert.match(checkRecipient('vitalik.eth', ctx).title, /Names are not looked up/);
  assert.match(checkRecipient('0x5a3c 0000', ctx).title, /spaces/);
  assert.match(checkRecipient('5a3c00000000000000000000000000000000b7e9', ctx).title, /starts with 0x/);
  assert.match(checkRecipient('0x5a3c0000000000000000000000000000000ob7e9', ctx).title, /Not a wallet address/);
  assert.match(checkRecipient(FRIEND.slice(0, 40), ctx).title, /^2 characters missing/);
  assert.match(checkRecipient(FRIEND + 'a', ctx).title, /^1 character too many/);
  for (const bad of ['', 'vitalik.eth', '0x12']) assert.notEqual(checkRecipient(bad, ctx).state, 'known');
});

test('a wrong capital letter fails the built-in checksum', () => {
  const good = getAddress('0x036cbd53842c5426634e7929541ec2318f3dcf7e');
  const broken = good.replace('C', 'c');
  assert.notEqual(broken, good);
  const r = checkRecipient(broken, ctx);
  assert.equal(r.state, 'danger');
  assert.match(r.title, /typo/);
  assert.equal(r.grouped, '', 'no tidied-up copy of a mistyped address is offered');
  const lowerCase = checkRecipient(STRANGER.toLowerCase(), ctx);
  assert.ok(lowerCase.lines.some(l => /no built-in typo check/.test(l.text)));
});

test('burn addresses and FYNX contracts are never wallets', () => {
  assert.equal(checkRecipient('0x0000000000000000000000000000000000000000', ctx).state, 'danger');
  assert.equal(checkRecipient('0x000000000000000000000000000000000000dEaD', ctx).state, 'danger');
  const usdc = checkRecipient('0x036CbD53842c5426634e7929541eC2318f3dCF7e', ctx);
  assert.equal(usdc.state, 'danger');
  assert.match(usdc.lines[0].text, /USDC token contract on Base Sepolia/);
  // Base mainnet USDC typed while Base Sepolia is selected still names where it lives.
  assert.match(checkRecipient('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', ctx).lines[0].text, /USDC token contract on Base/);
  const router = checkRecipient('0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4', ctx);
  assert.match(router.lines[0].text, /Uniswap swap router/);
  assert.ok(knownContracts().size >= 8);
});

test('a look-alike of a wallet you sent to is flagged as dangerous, even after it sent you dust', () => {
  const r = checkRecipient(FAKE, ctx);
  assert.equal(r.state, 'danger');
  assert.equal(r.title, 'Look-alike of a wallet you use');
  assert.match(r.lines[0].text, /first 4 and last 4 characters/);
  assert.ok(r.lines.some(l => /sent you 1 transfer/.test(l.text)));
  // With a name, the warning uses it.
  const named = checkRecipient(FAKE, { ...ctx, labels: { [FRIEND.toLowerCase()]: { label: 'Ledger test', at: 1 } } });
  assert.match(named.lines[0].text, /“Ledger test”/);
});

test('known wallets: named, sent to before, own and connected', () => {
  const r = checkRecipient(FRIEND, ctx);
  assert.equal(r.state, 'known');
  assert.ok(r.lines.some(l => /sent to it 2 times in the loaded history, last on 2026-11-04/.test(l.text)));
  assert.equal(r.grouped, `0x ${FRIEND.slice(2).match(/.{4}/g).join(' ')}`);
  const named = checkRecipient(FRIEND.toLowerCase(), { ...ctx, labels: { [FRIEND.toLowerCase()]: { label: 'Ledger test', at: 1 } } });
  assert.equal(named.title, 'Known: Ledger test');
  assert.equal(grouped(named.address), grouped(FRIEND.toLowerCase()));
  const self = checkRecipient(ME, ctx);
  assert.equal(self.state, 'caution');
  assert.match(self.title, /connected wallet/);
  const other = getAddress('0x3333333333333333333333333333333333333333');
  const registered = checkRecipient(other, { ...ctx, register: [{ address: other.toLowerCase(), hash: h(9), chainId: 84532, kind: 'page', at: 1 }] });
  assert.equal(registered.state, 'known');
  assert.ok(registered.lines.some(l => /own wallets/.test(l.text)));
});

test('new recipients and receive-only senders get a small-test-first caution', () => {
  const brandNew = checkRecipient(getAddress('0x4444444444444444444444444444444444444444'), { ...ctx, historyLoaded: false });
  assert.equal(brandNew.state, 'caution');
  assert.ok(brandNew.lines.some(l => /Send a small amount first/.test(l.text)));
  assert.ok(brandNew.lines.some(l => /load the history/.test(l.text)));
  const stranger = checkRecipient(STRANGER, ctx);
  assert.equal(stranger.state, 'caution');
  assert.match(stranger.lines[0].text, /only ever sent you 1 transfer/);
});

test('history scan lists look-alike senders and zero-value transfers, not ordinary senders', () => {
  const suspects = poisoningSuspects(history, { own: [ME] });
  assert.equal(suspects.length, 1);
  assert.equal(suspects[0].address, FAKE.toLowerCase());
  assert.equal(suspects[0].lookalikeOf.address, FRIEND.toLowerCase());
  assert.equal(suspects[0].zeroValue, 1);
  assert.deepEqual(suspects[0].hashes, [h(3)]);
  assert.ok(suspectSet(suspects).has(FAKE.toLowerCase()));
  // A zero-value transfer from an unknown, non-look-alike sender is listed too, after look-alikes.
  const dust = cleanTransfers([...history.map(t => ({ ...t, amount: t.amount, from: t.from, to: t.to })), { hash: h(5), direction: 'in', token: 'USDC', amount: '0', from: getAddress('0x7777777777777777777777777777777777777777'), to: ME, block: 5, time: '2026-11-05T00:00:00Z' }]);
  const both = poisoningSuspects(dust, { own: [ME] });
  assert.equal(both.length, 2);
  assert.ok(both[0].lookalikeOf && !both[1].lookalikeOf);
  // Once you name or send to the look-alike yourself, it is no longer listed.
  const trustedNow = poisoningSuspects(history, { own: [ME], labels: { [FAKE.toLowerCase()]: { label: 'Actually mine', at: 1 } } });
  assert.equal(trustedNow.length, 0);
  assert.deepEqual(poisoningSuspects([], {}), []);
  assert.equal(knownWallets({ transfers: history }).get(FRIEND.toLowerCase()).sent, 2);
});
