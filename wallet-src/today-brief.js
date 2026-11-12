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
export function todayBrief({ overview = {}, dates = {}, privacy = {}, outside = {}, session = null } = {}) {
  const o = { done: 0, total: 0, percent: 0, yours: 0, yoursDone: 0, failed: 0, ...overview };
  const d = { overdue: 0, today: 0, soon: 0, upcoming: 0, items: [], ...dates };
  const p = { open: 0, overdue: 0, dueSoon: 0, ...privacy };
  const x = { waiting: 0, chase: 0, share: 0, ...outside };
  const yoursOpen = Math.max(0, o.yours - o.yoursDone);

  // Headline: the most pressing thing first. Dated items already include privacy answers, reminders,
  // evidence to ask for again and access reviews, so they are not counted twice.
  let tone = 'calm', headline;
  if (d.overdue) { tone = 'overdue'; headline = `${plural(d.overdue, 'dated item is', 'dated items are')} overdue: start there.`; }
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
  // The dated items that matter today: overdue, due today and the coming week, soonest first (the page shows a few).
  const urgent = (d.items || []).filter(i => i.state === 'overdue' || i.state === 'today' || i.state === 'soon');
  return { tone, headline, stats, urgent };
}

// Plain text for "Copy today" (counts and fixed words only).
export function briefText(b, { today = '' } = {}) {
  const lines = [`FYNX owner workspace · today${today ? ` (${today})` : ''}`, '', b.headline, ''];
  for (const s of b.stats) lines.push(`- ${s.value} ${s.label} (${s.detail})`);
  if (b.urgent.length) {
    lines.push('', 'Dated items:');
    for (const i of b.urgent) lines.push(`- ${i.date} · ${i.when}: ${i.title}`);
  }
  return lines.join('\n');
}
