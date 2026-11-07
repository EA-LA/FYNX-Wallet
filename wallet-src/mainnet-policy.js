// The owner's real-money setting for this signed-in session (from the server), read by the wallet clients.
// Cleared on sign-out. Anything missing or malformed means real-money sending is off.
import { readMainnet, sendLimit, OFF } from '../firebase-wallet/functions/mainnet.js';
let current = OFF;
export const setMainnetPolicy = raw => { current = readMainnet(raw); };
export const mainnetPolicy = () => current;
export const canTransact = network => sendLimit(network, 'ETH', current) !== null;
export const limitFor = (network, symbol) => sendLimit(network, symbol, current);
