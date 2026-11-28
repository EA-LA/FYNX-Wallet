// Swap result (Crypto tools → Step 4 Swap and Step 5 Track): what a confirmed ETH ↔ USDC swap really did, read from
// its receipt on the network. You paid, you received, how that compares with the quote you approved, the price the
// pool gave and the network fee. Read-only: the network is reached only through the `request` function the page
// passes in (the connected wallet's read calls). Nothing here signs, sends or changes a swap.
//
// Only a single Uniswap v3 swap in the network's own WETH/USDC pool is described. The pool is checked on the network
// (its token0, token1 and fee, then the factory must return that same pool), so a look-alike pool emitting the same
// event is never reported as an ETH ↔ USDC swap.
import { Interface, formatUnits } from 'ethers';

export const SWAP_TOPIC = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
export const SWAP_STATES = Object.freeze(['swap', 'failed', 'not-swap', 'several', 'unknown-pool', 'waiting']);
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const QUANTITY = /^0x[0-9a-fA-F]+$/;
const POOL = new Interface(['function token0() view returns(address)', 'function token1() view returns(address)', 'function fee() view returns(uint24)']);
const FACTORY = new Interface(['function getPool(address,address,uint24) view returns(address)']);
const TWO_255 = 1n << 255n, TWO_256 = 1n << 256n;

const lower = v => String(v || '').toLowerCase();
const big = v => (typeof v === 'string' && QUANTITY.test(v) ? BigInt(v) : null);
const signed = word => { const v = BigInt(`0x${word}`); return v >= TWO_255 ? v - TWO_256 : v; };
const addressWord = topic => (typeof topic === 'string' && /^0x[0-9a-fA-F]{64}$/.test(topic) ? `0x${topic.slice(26).toLowerCase()}` : null);

// Plain amount: no trailing zeros, thousands separators, at most `places` decimals (rounded down, never up).
export function amountText(units, decimals, places = 6) {
  if (typeof units !== 'bigint') return '—';
  const negative = units < 0n, abs = negative ? -units : units;
  const [whole, frac = ''] = formatUnits(abs, decimals).split('.');
  const cut = frac.slice(0, places).replace(/0+$/, '');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${cut ? `.${cut}` : ''}`;
}

// The Swap events in a receipt (any emitter): { pool, recipient, amount0, amount1 } with signed amounts from the
// pool's side (positive: the pool received it; negative: the pool paid it out). Malformed events are skipped.
export function swapLogs(receipt) {
  const out = [];
  for (const log of Array.isArray(receipt?.logs) ? receipt.logs : []) {
    if (!log || lower(log.topics?.[0]) !== SWAP_TOPIC || !ADDRESS.test(log.address || '')) continue;
    const data = typeof log.data === 'string' && /^0x[0-9a-fA-F]*$/.test(log.data) ? log.data.slice(2) : '';
    if (data.length < 64 * 5) continue;
    out.push({ pool: lower(log.address), recipient: addressWord(log.topics?.[2]), amount0: signed(data.slice(0, 64)), amount1: signed(data.slice(64, 128)) });
  }
  return out;
}

// Reads one emitter's tokens and fee and asks the factory whether it is the real pool for them. Returns
// { pool, token0, token1, fee } for the network's WETH/USDC pool, null for anything else.
export async function verifyPool(request, pool, network = {}) {
  if (!ADDRESS.test(pool || '') || !ADDRESS.test(network.factory || '') || !ADDRESS.test(network.weth || '') || !ADDRESS.test(network.usdc || '')) return null;
  const call = async (to, iface, method, values = []) => iface.decodeFunctionResult(method, await request({ method: 'eth_call', params: [{ to, data: iface.encodeFunctionData(method, values) }, 'latest'] }));
  try {
    const [[token0], [token1], [fee]] = await Promise.all([call(pool, POOL, 'token0'), call(pool, POOL, 'token1'), call(pool, POOL, 'fee')]);
    const pair = [lower(token0), lower(token1)].sort().join(), want = [lower(network.weth), lower(network.usdc)].sort().join();
    if (pair !== want) return null;
    const [real] = await call(network.factory, FACTORY, 'getPool', [token0, token1, fee]);
    if (lower(real) !== lower(pool)) return null;
    return { pool: lower(pool), token0: lower(token0), token1: lower(token1), fee: Number(fee) };
  } catch { return null; }
}

// Network fee the wallet paid: gas used × effective gas price, plus the L1 data fee Base reports on its receipts.
export function networkFee(receipt) {
  const used = big(receipt?.gasUsed), price = big(receipt?.effectiveGasPrice);
  if (used === null || price === null) return null;
  const l1 = big(receipt?.l1Fee);
  return used * price + (l1 ?? 0n);
}

// quote (optional): what the page showed before you approved: { amountIn, expectedOut, minimum, slippageBps, inSymbol, outSymbol }
// as BigInt units (ETH in wei, USDC in 6-decimal units). Compared only when the direction and amount paid match.
export function summarizeSwap({ hash, tx = null, receipt = null, network = {}, wallet = '', pools = new Map(), quote = null } = {}) {
  const base = { hash: lower(hash), chainId: Number(network.id) || null, network: network.name || '' };
  if (!receipt?.blockNumber) return { ...base, state: 'waiting', headline: 'Not confirmed yet. The swap result is read once it is in a block.' };
  const block = Number(BigInt(receipt.blockNumber));
  if (receipt.status !== '0x1') return { ...base, state: 'failed', block, headline: 'This swap failed on the network: nothing was swapped. Only the network fee was paid.', feeWei: networkFee(receipt) };
  const logs = swapLogs(receipt);
  if (!logs.length) return { ...base, state: 'not-swap', block, headline: 'No swap happened in this transaction (for example an approval, a revoke or a transfer).' };
  const ours = logs.filter(l => pools.has(l.pool));
  if (!ours.length) return { ...base, state: 'unknown-pool', block, headline: `A swap happened, but not in ${network.name || 'this network'}'s ETH/USDC pool that FYNX uses. Check it on the explorer.` };
  if (logs.length > 1) return { ...base, state: 'several', block, headline: 'This transaction made more than one swap. FYNX describes single ETH ↔ USDC swaps only: check it on the explorer.' };
  const log = ours[0], pool = pools.get(log.pool), weth = lower(network.weth);
  const wethIs0 = pool.token0 === weth;
  const ethSide = wethIs0 ? log.amount0 : log.amount1, usdcSide = wethIs0 ? log.amount1 : log.amount0;
  if (!((ethSide > 0n && usdcSide < 0n) || (ethSide < 0n && usdcSide > 0n))) return { ...base, state: 'not-swap', block, headline: 'The pool event does not show one asset in and one out. Check it on the explorer.' };
  const ethIn = ethSide > 0n;
  const paid = ethIn ? { symbol: 'ETH', decimals: 18, units: ethSide } : { symbol: 'USDC', decimals: 6, units: usdcSide };
  const received = ethIn ? { symbol: 'USDC', decimals: 6, units: -usdcSide } : { symbol: 'ETH', decimals: 18, units: -ethSide };
  const from = lower(tx?.from), mine = !wallet || !from || from === lower(wallet);
  // USDC per 1 ETH, from the amounts actually swapped (pool fee included), to 2 decimals, rounded down.
  const ethUnits = ethIn ? paid.units : received.units, usdcUnits = ethIn ? received.units : paid.units;
  const priceCents = ethUnits > 0n ? usdcUnits * 10n ** 18n / ethUnits / 10_000n : null;
  const result = {
    ...base, state: 'swap', block, direction: ethIn ? 'eth-usdc' : 'usdc-eth', paid, received, mine, from: from || null,
    pool: pool.pool, poolFee: pool.fee, feeWei: networkFee(receipt),
    price: priceCents === null ? null : `1 ETH = ${amountText(priceCents / 100n, 0)}.${(priceCents % 100n).toString().padStart(2, '0')} USDC`,
    toRouter: Boolean(log.recipient && ADDRESS.test(network.router || '') && log.recipient === lower(network.router)),
  };
  const q = quote && typeof quote.expectedOut === 'bigint' && quote.expectedOut > 0n && quote.inSymbol === paid.symbol && quote.outSymbol === received.symbol && quote.amountIn === paid.units ? quote : null;
  if (q) {
    const diff = received.units - q.expectedOut;
    result.quote = { expected: q.expectedOut, minimum: typeof q.minimum === 'bigint' ? q.minimum : null, slippageBps: Number(q.slippageBps) || null, diffBps: Number(diff * 10000n / q.expectedOut), diff, belowMinimum: typeof q.minimum === 'bigint' && received.units < q.minimum };
  }
  result.headline = `${mine ? 'You' : 'This wallet'} paid ${amountText(paid.units, paid.decimals)} ${paid.symbol} and received ${amountText(received.units, received.decimals)} ${received.symbol}.`;
  return result;
}

// How the amount received compares with the quote, in one plain sentence.
export function quoteLine(result) {
  const q = result?.quote;
  if (!q) return '';
  const pct = (Math.abs(q.diffBps) / 100).toFixed(2), sym = result.received.symbol, limit = q.slippageBps ? `${(q.slippageBps / 100).toFixed(1)}%` : null;
  if (q.belowMinimum) return `Less than the minimum you approved. Report this: the swap should have been refused by the network.`;
  if (q.diff === 0n) return 'Exactly the amount quoted.';
  if (q.diff > 0n) return `${pct}% more than quoted (${amountText(q.diff, result.received.decimals)} ${sym} extra).`;
  return `${q.diffBps === 0 ? 'Under 0.01%' : `${pct}%`} less than quoted (${amountText(-q.diff, result.received.decimals)} ${sym})${limit ? `, within your ${limit} slippage limit` : ''}.`;
}

// Rows for the result card: [name, value].
export function swapRows(result, { testnet = true } = {}) {
  if (!result) return [];
  const rows = [];
  if (result.state === 'swap') {
    rows.push(['You paid', `${amountText(result.paid.units, result.paid.decimals)} ${result.paid.symbol}`]);
    rows.push(['You received', `${amountText(result.received.units, result.received.decimals)} ${result.received.symbol}${result.received.symbol === 'ETH' && result.toRouter ? ' (paid out as ETH by the swap router)' : ''}`]);
    if (result.quote) {
      rows.push(['Quote you approved', `${amountText(result.quote.expected, result.received.decimals)} ${result.received.symbol} expected${result.quote.minimum !== null ? `, at least ${amountText(result.quote.minimum, result.received.decimals)}` : ''}`]);
      rows.push(['Compared with the quote', quoteLine(result)]);
    }
    if (result.price) rows.push([testnet ? 'Rate in this test pool' : 'Rate you got', `${result.price}${testnet ? ' (test network, not a market price)' : ' (pool fee included)'}`]);
    rows.push(['Pool', `Uniswap v3 ETH/USDC, ${(result.poolFee / 10000).toString()}% pool fee`]);
    if (!result.mine) rows.push(['Sent by', `${result.from} (not the connected wallet)`]);
  }
  if (typeof result.feeWei === 'bigint') rows.push(['Network fee paid', `${amountText(result.feeWei, 18, 8) === '0' ? '< 0.00000001' : amountText(result.feeWei, 18, 8)} ETH`]);
  if (Number.isSafeInteger(result.block)) rows.push(['Block', String(result.block)]);
  return rows;
}

// The launch test this swap is evidence for: ETH → USDC is "swap-eth", USDC → ETH is "swap-usdc" (only on a test
// network, only for the connected wallet's own swap).
export function swapStep(result, network = {}) {
  if (result?.state !== 'swap' || !result.mine || !network.testnet) return null;
  return result.direction === 'eth-usdc' ? 'swaps/swap-eth' : 'swaps/swap-usdc';
}

// One line for the launch test note: public facts only, the transaction ID shortened (a full 64-character ID next
// to other words could look like a key to the note's secret check, and the explorer link has it anyway).
export function swapEvidence(result) {
  if (result?.state !== 'swap' || !HASH.test(result.hash || '')) return '';
  const q = result.quote ? ` (quoted ${amountText(result.quote.expected, result.received.decimals)})` : '';
  const fee = typeof result.feeWei === 'bigint' ? `, network fee ${amountText(result.feeWei, 18, 8)} ETH` : '';
  return `Swap ${result.hash.slice(0, 10)}… on ${result.network}, block ${result.block}: paid ${amountText(result.paid.units, result.paid.decimals)} ${result.paid.symbol}, received ${amountText(result.received.units, result.received.decimals)} ${result.received.symbol}${q}${fee}.`;
}

// The note with the line added; a line for the same swap replaces the earlier one. null when it would not fit.
export function swapEvidenceNote(line, existing = '', max = 280) {
  if (!line) return null;
  const id = line.includes('…') ? line.slice(0, line.indexOf('…') + 1) : '';
  const kept = String(existing || '').split(/;\s*/).map(p => p.trim()).filter(p => p && !(id && p.startsWith(id)));
  const note = [...kept, line.replace(/\.$/, '')].join('; ');
  return note.length <= max ? note : null;
}

// Reads the receipt and transaction, checks every pool that emitted a Swap event, then summarizes.
export async function readSwapResult(request, hash, { network = {}, wallet = '', quote = null } = {}) {
  if (!HASH.test(String(hash || ''))) throw new Error('Enter a valid transaction hash.');
  const [tx, receipt] = await Promise.all([
    request({ method: 'eth_getTransactionByHash', params: [hash] }),
    request({ method: 'eth_getTransactionReceipt', params: [hash] }),
  ]);
  if (receipt && receipt.transactionHash && lower(receipt.transactionHash) !== lower(hash)) throw new Error('The network answered for a different transaction. Try again.');
  const pools = new Map();
  if (receipt?.blockNumber && receipt.status === '0x1') {
    const emitters = [...new Set(swapLogs(receipt).map(l => l.pool))].slice(0, 4);
    for (const pool of emitters) { const p = await verifyPool(request, pool, network); if (p) pools.set(p.pool, p); }
  }
  return summarizeSwap({ hash, tx, receipt, network, wallet, pools, quote });
}

// Whether a looked-up or tracked transaction is worth reading as a swap: confirmed, and sent to the network's swap router.
export function looksLikeSwap(result, network = {}) {
  return result?.status === 'confirmed' && ADDRESS.test(network.router || '') && lower(result.call?.to) === lower(network.router);
}
