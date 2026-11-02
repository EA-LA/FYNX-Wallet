import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { WalletConnection, CHAIN_ID } from '../wallet-src/wallet-client.js';
const signer = Wallet.createRandom();
const HASH = '0x' + 'a'.repeat(64), BLOCK_HASH = '0x' + 'b'.repeat(64), OTHER_HASH = '0x' + 'c'.repeat(64);
function chain(state = {}) {
  const p = { calls: [], state: { tx: { hash: HASH, from: signer.address, nonce: '0x5' }, receipt: null, head: '0x100', canonical: BLOCK_HASH, count: '0x5', ...state },
    request: async ({ method, params }) => {
      p.calls.push(method); const s = p.state;
      if (method === 'eth_chainId') return CHAIN_ID;
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [signer.address];
      if (method === 'eth_getTransactionByHash') return s.tx;
      if (method === 'eth_getTransactionReceipt') return s.receipt;
      if (method === 'eth_blockNumber') return s.head;
      if (method === 'eth_getBlockByNumber') return s.canonical ? { number: params[0], hash: s.canonical } : null;
      if (method === 'eth_getTransactionCount') { assert.equal(params[1], 'latest'); return s.count; }
      throw new Error('Unexpected ' + method);
    } };
  return p;
}
const mined = (block = '0xf5', status = '0x1') => ({ transactionHash: HASH, status, blockNumber: block, blockHash: BLOCK_HASH });
async function connected(state) { const p = chain(state), c = new WalletConnection(p); await c.connect(); return { p, c }; }

test('A visible transaction without a receipt is pending, never confirmed', async () => {
  const { c } = await connected();
  const r = await c.transactionStatus(HASH);
  assert.equal(r.status, 'pending'); assert.equal(r.nonce, 5); assert.equal(r.from, signer.address); assert.equal(r.confirmations, 0);
});
test('Confirmations are counted from the canonical head and settle at the network target', async () => {
  const { c, p } = await connected({ receipt: mined('0xf5') }); // head 0x100 = 256, block 245 → 12
  let r = await c.transactionStatus(HASH);
  assert.equal(r.status, 'confirmed'); assert.equal(r.block, 245); assert.equal(r.confirmations, 12); assert.equal(r.target, 12); assert.equal(r.settled, true);
  p.state.head = '0xf6'; r = await c.transactionStatus(HASH);
  assert.equal(r.confirmations, 2); assert.equal(r.settled, false);
  p.state.receipt = mined('0xf5', '0x0'); r = await c.transactionStatus(HASH);
  assert.equal(r.status, 'failed');
});
test('A receipt whose block is no longer canonical is reported as reorganized and pending', async () => {
  const { c, p } = await connected({ receipt: mined(), canonical: OTHER_HASH });
  let r = await c.transactionStatus(HASH);
  assert.equal(r.status, 'pending'); assert.equal(r.reorged, true); assert.equal(r.settled, undefined);
  p.state.canonical = null; r = await c.transactionStatus(HASH);
  assert.equal(r.reorged, true);
});
test('A missing transaction whose nonce was consumed is replaced; an unconsumed nonce is only not-seen', async () => {
  const { c, p } = await connected({ tx: null, count: '0x6' });
  let r = await c.transactionStatus(HASH, { from: signer.address, nonce: 5 });
  assert.equal(r.status, 'replaced');
  p.state.count = '0x5'; r = await c.transactionStatus(HASH, { from: signer.address, nonce: 5 });
  assert.equal(r.status, 'not-seen');
  r = await c.transactionStatus(HASH); // nonce unknown: never guess replacement
  assert.equal(r.status, 'not-seen');
});
test('A visible transaction with a consumed nonce but lagging receipt stays pending', async () => {
  const { c } = await connected({ count: '0x9' });
  assert.equal((await c.transactionStatus(HASH)).status, 'pending');
});
test('Malformed or mismatched data never becomes confirmed', async () => {
  const { c, p } = await connected();
  await assert.rejects(c.transactionStatus('0x1234'), /Invalid/);
  for (const receipt of [{ ...mined(), transactionHash: OTHER_HASH }, { ...mined(), status: '0x2' }, { ...mined(), blockHash: undefined }, { ...mined(), blockNumber: '0x0' }]) {
    p.state.receipt = receipt; await assert.rejects(c.transactionStatus(HASH), /could not be verified/);
  }
  p.state.receipt = null; p.state.tx = { hash: OTHER_HASH, from: signer.address, nonce: '0x1' };
  await assert.rejects(c.transactionStatus(HASH), /could not be verified/);
  p.state.tx = { hash: HASH, from: signer.address, nonce: 'bad' };
  await assert.rejects(c.transactionStatus(HASH), /could not be verified/);
  p.state.tx = { hash: HASH, from: signer.address, nonce: '0x1' }; p.state.head = 'nope';
  await assert.rejects(c.transactionStatus(HASH), /current block/);
});
test('A wallet change during a status check discards the result', async () => {
  const { c, p } = await connected({ receipt: mined() });
  const original = p.request;
  p.request = async req => { const out = await original(req); if (req.method === 'eth_getBlockByNumber') c.changed(); return out; };
  await assert.rejects(c.transactionStatus(HASH), /changed/);
});
