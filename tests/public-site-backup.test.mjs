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
    document: { title: '', addEventListener() {}, getElementById: () => null, querySelector: s => (s === '#app' ? app : null), querySelectorAll: () => [] },
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/^import[^\n]+\n/, '').replace('connectFirebase();', '')
    .replace('const backupItems=', 'var backupItems=').replace('const glossary=', 'var glossary=').replace('const starters=', 'var starters=')
    + '\nthis.backupVerdict=backupVerdict;', context);
  return { context, app };
}

test('security page has a backup check with every statement, privacy note and no inline handlers', () => {
  const { app, context } = loadSite('#security');
  assert.match(app.innerHTML, /id="sec-backup"/);
  assert.match(app.innerHTML, /Is your recovery phrase backup safe\?/);
  assert.match(app.innerHTML, /not sent or saved/);
  for (const [id] of context.backupItems) assert.ok(app.innerHTML.includes(`value="${id}"`), id);
  assert.doesNotMatch(app.innerHTML, /<script|on\w+=/i);
});

test('backup verdict: missing critical items come first and are urgent; all ticked is solid', () => {
  const { context } = loadSite('#security');
  const ids = context.backupItems.map(i => i[0]);
  const total = ids.length;
  const all = context.backupVerdict(ids);
  assert.equal(all.kind, 'ok');
  assert.equal(all.fixes.length, 0);
  assert.match(all.title, new RegExp(`^${total} of ${total}`));

  const noOffline = context.backupVerdict(ids.filter(i => i !== 'offline' && i !== 'copies'));
  assert.equal(noOffline.kind, 'danger');
  assert.deepEqual([...noOffline.fixes].map(f => f[0]), ['offline', 'copies']);

  const minor = context.backupVerdict(ids.filter(i => i !== 'tested'));
  assert.equal(minor.kind, 'warn');
  assert.equal(minor.score, total - 1);
  assert.deepEqual([...minor.fixes].map(f => f[0]), ['tested']);
});

test('backup items are unique and only link to real glossary terms', () => {
  const { context } = loadSite('#security');
  const ids = context.backupItems.map(i => i[0]);
  assert.equal(new Set(ids).size, ids.length);
  const slugs = new Set(context.glossary.map(g => g[0]));
  for (const [id, text, , fix, slug] of context.backupItems) {
    assert.ok(text.length > 30 && fix.length > 40, id);
    if (slug) assert.ok(slugs.has(slug), `${id}: ${slug}`);
  }
});

test('section deep links open Security and Networks; unknown sections are not found', () => {
  for (const [hash, title, id] of [['#security/backup', 'Security', 'sec-backup'], ['#security/scam', 'Security', 'sec-scam'], ['#security/approve', 'Security', 'sec-approve'], ['#networks/check', 'Networks', 'net-check'], ['#networks/plan', 'Networks', 'net-plan']]) {
    const site = loadSite(hash);
    assert.equal(site.context.document.title, `${title} · FYNX Wallet`, hash);
    assert.ok(site.app.innerHTML.includes(`id="${id}"`), hash);
  }
  for (const hash of ['#security/nope', '#networks/backup', '#security/']) assert.equal(loadSite(hash).context.document.title, 'Page not found · FYNX Wallet', hash);
});

test('homepage "start here" cards link to pages that exist', () => {
  const { app, context } = loadSite('');
  assert.match(app.innerHTML, /New to crypto\? Start here\./);
  for (const [href] of context.starters) {
    assert.ok(app.innerHTML.includes(`href="#${href}"`), href);
    assert.notEqual(loadSite(`#${href}`).context.document.title, 'Page not found · FYNX Wallet', href);
  }
});

test('features, networks and security list glossary words that link to real terms', () => {
  for (const page of ['#features', '#networks', '#security']) {
    const { app } = loadSite(page);
    const links = [...app.innerHTML.matchAll(/class="term-strip"[\s\S]*?<\/nav>/g)].join('').match(/#learn\/[a-z0-9-]+/g) || [];
    assert.ok(links.length >= 5, page);
    for (const l of links) assert.notEqual(loadSite(l).context.document.title, 'Page not found · FYNX Wallet', l);
  }
});
