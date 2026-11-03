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

test('unknown and closed wallet routes still fall back to the early-access page', () => {
  for (const hash of ['#bogus', '#assets', '#asset/eth', '#__proto__', '#toString']) {
    const site = loadSite(hash);
    assert.equal(site.context.document.title, 'Log in · FYNX Wallet');
    assert.match(site.app.innerHTML, /You’re a little early/);
  }
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
