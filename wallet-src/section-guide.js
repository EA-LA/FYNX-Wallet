// Section guide: a sticky row of jump buttons at the top of the long workspace tabs (Launch readiness,
// Crypto tools, Account security and Waitlist), each with a one-word live status read from what this browser already knows. Pure: the
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
  security: [
    { id: 'checkup', label: 'Checkup', target: '#sec-checkup' },
    { id: 'tests', label: 'Launch tests', target: '#sec-tests-box' },
    { id: 'access', label: 'Access review', target: '#access-review' },
    { id: 'emergency', label: 'Emergency plan', target: '#emergency-plan' },
    { id: 'passkeys', label: 'Passkeys', target: '#passkey-card' },
    { id: 'recovery', label: 'Account & recovery', target: '#recovery-card' },
  ],
  registrations: [
    { id: 'find', label: 'Find & load', target: '#wl-main' },
    { id: 'insights', label: 'Sign-up insights', target: '#waitlist-insights' },
    { id: 'quality', label: 'Address check', target: '#wl-quality-box' },
    { id: 'pilot', label: 'Pilot invite list', target: '#wl-pilot-box' },
    { id: 'rows', label: 'Registrations', target: '#wl-table' },
    { id: 'privacy', label: 'Privacy requests', target: '#wl-requests' },
    { id: 'tests', label: 'Launch tests', target: '#wl-tests-box' },
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

// Shared shape for "n of m tests recorded" chips.
function testsChip(t, what) {
  if (!t || !(t.total > 0)) return null;
  return t.failed > 0
    ? chip(`${plural(n(t.failed), 'failed', 'failed')}`, 'block', `${plural(n(t.failed), 'test')} failed, retest`)
    : chip(`${n(t.done)}/${n(t.total)}`, t.done >= t.total ? 'ok' : 'info', `${n(t.done)} of ${n(t.total)} ${what} recorded`);
}
const ofChip = (part, what, doneWord) => (part && part.total > 0
  ? chip(`${n(part.done)}/${n(part.total)}`, part.done >= part.total ? 'ok' : 'warn', `${n(part.done)} of ${n(part.total)} ${what}${part.done >= part.total && doneWord ? `, ${doneWord}` : ''}`)
  : null);

// Account security. checkup/emergency: { done, total }; access: { fine, total, urgent, risk }; passkeys: a count.
export function securityChips(f = {}) {
  const out = {};
  const c = ofChip(f.checkup, 'security checks done', 'all done'); if (c) out.checkup = c;
  const t = testsChip(f.tests, 'account-security tests'); if (t) out.tests = t;
  const a = f.access;
  if (a && a.total > 0) {
    out.access = n(a.risk) ? chip(`${plural(n(a.risk), 'gap')}`, 'block', `${plural(n(a.risk), 'account')} with a gap`)
      : n(a.urgent) ? chip(`${n(a.urgent)} to review`, 'warn', `${plural(n(a.urgent), 'account')} to review`)
        : chip(`${n(a.fine)}/${n(a.total)}`, a.fine >= a.total ? 'ok' : 'info', `${n(a.fine)} of ${n(a.total)} accounts reviewed`);
  }
  const e = ofChip(f.emergency, 'emergency situations prepared'); if (e) out.emergency = e;
  if (Number.isFinite(f.passkeys)) out.passkeys = f.passkeys > 0
    ? chip(String(n(f.passkeys)), 'ok', `${plural(n(f.passkeys), 'passkey')} registered`)
    : chip('None', 'warn', 'no passkey yet');
  return out;
}

// Waitlist. loaded: { loaded, total } (null before loading); last7; quality: address-check counts;
// invited: people on the pilot list; outreachDue: invitations needing a reminder or a No reply mark; privacy: { open, overdue, dueSoon }; tests: { done, total, failed }.
export function waitlistChips(f = {}) {
  const out = {};
  const l = f.loaded;
  if (l === null) out.find = chip('Not loaded', 'info', 'registrations not loaded yet');
  else if (l && Number.isFinite(l.total)) out.find = l.loaded >= l.total
    ? chip(`${n(l.total)} loaded`, 'ok', `all ${n(l.total)} registrations loaded`)
    : chip(`${n(l.loaded)} of ${n(l.total)}`, 'info', `${n(l.loaded)} of ${n(l.total)} registrations loaded`);
  if (l && Number.isFinite(f.last7)) out.insights = chip(`${n(f.last7)} this week`, 'info', `${plural(n(f.last7), 'sign-up')} in the last 7 days`);
  const q = f.quality;
  if (l && q) {
    const look = n(q.attention);
    out.quality = look ? chip(`${look} to look at`, 'warn', `${plural(look, 'registration')} to look at`) : chip('All clear', 'ok', 'no address problems found');
  }
  if (n(f.outreachDue)) out.pilot = chip(`${n(f.outreachDue)} to follow up`, 'warn', `${plural(n(f.outreachDue), 'invitation')} waiting for a reminder or a No reply mark`);
  else if (l && Number.isFinite(f.invited)) out.pilot = chip(`${n(f.invited)} to invite`, f.invited > 0 ? 'info' : 'warn', `${plural(n(f.invited), 'person', 'people')} on the invite list`);
  const p = f.privacy;
  if (p) {
    out.privacy = n(p.overdue) ? chip(`${n(p.overdue)} overdue`, 'block', `${plural(n(p.overdue), 'request')} overdue`)
      : n(p.dueSoon) ? chip(`${n(p.dueSoon)} due soon`, 'warn', `${plural(n(p.dueSoon), 'request')} due within a week`)
        : n(p.open) ? chip(`${n(p.open)} open`, 'info', `${plural(n(p.open), 'open request')}`)
          : chip('None open', 'ok', 'no open requests');
  }
  const t = testsChip(f.tests, 'waitlist tests'); if (t) out.tests = t;
  return out;
}

// The tab a section bar belongs to, from its panel id ("tab-launch" → "launch").
export const GUIDE_TABS = Object.keys(SECTIONS);

// Where each tab was left, so coming back to a tab returns to the same part. Kept as { tab: sectionId }
// in this browser; only known tabs and section ids are kept, so a stored value can never point elsewhere.
export function cleanResume(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const tab of GUIDE_TABS) {
    const id = value[tab];
    if (typeof id === 'string' && SECTIONS[tab].some(s => s.id === id)) out[tab] = id;
  }
  return out;
}
// Remember a part; the first part of a tab is its top, so it is simply forgotten.
export function rememberPart(state, tab, id) {
  const next = { ...cleanResume(state) };
  const list = SECTIONS[tab];
  if (!list) return next;
  if (!list.some(s => s.id === id) || list[0].id === id) delete next[tab];
  else next[tab] = id;
  return next;
}
// The section to return to on a tab (a target selector), or '' for the top.
export function resumeTarget(state, tab, present = () => true) {
  const id = cleanResume(state)[tab];
  const section = id ? SECTIONS[tab].find(s => s.id === id) : null;
  return section && present(section.target) ? section.target : '';
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
