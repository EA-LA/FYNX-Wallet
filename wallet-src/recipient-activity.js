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
// its ETH balance and, when the network has USDC, its USDC balance. Throws a plain sentence on an unreadable answer.
export async function readRecipient(request, address, network = {}) {
  if (!ADDRESS.test(String(address || ''))) throw new Error('Enter a full wallet address first.');
  const a = address.toLowerCase();
  const usdc = ADDRESS.test(network.usdc || '') ? network.usdc.toLowerCase() : null;
  const [code, nonceHex, balanceHex, blockHex, usdcHex] = await Promise.all([
    request({ method: 'eth_getCode', params: [a, 'latest'] }),
    request({ method: 'eth_getTransactionCount', params: [a, 'latest'] }),
    request({ method: 'eth_getBalance', params: [a, 'latest'] }),
    request({ method: 'eth_blockNumber', params: [] }),
    // balanceOf(address): selector 0x70a08231 + the address padded to 32 bytes. A failure only hides the USDC line.
    usdc ? request({ method: 'eth_call', params: [{ to: usdc, data: `0x70a08231${a.slice(2).padStart(64, '0')}` }, 'latest'] }).catch(() => null) : Promise.resolve(null),
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
    sent: Number(sent), eth, usdc: usdcUnits,
  };
}

// Plain-language verdict for the facts above: { state, title, lines: [{ tone, text }] }.
export function describeActivity(facts, network = {}) {
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
