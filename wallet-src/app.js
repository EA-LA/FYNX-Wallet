import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, inMemoryPersistence, setPersistence, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, sendPasswordResetEmail, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { firebaseConfig, recaptchaEnterpriseSiteKey, functionsRegion } from '../public-site/firebase-config.js';
import { WalletConnection, CHAIN_ID } from './wallet-client.js';
import launchPlan from './launch-checklist.json';
import { statusLabels } from './launch-status.js';
import { checkConnections } from './connection-checks.js';

const $ = selector => document.querySelector(selector);
const setText = (id, text) => { $(id).textContent = text; };
const show = (id, visible) => { $(id).hidden = !visible; };
let auth, api, session, connection, challenge, review, pendingHash;
let generation = 0, verifiedAddress = null, busy = false, lastActivity = Date.now();
let dashboardFrame = null, dashboardLoading = false, dashboardTimer;
let waitlistCursor = null, waitlistEmail = '', waitlistTotal = 0;
const waitlistRecords = new Map();
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
  const expected = generation;
  const checkSession = () => { if (expected !== generation) throw new Error('Your session changed. Sign in again.'); };
  try { await work(checkSession); }
  catch (error) { if (expected === generation) setText(target, errorMessage(error)); }
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
  setText('#signing-message', ''); $('#transfer-details').replaceChildren();
  setText('#wallet-address', 'No wallet connected'); setText('#receive-address', 'Connect and verify your wallet first.');
  setText('#wallet-balance', '— test ETH');
  setText('#wallet-proof', session?.wallet ? `Previously linked: ${session.wallet.address}. Connect again to prove current control.` : 'A connection alone does not prove wallet ownership.');
  updateWalletControls();
}
function clearPrivateWorkspace() {
  session = null; connection?.close(); connection = null; clearWallet(); clearDashboard();
  waitlistCursor = null; waitlistEmail = ''; waitlistTotal = 0; waitlistRecords.clear();
  $('#waitlist-rows').replaceChildren(); $('#passkey-list').replaceChildren();
  $('#connection-results').replaceChildren(); setText('#connection-status', '');
  $('#waitlist-search').reset(); $('#send-form').reset(); $('#password').value = '';
  setText('#waitlist-count', 'Load registrations to see the latest entries.'); show('#more-waitlist', false);
  setText('#account-name', ''); setText('#transaction-status', ''); setText('#workspace-status', '');
  $('#transaction-link').removeAttribute('href'); show('#transaction-link', false); show('#check-receipt', false); pendingHash = null;
  show('#workspace', false); show('#signin', true);
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
  api = async data => {
    const expected = generation, result = (await callable(data)).data;
    if (expected !== generation) throw new Error('Your session changed. Sign in again.');
    return result;
  };
  for (const id of ['#google-login', '#email-submit', '#reset-password']) $(id).disabled = false;
  $('#passkey-login').disabled = !browserSupportsWebAuthn();
  setText('#auth-status', '');
  onAuthStateChanged(auth, async user => {
    const current = ++generation;
    clearPrivateWorkspace(); selectTab('dashboard');
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
  ++generation; clearPrivateWorkspace();
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
$('#connect-wallet').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  const provider = providers.get($('#wallet-choice').value);
  if (!provider) throw new Error('Open an Ethereum wallet extension, then reload this page. Keep recovery words in your wallet.');
  connection?.close(); clearWallet();
  connection = new WalletConnection(provider, () => { clearWallet(); setText('#workspace-status', 'Wallet account or network changed. Connect and verify again.'); });
  const address = await connection.connect();
  checkSession();
  setText('#wallet-address', address); setText('#workspace-status', 'Connected. Review and sign the ownership message next.');
}));
$('#switch-network').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  const provider = providers.get($('#wallet-choice').value);
  if (!provider) throw new Error('Open a wallet extension first.');
  await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID }] });
  checkSession();
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
$('#sign-message').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  const expected = generation, currentConnection = connection, currentChallenge = challenge;
  const signature = await currentConnection.signChallenge(currentChallenge);
  const result = await api({ action: 'wallet-verify', id: currentChallenge.id, signature });
  if (expected !== generation || currentConnection !== connection) throw new Error('Session changed. Connect again.');
  await connection.assertCurrent();
  verifiedAddress = result.wallet.address; session.wallet = result.wallet;
  setText('#wallet-proof', 'Ownership verified by FYNX.'); setText('#receive-address', verifiedAddress);
  show('#signing-review', false); challenge = null;
  const balance = await connection.balance(); checkSession();
  setText('#wallet-balance', `${balance} test ETH`);
  setText('#workspace-status', 'Wallet signature verified and saved.');
}));
$('#cancel-sign').addEventListener('click', () => { challenge = null; show('#signing-review', false); });
$('#unlink-wallet').addEventListener('click', event => run(event.currentTarget, async () => { await api({ action: 'wallet-unlink' }); session.wallet = null; connection?.close(); connection = null; clearWallet(); setText('#workspace-status', 'Wallet unlinked. Your wallet keys and assets remain in your wallet.'); }));
$('#refresh-balance').addEventListener('click', event => run(event.currentTarget, async checkSession => { const balance = await connection.balance(); checkSession(); setText('#wallet-balance', `${balance} test ETH`); }));
$('#copy-address').addEventListener('click', event => run(event.currentTarget, async () => { await connection.assertCurrent(); await navigator.clipboard.writeText(verifiedAddress); setText('#workspace-status', 'Address copied. Use Sepolia only.'); }));
$('#send-form').addEventListener('submit', event => { event.preventDefault(); run($('#review-transfer'), async checkSession => {
  if (!verifiedAddress || connection.address !== verifiedAddress) throw new Error('Verify your wallet first.');
  const prepared = await connection.prepareTransfer($('#recipient').value.trim(), $('#amount').value.trim());
  checkSession(); review = prepared;
  const details = $('#transfer-details'); details.replaceChildren();
  for (const [name, value] of [['Network', 'Sepolia test network'], ['From', review.tx.from], ['Recipient', review.tx.to], ['Amount', `${review.amount} test ETH`], ['Estimated network fee', `${review.fee} test ETH`]]) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = name; dd.textContent = value; details.append(dt, dd); }
  show('#transfer-review', true);
}); });
$('#cancel-transfer').addEventListener('click', () => { review = null; show('#transfer-review', false); });
$('#send-transfer').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  if (!verifiedAddress || connection?.address !== verifiedAddress) throw new Error('Verify your wallet again.');
  // Consume the review before asking the wallet so a retry cannot double-submit.
  const current = review; review = null; show('#transfer-review', false);
  const hash = await connection.sendTransfer(current);
  checkSession(); pendingHash = hash;
  setText('#transaction-status', 'Submitted to the network. Confirmation is still pending.');
  $('#transaction-link').href = `https://sepolia.etherscan.io/tx/${pendingHash}`;
  show('#transaction-link', true); show('#check-receipt', true);
}));
$('#check-receipt').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  const result = await connection.receipt(pendingHash);
  checkSession();
  setText('#transaction-status', result.status === 'confirmed' ? `Confirmed on Sepolia in block ${result.block}.` : result.status === 'failed' ? 'The transaction failed on-chain. A network fee may still have been charged.' : 'Still pending. Check your wallet or explorer before attempting another transfer.');
  if (result.status !== 'pending') show('#check-receipt', false);
}));
async function loadRegistrations({ more = false, email = waitlistEmail } = {}) {
  const current = generation, data = await api({ action: 'waitlist', email, ...(more ? { cursor: waitlistCursor } : {}) });
  if (current !== generation) return;
  if (!more) waitlistRecords.clear();
  waitlistEmail = email; waitlistTotal = data.total; waitlistCursor = data.nextCursor;
  for (const record of data.records) waitlistRecords.set(record.id, record);
  renderRegistrations();
}
function renderRegistrations() {
  setText('#waitlist-count', waitlistEmail ? `${waitlistTotal} matching registration${waitlistTotal === 1 ? '' : 's'}` : `${waitlistTotal} registrations · ${waitlistRecords.size} loaded`);
  show('#more-waitlist', !!waitlistCursor);
  const body = $('#waitlist-rows'); body.replaceChildren();
  if (!waitlistRecords.size) {
    const row = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 4;
    cell.textContent = waitlistEmail ? 'No registration found for this email.' : 'No registrations yet.'; row.append(cell); body.append(row);
  }
  for (const record of waitlistRecords.values()) {
    const tr = document.createElement('tr');
    for (const [label, value] of [['Email', record.email], ['Registered', record.createdAt ? new Date(record.createdAt).toLocaleString() : 'Pending timestamp']]) { const td = document.createElement('td'); td.dataset.label = label; td.textContent = value; tr.append(td); }
    const info = document.createElement('td'), details = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = record.status || 'Unknown status'; details.append(summary);
    for (const value of [`Consent: ${record.consent ? 'Recorded' : 'Not recorded'}`, `Notice: ${record.noticeVersion || 'Not recorded'}`, `Source: ${record.source || 'Not recorded'}`, `Expires: ${record.expiresAt ? new Date(record.expiresAt).toLocaleDateString() : 'Not recorded'}`]) { const line = document.createElement('p'); line.textContent = value; line.className = 'hint'; details.append(line); }
    info.dataset.label = 'Status & consent'; info.append(details); tr.append(info);
    const td = document.createElement('td'), remove = document.createElement('button'); remove.className = 'text-button'; remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove registration for ${record.email}`);
    remove.addEventListener('click', () => run(remove, async () => {
      if (!window.confirm(`Permanently remove ${record.email} from the active waitlist?`)) return;
      await api({ action: 'waitlist-remove', id: record.id });
      waitlistRecords.delete(record.id); waitlistTotal = Math.max(0, waitlistTotal - 1); renderRegistrations();
      setText('#workspace-status', 'Registration removed from the active waitlist.');
    }));
    td.dataset.label = 'Action'; td.append(remove); tr.append(td); body.append(tr);
  }
}
$('#load-waitlist').addEventListener('click', event => run(event.currentTarget, () => loadRegistrations()));
$('#more-waitlist').addEventListener('click', event => run(event.currentTarget, () => loadRegistrations({ more: true })));
$('#waitlist-search').addEventListener('submit', event => { event.preventDefault(); run($('#find-registration'), () => loadRegistrations({ email: $('#waitlist-email').value.trim() })); });
$('#clear-waitlist-search').addEventListener('click', event => run(event.currentTarget, async () => { await loadRegistrations({ email: '' }); $('#waitlist-search').reset(); }));
setText('#launch-market', launchPlan.marketPlan);
for (const item of launchPlan.items) {
  const details = document.createElement('details'); details.className = 'launch-item';
  const summary = document.createElement('summary'), title = document.createElement('strong'), state = document.createElement('span');
  title.textContent = item.title; state.textContent = statusLabels[item.status]; state.className = 'launch-state';
  summary.append(title, state); details.append(summary);
  for (const [label, text] of [['Current', item.current], ['To finish', item.next], ['Responsible', item.responsibility]]) {
    const line = document.createElement('p'), lead = document.createElement('strong'); lead.textContent = `${label}: `;
    line.append(lead, document.createTextNode(text)); details.append(line);
  }
  const link = document.createElement('a'); link.textContent = 'Evidence and context ↗';
  link.href = `https://github.com/EA-LA/FYNX-Wallet/blob/main/${item.evidence}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
  details.append(link); $('#launch-checklist').append(details);
}
$('#run-connection-checks').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  $('#connection-results').replaceChildren(); setText('#connection-status', 'Checking your current connection…');
  const results = await checkConnections({ call: api, wallet: connection });
  checkSession();
  for (const result of results) {
    const row = document.createElement('li'), title = document.createElement('strong'), detail = document.createElement('p');
    title.textContent = `${result.state === 'passed' ? 'Passed' : result.state === 'failed' ? 'Needs attention' : 'Not tested'} · ${result.label}`;
    detail.textContent = result.detail; row.append(title, detail); $('#connection-results').append(row);
  }
  setText('#connection-status', `Checked ${new Date().toLocaleString()}. Results describe this moment only; they do not certify signing, transfers or launch readiness.`);
}, '#connection-status'));
for (const event of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(event, () => { lastActivity = Date.now(); }, { passive: true });
setInterval(() => { if (auth?.currentUser && Date.now() - lastActivity > 15 * 60000) { signOut(auth); setText('#auth-status', 'Signed out after 15 minutes of inactivity.'); } }, 30000);
ready().catch(error => setText('#auth-status', errorMessage(error)));
