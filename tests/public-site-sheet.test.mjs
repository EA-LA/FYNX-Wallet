import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public-site/app.js', import.meta.url), 'utf8');

function loadSite(hash) {
  const app = { innerHTML: '' };
  const context = {
    waitlistBackendReady: false, Object, Map, Set, location: { hash, href: `https://example.test/${hash}` },
    window: { addEventListener() {}, scrollTo() {} }, requestAnimationFrame() {},
    document: { title: '', documentElement: { classList: { add() {}, remove() {} } }, addEventListener() {}, getElementById: () => null, querySelector: s => (s === '#app' ? app : null), querySelectorAll: () => [] },
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/^import[^\n]+\n/, '').replace('connectFirebase();', '')
    .replace('const sheetFields=', 'var sheetFields=')
    + '\nthis.looksSecret=looksSecret;this.sheetHtml=sheetHtml;this.emailProblem=emailProblem;this.emailSuggestion=emailSuggestion;this.showEmailCheck=showEmailCheck;', context);
  return { context, app };
}

test('security page has the printable backup sheet with every field, a print button and no inline handlers', () => {
  const { app, context } = loadSite('#security/sheet');
  assert.match(app.innerHTML, /id="sec-sheet"/);
  assert.match(app.innerHTML, /Backup instructions for your family/);
  assert.match(app.innerHTML, /Never type the recovery phrase itself/);
  assert.match(app.innerHTML, /id="sheet-print"/);
  assert.match(app.innerHTML, /href="#security\/sheet"/, 'backup check links to the sheet');
  for (const [id] of context.sheetFields) assert.ok(app.innerHTML.includes(`data-field="${id}"`), id);
  assert.doesNotMatch(app.innerHTML, /<script|on\w+=/i);
  assert.doesNotMatch(app.innerHTML, /Page not found|doesn’t exist/);
});

test('sheet refuses anything that looks like a recovery phrase or private key', () => {
  const { context } = loadSite('#security');
  const secret = [
    'abandon ability able about above absent absorb abstract absurd abuse access accident',
    'legal winner thank year wave sausage worth useful',
    '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318',
    '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318',
    'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi',
    '5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ',
  ];
  for (const s of secret) assert.equal(context.looksSecret(s), true, s);
  for (const s of ['home safe', 'in the blue box on the top shelf of the hall closet', 'Ledger Nano X', 'ETH and USDC on Ethereum', 'Jane Doe, Smith & Co. attorneys', '+1 555 0100', '']) assert.equal(context.looksSecret(s), false, s);
});

test('sheet prints filled values escaped, blank lines for empty or "Not sure", and the recovery steps', () => {
  const { context } = loadSite('#security');
  const html = context.sheetHtml({ wallet: '<b>Ledger</b>', words: '24 words', passphrase: 'Not sure' }, 'November 4, 2026');
  assert.match(html, /&lt;b&gt;Ledger&lt;\/b&gt;/);
  assert.match(html, /24 words/);
  assert.match(html, /Prepared November 4, 2026/);
  assert.match(html, /does <b>not<\/b> contain the recovery phrase/);
  const blanks = html.match(/class="blank"/g) || [];
  assert.equal(blanks.length, context.sheetFields.length - 2);
  assert.match(html, /official website/);
  assert.match(html, /recovery services/);
});

test('waitlist email checks give specific messages and suggest common typo fixes', () => {
  const { context } = loadSite('#waitlist');
  assert.equal(context.emailProblem('test@example.com'), '');
  assert.equal(context.emailProblem('first.last+tag@mail.example.co.uk'), '');
  assert.match(context.emailProblem(''), /Enter your email/);
  assert.match(context.emailProblem('me example.com'), /spaces/);
  assert.match(context.emailProblem('me.example.com'), /needs an @/);
  assert.match(context.emailProblem('a@b@c.com'), /only one @/);
  assert.match(context.emailProblem('@example.com'), /before the @/);
  assert.match(context.emailProblem('me@'), /after the @/);
  assert.match(context.emailProblem('me@example'), /should look like example\.com/);
  assert.match(context.emailProblem('me@example.c'), /should look like example\.com/);
  assert.equal(context.emailSuggestion('Jo@Gmial.com'), 'Jo@gmail.com');
  assert.equal(context.emailSuggestion('jo@hotmial.com'), 'jo@hotmail.com');
  assert.equal(context.emailSuggestion('jo@gmail.com'), '');
  assert.equal(context.emailSuggestion('nope'), '');
});

test('invalid email blocks submit with an inline message; waitlist page shows free tools, login page does not', async () => {
  const { context, app } = loadSite('#waitlist');
  assert.match(app.innerHTML, /id="email-hint"/);
  assert.match(app.innerHTML, /While you wait: free tools/);
  let called = 0;
  context.stub = async () => { called++; return { ok: true }; };
  vm.runInContext('submitWaitlist = stub', context);
  const attrs = {};
  const controls = { '#submit': {}, '#error': {}, '#email': { value: 'me@example', setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: k => { delete attrs[k]; } }, '#consent': { checked: true }, '#website': { value: '' } };
  const form = { controls, dataset: {}, isConnected: true, innerHTML: 'form', reportValidity: () => true, querySelector: s => controls[s] };
  await context.handleWaitlistSubmit({ preventDefault() {}, currentTarget: form });
  assert.equal(called, 0);
  assert.match(controls['#error'].textContent, /example\.com/);
  assert.equal(attrs['aria-invalid'], 'true');
  controls['#email'].value = 'me@example.com';
  await context.handleWaitlistSubmit({ preventDefault() {}, currentTarget: form });
  assert.equal(called, 1);
  assert.match(form.innerHTML, /You’re on the list/);
  assert.match(form.innerHTML, /#security\/sheet/);
  const login = loadSite('#login');
  assert.doesNotMatch(login.app.innerHTML, /While you wait: free tools/);
});
