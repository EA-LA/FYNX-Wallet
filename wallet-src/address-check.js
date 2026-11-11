// Recipient check and look-alike ("address poisoning") detection for Crypto tools: pure helpers (no DOM, no network).
// Address-poisoning scams send tiny or zero-value transfers from an address that shares the first and last characters
// of a wallet you really use, hoping you later copy the wrong one from your history. These helpers compare a typed
// recipient (and the loaded history) with the wallets FYNX already knows in this browser: your connected wallet, the
// names you gave wallets, the loaded history and the pilot register. Read-only: nothing here signs, sends or blocks
// anything. The transfer review keeps all of its own checks (contract recipients are still refused there).
import { getAddress } from 'ethers';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
// A look-alike shares at least this many characters at the start and at the end (after 0x), and both sides together
// reach LOOKALIKE_TOTAL. Two unrelated random addresses meet this about once in 4 billion pairs.
export const LOOKALIKE_EACH = 3;
export const LOOKALIKE_TOTAL = 8;
const BURN = new Set(['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead']);

const lower = a => (typeof a === 'string' && ADDRESS.test(a) ? a.toLowerCase() : null);
export const shortAddr = a => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
// "0x1c7D 4B19 6Cb0 …": groups of four, easier to compare aloud with a wallet screen or a hardware device.
export const grouped = a => (ADDRESS.test(a || '') ? `0x ${a.slice(2).match(/.{4}/g).join(' ')}` : '');

// How many hex characters two addresses share at the start and at the end (case-insensitive, after 0x).
export function sharedEnds(a, b) {
  const x = lower(a)?.slice(2), y = lower(b)?.slice(2);
  if (!x || !y || x === y) return { start: 0, end: 0 };
  let start = 0; while (start < 40 && x[start] === y[start]) start++;
  let end = 0; while (end < 40 - start && x[39 - end] === y[39 - end]) end++;
  return { start, end };
}
export function isLookalike(a, b) {
  const { start, end } = sharedEnds(a, b);
  return start >= LOOKALIKE_EACH && end >= LOOKALIKE_EACH && start + end >= LOOKALIKE_TOTAL;
}

// Public contract addresses FYNX uses (USDC, WETH and the Uniswap contracts), by address, on every network.
export function knownContracts(networks = NETWORKS) {
  const out = new Map();
  const names = { usdc: 'USDC token contract', weth: 'WETH token contract', router: 'Uniswap swap router', quoter: 'Uniswap quoter', factory: 'Uniswap pool factory' };
  for (const n of Object.values(networks)) for (const [key, name] of Object.entries(names)) {
    const a = lower(n[key]);
    if (!a) continue;
    const list = out.get(a) || [];
    list.push({ name, network: n.name, chainId: n.id });
    out.set(a, list);
  }
  return out;
}
const CONTRACTS = knownContracts();

// Everything FYNX knows about wallets in this browser, keyed by lower-case address.
// ctx: { own: [addresses], labels: { addr: { label } }, transfers: cleaned history (history-tools cleanTransfers),
//        register: pilot register entries ({ address } = the wallet that sent) }
export function knownWallets(ctx = {}) {
  const map = new Map();
  const get = a => { const k = lower(a); if (!k) return null; if (!map.has(k)) map.set(k, { address: k, own: false, label: '', sent: 0, received: 0, last: null, registered: 0 }); return map.get(k); };
  for (const a of ctx.own || []) { const w = get(a); if (w) w.own = true; }
  for (const [a, v] of Object.entries(ctx.labels || {})) { const w = get(a); if (w && v?.label) w.label = v.label; }
  for (const e of ctx.register || []) { const w = get(e?.address); if (w) { w.own = true; w.registered++; } }
  for (const t of ctx.transfers || []) {
    const w = get(t.other); if (!w) continue;
    if (t.direction === 'out') w.sent++; else w.received++;
    if (t.time && (!w.last || t.time > w.last)) w.last = t.time;
  }
  return map;
}
// A wallet is "trusted" when you named it, it is yours, or you have sent to it. Received-only addresses are not:
// anyone can send you a transfer, which is exactly how look-alikes get into a history.
const trusted = w => w.own || Boolean(w.label) || w.sent > 0;
const describe = w => (w.label ? `“${w.label}” (${shortAddr(w.address)})` : w.own ? `your wallet ${shortAddr(w.address)}` : shortAddr(w.address));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Check a typed recipient. Returns { state, title, lines: [{ tone: 'good'|'warn'|'bad'|'info', text }], address, grouped }.
// state: 'empty' | 'invalid' | 'danger' | 'caution' | 'known'
export function checkRecipient(input, ctx = {}) {
  const raw = String(input ?? '');
  const text = raw.trim();
  if (!text) return { state: 'empty', title: '', lines: [] };
  const lines = [];
  const bad = (title, more) => ({ state: 'invalid', title, lines: more ? [{ tone: 'bad', text: more }] : [] });
  if (/\.(eth|base\.eth|xyz|crypto)$/i.test(text) && !text.startsWith('0x')) return bad('Names are not looked up', 'FYNX only sends to a full 0x address. Copy the address from your own records, not a name.');
  if (/\s/.test(text)) return bad('Remove the spaces', 'A wallet address has no spaces inside it.');
  if (!/^0x/i.test(text)) return bad('An address starts with 0x', 'Paste the full address, 42 characters starting with 0x.');
  if (!/^0x[0-9a-fA-F]*$/.test(text)) return bad('Not a wallet address', 'Only 0–9 and a–f can follow 0x. Check for a letter like o, l or a symbol.');
  if (text.length !== 42) return bad(text.length < 42 ? `${42 - text.length} character${42 - text.length === 1 ? '' : 's'} missing` : `${text.length - 42} character${text.length - 42 === 1 ? '' : 's'} too many`, 'A full address is 42 characters: 0x and 40 more.');
  const address = text.toLowerCase();
  const out = (state, title) => ({ state, title, lines, address, grouped: grouped(checksummed(text)) });
  const mixed = /[a-f]/.test(text.slice(2)) && /[A-F]/.test(text.slice(2));
  if (mixed) {
    let ok = false; try { ok = getAddress(text) === text; } catch { ok = false; }
    if (!ok) { lines.push({ tone: 'bad', text: 'The capital letters do not match this address’s built-in check, so at least one character is probably wrong. Copy it again from the source.' }); return { ...out('danger', 'This address has a typo'), grouped: '' }; }
    lines.push({ tone: 'good', text: 'Built-in check passed: no typing mistake in the letters.' });
  } else lines.push({ tone: 'info', text: 'All one case, so there is no built-in typo check. Compare it in groups of four below.' });

  if (BURN.has(address)) { lines.unshift({ tone: 'bad', text: 'This is a burn address. Anything sent there is gone for good.' }); return out('danger', 'Never send to this address'); }
  const contract = CONTRACTS.get(address);
  if (contract) {
    const here = contract.find(c => Number(c.chainId) === Number(ctx.chainId)) || contract[0];
    lines.unshift({ tone: 'bad', text: `This is the ${here.name} on ${here.network}, not a wallet. Assets sent to it are lost. FYNX also refuses contract recipients at review.` });
    return out('danger', 'This is a contract, not a wallet');
  }
  const wallets = knownWallets(ctx), me = wallets.get(address);
  const lookalikes = [...wallets.values()].filter(w => w.address !== address && trusted(w) && isLookalike(address, w.address));
  if (lookalikes.length && !(me && trusted(me))) {
    const w = lookalikes[0], ends = sharedEnds(address, w.address);
    lines.unshift({ tone: 'bad', text: `It shares the first ${ends.start} and last ${ends.end} characters with ${describe(w)} but is a different address. Scammers create look-alikes and send tiny transfers so you copy the wrong one from your history.` });
    if (me?.received) lines.push({ tone: 'bad', text: `This address sent you ${plural(me.received, 'transfer')}: a typical look-alike trick.` });
    lines.push({ tone: 'info', text: 'Copy the address from your own records or the receiving wallet, never from transaction history.' });
    return out('danger', 'Look-alike of a wallet you use');
  }
  if (ctx.own?.some(a => lower(a) === address)) { lines.push({ tone: 'warn', text: 'This is the wallet you are sending from. A transfer to yourself only costs a network fee.' }); return out('caution', 'This is your connected wallet'); }
  if (me && trusted(me)) {
    if (me.label) lines.push({ tone: 'good', text: `Your name for it: “${me.label}”.` });
    if (me.own) lines.push({ tone: 'good', text: me.registered ? 'One of your own wallets (it sent with FYNX in this browser).' : 'One of your own wallets.' });
    if (me.sent) lines.push({ tone: 'good', text: `You sent to it ${plural(me.sent, 'time')} in the loaded history${me.last ? `, last on ${me.last.slice(0, 10)} (UTC)` : ''}.` });
    if (me.received) lines.push({ tone: 'info', text: `It sent you ${plural(me.received, 'transfer')}.` });
    if (lookalikes.length) lines.push({ tone: 'warn', text: `Careful: ${describe(lookalikes[0])} looks very similar. Make sure this is the one you mean.` });
    return out('known', me.label ? `Known: ${me.label}` : 'A wallet you have used');
  }
  if (me?.received) lines.unshift({ tone: 'warn', text: `It only ever sent you ${plural(me.received, 'transfer')}; you have never sent to it. Make sure it really belongs to the person you are paying.` });
  lines.push({ tone: 'warn', text: 'New to you: not in your wallet names, your loaded history or FYNX’s record of your wallets. Send a small amount first and confirm it arrived.' });
  if (!ctx.historyLoaded) lines.push({ tone: 'info', text: 'Tip: load the history in Portfolio & history so FYNX can compare it with your past transfers.' });
  return out('caution', 'New recipient');
}
function checksummed(text) { try { return getAddress(text.toLowerCase()); } catch { return text; } }

// Scan a loaded history for look-alike activity. Returns suspects, newest first:
// [{ address, short, lookalikeOf: { address, label, short }, received, zeroValue, last, hashes }]
// An incoming transfer is suspect when its sender looks like a trusted wallet (one you named, own or sent to) but is
// not itself trusted. Zero-value incoming transfers from unknown senders are listed too ("zero-value").
export function poisoningSuspects(transfers, ctx = {}) {
  const wallets = knownWallets({ ...ctx, transfers });
  const trustedList = [...wallets.values()].filter(trusted);
  const out = new Map();
  for (const t of transfers || []) {
    if (t.direction !== 'in' || !lower(t.other)) continue;
    const from = wallets.get(lower(t.other));
    if (from && trusted(from)) continue;
    const like = trustedList.find(w => w.address !== from.address && isLookalike(from.address, w.address));
    const zero = t.units === 0n;
    if (!like && !zero) continue;
    const s = out.get(from.address) || { address: from.address, short: shortAddr(from.address), lookalikeOf: like ? { address: like.address, label: like.label, short: shortAddr(like.address) } : null, received: 0, zeroValue: 0, last: null, hashes: [] };
    s.received++; if (zero) s.zeroValue++;
    if (t.time && (!s.last || t.time > s.last)) s.last = t.time;
    s.hashes.push(t.hash);
    out.set(from.address, s);
  }
  return [...out.values()].sort((a, b) => Number(Boolean(b.lookalikeOf)) - Number(Boolean(a.lookalikeOf)) || String(b.last || '').localeCompare(String(a.last || '')));
}
export const suspectSet = suspects => new Set((suspects || []).map(s => s.address));
