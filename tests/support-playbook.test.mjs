import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITUATIONS, URGENCY, LINKS, NEVER_ASK, supportContext, replyTarget, replyText, matchMessage, looksLikeSecret, playbookMarkdown, findSituation, MAX_MESSAGE } from '../wallet-src/support-playbook.js';
import { DECISIONS, decisionKey } from '../wallet-src/owner-decisions.js';

const decided = {
  'pilot/support': { who: 'Elham, backup co-founder', reply: 'same', hours: 'always' },
  'pilot/limits': { people: '50', states: 'Texas, Florida', perTx: '100', perMonth: '500' },
  'operations/inbox': { primary: 'Elham', backup: 'co-founder', cadence: 'daily' },
};
const ids = r => r.matches.map(m => m.situation.id);
const HASH = `0x${'ab12'.repeat(16)}`;
const PHRASE = 'abandon ability able about above absent absorb abstract absurd abuse access accident';

test('every situation is complete and uses only decisions and links that exist', () => {
  const keys = new Set(DECISIONS.map(decisionKey));
  for (const m of supportContext({}).missing) assert.ok(keys.has(m.key), m.key);
  assert.equal(new Set(SITUATIONS.map(s => s.id)).size, SITUATIONS.length);
  for (const s of SITUATIONS) {
    assert.ok(URGENCY[s.urgency], s.id); assert.ok(s.title && s.words.length && s.check.length, s.id);
    for (const a of s.actions) {
      assert.ok(['doc', 'lookup', 'queue', 'reconcile', 'mainnet', 'privacy'].includes(a.kind), `${s.id} ${a.kind}`);
      if (a.kind === 'doc') assert.ok(LINKS[a.link], `${s.id} ${a.link}`);
    }
  }
  // The linked documents and their sections exist in the repository.
  for (const url of Object.values(LINKS)) {
    const [path, anchor] = url.split('/blob/main/')[1].split('#');
    const doc = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    const slugs = [...doc.matchAll(/^#+\s+(.+)$/gm)].map(m => m[1].toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/\s+/g, '-'));
    assert.ok(slugs.includes(anchor), `${path}#${anchor}`);
  }
});

test('the context reports what is still undecided, and fills in decisions when made', () => {
  const none = supportContext({});
  assert.deepEqual(none.missing.map(m => m.key), ['pilot/support', 'pilot/limits', 'operations/inbox']);
  assert.match(replyTarget(findSituation('pending'), none), /not decided/);
  const ctx = supportContext(decided);
  assert.equal(ctx.missing.length, 0);
  assert.equal(ctx.perTx, 'US$100'); assert.equal(ctx.perMonth, 'US$500'); assert.equal(ctx.reply, 'the same business day');
  assert.match(replyTarget(findSituation('secret-shared'), ctx), /within 1 hour, any time/);
  assert.match(replyTarget(findSituation('secret-shared'), supportContext({ 'pilot/support': { ...decided['pilot/support'], hours: 'business' } })), /during support hours/);
  assert.match(replyTarget(findSituation('pending'), ctx), /same business day/);
  assert.match(replyText(findSituation('over-limit'), ctx), /US\$100 per transfer and US\$500 per person per month/);
  assert.match(replyText(findSituation('availability'), ctx), /Texas, Florida/);
  assert.doesNotMatch(replyText(findSituation('over-limit'), none), /US\$|undefined/);
});

test('no reply ever asks for a secret or promises a reversal', () => {
  const ctx = supportContext(decided);
  for (const s of SITUATIONS) {
    const text = replyText(s, ctx);
    assert.doesNotMatch(text, /undefined|null|NaN/, s.id);
    assert.match(text, /FYNX will never ask for your recovery phrase/, s.id);
    assert.doesNotMatch(text, /(?<!never )(?<!not )(send|share|tell|give) us your (recovery phrase|private key|password|seed)/i, s.id);
    assert.doesNotMatch(text, /we (will|can) (reverse|refund|recover|freeze)/i, s.id);
  }
  assert.ok(NEVER_ASK.some(n => /recovery phrase/.test(n)));
});

test('the finder suggests the right answer for typical messages', () => {
  assert.deepEqual(matchMessage('').matches, []); assert.ok(matchMessage('   ').empty);
  assert.equal(ids(matchMessage('My transfer has been pending for two hours'))[0], 'pending');
  assert.equal(ids(matchMessage('Someone on Telegram says they are FYNX support and wants me to verify my wallet'))[0], 'impersonation');
  assert.equal(ids(matchMessage("I didn't send this, my wallet was drained overnight"))[0], 'unknown-outgoing');
  assert.equal(ids(matchMessage('My friend says it has not arrived'))[0], 'not-arrived');
  assert.equal(ids(matchMessage('I sent USDC to the wrong address by mistake, can you reverse it?'))[0], 'wrong-address');
  assert.equal(ids(matchMessage('I lost my phone and cannot log in'))[0], 'sign-in');
  assert.equal(ids(matchMessage('Please delete my data'))[0], 'privacy');
  assert.equal(ids(matchMessage('When will FYNX be available in my country?'))[0], 'availability');
  assert.ok(matchMessage('Hello there').matches.length === 0);
  // Ties go to the more urgent situation; at most three answers.
  const r = matchMessage('pending transfer, drained wallet, wrong address, fee, login, delete my data, when launch');
  assert.ok(r.matches.length <= 3);
});

test('transaction IDs and addresses are picked out of the message', () => {
  const addr = `0x${'Cd'.repeat(20)}`;
  const r = matchMessage(`Here is the ID ${HASH} from wallet ${addr}`);
  assert.deepEqual(r.hashes, [HASH]); assert.deepEqual(r.addresses, [addr.toLowerCase()]);
  assert.equal(r.secret, false, 'a transaction ID is not a private key');
  assert.equal(ids(r)[0], 'pending', 'a bare transaction ID suggests the pending answer');
});

test('a pasted recovery phrase or private key is flagged and answered first', () => {
  assert.equal(looksLikeSecret(PHRASE), true);
  assert.equal(looksLikeSecret(`1. ${PHRASE.split(' ').join(' 2. ')}`), true, 'numbered lists still count');
  assert.equal(looksLikeSecret('abcd'.repeat(16)), true, 'a bare 64-character hex key');
  assert.equal(looksLikeSecret(`my private key is ${HASH}`), true);
  assert.equal(looksLikeSecret(`my transaction is ${HASH}`), false);
  assert.equal(looksLikeSecret('please help my transfer today still shows pending since this morning thank you very much for your help with that'), false);
  const r = matchMessage(`Is this right? ${PHRASE}`);
  assert.equal(r.secret, true); assert.equal(ids(r)[0], 'secret-shared');
  assert.equal(matchMessage('x'.repeat(MAX_MESSAGE * 2)).matches.length, 0);
});

test('the playbook document lists every situation, the rules and the decisions, without customer data', () => {
  const doc = playbookMarkdown(supportContext(decided), { date: new Date('2026-11-14T12:00:00Z') });
  assert.match(doc, /^# FYNX pilot support playbook/); assert.match(doc, /Prepared 2026-11-14/);
  for (const s of SITUATIONS) assert.ok(doc.includes(s.title), s.id);
  assert.match(doc, /Never ask for: recovery phrase/); assert.match(doc, /Rollback trigger:/);
  assert.match(doc, /Elham, backup co-founder/); assert.doesNotMatch(doc, /not decided yet|Still to decide/);
  const security = doc.indexOf('## Security:'), question = doc.indexOf('## Question:');
  assert.ok(security > 0 && security < question, 'security first');
  const blank = playbookMarkdown(supportContext({}));
  assert.match(blank, /Still to decide in Launch readiness/); assert.match(blank, /_not decided yet_/);
  const odd = playbookMarkdown(supportContext({ 'pilot/support': { who: 'a|b *c*', reply: 'same', hours: 'always' } }));
  assert.match(odd, /a\\\|b \\\*c\\\*/, 'Markdown in typed answers is escaped');
});

test('the owner page has the playbook box and the finder never stores the pasted message', () => {
  const html = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  for (const id of ['support-playbook', 'spb-message', 'spb-find', 'spb-matches', 'spb-list', 'spb-copy', 'spb-download']) assert.ok(html.includes(`id="${id}"`), id);
  const app = readFileSync(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  const block = app.slice(app.indexOf('// Pilot support playbook'), app.indexOf('function renderLaunchFilters'));
  assert.ok(block.length > 1000);
  assert.doesNotMatch(block, /localStorage|sessionStorage|indexedDB|fetch\(|api\(/);
  assert.match(app, /clearMainnet\(\); clearSupportFinder\(\);/, 'cleared on sign-out');
});
