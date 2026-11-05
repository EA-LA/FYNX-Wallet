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
    .replace('const practiceCases=', 'var practiceCases=').replace('const glossary=', 'var glossary=')
    + '\nthis.practiceFeedback=practiceFeedback;this.practiceSummary=practiceSummary;this.practiceFeedbackHtml=practiceFeedbackHtml;this.practiceSummaryHtml=practiceSummaryHtml;this.practiceCaseHtml=practiceCaseHtml;this.pageSections=pageSections;this.sectionNames=sectionNames;this.lessons=lessons;', context);
  return { context, app };
}

const { context: c, app } = loadSite('#security/practice');
const cases = c.practiceCases;
const right = Object.fromEntries(cases.map(x => [x[0], x[4]]));

test('practice renders on the Security page with a deep link, an On this page chip and the first situation', () => {
  assert.equal(c.document.title, 'Security · FYNX Wallet');
  assert.match(app.innerHTML, /id="sec-practice"/);
  assert.match(app.innerHTML, /href="#security\/practice" data-target="sec-practice"/);
  assert.match(app.innerHTML, /href="#security\/practice">Try ten real-life situations/);
  assert.match(app.innerHTML, /Situation 1 of 10/);
  assert.match(app.innerHTML, /data-choice="go">Go ahead/);
  assert.match(app.innerHTML, /data-choice="stop">Stop/);
  assert.match(app.innerHTML, /not sent or saved/);
  assert.ok(c.pageSections.security.includes('practice'));
  assert.doesNotMatch(app.innerHTML, /<script|on\w+=/i);
});

test('ten unique situations with a mix of safe and scam answers', () => {
  assert.equal(cases.length, 10);
  assert.equal(new Set(cases.map(x => x[0])).size, 10);
  const stops = cases.filter(x => x[4] === 'stop').length;
  assert.ok(stops >= 5 && stops <= 8, `stops=${stops}`);
  for (const [id, where, from, text, ans, reasons, todo, tool] of cases) {
    assert.ok(['stop', 'go'].includes(ans), id);
    assert.ok(where && from && text.length > 40 && todo.length > 30, id);
    assert.ok(reasons.length >= 2, id);
    assert.ok(Array.isArray(tool) && tool.length === 2, id);
  }
});

test('feedback says whether the choice was right and gives reasons and a next step', () => {
  for (const [id, , , , ans] of cases) {
    const good = c.practiceFeedback(id, ans);
    assert.equal(good.correct, true);
    assert.equal(good.kind, 'ok');
    const bad = c.practiceFeedback(id, ans === 'stop' ? 'go' : 'stop');
    assert.equal(bad.correct, false);
    assert.equal(bad.kind, ans === 'stop' ? 'danger' : 'warn');
    assert.equal(bad.heading, ans === 'stop' ? 'Red flags' : 'Why it is fine');
  }
  assert.equal(c.practiceFeedback('nope', 'stop'), null);
  assert.equal(c.practiceFeedback('support', 'maybe'), null);
  assert.match(c.practiceFeedback('support', 'go').title, /scam/);
});

test('every feedback and tool link opens a real page, section or glossary term', () => {
  const valid = new Set(['security/scam', ...Object.entries(c.pageSections).flatMap(([p, ids]) => ids.map(id => `${p}/${id}`))]);
  const terms = new Set(c.glossary.map(g => g[0]));
  cases.forEach(([id, , , , ans], i) => {
    const html = c.practiceFeedbackHtml(c.practiceFeedback(id, ans), i === cases.length - 1);
    assert.doesNotMatch(html, /undefined|<script|on\w+=/i);
    for (const [, href] of html.matchAll(/href="#([^"]+)"/g)) {
      if (href.startsWith('learn/')) assert.ok(terms.has(href.slice(6)), href);
      else assert.ok(valid.has(href), href);
    }
    assert.match(html, i === cases.length - 1 ? /See my score/ : /Next situation/);
  });
});

test('summary scores answers and lists only the missed situations', () => {
  const perfect = c.practiceSummary(right);
  assert.equal(perfect.score, 10);
  assert.equal(perfect.kind, 'ok');
  assert.equal(perfect.missed.length, 0);
  const flip = v => (v === 'stop' ? 'go' : 'stop');
  const two = { ...right, support: flip(right.support), family: flip(right.family) };
  const s2 = c.practiceSummary(two);
  assert.equal(s2.score, 8);
  assert.equal(s2.kind, 'warn');
  assert.equal(s2.missed.map(x => x[0]).sort().join(','), 'family,support');
  const allWrong = Object.fromEntries(cases.map(x => [x[0], flip(x[4])]));
  const s0 = c.practiceSummary(allWrong);
  assert.equal(s0.score, 0);
  assert.equal(s0.kind, 'danger');
  const html = c.practiceSummaryHtml(s0);
  assert.match(html, /0 of 10/);
  assert.match(html, /Try again/);
  assert.match(html, /href="#learn\/lesson-scams"/);
  assert.ok(c.lessons.some(l => l[0] === 'scams'));
  assert.doesNotMatch(html, /undefined|<script|on\w+=/i);
});

test('situation text is escaped', () => {
  const html = c.practiceCaseHtml(0);
  assert.match(html, /&ldquo;|“/);
  assert.doesNotMatch(html, /<script/);
});
