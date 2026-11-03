import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public-site/app.js', import.meta.url), 'utf8');

function load(hash) {
  const app = { innerHTML: '' };
  const context = {
    Object, location: { hash },
    window: { addEventListener() {}, scrollTo() {} },
    document: { title: '', addEventListener() {}, querySelector: s => (s === '#app' ? app : null), querySelectorAll: () => [] },
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/^import[^\n]+\n/, '').replace('connectFirebase();', '') + '\nthis.classifyAddress=classifyAddress;this.keccak256Hex=keccak256Hex;this.checksumAddress=checksumAddress;this.scamVerdict=scamVerdict;this.networkPlan=networkPlan;this.whatNext=whatNext;this.waitlistSource=waitlist.toString();', context);
  return { context, app };
}

test('networks page shows a planned-support table for every network and the address checker', () => {
  const { app, context } = load('#networks');
  for (const [name] of context.networkPlan) assert.match(app.innerHTML, new RegExp(`<b>${name}</b>`));
  assert.equal((app.innerHTML.match(/role="row"/g) || []).length, context.networkPlan.length + 1);
  assert.match(app.innerHTML, /id="addr-input"/);
  assert.match(app.innerHTML, /nothing you type is sent or saved/);
  assert.doesNotMatch(app.innerHTML, /\bLive\b/);
});

test('address checker recognises common formats and warns about secrets', () => {
  const { context } = load('#networks');
  const c = v => context.classifyAddress(v);
  assert.equal(c(''), null);
  assert.match(c('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045').title, /Ethereum-style/);
  assert.match(c('0xd8da6bf26964af9d7eed9e03e53415d37aa96045').body, /cannot be caught/);
  assert.match(c('0x1234').title, /Incomplete/);
  assert.equal(c(`0x${'a'.repeat(64)}`).kind, 'danger');
  assert.match(c('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq').title, /Bitcoin/);
  assert.match(c('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx').title, /test-network/);
  assert.match(c('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2').title, /Bitcoin/);
  assert.match(c('So11111111111111111111111111111111111111112').title, /Solana/);
  assert.match(c('vitalik.eth').title, /name, not an address/);
  assert.match(c('hello!').title, /Not a recognised/);
  const phrase = c('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
  assert.equal(phrase.kind, 'danger');
  assert.equal(phrase.clear, true);
});

test('Ethereum checksum check uses real Keccak-256 and catches typos', () => {
  const { context } = load('#networks');
  assert.equal(context.keccak256Hex(''), 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  // multi-block input (longer than one 136-byte block), vector from ethers.keccak256
  assert.equal(context.keccak256Hex('a'.repeat(200)), '96ea54061def936c4be90b518992fdc6f12f535068a256229aca54267b4d084d');
  // EIP-55 reference vectors
  for (const a of ['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359', '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB', '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb']) {
    assert.equal(context.checksumAddress(a.toLowerCase()), a);
    const r = context.classifyAddress(a);
    assert.equal(r.kind, 'ok');
    assert.equal(r.checksum, 'ok');
    assert.match(r.body, /Checksum verified/);
  }
  const typo = context.classifyAddress('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD');
  assert.equal(typo.kind, 'danger');
  assert.equal(typo.checksum, 'bad');
  assert.match(typo.title, /Checksum does not match/);
  assert.equal(context.classifyAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed').checksum, 'none');
  assert.equal(context.classifyAddress('0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED').checksum, 'none');
});

test('security page has a scam self-check with escalating verdicts', () => {
  const { app, context } = load('#security');
  assert.equal(context.document.title, 'Security · FYNX Wallet');
  assert.match(app.innerHTML, /Is this a scam\?/);
  assert.ok((app.innerHTML.match(/class="scam-item"/g) || []).length >= 8);
  assert.match(app.innerHTML, /Before you approve anything/);
  assert.match(app.innerHTML, /fynxteam5@gmail\.com/);
  assert.equal(context.scamVerdict([]).title, '');
  assert.equal(context.scamVerdict(['returns']).kind, 'warn');
  assert.equal(context.scamVerdict(['returns', 'rush']).kind, 'danger');
  assert.match(context.scamVerdict(['phrase']).title, /This is a scam/);
});

test('features page is a full tour with honest status labels and a review walkthrough', () => {
  const { app, context } = load('#features');
  assert.equal(context.document.title, 'Features · FYNX Wallet');
  for (const name of ['Portfolio', 'Buy and sell', 'Send and receive', 'Swap', 'Your keys']) assert.match(app.innerHTML, new RegExp(`Illustrative ${name.toLowerCase()} preview`));
  assert.equal((app.innerHTML.match(/class="ft-row/g) || []).length, 5);
  assert.equal((app.innerHTML.match(/class="review-line"/g) || []).length, 6);
  assert.match(app.innerHTML, /nothing is connected and nothing is sent/);
  assert.match(app.innerHTML, /needs provider approval/);
  assert.match(app.innerHTML, /Step 1 of 6/);
  assert.doesNotMatch(app.innerHTML, /\bLive\b|\bAvailable now\b/);
});

test('waitlist and login pages explain what happens after joining', () => {
  const { context } = load('#features');
  const html = context.whatNext();
  assert.match(html, /What happens after you join/);
  assert.equal((html.match(/<li><span class="number">/g) || []).length, 4);
  assert.match(html, /365 days/);
  assert.match(html, /no confirmation email is sent/);
  assert.match(context.waitlistSource, /\$\{whatNext\(\)\}/);
});
