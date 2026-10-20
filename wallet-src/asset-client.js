import { Interface, getAddress, parseUnits, formatUnits, formatEther } from 'ethers';
import { WalletConnection } from './wallet-client.js';
export const ERC20 = new Interface([
  'function balanceOf(address) view returns(uint256)', 'function decimals() view returns(uint8)',
  'function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)',
  'function transfer(address,uint256) returns(bool)',
]);
export const ROUTER = new Interface([
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256)',
  'function multicall(uint256 deadline,bytes[] data) payable returns(bytes[])',
  'function unwrapWETH9(uint256 amountMinimum,address recipient) payable',
]);
const QUOTER = new Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
const FACTORY = new Interface(['function getPool(address,address,uint24) view returns(address)']);
const POOL = new Interface(['function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)']);
const hex = value => `0x${BigInt(value).toString(16)}`;
const isContract = code => typeof code === 'string' && /^0x[0-9a-f]+$/i.test(code) && !['0x', '0x0'].includes(code);
export function assetInfo(network, symbol) {
  if (symbol === 'ETH') return Object.freeze({ symbol, decimals: 18, address: null, max: '0.01' });
  if (symbol === 'USDC') return Object.freeze({ symbol, decimals: 6, address: network.usdc, max: '25' });
  throw new Error('Only ETH and canonical USDC are supported.');
}
export function parseAmount(value, asset) {
  if (typeof value !== 'string' || value.length > 40 || !new RegExp(`^(0|[1-9]\\d*)(\\.\\d{1,${asset.decimals}})?$`).test(value)) throw new Error(`Enter a valid ${asset.symbol} amount with up to ${asset.decimals} decimal places.`);
  const amount = parseUnits(value, asset.decimals);
  if (amount <= 0n || amount > parseUnits(asset.max, asset.decimals)) throw new Error(`The testing limit is ${asset.max} ${asset.symbol} per transaction.`);
  return amount;
}
export function receiveURI(network, address, symbol = 'ETH') {
  const to = getAddress(address), asset = assetInfo(network, symbol);
  return symbol === 'ETH' ? `ethereum:${to}@${network.id}` : `ethereum:${asset.address}@${network.id}/transfer?address=${to}`;
}
export class AssetConnection extends WalletConnection {
  #action = null;
  #quote = null;
  #busy = false;
  async prepareTransfer(recipient, amount) { this.cancelAction(); return super.prepareTransfer(recipient, amount); }
  async call(to, iface, method, values = [], block = 'latest') {
    const data = await this.provider.request({ method: 'eth_call', params: [{ to, data: iface.encodeFunctionData(method, values) }, block] });
    return iface.decodeFunctionResult(method, data);
  }
  async tokenBalance(symbol = 'USDC') {
    const epoch = await this.assertCurrent(), asset = assetInfo(this.network, symbol);
    if (symbol === 'ETH') return this.balance();
    const [decimals, balance] = await Promise.all([this.call(asset.address, ERC20, 'decimals'), this.call(asset.address, ERC20, 'balanceOf', [this.address])]);
    await this.assertCurrent(epoch);
    if (Number(decimals[0]) !== asset.decimals) throw new Error('Token decimals do not match the approved asset.');
    return formatUnits(balance[0], asset.decimals);
  }
  async #funds(tx, asset, amount) {
    const balance = BigInt(await this.provider.request({ method: 'eth_getBalance', params: [this.address, 'pending'] }));
    if (balance < BigInt(tx.value) + BigInt(tx.gas) * BigInt(tx.gasPrice)) throw new Error('Not enough ETH for the amount and network fee. Keep extra ETH for network fees.');
    if (asset?.address && amount > 0n) {
      const [tokens] = await this.call(asset.address, ERC20, 'balanceOf', [this.address], 'pending');
      if (tokens < amount) throw new Error(`Not enough ${asset.symbol}.`);
    }
  }
  async #simulate(tx, kind) {
    const data = await this.provider.request({ method: 'eth_call', params: [tx, 'pending'] });
    if (['token-transfer', 'approval'].includes(kind) && ERC20.decodeFunctionResult(kind === 'approval' ? 'approve' : 'transfer', data)[0] !== true) throw new Error('Token simulation did not confirm this operation.');
  }
  async #prepare(tx, details, asset, amount, expiresAt = Date.now() + 60000) {
    this.assertTransactionsEnabled();
    if (this.#busy) throw new Error('An approval is already in progress.');
    this.#action = null; this.cancelTransfer();
    const epoch = await this.assertCurrent();
    const base = { ...tx, from: this.address, chainId: this.network.hex, value: tx.value || '0x0' };
    if (!isContract(await this.provider.request({ method: 'eth_getCode', params: [base.to, 'latest'] }))) throw new Error('The approved contract is unavailable on this network.');
    await this.#simulate(base, details.kind);
    const [gasResult, gasPrice] = await Promise.all([
      this.provider.request({ method: 'eth_estimateGas', params: [base] }), this.provider.request({ method: 'eth_gasPrice' }),
    ]);
    const estimate = BigInt(gasResult), price = BigInt(gasPrice);
    if (estimate < 21000n || estimate > 1500000n || price <= 0n || price > 1000000000000n) throw new Error('Network fee could not be estimated safely.');
    const gas = (estimate * 120n + 99n) / 100n;
    const transaction = Object.freeze({ ...base, gas: hex(gas), gasPrice: hex(price) });
    await this.#funds(transaction, asset, amount);
    await this.assertCurrent(epoch);
    if (expiresAt <= Date.now()) throw new Error('The quote expired. Request a new quote.');
    this.#action = Object.freeze({ ...details, tx: transaction, asset, amount, epoch, expiresAt, fee: formatEther(gas * price) });
    return this.#action;
  }
  async prepareTokenTransfer(recipient, amount, symbol = 'USDC') {
    this.#action = null; this.assertTransactionsEnabled();
    const asset = assetInfo(this.network, symbol);
    if (!asset.address) throw new Error('Use the native ETH transfer flow.');
    const to = getAddress(recipient), value = parseAmount(amount, asset);
    if (/^0x0{40}$/i.test(to) || to === this.address || to.toLowerCase() === asset.address.toLowerCase()) throw new Error('Choose another valid recipient wallet.');
    const epoch = await this.assertCurrent();
    const code = await this.provider.request({ method: 'eth_getCode', params: [to, 'latest'] });
    if (code !== '0x' && code !== '0x0') throw new Error('This release sends only to standard wallet addresses, not contracts.');
    await this.tokenBalance(symbol); // Pin decimals before converting or sending.
    await this.assertCurrent(epoch);
    return this.#prepare({ to: asset.address, data: ERC20.encodeFunctionData('transfer', [to, value]) }, { kind: 'token-transfer', recipient: to, displayAmount: `${formatUnits(value, asset.decimals)} ${symbol}` }, asset, value);
  }
  async quoteSwap(symbol, amount, slippageBps = 50) {
    this.#quote = null; this.#action = null; this.cancelTransfer();
    const epoch = await this.assertCurrent(), n = this.network;
    if (!n.router) throw new Error('Choose Base Sepolia to test swaps.');
    if (![10, 50, 100].includes(slippageBps)) throw new Error('Slippage must be 0.1%, 0.5% or 1%.');
    const assetIn = assetInfo(n, symbol), assetOut = assetInfo(n, symbol === 'ETH' ? 'USDC' : 'ETH');
    const amountIn = parseAmount(amount, assetIn), tokenIn = assetIn.address || n.weth, tokenOut = assetOut.address || n.weth;
    const [decimals] = await this.call(n.usdc, ERC20, 'decimals');
    if (Number(decimals) !== 6) throw new Error('Token decimals do not match the approved asset.');
    const block = await this.provider.request({ method: 'eth_blockNumber' });
    if (!/^0x[0-9a-f]+$/i.test(block)) throw new Error('Could not read the current block.');
    const candidates = await Promise.allSettled([500, 3000, 10000].map(async fee => {
      const [pool] = await this.call(n.factory, FACTORY, 'getPool', [tokenIn, tokenOut, fee], block);
      if (/^0x0{40}$/i.test(pool)) throw new Error('No pool');
      const [slot, quote] = await Promise.all([
        this.call(pool, POOL, 'slot0', [], block),
        this.call(n.quoter, QUOTER, 'quoteExactInputSingle', [[tokenIn, tokenOut, amountIn, fee, 0]], block),
      ]);
      const amountOut = quote[0], square = slot[0] ** 2n, q192 = 1n << 192n;
      if (square === 0n || amountOut <= 0n) throw new Error('No liquidity');
      const spotOut = BigInt(tokenIn) < BigInt(tokenOut) ? amountIn * square / q192 : amountIn * q192 / square;
      if (spotOut <= 0n) throw new Error('No price');
      const impactBps = Number(spotOut > amountOut ? (spotOut - amountOut) * 10000n / spotOut : 0n);
      if (impactBps > 300) throw new Error('Price impact exceeds 3%');
      return { fee, pool, amountOut, impactBps };
    }));
    await this.assertCurrent(epoch);
    const routes = candidates.filter(r => r.status === 'fulfilled').map(r => r.value).sort((a, b) => a.amountOut > b.amountOut ? -1 : 1);
    if (!routes.length) throw new Error('No liquid route below 3% price impact was found. Test networks may have no liquidity. No transaction was requested.');
    const route = routes[0], minimum = route.amountOut * BigInt(10000 - slippageBps) / 10000n;
    if (minimum <= 0n) throw new Error('Amount is too small to swap.');
    this.#quote = Object.freeze({ ...route, tokenIn, tokenOut, assetIn, assetOut, amountIn, minimum, slippageBps, block, epoch, address: this.address, chainId: n.id, expiresAt: Date.now() + 60000, output: formatUnits(route.amountOut, assetOut.decimals), minimumOutput: formatUnits(minimum, assetOut.decimals) });
    return this.#quote;
  }
  async prepareSwap(quote) {
    this.assertTransactionsEnabled(); this.#action = null;
    if (!quote || quote !== this.#quote || quote.epoch !== this.epoch || quote.address !== this.address || quote.expiresAt <= Date.now()) throw new Error('Quote expired or wallet changed. Request a new quote.');
    const epoch = await this.assertCurrent(quote.epoch), n = this.network;
    if (quote.assetIn.address) {
      const [allowance] = await this.call(quote.assetIn.address, ERC20, 'allowance', [this.address, n.router]);
      await this.assertCurrent(epoch);
      if (allowance < quote.amountIn) {
        const approved = allowance === 0n ? quote.amountIn : 0n;
        return this.#prepare({ to: quote.assetIn.address, data: ERC20.encodeFunctionData('approve', [n.router, approved]) }, { kind: 'approval', recipient: n.router, displayAmount: approved === 0n ? 'Reset existing allowance to 0 USDC' : `Approve exactly ${formatUnits(approved, 6)} USDC`, quote }, quote.assetIn, 0n, quote.expiresAt);
      }
    }
    const calls = [ROUTER.encodeFunctionData('exactInputSingle', [[quote.tokenIn, quote.tokenOut, quote.fee, quote.assetOut.address ? this.address : n.router, quote.amountIn, quote.minimum, 0]])];
    if (!quote.assetOut.address) calls.push(ROUTER.encodeFunctionData('unwrapWETH9', [quote.minimum, this.address]));
    const deadline = Math.floor(quote.expiresAt / 1000);
    const tx = { to: n.router, value: quote.assetIn.address ? '0x0' : hex(quote.amountIn), data: ROUTER.encodeFunctionData('multicall', [deadline, calls]) };
    return this.#prepare(tx, { kind: 'swap', recipient: this.address, displayAmount: `${formatUnits(quote.amountIn, quote.assetIn.decimals)} ${quote.assetIn.symbol} → at least ${quote.minimumOutput} ${quote.assetOut.symbol}`, quote }, quote.assetIn, quote.amountIn, quote.expiresAt);
  }
  async prepareRevoke() {
    this.assertTransactionsEnabled();
    if (!this.network.router) throw new Error('No swap router on this network.');
    const asset = assetInfo(this.network, 'USDC');
    return this.#prepare({ to: asset.address, data: ERC20.encodeFunctionData('approve', [this.network.router, 0]) }, { kind: 'approval', recipient: this.network.router, displayAmount: 'Revoke the FYNX swap router allowance (0 USDC)' }, asset, 0n);
  }
  cancelAction() { this.#action = null; this.#quote = null; }
  async sendAction(review) {
    this.assertTransactionsEnabled();
    if (this.#busy || !review || review !== this.#action || review.epoch !== this.epoch || review.expiresAt <= Date.now()) throw new Error('Review expired, was already used, or wallet changed.');
    this.#action = null; this.#quote = null; this.#busy = true;
    try {
      const epoch = await this.assertCurrent(review.epoch);
      if (review.kind === 'token-transfer') {
        const code = await this.provider.request({ method: 'eth_getCode', params: [review.recipient, 'latest'] });
        if (code !== '0x' && code !== '0x0') throw new Error('The recipient changed. Review again.');
      }
      await this.#funds(review.tx, review.asset, review.amount);
      await this.#simulate(review.tx, review.kind);
      await this.assertCurrent(epoch);
      if (review.expiresAt <= Date.now()) throw new Error('Review expired. Request a new quote.');
      const hash = await this.provider.request({ method: 'eth_sendTransaction', params: [review.tx] });
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('No valid transaction hash returned. Check your wallet before retrying.');
      return hash;
    } finally { this.#busy = false; }
  }
  async inspectTransaction(hash) {
    const epoch = await this.assertCurrent();
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Enter a valid transaction hash.');
    const tx = await this.provider.request({ method: 'eth_getTransactionByHash', params: [hash] });
    if (!tx || tx.hash?.toLowerCase() !== hash.toLowerCase()) throw new Error('Transaction not found on this network.');
    const receipt = await this.receipt(hash);
    await this.assertCurrent(epoch);
    return { ...receipt, from: getAddress(tx.from), to: tx.to ? getAddress(tx.to) : null };
  }
}
