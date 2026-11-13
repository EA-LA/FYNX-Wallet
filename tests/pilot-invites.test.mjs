import test from 'node:test';
import assert from 'node:assert/strict';
import { addressFlags } from '../wallet-src/waitlist-care.js';
import { pilotList, inviteCSV, INVITE_COLUMNS, cleanSize, cleanCode, drawKey, decidedPilot, openStopRequests, pilotSummary, headline } from '../wallet-src/pilot-invites.js';

const now = Date.parse('2026-11-13T12:00:00Z'), DAY = 86400000;
const rec = (email, daysAgo, extra = {}) => ({ id: email, email, createdAt: daysAgo === null ? null : new Date(now - daysAgo * DAY).toISOString(), status: 'waiting', consent: true, expiresAt: new Date(now + 200 * DAY).toISOString(), ...extra });
const records = [
  rec('anna@gmail.com', 30), rec('a.n.n.a+wallet@gmail.com', 10), // same inbox, later sign-up left out
  rec('ben@outlook.com', 20), rec('cara@yahoo.com', 5, { expiresAt: new Date(now + 12 * DAY).toISOString() }),
  rec('dan@gmial.com', 25), rec('eve@mailinator.com', 24), rec('info@company.com', 23),
  rec('fay@proton.me', 22, { consent: false }), rec('gus@icloud.com', 21, { expiresAt: new Date(now - DAY).toISOString() }),
  rec('hal@aol.com', 19, { status: 'removed' }), rec('owner@example.com', 40), rec('ivy@gmail.com', null),
];
const flags = addressFlags(records, { now });

test('earliest sign-ups first; test, consent, retention, status, typo, throwaway, shared and duplicate inboxes left out', () => {
  const r = pilotList(records, flags, { size: 2, now, total: 12 });
  assert.equal(r.eligible, 4);
  assert.deepEqual(r.invited.map(x => x.email), ['anna@gmail.com', 'ben@outlook.com']);
  assert.deepEqual(r.reserve.map(x => x.email), ['cara@yahoo.com', 'ivy@gmail.com']); // no sign-up time goes last
  assert.deepEqual(r.invited.map(x => [x.order, x.group]), [[1, 'Invite'], [2, 'Invite']]);
  assert.equal(r.reserve[0].order, 3); assert.match(r.reserve[0].note, /Retention ends 2026-11-25/); assert.match(r.reserve[1].note, /No sign-up time/);
  assert.deepEqual(Object.fromEntries(r.excluded.map(([k, , n]) => [k, n])), { test: 1, consent: 1, expired: 1, status: 1, typo: 1, disposable: 1, role: 1, duplicate: 1 });
  assert.equal(r.shortBy, 0); assert.ok(r.complete);
});

test('shared mailboxes can be included; short of the wanted size is reported', () => {
  const r = pilotList(records, flags, { size: 10, includeShared: true, now });
  assert.equal(r.eligible, 5); assert.equal(r.invited.length, 5); assert.equal(r.shortBy, 5); assert.equal(r.reserve.length, 0);
  assert.ok(r.invited.some(x => x.email === 'info@company.com'));
  assert.match(headline(r), /5 people to invite, from 5 eligible sign-ups: 5 short of the 10 you want/);
});

test('fair draw is repeatable for the same code, differs between codes, and keeps one invite per inbox', () => {
  const many = Array.from({ length: 40 }, (_, i) => rec(`person${i}@gmail.com`, 40 - i));
  const f = addressFlags(many, { now });
  const a = pilotList(many, f, { size: 10, order: 'draw', code: 'nov-13', now }), b = pilotList([...many].reverse(), f, { size: 10, order: 'draw', code: 'nov-13', now });
  assert.deepEqual(a.invited.map(x => x.email), b.invited.map(x => x.email));
  const c = pilotList(many, f, { size: 10, order: 'draw', code: 'other', now });
  assert.notDeepEqual(a.invited.map(x => x.email), c.invited.map(x => x.email));
  assert.notDeepEqual(a.invited.map(x => x.email), pilotList(many, f, { size: 10, now }).invited.map(x => x.email));
  assert.equal(a.reserve.length, 5); assert.equal(a.code, 'nov-13');
  assert.equal(drawKey('x', 'A.B@gmail.com'), drawKey('x', 'ab+tag@gmail.com'));
  const dup = pilotList(records, flags, { size: 50, order: 'draw', code: 'z', now });
  assert.equal(dup.invited.filter(x => x.email.includes('n.n.a') || x.email === 'anna@gmail.com').map(x => x.email).join(), 'anna@gmail.com');
});

test('size and code are cleaned; a missing size falls back to 50', () => {
  assert.equal(cleanSize('25'), 25); assert.equal(cleanSize(' 7 '), 7);
  for (const bad of ['0', '-3', '2.5', 'abc', '', null, '100001']) assert.equal(cleanSize(bad), null, String(bad));
  assert.equal(cleanCode('  Draw <b>13</b> nov@x.com  '), 'Draw b13b novxcom');
  assert.equal(cleanCode('x'.repeat(60)).length, 40);
  assert.equal(pilotList(records, flags, { size: 'lots', now }).size, 50);
  assert.equal(pilotList(records, flags, { order: 'draw', code: '!!!', now }).code, 'fynx');
});

test('decision worksheet size and states are read; open removal and no-contact requests are counted', () => {
  assert.deepEqual(decidedPilot({ 'pilot/limits': { people: '30', states: 'Texas, Florida' } }), { size: 30, states: 'Texas, Florida' });
  assert.deepEqual(decidedPilot({}), { size: null, states: '' });
  assert.equal(openStopRequests({ entries: [{ type: 'stop' }, { type: 'delete' }, { type: 'delete', answered: '2026-11-01' }, { type: 'access' }] }), 2);
  assert.equal(openStopRequests(undefined), 0);
});

test('CSV has invite and reserve rows with formula-safe cells; summary has counts only', () => {
  const tricky = [rec('=cmd@gmail.com', 3), ...records];
  const r = pilotList(tricky, addressFlags(tricky, { now }), { size: 2, now, total: 20 });
  const csv = inviteCSV(r), lines = csv.trim().split('\r\n');
  assert.equal(lines[0].replace('﻿', ''), INVITE_COLUMNS.map(c => `"${c}"`).join(','));
  assert.equal(lines.length, 1 + r.invited.length + r.reserve.length);
  assert.ok(csv.includes(`"'=cmd@gmail.com"`));
  const s = pilotSummary(r, { states: 'Texas', stopRequests: 1, date: '2026-11-13' });
  assert.ok(!/@/.test(s), s);
  assert.match(s, /Based on 13 of 20 registrations: load all/); assert.match(s, /confirm each person is in Texas/); assert.match(s, /1 open privacy request asked/);
  const soon = pilotList([rec('z@gmail.com', 3, { expiresAt: new Date(now + 5 * DAY).toISOString() })], new Map(), { now });
  assert.match(pilotSummary(soon), /1 invited sign-up reaches the end/);
  assert.match(pilotSummary(pilotList([], new Map(), { now })), /not decided yet/);
  assert.equal(headline(pilotList([], new Map(), { now })), 'Load registrations to build the invite list.');
});

test('Waitlist tab wires the pilot invite list: markup, sign-out clearing, decision link, no network writes', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8'), html = await readFile(new URL('../owner.html', import.meta.url), 'utf8');
  for (const id of ['wl-pilot-size', 'wl-pilot-order', 'wl-pilot-code', 'wl-pilot-shared', 'wl-pilot-head', 'wl-pilot-out', 'wl-pilot-preview', 'wl-pilot-more', 'wl-pilot-download', 'wl-pilot-copy', 'wl-pilot-decide', 'wl-pilot-status']) {
    assert.ok(html.includes(`id="${id}"`), id); assert.ok(app.includes(`'#${id}'`), id);
  }
  const clear = app.slice(app.indexOf('function clearWaitlistInsights'), app.indexOf('function renderWaitlistChart'));
  assert.match(clear, /pilotResult = null/); assert.match(clear, /#wl-pilot-size'\)\.value = ''/);
  assert.match(app, /renderAddressCheck\(\); renderPilotInvites\(\);/);
  assert.match(app, /openDecision\('pilot\/limits'\)/);
  const block = app.slice(app.indexOf('// Pilot invite list:'), app.indexOf("$('#wl-open-launch')"));
  assert.ok(!/api\(/.test(block) && !/localStorage/.test(block), 'the pilot list never calls the backend or saves addresses');
});
