import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public-site/app.js', import.meta.url), 'utf8');
const pages = await Promise.all(['../index.html', '../public-site/index.html'].map(p => readFile(new URL(p, import.meta.url), 'utf8')));

function loadSite(hash) {
  const app = { innerHTML: '' };
  const context = {
    Object, Map, Set, location: { hash, href: `https://example.test/${hash}` },
    window: { addEventListener() {}, scrollTo() {} }, requestAnimationFrame() {},
    document: { title: '', addEventListener() {}, querySelector: s => (s === '#app' ? app : null), querySelectorAll: () => [] },
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/^import[^\n]+\n/, '').replace('connectFirebase();', '')
    .replace('const glossary=', 'var glossary=').replace('const learnTopics=', 'var learnTopics=').replace('const faqGroups=', 'var faqGroups=').replace('const lessons=', 'var lessons=') + '\nthis.faqSlugs=faqSlugs;', context);
  return { context, app };
}

test('glossary page lists every term, grouped by topic, with search and topic filters', () => {
  const { app, context } = loadSite('#learn');
  const { glossary, learnTopics } = context;
  assert.equal(context.document.title, 'Crypto glossary · FYNX Wallet');
  assert.ok(glossary.length >= 30, `expected a substantial glossary, got ${glossary.length}`);
  assert.equal((app.innerHTML.match(/<article class="card term"/g) || []).length, glossary.length);
  assert.match(app.innerHTML, /id="learn-search"/);
  for (const [id] of learnTopics) assert.ok(app.innerHTML.includes(`data-topic="${id}" aria-pressed="false"`), id);
  assert.match(app.innerHTML, new RegExp(`${glossary.length} terms`));
  assert.match(app.innerHTML, /not financial, legal or tax advice/);
  assert.doesNotMatch(app.innerHTML, /<script|on\w+=/i);
});

test('glossary entries are unique, use known topics and only link to real terms and pages', () => {
  const { context } = loadSite('#learn');
  const slugs = context.glossary.map(g => g[0]);
  assert.equal(new Set(slugs).size, slugs.length, 'unique slugs');
  const topics = new Set(context.learnTopics.map(t => t[0]));
  for (const [slug, term, topic, def, , related, link] of context.glossary) {
    assert.match(slug, /^[a-z0-9-]+$/);
    assert.ok(topics.has(topic), `${term}: topic`);
    assert.ok(def.length > 60, `${term}: definition`);
    for (const r of related) assert.ok(slugs.includes(r) && r !== slug, `${term}: related ${r}`);
    if (link) {
      const site = loadSite(`#${link[0]}`);
      assert.notEqual(site.context.document.title, 'Page not found · FYNX Wallet', `${term}: link #${link[0]}`);
    }
  }
});

test('glossary terms and FAQ answers have shareable deep links; unknown ones show page not found', () => {
  const term = loadSite('#learn/token-approval');
  assert.equal(term.context.document.title, 'Crypto glossary · FYNX Wallet');
  assert.match(term.app.innerHTML, /id="term-token-approval"/);
  const slugs = loadSite('#faq').context.faqSlugs();
  assert.equal(new Set(slugs).size, slugs.length, 'unique FAQ slugs');
  for (const slug of slugs) {
    const site = loadSite(`#faq/${slug}`);
    assert.equal(site.context.document.title, 'Questions · FYNX Wallet', slug);
    assert.ok(site.app.innerHTML.includes(`id="faq-${slug}"`), slug);
  }
  assert.ok(slugs.includes('how-do-i-leave-the-waitlist-or-delete-my-email'));
  for (const hash of ['#learn/nope', '#faq/nope', '#learn/', '#learn/Token-Approval']) {
    assert.equal(loadSite(hash).context.document.title, 'Page not found · FYNX Wallet', hash);
  }
});

test('glossary is reachable from the header, phone menu, footer, FAQ and page-not-found view', () => {
  for (const page of pages) {
    assert.match(page, /<nav class="globalnav"[^>]*>.*?<a href="#learn">Learn<\/a>/);
    assert.match(page, /<nav class="mobilenav"[^>]*>.*?<a href="#learn">Crypto glossary<\/a>.*?<\/nav>/);
    assert.match(page, /<h3>Resources<\/h3>.*?<a href="#learn">Crypto glossary<\/a>/);
  }
  assert.ok(loadSite('#faq').app.innerHTML.includes('href="#learn"'));
  assert.ok(loadSite('#bogus').app.innerHTML.includes('href="#learn"'));
});

test('homepage has search and social sharing metadata', () => {
  for (const page of pages) {
    assert.match(page, /<meta name="description" content="[^"]{80,160}">/);
    for (const tag of ['og:title', 'og:description', 'og:url', 'og:type']) assert.match(page, new RegExp(`<meta property="${tag}" content="[^"]+">`), tag);
    assert.match(page, /<meta name="twitter:card" content="summary">/);
    assert.match(page, /<link rel="canonical" href="https:\/\/ea-la\.github\.io\/FYNX-Wallet\/">/);
  }
});

test('learn page starts with six beginner lessons, each with a self-check question and real links', () => {
  const { app, context } = loadSite('#learn');
  const { lessons, glossary } = context;
  const slugs = new Set(glossary.map(g => g[0]));
  assert.equal(lessons.length, 6);
  assert.match(app.innerHTML, /id="lt-lessons"/);
  assert.match(app.innerHTML, /aria-label="On this page"/);
  assert.ok(app.innerHTML.indexOf('id="lt-lessons"') < app.innerHTML.indexOf('id="learn-search"'), 'lessons come before the glossary');
  assert.equal((app.innerHTML.match(/<details class="lesson"/g) || []).length, 6);
  const ids = lessons.map(l => l[0]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [id, title, min, paras, points, terms, tool, quiz] of lessons) {
    assert.match(id, /^[a-z]+$/);
    assert.ok(min > 0 && paras.length >= 2 && points.length >= 2, title);
    for (const t of terms) assert.ok(slugs.has(t), `${title}: glossary ${t}`);
    assert.notEqual(loadSite(`#${tool[0]}`).context.document.title, 'Page not found · FYNX Wallet', `${title}: tool #${tool[0]}`);
    const [q, opts, right, why] = quiz;
    assert.ok(q.endsWith('?') && opts.length === 3 && Number.isInteger(right) && right >= 0 && right < opts.length && why.length > 40, title);
    assert.equal((app.innerHTML.match(new RegExp(`name="quiz-${id}"`, 'g')) || []).length, 3);
    assert.ok(!app.innerHTML.includes(why), `${title}: explanation is only shown after a correct answer`);
  }
  assert.match(app.innerHTML, /kept only in this browser/);
});

test('lessons and learn sections have shareable links; unknown lessons show page not found', () => {
  for (const hash of ['#learn/lessons', '#learn/glossary', '#learn/keys', '#learn/lesson-fees', '#learn/lesson-holds']) {
    assert.equal(loadSite(hash).context.document.title, 'Crypto glossary · FYNX Wallet', hash);
  }
  for (const hash of ['#learn/lesson-nope', '#learn/lesson-', '#learn/lesson-Fees']) {
    assert.equal(loadSite(hash).context.document.title, 'Page not found · FYNX Wallet', hash);
  }
  const { context } = loadSite('#learn');
  const terms = new Set(context.glossary.map(g => g[0]));
  for (const id of ['lessons', 'glossary', ...context.learnTopics.map(t => t[0])]) assert.ok(!terms.has(id), `section id ${id} does not clash with a term`);
});
