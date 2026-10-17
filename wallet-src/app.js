import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, inMemoryPersistence, setPersistence, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, sendPasswordResetEmail, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { firebaseConfig, recaptchaEnterpriseSiteKey, functionsRegion } from '../public-site/firebase-config.js';
import { WalletConnection, CHAIN_ID } from './wallet-client.js';

const $ = selector => document.querySelector(selector);
const setText = (id, text) => { $(id).textContent = text; };
const show = (id, visible) => { $(id).hidden = !visible; };
let auth, api, session, connection, challenge, review, pendingHash;
let generation = 0, verifiedAddress = null, busy = false, lastActivity = Date.now();
let dashboardFrame = null, dashboardLoading = false, dashboardTimer;
const providers = new Map();
function selectTab(name) {
  for (const tab of document.querySelectorAll('[data-tab]')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  for (const panel of document.querySelectorAll('.panel')) panel.hidden = panel.id !== `tab-${name}`;
  setText('#workspace-status', '');
}
function clearDashboard() {
  clearTimeout(dashboardTimer);
  dashboardFrame?.remove(); dashboardFrame = null; dashboardLoading = false;
  $('#dashboard-container').replaceChildren();
  setText('#dashboard-status', ''); show('#retry-dashboard', false);
}
async function loadDashboard() {
  if (!session || dashboardLoading || dashboardFrame) return;
  const expected = generation;
  dashboardLoading = true;
  setText('#dashboard-status', 'Loading your dashboard…'); show('#retry-dashboard', false);
  try {
    const result = await api({ action: 'dashboard' });
    if (expected !== generation || !session || !auth.currentUser) return;
    if (typeof result.html !== 'string' || !result.html.startsWith('<!doctype html>')) throw new Error('Dashboard unavailable. Please try again.');
    const frame = document.createElement('iframe');
    frame.title = 'FYNX Wallet interactive dashboard'; frame.className = 'dashboard-frame';
    // Opaque origin: the preview cannot read the owner DOM, Firebase tokens, storage, or wallet provider.
    frame.setAttribute('sandbox', 'allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox');
    frame.referrerPolicy = 'no-referrer'; frame.srcdoc = result.html;
    dashboardFrame = frame; $('#dashboard-container').append(frame);
    dashboardTimer = setTimeout(() => {
      if (expected !== generation || dashboardFrame !== frame) return;
      clearDashboard();
      setText('#dashboard-status', 'The dashboard did not open. Refresh this page to load the latest version, then sign in again.');
      show('#retry-dashboard', true);
    }, 15000);
  } catch (error) {
    if (expected !== generation) return;
    setText('#dashboard-status', errorMessage(error)); show('#retry-dashboard', true);
  } finally { if (expected === generation) dashboardLoading = false; }
}
window.addEventListener('message', event => {
  if (!session || !dashboardFrame || event.source !== dashboardFrame.contentWindow || event.origin !== 'null') return;
  const type = event.data?.type;
  if (type === 'fynx-dashboard:ready') { clearTimeout(dashboardTimer); setText('#dashboard-status', ''); }
  if (['fynx-dashboard:activity', 'fynx-dashboard:navigate', 'fynx-dashboard:wallet', 'fynx-dashboard:launch'].includes(type)) lastActivity = Date.now();
  if (type === 'fynx-dashboard:wallet') selectTab('wallet');
  if (type === 'fynx-dashboard:launch') selectTab('launch');
});
$('#retry-dashboard').addEventListener('click', loadDashboard);
function errorMessage(error) {
  const code = String(error.code || '');
  if (code === '4001' || code.includes('ACTION_REJECTED') || code.includes('popup-closed') || error.name === 'NotAllowedError') return 'Request cancelled. Nothing was approved.';
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password') || code.includes('auth/user-not-found')) return 'Sign-in failed. Check your email and password or use Google.';
  if (code.includes('popup-blocked')) return 'Your browser blocked Google sign-in. Allow the popup and try again.';
  if (code.includes('too-many') || code.includes('resource-exhausted')) return 'Too many attempts. Please wait before trying again.';
  if (code.startsWith('auth/')) return 'Sign-in could not be completed. Try again or use another sign-in method.';
  return error.message || 'The operation could not be confirmed. Please try again.';
}
async function run(button, work, target = '#workspace-status') {
  if (busy) return;
  busy = true;
  if (button) button.disabled = true;
  setText(target, '');
  try { await work(); }
  catch (error) { setText(target, errorMessage(error)); }
  finally { busy = false; if (button) button.disabled = false; updateWalletControls(); }
}
function addProvider(id, name, provider) {
  if (!provider?.request || providers.has(id)) return;
  providers.set(id, provider);
  if (providers.size === 1) $('#wallet-choice').replaceChildren();
  const option = document.createElement('option'); option.value = id; option.textContent = String(name).slice(0, 80);
  $('#wallet-choice').append(option);
}
window.addEventListener('eip6963:announceProvider', event => {
  const data = event.detail;
  if (typeof data?.info?.uuid === 'string' && data.info.uuid.length <= 100) addProvider(data.info.uuid, data.info.name || 'Browser wallet', data.provider);
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
setTimeout(() => { if (!providers.size && window.ethereum) addProvider('injected', 'Browser wallet', window.ethereum); if (!providers.size) $('#wallet-choice').options[0].textContent = 'No wallet found. Open a wallet extension.'; }, 600);
function clearWallet() {
  verifiedAddress = null; challenge = null; review = null;
  show('#signing-review', false); show('#transfer-review', false);
  setText('#wallet-address', 'No wallet connected'); setText('#receive-address', 'Connect and verify your wallet first.');
  setText('#wallet-balance', '— test ETH');
  setText('#wallet-proof', session?.wallet ? `Previously linked: ${session.wallet.address}. Connect again to prove current control.` : 'A connection alone does not prove wallet ownership.');
  updateWalletControls();
}
function updateWalletControls() {
  const connected = !!connection?.address && !!session;
  $('#verify-wallet').disabled = busy || !connected;
  for (const id of ['#refresh-balance', '#copy-address', '#review-transfer']) $(id).disabled = busy || !verifiedAddress || connection?.address !== verifiedAddress;
  show('#unlink-wallet', !!session?.wallet);
}
async function refreshSession() {
  const expected = generation;
  const result = await api({ action: 'session' });
  if (expected !== generation || !auth.currentUser) throw new Error('Your session changed. Sign in again.');
  session = result; renderPasskeys(); updateWalletControls();
}
function renderPasskeys() {
  const list = $('#passkey-list'); list.replaceChildren();
  for (const key of session?.passkeys || []) {
    const row = document.createElement('div'); row.className = 'list-row';
    const name = document.createElement('span'); name.textContent = `Passkey · added ${key.createdAt ? new Date(key.createdAt).toLocaleDateString() : 'recently'}`;
    const remove = document.createElement('button'); remove.className = 'text-button'; remove.textContent = 'Remove';
    remove.addEventListener('click', () => run(remove, async () => { if (!window.confirm('Remove this passkey? Keep Google or email access available.')) return; await api({ action: 'passkey-remove', id: key.id }); await refreshSession(); setText('#workspace-status', 'Passkey removed.'); }));
    row.append(name, remove); list.append(row);
  }
  if (!session?.passkeys.length) list.textContent = 'No passkeys added yet.';
}
async function ready() {
  if (window.top !== window.self) throw new Error('Open the FYNX workspace directly in its own browser tab.');
  const app = initializeApp(firebaseConfig);
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey), isTokenAutoRefreshEnabled: true });
  auth = getAuth(app);
  await setPersistence(auth, inMemoryPersistence);
  const callable = httpsCallable(getFunctions(app, functionsRegion), 'fynxWalletWorkspace', { timeout: 30000 });
  api = async data => (await callable(data)).data;
  for (const id of ['#google-login', '#email-submit', '#reset-password']) $(id).disabled = false;
  $('#passkey-login').disabled = !browserSupportsWebAuthn();
  setText('#auth-status', '');
  onAuthStateChanged(auth, async user => {
    const current = ++generation;
    session = null; connection?.close(); connection = null; clearWallet();
    clearDashboard(); selectTab('dashboard');
    $('#waitlist-rows').replaceChildren(); $('#passkey-list').replaceChildren();
    setText('#account-name', ''); setText('#transaction-status', '');
    show('#transaction-link', false); show('#check-receipt', false); pendingHash = null;
    show('#workspace', false); show('#signin', true);
    if (!user) return;
    setText('#auth-status', 'Checking owner access…');
    try {
      await refreshSession();
      if (current !== generation) return;
      setText('#account-name', user.email || 'Verified owner');
      setText('#auth-status', ''); show('#signin', false); show('#workspace', true);
      $('#password').value = ''; lastActivity = Date.now();
      await loadDashboard();
    } catch (error) {
      if (current !== generation) return;
      setText('#auth-status', errorMessage(error));
      await signOut(auth);
    }
  });
}
$('#google-login').addEventListener('click', event => run(event.currentTarget, async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}, '#auth-status'));
$('#email-login').addEventListener('submit', event => { event.preventDefault(); run($('#email-submit'), async () => { try { await signInWithEmailAndPassword(auth, $('#email').value.trim(), $('#password').value); } finally { $('#password').value = ''; } }, '#auth-status'); });
$('#reset-password').addEventListener('click', event => run(event.currentTarget, async () => {
  if (!$('#email').reportValidity() || !$('#email').value.trim()) return;
  await sendPasswordResetEmail(auth, $('#email').value.trim(), { url: 'https://ea-la.github.io/FYNX-Wallet/owner.html', handleCodeInApp: false });
  setText('#auth-status', 'If this account supports email recovery, Firebase will send a password setup or reset link.');
}, '#auth-status'));
$('#passkey-login').addEventListener('click', event => run(event.currentTarget, async () => {
  const request = await api({ action: 'passkey-login-options' });
  const response = await startAuthentication({ optionsJSON: request.options });
  const result = await api({ action: 'passkey-login', id: request.id, response });
  await signInWithCustomToken(auth, result.token);
}, '#auth-status'));
$('#logout').addEventListener('click', async () => {
  ++generation; session = null; clearDashboard(); show('#workspace', false);
  await signOut(auth); window.location.assign('./');
});
$('#add-passkey').addEventListener('click', event => run(event.currentTarget, async () => {
  const request = await api({ action: 'passkey-register-options' });
  const response = await startRegistration({ optionsJSON: request.options });
  await api({ action: 'passkey-register', id: request.id, response });
  await refreshSession(); setText('#workspace-status', 'Passkey added. You can use it the next time you sign in.');
}));
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => {
  selectTab(button.dataset.tab);
});
$('#connect-wallet').addEventListener('click', event => run(event.currentTarget, async () => {
  const provider = providers.get($('#wallet-choice').value);
  if (!provider) throw new Error('Open an Ethereum wallet extension, then reload this page. Keep recovery words in your wallet.');
  connection?.close(); clearWallet();
  connection = new WalletConnection(provider, () => { clearWallet(); setText('#workspace-status', 'Wallet account or network changed. Connect and verify again.'); });
  const address = await connection.connect();
  setText('#wallet-address', address); setText('#workspace-status', 'Connected. Review and sign the ownership message next.');
}));
$('#switch-network').addEventListener('click', event => run(event.currentTarget, async () => {
  const provider = providers.get($('#wallet-choice').value);
  if (!provider) throw new Error('Open a wallet extension first.');
  await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID }] });
  setText('#workspace-status', 'Sepolia selected. Connect your wallet again.');
}));
$('#verify-wallet').addEventListener('click', event => run(event.currentTarget, async () => {
  await connection.assertCurrent();
  const address = connection.address;
  challenge = await api({ action: 'wallet-challenge', address, chainId: Number(BigInt(CHAIN_ID)) });
  await connection.assertCurrent();
  if (connection.address !== address) throw new Error('Wallet changed. Try again.');
  setText('#signing-message', challenge.message); show('#signing-review', true);
}));
$('#sign-message').addEventListener('click', event => run(event.currentTarget, async () => {
  const expected = generation, currentConnection = connection, currentChallenge = challenge;
  const signature = await currentConnection.signChallenge(currentChallenge);
  const result = await api({ action: 'wallet-verify', id: currentChallenge.id, signature });
  if (expected !== generation || currentConnection !== connection) throw new Error('Session changed. Connect again.');
  await connection.assertCurrent();
  verifiedAddress = result.wallet.address; session.wallet = result.wallet;
  setText('#wallet-proof', 'Ownership verified by FYNX.'); setText('#receive-address', verifiedAddress);
  show('#signing-review', false); challenge = null;
  setText('#wallet-balance', `${await connection.balance()} test ETH`);
  setText('#workspace-status', 'Wallet signature verified and saved.');
}));
$('#cancel-sign').addEventListener('click', () => { challenge = null; show('#signing-review', false); });
$('#unlink-wallet').addEventListener('click', event => run(event.currentTarget, async () => { await api({ action: 'wallet-unlink' }); session.wallet = null; connection?.close(); connection = null; clearWallet(); setText('#workspace-status', 'Wallet unlinked. Your wallet keys and assets remain in your wallet.'); }));
$('#refresh-balance').addEventListener('click', event => run(event.currentTarget, async () => { setText('#wallet-balance', `${await connection.balance()} test ETH`); }));
$('#copy-address').addEventListener('click', event => run(event.currentTarget, async () => { await connection.assertCurrent(); await navigator.clipboard.writeText(verifiedAddress); setText('#workspace-status', 'Address copied. Use Sepolia only.'); }));
$('#send-form').addEventListener('submit', event => { event.preventDefault(); run($('#review-transfer'), async () => {
  if (!verifiedAddress || connection.address !== verifiedAddress) throw new Error('Verify your wallet first.');
  review = await connection.prepareTransfer($('#recipient').value.trim(), $('#amount').value.trim());
  const details = $('#transfer-details'); details.replaceChildren();
  for (const [name, value] of [['Network', 'Sepolia test network'], ['From', review.tx.from], ['Recipient', review.tx.to], ['Amount', `${review.amount} test ETH`], ['Estimated network fee', `${review.fee} test ETH`]]) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = name; dd.textContent = value; details.append(dt, dd); }
  show('#transfer-review', true);
}); });
$('#cancel-transfer').addEventListener('click', () => { review = null; show('#transfer-review', false); });
$('#send-transfer').addEventListener('click', event => run(event.currentTarget, async () => {
  if (!verifiedAddress || connection?.address !== verifiedAddress) throw new Error('Verify your wallet again.');
  // Consume the review before asking the wallet so a retry cannot double-submit.
  const current = review; review = null; show('#transfer-review', false);
  pendingHash = await connection.sendTransfer(current);
  setText('#transaction-status', 'Submitted to the network. Confirmation is still pending.');
  $('#transaction-link').href = `https://sepolia.etherscan.io/tx/${pendingHash}`;
  show('#transaction-link', true); show('#check-receipt', true);
}));
$('#check-receipt').addEventListener('click', event => run(event.currentTarget, async () => {
  const result = await connection.receipt(pendingHash);
  setText('#transaction-status', result.status === 'confirmed' ? `Confirmed on Sepolia in block ${result.block}.` : result.status === 'failed' ? 'The transaction failed on-chain. A network fee may still have been charged.' : 'Still pending. Check your wallet or explorer before attempting another transfer.');
  if (result.status !== 'pending') show('#check-receipt', false);
}));
$('#load-waitlist').addEventListener('click', event => run(event.currentTarget, async () => {
  const current = generation, data = await api({ action: 'waitlist' });
  if (current !== generation) return;
  setText('#waitlist-count', `${data.total} registrations · showing the latest ${data.records.length}`);
  const body = $('#waitlist-rows'); body.replaceChildren();
  for (const record of data.records) {
    const tr = document.createElement('tr');
    for (const value of [record.email, record.createdAt ? new Date(record.createdAt).toLocaleString() : 'Pending timestamp', record.status]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
    const td = document.createElement('td'), remove = document.createElement('button'); remove.className = 'text-button'; remove.textContent = 'Remove';
    remove.addEventListener('click', () => run(remove, async () => { if (!window.confirm(`Permanently remove ${record.email} from the active waitlist?`)) return; await api({ action: 'waitlist-remove', id: record.id }); tr.remove(); setText('#workspace-status', 'Registration removed from the active waitlist. Reload to refresh the count.'); }));
    td.append(remove); tr.append(td); body.append(tr);
  }
}));
for (const [title, status] of [['Product model: user-controlled external wallet', 'Selected · owner testnet only'], ['Identity, wallet proofs, passkeys, access controls', 'Implemented · see verification evidence'], ['Hardware signing and real Sepolia transfer', 'Device and network acceptance required'], ['Security review and incident procedure', 'Internal review prepared · independent review pending'], ['Legal entity and launch jurisdictions', 'Name supplied · registration and markets unconfirmed'], ['Payments, swaps, provider approvals', 'Not enabled'], ['Controlled public launch', 'Blocked until release gates pass']]) {
  const row = document.createElement('div'); row.className = 'list-row'; const label = document.createElement('strong'), state = document.createElement('span'); label.textContent = title; state.textContent = status; row.append(label, state); $('#launch-checklist').append(row);
}
for (const event of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(event, () => { lastActivity = Date.now(); }, { passive: true });
setInterval(() => { if (auth?.currentUser && Date.now() - lastActivity > 15 * 60000) { signOut(auth); setText('#auth-status', 'Signed out after 15 minutes of inactivity.'); } }, 30000);
ready().catch(error => setText('#auth-status', errorMessage(error)));
