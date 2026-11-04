import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public-site/app.js', import.meta.url), 'utf8');

function load(hash) {
  const app = { innerHTML: '' };
  const context = {
    Object, Map, Set, BigInt, URL, location: { hash, href: `https://example.test/${hash}` },
    window: { addEventListener() {}, scrollTo() {} }, requestAnimationFrame() {},
    document: { title: '', addEventListener() {}, getElementById: () => null, querySelector: s => (s === '#app' ? app : null), querySelectorAll: () => [] },
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/^import[^\n]+\n/, '').replace('connectFirebase();', '')
    + '\nthis.linkCheck=linkCheck;this.linkResultHtml=linkResultHtml;this.siteDomain=siteDomain;', context);
  return { context, app };
}

const { context } = load('#security');
const check = v => context.linkCheck(v);
const kinds = r => Array.from(r.findings, f => f[0]);

test('security page shows the link checker with a deep link and jump chip', () => {
  for (const hash of ['#security', '#security/link']) {
    const { app, context: c } = load(hash);
    assert.equal(c.document.title, 'Security · FYNX Wallet', hash);
    assert.match(app.innerHTML, /id="sec-link"/);
    assert.match(app.innerHTML, /id="link-input"/);
    assert.match(app.innerHTML, /href="#security\/link"[^>]*>Check a link</);
    assert.match(app.innerHTML, /not opened, visited or sent anywhere/);
  }
  const { app } = load('#learn/phishing');
  assert.match(app.innerHTML, /href="#security\/link"/);
});

test('empty input gives no result; secrets are refused and cleared', () => {
  assert.equal(check('   '), null);
  const phrase = check('abandon ability able about above absent absorb abstract absurd abuse access accident');
  assert.equal(phrase.kind, 'danger');
  assert.equal(phrase.clear, true);
  const key = check(`0x${'1f'.repeat(32)}`);
  assert.equal(key.clear, true);
});

test('official addresses match, including subdomains, without bait warnings', () => {
  for (const [url, name] of [['https://metamask.io/download/', 'MetaMask'], ['app.uniswap.org', 'Uniswap'], ['https://www.ledger.com', 'Ledger'], ['https://ea-la.github.io/FYNX-Wallet/#security', 'FYNX'], ['https://support.metamask.io/restore', 'MetaMask']]) {
    const r = check(url);
    assert.equal(r.kind, 'ok', url);
    assert.equal(r.official.name, name, url);
  }
  const plain = check('http://coinbase.com');
  assert.equal(plain.kind, 'warn');
  assert.match(plain.findings[0][1], /http:\/\//);
});

test('brand names in front of another site are flagged as dangerous', () => {
  const r = check('https://metamask.io.wallet-sync.com/restore');
  assert.equal(r.kind, 'danger');
  assert.equal(r.domain, 'wallet-sync.com');
  assert.match(r.findings[0][1], /metamask\.io/);
  assert.equal(check('metamask-support.com').kind, 'danger');
  assert.equal(check('ledger-live-update.app/claim').kind, 'danger');
  assert.equal(check('https://coinbase.vercel.app/login').kind, 'danger');
  const mild = check('ledgerinsights.com');
  assert.equal(mild.kind, 'warn');
});

test('look-alike spellings and other alphabets are caught', () => {
  for (const url of ['https://metarnask.io', 'https://rnetamask.io', 'https://uniswep.org', 'https://0pensea.io', 'https://coinbsae.com']) {
    assert.equal(check(url).kind, 'danger', url);
  }
  const idn = check('https://xn--metamsk-2ig.io/');
  assert.equal(idn.kind, 'danger');
  assert.ok(Array.from(idn.findings, f => f[1]).some(t => /another alphabet/.test(t)));
  assert.equal(check('https://mеtamask.io').kind, 'danger');
});

test('disguises, IP addresses, scripts and shorteners', () => {
  const at = check('https://coinbase.com@evil.example/login');
  assert.equal(at.kind, 'danger');
  assert.equal(at.host, 'evil.example');
  assert.match(at.findings[0][1], /evil\.example/);
  assert.equal(check('http://192.168.4.20/wallet').kind, 'danger');
  assert.equal(check('javascript:alert(1)').kind, 'danger');
  const short = check('https://bit.ly/3abcd');
  assert.equal(short.kind, 'warn');
  assert.match(short.findings[0][1], /shortened/);
  assert.equal(check('tg://resolve?domain=x').kind, 'warn');
  assert.equal(check('not a link at all').kind, 'warn');
  assert.equal(check('localhost').kind, 'warn');
});

test('risky endings and bait words warn; ordinary sites pass with a caveat', () => {
  const r = check('https://free-rewards.xyz/airdrop');
  assert.equal(r.kind, 'warn');
  assert.equal(kinds(r).length, 2);
  const ok = check('https://www.wikipedia.org/wiki/Cryptocurrency');
  assert.equal(ok.kind, '');
  assert.equal(ok.domain, 'wikipedia.org');
  assert.match(ok.findings[0][1], /does not prove/);
});

test('site domain reads from the right, respecting shared endings', () => {
  assert.equal(context.siteDomain('a.b.example.co.uk'), 'example.co.uk');
  assert.equal(context.siteDomain('scam.github.io'), 'scam.github.io');
  assert.equal(context.siteDomain('x.y.z.com'), 'z.com');
});

test('result html escapes the address', () => {
  const html = context.linkResultHtml(check('https://"><img src=x>.example.com'));
  assert.doesNotMatch(html, /<img/);
});
