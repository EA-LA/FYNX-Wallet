import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  readAllowance, readPermissions, allowanceState, describePermission, permissionsHeadline, permissionTargets, cleanSpenders,
  addSpender, removeSpender, isApprovalCall, readingAge, revokeEvidence, evidenceNote, usdcText, UNLIMITED_FROM, MAX_SPENDERS, APPROVE_SELECTOR,
} from '../wallet-src/spend-permissions.js';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';

const BASE_SEPOLIA = NETWORKS[84532], BASE = NETWORKS[8453], SEPOLIA = NETWORKS[11155111];
const OWNER = '0x5A3c00000000000000000000000000000000B7e9';
const APP = '0x1111111111111111111111111111111111111111';
const word = n => `0x${BigInt(n).toString(16).padStart(64, '0')}`;

// A fake read-only connection: answers eth_call (allowance / balanceOf) and eth_blockNumber only; records every call.
function fakeRequest({ allowances = {}, balance = 0n, block = 4242, fail = new Set() } = {}) {
  const calls = [];
  const request = async ({ method, params }) => {
    calls.push({ method, params });
    if (method === 'eth_blockNumber') return `0x${block.toString(16)}`;
    if (method !== 'eth_call') throw new Error(`unexpected ${method}`);
    const data = params[0].data;
    if (data.startsWith('0x70a08231')) return word(balance);
    assert.ok(data.startsWith('0xdd62ed3e'), 'only allowance(owner, spender) is read');
    const spender = `0x${data.slice(-40)}`;
    if (fail.has(spender)) throw new Error('rpc down');
    return word(allowances[spender] ?? 0n);
  };
  return { request, calls };
}

test('readAllowance encodes allowance(owner, spender) on the pinned USDC contract and reads it only', async () => {
  const { request, calls } = fakeRequest({ allowances: { [APP]: 2500000n } });
  assert.equal(await readAllowance(request, OWNER, APP, BASE_SEPOLIA), 2500000n);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'eth_call');
  assert.equal(calls[0].params[0].to, BASE_SEPOLIA.usdc.toLowerCase());
  assert.equal(calls[0].params[0].data, `0xdd62ed3e${OWNER.toLowerCase().slice(2).padStart(64, '0')}${APP.slice(2).padStart(64, '0')}`);
  assert.equal(calls[0].params[1], 'latest');
  await assert.rejects(readAllowance(async () => '0x01', OWNER, APP, BASE_SEPOLIA), /unreadable/);
  await assert.rejects(readAllowance(request, 'nope', APP, BASE_SEPOLIA), /full address/);
  await assert.rejects(readAllowance(request, OWNER, APP, { name: 'Elsewhere' }), /no USDC/);
});

test('readPermissions keeps one answer per target, even when a read fails, plus block and balance', async () => {
  const router = BASE_SEPOLIA.router.toLowerCase();
  const { request, calls } = fakeRequest({ allowances: { [router]: 2n ** 256n - 1n }, balance: 7000000n, fail: new Set([APP]) });
  const targets = permissionTargets(BASE_SEPOLIA, { 84532: [{ address: APP, label: 'Old app' }] });
  const r = await readPermissions(request, OWNER, targets, BASE_SEPOLIA);
  assert.equal(r.chainId, 84532); assert.equal(r.block, 4242); assert.equal(r.balance, 7000000n); assert.equal(r.owner, OWNER.toLowerCase());
  assert.equal(r.rows[0].units, 2n ** 256n - 1n); assert.equal(r.rows[0].pinned, true);
  assert.equal(r.rows[1].units, null); assert.match(r.rows[1].error, /rpc down/);
  assert.ok(calls.every(c => ['eth_call', 'eth_blockNumber'].includes(c.method)), 'read-only methods only');
});

test('allowance states and plain words', () => {
  assert.equal(allowanceState(0n), 'none');
  assert.equal(allowanceState(1n), 'limited');
  assert.equal(allowanceState(UNLIMITED_FROM), 'unlimited');
  assert.equal(allowanceState(null), 'unknown');
  assert.equal(usdcText(1500000n), '1.5'); assert.equal(usdcText(25000000n), '25'); assert.equal(usdcText(1n), '0.000001'); assert.equal(usdcText(1234567890000n), '1,234,567.89');
  const none = describePermission({ name: 'X', units: 0n }, { network: BASE_SEPOLIA });
  assert.equal(none.tone, 'good'); assert.match(none.text, /cannot move any test USDC/);
  const unl = describePermission({ name: 'X', units: 2n ** 256n - 1n, pinned: true }, { network: BASE });
  assert.equal(unl.tone, 'bad'); assert.equal(unl.badge, 'No limit'); assert.match(unl.text, /all of your USDC/); assert.match(unl.text, /Revoke swap allowance/);
  const some = describePermission({ name: 'App', units: 3000000n }, { network: BASE_SEPOLIA, balance: 2000000n });
  assert.equal(some.tone, 'warn'); assert.equal(some.badge, '3 test USDC'); assert.match(some.text, /everything you hold now/); assert.match(some.text, /revoke it in your wallet/);
  const small = describePermission({ name: 'App', units: 1000000n }, { network: BASE_SEPOLIA, balance: 2000000n });
  assert.equal(small.tone, 'info');
  const unknown = describePermission({ units: null, error: 'rpc down' }, { network: BASE_SEPOLIA });
  assert.equal(unknown.badge, 'Not read'); assert.equal(unknown.text, 'rpc down');
});

test('headline counts open and unlimited permissions and unread rows', () => {
  assert.match(permissionsHeadline({ rows: [] }, SEPOLIA), /Nothing to check on Ethereum Sepolia/);
  assert.equal(permissionsHeadline({ rows: [{ units: 0n }, { units: 0n }] }, BASE_SEPOLIA), 'No open USDC permissions among the 2 checked on Base Sepolia.');
  assert.equal(permissionsHeadline({ rows: [{ units: 2n ** 200n }, { units: 5n }, { units: null }] }, BASE), '2 open USDC permissions on Base, 1 with no limit. 1 could not be read.');
  assert.match(permissionsHeadline({ rows: [{ units: null }] }, BASE), /could be read just now/);
});

test('targets: the pinned router first, then saved addresses for that network only', () => {
  const saved = { 84532: [{ address: APP, label: 'Old app' }, { address: BASE_SEPOLIA.router, label: 'dup' }], 8453: [{ address: OWNER, label: 'other net' }] };
  const t = permissionTargets(BASE_SEPOLIA, saved);
  assert.deepEqual(t.map(x => [x.address, x.pinned]), [[BASE_SEPOLIA.router.toLowerCase(), true], [APP, false]]);
  assert.equal(t[1].name, 'Old app');
  assert.deepEqual(permissionTargets(SEPOLIA, saved), [], 'Ethereum Sepolia has no FYNX router and nothing saved');
});

test('adding and removing saved addresses, with refusals', () => {
  let r = addSpender({}, BASE_SEPOLIA, ` ${APP.toUpperCase().replace('0X', '0x')} `, ' Old app ', { own: OWNER, now: 5 });
  assert.equal(r.error, ''); assert.deepEqual(r.saved, { 84532: [{ address: APP, label: 'Old app', addedAt: 5 }] });
  const saved = r.saved;
  assert.match(addSpender(saved, BASE_SEPOLIA, APP).error, /already in the list/);
  assert.match(addSpender(saved, BASE_SEPOLIA, 'abc').error, /full address/);
  assert.match(addSpender(saved, BASE_SEPOLIA, OWNER, '', { own: OWNER }).error, /your own connected wallet/);
  assert.match(addSpender(saved, BASE_SEPOLIA, BASE_SEPOLIA.usdc).error, /USDC contract itself/);
  assert.match(addSpender(saved, BASE_SEPOLIA, BASE_SEPOLIA.router).error, /already checked/);
  assert.match(addSpender(saved, BASE_SEPOLIA, '0x0000000000000000000000000000000000000000').error, /zero address/);
  assert.match(addSpender(saved, BASE_SEPOLIA, OWNER, 'sk_live_abcdefghijklmnop').error, /secret/);
  assert.match(addSpender(saved, BASE_SEPOLIA, OWNER, 'x'.repeat(41)).error, /under 40/);
  assert.match(addSpender(saved, { id: 1 }, OWNER).error, /network/);
  let many = {};
  for (let i = 1; i <= MAX_SPENDERS; i++) many = addSpender(many, BASE, `0x${i.toString(16).padStart(40, 'a')}`).saved;
  assert.equal(many[8453].length, MAX_SPENDERS);
  assert.match(addSpender(many, BASE, OWNER).error, /Up to 12/);
  assert.deepEqual(saved, { 84532: [{ address: APP, label: 'Old app', addedAt: 5 }] }, 'input never changed');
  assert.deepEqual(removeSpender(saved, 84532, APP), {});
  assert.equal(removeSpender(saved, 84532, OWNER), saved);
});

test('stored addresses are cleaned', () => {
  const raw = { 84532: [{ address: APP, label: 'ok', addedAt: 3 }, { address: APP }, { address: 'bad' }, { address: OWNER, label: 'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi' }], 999: [{ address: APP }], 8453: 'nope' };
  assert.deepEqual(cleanSpenders(raw), { 84532: [{ address: APP, label: 'ok', addedAt: 3 }, { address: OWNER.toLowerCase(), label: '', addedAt: 0 }] });
  assert.deepEqual(cleanSpenders(null), {}); assert.deepEqual(cleanSpenders([]), {});
});

test('a confirmed approve() on this network\'s USDC is recognised', () => {
  assert.equal(isApprovalCall({ to: BASE_SEPOLIA.usdc.toLowerCase(), input: `${APPROVE_SELECTOR}${'0'.repeat(128)}` }, BASE_SEPOLIA), true);
  assert.equal(isApprovalCall({ to: BASE_SEPOLIA.usdc, input: '0xa9059cbb00' }, BASE_SEPOLIA), false, 'a transfer is not an approval');
  assert.equal(isApprovalCall({ to: APP, input: APPROVE_SELECTOR }, BASE_SEPOLIA), false);
  assert.equal(isApprovalCall({ to: BASE_SEPOLIA.usdc, input: APPROVE_SELECTOR }, BASE), false, 'other network');
  assert.equal(isApprovalCall(null, BASE_SEPOLIA), false);
});

test('reading age', () => {
  assert.deepEqual(readingAge(0, 20000), { stale: false, text: 'Read just now.' });
  assert.equal(readingAge(0, 5 * 60000).text, 'Read 5 minutes ago.');
  const old = readingAge(0, 2 * 3600000); assert.equal(old.stale, true); assert.match(old.text, /2 hours ago: press Check permissions/);
});

test('revoke evidence only for a zero router allowance read on a test network', () => {
  const at = Date.UTC(2026, 10, 13, 7, 5);
  const zero = { chainId: 84532, block: 99, rows: [{ pinned: true, units: 0n }] };
  assert.equal(revokeEvidence(zero, BASE_SEPOLIA, at), 'Swap router allowance read as 0 USDC on Base Sepolia at block 99 (2026-11-13 07:05 UTC).');
  assert.equal(revokeEvidence({ ...zero, rows: [{ pinned: true, units: 1n }] }, BASE_SEPOLIA, at), '');
  assert.equal(revokeEvidence({ ...zero, rows: [{ pinned: true, units: null }] }, BASE_SEPOLIA, at), '', 'unread is not zero');
  assert.equal(revokeEvidence({ ...zero, chainId: 8453 }, BASE, at), '', 'mainnet readings are not test evidence');
  assert.equal(revokeEvidence(zero, BASE, at), '', 'reading from another network');
  const line = revokeEvidence(zero, BASE_SEPOLIA, at);
  assert.equal(evidenceNote(line, ''), line.replace(/\.$/, ''));
  assert.equal(evidenceNote(line, 'Base Sepolia tx 0xabc (confirmed)'), `Base Sepolia tx 0xabc (confirmed); ${line.replace(/\.$/, '')}`);
  const older = 'Swap router allowance read as 0 USDC on Base Sepolia at block 1 (2026-11-12 00:00 UTC)';
  assert.equal(evidenceNote(line, `a; ${older}`), `a; ${line.replace(/\.$/, '')}`, 'a newer reading replaces the older one');
  assert.equal(evidenceNote(line, 'x'.repeat(270)), null);
  assert.equal(evidenceNote('', 'a'), null);
});

test('owner page has the read-only permissions card wired in app.js', () => {
  const html = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  for (const id of ['permissions-card', 'sp-check', 'sp-list', 'sp-form', 'sp-address', 'sp-label', 'sp-add', 'sp-status', 'sp-headline']) assert.match(html, new RegExp(`id="${id}"`));
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /from '\.\/spend-permissions\.js'/);
  const bundle = readFileSync(new URL('../wallet-assets/app.js', import.meta.url), 'utf8');
  assert.match(bundle, /Who can spend|Swap router allowance read as/);
  const src = readFileSync(new URL('../wallet-src/spend-permissions.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /eth_sendTransaction|eth_sign|personal_sign|encodeFunctionData\('approve'/, 'the module never signs or sends');
});
