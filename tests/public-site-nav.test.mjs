import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public-site/app.js', import.meta.url), 'utf8');

function loadSite(hash) {
  const link = href => {
    const attrs = { href }, classes = new Set();
    return { classes, attrs, getAttribute: n => attrs[n] ?? null, setAttribute: (n, v) => { attrs[n] = String(v); }, removeAttribute: n => { delete attrs[n]; }, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } };
  };
  const nav = ['#features', '#networks', '#security', '#login', '#waitlist'].map(link);
  const heading = { attrs: {}, focused: false, setAttribute(n, v) { this.attrs[n] = v; }, focus(opts) { this.focused = opts; } };
  const app = { innerHTML: '' };
  const listeners = {};
  const context = {
    Object, location: { hash }, waitlistBackendReady: true,
    window: { addEventListener: (n, fn) => { listeners[n] = fn; }, scrollTo() {} },
    document: {
      title: '',
      querySelector: s => (s === '#app' ? app : s === '#app h1' ? heading : null),
      querySelectorAll: s => (s === '.globalnav a' ? nav : []),
    },
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/^import[^\n]+\n/, '').replace('connectFirebase();', '').replace('const pageTitles=', 'var pageTitles=') + '\nthis.render=render;', context);
  return { context, nav, heading, app, listeners };
}

test('each public section gets its own browser tab title', () => {
  for (const [hash, title] of [['', 'FYNX Wallet — Your crypto. Simply yours.'], ['#features', 'Features · FYNX Wallet'], ['#faq', 'Questions · FYNX Wallet'], ['#privacy', 'Waitlist privacy · FYNX Wallet'], ['#waitlist', 'Join the waitlist · FYNX Wallet']]) {
    assert.equal(loadSite(hash).context.document.title, title);
  }
});

test('closed wallet routes still fall back to the early-access page', () => {
  for (const hash of ['#login', '#assets', '#asset/eth', '#transaction/0x1', '#send']) {
    const site = loadSite(hash);
    assert.equal(site.context.document.title, 'Log in · FYNX Wallet');
    assert.match(site.app.innerHTML, /You’re a little early/);
  }
});

test('unknown links show a friendly page-not-found view with links to every section', () => {
  for (const hash of ['#bogus', '#__proto__', '#toString', '#features/nope', '#faq/1']) {
    const site = loadSite(hash);
    assert.equal(site.context.document.title, 'Page not found · FYNX Wallet', hash);
    assert.match(site.app.innerHTML, /This page doesn’t exist/);
    assert.doesNotMatch(site.app.innerHTML, /You’re a little early/);
    for (const h of ['#features', '#networks', '#security', '#faq', '#waitlist', '#privacy', '#home']) assert.ok(site.app.innerHTML.includes(`href="${h}"`), h);
  }
});

test('feature deep links open the Features page for that part of the tour', () => {
  for (const part of ['portfolio', 'buy', 'send', 'swap', 'keys', 'review']) {
    const site = loadSite(`#features/${part}`);
    assert.equal(site.context.document.title, 'Features · FYNX Wallet');
    assert.match(site.app.innerHTML, new RegExp(`id="ft-${part}"`));
    assert.deepEqual(site.nav.filter(a => a.attrs['aria-current'] === 'page').map(a => a.attrs.href), ['#features']);
  }
});

test('homepage feature cards and the security checklist link into the Features tour', () => {
  const home = loadSite('').app.innerHTML;
  for (const part of ['portfolio', 'buy', 'send']) assert.ok(home.includes(`href="#features/${part}"`), part);
  assert.ok(loadSite('#security').app.innerHTML.includes('href="#features/review"'));
});

test('the current section is marked in the header navigation', () => {
  const { nav } = loadSite('#networks');
  const current = nav.filter(a => a.attrs['aria-current'] === 'page');
  assert.deepEqual(current.map(a => a.attrs.href), ['#networks']);
  assert.ok(current[0].classes.has('active'));
  assert.equal(nav.filter(a => a.classes.has('active')).length, 1);
});

test('navigating moves keyboard and screen-reader focus to the new page heading', () => {
  const site = loadSite('');
  site.context.location.hash = '#security';
  site.listeners.hashchange();
  assert.equal(site.heading.attrs.tabindex, '-1');
  assert.equal(site.heading.focused?.preventScroll, true);
  assert.equal(site.context.document.title, 'Security · FYNX Wallet');
});

test('header action buttons keep readable text colours', async () => {
  const css = await readFile(new URL('../public-site/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.globalnav a\.button\{color:#fff\}/);
  assert.match(css, /\.globalnav a\.button\.light\{color:#222\}/);
  assert.ok(css.lastIndexOf('.globalnav a.button{') > css.lastIndexOf('.globalnav a.active{'));
});
