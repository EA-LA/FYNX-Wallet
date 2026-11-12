// Recipient check on the network (Crypto tools → Step 3 Send): read-only facts about a recipient address on the
// selected network, plus the "name this wallet" offer after a confirmed transfer. Pure helpers: the network is
// reached only through the `request` function the page passes in (the connected wallet's read calls).
// Nothing here signs, sends, fills in or blocks anything; the transfer review keeps all of its own checks
// (it still refuses contract recipients by itself).

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const QUANTITY = /^0x[0-9a-fA-F]+$/;
// EIP-7702: an ordinary wallet that delegated its behaviour to a contract has the code 0xef0100 + 20-byte address.
const DELEGATION = /^0xef0100([0-9a-fA-F]{40})$/;
export const ACTIVITY_STATES = Object.freeze(['contract', 'delegated', 'active', 'received-only', 'unused']);
// A check is shown again for this long; after that the card offers to check again.
export const ACTIVITY_FRESH_MS = 10 * 60 * 1000;

const big = value => { if (typeof value !== 'string' || !QUANTITY.test(value)) return null; try { return BigInt(value); } catch { return null; } };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const activityKey = (chainId, address) => `${Number(chainId)}:${String(address || '').toLowerCase()}`;

// Reads, for one address: its code (wallet, contract or upgraded wallet), how many transactions it has sent (nonce),
// its ETH balance and, when the network has USDC, its USDC balance and whether USDC's issuer has blocked it
// (FiatToken isBlacklisted). Throws a plain sentence on an unreadable answer.
export async function readRecipient(request, address, network = {}) {
  if (!ADDRESS.test(String(address || ''))) throw new Error('Enter a full wallet address first.');
  const a = address.toLowerCase();
  const usdc = ADDRESS.test(network.usdc || '') ? network.usdc.toLowerCase() : null;
  const word = `${a.slice(2).padStart(64, '0')}`;
  const [code, nonceHex, balanceHex, blockHex, usdcHex, blockedHex] = await Promise.all([
    request({ method: 'eth_getCode', params: [a, 'latest'] }),
    request({ method: 'eth_getTransactionCount', params: [a, 'latest'] }),
    request({ method: 'eth_getBalance', params: [a, 'latest'] }),
    request({ method: 'eth_blockNumber', params: [] }),
    // balanceOf(address): selector 0x70a08231 + the address padded to 32 bytes. A failure only hides the USDC line.
    usdc ? request({ method: 'eth_call', params: [{ to: usdc, data: `0x70a08231${word}` }, 'latest'] }).catch(() => null) : Promise.resolve(null),
    // isBlacklisted(address): selector 0xfe575a87. A failure (or an odd answer) means "not known", never "blocked".
    usdc ? request({ method: 'eth_call', params: [{ to: usdc, data: `0xfe575a87${word}` }, 'latest'] }).catch(() => null) : Promise.resolve(null),
  ]);
  const sent = big(nonceHex), eth = big(balanceHex), block = big(blockHex);
  if (typeof code !== 'string' || !/^0x[0-9a-fA-F]*$/.test(code) || sent === null || eth === null || block === null || sent > 10n ** 12n) {
    throw new Error('The network gave an unreadable answer. Try again in a moment.');
  }
  const usdcUnits = typeof usdcHex === 'string' && /^0x[0-9a-fA-F]{1,64}$/.test(usdcHex) ? BigInt(usdcHex) : null;
  const bare = code === '0x' || /^0x0*$/.test(code);
  const delegated = code.match(DELEGATION);
  return {
    address: a, chainId: Number(network.id) || null, block: Number(block),
    kind: bare ? 'wallet' : delegated ? 'delegated' : 'contract',
    delegate: delegated ? `0x${delegated[1].toLowerCase()}` : null,
    sent: Number(sent), eth, usdc: usdcUnits, usdcBlocked: blockedAnswer(blockedHex),
  };
}

// A Solidity bool comes back as one 32-byte word: ...0 (false) or ...1 (true). Anything else is "not known" (null).
export function blockedAnswer(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) return null;
  const n = BigInt(value);
  return n === 1n ? true : n === 0n ? false : null;
}

// The USDC issuer's block list, as lines for the verdict. Only a clear "yes" is reported as blocked.
function blockedLines(facts, where, testnet) {
  if (facts.usdcBlocked !== true) return [];
  const token = testnet ? 'test USDC' : 'USDC';
  return [
    { tone: 'bad', text: `Circle, the company that issues USDC, has blocked this address on ${where}. The USDC contract refuses every ${token} transfer to or from it, so a transfer would fail and still cost a network fee.` },
    { tone: 'info', text: 'Do not send USDC here. ETH is not affected by this list, but a blocked address is a strong sign that something is wrong: ask the person why before sending anything.' },
  ];
}

// Plain-language verdict for the facts above: { state, title, lines: [{ tone, text }] }.
export function describeActivity(facts, network = {}) {
  const verdict = describeWallet(facts, network);
  if (!verdict) return null;
  const blocked = blockedLines(facts, network.name || 'this network', Boolean(network.testnet));
  return blocked.length ? { ...verdict, usdcBlocked: true, title: `USDC blocked · ${verdict.title}`, lines: [...blocked, ...verdict.lines] } : { ...verdict, usdcBlocked: false };
}

function describeWallet(facts, network = {}) {
  const where = network.name || 'this network';
  const test = network.testnet ? ' Many real wallets have never been used on a test network, so this is common here.' : '';
  if (!facts) return null;
  const holds = [facts.eth > 0n ? (network.testnet ? 'test ETH' : 'ETH') : '', facts.usdc && facts.usdc > 0n ? (network.testnet ? 'test USDC' : 'USDC') : ''].filter(Boolean);
  const holding = holds.length ? `It holds ${holds.join(' and ')}.` : 'It holds no ETH or USDC.';
  if (facts.kind === 'contract') {
    return { state: 'contract', title: `A contract on ${where}`, lines: [
      { tone: 'bad', text: `This address runs code on ${where}: it is a contract, not a personal wallet. Many contracts cannot pass assets on, so anything sent there can be stuck for good.` },
      { tone: 'info', text: 'FYNX’s review refuses contract recipients in this release. Ask the person for a normal wallet address.' },
    ] };
  }
  if (facts.kind === 'delegated') {
    return { state: 'delegated', title: `An upgraded wallet on ${where}`, lines: [
      { tone: 'warn', text: `This wallet has handed its behaviour to a contract (a “smart account” upgrade, EIP-7702)${facts.delegate ? `: ${facts.delegate.slice(0, 6)}…${facts.delegate.slice(-4)}` : ''}. Scam drainers use the same upgrade.` },
      { tone: 'info', text: 'FYNX’s review sends only to plain wallets in this release, so it will refuse this address. Ask the person whether they set this up themselves.' },
    ] };
  }
  if (facts.sent > 0) {
    return { state: 'active', title: `In use on ${where}`, lines: [
      { tone: 'good', text: `It has sent ${plural(facts.sent, 'transaction')} on ${where}, so a person or app controls it. ${holding}` },
      { tone: 'info', text: 'Being in use does not prove it belongs to the person you are paying. Compare it in groups of four with their wallet screen.' },
    ] };
  }
  if (holds.length) {
    return { state: 'received-only', title: `Received, never sent on ${where}`, lines: [
      { tone: 'info', text: `It has never sent a transaction on ${where}. ${holding} That is normal for a wallet that only receives.` },
      { tone: 'warn', text: 'If the person says they use this wallet every day on this network, ask them to copy the address again.' },
    ] };
  }
  return { state: 'unused', title: `Never used on ${where}`, lines: [
    { tone: 'warn', text: `No transactions and nothing held on ${where}. That is normal for a brand-new wallet, but a mistyped or invented address looks exactly the same.${test}` },
    { tone: 'info', text: 'If the person says they have used it before, the address is probably wrong. Otherwise send a small amount first and ask them to confirm it arrived.' },
  ] };
}

// The newest confirmed transfer from this page to `address` on `chainId`, when that wallet has no name yet.
// items: journal entries { hash, to, network: { id }, result: { status }, submittedAt }. Returns { hash, at } or null.
export function nameOffer(items, address, chainId, labels = {}) {
  if (!ADDRESS.test(String(address || ''))) return null;
  const a = address.toLowerCase();
  if (labels?.[a]?.label) return null;
  const done = [...(items || [])].filter(i => i && typeof i.to === 'string' && i.to.toLowerCase() === a && Number(i.network?.id) === Number(chainId) && i.result?.status === 'confirmed')
    .sort((x, y) => (y.submittedAt || 0) - (x.submittedAt || 0));
  return done.length ? { hash: done[0].hash, at: done[0].checkedAt || done[0].submittedAt || null } : null;
}

// Automatic network check after a full address is pasted (optional, on by default): at most one read per network and
// address for this page session, only for a well-formed address that passed the built-in checks, only with a wallet
// connected and nothing else running. A manual "Check again" is always available.
export function pasteCheckDue({ enabled, pasted, result, network, attempted, busy } = {}) {
  if (!enabled || !pasted || busy || !network?.id) return false;
  if (!result?.address || !result.grouped || result.state === 'invalid' || result.state === 'empty') return false;
  return !attempted?.has?.(activityKey(network.id, result.address));
}

// The connected wallet's own place on USDC's block list (Crypto tools → Step 2 Balances). Circle's FiatToken refuses
// every transfer from a blocked address too, so the owner should know before preparing a USDC transfer or swap.
// One read-only eth_call (isBlacklisted, selector 0xfe575a87) on the pinned USDC contract. Returns true / false, or
// null when the network has no USDC in FYNX or the answer is missing or odd ("not known", never "blocked").
export async function readOwnBlock(request, address, network = {}) {
  if (!ADDRESS.test(String(address || '')) || !ADDRESS.test(network.usdc || '')) return null;
  const word = address.toLowerCase().slice(2).padStart(64, '0');
  try { return blockedAnswer(await request({ method: 'eth_call', params: [{ to: network.usdc.toLowerCase(), data: `0xfe575a87${word}` }, 'latest'] })); }
  catch { return null; }
}

// Plain words for Step 2 (where: 'balances') and Step 3 / Step 4 when USDC is chosen (where: 'send' / 'swap').
// Returns { tone, text } or null (nothing worth saying there).
export function ownBlockNotice(blocked, network = {}, where = 'balances') {
  const name = network.name || 'this network', token = network.testnet ? 'test USDC' : 'USDC';
  if (!ADDRESS.test(network.usdc || '')) return where === 'balances' ? { tone: 'info', text: `${name} has no USDC in FYNX, so there is no USDC block list to check.` } : null;
  if (blocked === true) {
    if (where === 'send') return { tone: 'bad', text: `Your connected wallet is on USDC’s block list on ${name}. The USDC contract will refuse this transfer, and the failed attempt still costs a network fee. Send ETH instead, or use another wallet.` };
    if (where === 'swap') return { tone: 'bad', text: `Your connected wallet is on USDC’s block list on ${name}, so a swap that pays in or out ${token} will fail and still cost a network fee.` };
    return { tone: 'bad', text: `Circle, the company that issues USDC, has blocked your connected wallet on ${name}. Every ${token} transfer to or from it is refused, so ${token} here cannot be moved. ETH is not affected. If this is your real wallet, contact Circle support; do not keep sending.` };
  }
  if (where !== 'balances') return null;
  if (blocked === false) return { tone: 'good', text: `Not on USDC’s block list on ${name}: ${token} can move normally.` };
  return { tone: 'info', text: `Could not read USDC’s block list on ${name} just now. Refresh balance to try again.` };
}

// How old the own-wallet block-list reading is. Fresh for OWN_BLOCK_FRESH_MS; after that the Step 2 line says
// how long ago it was read, and choosing USDC in Step 3 reads it again (read-only).
export const OWN_BLOCK_FRESH_MS = 10 * 60 * 1000;
export function ownBlockAge(checkedAt, now = Date.now()) {
  if (!Number.isFinite(checkedAt) || !Number.isFinite(now)) return { stale: true, text: '' };
  const minutes = Math.max(0, Math.floor((now - checkedAt) / 60000));
  if (now - checkedAt < OWN_BLOCK_FRESH_MS) return { stale: false, text: minutes < 1 ? 'Checked just now.' : `Checked ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago.` };
  const hours = Math.floor(minutes / 60);
  const ago = hours >= 1 ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : `${minutes} minutes`;
  return { stale: true, text: `Checked ${ago} ago: Refresh balance to check again (choosing USDC in Step 3 also re-checks).` };
}
