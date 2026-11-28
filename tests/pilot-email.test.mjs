import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { joinStates, draftEmail, draftHeadline, sendReadiness, emailFacts, cleanTermsUrl, cleanSignoff, cleanEmailSettings, SEND_AFTER } from '../wallet-src/pilot-email.js';
import { CONTACT } from '../wallet-src/waitlist-care.js';

const plan = JSON.parse(readFileSync(new URL('../wallet-src/launch-checklist.json', import.meta.url)));
const answers = {
  'pilot/limits': { people: '50', states: 'Texas, Florida', perTx: '100', perMonth: '500' },
  'pilot/support': { who: 'owner', reply: '24h', hours: 'business' },
  'wallet-recovery/decide': { model: 'connect' },
};
// Mark the steps an invitation waits for as finished, as the checklist JSON and the owner's records would.
const donePlan = JSON.parse(JSON.stringify(plan));
for (const g of donePlan.items) for (const s of g.steps) if (g.id === 'legal' && s.id === 'terms') s.done = true;
const doneRecords = { 'pilot/approve': { result: 'pass', at: Date.parse('2026-11-20T10:00:00Z') } };
const settings = { termsUrl: 'https://ea-la.github.io/FYNX-Wallet/terms.html', signoff: 'Elham, FYNX' };

test('nothing undecided: every fact is quoted from the decisions, no gap, the reply-by date follows the tracker', () => {
  const d = draftEmail('invite', { answers, plan: donePlan, records: doneRecords, settings, sentOn: '2026-12-01' });
  assert.equal(d.ready, true);
  assert.deepEqual(d.gaps, []); assert.deepEqual(d.blockers, []);
  assert.equal(d.subject, 'Your invitation to the FYNX Wallet pilot');
  assert.equal(d.replyBy, '2026-12-08');
  assert.match(d.body, /small first group of 50 people in Texas and Florida/);
  assert.match(d.body, /open to residents of Texas or Florida only/);
  assert.match(d.body, /limited to US\$100 each and US\$500 per person per month/);
  assert.match(d.body, /reply to this email by Tuesday, December 8, 2026/i);
  assert.match(d.body, /within 24 hours \(business hours, Monday to Friday\)/);
  assert.match(d.body, /MetaMask or a Ledger/);
  assert.match(d.body, /https:\/\/ea-la\.github\.io\/FYNX-Wallet\/terms\.html/);
  assert.match(d.body, /Elham, FYNX\nFYNX finance world inc\./);
  assert.ok(d.body.includes(CONTACT));
  assert.ok(!/\[/.test(d.body), 'no bracketed gap left');
  assert.match(d.text, /^Subject: Your invitation/);
  assert.match(draftHeadline(d), /^Ready to send.*2026-12-08/);
  // The reminder gives the 7 days the tracker waits before "No reply".
  const r = draftEmail('reminder', { answers, plan: donePlan, records: doneRecords, settings, sentOn: '2026-12-08' });
  assert.equal(r.replyBy, '2026-12-15'); assert.equal(r.ready, true);
  assert.match(r.subject, /^Reminder: your place/);
  assert.match(r.body, /only reminder we will send/);
});

test('until the terms are approved and the pilot is approved, the subject says DRAFT and the steps are named', () => {
  const d = draftEmail('invite', { answers, plan, records: {}, settings, sentOn: '2026-12-01' });
  assert.equal(d.ready, false);
  assert.match(d.subject, /^\[DRAFT – do not send\] /);
  assert.deepEqual(d.blockers.map(b => b.key), SEND_AFTER.map(s => s[0]));
  assert.match(draftHeadline(d), /Not ready to send: 2 launch steps still open/);
  // A failed approval is not an approval.
  assert.equal(sendReadiness(donePlan, { 'pilot/approve': { result: 'fail', at: 1 } }).ready, false);
  assert.equal(sendReadiness(donePlan, doneRecords).ready, true);
  assert.equal(sendReadiness(null, {}).ready, false, 'no plan: never ready');
});

test('undecided facts become listed [gaps], never invented values', () => {
  const d = draftEmail('invite', { answers: {}, plan: donePlan, records: doneRecords, settings: {}, sentOn: '' });
  assert.equal(d.ready, false);
  const texts = d.gaps.map(g => g.text);
  for (const t of ['number of people', 'pilot states', 'limit per transfer', 'limit per person per month', 'first reply time', 'support hours', 'how customers get a wallet: not decided yet', 'link to the approved customer terms and risk disclosures', 'reply-by date: pick the day you send it']) assert.ok(texts.includes(t), t);
  assert.equal(new Set(texts).size, texts.length, 'each gap listed once');
  for (const t of texts) assert.ok(d.body.includes(`[${t}]`), `${t} shown in the body`);
  assert.ok(!/US\$\d/.test(d.body), 'no amount without a decision');
  assert.equal(d.gaps.find(g => g.text === 'pilot states').key, 'pilot/limits');
  assert.match(draftHeadline(d), /9 gaps to fill/);
  assert.match(draftEmail('invite', { answers: { 'wallet-recovery/decide': { model: 'create' } } }).body, /\[how pilot members get their wallet: describe it once/);
  assert.throws(() => draftEmail('welcome'), /Unknown email kind/);
});

test('the drafts never carry a recipient address, a secret or a promise FYNX cannot keep', () => {
  for (const kind of ['invite', 'reminder']) {
    const d = draftEmail(kind, { answers, plan: donePlan, records: doneRecords, settings, sentOn: '2026-12-01' });
    const emails = d.text.match(/[\w.+-]+@[\w-]+(\.[a-z]+)+/gi) || [];
    assert.deepEqual([...new Set(emails)], [CONTACT], 'only the team inbox appears');
    assert.match(d.body, /never ask for your recovery phrase, private key/);
    assert.ok(!/guarantee|risk-free|profit/i.test(d.body));
  }
});

test('settings: only an https page link and a short name are kept', () => {
  assert.equal(cleanTermsUrl('https://fynx.example/terms').value, 'https://fynx.example/terms');
  assert.match(cleanTermsUrl('http://fynx.example/terms').error, /https/);
  assert.match(cleanTermsUrl('fynx terms').error, /full link/);
  assert.match(cleanTermsUrl('https://user:pw@fynx.example/terms').error, /sign-in/);
  assert.match(cleanTermsUrl('https://fynx.example/terms?token=abc').error, /key or token/);
  assert.match(cleanTermsUrl(`https://fynx.example/${'a'.repeat(200)}`).error, /at most 200/);
  assert.equal(cleanTermsUrl('').value, '');
  assert.equal(cleanSignoff('  Elham  ').value, 'Elham');
  assert.match(cleanSignoff('elham@gmail.com').error, /no email/);
  assert.match(cleanSignoff('x'.repeat(61)).error, /60/);
  assert.deepEqual(cleanEmailSettings({ termsUrl: 'javascript:alert(1)', signoff: '<b>Team</b>', extra: 1 }), { signoff: 'bTeam/b' });
  assert.deepEqual(cleanEmailSettings('nope'), {});
  assert.deepEqual(emailFacts(answers), { people: 50, states: 'Texas, Florida', perTx: 'US$100', perMonth: 'US$500', reply: '24 hours', hours: 'business hours, Monday to Friday', wallet: 'connect' });
});

test('Find in workspace: "invitation email" opens the Pilot invite list part', async () => {
  const { buildIndex, search } = await import('../wallet-src/workspace-search.js');
  const index = buildIndex({ plan });
  assert.equal(search(index, 'invitation email').results[0].id, 'part:registrations:pilot');
  const html = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  const box = html.slice(html.indexOf('id="wl-pilot-box"'));
  assert.ok(box.indexOf('id="wl-mail-box"') > 0 && box.indexOf('id="wl-mail-box"') < box.indexOf('id="wl-load-all"'), 'the email panel sits inside the Pilot invite list part');
  for (const id of ['wl-mail-kind', 'wl-mail-terms', 'wl-mail-sign', 'wl-mail-checks', 'wl-mail-text', 'wl-mail-copy', 'wl-mail-copy-subject', 'wl-mail-status']) assert.ok(html.includes(`id="${id}"`), id);
});

test('state lists read naturally and odd input stays as typed', () => {
  assert.equal(joinStates('Texas, Florida, Ohio'), 'Texas, Florida and Ohio');
  assert.equal(joinStates('Texas and Florida', 'or'), 'Texas or Florida');
  assert.equal(joinStates('Texas'), 'Texas');
  assert.equal(joinStates(' New York ; New Jersey '), 'New York and New Jersey');
});
