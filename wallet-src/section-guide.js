// Section guide: a sticky row of jump buttons at the top of the long workspace tabs (Launch readiness and
// Crypto tools), each with a one-word live status read from what this browser already knows. Pure: the
// page passes the facts in; nothing here reads storage, the network or the page.

export const SECTIONS = {
  launch: [
    { id: 'overview', label: 'Overview', target: '#launch-main' },
    { id: 'dates', label: 'Your dates', target: '#launch-dates' },
    { id: 'update', label: 'Progress update', target: '#launch-update' },
    { id: 'history', label: 'Finished', target: '#launch-history' },
    { id: 'order', label: 'What can move now', target: '#launch-order' },
    { id: 'session', label: 'Test session', target: '#test-session' },
    { id: 'pilot', label: 'Pilot go / no-go', target: '#pilot-gate' },
    { id: 'support', label: 'Support playbook', target: '#support-playbook' },
    { id: 'rollback', label: 'Rollback record', target: '#rollback-log' },
    { id: 'services', label: 'Your services', target: '#services' },
    { id: 'checklist', label: 'Checklist', target: '#launch-filters' },
    { id: 'decisions', label: 'Decisions', target: '#launch-decisions' },
    { id: 'drill', label: 'Practice run', target: '#launch-drill' },
    { id: 'connections', label: 'Connections', target: '#launch-connections' },
  ],
  wallet: [
    { id: 'guide', label: 'Test guide', target: '#crypto-guide' },
    { id: 'wallet', label: 'Connect', target: '#wallet-card' },
    { id: 'balance', label: 'Balances', target: '#balance-card' },
    { id: 'send', label: 'Send', target: '#send-card' },
    { id: 'swap', label: 'Swap', target: '#swap-card' },
    { id: 'permissions', label: 'Spending permissions', target: '#permissions-card' },
    { id: 'track', label: 'Track', target: '#track-card' },
    { id: 'fiat', label: 'Buy & sell', target: '#fiat-card' },
    { id: 'mainnet', label: 'Real-money switch', target: '#mainnet-card' },
    { id: 'portfolio', label: 'Portfolio & history', target: '#portfolio-card' },
  ],
};

// Tones match the rest of the workspace: ok (green), warn (amber), block (red), info (grey).
const chip = (text, tone = 'info', say = text) => ({ text: String(text), tone, say: String(say) });
const n = v => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

// Launch readiness. Every fact is optional; a missing fact simply gives that section no status.
export function launchChips(f = {}) {
  const out = {};
  const o = f.overview;
  if (o && o.total > 0) {
    out.overview = chip(`${n(o.percent)}%`, o.done >= o.total ? 'ok' : 'info', `${n(o.percent)}% of launch steps done`);
    out.checklist = o.failed > 0
      ? chip(`${plural(n(o.failed), 'failed', 'failed')}`, 'block', `${plural(n(o.failed), 'test')} failed, retest`)
      : chip(`${n(o.done)}/${n(o.total)}`, o.done >= o.total ? 'ok' : 'info', `${n(o.done)} of ${n(o.total)} steps done`);
  }
  const d = f.dates;
  if (d) {
    if (n(d.overdue)) out.dates = chip(`${n(d.overdue)} overdue`, 'block', `${plural(n(d.overdue), 'date')} overdue`);
    else if (n(d.today)) out.dates = chip(`${n(d.today)} today`, 'warn', `${plural(n(d.today), 'date')} due today`);
    else if (n(d.soon)) out.dates = chip(`${n(d.soon)} soon`, 'warn', `${plural(n(d.soon), 'date')} due within a week`);
    else if (Array.isArray(d.items) && d.items.length) out.dates = chip(String(d.items.length), 'info', `${plural(d.items.length, 'date')} coming up`);
  }
  if (Number.isFinite(f.readyYou) && f.readyYou > 0) out.order = chip(`${n(f.readyYou)} ready`, 'info', `${plural(n(f.readyYou), 'step')} ready for you now`);
  const s = f.session;
  if (s && s.total > 0) out.session = s.complete
    ? chip('Finished', 'ok', 'test session finished')
    : chip(`${n(s.recorded)}/${n(s.total)}`, 'warn', `test session under way, ${n(s.recorded)} of ${n(s.total)} recorded`);
  const p = f.pilot;
  if (p && p.verdict) {
    out.pilot = p.verdict === 'stop' ? chip('Stop', 'block', 'pilot must stop')
      : p.verdict === 'approved' ? chip('Approved', 'ok', 'pilot approved')
        : p.verdict === 'ready' ? chip('Ready', 'ok', 'ready for your approval')
          : chip(n(p.blockers) ? `${n(p.blockers)} to finish` : 'Not ready', 'warn', n(p.blockers) ? `${plural(n(p.blockers), 'thing')} to finish first` : 'not ready');
  }
  const sp = f.support;
  if (sp && sp.total > 0) {
    const alerts = Array.isArray(sp.alerts) ? sp.alerts.length : 0;
    out.support = n(sp.stop) ? chip('Rollback trigger', 'block', 'a rollback trigger is open')
      : alerts ? chip(`${alerts} to answer`, 'warn', `${plural(alerts, 'alert')} to answer`)
        : chip(`${n(sp.total)} logged`, 'info', `${plural(n(sp.total), 'request')} logged`);
  }
  const r = f.rollback;
  if (r) out.rollback = r.practice ? chip('Practice open', 'warn', 'a rollback practice is open') : chip('Under way', 'block', 'a real rollback is under way');
  const v = f.services;
  if (v === null) out.services = chip('Not checked', 'info', 'not checked yet');
  else if (v) {
    out.services = v.block ? chip('Down', 'block', 'transfers cannot be checked')
      : v.down?.length ? chip(`${v.down.length} not answering`, 'warn', `${plural(v.down.length, 'service')} not answering`)
        : v.stale ? chip('Check again', 'warn', 'last check is over a day old')
          : chip(`${n(v.answering)}/${n(v.measured)} up`, 'ok', `${n(v.answering)} of ${n(v.measured)} services answering`);
  }
  const dc = f.decisions;
  if (dc && dc.total > 0) out.decisions = chip(`${n(dc.decided)}/${n(dc.total)}`, dc.decided >= dc.total ? 'ok' : 'warn', `${n(dc.decided)} of ${n(dc.total)} decisions recorded`);
  const dr = f.drill;
  if (dr) out.drill = dr.done ? chip('Done', 'ok', 'practice run recorded') : dr.running ? chip('Under way', 'warn', 'practice run under way') : chip('Not yet', 'info', 'not practised yet');
  return out;
}

// Crypto tools.
export function walletChips(f = {}) {
  const out = {};
  const t = f.tests;
  if (t && t.total > 0) out.guide = t.failed > 0
    ? chip(`${plural(n(t.failed), 'failed', 'failed')}`, 'block', `${plural(n(t.failed), 'test')} failed, retest`)
    : chip(`${n(t.done)}/${n(t.total)}`, t.done >= t.total ? 'ok' : 'info', `${n(t.done)} of ${n(t.total)} wallet tests done`);
  if (f.wallet === 'verified') out.wallet = chip('Verified', 'ok', 'wallet verified');
  else if (f.wallet === 'connected') out.wallet = chip('Connected', 'warn', 'connected, ownership not verified');
  else if (f.wallet === 'none') out.wallet = chip('Not connected', 'info', 'no wallet connected');
  if (n(f.waiting)) out.track = chip(`${n(f.waiting)} waiting`, 'warn', `${plural(n(f.waiting), 'transaction')} waiting`);
  if (f.mainnet === true) out.mainnet = chip('On', 'warn', 'real-money sending is on');
  else if (f.mainnet === false) out.mainnet = chip('Off', 'info', 'real-money sending is off');
  return out;
}

// The buttons to draw: every section the page actually has, with its status (or none).
export function guideItems(tab, chips = {}, present = () => true) {
  return (SECTIONS[tab] || []).filter(s => present(s.target)).map(s => ({ ...s, chip: chips[s.id] || null }));
}

// Which section the reader is in: the last one whose top edge has passed the reading line (just under the
// sticky row). Sections side by side (the same top) keep the first. Before the first section: the first.
export function activeIndex(tops, line) {
  let best = -1, bestTop = -Infinity;
  for (let i = 0; i < tops.length; i += 1) {
    const top = tops[i];
    if (!Number.isFinite(top)) continue;
    if (top <= line && top > bestTop) { best = i; bestTop = top; }
  }
  if (best === -1) best = tops.findIndex(Number.isFinite);
  return best;
}

// Spoken label for one button, e.g. "Decisions: 0 of 12 decisions recorded".
export function itemLabel(item) {
  return item.chip ? `${item.label}: ${item.chip.say}` : item.label;
}
