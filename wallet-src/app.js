import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, inMemoryPersistence, setPersistence, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, sendPasswordResetEmail, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { firebaseConfig, recaptchaEnterpriseSiteKey, functionsRegion } from '../public-site/firebase-config.js';
import { AssetConnection, receiveURI } from './asset-client.js';
import { networkFor } from '../firebase-wallet/functions/networks.js';
import QRCode from 'qrcode';
import launchPlan from './launch-checklist.json';
import { statusLabels } from './launch-status.js';
import { TRACKER_KEY, RESULTS, resultLabels, byLabels, tabLabels, groupOf, groupLabels, stepKey, looksSecret, cleanRecords, stepState, gateProgress, overview, nextActions, reportMarkdown, parseReport, mergeRecords, browserSummary } from './launch-tracker.js';
import { checkConnections } from './connection-checks.js';
import { methodLabel, passkeyRows, signInMethods, freshness, idleLeft, minutesText, checkup, summaryText as securitySummary, relativeTime, identityTests } from './security-checkup.js';
import { setupSteps, faucetsFor, walletTests, TX_STEPS, txNote, walletTestSummary, swapHint } from './crypto-guide.js';
import { DECISIONS_KEY, DECISIONS, decisionKey, findDecision, cleanAnswers, cleanValue, problems, decisionNote, decisionState, decisionsProgress, decisionRecord, counselSheet, answerText, unsavedFields } from './owner-decisions.js';
import { DRILL_KEY, DRILL_STEP, MIN_PEOPLE, STAGES, SCENARIOS, RESULTS as DRILL_RESULTS, findScenario, cleanDrill, startRun, answerStage, currentStage, runSummary, drillNote, drillRecord, finishRun, parsePeople, cleanFollowUp } from './incident-drill.js';
import { summarize, perDay, perWeek, trendText, filterRecords, toCSV, summaryText, isTestAddress } from './waitlist-insights.js';

const $ = selector => document.querySelector(selector);
const setText = (id, text) => { $(id).textContent = text; };
const show = (id, visible) => { $(id).hidden = !visible; };
let auth, api, session, connection, challenge, review, pendingHash;
let swapQuote = null, actionReview = null, checkoutReady = false, checkoutId = null;
const journal = new Map();
const selectedNetwork = () => networkFor(Number($('#network-choice').value));
let generation = 0, verifiedAddress = null, busy = false, lastActivity = Date.now();
let dashboardFrame = null, dashboardLoading = false, dashboardTimer;
let waitlistCursor = null, waitlistEmail = '', waitlistTotal = 0;
const waitlistRecords = new Map();
let waitlistPeriod = 'day', waitlistLoadingAll = false;
const providers = new Map();
let signInInfo = null;
let lastBalances = { eth: null, usdc: null };
function selectTab(name) {
  for (const tab of document.querySelectorAll('[data-tab]')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  for (const panel of document.querySelectorAll('.panel')) panel.hidden = panel.id !== `tab-${name}`;
  setText('#workspace-status', '');
  if (name === 'security') renderSecurity();
  if (name === 'wallet') { renderCryptoSetup(); renderCryptoTests(); }
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
  if (/OutOfFunds|insufficient funds/i.test(error.message || '')) return 'Not enough ETH for this operation and its network fee. Add test ETH on the selected test network.';
  if (/execution reverted|revert/i.test(error.message || '')) return 'The network could not simulate this operation. Check balances and any required approval, then request a new quote.';
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
  verifiedAddress = null; challenge = null; review = null; swapQuote = null; actionReview = null;
  connection?.cancelAction();
  for (const id of ['#receive-qr', '#swap-quote', '#action-review', '#checkout-link']) show(id, false);
  checkoutId = null; $('#check-provider-order').disabled = true; setText('#fiat-order-status', '');
  $('#checkout-link').removeAttribute('href');
  $('#quote-details').replaceChildren(); $('#action-details').replaceChildren();
  setText('#token-balance', '— USDC'); setText('#receive-network', '');
  pendingHash = null; setText('#transaction-status', ''); show('#transaction-link', false); show('#check-receipt', false);
  show('#signing-review', false); show('#transfer-review', false);
  setText('#signing-message', ''); $('#transfer-details').replaceChildren();
  setText('#wallet-address', 'No wallet connected'); setText('#receive-address', 'Connect and verify your wallet first.');
  setText('#wallet-balance', '— test ETH'); lastBalances = { eth: null, usdc: null };
  setText('#wallet-proof', session?.wallet ? `Previously linked: ${session.wallet.address}. Connect again to prove current control.` : 'A connection alone does not prove wallet ownership.');
  updateWalletControls();
}
function clearPrivateWorkspace() {
  journal.clear(); $('#transaction-journal').replaceChildren(); setText('#lookup-status', ''); setText('#provider-message', ''); checkoutReady = false;
  session = null; connection?.close(); connection = null; clearWallet(); clearDashboard();
  waitlistCursor = null; waitlistEmail = ''; waitlistTotal = 0; waitlistRecords.clear();
  $('#waitlist-rows').replaceChildren(); $('#passkey-list').replaceChildren(); clearWaitlistInsights(); clearSecurity();
  for (const d of DECISIONS) discardDrafts.add(decisionKey(d)); renderDecisions(); clearReportImport();
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
  const verified = !!verifiedAddress && connection?.address === verifiedAddress && !!session;
  const canSend = verified && connection.network.transactionsEnabled;
  $('#review-transfer').disabled = busy || !canSend;
  $('#quote-swap').disabled = busy || !verified || !connection?.network.router;
  $('#prepare-swap').disabled = busy || !canSend || !swapQuote;
  $('#revoke-allowance').disabled = busy || !canSend || !connection?.network.router;
  $('#lookup-transaction').disabled = busy || !verified;
  $('#create-checkout').disabled = busy || !verified || !checkoutReady || connection?.network.id !== 11155111;
  $('#network-choice').disabled = busy;
  show('#unlink-wallet', !!session?.wallet);
  let network = connection?.network || null; if (!network) { try { network = selectedNetwork(); } catch { network = {}; } }
  const hint = swapHint(network, { verified }), hintBox = $('#swap-hint');
  if (hintBox.textContent !== hint.text) hintBox.textContent = hint.text;
  hintBox.className = `swap-hint is-${hint.state}`;
  renderCryptoSetup();
}
async function refreshSession() {
  const expected = generation;
  const result = await api({ action: 'session' });
  if (expected !== generation || !auth.currentUser) throw new Error('Your session changed. Sign in again.');
  session = result; renderPasskeys(); updateWalletControls();
}
function renderPasskeys() {
  const list = $('#passkey-list'); list.replaceChildren();
  const rows = passkeyRows(session?.passkeys);
  for (const key of rows) {
    const row = document.createElement('div'); row.className = 'list-row';
    const name = document.createElement('span'), title = document.createElement('strong'), when = document.createElement('small');
    title.textContent = key.label; when.textContent = ` · added ${key.added}${key.ago ? ` (${key.ago})` : ''}`; name.append(title, when);
    const remove = document.createElement('button'); remove.className = 'text-button'; remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${key.label}`);
    remove.addEventListener('click', () => run(remove, async () => {
      const others = signInMethods({ providers: providerIds(), passkeys: [] });
      const warning = rows.length === 1 ? `This is your only passkey. You will still be able to sign in with ${others.join(' or ') || 'your other sign-in method'}. Remove it?` : `Remove ${key.label}? Keep Google or email access available.`;
      if (!window.confirm(warning)) return; await api({ action: 'passkey-remove', id: key.id }); await refreshSession(); setText('#workspace-status', 'Passkey removed.');
    }));
    row.append(name, remove); list.append(row);
  }
  if (!rows.length) list.textContent = 'No passkeys added yet.';
  renderSecurity();
}
// Account security checkup: computed from the signed-in account and session in this browser only.
const providerIds = () => (auth?.currentUser?.providerData || []).map(p => p?.providerId).filter(Boolean);
async function readSignInInfo() {
  const user = auth?.currentUser; if (!user) { signInInfo = null; return; }
  try {
    const token = await user.getIdTokenResult();
    if (auth.currentUser === user) signInInfo = { provider: token.signInProvider || '', authTime: Date.parse(token.authTime) || 0 };
  } catch { if (auth.currentUser === user) signInInfo = { provider: '', authTime: 0 }; }
}
function clearSecurity() {
  signInInfo = null;
  for (const id of ['#sec-checks', '#sec-signin', '#sec-methods', '#sec-tests', '#sec-score']) $(id).replaceChildren();
  setText('#sec-status', ''); setText('#sec-tests-count', '');
}
function securityState() {
  const user = auth?.currentUser;
  const providers = providerIds(), passkeys = session?.passkeys || [];
  return { user, providers, passkeys, result: checkup({ emailVerified: !!user?.emailVerified, providers, passkeys, wallet: session?.wallet }), methods: signInMethods({ providers, passkeys }) };
}
function securityFix(fix) {
  if (fix === 'wallet') { selectTab('wallet'); window.scrollTo(0, 0); return; }
  const button = $('#add-passkey'); button.scrollIntoView({ block: 'center' }); button.focus({ preventScroll: true });
}
function renderSecurityTimes() {
  if (!session || $('#tab-security').hidden) return;
  const dl = $('#sec-signin'); dl.replaceChildren();
  const user = auth?.currentUser, now = Date.now(), fresh = freshness(signInInfo?.authTime, now);
  const rows = [
    ['Signed in with', signInInfo?.provider ? methodLabel(signInInfo.provider) : 'Checking…'],
    ['Signed in', signInInfo?.authTime ? `${new Date(signInInfo.authTime).toLocaleString()} (${relativeTime(signInInfo.authTime, now)})` : 'Unknown'],
    ['Security changes', fresh.fresh ? `Allowed for ${minutesText(fresh.leftMs)} more` : 'Sign out and in again first (sign-in is older than 5 minutes)'],
    ['Automatic sign-out', `In ${minutesText(idleLeft(lastActivity, now))} without activity`],
    ['Account created', user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown'],
  ];
  for (const [term, value] of rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = term; dd.textContent = value; if (term === 'Security changes') dd.className = fresh.fresh ? 'sec-ok' : 'sec-warn'; dl.append(dt, dd); }
  setText('#passkey-fresh', fresh.fresh ? `You can add or remove a passkey for ${minutesText(fresh.leftMs)} more. After that, sign out and sign in again. Keep Google or email access as a backup.` : 'Your sign-in is more than five minutes old: sign out and sign in again before adding or removing a passkey. Keep Google or email access as a backup.');
}
function renderSecurity() {
  if (!session || $('#tab-security').hidden) return;
  const { result, methods, providers, passkeys } = securityState();
  const score = $('#sec-score'); score.replaceChildren();
  const num = document.createElement('strong'), of = document.createElement('span');
  num.textContent = `${result.done}/${result.total}`; of.textContent = result.done === result.total ? 'all checks done' : 'checks done';
  score.append(num, of); score.setAttribute('aria-label', `${result.done} of ${result.total} security checks done`);
  score.className = `sec-score ${result.done === result.total ? 'is-done' : ''}`;
  const list = $('#sec-checks'); list.replaceChildren();
  for (const c of result.checks) {
    const li = document.createElement('li'); li.className = `sec-check is-${c.state}`;
    const mark = document.createElement('span'); mark.className = 'sec-mark'; mark.setAttribute('aria-hidden', 'true'); mark.textContent = c.state === 'done' ? '✓' : c.state === 'info' ? 'i' : '!';
    const body = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('p');
    title.textContent = `${c.title}${c.state === 'todo' ? ' — to do' : ''}`; detail.textContent = c.detail; body.append(title, detail);
    if (c.fix) { const b = document.createElement('button'); b.type = 'button'; b.className = 'text-button'; b.textContent = c.fix === 'wallet' ? 'Open Crypto tools ↗' : 'Go to Add a passkey ↓'; b.addEventListener('click', () => securityFix(c.fix)); body.append(b); }
    li.append(mark, body); list.append(li);
  }
  const ways = $('#sec-methods'); ways.replaceChildren();
  const all = [['Google', providers.includes('google.com')], ['Email & password', providers.includes('password')], [passkeys.length ? (passkeys.length === 1 ? '1 passkey' : `${passkeys.length} passkeys`) : 'Passkey', passkeys.length > 0]];
  for (const [label, on] of all) { const li = document.createElement('li'); li.className = on ? 'is-on' : 'is-off'; li.textContent = `${on ? '✓' : '—'} ${label}${on ? '' : ' · not set up'}`; ways.append(li); }
  renderSecurityTests();
  renderSecurityTimes();
}
// Identity-gate tests recorded right here; the same records as Launch readiness (this browser only).
function renderSecurityTests() {
  const box = document.getElementById('sec-tests'); if (!box) return;
  const { gate, steps, total, done, failed } = identityTests(launchPlan, launchRecords);
  setText('#sec-tests-count', total ? `${done} of ${total} recorded${failed ? ` · ${failed} failed` : ''}` : '');
  box.replaceChildren();
  for (const { step, key, state, result, note, fixed } of steps) {
    const li = guideEl('li', `sec-test is-${state}`); li.dataset.step = key;
    const head = guideEl('div', 'sec-test-head');
    head.append(guideEl('span', `launch-mark is-${state}`, fixed ? 'Done' : state === 'done' ? resultLabels[result] || 'Done' : state === 'failed' ? 'Failed' : 'To do'), guideEl('span', 'sec-test-text', step.text));
    li.append(head);
    if (!fixed) {
      const group = guideEl('div', 'launch-results'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', `Result: ${step.text}`);
      for (const r of RESULTS) {
        const b = guideEl('button', `launch-result result-${r}`, resultLabels[r]); b.type = 'button'; b.dataset.result = r; b.setAttribute('aria-pressed', String(result === r));
        b.addEventListener('click', () => recordSecurityStep(gate, step, { result: result === r ? '' : r }, `[data-result="${r}"]`));
        group.append(b);
      }
      li.append(group, stepNoteEditor(key, note, value => recordSecurityStep(gate, step, { note: value }, '.step-note-toggle'), '#sec-status'));
    }
    box.append(li);
  }
}
function recordSecurityStep(gate, step, patch, focusKey) {
  const key = stepKey(gate.id, step.id), prev = launchRecords[key] || { result: '', note: '', at: 0 };
  const next = { ...prev, ...patch, at: Date.now() };
  if (!next.result && !next.note) delete launchRecords[key]; else launchRecords[key] = next;
  saveLaunchRecords(); renderLaunch(); renderSecurityTests();
  document.querySelector(`#sec-tests [data-step="${CSS.escape(key)}"] ${focusKey}`)?.focus({ preventScroll: true });
  setText('#sec-status', 'note' in patch ? (next.note ? 'Note saved. It also appears in Launch readiness and your test report.' : 'Note removed.') : next.result ? `Recorded: ${resultLabels[next.result]}. It also appears in Launch readiness and your test report.` : 'Result cleared.');
}
$('#sec-open-launch').addEventListener('click', () => { selectTab('launch'); openGate('identity'); });
$('#sec-refresh').addEventListener('click', event => run(event.currentTarget, async () => {
  await auth.currentUser?.reload(); await readSignInInfo(); await refreshSession(); setText('#sec-status', `Checked ${new Date().toLocaleTimeString()}.`);
}, '#sec-status'));
$('#sec-copy').addEventListener('click', async () => {
  const { result, methods } = securityState();
  const text = securitySummary({ result, methods, passkeys: passkeyRows(session?.passkeys), signInWith: signInInfo?.provider ? methodLabel(signInInfo.provider) : '', tests: identityTests(launchPlan, launchRecords) });
  try { await navigator.clipboard.writeText(text); setText('#sec-status', 'Summary copied. It contains counts and dates only, no email or wallet address.'); }
  catch { setText('#sec-status', 'Copying was blocked by the browser.'); }
});
setInterval(renderSecurityTimes, 15000);
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
      await readSignInInfo();
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
  connection = new AssetConnection(provider, () => { clearWallet(); setText('#workspace-status', 'Wallet account or network changed. Connect and verify again.'); }, selectedNetwork().id);
  const address = await connection.connect();
  checkSession();
  setText('#wallet-address', address); setText('#workspace-status', 'Connected. Review and sign the ownership message next.');
}));
$('#switch-network').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  const provider = providers.get($('#wallet-choice').value);
  if (!provider) throw new Error('Open a wallet extension first.');
  const network = selectedNetwork();
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: network.hex }] }); }
  catch (error) {
    if (error.code !== 4902) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: network.hex, chainName: network.name, rpcUrls: [network.rpc], blockExplorerUrls: [network.explorer], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } }] });
  }
  checkSession();
  setText('#workspace-status', `${network.name} selected. Connect your wallet again.`);
}));
$('#verify-wallet').addEventListener('click', event => run(event.currentTarget, async () => {
  await connection.assertCurrent();
  const address = connection.address;
  challenge = await api({ action: 'wallet-challenge', address, chainId: connection.network.id });
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
  await refreshBalances(checkSession); await renderReceive();
  setText('#workspace-status', 'Wallet signature verified and saved.');
}));
$('#cancel-sign').addEventListener('click', () => { challenge = null; show('#signing-review', false); });
$('#unlink-wallet').addEventListener('click', event => run(event.currentTarget, async () => { await api({ action: 'wallet-unlink' }); session.wallet = null; connection?.close(); connection = null; clearWallet(); setText('#workspace-status', 'Wallet unlinked. Your wallet keys and assets remain in your wallet.'); }));
$('#refresh-balance').addEventListener('click', event => run(event.currentTarget, refreshBalances));
$('#copy-address').addEventListener('click', event => run(event.currentTarget, async () => { await connection.assertCurrent(); await navigator.clipboard.writeText(verifiedAddress); setText('#workspace-status', `Address copied. Use ${connection.network.name} only.`); }));
$('#send-form').addEventListener('submit', event => { event.preventDefault(); run($('#review-transfer'), async checkSession => {
  if (!verifiedAddress || connection.address !== verifiedAddress) throw new Error('Verify your wallet first.');
  const symbol = $('#send-asset').value;
  if (symbol === 'USDC') {
    const prepared = await connection.prepareTokenTransfer($('#recipient').value.trim(), $('#amount').value.trim());
    checkSession(); renderAction(prepared); return;
  }
  const prepared = await connection.prepareTransfer($('#recipient').value.trim(), $('#amount').value.trim());
  checkSession(); show('#action-review', false); actionReview = null; review = prepared;
  const details = $('#transfer-details'); details.replaceChildren();
  for (const [name, value] of [['Network', connection.network.name], ['From', review.tx.from], ['Recipient', review.tx.to], ['Amount', `${review.amount} test ETH`], ['Estimated network fee', `${review.fee} test ETH`]]) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = name; dd.textContent = value; details.append(dt, dd); }
  show('#transfer-review', true);
}); });
$('#cancel-transfer').addEventListener('click', () => { connection?.cancelTransfer(); review = null; show('#transfer-review', false); });
$('#send-transfer').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  if (!verifiedAddress || connection?.address !== verifiedAddress) throw new Error('Verify your wallet again.');
  // Consume the review before asking the wallet so a retry cannot double-submit.
  const current = review; review = null; show('#transfer-review', false);
  const hash = await connection.sendTransfer(current);
  checkSession(); pendingHash = hash;
  setText('#transaction-status', 'Submitted to the network. Confirmation is still pending.');
  trackTransaction(hash, 'ETH transfer');
  $('#transaction-link').href = `${connection.network.explorer}/tx/${pendingHash}`;
  show('#transaction-link', true); show('#check-receipt', true);
}));
$('#check-receipt').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  const result = await connection.receipt(pendingHash);
  checkSession();
  setText('#transaction-status', result.status === 'confirmed' ? `Included successfully on ${connection.network.name} in block ${result.block}. Check the explorer for finality.` : result.status === 'failed' ? 'The transaction failed on-chain. A network fee may still have been charged.' : 'Still pending. Check your wallet or explorer before attempting another transfer.');
  if (result.status !== 'pending') show('#check-receipt', false);
  const item = journal.get(pendingHash); if (item) item.status = result.status; renderJournal();
}));

function detailList(id, entries) {
  const list = $(id); list.replaceChildren();
  for (const [name, value] of entries) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = name; dd.textContent = String(value); list.append(dt, dd); }
}
async function refreshBalances(checkSession = () => {}) {
  const current = connection, epoch = current.epoch;
  const [eth, usdc] = await Promise.allSettled([current.balance(), current.tokenBalance()]);
  checkSession(); await current.assertCurrent(epoch);
  if (current !== connection) throw new Error('Wallet changed.');
  setText('#wallet-balance', eth.status === 'fulfilled' ? eth.value + ' ETH' : 'ETH unavailable');
  setText('#token-balance', usdc.status === 'fulfilled' ? usdc.value + ' USDC' : 'USDC unavailable — retry when the network responds');
  lastBalances = { eth: eth.status === 'fulfilled' ? String(eth.value) : null, usdc: usdc.status === 'fulfilled' ? String(usdc.value) : null };
  renderCryptoSetup();
}
async function renderReceive() {
  if (!verifiedAddress || connection?.address !== verifiedAddress) return;
  const current = connection, epoch = current.epoch, address = verifiedAddress;
  await current.assertCurrent(epoch);
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, receiveURI(current.network, address, $('#receive-asset').value), { width: 200, margin: 2, errorCorrectionLevel: 'M' });
  await current.assertCurrent(epoch);
  if (current !== connection || address !== verifiedAddress) return;
  const target = $('#receive-qr'); target.width = canvas.width; target.height = canvas.height;
  target.getContext('2d').drawImage(canvas, 0, 0); show('#receive-qr', true);
  setText('#receive-network', current.network.name + (current.network.testnet ? ' · test assets only, no monetary value' : ' · real assets, transaction signing disabled'));
}
$('#receive-asset').addEventListener('change', () => run(null, renderReceive));
$('#network-choice').addEventListener('change', () => {
  connection?.close(); connection = null; clearWallet();
  setText('#network-note', selectedNetwork().testnet ? 'Test assets have no monetary value. Never send real money to a test network.' : 'Base mainnet is read-only. Do not fund this wallet to test transfers; mainnet signing is disabled.');
  setText('#lookup-status', ''); renderJournal();
});
function renderAction(prepared) {
  review = null; show('#transfer-review', false); actionReview = prepared;
  detailList('#action-details', [['Network', connection.network.name], ['Operation', prepared.displayAmount], ['From', prepared.tx.from], ['Recipient / spender', prepared.recipient], ['Contract', prepared.tx.to], ['Estimated execution fee', prepared.fee + ' ETH'], ['Expires', new Date(prepared.expiresAt).toLocaleTimeString()]]);
  show('#action-review', true);
}
$('#swap-form').addEventListener('submit', event => { event.preventDefault(); run($('#quote-swap'), async checkSession => {
  if (!verifiedAddress || connection?.address !== verifiedAddress) throw new Error('Verify your wallet first.');
  swapQuote = null; actionReview = null; show('#action-review', false); show('#swap-quote', false);
  const quote = await connection.quoteSwap($('#swap-asset').value, $('#swap-amount').value.trim(), Number($('#slippage').value));
  checkSession(); swapQuote = quote;
  detailList('#quote-details', [['Network', connection.network.name], ['Expected receive', quote.output + ' ' + quote.assetOut.symbol], ['Minimum receive', quote.minimumOutput + ' ' + quote.assetOut.symbol], ['Pool fee', (quote.fee / 10000) + '% (included in quote)'], ['Estimated price impact including pool fee', (quote.impactBps / 100) + '%'], ['Slippage limit', (quote.slippageBps / 100) + '%'], ['Router', connection.network.router], ['Expires', new Date(quote.expiresAt).toLocaleTimeString()]]);
  show('#swap-quote', true);
}); });
$('#prepare-swap').addEventListener('click', event => run(event.currentTarget, async checkSession => { const prepared = await connection.prepareSwap(swapQuote); checkSession(); renderAction(prepared); }));
$('#revoke-allowance').addEventListener('click', event => run(event.currentTarget, async checkSession => { const prepared = await connection.prepareRevoke(); checkSession(); renderAction(prepared); }));
$('#cancel-action').addEventListener('click', () => { connection?.cancelAction(); actionReview = null; swapQuote = null; show('#action-review', false); show('#swap-quote', false); });
$('#send-action').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  if (!verifiedAddress || connection?.address !== verifiedAddress) throw new Error('Verify your wallet first.');
  const current = actionReview; actionReview = null; swapQuote = null; show('#action-review', false); show('#swap-quote', false);
  const hash = await connection.sendAction(current); checkSession(); pendingHash = hash;
  trackTransaction(hash, current.displayAmount);
  setText('#transaction-status', current.kind === 'approval' ? 'Approval submitted, not a completed swap. Wait for confirmation, then request a new quote.' : 'Submitted. This is not yet a confirmed transaction.');
  $('#transaction-link').href = connection.network.explorer + '/tx/' + hash;
  show('#transaction-link', true); show('#check-receipt', true);
}));
function trackTransaction(hash, label) {
  journal.set(hash, { hash, label, network: connection.network, address: connection.address, status: 'pending' }); renderJournal();
}
function renderJournal() {
  const list = $('#transaction-journal'); list.replaceChildren();
  for (const item of [...journal.values()].reverse()) {
    if (item.network.id !== selectedNetwork().id) continue;
    const row = document.createElement('li'), label = document.createElement('p'), link = document.createElement('a');
    label.textContent = item.label + ' · ' + item.status; link.textContent = item.hash;
    link.href = item.network.explorer + '/tx/' + item.hash; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'mono';
    row.append(label, link); list.append(row);
  }
  if (!list.children.length) { const empty = document.createElement('li'); empty.className = 'journal-empty'; empty.textContent = `No transactions submitted on ${selectedNetwork().name} in this page session yet.`; list.append(empty); }
  renderCryptoSetup();
}
$('#lookup-form').addEventListener('submit', event => { event.preventDefault(); run($('#lookup-transaction'), async checkSession => {
  const hash = $('#lookup-hash').value.trim(), result = await connection.inspectTransaction(hash); checkSession();
  setText('#lookup-status', result.status === 'pending' ? 'Pending — no receipt yet.' : (result.status === 'confirmed' ? 'Included successfully' : 'Failed on-chain') + ' in block ' + result.block + '. From ' + result.from + ' to ' + (result.to || 'contract creation') + '. Check the explorer for finality.');
  const item = journal.get(hash); if (item) { item.status = result.status; renderJournal(); }
}, '#lookup-status'); });
$('#provider-status').addEventListener('click', event => run(event.currentTarget, async () => {
  const result = await api({ action: 'provider-status' }); checkoutReady = result.sandboxReady === true;
  setText('#provider-message', result.message);
}, '#provider-message'));
$('#create-checkout').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  if (!verifiedAddress || connection?.address !== verifiedAddress) throw new Error('Verify your wallet first.');
  await connection.assertCurrent(); show('#checkout-link', false);
  const result = await api({ action: 'fiat-checkout', direction: $('#fiat-direction').value, address: verifiedAddress });
  checkSession(); await connection.assertCurrent();
  const url = new URL(result.url);
  if (url.origin !== 'https://global-stg.transak.com' || url.username || url.password) throw new Error('Unexpected checkout destination.');
  checkoutId = result.id; $('#check-provider-order').disabled = false;
  $('#checkout-link').href = url.href; show('#checkout-link', true);
  setText('#provider-message', 'Sandbox session created. Open it within five minutes. This does not confirm a payment.');
}, '#provider-message'));

$('#fiat-status-form').addEventListener('submit', event => { event.preventDefault(); run($('#check-provider-order'), async () => {
  if (!checkoutId) throw new Error('Create a sandbox session first.');
  const result = await api({ action: 'fiat-status', sessionId: checkoutId, orderId: $('#provider-order').value.trim() });
  setText('#fiat-order-status', result.message);
}, '#fiat-order-status'); });
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
  renderWaitlistInsights();
  const body = $('#waitlist-rows'); body.replaceChildren();
  const visible = waitlistEmail ? [...waitlistRecords.values()] : filterRecords(waitlistRecords.values(), waitlistFilter());
  if (!visible.length) {
    const row = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 4;
    cell.textContent = waitlistEmail ? 'No registration found for this email.' : waitlistRecords.size ? 'No loaded registration matches this filter.' : 'No registrations yet.'; row.append(cell); body.append(row);
  }
  if (!waitlistEmail && visible.length !== waitlistRecords.size) setText('#waitlist-count', `${waitlistTotal} registrations · ${waitlistRecords.size} loaded · ${visible.length} shown`);
  for (const record of visible) {
    const tr = document.createElement('tr');
    for (const [label, value] of [['Email', isTestAddress(record.email) ? `${record.email} (test address)` : record.email], ['Registered', record.createdAt ? new Date(record.createdAt).toLocaleString() : 'Pending timestamp']]) { const td = document.createElement('td'); td.dataset.label = label; td.textContent = value; tr.append(td); }
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
// Waitlist insights: counts, sign-up chart, breakdowns and exports from the rows loaded in this browser only.
const waitlistFilter = () => ({ query: $('#wl-query').value, hideTests: $('#wl-hide-tests').checked, consent: $('#wl-consent').value });
function clearWaitlistInsights() {
  waitlistLoadingAll = false; waitlistPeriod = 'day';
  $('#wl-stats').replaceChildren(); $('#wl-chart').replaceChildren(); $('#wl-breakdowns').replaceChildren();
  setText('#wl-coverage', ''); setText('#wl-status', ''); $('#wl-query').value = ''; $('#wl-hide-tests').checked = false; $('#wl-consent').value = 'all';
  show('#waitlist-insights', false); show('#wl-filter', false);
}
const shortDate = (time, opts) => new Date(time).toLocaleDateString(undefined, opts || { month: 'short', day: 'numeric' });
function renderWaitlistChart() {
  const records = [...waitlistRecords.values()].filter(r => !isTestAddress(r.email));
  const buckets = waitlistPeriod === 'week' ? perWeek(records) : perDay(records), max = Math.max(1, ...buckets.map(b => b.count));
  const total = buckets.reduce((n, b) => n + b.count, 0), chart = $('#wl-chart'); chart.replaceChildren();
  for (const b of document.querySelectorAll('[data-wl-period]')) b.setAttribute('aria-pressed', String(b.dataset.wlPeriod === waitlistPeriod));
  setText('#wl-chart-title', waitlistPeriod === 'week' ? `Sign-ups per week · ${total} in 12 weeks` : `Sign-ups per day · ${total} in 30 days`);
  const axis = el('div', 'wl-axis'); axis.setAttribute('aria-hidden', 'true'); axis.append(el('span', '', String(max)), el('span', '', max > 1 ? String(Math.round(max / 2)) : ''), el('span', '', '0'));
  const bars = el('div', 'wl-bars'); bars.setAttribute('role', 'list');
  bars.setAttribute('aria-label', waitlistPeriod === 'week' ? 'Sign-ups per week, oldest first' : 'Sign-ups per day, oldest first');
  const labels = el('div', 'wl-labels'); labels.setAttribute('aria-hidden', 'true');
  const step = waitlistPeriod === 'week' ? 2 : 5;
  buckets.forEach((b, i) => {
    const when = waitlistPeriod === 'week' ? `Week of ${shortDate(b.start)}` : shortDate(b.start, { weekday: 'short', month: 'short', day: 'numeric' });
    const bar = el('div', `wl-bar${b.count ? '' : ' zero'}${i === buckets.length - 1 ? ' today' : ''}`); bar.setAttribute('role', 'listitem');
    const text = `${when}: ${b.count} sign-up${b.count === 1 ? '' : 's'}`; bar.title = text; bar.setAttribute('aria-label', text);
    const fill = el('span'); fill.style.height = `${Math.round(b.count / max * 100)}%`; bar.append(fill); bars.append(bar);
    const k = (buckets.length - 1 - i) / step, labelled = Number.isInteger(k);
    labels.append(el('span', labelled && k % 2 ? 'minor' : '', labelled ? shortDate(b.start) : ''));
  });
  chart.append(axis, bars, labels);
  const s = summarize(waitlistRecords.values(), { total: waitlistTotal });
  if (!s.complete) chart.append(el('p', 'hint wl-chart-note', `Older sign-ups may be missing: only the ${s.loaded} newest registrations are loaded. Use Load all registrations for complete numbers.`));
}
function renderWaitlistInsights() {
  const searching = !!waitlistEmail, has = waitlistRecords.size > 0;
  show('#waitlist-insights', !searching && has); show('#wl-filter', !searching && has);
  if (searching || !has) return;
  const s = summarize(waitlistRecords.values(), { total: waitlistTotal });
  setText('#wl-coverage', s.complete ? `All ${s.total} registrations loaded${s.tests ? ` · ${s.tests} test address${s.tests === 1 ? '' : 'es'} left out` : ''}` : `Based on the ${s.loaded} newest of ${s.total} registrations${s.tests ? ` · ${s.tests} test address${s.tests === 1 ? '' : 'es'} left out` : ''}`);
  show('#wl-load-all', !s.complete);
  const stats = $('#wl-stats'); stats.replaceChildren();
  for (const [value, label] of [
    [String(s.total), `registrations in total${s.complete ? '' : ` · ${s.real} real loaded`}`],
    [String(s.last7), `in the last 7 days · ${trendText(s.last7, s.prev7)}`],
    [String(s.last30), `in the last 30 days · ${s.today} today`],
    [`${s.consentPercent}%`, `consent recorded (${s.consented} of ${s.real})${s.consentMissing ? ` · ${s.consentMissing} missing` : ''}`],
  ]) { const li = el('li'), box = el('div', 'launch-stat'); box.append(el('strong', '', value), el('span', '', label)); li.append(box); stats.append(li); }
  renderWaitlistChart();
  const wrap = $('#wl-breakdowns'); wrap.replaceChildren();
  const retention = [['Ends within 30 days', s.expiring], ['Past retention date', s.expired], ['Without sign-up time', s.noTimestamp]];
  if (s.first) retention.push(['First sign-up', shortDate(s.first, { year: 'numeric', month: 'short', day: 'numeric' })], ['Latest sign-up', shortDate(s.latest, { year: 'numeric', month: 'short', day: 'numeric' })]);
  for (const [title, pairs] of [['Privacy notice version', s.byNotice], ['Where they signed up', s.bySource], ['Status', s.byStatus], ['Retention', retention]]) {
    const box = el('section'); box.append(el('h4', '', title)); const list = el('ul');
    for (const [key, count] of pairs.length ? pairs : [['None yet', '']]) { const li = el('li'); li.append(el('span', '', String(key)), el('strong', '', String(count))); list.append(li); }
    box.append(list); wrap.append(box);
  }
}
for (const button of document.querySelectorAll('[data-wl-period]')) button.addEventListener('click', () => { waitlistPeriod = button.dataset.wlPeriod; renderWaitlistChart(); });
for (const [id, type] of [['#wl-query', 'input'], ['#wl-hide-tests', 'change'], ['#wl-consent', 'change']]) $(id).addEventListener(type, () => renderRegistrations());
$('#wl-load-all').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  waitlistLoadingAll = true;
  try {
    for (let page = 0; page < 20 && waitlistCursor && waitlistLoadingAll; page++) {
      setText('#wl-status', `Loading… ${waitlistRecords.size} of ${waitlistTotal}`);
      await loadRegistrations({ more: true }); checkSession();
    }
    setText('#wl-status', waitlistCursor ? `Loaded ${waitlistRecords.size} of ${waitlistTotal}. Press again to continue.` : `All ${waitlistRecords.size} registrations loaded.`);
  } finally { waitlistLoadingAll = false; }
}, '#wl-status'));
$('#wl-download').addEventListener('click', () => {
  const rows = filterRecords(waitlistRecords.values(), waitlistFilter());
  if (!rows.length) { setText('#wl-status', 'Nothing to download: no loaded registration matches the filter.'); return; }
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
  a.href = url; a.download = `fynx-waitlist-${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  setText('#wl-status', `Downloaded ${rows.length} registration${rows.length === 1 ? '' : 's'}${rows.length < waitlistTotal ? ` (of ${waitlistTotal}; only loaded rows matching the filter are included)` : ''}. The file contains email addresses — keep it private.`);
});
$('#wl-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(summaryText(summarize(waitlistRecords.values(), { total: waitlistTotal }))); setText('#wl-status', 'Summary copied (counts only, no email addresses).'); }
  catch { setText('#wl-status', 'Copying was blocked by the browser.'); }
});
$('#load-waitlist').addEventListener('click', event => run(event.currentTarget, () => loadRegistrations()));
$('#more-waitlist').addEventListener('click', event => run(event.currentTarget, () => loadRegistrations({ more: true })));
$('#waitlist-search').addEventListener('submit', event => { event.preventDefault(); run($('#find-registration'), () => loadRegistrations({ email: $('#waitlist-email').value.trim() })); });
$('#clear-waitlist-search').addEventListener('click', event => run(event.currentTarget, async () => { await loadRegistrations({ email: '' }); $('#waitlist-search').reset(); }));
setText('#launch-market', launchPlan.marketPlan);
// Launch readiness: overview, filters, per-gate steps and owner test results kept only in this browser.
let launchRecords = {}, launchFilter = 'all';
try { launchRecords = cleanRecords(JSON.parse(localStorage.getItem(TRACKER_KEY) || '{}'), launchPlan); } catch { launchRecords = {}; }
function saveLaunchRecords() { try { localStorage.setItem(TRACKER_KEY, JSON.stringify(launchRecords)); } catch { setText('#launch-save-status', 'This browser blocked saving. Results last until you close the page.'); } }
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
function progressBar(done, total, label) {
  const bar = el('span', 'launch-bar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', label);
  const fill = el('span'); fill.style.width = `${total ? Math.round(done / total * 100) : 0}%`; bar.append(fill); return bar;
}
function openGate(id, focus = true) {
  if (launchFilter !== 'all' && groupOf(launchPlan.items.find(i => i.id === id)?.status) !== launchFilter) { launchFilter = 'all'; renderLaunch(); }
  const details = document.getElementById(`gate-${id}`); if (!details) return;
  details.open = true; details.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  if (focus) details.querySelector('summary')?.focus({ preventScroll: true });
}
function renderLaunchOverview() {
  const o = overview(launchPlan, launchRecords), box = $('#launch-overview'); box.replaceChildren();
  const head = el('div', 'launch-headline');
  head.append(el('strong', 'launch-percent', `${o.percent}%`), el('span', 'muted', `${o.done} of ${o.total} launch steps done across ${o.gates} gates`));
  box.append(head, progressBar(o.done, o.total, `${o.percent}% of launch steps done`));
  const stats = el('ul', 'launch-stats');
  for (const [key, value] of [['done', o.counts.done], ['you', o.counts.you], ['others', o.counts.others]]) {
    const li = el('li'); const b = el('button', `launch-stat stat-${key}`); b.type = 'button';
    b.append(el('strong', '', String(value)), el('span', '', `${value === 1 ? 'gate' : 'gates'} · ${groupLabels[key].toLowerCase()}`));
    b.addEventListener('click', () => { launchFilter = key; renderLaunch(); $('#launch-checklist').scrollIntoView({ block: 'start' }); });
    li.append(b); stats.append(li);
  }
  const mine = el('li'); mine.append(el('div', 'launch-stat stat-mine', ''));
  mine.firstChild.append(el('strong', '', `${o.yoursDone}/${o.yours}`), el('span', '', `your tests and decisions done${o.failed ? ` · ${o.failed} failed` : ''}`));
  stats.append(mine); box.append(stats);
  const next = nextActions(launchPlan, launchRecords, 3);
  const wrap = el('div', 'launch-next'); wrap.append(el('h3', '', next.length ? 'Your next steps' : 'All your steps are recorded'));
  if (next.length) {
    const list = el('ol');
    for (const { gate, step, failed } of next) {
      const li = el('li'); const b = el('button', 'text-button launch-next-link'); b.type = 'button';
      b.append(el('span', 'launch-next-gate', `${failed ? 'Retest · ' : ''}${gate.title}`), el('span', '', step.text));
      b.addEventListener('click', () => { const k = stepKey(gate.id, step.id); if (findDecision(k)) openDecision(k); else if (k === DRILL_STEP) openDrill(); else openGate(gate.id); }); li.append(b); list.append(li);
    }
    wrap.append(list);
  } else wrap.append(el('p', 'muted', 'Copy the report below and share it so the checklist evidence can be updated.'));
  box.append(wrap);
}
function renderLaunchFilters() {
  const nav = $('#launch-filters'); nav.replaceChildren();
  for (const key of Object.keys(groupLabels)) {
    const count = key === 'all' ? launchPlan.items.length : launchPlan.items.filter(i => groupOf(i.status) === key).length;
    const b = el('button', 'launch-chip', `${groupLabels[key]} (${count})`); b.type = 'button'; b.setAttribute('aria-pressed', String(launchFilter === key));
    b.addEventListener('click', () => { launchFilter = key; renderLaunch(); }); nav.append(b);
  }
}
function recordStep(gate, step, patch) {
  const key = stepKey(gate.id, step.id), prev = launchRecords[key] || { result: '', note: '', at: 0 };
  const next = { ...prev, ...patch, at: Date.now() };
  if (!next.result && !next.note) delete launchRecords[key]; else launchRecords[key] = next;
  saveLaunchRecords(); renderLaunch({ keepOpen: gate.id, focusStep: key }); renderCryptoTests();
}
function stepRow(gate, step) {
  const key = stepKey(gate.id, step.id), state = stepState(gate, step, launchRecords), rec = launchRecords[key];
  const li = el('li', `launch-step is-${state}`); li.dataset.step = key;
  const top = el('div', 'launch-step-top');
  top.append(el('span', `launch-by by-${step.by}`, byLabels[step.by]), el('p', 'launch-step-text', step.text));
  const mark = el('span', 'launch-mark', state === 'done' ? (step.done ? 'Done' : resultLabels[rec?.result] || 'Done') : state === 'failed' ? 'Failed' : step.by === 'you' ? 'To do' : 'Open');
  top.append(mark); li.append(top);
  if (step.by !== 'you' || step.done) return li;
  const controls = el('div', 'launch-step-controls');
  const group = el('div', 'launch-results'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', `Result: ${step.text}`);
  for (const result of RESULTS) {
    const b = el('button', `launch-result result-${result}`, resultLabels[result]); b.type = 'button'; b.dataset.result = result;
    b.setAttribute('aria-pressed', String(rec?.result === result));
    b.addEventListener('click', () => recordStep(gate, step, { result: rec?.result === result ? '' : result }));
    group.append(b);
  }
  controls.append(group);
  if (step.tab) {
    const go = el('button', 'text-button launch-go', `Open ${tabLabels[step.tab]} ↗`); go.type = 'button';
    go.addEventListener('click', () => { if (step.tab === 'public') window.open('./', '_blank', 'noopener'); else { selectTab(step.tab); window.scrollTo(0, 0); } });
    controls.append(go);
  }
  if (findDecision(key)) {
    const go = el('button', 'text-button launch-go', 'Answer in the decision worksheet ↓'); go.type = 'button';
    go.addEventListener('click', () => openDecision(key)); controls.append(go);
  }
  if (key === DRILL_STEP) {
    const go = el('button', 'text-button launch-go', 'Run it with the practice guide ↓'); go.type = 'button';
    go.addEventListener('click', () => openDrill()); controls.append(go);
  }
  li.append(controls);
  const noteId = `note-${gate.id}-${step.id}`, label = el('label', 'launch-note-label', 'Note (browser, device, transaction ID; never keys or recovery words)'); label.htmlFor = noteId;
  const note = el('input', 'launch-note'); note.id = noteId; note.maxLength = 280; note.autocomplete = 'off'; note.spellcheck = false; note.value = rec?.note || '';
  const warn = el('p', 'launch-note-warn'); warn.setAttribute('role', 'status');
  note.addEventListener('change', () => {
    if (looksSecret(note.value)) { warn.textContent = 'This looks like a recovery phrase or key, so it was not saved. Delete it and never type it into any website.'; note.value = rec?.note || ''; return; }
    recordStep(gate, step, { note: note.value.trim() });
  });
  li.append(label, note, warn);
  if (rec?.at) li.append(el('p', 'launch-when', `Recorded ${new Date(rec.at).toLocaleString()}`));
  return li;
}
function renderLaunch({ keepOpen = '', focusStep = '' } = {}) {
  const open = new Set([...document.querySelectorAll('#launch-checklist details[open]')].map(d => d.dataset.gate));
  if (keepOpen) open.add(keepOpen);
  renderLaunchOverview(); renderLaunchFilters();
  const list = $('#launch-checklist'); list.replaceChildren();
  for (const item of launchPlan.items) {
    if (launchFilter !== 'all' && groupOf(item.status) !== launchFilter) continue;
    const p = gateProgress(item, launchRecords);
    const details = el('details', `launch-item group-${groupOf(item.status)}`); details.id = `gate-${item.id}`; details.dataset.gate = item.id; details.open = open.has(item.id);
    const summary = el('summary'), title = el('strong', '', item.title), state = el('span', 'launch-state', statusLabels[item.status]);
    const meter = el('span', 'launch-meter'); meter.append(progressBar(p.done, p.total, `${p.done} of ${p.total} steps done`), el('span', '', `${p.done}/${p.total}${p.failed ? ` · ${p.failed} failed` : ''}`));
    summary.append(title, state, meter); details.append(summary);
    for (const [label, text] of [['Current', item.current], ['To finish', item.next], ['Responsible', item.responsibility]]) {
      const line = el('p'), lead = el('strong', '', `${label}: `); line.append(lead, document.createTextNode(text)); details.append(line);
    }
    const steps = el('ol', 'launch-steps'); for (const step of item.steps || []) steps.append(stepRow(item, step));
    details.append(el('h3', 'launch-steps-h', 'Steps'), steps);
    const link = el('a', '', 'Evidence and context ↗'); link.href = `https://github.com/EA-LA/FYNX-Wallet/blob/main/${item.evidence}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
    details.append(link); list.append(details);
  }
  if (!list.children.length) list.append(el('p', 'muted', 'No gates in this view.'));
  if (focusStep) list.querySelector(`[data-step="${CSS.escape(focusStep)}"] [aria-pressed="true"], [data-step="${CSS.escape(focusStep)}"] .launch-note`)?.focus({ preventScroll: true });
  renderDecisions();
}
const launchReport = () => reportMarkdown(launchPlan, launchRecords, { browser: browserSummary(navigator.userAgent) });
$('#copy-launch-report').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(launchReport()); setText('#launch-save-status', 'Report copied. Paste it into a message to your engineer or Claude so the checklist evidence can be updated.'); }
  catch { setText('#launch-save-status', 'Copying was blocked by the browser. Use Download report instead.'); }
});
$('#download-launch-report').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([launchReport()], { type: 'text/markdown' })), a = document.createElement('a');
  a.href = url; a.download = `fynx-launch-tests-${new Date().toISOString().slice(0, 10)}.md`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  setText('#launch-save-status', 'Report downloaded.');
});
$('#clear-launch-results').addEventListener('click', () => {
  if (!Object.keys(launchRecords).length || !window.confirm('Clear all test results and notes saved in this browser?')) return;
  launchRecords = {}; try { localStorage.removeItem(TRACKER_KEY); } catch { /* ignore */ }
  renderLaunch(); renderCryptoTests(); setText('#launch-save-status', 'Saved results cleared from this browser.');
});
// A short note (browser, device, transaction ID) edited in place on the Account security and Crypto tools tabs.
// Same records as Launch readiness; secret-looking text is refused and never saved.
function stepNoteEditor(key, note, save, statusId) {
  const wrap = guideEl('div', 'step-note-edit'), id = `inline-note-${key.replace(/[^a-z0-9-]/gi, '-')}`;
  if (note) wrap.append(guideEl('p', 'cg-note', `Note: ${note}`));
  const toggle = guideEl('button', 'text-button step-note-toggle', note ? 'Edit note' : 'Add a note'); toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', id);
  const form = guideEl('form', 'step-note-form'); form.id = id; form.hidden = true;
  const label = guideEl('label', 'visually-hidden-label', 'Note (browser, device, transaction ID; never keys or recovery words)'); label.htmlFor = `${id}-input`;
  const input = guideEl('input'); input.id = `${id}-input`; input.maxLength = 280; input.autocomplete = 'off'; input.spellcheck = false; input.value = note; input.placeholder = 'e.g. Safari 18 on iPhone 15';
  const ok = guideEl('button', 'button secondary', 'Save note'), cancel = guideEl('button', 'text-button', 'Cancel'); cancel.type = 'button';
  const warn = guideEl('p', 'launch-note-warn'); warn.setAttribute('role', 'status');
  form.append(label, input, ok, cancel, warn);
  const close = () => { form.hidden = true; toggle.hidden = false; toggle.setAttribute('aria-expanded', 'false'); input.value = note; warn.textContent = ''; toggle.focus(); };
  toggle.addEventListener('click', () => { form.hidden = false; toggle.hidden = true; toggle.setAttribute('aria-expanded', 'true'); input.focus(); });
  cancel.addEventListener('click', close);
  input.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (looksSecret(input.value)) { input.value = ''; warn.textContent = 'This looks like a recovery phrase or key, so it was not saved. Never type it into any website.'; input.focus(); return; }
    const value = input.value.replace(/\s+/g, ' ').trim();
    if (value === note) { close(); setText(statusId, 'Note unchanged.'); return; }
    save(value);
  });
  wrap.append(toggle, form);
  return wrap;
}
// Bring in results from another device: read a copied or downloaded test report and merge it,
// newest result per step wins. Read in this browser only; nothing is uploaded.
let pendingImport = null;
function clearReportImport() {
  pendingImport = null;
  const text = document.getElementById('import-report'); if (text) text.value = '';
  const file = document.getElementById('import-file'); if (file) file.value = '';
  const box = document.getElementById('import-preview'); if (box) { box.replaceChildren(); box.hidden = true; }
  setText('#import-status', '');
}
const launchStepIndex = () => new Map(launchPlan.items.flatMap(gate => (gate.steps || []).map(step => [stepKey(gate.id, step.id), { gate, step }])));
function previewReport(text) {
  const box = $('#import-preview'); box.replaceChildren(); box.hidden = true; pendingImport = null;
  if (!text.trim()) { setText('#import-status', 'Paste a test report or choose a report file first.'); return; }
  const parsed = parseReport(text, launchPlan), count = Object.keys(parsed.records).length;
  if (parsed.secret) { clearReportImport(); setText('#import-status', 'This text looks like it contains a recovery phrase or key, so it was cleared and not read. Never paste those into any website.'); return; }
  if (!count) { setText('#import-status', parsed.looksLikeReport ? 'This report has no recorded results to bring in.' : 'This does not look like a FYNX launch test report. Use Copy test report or Download report on your other device.'); return; }
  const m = mergeRecords(launchRecords, parsed.records), index = launchStepIndex();
  pendingImport = m.merged;
  const sum = guideEl('ul', 'launch-import-sum');
  for (const [cls, n, label] of [['is-add', m.added.length, 'new here'], ['is-update', m.updated.length, 'newer than this browser'], ['is-same', m.same.length, 'already here'], ['is-kept', m.kept.length, 'kept: this browser is newer']]) if (n) sum.append(guideEl('li', cls, `${n} ${label}`));
  if (parsed.refused) sum.append(guideEl('li', 'is-kept', `${parsed.refused} note${parsed.refused === 1 ? '' : 's'} left out: looked like a key`));
  if (parsed.unknown.length) sum.append(guideEl('li', 'is-kept', `${parsed.unknown.length} line${parsed.unknown.length === 1 ? '' : 's'} not matched to a current step`));
  box.append(guideEl('h4', '', `${count} result${count === 1 ? '' : 's'} found in the report`), sum);
  const list = guideEl('ul', 'launch-import-list'), what = { added: 'New', updated: 'Newer', kept: 'Kept yours', same: 'Same' };
  for (const kind of ['added', 'updated', 'kept', 'same']) for (const key of m[kind]) {
    const hit = index.get(key), rec = parsed.records[key]; if (!hit) continue;
    const li = guideEl('li'), body = guideEl('div');
    body.append(guideEl('span', '', hit.step.text), guideEl('small', '', `${hit.gate.title} · ${rec.result ? resultLabels[rec.result] : 'Note only'}${rec.at ? ` · recorded ${new Date(rec.at).toLocaleString()}` : ''}${rec.note ? ` · Note: ${rec.note}` : ''}${kind === 'kept' ? ` · this browser has ${launchRecords[key]?.result ? resultLabels[launchRecords[key].result] : 'a note'} from later` : ''}`));
    li.append(guideEl('span', `import-mark import-${kind}`, what[kind]), body); list.append(li);
  }
  box.append(list);
  const actions = guideEl('div', 'actions'), changes = m.added.length + m.updated.length;
  const apply = guideEl('button', 'button', changes ? `Add ${changes} result${changes === 1 ? '' : 's'} to this browser` : 'Nothing new to add'); apply.type = 'button'; apply.id = 'import-apply'; apply.disabled = !changes;
  apply.addEventListener('click', () => {
    if (!pendingImport) return;
    launchRecords = cleanRecords(pendingImport, launchPlan); saveLaunchRecords();
    clearReportImport(); renderLaunch(); renderCryptoTests(); renderSecurityTests();
    setText('#import-status', `${changes} result${changes === 1 ? '' : 's'} added. Progress, next steps and your test report now include them.`);
    $('#import-check').focus();
  });
  const cancel = guideEl('button', 'text-button', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', () => { clearReportImport(); setText('#import-status', 'Nothing was changed.'); $('#import-report').focus(); });
  actions.append(apply, cancel); box.append(actions); box.hidden = false;
  setText('#import-status', changes ? 'Check the list, then press Add to keep these results.' : 'Everything in this report is already here or older than this browser’s results.');
}
$('#import-check').addEventListener('click', () => previewReport($('#import-report').value));
$('#import-clear').addEventListener('click', () => { clearReportImport(); $('#import-report').focus(); });
$('#import-file').addEventListener('change', async event => {
  const file = event.currentTarget.files?.[0]; if (!file) return;
  if (file.size > 200000) { clearReportImport(); setText('#import-status', 'That file is too large to be a FYNX test report.'); return; }
  try { const text = await file.text(); $('#import-report').value = text.slice(0, 100000); previewReport($('#import-report').value); }
  catch { setText('#import-status', 'This browser could not read that file. Paste the report instead.'); }
});
// Owner decisions worksheet: structured answers for the twelve decision steps, kept only in this browser.
// A complete answer records the matching launch step as Passed with a short "Decision: …" note.
let decisionAnswers = {};
try { decisionAnswers = cleanAnswers(JSON.parse(localStorage.getItem(DECISIONS_KEY) || '{}')); } catch { decisionAnswers = {}; }
function saveDecisionAnswers() { try { localStorage.setItem(DECISIONS_KEY, JSON.stringify(decisionAnswers)); return true; } catch { setText('#ld-status', 'This browser blocked saving. Answers last until you close the page.'); return false; } }
const decisionStateLabels = { decided: 'Decided', draft: 'In progress', open: 'To decide' };
function openDecision(key) {
  const details = document.querySelector(`#ld-list details[data-decision="${CSS.escape(key)}"]`); if (!details) return;
  details.open = true; details.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  (details.querySelector('input:not([type="radio"]), select, input:checked') || details.querySelector('input'))?.focus({ preventScroll: true });
}
function decisionField(decision, field, value, onWarn) {
  const id = `ld-${decision.gate}-${decision.step}-${field.id}`;
  if (field.type === 'choice') {
    const set = el('fieldset', 'ld-choice'); set.append(el('legend', '', `${field.label}${field.required ? '' : ' (optional)'}`));
    for (const o of field.options) {
      const lab = el('label', `ld-option${o.value === value ? ' is-checked' : ''}`), input = el('input');
      input.type = 'radio'; input.name = id; input.value = o.value; input.checked = o.value === value; input.dataset.field = field.id;
      input.addEventListener('change', () => { for (const l of set.querySelectorAll('.ld-option')) l.classList.toggle('is-checked', l.querySelector('input').checked); });
      const text = el('span', 'ld-option-text'); text.append(el('span', '', o.label)); if (o.hint) text.append(el('small', '', o.hint));
      lab.append(input, text); set.append(lab);
    }
    return set;
  }
  const wrap = el('div', 'ld-field'), lab = el('label', '', field.label); lab.htmlFor = id;
  let input;
  if (field.type === 'select') {
    input = el('select'); input.append(new Option('Choose…', ''));
    for (const o of field.options) input.append(new Option(o.label, o.value, false, o.value === value));
  } else {
    input = el('input'); input.type = field.type === 'number' ? 'text' : field.type; input.value = value || '';
    if (field.type === 'number') { input.inputMode = 'decimal'; }
    if (field.type === 'text') input.maxLength = 80;
    if (field.placeholder) input.placeholder = field.placeholder;
    input.autocomplete = 'off'; input.spellcheck = false;
  }
  input.id = id; input.dataset.field = field.id;
  input.addEventListener('change', () => { if (looksSecret(input.value)) { input.value = ''; onWarn('That looks like a recovery phrase or key, so it was removed. Never type one into any website.'); } });
  wrap.append(lab, input); if (field.hint) wrap.append(el('p', 'hint', field.hint));
  return wrap;
}
function readDecisionForm(decision, form) {
  const out = {}, rejected = [];
  for (const field of decision.fields) {
    const raw = field.type === 'choice' ? form.querySelector(`input[data-field="${field.id}"]:checked`)?.value : form.querySelector(`[data-field="${field.id}"]`)?.value;
    const v = cleanValue(field, raw);
    if (v) out[field.id] = v; else if (raw && String(raw).trim()) rejected.push(field.label);
  }
  return { out, rejected };
}
function saveDecision(decision, form, warn) {
  const key = decisionKey(decision), { out, rejected } = readDecisionForm(decision, form);
  if (rejected.length) { warn.textContent = `Check ${rejected.join(', ')}: the value was not accepted.`; return; }
  if (!Object.keys(out).length) { warn.textContent = 'Nothing to save yet.'; return; }
  decisionAnswers[key] = out; saveDecisionAnswers();
  const issues = problems(decision, out), gate = launchPlan.items.find(g => g.id === decision.gate);
  const prev = launchRecords[key] || { result: '', note: '', at: 0 };
  if (!issues.length) launchRecords[key] = { result: 'pass', note: decisionNote(decision, out), at: Date.now() };
  else if (prev.result === 'pass' || prev.result === 'skip') launchRecords[key] = { ...prev, result: '', at: Date.now() };
  saveLaunchRecords();
  renderLaunch({ keepOpen: gate.id }); renderCryptoTests();
  const details = document.querySelector(`#ld-list details[data-decision="${CSS.escape(key)}"]`);
  if (details) { details.open = true; details.querySelector('.ld-save')?.focus({ preventScroll: true }); }
  setText('#ld-status', issues.length ? `${decision.title}: saved as in progress. ${issues[0]}` : `${decision.title}: decided and marked done in the checklist.`);
}
// Unsaved typing survives a re-render (for example after recording a test elsewhere on the tab). Memory only.
const discardDrafts = new Set();
function decisionDrafts(list) {
  const drafts = {};
  for (const details of list.querySelectorAll('details[data-decision]')) {
    const key = details.dataset.decision, decision = findDecision(key), form = details.querySelector('form');
    if (!decision || !form || discardDrafts.has(key)) continue;
    const raw = {};
    for (const field of decision.fields) {
      raw[field.id] = field.type === 'choice' ? form.querySelector(`input[data-field="${field.id}"]:checked`)?.value || '' : form.querySelector(`[data-field="${field.id}"]`)?.value ?? '';
    }
    const changed = unsavedFields(decision, raw, decisionAnswers[key] || {});
    if (Object.keys(changed).length) drafts[key] = changed;
  }
  discardDrafts.clear();
  return drafts;
}
function markDecisionDirty(details, dirty) {
  details.classList.toggle('is-dirty', dirty);
  const note = details.querySelector('.ld-unsaved'); if (note) note.hidden = !dirty;
}
function applyDecisionDraft(details, decision, draft) {
  const form = details.querySelector('form');
  for (const [id, value] of Object.entries(draft)) {
    const field = decision.fields.find(f => f.id === id); if (!field) continue;
    if (field.type === 'choice') {
      for (const input of form.querySelectorAll(`input[data-field="${id}"]`)) { input.checked = input.value === value; input.closest('.ld-option')?.classList.toggle('is-checked', input.checked); }
    } else { const input = form.querySelector(`[data-field="${id}"]`); if (input) input.value = value; }
  }
  markDecisionDirty(details, true);
}
function renderDecisions() {
  const list = document.getElementById('ld-list'); if (!list) return;
  const open = new Set([...list.querySelectorAll('details[open]')].map(d => d.dataset.decision));
  const drafts = decisionDrafts(list), focused = list.contains(document.activeElement) && document.activeElement.id ? document.activeElement.id : '';
  const p = decisionsProgress(launchPlan, launchRecords, decisionAnswers), score = $('#ld-score');
  score.replaceChildren(el('strong', '', `${p.decided}/${p.total}`), el('span', '', p.decided === p.total ? 'all decided' : 'decided'));
  score.className = `sec-score ${p.decided === p.total ? 'is-done' : ''}`; score.setAttribute('aria-label', `${p.decided} of ${p.total} decisions recorded`);
  list.replaceChildren();
  let group = '';
  for (const decision of DECISIONS) {
    const key = decisionKey(decision), state = decisionState(launchPlan, decision, launchRecords, decisionAnswers);
    if (state === 'missing') continue;
    const gate = launchPlan.items.find(g => g.id === decision.gate);
    if (gate.id !== group) { group = gate.id; list.append(el('h3', 'ld-group', gate.title)); }
    const answers = decisionAnswers[key] || {};
    const details = el('details', `ld-item is-${state}`); details.dataset.decision = key; details.open = open.has(key);
    const summary = el('summary'), head = el('span', 'ld-summary');
    head.append(el('strong', '', decision.title), el('span', 'ld-answer', state === 'open' ? 'Not answered yet' : answerText(decision, answers)));
    summary.append(head, el('span', `launch-mark ld-mark is-${state}`, decisionStateLabels[state])); details.append(summary);
    details.append(el('p', 'ld-why', decision.why));
    const form = el('form', 'ld-form'); form.noValidate = true;
    const warn = el('p', 'launch-note-warn'); warn.setAttribute('role', 'status');
    for (const field of decision.fields) form.append(decisionField(decision, field, answers[field.id], text => { warn.textContent = text; }));
    const issues = state === 'open' ? [] : problems(decision, answers);
    if (state === 'draft' && issues.length) form.append(el('p', 'ld-issue', issues.join(' ')));
    const chosen = answers[decision.fields[0].id], next = decision.unlocks && (decision.unlocks[chosen] || decision.unlocks.any);
    if (state === 'decided' && next) form.append(el('p', 'ld-next', `What happens next: ${next}`));
    const actions = el('div', 'ld-actions'), save = el('button', 'button ld-save', state === 'decided' ? 'Update decision' : 'Save decision'); save.type = 'submit';
    actions.append(save);
    if (state !== 'open') {
      const clear = el('button', 'text-button', 'Clear this answer'); clear.type = 'button';
      clear.addEventListener('click', () => {
        delete decisionAnswers[key]; saveDecisionAnswers(); discardDrafts.add(key);
        const rec = launchRecords[key]; if (rec && rec.note === decisionNote(decision, answers)) delete launchRecords[key];
        saveLaunchRecords(); renderLaunch({ keepOpen: gate.id }); renderCryptoTests(); setText('#ld-status', `${decision.title}: answer cleared.`);
      });
      actions.append(clear);
    }
    const rec = launchRecords[key];
    if (state === 'decided' && rec?.at) actions.append(el('span', 'launch-when', `Recorded ${new Date(rec.at).toLocaleString()}`));
    const unsaved = el('p', 'ld-unsaved', 'You have changes that are not saved yet. Press the button above to keep them.'); unsaved.hidden = true;
    form.append(actions, unsaved, warn);
    form.addEventListener('submit', event => { event.preventDefault(); warn.textContent = ''; discardDrafts.add(key); saveDecision(decision, form, warn); });
    const syncDirty = () => { const raw = {}; for (const field of decision.fields) raw[field.id] = field.type === 'choice' ? form.querySelector(`input[data-field="${field.id}"]:checked`)?.value || '' : form.querySelector(`[data-field="${field.id}"]`)?.value ?? ''; markDecisionDirty(details, Object.keys(unsavedFields(decision, raw, decisionAnswers[key] || {})).length > 0); };
    form.addEventListener('input', syncDirty); form.addEventListener('change', syncDirty);
    details.append(form); list.append(details);
    if (drafts[key]) { applyDecisionDraft(details, decision, drafts[key]); details.open = true; }
  }
  if (focused) { const target = document.getElementById(focused); if (target && list.contains(target)) target.focus({ preventScroll: true }); }
  setText('#ld-counsel-preview', counselSheet(launchPlan, decisionAnswers));
  renderDrill();
}
async function copyDecisionText(text, done) {
  try { await navigator.clipboard.writeText(text); setText('#ld-status', done); }
  catch { setText('#ld-status', 'Copying was blocked by the browser. Use Download lawyer sheet, or select the preview text.'); }
}
$('#ld-copy-record').addEventListener('click', () => copyDecisionText(decisionRecord(launchPlan, launchRecords, decisionAnswers), 'Decision record copied. Share it with your engineer or Claude so the checklist can be updated.'));
$('#ld-copy-counsel').addEventListener('click', () => copyDecisionText(counselSheet(launchPlan, decisionAnswers), 'Lawyer questions copied. Paste them into an email or document for your first call with counsel.'));
$('#ld-download-counsel').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([counselSheet(launchPlan, decisionAnswers)], { type: 'text/markdown' })), a = document.createElement('a');
  a.href = url; a.download = `fynx-questions-for-counsel-${new Date().toISOString().slice(0, 10)}.md`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  setText('#ld-status', 'Lawyer sheet downloaded.');
});
$('#ld-clear').addEventListener('click', () => {
  if (!Object.keys(decisionAnswers).length || !window.confirm('Clear all decision answers saved in this browser? Steps already marked done stay done until you clear them in the checklist.')) return;
  decisionAnswers = {}; for (const d of DECISIONS) discardDrafts.add(decisionKey(d)); try { localStorage.removeItem(DECISIONS_KEY); } catch { /* ignore */ }
  renderDecisions(); setText('#ld-status', 'Decision answers cleared from this browser.');
});
// Incident practice run: a facilitator guide for the "operations/drill" launch step.
// One made-up incident, seven stages from docs/OPERATIONS.md, kept only in this browser.
let drill = { current: null, history: [] }, drillFocus = '';
try { drill = cleanDrill(JSON.parse(localStorage.getItem(DRILL_KEY) || '{}')); } catch { drill = { current: null, history: [] }; }
function saveDrill() { try { localStorage.setItem(DRILL_KEY, JSON.stringify(drill)); } catch { setText('#dr-status', 'This browser blocked saving. The practice run lasts until you close the page.'); } }
function openDrill() {
  const card = document.getElementById('launch-drill'); if (!card) return;
  card.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  (card.querySelector('.dr-stage.is-current h4, input[name="dr-scenario"]:checked, input[name="dr-scenario"]') || card.querySelector('h2'))?.focus({ preventScroll: true });
}
const drillAgo = ms => { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 1 ? 'just now' : m === 1 ? '1 minute ago' : `${m} minutes ago`; };
async function copyDrill(text, done) {
  try { await navigator.clipboard.writeText(text); setText('#dr-status', done); }
  catch { setText('#dr-status', 'Copying was blocked by the browser. Use Download record instead.'); }
}
function downloadDrill(run) {
  const url = URL.createObjectURL(new Blob([drillRecord(launchPlan, run)], { type: 'text/markdown' })), a = document.createElement('a');
  a.href = url; a.download = `fynx-incident-practice-${new Date(run.startedAt || Date.now()).toISOString().slice(0, 10)}.md`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  setText('#dr-status', 'Practice-run record downloaded.');
}
function drillStartForm(body) {
  const form = el('form', 'dr-start'); form.noValidate = true;
  const set = el('fieldset', 'ld-choice'); set.append(el('legend', '', 'Choose a made-up incident'));
  SCENARIOS.forEach((sc, i) => {
    const lab = el('label', `ld-option${i === 0 ? ' is-checked' : ''}`), input = el('input');
    input.type = 'radio'; input.name = 'dr-scenario'; input.value = sc.id; input.checked = i === 0;
    input.addEventListener('change', () => { for (const l of set.querySelectorAll('.ld-option')) l.classList.toggle('is-checked', l.querySelector('input').checked); });
    const text = el('span', 'ld-option-text'); text.append(el('span', '', sc.title), el('small', '', sc.story));
    lab.append(input, text); set.append(lab);
  });
  const field = el('div', 'ld-field'), lab = el('label', '', 'Who is taking part (names or roles, separated by commas)'); lab.htmlFor = 'dr-people';
  const people = el('input'); people.id = 'dr-people'; people.maxLength = 300; people.autocomplete = 'off'; people.spellcheck = false; people.placeholder = 'for example Elham, co-founder, support';
  field.append(lab, people, el('p', 'hint', `At least ${MIN_PEOPLE} people for the run to count. One person reads the situation and the questions aloud; everyone answers before anyone opens the procedure.`));
  const warn = el('p', 'launch-note-warn'); warn.setAttribute('role', 'status');
  const actions = el('div', 'ld-actions'), go = el('button', 'button', 'Start the practice run'); go.type = 'submit'; actions.append(go);
  form.append(set, field, actions, warn);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (looksSecret(people.value)) { people.value = ''; warn.textContent = 'That looks like a recovery phrase or key, so it was removed. Never type one into any website.'; return; }
    const run = startRun(form.querySelector('input[name="dr-scenario"]:checked')?.value, people.value); if (!run) return;
    drill = { ...drill, current: run }; saveDrill(); drillFocus = STAGES[0].id; renderDrill();
    setText('#dr-status', `Practice run started: ${findScenario(run.scenario).title}.`);
  });
  body.append(form);
}
function drillStage(run, stage, index, current) {
  const a = run.answers[stage.id], sc = findScenario(run.scenario);
  const state = a ? `is-${a.result}` : current?.id === stage.id ? 'is-current' : 'is-later';
  const li = el('li', `dr-stage ${state}`); li.dataset.stage = stage.id;
  const head = el('h4', '', `${index + 1}. ${stage.title}`); head.tabIndex = -1; li.append(head);
  if (a) {
    li.append(el('p', 'dr-outcome', a.result === 'gap' ? `Gap found${a.followUp ? `: ${a.followUp}` : ''}` : `Handled${a.followUp ? `. Note: ${a.followUp}` : ''}`));
    const change = el('button', 'text-button', 'Change'); change.type = 'button';
    change.addEventListener('click', () => { const answers = { ...drill.current.answers }; delete answers[stage.id]; drill = { ...drill, current: { ...drill.current, answers } }; saveDrill(); drillFocus = stage.id; renderDrill(); });
    li.append(change); return li;
  }
  if (current?.id !== stage.id) return li;
  li.append(el('p', 'dr-prompt', sc.prompts[stage.id]));
  const proc = el('details', 'dr-procedure'); proc.append(el('summary', '', 'Discussed it? Show what the procedure says'), el('p', '', stage.procedure)); li.append(proc);
  const id = `dr-follow-${stage.id}`, lab = el('label', 'launch-note-label', 'What needs to change, or a note (optional unless you found a gap)'); lab.htmlFor = id;
  const input = el('input', 'launch-note'); input.id = id; input.maxLength = 140; input.autocomplete = 'off'; input.spellcheck = false; input.placeholder = 'for example add a second person to the Google account recovery';
  const warn = el('p', 'launch-note-warn'); warn.setAttribute('role', 'status');
  const group = el('div', 'launch-results dr-results'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', `Outcome: ${stage.title}`);
  for (const [result, label] of Object.entries(DRILL_RESULTS)) {
    const b = el('button', `launch-result ${result === 'gap' ? 'result-fail' : 'result-pass'}`, label); b.type = 'button';
    b.addEventListener('click', () => {
      if (looksSecret(input.value)) { input.value = ''; warn.textContent = 'That looks like a recovery phrase or key, so it was removed. Never type one into any website.'; return; }
      const text = cleanFollowUp(input.value);
      if (result === 'gap' && !text) { warn.textContent = 'Write in a few words what needs to change, then press Gap found.'; input.focus(); return; }
      drill = { ...drill, current: answerStage(drill.current, stage.id, result, text) }; saveDrill();
      drillFocus = currentStage(drill.current)?.id || 'summary'; renderDrill();
    });
    group.append(b);
  }
  li.append(lab, input, group, warn); return li;
}
function drillSummaryBox(run) {
  const s = runSummary(run), box = el('div', 'dr-summary'); box.id = 'dr-summary';
  const h = el('h4', '', s.complete ? 'All seven stages discussed' : 'Not finished yet'); h.tabIndex = -1; box.append(h);
  box.append(el('p', '', `${s.handled} of ${s.total} stages handled · ${s.gaps.length} gap${s.gaps.length === 1 ? '' : 's'} · ${s.minutes} min so far`));
  if (s.followUps.length) { const ul = el('ul', 'dr-follow'); for (const f of s.followUps) ul.append(el('li', '', `${f.stage.title}: ${f.text}`)); box.append(el('strong', '', 'Follow-ups'), ul); }
  if (s.reasons.length) { const ul = el('ul', 'dr-reasons'); for (const r of s.reasons) ul.append(el('li', '', r)); box.append(ul); }
  const actions = el('div', 'ld-actions'), done = el('button', 'button', 'Finish and mark the step done'); done.type = 'button'; done.disabled = !s.canRecord;
  done.addEventListener('click', () => {
    const now = Date.now(), finished = { ...drill.current, finishedAt: now };
    drill = finishRun(drill, now); saveDrill();
    launchRecords[DRILL_STEP] = { result: 'pass', note: drillNote(finished, now), at: now }; saveLaunchRecords();
    drillFocus = 'history'; renderLaunch({ keepOpen: 'operations' }); renderCryptoTests();
    setText('#dr-status', 'Practice run recorded. The step is marked done in the checklist and the follow-ups are in its note and the record below.');
  });
  actions.append(done);
  const copy = el('button', 'button secondary', 'Copy practice-run record'); copy.type = 'button';
  copy.addEventListener('click', () => copyDrill(drillRecord(launchPlan, drill.current), 'Practice-run record copied. Share it with your team so the follow-ups get done.'));
  const dl = el('button', 'button secondary', 'Download record'); dl.type = 'button'; dl.addEventListener('click', () => downloadDrill(drill.current));
  const stop = el('button', 'text-button', 'Abandon this run'); stop.type = 'button';
  stop.addEventListener('click', () => { if (!window.confirm('Abandon this practice run? Its answers are removed from this browser.')) return; drill = { ...drill, current: null }; saveDrill(); drillFocus = 'start'; renderDrill(); setText('#dr-status', 'Practice run abandoned.'); });
  actions.append(copy, dl, stop); box.append(actions);
  return box;
}
function renderDrill() {
  const body = document.getElementById('dr-body'); if (!body) return;
  const run = drill.current, rec = launchRecords[DRILL_STEP], recorded = rec?.result === 'pass' || rec?.result === 'skip';
  const score = $('#dr-score'), s = runSummary(run);
  score.replaceChildren(el('strong', '', run ? `${s.answered}/${s.total}` : recorded ? '✓' : '0/7'), el('span', '', run ? 'stages discussed' : recorded ? 'practice recorded' : 'not practised yet'));
  score.className = `sec-score ${!run && recorded ? 'is-done' : ''}`; score.setAttribute('aria-label', run ? `${s.answered} of ${s.total} stages discussed` : recorded ? 'Practice run recorded' : 'No practice run recorded yet');
  body.replaceChildren();
  if (!run) {
    if (recorded) body.append(el('p', 'ld-next', `Practice run recorded ${rec.at ? new Date(rec.at).toLocaleDateString() : ''}. Run another after big changes, new team members, or once a year.`));
    drillStartForm(body);
  } else {
    const sc = findScenario(run.scenario), head = el('div', 'dr-run');
    head.append(el('h3', '', sc.title), el('blockquote', 'dr-story', sc.story));
    const meta = el('p', 'muted dr-meta'); meta.append(document.createTextNode(`${run.people.length ? run.people.join(', ') : 'No one listed yet'} · started `));
    const ago = el('span', '', drillAgo(run.startedAt)); ago.id = 'dr-elapsed'; meta.append(ago); head.append(meta);
    const edit = el('details', 'dr-edit-people'); edit.append(el('summary', '', 'Change who is taking part'));
    const lab = el('label', 'launch-note-label', 'Names or roles, separated by commas'); lab.htmlFor = 'dr-people-edit';
    const input = el('input', 'launch-note'); input.id = 'dr-people-edit'; input.maxLength = 300; input.autocomplete = 'off'; input.spellcheck = false; input.value = run.people.join(', ');
    const save = el('button', 'text-button', 'Save people'); save.type = 'button';
    save.addEventListener('click', () => { if (looksSecret(input.value)) { input.value = run.people.join(', '); return; } drill = { ...drill, current: { ...drill.current, people: parsePeople(input.value) } }; saveDrill(); renderDrill(); setText('#dr-status', 'People updated.'); });
    edit.append(lab, input, save); head.append(edit);
    const current = currentStage(run), list = el('ol', 'dr-stages');
    STAGES.forEach((stage, i) => list.append(drillStage(run, stage, i, current)));
    head.append(list, drillSummaryBox(run)); body.append(head);
  }
  const hist = $('#dr-history'); hist.replaceChildren();
  if (!drill.history.length) hist.append(el('p', 'muted', 'None yet. Finished runs appear here (the last five).'));
  else {
    const ul = el('ul', 'dr-history');
    for (const past of drill.history) {
      const ps = runSummary(past), li = el('li');
      li.append(el('span', '', `${new Date(past.finishedAt).toLocaleDateString()} · ${ps.scenario.title} · ${past.people.length} people · ${ps.handled}/${ps.total} handled${ps.gaps.length ? ` · ${ps.gaps.length} gap${ps.gaps.length === 1 ? '' : 's'}` : ''}`));
      const c = el('button', 'text-button', 'Copy record'); c.type = 'button'; c.addEventListener('click', () => copyDrill(drillRecord(launchPlan, past), 'Practice-run record copied.'));
      li.append(c); ul.append(li);
    }
    hist.append(ul);
  }
  if (drillFocus) {
    const target = drillFocus === 'summary' ? $('#dr-summary h4') : drillFocus === 'history' ? $('#dr-history') : drillFocus === 'start' ? document.querySelector('input[name="dr-scenario"]') : document.querySelector(`.dr-stage[data-stage="${CSS.escape(drillFocus)}"] ${drillFocus === currentStage(drill.current)?.id ? 'input' : 'h4'}`);
    if (drillFocus === 'history') hist.setAttribute('tabindex', '-1');
    target?.focus({ preventScroll: false }); drillFocus = '';
  }
}
setInterval(() => { const ago = document.getElementById('dr-elapsed'); if (ago && drill.current) ago.textContent = drillAgo(drill.current.startedAt); }, 30000);
renderLaunch();

// Crypto tools test guide: setup progress from this page's state plus the owner's wallet launch tests.
// It only reads state and scrolls to controls; it never signs, sends or prepares a transaction.
function guideEl(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function goToControl(id) {
  const target = document.getElementById(id); if (!target) return;
  target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  let focusable = id === 'send-form' ? $('#recipient') : target;
  if (focusable.disabled) { focusable = target.closest('.card')?.querySelector('h2'); focusable?.setAttribute('tabindex', '-1'); }
  focusable?.focus({ preventScroll: true });
}
function renderCryptoSetup() {
  const list = document.getElementById('cg-steps'); if (!list) return;
  let network; try { network = selectedNetwork(); } catch { return; }
  const verified = !!verifiedAddress && connection?.address === verifiedAddress;
  const result = setupSteps({ walletsFound: providers.size > 0, network, connected: !!connection?.address, verified, eth: verified ? lastBalances.eth : null, usdc: verified ? lastBalances.usdc : null, transactions: [...journal.values()] });
  const score = $('#cg-score'); score.replaceChildren(guideEl('strong', '', `${result.done}/${result.total}`), guideEl('span', '', result.ready ? 'ready to test' : 'setup steps'));
  score.className = `sec-score ${result.ready ? 'is-done' : ''}`; score.setAttribute('aria-label', `${result.done} of ${result.total} setup steps done`);
  list.replaceChildren();
  result.steps.forEach((step, index) => {
    const li = guideEl('li', `cg-step is-${step.state}`); if (step.state === 'current') li.setAttribute('aria-current', 'step');
    const mark = guideEl('span', 'cg-mark', step.done ? '✓' : String(index + 1)); mark.setAttribute('aria-hidden', 'true');
    const body = guideEl('div', 'cg-body');
    body.append(guideEl('strong', '', `${step.title}${step.optional ? ' · optional' : ''}`), guideEl('p', '', step.detail));
    if (!step.done && step.state === 'current') { const b = guideEl('button', 'text-button', step.faucet ? 'Show faucets ↓' : 'Go there ↓'); b.type = 'button'; b.addEventListener('click', () => step.faucet ? goToControl('cg-faucets') : goToControl(step.target)); body.append(b); }
    li.append(mark, body); list.append(li);
  });
  const faucets = faucetsFor(network.id), box = $('#cg-faucets'); box.replaceChildren();
  if (network.testnet && (faucets.eth.length || faucets.usdc.length)) {
    box.tabIndex = -1;
    box.append(guideEl('h3', '', `Free test assets for ${network.name}`));
    for (const [kind, label] of [['eth', 'Test ETH (pays network fees)'], ['usdc', 'Test USDC']]) {
      const row = guideEl('div', 'cg-faucet-row'); row.append(guideEl('span', 'cg-faucet-kind', label));
      for (const f of faucets[kind]) { const a = guideEl('a', 'cg-faucet', `${f.label} ↗`); a.href = f.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; row.append(a); }
      box.append(row);
    }
    box.append(guideEl('p', 'hint', 'Use a wallet that holds no real money. Faucets never need your recovery phrase or a private key: anyone who asks for one is a scam. Test assets have no monetary value; daily limits apply.'));
    show('#cg-faucets', true);
  } else show('#cg-faucets', false);
}
function latestTransaction() {
  let id; try { id = selectedNetwork().id; } catch { return null; }
  return [...journal.values()].filter(t => t.network.id === id).pop() || null;
}
function recordWalletStep(gate, step, patch, focusKey) {
  const key = stepKey(gate.id, step.id), prev = launchRecords[key] || { result: '', note: '', at: 0 };
  const next = { ...prev, ...patch, at: Date.now() };
  if (!next.result && !next.note) delete launchRecords[key]; else launchRecords[key] = next;
  saveLaunchRecords(); renderLaunch(); renderCryptoTests();
  document.querySelector(`#cg-tests [data-step="${CSS.escape(key)}"] ${focusKey}`)?.focus({ preventScroll: true });
}
function renderCryptoTests() {
  const box = document.getElementById('cg-tests'); if (!box) return;
  const { groups, total, done, failed } = walletTests(launchPlan, launchRecords);
  setText('#cg-tests-count', `${done} of ${total} recorded${failed ? ` · ${failed} failed` : ''}`);
  const wasOpen = new Set([...box.querySelectorAll('details[open]')].map(d => d.dataset.gate)), first = !box.children.length;
  const firstOpen = groups.find(g => g.steps.some(s => s.state !== 'done'))?.gate.id;
  box.replaceChildren();
  const latest = latestTransaction();
  for (const { gate, steps } of groups) {
    const section = guideEl('details', 'cg-gate'); section.dataset.gate = gate.id;
    section.open = first ? gate.id === firstOpen : wasOpen.has(gate.id);
    const recorded = steps.filter(s => s.state === 'done').length, bad = steps.filter(s => s.state === 'failed').length;
    const summary = guideEl('summary'); summary.append(guideEl('strong', '', gate.title), guideEl('span', `cg-gate-count${recorded === steps.length ? ' is-done' : ''}`, `${recorded}/${steps.length}${bad ? ` · ${bad} failed` : ''}`));
    section.append(summary);
    const list = guideEl('ol', 'cg-test-list');
    for (const { step, key, state, result } of steps) {
      const li = guideEl('li', `cg-test is-${state}`); li.dataset.step = key;
      li.append(guideEl('p', 'cg-test-text', step.text));
      const controls = guideEl('div', 'launch-step-controls'), group = guideEl('div', 'launch-results');
      group.setAttribute('role', 'group'); group.setAttribute('aria-label', `Result: ${step.text}`);
      for (const r of RESULTS) {
        const b = guideEl('button', `launch-result result-${r}`, resultLabels[r]); b.type = 'button'; b.dataset.result = r; b.setAttribute('aria-pressed', String(result === r));
        b.addEventListener('click', () => recordWalletStep(gate, step, { result: result === r ? '' : r }, `[data-result="${r}"]`)); group.append(b);
      }
      controls.append(group);
      if (TX_STEPS.has(key) && latest) {
        const note = txNote(latest, launchRecords[key]?.note);
        const add = guideEl('button', 'text-button cg-add-tx', note && note === (launchRecords[key]?.note || '').trim() ? 'Latest transaction added ✓' : 'Add latest transaction ID to note'); add.type = 'button';
        add.disabled = !note || note === (launchRecords[key]?.note || '').trim();
        add.addEventListener('click', () => { const value = txNote(latest, launchRecords[key]?.note); if (!value) { setText('#cg-status', 'The note is full. Edit the note first.'); return; } recordWalletStep(gate, step, { note: value }, '.cg-add-tx'); setText('#cg-status', 'Transaction ID added to the note for this step.'); });
        controls.append(add);
      }
      li.append(controls);
      li.append(stepNoteEditor(key, launchRecords[key]?.note || '', value => { recordWalletStep(gate, step, { note: value }, '.step-note-toggle'); setText('#cg-status', value ? 'Note saved. It also appears in Launch readiness and your test report.' : 'Note removed.'); }, '#cg-status'));
      list.append(li);
    }
    section.append(list); box.append(section);
  }
}
$('#cg-copy-tests').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(walletTestSummary(launchPlan, launchRecords)); setText('#cg-status', 'Summary copied. It lists each test and its result only: no notes, addresses or transaction IDs.'); }
  catch { setText('#cg-status', 'Copying was blocked by the browser.'); }
});
$('#cg-open-launch').addEventListener('click', () => { selectTab('launch'); openGate('signing'); });
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
