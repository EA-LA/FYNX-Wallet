import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public-site/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const nested = await readFile(new URL('../public-site/index.html', import.meta.url), 'utf8');

function load(hash) {
  const app = { innerHTML: '' };
  const context = {
    Object, location: { hash },
    window: { addEventListener() {}, scrollTo() {} },
    document: { title: '', addEventListener() {}, querySelector: s => (s === '#app' ? app : null), querySelectorAll: () => [] },
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/^import[^\n]+\n/, '').replace('connectFirebase();', '').replace('const faqGroups=', 'var faqGroups='), context);
  return { context, app };
}

test('help page lists grouped questions with search and expand controls', () => {
  const { app, context } = load('#faq');
  assert.equal(context.document.title, 'Questions · FYNX Wallet');
  const total = context.faqGroups.reduce((t, [, q]) => t + q.length, 0);
  assert.ok(total >= 15, `expected a substantial FAQ, got ${total}`);
  assert.equal((app.innerHTML.match(/<details /g) || []).length, total);
  assert.equal((app.innerHTML.match(/class="faq-group"/g) || []).length, context.faqGroups.length);
  assert.match(app.innerHTML, /id="faq-search"/);
  assert.match(app.innerHTML, /id="faq-toggle"/);
  assert.match(app.innerHTML, new RegExp(`${total} questions`));
  for (const q of ['Can I use the wallet today?', 'How do I leave the waitlist or delete my email?', 'Will FYNX ever ask for my recovery phrase?']) assert.ok(app.innerHTML.includes(q), q);
});

test('FAQ answers stay consistent with the privacy notice and make no live-service claims', () => {
  const { app } = load('#faq');
  assert.match(app.innerHTML, /365 days/);
  assert.match(app.innerHTML, /FYNX%20Wallet%20waitlist%20removal/);
  assert.doesNotMatch(app.innerHTML, /\b(audited by|is insured|guaranteed returns|FDIC)\b/i);
  assert.doesNotMatch(app.innerHTML, /<script|on\w+=/i);
});

test('phones get a menu with the sections hidden from the top bar, plus a skip link', () => {
  for (const page of [html, nested]) {
    assert.match(page, /<a class="skip-link" href="#app">Skip to content<\/a>/);
    assert.match(page, /<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu">Menu<\/button>/);
    const menu = page.match(/<nav class="mobilenav" id="mobile-menu"[^>]*hidden>(.*?)<\/nav>/)?.[1];
    assert.ok(menu, 'mobile menu present and hidden by default');
    for (const href of ['#features', '#networks', '#security', '#faq', '#login']) assert.ok(menu.includes(`href="${href}"`), href);
  }
});
