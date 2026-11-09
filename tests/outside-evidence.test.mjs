import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EVIDENCE, evidenceItems, requestsWithoutEvidence, cleanEvidence, setItem, evidenceState, partyEvidence, partyEvidenceLine, readyToShare, evidenceSummary, evidenceReportLines, parseEvidenceReport, mergeEvidence, isEvidenceLine } from '../wallet-src/outside-evidence.js';
import { requestId, isRequestId, isRequestLine, parseRequestReport } from '../wallet-src/outside-requests.js';
import { outsideBrief } from '../wallet-src/outside-handoff.js';
import { parseReport, reportMarkdown, looksSecret } from '../wallet-src/launch-tracker.js';

const plan = JSON.parse(await readFile(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const A = requestId('counsel', 'legal/analysis'), P = requestId('provider', 'fiat/approval'), D = requestId('data', 'assets/prices');
const T0 = Date.parse('2026-11-09T10:00:00Z');
const empty = { entries: {} };
// Every owner step passed, so the lawyer's first request can be asked now.
const allYou = Object.fromEntries(plan.items.flatMap(g => (g.steps || []).filter(st => st.by === 'you').map(st => [`${g.id}/${st.id}`, { result: 'pass', note: '', at: 1 }])));

test('every hand-off request has a "what came back" list with unique fixed-word item ids', () => {
  assert.deepEqual(requestsWithoutEvidence(), []);
  for (const [id, items] of Object.entries(EVIDENCE)) {
    assert.ok(isRequestId(id), `${id} is a real hand-off request`);
    assert.ok(items.length >= 1 && items.length <= 12, id);
    const ids = items.map(i => i.id);
    assert.equal(new Set(ids).size, ids.length, `${id} item ids are unique`);
    for (const i of items) { assert.match(i.id, /^[a-z0-9-]{1,30}$/); assert.ok(i.label.length > 5); }
  }
});

test('ticks: unknown requests and items refused, order follows the list, unticking everything leaves a cleared marker', () => {
  assert.match(setItem(empty, 'x|y/z', 'memo', true).error, /Unknown request/);
  assert.match(setItem(empty, A, 'nope', true).error, /Unknown piece/);
  let r = setItem(empty, A, 'privacy', true, { now: T0 });
  r = setItem(r.log, A, 'memo', true, { now: T0 + 1 });
  assert.deepEqual(r.log.entries[A], { got: ['memo', 'privacy'], changed: T0 + 1 }, 'kept in list order');
  assert.ok(setItem(r.log, A, 'memo', true).unchanged);
  r = setItem(r.log, A, 'memo', false, { now: T0 + 2 });
  r = setItem(r.log, A, 'privacy', false, { now: T0 + 3 });
  assert.deepEqual(r.log.entries[A], { got: [], changed: T0 + 3 });
  const cleaned = cleanEvidence({ entries: { [A]: { got: ['memo', 'junk', 'memo'], changed: 4 }, 'a|b/c': { got: ['x'] }, [D]: { got: [] } } });
  assert.deepEqual(cleaned, { entries: { [A]: { got: ['memo'], changed: 4 } } });
  assert.deepEqual(cleanEvidence(null), empty);
});

test('state: nothing yet / n of m with what is missing / everything in; party counts and line', () => {
  assert.equal(evidenceState(A, undefined).state, 'none');
  assert.match(evidenceState(A, undefined).label, /Nothing received yet \(5 to come back\)/);
  const part = evidenceState(A, { got: ['memo', 'licences'] });
  assert.equal(part.state, 'partial'); assert.equal(part.count, 2); assert.equal(part.missing.length, 3);
  assert.match(part.label, /^2 of 5 received · still missing: covers anti-money-laundering/);
  const all = evidenceState(D, { got: evidenceItems(D).map(i => i.id) });
  assert.equal(all.state, 'complete'); assert.equal(all.label, 'Everything is in (4 of 4)');
  const log = { entries: { [A]: { got: ['memo'], changed: 1 }, [requestId('counsel', 'legal/terms')]: { got: ['terms', 'privacy-notice', 'risk', 'approved-date'], changed: 1 } } };
  const s = partyEvidence(log, 'counsel', ['legal/analysis', 'legal/terms', 'international/country-review']);
  assert.deepEqual(s, { complete: 1, partial: 1, none: 1, items: 11, got: 5 });
  assert.equal(partyEvidenceLine(s), 'Evidence: 5 of 11 pieces (1 complete, 1 partly in)');
  assert.equal(partyEvidenceLine(partyEvidence(empty, 'counsel', ['legal/analysis'])), '');
});

test('ready to share: only complete lists whose step is still open', () => {
  const full = { got: evidenceItems(D).map(i => i.id), changed: 1 };
  const log = { entries: { [D]: full, [A]: { got: ['memo'], changed: 1 } } };
  assert.deepEqual(readyToShare(log, [D, A]).map(x => x.id), [D]);
  assert.deepEqual(readyToShare(log, [A]), [], 'a done step is not passed in as open, partial ones never show');
  assert.equal(readyToShare(log, [D])[0].party.id, 'data');
});

test('evidence summary: per party, ticked/unticked boxes, says ticks are not evidence; nothing ticked says so', () => {
  const rows = [{ id: A, title: 'Legal analysis' }, { id: D, title: 'Prices' }];
  assert.match(evidenceSummary(empty, rows), /Nothing has been ticked as received yet/);
  const md = evidenceSummary({ entries: { [A]: { got: ['memo'], changed: 1 } } }, rows, { date: new Date(T0) });
  assert.match(md, /Made 2026-11-09 10:00 UTC/);
  assert.match(md, /a tick alone is not evidence/);
  assert.match(md, /## Lawyer \(U\.S\. counsel\)/);
  assert.match(md, /### Legal analysis \(`legal\/analysis`\) — 1 of 5/);
  assert.match(md, /- \[x\] Written memo or email/);
  assert.match(md, /- \[ \] Covers privacy and complaint-handling duties/);
  assert.doesNotMatch(md, /Market-data provider/, 'parties with nothing ticked are left out');
});

test('brief: partial evidence thanks for what came and asks only for what is missing; complete stops asking', () => {
  const evidenceFor = got => ({ 'legal/analysis': evidenceState(A, { got }) });
  const partial = outsideBrief(plan, allYou, 'counsel', {}, { sent: { 'legal/analysis': { sent: '2026-11-01', answered: '2026-11-05' } }, evidence: evidenceFor(['memo', 'licences']) });
  assert.match(partial, /Received so far, thank you: written memo or email with the conclusions; covers federal \(FinCEN\)/);
  assert.match(partial, /Please send back \(still missing\): covers anti-money-laundering[^\n]*; covers privacy[^\n]*; lists what FYNX must do/);
  assert.match(partial, /1\. Please give us a written conclusion/);
  const complete = outsideBrief(plan, allYou, 'counsel', {}, { sent: { 'legal/analysis': { sent: '2026-11-01', answered: '2026-11-05' } }, evidence: evidenceFor(evidenceItems(A).map(i => i.id)) });
  assert.match(complete, /We have received everything we asked for on this request/);
  assert.doesNotMatch(complete, /Please give us a written conclusion/, 'no questions for a complete request');
  assert.doesNotMatch(complete, /points still needed to close this step/, 'no contradictory "still needed" line');
  const none = outsideBrief(plan, allYou, 'counsel', {}, {});
  assert.match(none, /Please send back: A written memo or email/);
  assert.doesNotMatch(none, /Received so far/);
});

test('report lines round-trip; strict parser; lines never trip the secret check or the request-date parser', () => {
  const log = { entries: { [A]: { got: ['memo', 'aml'], changed: T0 }, [P]: { got: [], changed: T0 + 60000 } } };
  const lines = evidenceReportLines(log);
  assert.equal(lines[0], '## Outside evidence received');
  assert.ok(lines.includes('- counsel · legal/analysis · got memo, aml · changed 2026-11-09 10:00 UTC'));
  assert.ok(lines.includes('- provider · fiat/approval · got nothing · changed 2026-11-09 10:01 UTC'));
  for (const l of lines.filter(x => x.startsWith('- '))) { assert.ok(isEvidenceLine(l)); assert.ok(!isRequestLine(l)); assert.ok(!looksSecret(l)); }
  const back = parseEvidenceReport(lines.join('\n'));
  assert.deepEqual(back, { log, unknown: 0 });
  const bad = ['## Outside evidence received', '- counsel · legal/analysis · got memo, forged', '- nobody · legal/analysis · got memo', '- counsel · legal/analysis · got memo; rm -rf', '- data · assets/prices · got plan', '- data · assets/prices · got licence'].join('\n');
  const parsed = parseEvidenceReport(bad);
  assert.equal(parsed.unknown, 4, 'unknown item, unknown party, bad text and a duplicate request are refused');
  assert.deepEqual(parsed.log.entries[D], { got: ['plan'], changed: 0 });
  assert.equal(Object.keys(parseEvidenceReport('- counsel · legal/analysis · got memo').log.entries).length, 0, 'only read inside the section');
  assert.deepEqual(evidenceReportLines(empty), []);
});

test('the section travels inside the launch test report without disturbing results or request dates', () => {
  const log = { entries: { [A]: { got: ['memo'], changed: T0 } } };
  const md = reportMarkdown(plan, {}, { appendix: evidenceReportLines(log) });
  const parsed = parseReport(md, plan);
  assert.ok(!parsed.secret);
  assert.deepEqual(parseEvidenceReport(md).log, log);
  assert.deepEqual(parseRequestReport(md).log, { entries: {} });
});

test('merge: new added, later change wins, same minute keeps this browser, clearing travels', () => {
  const local = { entries: { [A]: { got: ['memo'], changed: T0 }, [D]: { got: ['plan'], changed: T0 + 120000 } } };
  const incoming = { entries: {
    [A]: { got: ['memo', 'aml'], changed: T0 + 60000 },
    [D]: { got: [], changed: T0 + 60000 },
    [P]: { got: ['agreement'], changed: T0 },
    [requestId('counsel', 'legal/terms')]: { got: [], changed: T0 },
  } };
  const m = mergeEvidence(local, incoming);
  assert.deepEqual(m.added, [P], 'a cleared marker for an unknown request is not added');
  assert.deepEqual(m.updated, [A]);
  assert.deepEqual(m.kept, [D]);
  assert.deepEqual(m.log.entries[A].got, ['memo', 'aml']);
  const cleared = mergeEvidence(local, { entries: { [A]: { got: [], changed: T0 + 60000 } } });
  assert.deepEqual(cleared.log.entries[A], { got: [], changed: T0 + 60000 }, 'unticking on the other device travels');
  const same = mergeEvidence(local, { entries: { [A]: { got: ['memo', 'aml'], changed: T0 + 30000 } } });
  assert.deepEqual(same.kept, [A], 'same minute: this browser stays');
  assert.deepEqual(mergeEvidence(local, local).same.sort(), [A, D].sort());
});
