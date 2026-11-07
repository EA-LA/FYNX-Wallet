// Account security checkup: pure helpers shared by the owner workspace and tests.
// Everything here is computed in the browser from the signed-in account and the owner session; nothing is sent or saved.
import { stepKey, stepState } from './launch-tracker.js';
export const FRESH_SIGNIN_MS = 5 * 60000; // the backend refuses security changes when the sign-in is older than this
export const IDLE_LIMIT_MS = 15 * 60000; // the workspace signs out after this much inactivity

export const methodLabels = { 'google.com': 'Google', password: 'Email & password', custom: 'Passkey', passkey: 'Passkey' };
export const methodLabel = id => methodLabels[id] || 'Other sign-in';

const DAY = 86400000;
const validTime = value => { const t = typeof value === 'number' ? value : Date.parse(value || ''); return Number.isFinite(t) && t > 0 ? t : 0; };

export function relativeTime(value, now = Date.now()) {
  const t = validTime(value);
  if (!t) return 'date unknown';
  const diff = Math.max(0, now - t);
  if (diff < 60000) return 'just now';
  if (diff < 3600000) { const m = Math.floor(diff / 60000); return `${m} minute${m === 1 ? '' : 's'} ago`; }
  if (diff < DAY) { const h = Math.floor(diff / 3600000); return `${h} hour${h === 1 ? '' : 's'} ago`; }
  const d = Math.floor(diff / DAY);
  if (d < 60) return `${d} day${d === 1 ? '' : 's'} ago`;
  const mo = Math.floor(d / 30);
  return mo < 24 ? `${mo} months ago` : `${Math.floor(d / 365)} years ago`;
}

// Passkeys, oldest first and numbered so the owner can tell them apart (the server stores no device names).
export function passkeyRows(passkeys, now = Date.now()) {
  const list = (Array.isArray(passkeys) ? passkeys : []).filter(k => k && typeof k.id === 'string');
  const sorted = [...list].sort((a, b) => (validTime(a.createdAt) || Infinity) - (validTime(b.createdAt) || Infinity));
  return sorted.map((key, i) => {
    const t = validTime(key.createdAt);
    return { id: key.id, label: `Passkey ${i + 1}`, added: t ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'recently', ago: t ? relativeTime(t, now) : '', time: t };
  });
}

// Ways the owner can get back in. Google and email password come from the Firebase account, passkeys from the session.
export function signInMethods({ providers = [], passkeys = [] } = {}) {
  const ids = new Set((providers || []).filter(p => typeof p === 'string'));
  const out = [];
  if (ids.has('google.com')) out.push('Google');
  if (ids.has('password')) out.push('Email & password');
  const n = Array.isArray(passkeys) ? passkeys.length : 0;
  if (n) out.push(n === 1 ? '1 passkey' : `${n} passkeys`);
  return out;
}

// Seconds-level helpers for the "this sign-in" panel.
export function freshness(authTime, now = Date.now()) {
  const t = validTime(authTime);
  if (!t) return { fresh: false, leftMs: 0 };
  const left = FRESH_SIGNIN_MS - (now - t);
  return { fresh: left > 0, leftMs: Math.max(0, left) };
}
export function idleLeft(lastActivity, now = Date.now()) {
  const t = validTime(lastActivity);
  return t ? Math.max(0, IDLE_LIMIT_MS - (now - t)) : IDLE_LIMIT_MS;
}
export const minutesText = ms => { const m = Math.ceil(ms / 60000); return m <= 1 ? 'under a minute' : `${m} minutes`; };

// The checkup list. Each check: id, state ('done' | 'todo' | 'info'), title, detail and an optional fix action.
export function checkup({ emailVerified = false, providers = [], passkeys = [], wallet = null } = {}) {
  const keys = Array.isArray(passkeys) ? passkeys.length : 0;
  const methods = signInMethods({ providers, passkeys });
  const hasPassword = (providers || []).includes('password'), hasGoogle = (providers || []).includes('google.com');
  const checks = [
    {
      id: 'email', state: emailVerified ? 'done' : 'todo', title: 'Owner email is verified',
      detail: emailVerified ? 'Firebase confirms you control this email address.' : 'The workspace only admits a verified owner email. Verify it through the link Firebase sends.',
    },
    {
      id: 'passkey', state: keys ? 'done' : 'todo', title: 'A passkey is added',
      detail: keys ? 'You can sign in with your device’s fingerprint, face or PIN. Phishing sites cannot use a passkey.' : 'A passkey lets you sign in with your device’s fingerprint, face or PIN, and phishing sites cannot use it.',
      fix: keys ? null : 'add-passkey',
    },
    {
      id: 'second-passkey', state: keys >= 2 ? 'done' : 'todo', title: 'A passkey on a second device',
      detail: keys >= 2 ? `You have ${keys} passkeys, so losing one device does not lock you out.` : 'Add one on your phone or tablet too (sign in there and press Add a passkey), so losing one device does not lock you out.',
      fix: keys >= 2 ? null : 'add-passkey',
    },
    {
      id: 'backup', state: methods.length >= 2 ? 'done' : 'todo', title: 'At least two ways to sign in',
      detail: methods.length >= 2 ? `Ways in: ${methods.join(', ')}.` : `Only ${methods[0] || 'one method'} works today. ${hasGoogle && !hasPassword ? 'Set an email password with “Set or reset an email password” on the sign-in screen, or add a passkey.' : 'Add a passkey as a second way in.'}`,
      fix: methods.length >= 2 ? null : 'add-passkey',
    },
    {
      id: 'wallet', state: wallet?.address ? 'done' : 'todo', title: 'Your wallet ownership is proven',
      detail: wallet?.address ? `Linked wallet ${shortAddress(wallet.address)}. Reconnect it in Crypto tools whenever you test.` : 'In Crypto tools, connect your wallet and approve the ownership message. It costs nothing and moves no funds.',
      fix: wallet?.address ? null : 'wallet',
    },
    {
      id: 'idle', state: 'info', title: 'Automatic sign-out is on',
      detail: 'This page keeps your sign-in in memory only and signs out after 15 minutes without activity or when the tab closes.',
    },
  ];
  const scored = checks.filter(c => c.state !== 'info');
  return { checks, done: scored.filter(c => c.state === 'done').length, total: scored.length };
}

export function shortAddress(address) {
  const a = String(address || '');
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'linked';
}

// A plain summary the owner can paste into a message. Counts and dates only: no email address, no wallet address, no ids.
export function summaryText({ result, methods, passkeys, signInWith, tests = null, now = Date.now() }) {
  const lines = [`FYNX owner account security checkup, ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC`, `${result.done} of ${result.total} checks done.`];
  for (const c of result.checks) lines.push(`- ${c.state === 'done' ? '[x]' : c.state === 'info' ? '[i]' : '[ ]'} ${c.title}`);
  lines.push(`Ways to sign in: ${methods.length ? methods.join(', ') : 'none recorded'}.`);
  if (signInWith) lines.push(`This sign-in used: ${signInWith}.`);
  if (passkeys.length) lines.push(`Passkeys: ${passkeys.map(p => `${p.label} added ${p.added}`).join('; ')}.`);
  if (tests?.total) lines.push(`Account-security launch tests: ${tests.done} of ${tests.total} recorded${tests.failed ? `, ${tests.failed} failed` : ''}.`);
  return lines.join('\n');
}

// The owner's Account security launch tests (identity gate), with their saved results. Shared with Launch readiness.
export function identityTests(plan, records = {}) { return gateTests(plan, records, 'identity'); }
// The owner's own test steps for one launch gate, with the results recorded in this browser.
export function gateTests(plan, records = {}, gateId) {
  const gate = (plan?.items || []).find(g => g.id === gateId);
  if (!gate) return { gate: null, steps: [], total: 0, done: 0, failed: 0 };
  const steps = (gate.steps || []).filter(s => s.by === 'you').map(step => {
    const key = stepKey(gate.id, step.id), rec = records[key] || {}, state = stepState(gate, step, records);
    return { step, key, state, result: step.done ? '' : rec.result || '', note: step.done ? '' : rec.note || '', fixed: !!step.done };
  });
  return { gate, steps, total: steps.length, done: steps.filter(s => s.state === 'done').length, failed: steps.filter(s => s.state === 'failed').length };
}
