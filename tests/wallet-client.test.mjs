import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, toUtf8String, verifyMessage } from 'ethers';
import { WalletConnection, CHAIN_ID } from '../wallet-src/wallet-client.js';
import { createWalletChallenge } from '../firebase-wallet/functions/core.js';
const signer = Wallet.createRandom(), recipient = Wallet.createRandom().address;
function provider() {
  const events = new Map(), calls = [];
  const p = { chain: CHAIN_ID, account: signer.address, balance: '0xde0b6b3a7640000', rejectSign: false, code: '0x', status: '0x1',
    on: (e, f) => events.set(e, f), removeListener: e => events.delete(e), emit: e => events.get(e)?.(),
    calls, request: async ({ method, params }) => {
      calls.push({ method, params });
      if (method === 'eth_chainId') return p.chain;
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [p.account];
      if (method === 'eth_getBalance') return p.balance;
      if (method === 'eth_getCode') return p.code;
      if (method === 'eth_estimateGas') return '0x5208';
      if (method === 'eth_gasPrice') return '0x3b9aca00';
      if (method === 'personal_sign') { if (p.rejectSign) throw Object.assign(new Error('User rejected'), { code: 4001 }); return signer.signMessage(toUtf8String(params[0])); }
      if (method === 'eth_sendTransaction') { if (p.rejectSign) throw Object.assign(new Error('User rejected'), { code: 4001 }); return '0x' + 'a'.repeat(64); }
      if (method === 'eth_getTransactionReceipt') return p.pending ? null : { transactionHash: params[0], status: p.status, blockNumber: '0x123' };
      throw new Error(`Unexpected method ${method}`);
    } };
  return p;
}
test('Connects and signs a real server-generated message; rejection is preserved', async () => {
  const p = provider(), client = new WalletConnection(p); await client.connect();
  const challenge = createWalletChallenge('owner', { address: signer.address, chainId: 11155111 });
  const signature = await client.signChallenge(challenge);
  assert.equal(verifyMessage(challenge.message, signature), signer.address);
  p.rejectSign = true; await assert.rejects(client.signChallenge(challenge), { code: 4001 });
  await assert.rejects(client.signChallenge({ ...challenge, address: recipient }));
});
test('Mainnet is rejected before wallet signing or sending', async () => {
  const p = provider(); p.chain = '0x1'; const client = new WalletConnection(p);
  await assert.rejects(client.connect(), /Sepolia/);
  await assert.rejects(client.prepareTransfer(recipient, '0.001'), /Sepolia/);
  assert.equal(p.calls.filter(c => ['personal_sign', 'eth_sendTransaction'].includes(c.method)).length, 0);
});
test('Insufficient gas, zero/oversized/invalid amount, invalid address, and contracts fail', async () => {
  const p = provider(), client = new WalletConnection(p); await client.connect();
  for (const amount of ['0', '-1', '0.02', 'NaN', '1e-3', '0.0000000000000000001']) await assert.rejects(client.prepareTransfer(recipient, amount));
  await assert.rejects(client.prepareTransfer('invalid', '0.001'));
  p.balance = '0x0'; await assert.rejects(client.prepareTransfer(recipient, '0.001'), /Not enough/);
  p.balance = '0xde0b6b3a7640000'; p.code = '0x6000'; await assert.rejects(client.prepareTransfer(recipient, '0.001'), /contracts/);
  assert.equal(p.calls.filter(c => c.method === 'eth_sendTransaction').length, 0);
});
test('A reviewed transfer pins chain, sender, amount, gas; pending and failed receipts are not success', async () => {
  const p = provider(), client = new WalletConnection(p); await client.connect();
  const review = await client.prepareTransfer(recipient, '0.001');
  assert.equal(review.tx.chainId, CHAIN_ID); assert.equal(review.tx.to, recipient); assert.equal(review.amount, '0.001'); assert.equal(review.fee, '0.000021');
  const hash = await client.sendTransfer(review); assert.equal(p.calls.filter(c => c.method === 'eth_sendTransaction').length, 1);
  p.pending = true; assert.equal((await client.receipt(hash)).status, 'pending');
  p.pending = false; p.status = '0x0'; assert.equal((await client.receipt(hash)).status, 'failed');
  p.status = '0x1'; assert.equal((await client.receipt(hash)).status, 'confirmed');
});
test('Account/network changes invalidate review; expired reviews and wallet rejection cannot send', async () => {
  const p = provider(), client = new WalletConnection(p); await client.connect();
  const review = await client.prepareTransfer(recipient, '0.001');
  await assert.rejects(client.sendTransfer({ ...review, createdAt: 1 }), /expired/);
  p.rejectSign = true; await assert.rejects(client.sendTransfer(review), { code: 4001 }); p.rejectSign = false;
  p.emit('accountsChanged'); assert.equal(client.address, null); await assert.rejects(client.sendTransfer(review));
  await client.connect(); p.chain = '0x1'; await assert.rejects(client.sendTransfer(review), /Sepolia/);
});
