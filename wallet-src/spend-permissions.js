// Spending permissions (Crypto tools → "Who can spend your USDC?"): read-only checks of the USDC allowances the
// connected wallet has given. An ERC-20 "approval" lets another contract move up to a set amount of a token out of
// the wallet later, without asking again; a forgotten unlimited approval to a contract that is later hacked or
// malicious is one of the most common ways people lose stablecoins. Pure helpers: the network is reached only
// through the `request` function the page passes in (the connected wallet's read calls). Nothing here signs,
// sends, approves or revokes anything; revoking stays in Step 4 ("Revoke swap allowance") or in the wallet itself.
import { NETWORKS } from '../firebase-wallet/functions/networks.js';
import { looksSecret } from './launch-tracker.js';

export const SPENDERS_KEY = 'fynx-owner-spenders-v1';
export const MAX_SPENDERS = 12;
export const MAX_LABEL = 40;
// From this many token units up, an allowance is treated as "no limit": wallets and apps that ask for an
// "unlimited" approval use 2^256 − 1 (or 2^255 and similar), far beyond any real supply.
export const UNLIMITED_FROM = 2n ** 128n;
// A reading is shown as current for this long; after that the card says how old it is.
export const PERMISSIONS_FRESH_MS = 10 * 60 * 1000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO = '0x0000000000000000000000000000000000000000';
// approve(address,uint256)
export const APPROVE_SELECTOR = '0x095ea7b3';

const lower = a => (typeof a === 'string' && ADDRESS.test(a) ? a.toLowerCase() : null);
const word = a => a.toLowerCase().slice(2).padStart(64, '0');
export const shortAddr = a => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

// Exact USDC amount (6 decimals) from token units, without rounding: 1500000n → "1.5".
export function usdcText(units) {
  if (typeof units !== 'bigint' || units < 0n) return '';
  const whole = units / 1000000n, frac = (units % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole.toLocaleString('en-US')}${frac ? `.${frac}` : ''}`;
}

// One read-only eth_call: allowance(owner, spender) on the network's pinned USDC contract (selector 0xdd62ed3e).
// Returns the allowance in token units (BigInt). Throws a plain sentence when it cannot be read.
export async function readAllowance(request, owner, spender, network = {}) {
  const o = lower(owner), s = lower(spender), usdc = lower(network.usdc);
  if (!usdc) throw new Error(`${network.name || 'This network'} has no USDC in FYNX.`);
  if (!o || !s) throw new Error('Enter a full address first.');
  const answer = await request({ method: 'eth_call', params: [{ to: usdc, data: `0xdd62ed3e${word(o)}${word(s)}` }, 'latest'] });
  if (typeof answer !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(answer)) throw new Error('The network gave an unreadable answer. Try again in a moment.');
  return BigInt(answer);
}

// Reads every target one after another (a handful of calls at most). Each row keeps its own answer or error,
// so one failing read never hides the others. Also reads the latest block and the wallet's USDC balance once.
export async function readPermissions(request, owner, targets, network = {}) {
  const [blockHex, balanceHex] = await Promise.all([
    request({ method: 'eth_blockNumber', params: [] }).catch(() => null),
    lower(network.usdc) && lower(owner) ? request({ method: 'eth_call', params: [{ to: network.usdc.toLowerCase(), data: `0x70a08231${word(owner)}` }, 'latest'] }).catch(() => null) : Promise.resolve(null),
  ]);
  const rows = [];
  for (const target of targets) {
    try { rows.push({ ...target, units: await readAllowance(request, owner, target.address, network) }); }
    catch (error) { rows.push({ ...target, units: null, error: error?.message || 'Could not be read.' }); }
  }
  const block = typeof blockHex === 'string' && /^0x[0-9a-fA-F]+$/.test(blockHex) ? Number(BigInt(blockHex)) : null;
  const balance = typeof balanceHex === 'string' && /^0x[0-9a-fA-F]{64}$/.test(balanceHex) ? BigInt(balanceHex) : null;
  return { chainId: Number(network.id) || null, owner: lower(owner), block, balance, rows };
}

export function allowanceState(units) {
  if (typeof units !== 'bigint') return 'unknown';
  if (units === 0n) return 'none';
  return units >= UNLIMITED_FROM ? 'unlimited' : 'limited';
}

// Plain words for one row: { state, tone, badge, text }.
export function describePermission(row, { network = {}, balance = null } = {}) {
  const token = network.testnet ? 'test USDC' : 'USDC', who = row.name || 'This contract';
  const state = allowanceState(row.units);
  if (state === 'unknown') return { state, tone: 'info', badge: 'Not read', text: row.error || 'Could not be read just now. Check again in a moment.' };
  if (state === 'none') return { state, tone: 'good', badge: 'Nothing allowed', text: `${who} cannot move any ${token} from your wallet.` };
  const all = typeof balance === 'bigint' && balance > 0n && row.units >= balance;
  const fix = row.pinned ? 'Use “Revoke swap allowance” in Step 4 when you are not about to swap.' : 'If you do not use this app any more, revoke it in your wallet (most wallets list approvals under security or token settings).';
  if (state === 'unlimited') return { state, tone: 'bad', badge: 'No limit', text: `${who} can move all of your ${token}, now and anything you receive later, without asking again. ${fix}` };
  const amount = `${usdcText(row.units)} ${token}`;
  return { state, tone: all ? 'warn' : 'info', badge: amount, text: `${who} can move up to ${amount} from your wallet without asking again${all ? ', which is everything you hold now' : ''}. ${row.pinned ? 'A swap of that size uses it up. ' : ''}${fix}` };
}

// One line under the list: how many permissions are open and how many have no limit.
export function permissionsHeadline(reading, network = {}) {
  const rows = reading?.rows || [];
  if (!rows.length) return `Nothing to check on ${network.name || 'this network'} yet. Add an app or contract below.`;
  const read = rows.filter(r => typeof r.units === 'bigint'), open = read.filter(r => r.units > 0n), unlimited = open.filter(r => r.units >= UNLIMITED_FROM);
  const missing = rows.length - read.length;
  const tail = missing ? ` ${missing} could not be read.` : '';
  if (!read.length) return `None of the ${rows.length} checks could be read just now. Try again in a moment.`;
  if (!open.length) return `No open USDC permissions among the ${read.length} checked on ${network.name || 'this network'}.${tail}`;
  return `${open.length} open USDC permission${open.length === 1 ? '' : 's'} on ${network.name || 'this network'}${unlimited.length ? `, ${unlimited.length} with no limit` : ''}.${tail}`;
}

// The contracts FYNX itself asks permission for on this network (today: the pinned Uniswap swap router), followed
// by the owner's saved addresses for the same network. Saved entries that repeat a pinned one are skipped.
export function permissionTargets(network = {}, saved = {}) {
  const out = [], seen = new Set();
  const router = lower(network.router);
  if (router) { out.push({ address: router, name: 'Uniswap swap router (used by FYNX swaps)', pinned: true }); seen.add(router); }
  for (const s of saved[String(network.id)] || []) {
    const a = lower(s?.address); if (!a || seen.has(a)) continue;
    seen.add(a); out.push({ address: a, name: s.label || '', pinned: false, addedAt: s.addedAt || null });
  }
  return out;
}

// Saved addresses ({ [chainId]: [{ address, label, addedAt }] }) from storage, cleaned: unknown networks, bad
// addresses, secret-looking or over-long names and duplicates are dropped; at most MAX_SPENDERS per network.
export function cleanSpenders(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [chain, list] of Object.entries(raw)) {
    if (!NETWORKS[chain] || !Array.isArray(list)) continue;
    const seen = new Set(), kept = [];
    for (const s of list) {
      const a = lower(s?.address); if (!a || seen.has(a) || kept.length >= MAX_SPENDERS) continue;
      const label = typeof s.label === 'string' && !looksSecret(s.label) ? s.label.trim().slice(0, MAX_LABEL) : '';
      seen.add(a); kept.push({ address: a, label, addedAt: Number.isFinite(s.addedAt) ? s.addedAt : 0 });
    }
    if (kept.length) out[chain] = kept;
  }
  return out;
}

// Adds an address to check on one network. Returns { saved, error }; the input object is never changed.
export function addSpender(saved, network = {}, address, label = '', { own = null, now = Date.now() } = {}) {
  const raw = String(address || '').trim(), name = String(label || '').trim();
  const a = lower(raw), chain = String(network.id);
  if (!NETWORKS[chain]) return { saved, error: 'Choose a network first.' };
  if (!a) return { saved, error: 'Enter the full address: 0x followed by 40 letters and numbers.' };
  if (a === ZERO) return { saved, error: 'That is the zero address; it cannot hold a permission.' };
  if (a === lower(own)) return { saved, error: 'That is your own connected wallet. Enter the app or contract you approved.' };
  if (a === lower(network.usdc)) return { saved, error: 'That is the USDC contract itself. Enter the app or contract that was given permission.' };
  if (a === lower(network.router)) return { saved, error: 'The Uniswap swap router is already checked.' };
  if (name.length > MAX_LABEL) return { saved, error: `Keep the name under ${MAX_LABEL} characters.` };
  if (looksSecret(name)) return { saved, error: 'That name looks like a secret. Never type recovery words or keys here.' };
  const list = saved?.[chain] || [];
  if (list.some(s => s.address === a)) return { saved, error: 'That address is already in the list.' };
  if (list.length >= MAX_SPENDERS) return { saved, error: `Up to ${MAX_SPENDERS} addresses per network. Remove one first.` };
  return { saved: { ...saved, [chain]: [...list, { address: a, label: name, addedAt: now }] }, error: '' };
}

export function removeSpender(saved, chainId, address) {
  const chain = String(chainId), a = lower(address), list = saved?.[chain] || [];
  const next = list.filter(s => s.address !== a);
  if (next.length === list.length) return saved;
  const out = { ...saved };
  if (next.length) out[chain] = next; else delete out[chain];
  return out;
}

// A confirmed transaction that called approve() on this network's USDC: the page re-reads the permissions then.
export function isApprovalCall(call, network = {}) {
  const usdc = lower(network.usdc);
  return !!usdc && lower(call?.to) === usdc && typeof call?.input === 'string' && call.input.toLowerCase().startsWith(APPROVE_SELECTOR);
}

// How old a reading is, in words: { stale, text }.
export function readingAge(checkedAt, now = Date.now()) {
  if (!Number.isFinite(checkedAt) || !Number.isFinite(now)) return { stale: true, text: '' };
  const minutes = Math.max(0, Math.floor((now - checkedAt) / 60000));
  const stale = now - checkedAt >= PERMISSIONS_FRESH_MS;
  const ago = minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} minute${minutes === 1 ? '' : 's'} ago` : `${Math.floor(minutes / 60)} hour${Math.floor(minutes / 60) === 1 ? '' : 's'} ago`;
  return { stale, text: `Read ${ago}${stale ? ': press Check permissions to read them again' : ''}.` };
}

// Evidence for the "Revoke swap allowance" launch test (swaps/revoke): only when the swap router's allowance was
// read as zero on a test network. Returns the note line, or '' when the reading does not show it.
export function revokeEvidence(reading, network = {}, at = Date.now()) {
  if (!reading || !network.testnet || reading.chainId !== Number(network.id)) return '';
  const row = (reading.rows || []).find(r => r.pinned);
  if (!row || row.units !== 0n) return '';
  const minute = new Date(at).toISOString().slice(0, 16).replace('T', ' ');
  return `Swap router allowance read as 0 USDC on ${network.name}${Number.isSafeInteger(reading.block) ? ` at block ${reading.block}` : ''} (${minute} UTC).`;
}

// The test note with the reading added (a newer reading replaces an older one). null when the note would get too long.
export function evidenceNote(line, existing = '', max = 280) {
  if (!line) return null;
  const parts = String(existing || '').split(/;\s*/).map(p => p.trim()).filter(p => p && !p.startsWith('Swap router allowance read as'));
  const note = [...parts, line.replace(/\.$/, '')].join('; ');
  return note.length <= max ? note : null;
}
