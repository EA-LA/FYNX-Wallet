import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public-site/app.js', import.meta.url), 'utf8');

function load(hash) {
  const app = { innerHTML: '' };
  const context = {
    Object, Map, Set, BigInt, URL, Date, JSON, location: { hash, href: `https://example.test/${hash}` },
    window: { addEventListener() {}, scrollTo() {} }, requestAnimationFrame() {},
    document: { title: '', addEventListener() {}, getElementById: () => null, querySelector: s => (s === '#app' ? app : null), querySelectorAll: () => [] },
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/^import[^\n]+\n/, '').replace('connectFirebase();', '')
    + '\nthis.signCheck=signCheck;this.signResultHtml=signResultHtml;this.SIGN_FUNCS=SIGN_FUNCS;this.SIGN_EXAMPLES=SIGN_EXAMPLES;this.keccak256Hex=keccak256Hex;this.MAX_UINT=MAX_UINT;', context);
  return { context, app };
}

const { context } = load('#security');
const check = v => context.signCheck(v);
const pad = h => h.padStart(64, '0');
const SPENDER = '1234567890123456789012345678901234567890';
const kinds = r => Array.from(r.findings, f => f[0]);
const row = (r, label) => { const x = Array.from(r.rows).find(([k]) => k === label); return x && x[1]; };

test('security page shows the signature tool with a deep link, jump chip and glossary term', () => {
  for (const hash of ['#security', '#security/sign']) {
    const { app, context: c } = load(hash);
    assert.equal(c.document.title, 'Security · FYNX Wallet', hash);
    assert.match(app.innerHTML, /id="sec-sign"/);
    assert.match(app.innerHTML, /<textarea[^>]+id="sign-input"/);
    assert.match(app.innerHTML, /href="#security\/sign"[^>]*>Read a signature</);
    assert.match(app.innerHTML, /Nothing is signed, sent or saved/);
    assert.match(app.innerHTML, /href="#learn\/permit"/);
  }
  for (const term of ['#learn/permit', '#learn/token-approval']) assert.match(load(term).app.innerHTML, /href="#security\/sign"/);
});

test('function codes match their published signatures', () => {
  const sigs = {
    '095ea7b3': 'approve(address,uint256)', '39509351': 'increaseAllowance(address,uint256)', a457c2d7: 'decreaseAllowance(address,uint256)',
    a22cb465: 'setApprovalForAll(address,bool)', a9059cbb: 'transfer(address,uint256)', '23b872dd': 'transferFrom(address,address,uint256)',
    '42842e0e': 'safeTransferFrom(address,address,uint256)', b88d4fde: 'safeTransferFrom(address,address,uint256,bytes)',
    d505accf: 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)', '87517c45': 'approve(address,address,uint160,uint48)',
  };
  assert.deepEqual(Object.keys(context.SIGN_FUNCS).sort(), Object.keys(sigs).sort());
  for (const [sel, sig] of Object.entries(sigs)) assert.equal(context.keccak256Hex(sig).slice(0, 8), sel, sig);
});

test('approvals: unlimited is danger, limited is a warning, zero is a safe revoke', () => {
  const unlimited = check(`0x095ea7b3${pad(SPENDER)}${'f'.repeat(64)}`);
  assert.equal(unlimited.kind, 'danger');
  assert.equal(row(unlimited, 'Spender'), '0x1234567890123456789012345678901234567890');
  assert.match(row(unlimited, 'Amount'), /^Unlimited/);
  assert.match(context.signResultHtml(unlimited), /etherscan\.io\/address\/0x1234567890123456789012345678901234567890/);
  assert.match(context.signResultHtml(unlimited), /basescan\.org\/address\//);
  const limited = check(`0x095ea7b3${pad(SPENDER)}${pad((25_000_000n).toString(16))}`);
  assert.equal(limited.kind, 'warn');
  assert.match(row(limited, 'Amount'), /25000000 base units — that is 25 if the token uses 6 decimals/);
  const revoke = check(`0x095ea7b3${pad(SPENDER)}${pad('0')}`);
  assert.equal(revoke.kind, 'ok');
  assert.match(revoke.title, /revoke/);
  // whitespace and line breaks from copying are ignored
  assert.equal(check(`0x095ea7b3\n${pad(SPENDER)}  ${'f'.repeat(64)}`).kind, 'danger');
});

test('NFT approve-all, transfers and Permit2 approvals', () => {
  assert.equal(check(`0xa22cb465${pad(SPENDER)}${pad('1')}`).kind, 'danger');
  assert.equal(check(`0xa22cb465${pad(SPENDER)}${pad('0')}`).kind, 'ok');
  const send = check(`0xa9059cbb${pad(SPENDER)}${pad('0de0b6b3a7640000')}`);
  assert.match(send.title, /Send tokens/);
  assert.match(row(send, 'Amount'), /or 1 if it uses 18/);
  assert.ok(kinds(send).includes('warn'), 'address poisoning warning');
  const nft = check(`0x42842e0e${pad('ab'.repeat(20))}${pad(SPENDER)}${pad('4d2')}`);
  assert.equal(row(nft, 'Item number'), '1234');
  const p2 = check(`0x87517c45${pad('a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')}${pad(SPENDER)}${pad('f'.repeat(40))}${pad('ffffffffffff')}`);
  assert.equal(p2.kind, 'danger');
  assert.match(row(p2, 'Token contract'), /^0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48$/);
  const toPermit2 = check(`0x095ea7b3${pad('000000000022d473030f116ddee9f6b43ac78ba3')}${'f'.repeat(64)}`);
  assert.ok(Array.from(toPermit2.findings).some(([, t]) => /Permit2/.test(t)));
});

test('unknown, empty, short and odd-length data get careful answers', () => {
  assert.equal(check(''), null);
  assert.match(check('0x').title, /plain send/);
  assert.equal(check('0xdeadbeef').kind, 'warn');
  assert.match(check('0xdeadbeef').title, /doesn’t recognise/);
  assert.match(check('0x095ea7b').title, /incomplete/);
  assert.match(check(`0x095ea7b3${pad(SPENDER)}`).title, /incomplete/);
  const odd = check(`0x095ea7b3${'ff'.repeat(12)}${SPENDER}${pad('1')}`);
  assert.ok(Array.from(odd.findings).some(([, t]) => /unexpected extra numbers/.test(t)));
});

test('secrets and raw hashes are refused and cleared', () => {
  const phrase = check('abandon ability able about above absent absorb abstract absurd abuse access accident');
  assert.equal(phrase.kind, 'danger');
  assert.equal(phrase.clear, true);
  const hash = check(`0x${'1f'.repeat(32)}`);
  assert.equal(hash.clear, true);
  assert.match(hash.findings[1][1], /blind|raw hash/);
});

test('typed signatures: permit, Permit2, one-time transfer and listings', () => {
  const permit = check(context.SIGN_EXAMPLES.find(([id]) => id === 'permit')[2]());
  assert.equal(permit.kind, 'danger');
  assert.equal(row(permit, 'App or token'), 'USD Coin');
  assert.equal(row(permit, 'Network'), 'Ethereum');
  assert.match(row(permit, 'Valid until'), /Never expires/);
  assert.match(permit.type, /permit/);
  const small = check(JSON.stringify({ primaryType: 'Permit', domain: { name: 'Token', chainId: 8453 }, message: { owner: `0x${'ab'.repeat(20)}`, spender: `0x${SPENDER}`, value: '1000000', deadline: '1893456000' } }));
  assert.equal(small.kind, 'warn');
  assert.equal(row(small, 'Network'), 'Base');
  assert.match(row(small, 'Valid until'), /^2030-01-01 00:00 UTC/);
  const single = check(JSON.stringify({ primaryType: 'PermitSingle', domain: { name: 'Permit2', chainId: 1 }, message: { details: { token: `0x${'cd'.repeat(20)}`, amount: ((1n << 160n) - 1n).toString(), expiration: '1893456000', nonce: '0' }, spender: `0x${SPENDER}`, sigDeadline: '1893456000' } }));
  assert.equal(single.kind, 'danger');
  const once = check(JSON.stringify({ primaryType: 'PermitTransferFrom', domain: { name: 'Permit2' }, message: { permitted: { token: `0x${'cd'.repeat(20)}`, amount: '5000000' }, spender: `0x${SPENDER}`, nonce: '1', deadline: '1893456000' } }));
  assert.equal(once.kind, 'warn');
  assert.match(once.title, /once/);
  // wallets sometimes show [address, "json string"]
  const wrapped = check(JSON.stringify([`0x${'ab'.repeat(20)}`, context.SIGN_EXAMPLES.find(([id]) => id === 'permit')[2]()]));
  assert.equal(wrapped.kind, 'danger');
  const listing = check(context.SIGN_EXAMPLES.find(([id]) => id === 'listing')[2]());
  assert.equal(listing.kind, 'danger');
  assert.equal(row(listing, 'You receive'), 'Nothing');
  assert.match(row(listing, 'You give'), /NFT from 0x9999…9999, item #1234/);
  const fair = JSON.parse(context.SIGN_EXAMPLES.find(([id]) => id === 'listing')[2]());
  fair.message.consideration[0].recipient = fair.message.offerer;
  fair.message.consideration[0].startAmount = '500000000000000000';
  const ok = check(JSON.stringify(fair));
  assert.equal(ok.kind, 'warn');
  assert.match(row(ok, 'You receive'), /^0\.5 of the network coin/);
  assert.match(check('{"domain": {').title, /incomplete/);
  assert.match(check('{"hello": 1}').title, /doesn’t look like a signature request/);
  const other = check(JSON.stringify({ primaryType: 'Mail', domain: { name: 'Ether Mail' }, message: { contents: 'Hello' } }));
  assert.equal(other.kind, '');
});

test('messages: sign-in, plain text, bait words and hex-encoded text', () => {
  const login = check(context.SIGN_EXAMPLES.find(([id]) => id === 'login')[2]());
  assert.equal(login.kind, 'ok');
  assert.equal(row(login, 'Site asking'), 'example.com');
  assert.equal(row(login, 'Network'), 'Ethereum');
  const spoof = check('example.com wants you to sign in with your Ethereum account:\n0xAbCdEf0123456789aBcDeF0123456789AbCdEf01\n\nURI: https://evil.example.net\nVersion: 1');
  assert.equal(spoof.kind, 'warn');
  assert.equal(check('Welcome to Example! Click to sign in.').kind, '');
  assert.equal(check('Sign this to claim your airdrop').kind, 'warn');
  const hex = `0x${Buffer.from('Hello <b>world</b>, please sign in').toString('hex')}`;
  const msg = check(hex);
  assert.match(msg.type, /plain text/);
  assert.match(msg.note, /Decoded/);
  const html = context.signResultHtml(msg);
  assert.match(html, /Hello &lt;b&gt;world&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>world/);
});

test('every example loads to a result and user text is always escaped', () => {
  for (const [id, , make] of context.SIGN_EXAMPLES) {
    const r = check(make());
    assert.ok(r && r.title, id);
    assert.ok(context.signResultHtml(r).length > 50, id);
  }
  const evil = check(JSON.stringify({ primaryType: '<img src=x onerror=alert(1)>', domain: { name: '<script>x</script>', verifyingContract: '<b>' }, message: {} }));
  const html = context.signResultHtml(evil);
  assert.doesNotMatch(html, /<script>|<img|<b>&lt;/);
});
