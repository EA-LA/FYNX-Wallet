import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public-site/app.js', import.meta.url), 'utf8');

function loadSite(hash) {
  const app = { innerHTML: '' };
  const context = {
    Object, Map, Set, location: { hash, href: `https://example.test/${hash}` },
    window: { addEventListener() {}, scrollTo() {} }, requestAnimationFrame() {},
    document: { title: '', addEventListener() {}, querySelector: s => (s === '#app' ? app : null), querySelectorAll: () => [] },
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/^import[^\n]+\n/, '').replace('connectFirebase();', '')
    .replace('const glossary=', 'var glossary=').replace('const walletTypes=', 'var walletTypes=').replace('const chooserQuestions=', 'var chooserQuestions=') + '\nthis.chooseWallet=chooseWallet;this.chooserResultHtml=chooserResultHtml;', context);
  return { context, app };
}

const { context } = loadSite('#learn');
const pick = a => context.chooseWallet(a);

test('wallet chooser renders on the Learn page with a shareable deep link and an On this page chip', () => {
  const { app, context: c } = loadSite('#learn/chooser');
  assert.equal(c.document.title, 'Learn crypto · FYNX Wallet');
  assert.match(app.innerHTML, /id="lt-chooser"/);
  assert.match(app.innerHTML, /href="#learn\/chooser" data-target="lt-chooser"/);
  for (const [id, , opts] of c.chooserQuestions) for (const [v] of opts) assert.ok(app.innerHTML.includes(`name="choose-${id}" value="${v}"`), `${id}=${v}`);
  for (const [id] of c.walletTypes) assert.match(app.innerHTML, new RegExp(`id="wallet-type-${id}"`));
  assert.match(app.innerHTML, /not financial advice/);
  assert.doesNotMatch(app.innerHTML, /<script|on\w+=/i);
});

test('chooser needs every answer before suggesting anything', () => {
  assert.equal(pick({}), null);
  assert.equal(pick({ amount: 'small', use: 'often', backup: 'yes' }), null);
  assert.equal(pick({ amount: 'small', use: 'often', backup: 'yes', people: 'nobody' }), null);
});

test('chooser suggestions follow the answers', () => {
  const base = { use: 'rarely', backup: 'yes', people: 'me' };
  assert.equal(pick({ ...base, amount: 'small' }).pick, 'app');
  assert.equal(pick({ ...base, amount: 'meaningful' }).pick, 'hardware');
  assert.equal(pick({ ...base, amount: 'major' }).pick, 'hardware');
  assert.equal(pick({ ...base, amount: 'major', use: 'often' }).pick, 'split');
  assert.equal(pick({ ...base, amount: 'major', people: 'shared' }).pick, 'multisig');
  assert.equal(pick({ ...base, amount: 'small', people: 'shared' }).pick, 'app');
  assert.equal(pick({ ...base, amount: 'meaningful', backup: 'no' }).pick, 'exchange');
  assert.equal(pick({ ...base, amount: 'meaningful', backup: 'no' }).kind, 'ok');
});

test('chooser warns about concentration risk and unsure backups', () => {
  const major = pick({ amount: 'major', use: 'rarely', backup: 'no', people: 'me' });
  assert.equal(major.pick, 'exchange');
  assert.equal(major.kind, 'warn');
  assert.ok(major.why.some(w => /concentrates the risk/.test(w)));
  const unsure = pick({ amount: 'meaningful', use: 'rarely', backup: 'unsure', people: 'me' });
  assert.equal(unsure.pick, 'hardware');
  assert.equal(unsure.kind, 'warn');
  assert.ok(unsure.why.some(w => /backup check/.test(w)));
  const sharedNoBackup = pick({ amount: 'major', use: 'rarely', backup: 'no', people: 'shared' });
  assert.equal(sharedNoBackup.pick, 'multisig');
  assert.equal(sharedNoBackup.kind, 'warn');
});

test('every answer combination gives a complete suggestion whose links open real pages', () => {
  const types = new Set(context.walletTypes.map(t => t[0]));
  const [[, , a], [, , u], [, , b], [, , p]] = context.chooserQuestions;
  const links = new Set();
  for (const [amount] of a) for (const [use] of u) for (const [backup] of b) for (const [people] of p) {
    const r = pick({ amount, use, backup, people });
    assert.ok(r && types.has(r.pick), `${amount}/${use}/${backup}/${people}`);
    assert.ok(r.why.length >= 1);
    for (const [id] of r.also) assert.ok(types.has(id) && id !== r.pick);
    const html = context.chooserResultHtml(r);
    assert.match(html, /First steps/);
    assert.doesNotMatch(html, /undefined|<script|on\w+=/i);
    for (const m of html.matchAll(/href="#([^"]+)"/g)) links.add(m[1]);
  }
  for (const link of links) assert.notEqual(loadSite(`#${link}`).context.document.title, 'Page not found · FYNX Wallet', link);
});

test('homepage links to the first lesson and the chooser; new glossary term routes', () => {
  const home = loadSite('#home');
  assert.match(home.app.innerHTML, /href="#learn\/lesson-holds"/);
  assert.match(home.app.innerHTML, /href="#learn\/chooser"/);
  const term = loadSite('#learn/multisig');
  assert.match(term.app.innerHTML, /id="term-multisig"/);
});
