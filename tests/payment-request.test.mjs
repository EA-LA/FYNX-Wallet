import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getAddress } from 'ethers';
import {
  parseRequestAmount, requestURI, requestCaption, requestMessage, compareBalances, watchNext, watchLine, formatUnitsText, WATCH_EVERY_MS, WATCH_FOR_MS,
} from '../wallet-src/payment-request.js';
import { receiveURI } from '../wallet-src/asset-client.js';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';

const BASE_SEPOLIA = NETWORKS[84532], BASE = NETWORKS[8453], SEPOLIA = NETWORKS[11155111];
const OWNER = getAddress('0x5a3c00000000000000000000000000000000b7e9');

test('parseRequestAmount: exact integer units, empty means any amount, clear errors', () => {
  assert.deepEqual(parseRequestAmount('', 'ETH'), { units: null, text: '' });
  assert.deepEqual(parseRequestAmount('  ', 'USDC'), { units: null, text: '' });
  assert.deepEqual(parseRequestAmount('0.001', 'ETH'), { units: 1000000000000000n, text: '0.001' });
  assert.deepEqual(parseRequestAmount('25', 'USDC'), { units: 25000000n, text: '25' });
  assert.deepEqual(parseRequestAmount('007.50', 'USDC'), { units: 7500000n, text: '7.5' });
  assert.deepEqual(parseRequestAmount('0.000000000000000001', 'ETH'), { units: 1n, text: '0.000000000000000001' });
  assert.match(parseRequestAmount('0.1234567', 'USDC').error, /at most 6 decimal/);
  assert.match(parseRequestAmount('0,5', 'ETH').error, /dot/);
  assert.match(parseRequestAmount('-1', 'ETH').error, /Enter an amount/);
  assert.match(parseRequestAmount('1e3', 'ETH').error, /Enter an amount/);
  assert.match(parseRequestAmount('0', 'ETH').error, /more than 0/);
  assert.match(parseRequestAmount('0.000', 'USDC').error, /more than 0/);
  assert.match(parseRequestAmount('1234567890123', 'USDC').error, /too large/);
  assert.match(parseRequestAmount('1', 'DAI').error, /Only ETH and USDC/);
});

test('requestURI: EIP-681 links with the amount in base units; without an amount it equals the plain receive link', () => {
  for (const net of [BASE_SEPOLIA, BASE, SEPOLIA]) {
    assert.equal(requestURI(net, OWNER.toLowerCase(), 'ETH'), receiveURI(net, OWNER, 'ETH'));
    assert.equal(requestURI(net, OWNER, 'USDC'), receiveURI(net, OWNER, 'USDC'));
  }
  assert.equal(requestURI(BASE_SEPOLIA, OWNER, 'ETH', 1000000000000000n), `ethereum:${OWNER}@84532?value=1000000000000000`);
  assert.equal(requestURI(BASE, OWNER, 'USDC', 25000000n), `ethereum:${getAddress(BASE.usdc)}@8453/transfer?address=${OWNER}&uint256=25000000`);
  assert.ok(!/e\+|\./.test(requestURI(SEPOLIA, OWNER, 'ETH', 10n ** 30n)), 'no scientific notation or decimals in the link');
  assert.throws(() => requestURI(BASE, 'not-an-address', 'ETH'));
  assert.throws(() => requestURI(BASE, OWNER, 'ETH', 0n), /more than 0/);
  assert.throws(() => requestURI(BASE, OWNER, 'ETH', 5), /more than 0/);
  assert.throws(() => requestURI(BASE, OWNER, 'DAI'), /Only ETH and USDC/);
  assert.throws(() => requestURI({ id: 'x' }, OWNER, 'ETH'), /Unknown network/);
});

test('requestCaption and requestMessage name the network, chain ID and test status; public facts only', () => {
  assert.equal(requestCaption(BASE_SEPOLIA, 'ETH', 1000000000000000n), 'This code asks for 0.001 test ETH on Base Sepolia.');
  assert.equal(requestCaption(BASE, 'USDC', null), 'This code asks for any amount of USDC on Base.');
  const uri = requestURI(BASE_SEPOLIA, OWNER, 'USDC', 5000000n);
  const msg = requestMessage(BASE_SEPOLIA, OWNER, 'USDC', 5000000n, uri);
  assert.match(msg, /^Please send 5 test USDC to my wallet\./);
  assert.match(msg, /Network: Base Sepolia \(chain ID 84532\)/);
  assert.ok(msg.includes(`Address: ${OWNER}`) && msg.includes(getAddress(BASE_SEPOLIA.usdc)) && msg.includes(uri));
  assert.match(msg, /no monetary value/);
  assert.match(msg, /never ask for a recovery phrase/);
  const real = requestMessage(BASE, OWNER, 'ETH', null, requestURI(BASE, OWNER, 'ETH'));
  assert.match(real, /^You can send ETH to my wallet\./);
  assert.match(real, /Real assets: check the address/);
  assert.ok(!/Token:/.test(real));
});

test('compareBalances: arrived, partial, waiting, went-down and unreadable, in exact units', () => {
  assert.deepEqual(compareBalances('ETH', '0.05', '0.05', 1000000000000000n), { state: 'waiting', change: 0n, changeText: '0' });
  const ok = compareBalances('ETH', '0.05', '0.051', 1000000000000000n);
  assert.equal(ok.state, 'arrived'); assert.equal(ok.changeText, '0.001'); assert.equal(ok.extra, '');
  const more = compareBalances('USDC', '10', '16.5', 5000000n);
  assert.equal(more.state, 'arrived'); assert.equal(more.extra, '1.5');
  const part = compareBalances('USDC', '10', '12', 5000000n);
  assert.equal(part.state, 'partial'); assert.equal(part.changeText, '2'); assert.equal(part.missingText, '3');
  assert.equal(compareBalances('USDC', '10', '10.000001').state, 'arrived', 'any increase counts when no amount was asked');
  const down = compareBalances('ETH', '0.05', '0.0499');
  assert.equal(down.state, 'went-down'); assert.equal(down.changeText, '-0.0001');
  assert.equal(compareBalances('ETH', 'n/a', '1').state, 'unreadable');
  assert.equal(compareBalances('USDC', '1.1234567', '2').state, 'unreadable');
  assert.equal(compareBalances('DAI', '1', '2').state, 'unreadable');
  // 0.1 + 0.2 style float traps do not exist here
  assert.equal(compareBalances('ETH', '0.1', '0.3', 200000000000000000n).state, 'arrived');
  assert.equal(formatUnitsText(-1n, 'USDC'), '-0.000001');
});

test('watchNext stops on wallet/network change, arrival, a falling balance and after 10 minutes', () => {
  const watch = { address: OWNER, chainId: 84532, startedAt: 1000, result: null };
  const here = { address: OWNER, chainId: 84532 };
  assert.deepEqual(watchNext(watch, 2000, here), { go: true, wait: WATCH_EVERY_MS });
  assert.equal(watchNext(null, 2000, here).go, false);
  assert.equal(watchNext(watch, 2000, { address: OWNER, chainId: 8453 }).reason, 'changed');
  assert.equal(watchNext(watch, 2000, {}).reason, 'changed');
  assert.equal(watchNext({ ...watch, result: { state: 'arrived' } }, 2000, here).reason, 'arrived');
  assert.equal(watchNext({ ...watch, result: { state: 'went-down' } }, 2000, here).reason, 'went-down');
  assert.equal(watchNext({ ...watch, result: { state: 'partial' } }, 2000, here).go, true, 'keeps watching for the rest');
  assert.equal(watchNext(watch, 1000 + WATCH_FOR_MS, here).reason, 'timeout');
  assert.equal(WATCH_FOR_MS / WATCH_EVERY_MS, 40, 'at most 40 readings per watch');
});

test('watchLine tells the owner what happened in plain words', () => {
  const base = { startedAt: 0, startText: '0.05', testnet: true, checks: 0, result: null, stopped: '' };
  assert.match(watchLine(base, 0, 'ETH'), /Watching your test ETH balance \(0\.05 test ETH at the start\)\. Stops by itself in about 10 minutes\./);
  assert.match(watchLine({ ...base, checks: 1 }, 9.5 * 60000, 'ETH'), /Checked 1 time\. Stops by itself in about 1 minute\./);
  assert.match(watchLine({ ...base, checks: 40, stopped: 'timeout' }, WATCH_FOR_MS, 'ETH'), /Nothing new arrived in 10 minutes\. Checked 40 times/);
  assert.match(watchLine({ ...base, stopped: 'user' }, 0, 'ETH'), /^Stopped watching\. Nothing new/);
  assert.match(watchLine({ ...base, stopped: 'changed' }, 0, 'ETH'), /wallet or network changed/);
  assert.match(watchLine({ ...base, testnet: false, result: compareBalances('USDC', '1', '6', 5000000n) }, 0, 'USDC'), /^Arrived: \+5 USDC\. Confirm the transaction/);
  assert.match(watchLine({ ...base, result: compareBalances('USDC', '1', '7', 5000000n) }, 0, 'USDC'), /\(1 more than asked\)/);
  assert.match(watchLine({ ...base, result: compareBalances('USDC', '1', '3', 5000000n) }, 0, 'USDC'), /Part arrived: \+2 test USDC, still 3 short of the request\. Still watching\./);
  assert.match(watchLine({ ...base, result: compareBalances('ETH', '1', '0.9') }, 0, 'ETH'), /went down by 0\.1 \(something was sent/);
  assert.match(watchLine({ ...base, result: { state: 'unreadable' } }, 0, 'ETH'), /could not be read/);
  assert.equal(watchLine(null, 0, 'ETH'), '');
});

test('page wiring: amount box, request copy, QR download and a read-only watch on the Receive card', () => {
  const html = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  for (const id of ['receive-amount', 'receive-amount-msg', 'receive-caption', 'copy-request', 'download-qr', 'watch-payment', 'watch-payment-status']) assert.ok(html.includes(`id="${id}"`), id);
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /requestURI\(current\.network, address, req\.symbol, req\.units\)/);
  const watch = app.slice(app.indexOf('async function paymentWatchTick'), app.indexOf('async function renderReceive'));
  assert.ok(watch.length > 200);
  assert.ok(!/sendTransaction|prepareTransfer|approve|sign|eth_send/i.test(watch.replace(/signs or sends/g, '')), 'watching only reads balances');
  assert.match(app, /clearPaymentWatch\(\)/, 'a wallet change or sign-out clears the watch');
});
