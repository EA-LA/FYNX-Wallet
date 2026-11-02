// Optional local integration test for transaction status (confirmations, replacement, unknown hash)
// on a real local EVM with chain id 11155111. Install ganache@7.9.2 in an isolated tooling directory;
// FYNX_GANACHE_MODULE must be the absolute path to its dist/node/core.js. No network access is used.
import { pathToFileURL } from 'node:url';
import { WalletConnection } from '../wallet-src/wallet-client.js';
if (!process.env.FYNX_GANACHE_MODULE?.startsWith('/')) throw new Error('Set FYNX_GANACHE_MODULE to an isolated Ganache module path.');
const { default: ganache } = await import(pathToFileURL(process.env.FYNX_GANACHE_MODULE));
const chain = ganache.provider({ chain: { chainId: 11155111 }, wallet: { totalAccounts: 2 }, logging: { quiet: true } });
const [from, to] = await chain.request({ method: 'eth_accounts', params: [] });
const provider = { request: ({ method, params = [] }) => method === 'eth_requestAccounts' ? chain.request({ method: 'eth_accounts', params: [] }) : chain.request({ method, params }) };
const c = new WalletConnection(provider); await c.connect();
const out = [];
const send = tx => chain.request({ method: 'eth_sendTransaction', params: [{ from, to, value: '0x1', ...tx }] });
// 1. Mined transaction: confirmations grow, settles at 12.
const h1 = await send({});
let s = await c.transactionStatus(h1); out.push(['mined, 0 extra blocks', s.status, s.confirmations, s.settled]);
for (let i = 0; i < 11; i++) await chain.request({ method: 'evm_mine', params: [] });
s = await c.transactionStatus(h1); out.push(['mined + 11 blocks', s.status, s.confirmations, s.settled]);
// 2. Replacement: pause mining, send nonce N, replace with a higher fee, mine.
await chain.request({ method: 'miner_stop', params: [] });
const nonce = await chain.request({ method: 'eth_getTransactionCount', params: [from, 'pending'] });
const a = await send({ nonce, gasPrice: '0x3b9aca00' });
s = await c.transactionStatus(a); out.push(['in mempool', s.status, s.nonce]);
const b = await send({ nonce, gasPrice: '0x77359400', value: '0x0', to: from });
await chain.request({ method: 'evm_mine', params: [] }); await chain.request({ method: 'miner_start', params: [] });
s = await c.transactionStatus(a, { from, nonce: Number(nonce) }); out.push(['original after replacement', s.status]);
s = await c.transactionStatus(b); out.push(['replacement', s.status, s.confirmations]);
// 3. Unknown hash is not-seen, never confirmed.
s = await c.transactionStatus('0x' + '1'.repeat(64)); out.push(['unknown hash', s.status]);
console.table(out);
const ok = out[0][1] === 'confirmed' && out[1][2] === 12 && out[1][3] === true && out[2][1] === 'pending' && out[3][1] === 'replaced' && out[4][1] === 'confirmed' && out[5][1] === 'not-seen';
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
