import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConnections } from '../wallet-src/connection-checks.js';
const call = async input => { assert.equal(input.action, 'session'); return { ok: true, role: 'owner', passkeys: [] }; };
test('Connection checks require an explicit owner backend result and never prompt to connect or sign', async () => {
  const result = await checkConnections({ call });
  assert.equal(result.filter(r => r.state === 'passed').length, 2);
  assert.equal(result.at(-1).state, 'untested');
  for (const response of [null, {}, { ok: true, role: 'guest', passkeys: [] }]) await assert.rejects(checkConnections({ call: async () => response }));
  await assert.rejects(checkConnections({ call: async () => { throw new Error('Backend unavailable'); } }), /unavailable/);
});
test('A changed or wrong-network wallet is a failed check, never an all-clear', async () => {
  const wrong = await checkConnections({ call, wallet: { address: 'test', assertCurrent: async () => { throw new Error('wrong network'); } } });
  assert.equal(wrong.at(-1).state, 'failed');
  const connected = await checkConnections({ call, wallet: { address: 'test', assertCurrent: async () => 0 } });
  assert.equal(connected.at(-1).state, 'passed');
  assert.match(connected.at(-1).detail, /does not test signing or transfers/);
});
