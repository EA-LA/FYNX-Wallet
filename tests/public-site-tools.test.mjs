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
  vm.runInContext(source.replace(/^import[^\n]+\n/, '').replace('connectFirebase();', '') + '\nthis.classifyAddress=classifyAddress;this.scamVerdict=scamVerdict;this.networkPlan=networkPlan;this.whatNext=whatNext;this.waitlistSource=waitlist.toString();', context);
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
