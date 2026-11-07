// Real-money (Base mainnet) sending: the owner's own switch and per-transfer limits.
// Shared by the server (which stores the setting after a fresh sign-in) and the owner workspace
// (which refuses to prepare anything above the limits). Swaps on mainnet stay off.
import { parseUnits } from 'ethers';

export const MAINNET_ID = 8453;
// Hard ceilings for the pilot. The owner picks limits at or below these; raising them is a code change.
export const MAINNET_CAPS = Object.freeze({ ETH: '0.1', USDC: '250' });
export const TEST_LIMITS = Object.freeze({ ETH: '0.01', USDC: '25' });
export const CONFIRM_PHRASE = 'TURN ON REAL MONEY';
const DECIMALS = { ETH: 18, USDC: 6 };
export const OFF = Object.freeze({ enabled: false, ETH: null, USDC: null, updatedAt: null });

function limit(value, symbol) {
  const text = String(value ?? '').trim();
  if (!new RegExp(`^(0|[1-9]\\d{0,5})(\\.\\d{1,${DECIMALS[symbol]}})?$`).test(text)) throw new Error(`Enter the ${symbol} limit as a number, for example ${symbol === 'ETH' ? '0.02' : '50'}.`);
  const amount = parseUnits(text, DECIMALS[symbol]);
  if (amount <= 0n) throw new Error(`The ${symbol} limit must be above 0.`);
  if (amount > parseUnits(MAINNET_CAPS[symbol], DECIMALS[symbol])) throw new Error(`The ${symbol} limit can be at most ${MAINNET_CAPS[symbol]} ${symbol} per transfer during the pilot.`);
  return text.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

// Validate a change requested by the owner. Turning on needs both limits and the typed phrase.
export function cleanMainnetRequest(input) {
  if (typeof input?.enabled !== 'boolean') throw new Error('Choose on or off.');
  if (!input.enabled) return { enabled: false, ETH: null, USDC: null };
  if (String(input.confirm || '').trim() !== CONFIRM_PHRASE) throw new Error(`Type ${CONFIRM_PHRASE} to confirm.`);
  return { enabled: true, ETH: limit(input.ETH, 'ETH'), USDC: limit(input.USDC, 'USDC') };
}

// Read a stored (or server-sent) setting defensively: anything odd means off.
export function readMainnet(raw) {
  if (!raw || raw.enabled !== true) return OFF;
  try { return Object.freeze({ enabled: true, ETH: limit(raw.ETH, 'ETH'), USDC: limit(raw.USDC, 'USDC'), updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null }); }
  catch { return OFF; }
}

// Per-transfer limit for a network and asset, or null when sending is not allowed there.
export function sendLimit(network, symbol, setting) {
  if (!DECIMALS[symbol]) return null;
  if (network.testnet) return TEST_LIMITS[symbol];
  const s = readMainnet(setting);
  return network.id === MAINNET_ID && s.enabled ? s[symbol] : null;
}
