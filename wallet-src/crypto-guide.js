// Crypto tools test guide: pure helpers shared by the owner workspace and tests.
// Reads the current page state only; it never signs, sends or changes a transaction.
import { stepKey, stepState } from './launch-tracker.js';

// Official faucet pages (no real value). Base lists its faucets at docs.base.org; Circle runs the test USDC faucet.
export const FAUCETS = Object.freeze({
  84532: Object.freeze({
    eth: [
      { label: 'Base’s faucet list', url: 'https://docs.base.org/base-chain/tools/network-faucets' },
      { label: 'Coinbase Developer Platform faucet', url: 'https://portal.cdp.coinbase.com/onchain-tools/faucet' },
    ],
    usdc: [{ label: 'Circle test USDC faucet (choose Base Sepolia)', url: 'https://faucet.circle.com/' }],
  }),
  11155111: Object.freeze({
    eth: [
      { label: 'Google Cloud Sepolia faucet', url: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia' },
      { label: 'Coinbase Developer Platform faucet', url: 'https://portal.cdp.coinbase.com/onchain-tools/faucet' },
    ],
    usdc: [{ label: 'Circle test USDC faucet (choose Ethereum Sepolia)', url: 'https://faucet.circle.com/' }],
  }),
});
export const faucetsFor = networkId => FAUCETS[networkId] || { eth: [], usdc: [] };

// "0.0123 ETH" / "12.5" → number; anything unreadable → null (unknown, not zero).
export function amountOf(text) {
  const match = String(text ?? '').trim().match(/^([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

// state: { walletsFound, network: { id, name, testnet }, connected, verified, eth, usdc, transactions: [{ status, network: { id } }] }
export function setupSteps(state = {}) {
  const network = state.network || {}, testnet = !!network.testnet;
  const eth = amountOf(state.eth), usdc = amountOf(state.usdc);
  const onNetwork = (state.transactions || []).filter(t => t?.network?.id === network.id);
  const confirmed = onNetwork.filter(t => t.status === 'confirmed').length;
  const pending = onNetwork.filter(t => t.status === 'pending').length;
  const balancesKnown = state.verified && (eth !== null || usdc !== null);
  const steps = [
    { id: 'wallet', title: 'A wallet extension is available', done: !!state.walletsFound, target: 'wallet-choice',
      detail: state.walletsFound ? 'Choose it under Wallet provider.' : 'Install or unlock an Ethereum wallet extension (for example MetaMask, or Ledger Live’s browser connection), then reload this page.' },
    { id: 'network', title: 'A test network is selected', done: testnet, target: 'network-choice',
      detail: testnet ? `${network.name}: test assets only, no monetary value.` : `${network.name || 'This network'} is read-only. Pick Base Sepolia or Ethereum Sepolia to test sending and swapping.` },
    { id: 'connect', title: 'Wallet connected', done: !!state.connected, target: 'connect-wallet',
      detail: state.connected ? 'Connected. A connection alone does not prove ownership.' : 'Press Connect wallet and approve the connection in your wallet.' },
    { id: 'verify', title: 'Ownership verified', done: !!state.verified, target: 'verify-wallet',
      detail: state.verified ? 'FYNX checked your wallet signature.' : 'Press Review ownership message, read it, then approve it in your wallet. It costs nothing and sends nothing.' },
    { id: 'eth', title: 'Test ETH for network fees', done: testnet && eth !== null && eth > 0, target: 'refresh-balance', faucet: 'eth',
      detail: !testnet ? 'Only needed on a test network.' : !balancesKnown ? 'Verify your wallet to read the balance.' : eth > 0 ? `${state.eth} available.` : 'Balance is 0. Get free test ETH from a faucet below, then press Refresh balance.' },
    { id: 'usdc', title: 'Test USDC (for USDC transfers and swaps)', done: testnet && usdc !== null && usdc > 0, target: 'refresh-balance', faucet: 'usdc', optional: true,
      detail: !testnet ? 'Only needed on a test network.' : !balancesKnown ? 'Verify your wallet to read the balance.' : usdc > 0 ? `${state.usdc} available.` : 'Balance is 0. Optional: get test USDC from Circle’s faucet, or swap a little test ETH for USDC.' },
    { id: 'confirmed', title: 'A test transaction confirmed', done: confirmed > 0, target: 'send-form',
      detail: confirmed ? `${confirmed} confirmed on ${network.name} in this page session.` : pending ? `${pending} submitted and waiting. Press Check confirmation.` : 'Send 0.001 test ETH to a second address you control, then press Check confirmation.' },
  ];
  const current = steps.find(s => !s.done && !s.optional) || steps.find(s => !s.done);
  for (const s of steps) s.state = s.done ? 'done' : s === current ? 'current' : 'todo';
  const required = steps.filter(s => !s.optional);
  return { steps, done: required.filter(s => s.done).length, total: required.length, ready: required.every(s => s.done) };
}

// Owner launch tests that are carried out on the Crypto tools tab, grouped by gate (checklist order).
export function walletTests(plan, records = {}) {
  const groups = [];
  for (const gate of plan.items || []) {
    const steps = (gate.steps || []).filter(s => s.by === 'you' && !s.done && (s.tab === 'wallet' || (gate.id === 'signing' && !s.tab)));
    if (!steps.length) continue;
    groups.push({ gate, steps: steps.map(step => ({ step, key: stepKey(gate.id, step.id), state: stepState(gate, step, records), result: records[stepKey(gate.id, step.id)]?.result || '' })) });
  }
  const all = groups.flatMap(g => g.steps);
  return { groups, total: all.length, done: all.filter(s => s.state === 'done').length, failed: all.filter(s => s.state === 'failed').length };
}

// Steps whose evidence is a transaction ID, so the latest one from this page session can be added to the note.
export const TX_STEPS = new Set(['signing/send-eth', 'signing/send-usdc', 'signing/ledger', 'swaps/swap-eth', 'swaps/swap-usdc', 'swaps/revoke', 'swaps/ledger', 'assets/lookup']);
const HASH = /^0x[0-9a-f]{64}$/i;
export function txNote(item, existing = '') {
  if (!item || !HASH.test(item.hash || '')) return null;
  const line = `${item.network?.name || 'Network'} tx ${item.hash} (${item.status || 'pending'})`;
  const prev = String(existing || '').trim();
  if (prev.includes(item.hash)) return prev;
  const note = prev ? `${prev}; ${line}` : line;
  return note.length <= 280 ? note : null;
}

// Plain-text summary of the wallet launch tests for a message or email. Step results only: no notes, addresses or transaction IDs.
export function walletTestSummary(plan, records = {}, { now = Date.now() } = {}) {
  const { groups, total, done, failed } = walletTests(plan, records);
  const marks = { pass: '[x]', skip: '[-]', fail: '[!]' }, labels = { pass: 'Passed', fail: 'Failed', skip: 'Not applicable' };
  const lines = [`FYNX crypto launch tests, ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC`, `${done} of ${total} recorded${failed ? `, ${failed} failed` : ''}.`];
  for (const { gate, steps } of groups) {
    const recorded = steps.filter(s => s.state === 'done').length;
    lines.push('', `${gate.title}: ${recorded}/${steps.length}`);
    for (const { step, result } of steps) lines.push(`- ${marks[result] || '[ ]'} ${step.text}${result ? ` (${labels[result]})` : ''}`);
  }
  lines.push('', 'Notes and transaction IDs are kept in the full test report on Launch readiness.');
  return lines.join('\n');
}

// What the swap card should say for the selected network and wallet state.
export function swapHint(network = {}, { verified = false } = {}) {
  if (!network.router) return { state: 'blocked', text: `${network.name || 'This network'} has no swap route in FYNX. Switch Network (step 1) to Base Sepolia to test a swap with test assets.` };
  if (!verified) return { state: 'todo', text: 'Connect and verify your wallet in step 1 first, then enter an amount and press Get quote.' };
  if (!network.transactionsEnabled) return { state: 'info', text: `${network.name} is read-only: you can compare a real quote, but swapping is off. Switch to Base Sepolia to complete a test swap.` };
  return { state: 'ready', text: 'Ready. Enter an amount and press Get quote. Test pools can be thin: if no quote comes back, try a smaller amount or the other direction.' };
}
