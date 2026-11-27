// Payment requests for Crypto tools → Step 2 "Receive crypto" (pure helpers; the page draws the QR and reads balances).
// A request is the owner's own verified address plus an optional amount, written as an EIP-681 link
// (ethereum:<to>@<chainId>?value=<wei> for ETH, ethereum:<usdc>@<chainId>/transfer?address=<to>&uint256=<units> for USDC)
// that phone wallets open with the amount filled in. "Watch for this payment" only compares read-only balance readings
// taken before and after; nothing here signs, sends, approves or stores anything.
import { getAddress } from 'ethers';

export const DECIMALS = Object.freeze({ ETH: 18, USDC: 6 });
export const WATCH_EVERY_MS = 15000;          // one balance reading every 15 seconds…
export const WATCH_FOR_MS = 10 * 60 * 1000;   // …for at most 10 minutes
const MAX_WHOLE_DIGITS = 12;                  // 999,999,999,999 is far above any sane request; longer is a typo

const plain = (units, decimals) => {
  const negative = units < 0n, abs = negative ? -units : units, base = 10n ** BigInt(decimals);
  const fraction = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${abs / base}${fraction ? `.${fraction}` : ''}`;
};
export const formatUnitsText = (units, symbol) => plain(units, DECIMALS[symbol]);

// "0.001" → { units: 1000000000000000n, text: '0.001' }. Empty → { units: null } (a request for any amount).
export function parseRequestAmount(value, symbol) {
  const decimals = DECIMALS[symbol];
  if (decimals === undefined) return { error: 'Only ETH and USDC can be requested.' };
  const text = String(value ?? '').trim();
  if (!text) return { units: null, text: '' };
  if (/,/.test(text)) return { error: 'Use a dot for decimals, for example 0.25 (no commas).' };
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return { error: `Enter an amount in ${symbol}, for example ${symbol === 'ETH' ? '0.001' : '5'}.` };
  const whole = match[1].replace(/^0+(?=\d)/, ''), fraction = (match[2] || '').replace(/0+$/, '');
  if (whole.length > MAX_WHOLE_DIGITS) return { error: 'That amount is too large. Check for extra digits.' };
  if (fraction.length > decimals) return { error: `${symbol} has at most ${decimals} decimal places.` };
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction || '0').padEnd(decimals, '0'));
  if (units <= 0n) return { error: 'The amount must be more than 0.' };
  return { units, text: plain(units, decimals) };
}

// The EIP-681 link a wallet opens. Without an amount it is exactly the plain receive link.
export function requestURI(network, address, symbol, units = null) {
  if (!network || !Number.isInteger(network.id)) throw new Error('Unknown network.');
  const to = getAddress(address);
  if (units !== null && (typeof units !== 'bigint' || units <= 0n)) throw new Error('The amount must be more than 0.');
  if (symbol === 'ETH') return `ethereum:${to}@${network.id}${units ? `?value=${units}` : ''}`;
  if (symbol === 'USDC') {
    if (!network.usdc) throw new Error('USDC is not available on this network.');
    return `ethereum:${getAddress(network.usdc)}@${network.id}/transfer?address=${to}${units ? `&uint256=${units}` : ''}`;
  }
  throw new Error('Only ETH and USDC can be requested.');
}

// One sentence under the QR code.
export function requestCaption(network, symbol, units) {
  const asset = network.testnet ? `test ${symbol}` : symbol;
  return units ? `This code asks for ${formatUnitsText(units, symbol)} ${asset} on ${network.name}.` : `This code asks for any amount of ${asset} on ${network.name}.`;
}

// A short message to paste into a chat or email. Public facts only: address, network, chain ID, amount.
export function requestMessage(network, address, symbol, units, uri) {
  const to = getAddress(address), asset = network.testnet ? `test ${symbol}` : symbol;
  const lines = [
    units ? `Please send ${formatUnitsText(units, symbol)} ${asset} to my wallet.` : `You can send ${asset} to my wallet.`,
    `Network: ${network.name} (chain ID ${network.id}). Only send ${symbol} on this network; anything sent on another network may be lost.`,
    `Address: ${to}`,
  ];
  if (symbol === 'USDC') lines.push(`Token: USDC, contract ${getAddress(network.usdc)}.`);
  lines.push(`Wallet link: ${uri}`);
  lines.push(network.testnet ? 'Test assets only: they have no monetary value.' : 'Real assets: check the address on your wallet screen before you approve.');
  lines.push('I will never ask for a recovery phrase, private key or code.');
  return lines.join('\n');
}

// Compare two read-only balance readings (decimal strings as the wallet returns them) for one asset.
// state: 'waiting' (no change), 'arrived' (at least the asked amount came in, or any increase when no amount was asked),
// 'partial' (less than asked came in), 'went-down' (the balance fell: something was sent out or fees were paid, so arrival
// cannot be judged from balances; use the history instead), 'unreadable'.
export function compareBalances(symbol, before, after, askedUnits = null) {
  const decimals = DECIMALS[symbol];
  if (decimals === undefined) return { state: 'unreadable' };
  const read = value => {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(String(value ?? '').trim());
    if (!m || (m[2] || '').length > decimals) return null;
    return BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt((m[2] || '').padEnd(decimals, '0') || '0');
  };
  const a = read(before), b = read(after);
  if (a === null || b === null) return { state: 'unreadable' };
  const change = b - a, changeText = formatUnitsText(change, symbol);
  if (change === 0n) return { state: 'waiting', change, changeText };
  if (change < 0n) return { state: 'went-down', change, changeText };
  if (askedUnits && change < askedUnits) return { state: 'partial', change, changeText, missing: askedUnits - change, missingText: formatUnitsText(askedUnits - change, symbol) };
  return { state: 'arrived', change, changeText, extra: askedUnits && change > askedUnits ? formatUnitsText(change - askedUnits, symbol) : '' };
}

// Should the watch take another reading? Stops after WATCH_FOR_MS, once arrived, or when the wallet/network changed.
export function watchNext(watch, now, current = {}) {
  if (!watch) return { go: false, reason: 'none' };
  if (current.address !== watch.address || current.chainId !== watch.chainId) return { go: false, reason: 'changed' };
  if (watch.result?.state === 'arrived') return { go: false, reason: 'arrived' };
  if (watch.result?.state === 'went-down') return { go: false, reason: 'went-down' };
  if (now - watch.startedAt >= WATCH_FOR_MS) return { go: false, reason: 'timeout' };
  return { go: true, wait: WATCH_EVERY_MS };
}

// The status line shown while (and after) watching.
export function watchLine(watch, now, symbol) {
  if (!watch) return '';
  const r = watch.result, asset = watch.testnet ? `test ${symbol}` : symbol;
  const mins = Math.max(0, Math.ceil((watch.startedAt + WATCH_FOR_MS - now) / 60000));
  const checked = watch.checks ? ` Checked ${watch.checks} time${watch.checks === 1 ? '' : 's'}.` : '';
  if (watch.stopped === 'changed') return 'Stopped watching: the wallet or network changed.';
  if (!r || r.state === 'waiting') {
    if (watch.stopped === 'timeout') return `Nothing new arrived in 10 minutes.${checked} Transfers can take longer when the network is busy: watch again, or load the history in Portfolio & history.`;
    if (watch.stopped === 'user') return `Stopped watching. Nothing new had arrived.${checked}`;
    return `Watching your ${asset} balance (${watch.startText} ${asset} at the start).${checked} Stops by itself in about ${mins} minute${mins === 1 ? '' : 's'}.`;
  }
  if (r.state === 'arrived') return `Arrived: +${r.changeText} ${asset}${r.extra ? ` (${r.extra} more than asked)` : ''}. Confirm the transaction in Portfolio & history or on the block explorer before you rely on it.`;
  if (r.state === 'partial') return `Part arrived: +${r.changeText} ${asset}, still ${r.missingText} short of the request.${watch.stopped ? '' : ' Still watching.'}`;
  if (r.state === 'went-down') return `Your ${asset} balance went down by ${r.changeText.replace(/^-/, '')} (something was sent or fees were paid), so arrival cannot be judged from the balance. Load the history in Portfolio & history instead.`;
  return 'The balance could not be read. Check that the wallet is still connected, then watch again.';
}
