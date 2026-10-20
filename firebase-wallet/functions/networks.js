// Public contract addresses from Circle, Base and Uniswap deployment documentation.
// Production signing is a release gate, never an API-key or browser preference.
const definitions = [
  { id: 11155111, name: 'Ethereum Sepolia', rpc: 'https://ethereum-sepolia-rpc.publicnode.com', explorer: 'https://sepolia.etherscan.io', testnet: true, usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' },
  { id: 84532, name: 'Base Sepolia', rpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org', testnet: true, usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', weth: '0x4200000000000000000000000000000000000006', factory: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', quoter: '0xC5290058841028F1614F3A6F0F5816cAd0df5E27', router: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4' },
  { id: 8453, name: 'Base', rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org', testnet: false, usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', weth: '0x4200000000000000000000000000000000000006', factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD', quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a', router: '0x2626664c2603336E57B271c5C0b26F421741e481' },
];
export const NETWORKS = Object.freeze(Object.fromEntries(definitions.map(n => [n.id, Object.freeze({ ...n, hex: `0x${n.id.toString(16)}`, transactionsEnabled: n.testnet })])));
export function networkFor(id) {
  const network = NETWORKS[id];
  if (!network || !Number.isSafeInteger(Number(id))) throw new Error('Unsupported network.');
  return network;
}
