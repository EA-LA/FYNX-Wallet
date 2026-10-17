import { getAddress, parseEther, formatEther, hexlify, toUtf8Bytes } from 'ethers';
export const CHAIN_ID = '0xaa36a7';
export const MAX_SEND = parseEther('0.01');
export class WalletConnection {
  #review = null;
  #closed = false;
  #sending = false;
  constructor(provider, onChange = () => {}) {
    this.provider = provider; this.address = null; this.epoch = 0;
    this.changed = () => { this.address = null; this.#review = null; this.epoch++; onChange(); };
    provider.on?.('accountsChanged', this.changed);
    provider.on?.('chainChanged', this.changed);
    provider.on?.('disconnect', this.changed);
  }
  close() {
    this.#closed = true;
    this.changed();
    for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) this.provider.removeListener?.(event, this.changed);
  }
  async connect() {
    if (this.#closed) throw new Error('Wallet disconnected. Connect again.');
    this.#review = null;
    const epoch = this.epoch;
    const accounts = await this.provider.request({ method: 'eth_requestAccounts' });
    if (epoch !== this.epoch) throw new Error('Wallet changed. Connect again.');
    if (!accounts?.[0]) throw new Error('No wallet account was selected.');
    this.address = getAddress(accounts[0]);
    await this.assertCurrent();
    return this.address;
  }
  async assertCurrent(epoch = this.epoch) {
    if (this.#closed || epoch !== this.epoch) throw new Error('Wallet changed. Connect and verify again.');
    const [chain, accounts] = await Promise.all([
      this.provider.request({ method: 'eth_chainId' }),
      this.provider.request({ method: 'eth_accounts' }),
    ]);
    if (BigInt(chain) !== BigInt(CHAIN_ID)) throw new Error('Switch your wallet to Sepolia. Mainnet transactions are disabled.');
    if (epoch !== this.epoch || !this.address || !accounts?.[0] || getAddress(accounts[0]) !== this.address) throw new Error('Wallet account changed. Connect and verify again.');
    return epoch;
  }
  async signChallenge(challenge) {
    const epoch = await this.assertCurrent();
    if (challenge.address !== this.address || challenge.chainId !== Number(BigInt(CHAIN_ID)) || challenge.expiresAt <= Date.now() || !challenge.message.startsWith(`ea-la.github.io wants you to sign in with your Ethereum account:\n${this.address}\n`) || !challenge.message.includes('\nURI: https://ea-la.github.io/FYNX-Wallet/owner.html\n')) throw new Error('The signing request is invalid.');
    const signature = await this.provider.request({ method: 'personal_sign', params: [hexlify(toUtf8Bytes(challenge.message)), this.address] });
    await this.assertCurrent();
    if (epoch !== this.epoch) throw new Error('Wallet changed while signing. Nothing was linked.');
    return signature;
  }
  async balance() {
    const epoch = await this.assertCurrent();
    const balance = await this.provider.request({ method: 'eth_getBalance', params: [this.address, 'latest'] });
    await this.assertCurrent(epoch);
    return formatEther(BigInt(balance));
  }
  async prepareTransfer(recipient, amount) {
    if (this.#sending) throw new Error('A transfer approval is already in progress. Check your wallet.');
    this.#review = null;
    const epoch = await this.assertCurrent();
    let to, value;
    try {
      if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) throw new Error();
      to = getAddress(recipient);
      if (/^0x0{40}$/i.test(to) || !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(amount)) throw new Error();
      value = parseEther(amount);
      if (value <= 0n || value > MAX_SEND) throw new Error();
    } catch { throw new Error('Enter a valid recipient and an amount above 0, up to 0.01 test ETH.'); }
    const tx = { from: this.address, to, value: `0x${value.toString(16)}`, chainId: CHAIN_ID };
    const code = await this.provider.request({ method: 'eth_getCode', params: [to, 'latest'] });
    if (code !== '0x' && code !== '0x0') throw new Error('This first version sends only to standard wallet addresses, not contracts.');
    const [gasResult, priceResult, balanceResult] = await Promise.all([
      this.provider.request({ method: 'eth_estimateGas', params: [tx] }),
      this.provider.request({ method: 'eth_gasPrice' }),
      this.provider.request({ method: 'eth_getBalance', params: [this.address, 'pending'] }),
    ]);
    const gas = BigInt(gasResult), price = BigInt(priceResult), balance = BigInt(balanceResult);
    if (gas < 21000n || gas > 30000n || price <= 0n) throw new Error('The transfer could not be estimated safely.');
    const fee = gas * price;
    if (balance < value + fee) throw new Error('Not enough Sepolia test ETH for the amount and network fee.');
    await this.assertCurrent();
    if (epoch !== this.epoch) throw new Error('Wallet changed. Review again.');
    this.#review = Object.freeze({ tx: Object.freeze({ ...tx, gas: `0x${gas.toString(16)}`, gasPrice: `0x${price.toString(16)}` }), amount: formatEther(value), fee: formatEther(fee), createdAt: Date.now(), epoch });
    return this.#review;
  }
  async sendTransfer(review) {
    if (this.#sending || !review || review !== this.#review || review.epoch !== this.epoch || Date.now() - review.createdAt > 60000 || review.tx.from !== this.address || review.tx.chainId !== CHAIN_ID) throw new Error('The review expired, was already used, or your wallet changed. Review again.');
    // Consume before any await: concurrent calls and uncertain wallet failures cannot reuse approval.
    this.#review = null; this.#sending = true;
    try {
      const epoch = await this.assertCurrent(review.epoch);
      const balance = BigInt(await this.provider.request({ method: 'eth_getBalance', params: [this.address, 'pending'] }));
      if (balance < BigInt(review.tx.value) + BigInt(review.tx.gas) * BigInt(review.tx.gasPrice)) throw new Error('Not enough test ETH for the amount and network fee.');
      const code = await this.provider.request({ method: 'eth_getCode', params: [review.tx.to, 'latest'] });
      if (code !== '0x' && code !== '0x0') throw new Error('The recipient changed. Only standard wallet addresses are supported.');
      await this.assertCurrent(epoch);
      const hash = await this.provider.request({ method: 'eth_sendTransaction', params: [review.tx] });
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('The wallet did not return a valid transaction hash. Check your wallet before retrying.');
      // A hash may already have been broadcast even if the user disconnects while approving.
      return hash;
    } finally { this.#sending = false; }
  }
  async receipt(hash) {
    if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Invalid transaction hash.');
    const epoch = await this.assertCurrent();
    const receipt = await this.provider.request({ method: 'eth_getTransactionReceipt', params: [hash] });
    await this.assertCurrent(epoch);
    if (!receipt || !receipt.blockNumber) return { status: 'pending' };
    const block = /^0x[0-9a-f]+$/i.test(receipt.blockNumber) ? Number(BigInt(receipt.blockNumber)) : NaN;
    if (receipt.transactionHash?.toLowerCase() !== hash.toLowerCase() || !['0x0', '0x1'].includes(receipt.status) || !Number.isSafeInteger(block) || block <= 0) throw new Error('Transaction confirmation could not be verified.');
    return { status: receipt.status === '0x1' ? 'confirmed' : 'failed', block };
  }
}
