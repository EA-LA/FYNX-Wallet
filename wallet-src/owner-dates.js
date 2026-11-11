// "Your dates": every dated obligation the owner workspace already tracks, in one list and as a calendar
// file (.ics) the owner can add to Google Calendar, Apple Calendar or Outlook, so a due answer or a
// reminder is not missed between visits. Sources (all kept in this browser already):
//   - waitlist privacy requests: the answer target date of each open request;
//   - outside-party requests: the reminder date of each request sent and not yet answered;
//   - outside evidence: the "ask again" date when pieces are still missing after the answer;
//   - the owner access review: the next review date of each account that was reviewed.
// Only fixed words travel into the list and the calendar file: request types, party names, checklist step
// text, evidence names and service names. References, notes and anything else the owner typed stay out,
// because calendars are usually synced to an outside service. Pure helpers shared by the page and tests.
import { requestState as privacyState, typeLabel, TARGET_DAYS, dayNumber, dayString } from './privacy-requests.js';
import { requestState as outsideState, splitId, isRequestId, CHASE_DAYS } from './outside-requests.js';
import { missingAfterAnswer } from './outside-evidence.js';
import { findParty } from './outside-handoff.js';
import { accessSummary, REVIEW_DAYS } from './access-review.js';

export const SOON_DAYS = 7;
export const HORIZON_DAYS = 180;
export const KINDS = {
  privacy: 'Privacy request',
  remind: 'Outside request',
  evidence: 'Missing evidence',
  access: 'Access review',
};

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
const sentence = s => (/[.…!?]$/.test(s) ? s : `${s}.`);

// Where a date stands against today: overdue / today / soon (within SOON_DAYS) / later.
export function dateState(date, today) {
  const d = dayNumber(date), t = dayNumber(today);
  if (d === null || t === null) return { state: 'later', left: null };
  const left = d - t;
  return { left, state: left < 0 ? 'overdue' : left === 0 ? 'today' : left <= SOON_DAYS ? 'soon' : 'later' };
}
export function whenLabel(left) {
  if (left === null) return '';
  if (left < 0) return `${plural(-left, 'day')} overdue`;
  if (left === 0) return 'Today';
  if (left === 1) return 'Tomorrow';
  return `In ${plural(left, 'day')}`;
}

// Collect the dated items, soonest first (overdue at the top). Inputs:
//   privacy: the privacy request log ({ entries })
//   requests / evidence: the outside hand-off dates and evidence ticks ({ entries })
//   openRequests: [{ id, title }] for hand-off requests whose checklist step is still open
//   access: the access review answers
//   today: 'YYYY-MM-DD' (the owner's local day)
// Items further away than HORIZON_DAYS are left out (they are counted in `later`).
export function collectDates({ privacy, requests, evidence, openRequests = [], access, today, horizon = HORIZON_DAYS } = {}) {
  const items = [];
  const add = (item) => { const s = dateState(item.date, today); items.push({ ...item, ...s, when: whenLabel(s.left) }); };
  for (const e of privacy?.entries || []) {
    if (e.answered) continue;
    const st = privacyState(e, today);
    add({ uid: `privacy-${e.id}`, kind: 'privacy', date: st.due, ref: { id: e.id },
      title: `Answer the privacy request (${lower(typeLabel(e.type))})`,
      detail: `Arrived ${e.received}. FYNX answers within ${TARGET_DAYS} days of arrival (your own target; your lawyer confirms the legal deadline).` });
  }
  for (const { id, title } of openRequests) {
    if (!isRequestId(id)) continue;
    const { partyId, stepKey } = splitId(id), party = findParty(partyId);
    if (!party) continue;
    const req = requests?.entries?.[id], st = outsideState(req, today);
    if (st.state === 'waiting' || st.state === 'chase') {
      add({ uid: `remind-${partyId}-${stepKey.replace('/', '-')}`, kind: 'remind', date: st.chaseOn, ref: { partyId, stepKey },
        title: `Remind the ${party.short} if there is still no answer`,
        detail: `${sentence(title)} Sent ${req.sent}; a reminder is due ${CHASE_DAYS} days later.` });
    } else if (st.state === 'answered') {
      const m = missingAfterAnswer(id, req, evidence?.entries?.[id], today);
      if (!m) continue;
      add({ uid: `evidence-${partyId}-${stepKey.replace('/', '-')}`, kind: 'evidence', date: m.askOn, ref: { partyId, stepKey },
        title: `Ask the ${party.short} again for ${m.missing.length === 1 ? 'the missing piece' : `${m.missing.length} missing pieces`}`,
        detail: `${sentence(title)} Still missing: ${m.missing.map(i => lower(i.label)).join('; ')}. Counted from ${m.lastArrived ? `the last piece that arrived (${m.lastArrived})` : `their answer of ${m.answered}`}.` });
    }
  }
  for (const r of accessSummary(access || {}, today).rows) {
    if (!r.counted || !r.due) continue;
    const name = r.service.id === 'inbox' ? 'the team inbox' : r.service.name.replace(/^Your /, 'your ');
    add({ uid: `access-${r.service.id}`, kind: 'access', date: r.due, ref: { serviceId: r.service.id },
      title: `Review ${name}`,
      detail: `Last reviewed ${r.reviewed}. Each account that controls FYNX is reviewed every ${REVIEW_DAYS} days: 2-step verification, recovery codes and who has access.${r.problems?.length ? ` Open problem: ${r.problems.join('; ')}.` : ''}` });
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind.localeCompare(b.kind) || a.uid.localeCompare(b.uid)));
  const t = dayNumber(today), shown = items.filter(i => t === null || i.left === null || i.left <= horizon);
  const count = s => shown.filter(i => i.state === s).length;
  return { items: shown, later: items.length - shown.length, overdue: count('overdue'), today: count('today'), soon: count('soon'), upcoming: count('later') };
}

// One-line summary for the panel heading and the copied list.
export function datesHeadline(d) {
  if (!d.items.length) return 'Nothing dated yet';
  const parts = [];
  if (d.overdue) parts.push(`${d.overdue} overdue`);
  if (d.today) parts.push(`${d.today} due today`);
  if (d.soon) parts.push(`${d.soon} within ${SOON_DAYS} days`);
  if (d.upcoming) parts.push(`${d.upcoming} later`);
  return parts.join(' · ');
}

// Plain-text list (markdown) for the clipboard.
export function datesText(d, today) {
  const lines = [`FYNX owner dates (${today})`, '', datesHeadline(d), ''];
  for (const i of d.items) lines.push(`- ${i.date} · ${i.when} · ${KINDS[i.kind]}: ${i.title}. ${i.detail}`);
  if (!d.items.length) lines.push('No dated items yet.');
  if (d.later) lines.push('', `${plural(d.later, 'more date')} further than ${HORIZON_DAYS} days away.`);
  return lines.join('\n');
}

// ---- Calendar file (RFC 5545) ----
// All-day events with a reminder at 09:00 on the day (and 3 days before for privacy answers). Overdue items
// are placed on today, titled "Overdue", so they show up where the owner looks. The UID is stable per item,
// so importing a newer file again updates the same events in calendars that honour UIDs (SEQUENCE grows
// with time). Events for things finished since are not removed by a new file: delete them in the calendar.
export function icsEscape(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
// Fold lines longer than 75 octets (UTF-8) with CRLF + space, without splitting a character.
export function icsFold(line) {
  const enc = new TextEncoder(), out = [];
  let cur = '', size = 0, limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > limit) { out.push(cur); cur = ''; size = 0; limit = 74; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const compactDay = day => day.replace(/-/g, '');
const stamp = now => new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function datesIcs(d, { today, now = Date.now(), link = '' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FYNX finance world inc.//FYNX owner workspace//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:FYNX owner dates',
  ];
  const seq = Math.floor(now / 60000), t = dayNumber(today);
  for (const i of d.items) {
    const overdue = i.state === 'overdue' && t !== null;
    const day = overdue ? today : i.date;
    const end = dayString(dayNumber(day) + 1);
    const summary = `${overdue ? 'Overdue: ' : ''}FYNX · ${i.title}`;
    const desc = `${KINDS[i.kind]}. ${overdue ? `Was due ${i.date}. ` : ''}${i.detail}${link ? `\nOpen the owner workspace: ${link}` : ''}`;
    lines.push('BEGIN:VEVENT', `UID:${i.uid}@owner.fynx-wallet`, `DTSTAMP:${stamp(now)}`, `SEQUENCE:${seq}`,
      `DTSTART;VALUE=DATE:${compactDay(day)}`, `DTEND;VALUE=DATE:${compactDay(end)}`,
      `SUMMARY:${icsEscape(summary)}`, `DESCRIPTION:${icsEscape(desc)}`, 'TRANSP:TRANSPARENT');
    if (link) lines.push(`URL:${link}`);
    const alarms = ['PT9H'];
    if (i.kind === 'privacy' && !overdue && i.left !== null && i.left >= 3) alarms.unshift('-P2DT15H');
    for (const trigger of alarms) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(summary)}`, `TRIGGER:${trigger}`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
