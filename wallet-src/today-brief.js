// "Today" on the Dashboard tab: the one place the owner lands after signing in. It sums up, from what this
// browser already knows (launch checklist, the owner's own results, dated items, privacy requests and outside
// requests), what needs the owner now. Pure: the page passes in the figures it already computes elsewhere and
// renders what comes back. Fixed words and counts only; nothing typed by the owner appears here.

const plural = (n, w, many = `${w}s`) => `${n} ${n === 1 ? w : many}`;

// Inputs:
//   overview: launch-tracker.js overview() ({ done, total, percent, yours, yoursDone, failed })
//   dates: owner-dates.js collectDates() ({ items, overdue, today, soon, upcoming })
//   privacy: privacy-requests.js privacyAttention() ({ open, overdue, dueSoon })
//   outside: { waiting, chase, share } counts of outside requests sent and not answered (waiting),
//            unanswered for 14+ days (chase) and with all evidence back while the step is open (share)
//   session: test-session progress ({ recorded, total }) when a session is under way, else null
//   wallet: optional Crypto tools tests ({ total, done, failed } from crypto-guide.js walletTests()) and
//           lastSent ({ day: 'YYYY-MM-DD', when: optional short date for display, network, status: optional fixed words
//           from lastSentStatus() }) of the newest transfer submitted from FYNX in this browser
//   support: optional pilot support tally from support-tally.js briefSupport() ({ total, last24, last7, stop, check,
//            alerts: [{ id, title, level: 'stop' | 'check', kind, people }] }); null when nothing is logged
//   rollback: optional open rollback record from rollback-log.js briefRollback() ({ practice, done, total, stopped,
//             next, headline }); null when no record is open
//   services: optional service-reliability.js briefReliability() ({ lastAt, stale, block, measured, answering,
//             down: [{ id, name, since, network }], headline }); null until a services check was kept
//   now: the current time in ms (for "checked n minutes ago")
export function todayBrief({ overview = {}, dates = {}, privacy = {}, outside = {}, session = null, wallet = null, support = null, rollback = null, services = null, now = Date.now() } = {}) {
  const o = { done: 0, total: 0, percent: 0, yours: 0, yoursDone: 0, failed: 0, ...overview };
  const d = { overdue: 0, today: 0, soon: 0, upcoming: 0, items: [], ...dates };
  const p = { open: 0, overdue: 0, dueSoon: 0, ...privacy };
  const x = { waiting: 0, chase: 0, share: 0, ...outside };
  const yoursOpen = Math.max(0, o.yours - o.yoursDone);

  // Headline: the most pressing thing first. Dated items already include privacy answers, reminders,
  // evidence to ask for again and access reviews, so they are not counted twice.
  // A pilot rollback trigger (same complaint from two pilot users within a day) outranks everything: the
  // rollback plan says to stop the pilot. A security or rollback-type request to explain within 1 hour comes next.
  const sp = support && support.total ? { stop: 0, check: 0, last24: 0, last7: 0, alerts: [], ...support } : null;
  const stopAlerts = sp ? sp.alerts.filter(a => a.level === 'stop') : [], checkAlerts = sp ? sp.alerts.filter(a => a.level === 'check') : [];
  // A real rollback under way outranks everything else: the owner is in the middle of stopping the pilot.
  const rb = rollback && rollback.headline ? rollback : null;
  // The owner server or every network link not answering at a recent check: transfers cannot be checked, which
  // the rollback plan names as a reason to stop. It ranks after a rollback trigger, before the rest.
  const sv = services && services.lastAt ? services : null;
  const svBlock = sv && sv.block && !sv.stale && sv.down.length;
  let tone = 'calm', headline;
  if (rb && !rb.practice) { tone = 'overdue'; headline = rb.headline; }
  else if (stopAlerts.length && svBlock) { tone = 'overdue'; headline = stopAlerts.length === 1 ? `Rollback trigger: “${stopAlerts[0].title}” came from ${stopAlerts[0].people} pilot users within a day, and ${sv.headline}` : `Rollback trigger: ${stopAlerts.length} complaints each came from two or more pilot users within a day, and ${sv.headline}`; }
  else if (svBlock) { tone = 'overdue'; headline = sv.headline; }
  else if (stopAlerts.length) { tone = 'overdue'; headline = stopAlerts.length === 1 ? `Rollback trigger: “${stopAlerts[0].title}” came from ${stopAlerts[0].people} pilot users within a day. Turn off real-money sending and follow the rollback plan, or mark it explained.` : `Rollback trigger: ${stopAlerts.length} complaints each came from two or more pilot users within a day. Turn off real-money sending and follow the rollback plan, or mark them explained.`; }
  else if (checkAlerts.length) { tone = 'overdue'; headline = `${plural(checkAlerts.length, 'pilot support request needs', 'pilot support requests need')} explaining within 1 hour of arriving: ${checkAlerts.map(a => `“${a.title}”`).join(', ')}.`; }
  else if (d.overdue) { tone = 'overdue'; headline = `${plural(d.overdue, 'dated item is', 'dated items are')} overdue: start there.`; }
  else if (d.today) { tone = 'due'; headline = `${plural(d.today, 'item is', 'items are')} due today.`; }
  else if (session) { tone = 'active'; headline = `Your test session is under way: ${session.recorded} of ${session.total} recorded.`; }
  else if (o.failed) { tone = 'due'; headline = `${plural(o.failed, 'test')} failed and ${o.failed === 1 ? 'needs' : 'need'} a retest once fixed.`; }
  else if (d.soon) { tone = 'soon'; headline = `Nothing is due today; ${plural(d.soon, 'item')} within 7 days.`; }
  else if (x.share) { tone = 'soon'; headline = `${plural(x.share, 'outside request has', 'outside requests have')} all evidence back: share it so the step can be recorded.`; }
  else if (yoursOpen) headline = `Nothing is due. ${plural(yoursOpen, 'of your own steps is', 'of your own steps are')} still open.`;
  else if (o.total && o.done >= o.total) { tone = 'done'; headline = 'Every launch step is recorded done.'; }
  else headline = 'Nothing is waiting on you. The open launch steps are with engineering and outside parties.';

  const stats = [
    { id: 'launch', value: `${o.percent}%`, label: 'launch steps done', detail: `${o.done} of ${o.total}`, tone: o.total && o.done >= o.total ? 'done' : 'info' },
    { id: 'yours', value: `${o.yoursDone}/${o.yours}`, label: 'your tests and decisions', detail: o.failed ? `${o.failed} failed` : yoursOpen ? `${yoursOpen} open` : 'all recorded', tone: o.failed ? 'overdue' : yoursOpen ? 'info' : 'done' },
    { id: 'dates', value: String(d.overdue + d.today + d.soon), label: 'dates within 7 days', detail: d.overdue ? `${d.overdue} overdue` : d.today ? `${d.today} today` : d.upcoming ? `${d.upcoming} later` : 'none dated', tone: d.overdue ? 'overdue' : d.today || d.soon ? 'soon' : 'info' },
    { id: 'privacy', value: String(p.open), label: p.open === 1 ? 'privacy request open' : 'privacy requests open', detail: p.overdue ? `${p.overdue} overdue` : p.dueSoon ? `${p.dueSoon} due soon` : p.open ? 'on time' : 'none open', tone: p.overdue ? 'overdue' : p.dueSoon ? 'soon' : 'info' },
    { id: 'outside', value: String(x.waiting), label: 'outside answers awaited', detail: x.chase ? `${x.chase} ${x.chase === 1 ? 'needs' : 'need'} a reminder` : x.share ? `${x.share} ready to share` : x.waiting ? 'within 14 days' : 'none sent', tone: x.chase ? 'soon' : 'info' },
  ];
  if (wallet) {
    const w = { total: 0, done: 0, failed: 0, lastSent: null, ...wallet }, open = Math.max(0, w.total - w.done);
    const ls = w.lastSent && /^\d{4}-\d{2}-\d{2}$/.test(w.lastSent.day || '') ? w.lastSent : null;
    const sent = ls ? `last sent ${ls.when || ls.day}${ls.network ? ` · ${ls.network}` : ''}${ls.status ? ` · ${ls.status}` : ''}` : 'no transfer sent from FYNX yet';
    stats.push({
      id: 'wallet', value: `${w.done}/${w.total}`, label: 'wallet tests recorded',
      detail: w.failed ? `${w.failed} failed · ${sent}` : !w.total || !open ? `all recorded · ${sent}` : sent,
      tone: w.failed ? 'overdue' : w.total && !open ? 'done' : 'info',
    });
  }
  if (sp) {
    stats.push({
      id: 'support', value: String(sp.last24), label: sp.last24 === 1 ? 'pilot support request today' : 'pilot support requests today',
      detail: stopAlerts.length ? `${plural(stopAlerts.length, 'rollback trigger')} open` : checkAlerts.length ? `${checkAlerts.length} to explain` : `${sp.last7} in 7 days · no repeat`,
      tone: stopAlerts.length || checkAlerts.length ? 'overdue' : 'info',
    });
  }
  if (sv) {
    const mins = Math.max(0, Math.floor((now - sv.lastAt) / 60000));
    const ago = mins < 1 ? 'checked just now' : mins < 60 ? `checked ${mins} min ago` : mins < 48 * 60 ? `checked ${Math.floor(mins / 60)} h ago` : `checked ${Math.floor(mins / 1440)} days ago`;
    const first = sv.down[0];
    stats.push({
      id: 'services', value: `${sv.answering}/${sv.measured}`, label: 'services answering',
      detail: first ? `${first.name.replace(/ \(.*\)$/, '')} not answering${sv.down.length > 1 ? ` (+${sv.down.length - 1})` : ''} · ${ago}` : sv.stale ? `${ago} · check again` : ago,
      tone: first && !sv.stale ? (sv.block || first.network ? 'overdue' : 'soon') : sv.stale ? 'soon' : 'done',
    });
  }
  if (rb) {
    stats.push({
      id: 'rollback', value: `${rb.done}/${rb.total}`, label: rb.practice ? 'rollback practice steps' : 'rollback steps done',
      detail: rb.practice ? (rb.next ? `next: ${rb.next}` : 'all walked through') : !rb.stopped ? 'transfers not stopped yet' : rb.next ? `next: ${rb.next}` : 'ready to close',
      tone: rb.practice ? 'active' : 'overdue',
    });
  }
  // The dated items that matter today: overdue, due today and the coming week, soonest first (the page shows a few).
  const urgent = (d.items || []).filter(i => i.state === 'overdue' || i.state === 'today' || i.state === 'soon');
  // Open support alerts, rollback triggers first (the page lists them with a button to the tally).
  const supportAlerts = [...stopAlerts, ...checkAlerts];
  return { tone, headline, stats, urgent, supportAlerts, rollback: rb, services: sv && sv.down.length && !sv.stale ? sv : null };
}

// Fixed words for what the last status check said about the newest transfer sent from FYNX (pilot register
// outcome), e.g. "confirmed and settled" or "not checked yet". Unknown values say nothing.
export function lastSentStatus(outcome, deep = false) {
  if (!outcome) return 'result not checked yet';
  if (outcome === 'confirmed') return deep ? 'confirmed and settled' : 'confirmed';
  return ({ failed: 'failed on-chain', replaced: 'replaced in the wallet', dropped: 'dropped, nothing spent' })[outcome] || '';
}

// Plain text for "Copy today" (counts and fixed words only).
export function briefText(b, { today = '' } = {}) {
  const lines = [`FYNX owner workspace · today${today ? ` (${today})` : ''}`, '', b.headline, ''];
  if (b.rollback && b.rollback.practice) lines.splice(3, 0, b.rollback.headline);
  for (const s of b.stats) lines.push(`- ${s.value} ${s.label} (${s.detail})`);
  if (b.services) {
    lines.push('', 'Services:');
    for (const x of b.services.down) lines.push(`- Not answering at the last check: ${x.name}`);
  }
  if (b.supportAlerts?.length) {
    lines.push('', 'Pilot support:');
    for (const a of b.supportAlerts) lines.push(`- ${a.level === 'stop' ? `Rollback trigger: ${a.title} (${a.people} pilot users within a day)` : `To explain within 1 hour: ${a.title}`}`);
  }
  if (b.urgent.length) {
    lines.push('', 'Dated items:');
    for (const i of b.urgent) lines.push(`- ${i.date} · ${i.when}: ${i.title}`);
  }
  return lines.join('\n');
}
