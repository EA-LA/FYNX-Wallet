import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ACCESS_SERVICES, REVIEW_DAYS, cleanReview, updateService, serviceState, accessSummary, accessCheck, accessSummaryText,
  accessReportLines, parseAccessReport, mergeAccessReviews, findService,
} from '../wallet-src/access-review.js';
import { checkup } from '../wallet-src/security-checkup.js';
import { looksSecret } from '../wallet-src/launch-tracker.js';

const TODAY = '2026-11-10';
const NOW = Date.parse('2026-11-10T15:00:00Z');
const full = (reviewed, at = NOW) => ({ twoStep: 'yes', codes: 'yes', people: 1, reviewed, unused: false, at });

test('every service has a name, what it controls, what to check and https links only', () => {
  const ids = new Set();
  for (const s of ACCESS_SERVICES) {
    assert.ok(/^[a-z]{2,20}$/.test(s.id) && !ids.has(s.id), s.id); ids.add(s.id);
    assert.ok(s.name.length >= 5, s.id);
    for (const field of ['controls', 'check', 'people']) assert.ok(s[field].length > 10, `${s.id}.${field}`);
    assert.ok(s.links.length >= 1);
    for (const [label, href] of s.links) { assert.ok(label); assert.match(href, /^https:\/\/[a-z0-9.-]+\//); }
  }
  assert.deepEqual(ACCESS_SERVICES.filter(s => s.core).map(s => s.id), ['google', 'cloud', 'billing', 'github', 'inbox']);
});

test('cleanReview keeps known services and well-formed values only', () => {
  const r = cleanReview({
    google: { twoStep: 'yes', codes: 'maybe', people: 3, reviewed: '2026-11-01', at: 5 },
    github: { twoStep: 'no', codes: 'no', people: 150, reviewed: '2027-01-01', at: 9 },
    cloud: { twoStep: 'yes', at: 0 },
    billing: { reviewed: '2026-02-30', at: 3 },
    nope: { twoStep: 'yes', at: 1 },
  }, TODAY);
  assert.deepEqual(Object.keys(r).sort(), ['billing', 'github', 'google']);
  assert.equal(r.google.codes, ''); assert.equal(r.google.people, 3);
  assert.equal(r.github.people, null, 'more than 99 people is refused');
  assert.equal(r.github.reviewed, '', 'a review date in the future is dropped');
  assert.equal(r.billing.reviewed, '', 'an impossible date is dropped');
  assert.deepEqual(cleanReview(null), {}); assert.deepEqual(cleanReview('x'), {});
});

test('updateService stamps today, keeps a rising change time and ignores unknown services', () => {
  let r = updateService({}, 'github', { twoStep: 'yes' }, NOW);
  assert.equal(r.github.twoStep, 'yes'); assert.equal(r.github.at, NOW);
  r = updateService(r, 'github', { reviewed: 'today' }, NOW);
  assert.equal(r.github.at, NOW + 1, 'two changes in the same millisecond still order');
  assert.match(r.github.reviewed, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(r.github.twoStep, 'yes');
  assert.equal(updateService(r, 'unknown', { twoStep: 'yes' }, NOW), r);
  r = updateService(r, 'github', { people: 120 }, NOW + 5);
  assert.equal(r.github.people, null);
});

test('serviceState: never, risk, check, ok, soon, overdue and unused', () => {
  const g = findService('github'), t = findService('transak');
  assert.equal(serviceState(g, null, TODAY).state, 'never');
  assert.equal(serviceState(g, null, TODAY).counted, true);
  assert.equal(serviceState(t, null, TODAY).counted, false, 'an optional service counts only once touched');
  assert.equal(serviceState(t, { unused: true, at: 1 }, TODAY).state, 'unused');
  const off = serviceState(g, { ...full('2026-11-01'), twoStep: 'no' }, TODAY);
  assert.equal(off.state, 'risk'); assert.match(off.title, /Two-factor authentication is off/);
  assert.equal(serviceState(findService('google'), { twoStep: 'yes', codes: 'no', at: 1 }, TODAY).state, 'risk', 'a gap shows even before the first review');
  const half = serviceState(g, { ...full('2026-11-01'), codes: 'unsure' }, TODAY);
  assert.equal(half.state, 'check'); assert.match(half.title, /recovery codes not checked/);
  const ok = serviceState(g, full('2026-11-01'), TODAY);
  assert.equal(ok.state, 'ok'); assert.equal(ok.due, '2027-01-30'); assert.equal(ok.title, 'Reviewed 2026-11-01 · next by 2027-01-30');
  const soon = serviceState(g, full('2026-08-20'), TODAY);
  assert.equal(soon.state, 'soon'); assert.equal(soon.daysLeft, 8);
  assert.equal(serviceState(g, full('2026-08-12'), TODAY).title, 'Review due today');
  const late = serviceState(g, full('2026-08-01'), TODAY);
  assert.equal(late.state, 'overdue'); assert.equal(late.title, 'Review overdue since 2026-10-30');
  assert.equal(REVIEW_DAYS, 90);
});

test('accessSummary counts core services from the start and lists the urgent ones first', () => {
  const empty = accessSummary({}, TODAY);
  assert.equal(empty.total, 5); assert.equal(empty.fine, 0); assert.equal(empty.never, 5);
  assert.equal(empty.urgent.length, 0, 'first-time reviews never crowd Your next steps');
  const r = {
    google: full('2026-11-01'), cloud: full('2026-08-01'), billing: full('2026-08-20'),
    github: { ...full('2026-11-01'), twoStep: 'no' }, transak: { unused: true, at: 2 }, alchemy: full('2026-10-01'),
  };
  const s = accessSummary(r, TODAY);
  assert.equal(s.total, 6, 'five core plus Alchemy; Transak is not used, CoinGecko untouched');
  assert.equal(s.fine, 3); assert.equal(s.soon, 1); assert.equal(s.unused, 1);
  assert.deepEqual(s.attention.map(x => x.service.id), ['github', 'cloud', 'inbox']);
  assert.deepEqual(s.urgent.map(x => x.state), ['risk', 'overdue']);
  assert.equal(s.nextDue, '2026-10-30');
});

test('accessCheck feeds the security checkup as one more scored check', () => {
  const todo = accessCheck(accessSummary({}, TODAY));
  assert.equal(todo.state, 'todo'); assert.equal(todo.fix, 'access'); assert.match(todo.detail, /0 of 5 reviewed .*5 not reviewed yet/);
  const done = accessCheck(accessSummary(Object.fromEntries(['google', 'cloud', 'billing', 'github', 'inbox'].map(id => [id, full('2026-11-01')])), TODAY));
  assert.equal(done.state, 'done'); assert.match(done.detail, /next review is due by 2027-01-30/);
  const gap = accessCheck(accessSummary({ github: { ...full('2026-11-01'), codes: 'no' } }, TODAY));
  assert.match(gap.detail, /1 account has a gap/);
  const base = checkup({ emailVerified: true, providers: ['google.com'], passkeys: [] });
  const withAccess = checkup({ emailVerified: true, providers: ['google.com'], passkeys: [], access: done });
  assert.equal(withAccess.total, base.total + 1); assert.equal(withAccess.done, base.done + 1);
  assert.equal(withAccess.checks.at(-1).id, 'idle', 'the information line stays last');
  assert.equal(withAccess.checks.at(-2).id, 'access');
});

test('copied summary has names and answers only, never the inbox address', () => {
  const text = accessSummaryText({ inbox: full('2026-11-01'), transak: { unused: true, at: 1 } }, TODAY);
  assert.match(text, /^FYNX owner access review, 2026-11-10/);
  assert.match(text, /- \[x\] Team inbox: Reviewed 2026-11-01 · next by 2027-01-30 \(2-step on, recovery codes stored, 1 person with access\)/);
  assert.match(text, /- \[ \] GitHub \(EA-LA\): Not reviewed yet/);
  assert.match(text, /- \[i\] Transak partner dashboard: not used yet/);
  assert.match(text, /- \[i\] CoinGecko API: not reviewed \(optional until used\)/);
  assert.doesNotMatch(text, /@/);
});

test('the review travels in the test report and comes back the same', () => {
  const review = { github: full('2026-11-01', Date.parse('2026-11-01T10:00:00.123Z')), cloud: { twoStep: 'unsure', codes: '', people: null, reviewed: '', unused: false, at: Date.parse('2026-11-02T08:00:00Z') }, transak: { twoStep: '', codes: '', people: null, reviewed: '', unused: true, at: Date.parse('2026-11-03T09:00:00Z') } };
  const lines = accessReportLines(review, TODAY);
  assert.equal(lines[0], '## Owner access review');
  assert.ok(lines.includes('- github · 2-step on · codes stored · 1 person · reviewed 2026-11-01 · changed 2026-11-01 10:00:00.123 UTC'));
  assert.ok(lines.includes('- cloud · 2-step not sure · codes not checked · people not counted · not reviewed · changed 2026-11-02 08:00:00.000 UTC'));
  assert.ok(lines.includes('- transak · not used yet · changed 2026-11-03 09:00:00.000 UTC'));
  for (const line of lines) assert.equal(looksSecret(line), false, line);
  const text = ['# FYNX Wallet launch test report', '', ...lines, '## Something else', '- github · 2-step off · codes missing · 1 person · reviewed 2026-11-09 · changed 2026-11-09 10:00:00.000 UTC'].join('\n');
  const parsed = parseAccessReport(text, TODAY);
  assert.equal(parsed.count, 3); assert.equal(parsed.unknown, 0);
  assert.deepEqual(parsed.review, cleanReview(review, TODAY), 'lines outside the section are ignored');
  assert.deepEqual(accessReportLines({}, TODAY), []);
});

test('parseAccessReport refuses free text, unknown services and future dates', () => {
  const text = ['## Owner access review',
    '- github · 2-step on · codes stored · 1 person · reviewed 2026-11-01 · changed 2026-11-01 10:00:00.000 UTC · password hunter2',
    '- bank · 2-step on · codes stored · 1 person · reviewed 2026-11-01 · changed 2026-11-01 10:00:00.000 UTC',
    '- google · 2-step on · codes stored · 2 people · reviewed 2027-05-01 · changed 2026-11-01 10:00:00.000 UTC',
    '- inbox · 2-step on · codes stored · 2 people · reviewed 2026-10-01 · changed 2026-10-01 10:00:00.000 UTC',
    '- inbox · 2-step off · codes stored · 2 people · reviewed 2026-10-05 · changed 2026-10-05 10:00:00.000 UTC'].join('\n');
  const p = parseAccessReport(text, TODAY);
  assert.equal(p.unknown, 2);
  assert.equal(p.review.google.reviewed, '', 'a future review date is dropped, not guessed');
  assert.equal(p.review.inbox.twoStep, 'no', 'the later line for the same service wins');
});

test('mergeAccessReviews: the later change wins per service', () => {
  const mine = { github: full('2026-11-01', 100), cloud: full('2026-10-01', 500), google: full('2026-09-01', 50) };
  const theirs = { github: { ...full('2026-11-05', 200), people: 2 }, cloud: full('2026-10-02', 400), google: full('2026-09-01', 50), inbox: full('2026-11-02', 10) };
  const m = mergeAccessReviews(mine, theirs, TODAY);
  assert.deepEqual(m.added, ['inbox']); assert.deepEqual(m.updated, ['github']); assert.deepEqual(m.kept, ['cloud']); assert.deepEqual(m.same, ['google']);
  assert.equal(m.review.github.people, 2); assert.equal(m.review.cloud.reviewed, '2026-10-01');
});

test('owner page has the access review card, and the workspace wires it to the checkup, next steps and report', async () => {
  const html = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
  for (const id of ['access-review', 'ar-score', 'ar-summary', 'ar-list', 'ar-copy', 'ar-status']) assert.match(html, new RegExp(`id="${id}"`), id);
  const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /accessReportLines\(accessReview/);
  assert.match(app, /parseAccessReport\(text/);
  assert.match(app, /access: accessCheck\(accessSummary\(accessReview/);
  assert.match(app, /Access review · /);
});
