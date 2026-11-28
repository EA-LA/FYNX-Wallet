import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  fingerprint, markInvited, markFollowedUp, markAnswer, cleanOutreach,
  outreachReportLines, parseOutreachReport, mergeOutreach, OUTREACH_SECTION,
} from '../wallet-src/pilot-outreach.js';
import { reportMarkdown, parseReport } from '../wallet-src/launch-tracker.js';

const plan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url), 'utf8'));
const empty = { entries: {} };
const step = (r, fn) => { assert.ok(!r.error, r.error); return fn ? fn(r.log) : r.log; };

function sample() {
  let log = step(markInvited(empty, 'anna@gmail.com', '2026-11-20'));
  log = step(markFollowedUp(log, 'anna@gmail.com', '2026-11-27'));
  log = step(markAnswer(log, 'anna@gmail.com', 'accepted', '2026-11-28'));
  log = step(markInvited(log, 'ben@outlook.com', '2026-11-21'));
  log = step(markInvited(log, 'cara@proton.me', '2026-11-22'));
  log = step(markAnswer(log, 'cara@proton.me', 'declined', '2026-11-23'));
  return log;
}

test('report lines carry fingerprints, states and dates only, and read back exactly (without hints)', () => {
  const log = sample();
  const lines = outreachReportLines(log);
  assert.equal(lines[0], `## ${OUTREACH_SECTION}`);
  const text = lines.join('\n');
  assert.ok(!/anna|ben@|cara|gmail|outlook|proton|•/.test(text), 'no address, name, domain or masked hint travels');
  assert.ok(lines.includes(`- ${fingerprint('anna@gmail.com')} · accepted · invited 2026-11-20 · reminder 2026-11-27 · answered 2026-11-28`));
  assert.ok(lines.includes(`- ${fingerprint('ben@outlook.com')} · invited · invited 2026-11-21`));
  assert.deepEqual(outreachReportLines(empty), [], 'no invitations adds nothing to the report');
  // Inside a whole test report, next to other sections.
  const report = reportMarkdown(plan, {}, { date: new Date('2026-11-28T12:00:00Z'), appendix: ['## Something else', '', `- ${fingerprint('dan@gmail.com')} · invited · invited 2026-11-01`, '', ...lines] });
  const back = parseOutreachReport(report);
  assert.equal(back.count, 3); assert.equal(back.unknown, 0);
  const withoutHints = cleanOutreach({ entries: Object.fromEntries(Object.entries(log.entries).map(([fp, e]) => [fp, { ...e, hint: '' }])) });
  assert.deepEqual(back.log, withoutHints);
  assert.equal(parseReport(report, plan).secret, false, 'fingerprints do not look like a key to the report reader');
});

test('the parser refuses what it does not understand instead of guessing', () => {
  const fp = fingerprint('anna@gmail.com');
  const text = [`## ${OUTREACH_SECTION}`, '',
    `- ${fp} · invited · invited 2026-11-20`,
    `- ${fp} · accepted · invited 2026-11-20 · answered 2026-11-21`, // same person twice: first line wins
    `- ${fingerprint('b@x.com')} · maybe · invited 2026-11-20`,
    `- ${fingerprint('c@x.com')} · invited · invited 2026-02-30`,
    `- ${fingerprint('d@x.com')} · accepted · invited 2026-11-20 · answered 2026-11-19`,
    `- ${fingerprint('e@x.com')} · invited · invited 2026-11-20 · answered 2026-11-21`,
    `- ${fingerprint('f@x.com')} · followed · invited 2026-11-20`,
    '- anna@gmail.com · invited · invited 2026-11-20',
    `- ${fingerprint('g@x.com')} · invited · on 2026-11-20`,
    '## Next section', `- ${fingerprint('h@x.com')} · invited · invited 2026-11-20`].join('\n');
  const r = parseOutreachReport(text);
  assert.deepEqual(Object.keys(r.log.entries), [fp]);
  assert.equal(r.log.entries[fp].state, 'invited');
  assert.equal(r.unknown, 8);
  assert.deepEqual(parseOutreachReport('nothing here'), { log: { entries: {} }, count: 0, unknown: 0 });
});

test('merging: new people are added, further-along entries win, this browser keeps its hints and same-stage dates', () => {
  // Phone: Anna invited; Ben invited then reminded; Cara accepted.
  let phone = step(markInvited(empty, 'anna@gmail.com', '2026-11-20'));
  phone = step(markInvited(phone, 'ben@outlook.com', '2026-11-20'));
  phone = step(markFollowedUp(phone, 'ben@outlook.com', '2026-11-27'));
  phone = step(markInvited(phone, 'cara@proton.me', '2026-11-21'));
  phone = step(markAnswer(phone, 'cara@proton.me', 'accepted', '2026-11-22'));
  // Desktop: Ben only invited; Cara declined on another day (same stage); Dan only here.
  let desk = step(markInvited(empty, 'ben@outlook.com', '2026-11-20'));
  desk = step(markInvited(desk, 'cara@proton.me', '2026-11-21'));
  desk = step(markAnswer(desk, 'cara@proton.me', 'declined', '2026-11-23'));
  desk = step(markInvited(desk, 'dan@gmail.com', '2026-11-24'));
  const incoming = parseOutreachReport(outreachReportLines(phone).join('\n')).log;
  const m = mergeOutreach(desk, incoming);
  const [anna, ben, cara, dan] = ['anna@gmail.com', 'ben@outlook.com', 'cara@proton.me', 'dan@gmail.com'].map(fingerprint);
  assert.deepEqual(m.added, [anna]);
  assert.deepEqual(m.updated, [ben]);
  assert.deepEqual(m.kept, [cara]);
  assert.equal(m.changes, 2);
  assert.deepEqual(m.log.entries[anna], { hint: '', state: 'invited', invitedOn: '2026-11-20' }, 'a person new here has no hint until the waitlist is loaded');
  assert.deepEqual(m.log.entries[ben], { hint: 'b•••@outlook.com', state: 'followed', invitedOn: '2026-11-20', followedOn: '2026-11-27' }, 'the reminder comes in, the hint stays');
  assert.equal(m.log.entries[cara].state, 'declined', 'at the same stage this browser’s answer stays');
  assert.equal(m.log.entries[dan].state, 'invited', 'people only on this device stay');
  // Bringing the same report in twice changes nothing.
  const again = mergeOutreach(m.log, incoming);
  assert.equal(again.changes, 0); assert.deepEqual(again.log, m.log);
  // A device that is further along is never moved back.
  const back = mergeOutreach(phone, parseOutreachReport(outreachReportLines(desk).join('\n')).log);
  assert.equal(back.log.entries[ben].state, 'followed');
  assert.deepEqual(back.updated, []);
});

test('the workspace sends invitations in the test report and offers them on import', () => {
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /\.\.\.outreachReportLines\(outreachLog\)\] \}\);/);
  assert.match(app, /parseOutreachReport\(text\)/);
  assert.match(app, /mergeOutreach\(outreachLog, ouIn\.log\)/);
  assert.match(app, /if \(oui\.changes\) \{ outreachLog = oui\.log; saveOutreach\(\); renderOutreach\(\); \}/);
  const html = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  assert.match(html, /your pilot invitations from the Waitlist tab \(inbox fingerprints, states and dates only; no email addresses\)/);
});
