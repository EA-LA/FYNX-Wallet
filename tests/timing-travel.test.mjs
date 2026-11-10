import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseReport, reportMarkdown } from '../wallet-src/launch-tracker.js';
import { TIMING_SECTION, KEEP_PER_TEST, timingReportLines, parseTimingReport, mergeTimings, measuredTimes } from '../wallet-src/test-timing.js';
import { parsePrivacyReport } from '../wallet-src/privacy-requests.js';
import { parseRegisterReport } from '../wallet-src/pilot-register.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const T0 = Date.UTC(2026, 10, 10, 9, 0, 12, 345), MIN = 60000;
const log = {
  'identity/passkey-add': [{ min: 7, at: T0 + 30 * MIN }, { min: 9, at: T0 }],
  'identity/passkey-signin': [{ min: 4, at: T0 + 40 * MIN + 1 }],
};

test('measured times round-trip through the report section exactly (milliseconds kept)', () => {
  const lines = timingReportLines(log, plan);
  assert.equal(lines[0], `## ${TIMING_SECTION}`);
  assert.ok(lines.some(l => l.startsWith('- identity/passkey-add · 9 min · 2026-11-10 09:00:12.345 UTC · ')));
  const parsed = parseTimingReport(lines.join('\n'), plan);
  assert.deepEqual(parsed.log, log);
  assert.equal(parsed.count, 3);
  assert.equal(parsed.unknown, 0);
  assert.equal(parsed.leftOut, 0);
  assert.deepEqual(timingReportLines({}, plan), []);
});

test('the section rides in the full test report without confusing the other readers', () => {
  const text = reportMarkdown(plan, {}, { browser: 'test', appendix: timingReportLines(log, plan) });
  const results = parseReport(text, plan);
  assert.equal(results.secret, false);
  assert.deepEqual(results.records, {});
  assert.equal(parsePrivacyReport(text).log.entries.length, 0);
  assert.equal(parseRegisterReport(text).register.entries.length, 0);
  assert.deepEqual(parseTimingReport(text, plan).log, log);
});

test('bad lines, unknown steps and impossible minutes are counted and left out, outside lines ignored', () => {
  const text = [
    '- identity/passkey-add · 5 min · 2026-11-10 08:00:00.000 UTC · outside the section, ignored',
    `## ${TIMING_SECTION}`,
    '- identity/passkey-add · 6 min · 2026-11-10 08:00:00.000 UTC · ok',
    '- identity/passkey-add · 0 min · 2026-11-10 08:01:00.000 UTC',
    '- nowhere/missing · 6 min · 2026-11-10 08:02:00.000 UTC',
    '- identity/passkey-add · six min · 2026-11-10',
    '- identity/passkey-add · 6 min · 2026-11-10 08:00:00.000 UTC · repeat',
    '## Something else',
    '- identity/passkey-add · 8 min · 2026-11-10 08:03:00.000 UTC',
  ].join('\n');
  const p = parseTimingReport(text, plan);
  assert.deepEqual(p.log, { 'identity/passkey-add': [{ min: 6, at: Date.UTC(2026, 10, 10, 8) }] });
  assert.equal(p.unknown, 1);
  assert.equal(p.leftOut, 3);
});

test('merging adds new measurements once and keeps the newest per test', () => {
  const incoming = { 'identity/passkey-add': [{ min: 11, at: T0 + 60 * MIN }, { min: 9, at: T0 }], 'identity/passkey-remove': [{ min: 3, at: T0 + 5 * MIN }] };
  const m = mergeTimings(log, incoming, plan);
  assert.equal(m.added, 2);
  assert.equal(m.same, 1);
  assert.equal(m.older, 0);
  assert.deepEqual(m.tests.sort(), ['identity/passkey-add', 'identity/passkey-remove']);
  assert.deepEqual(m.log['identity/passkey-add'].map(t => t.min), [11, 7, 9]);
  assert.equal(measuredTimes(m.log)['identity/passkey-add'], 9);
  // Bringing the same report in again changes nothing.
  const again = mergeTimings(m.log, incoming, plan);
  assert.equal(again.added, 0);
  assert.deepEqual(again.tests, []);
  assert.deepEqual(again.log, m.log);
});

test('measurements older than the newest kept per test are counted as older, not added', () => {
  const full = { 'identity/passkey-add': Array.from({ length: KEEP_PER_TEST }, (_, i) => ({ min: 5 + i, at: T0 + (i + 10) * MIN })) };
  const m = mergeTimings(full, { 'identity/passkey-add': [{ min: 30, at: T0 }] }, plan);
  assert.equal(m.added, 0);
  assert.equal(m.older, 1);
  assert.equal(m.log['identity/passkey-add'].length, KEEP_PER_TEST);
});
