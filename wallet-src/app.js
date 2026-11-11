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
import { TRACKER_KEY, RESULTS, resultLabels, byLabels, tabLabels, groupOf, groupLabels, stepKey, looksSecret, cleanRecords, stepState, gateProgress, overview, nextActions, launchOrder, waitingOn, stepIndex, shortStep, gateBlockers, engineeringBrief, reportMarkdown, parseReport, mergeRecords, browserSummary } from './launch-tracker.js';
import { checkConnections } from './connection-checks.js';
import { methodLabel, passkeyRows, signInMethods, freshness, idleLeft, minutesText, checkup, summaryText as securitySummary, relativeTime, identityTests, gateTests } from './security-checkup.js';
import { setupSteps, faucetsFor, walletTests, TX_STEPS, txNote, walletTestSummary, swapHint } from './crypto-guide.js';
import { PARTIES, partyStatus, partyLine, outsideBrief, handoffStateText } from './outside-handoff.js';
import { EVIDENCE_KEY, evidenceItems, cleanEvidence, setItem as setEvidenceItem, setReceivedDate, FIRST_DAY as EVIDENCE_FIRST_DAY, evidenceState, partyEvidence, partyEvidenceLine, readyToShare, missingAfterAnswer, missingAttention, evidenceSummary, evidenceReportLines, parseEvidenceReport, mergeEvidence } from './outside-evidence.js';
import { OUTSIDE_KEY, CHASE_DAYS, requestId, cleanRequests, setDate as setRequestDate, requestState as outsideRequestState, partyRequests, partyRequestLine, outsideAttention, requestReportLines, parseRequestReport, mergeRequests } from './outside-requests.js';
import { DECISIONS_KEY, DECISIONS, decisionKey, findDecision, cleanAnswers, cleanValue, problems, decisionNote, decisionState, decisionsProgress, decisionRecord, counselSheet, answerText, unsavedFields, DECISION_TIMES_KEY, cleanTimes, decisionReportLines, parseDecisions, mergeDecisions } from './owner-decisions.js';
import { DRILL_KEY, DRILL_STEP, MIN_PEOPLE, STAGES, SCENARIOS, RESULTS as DRILL_RESULTS, findScenario, cleanDrill, startRun, answerStage, currentStage, runSummary, drillNote, drillRecord, finishRun, parsePeople, cleanFollowUp, followUpList, followUpProgress, setFollowUpDone, followUpText, drillReportLines, parseDrillReport, mergeDrills } from './incident-drill.js';
import { checkTransaction, isSettled, STATUS_LABELS as TX_LABELS, waitingItems, autoCheckDue, batchSummary, AUTO_CHECK_MS, findReplacement, REPLACEMENT_KINDS, canFindReplacement, lookupFacts, lookupNext, findByNonce, parseNonceSearch, offersNonceSearch, walletQueue, queuePageItems, queueSummary, pageMatch, queueAutoDue, queueChange } from './tx-tracker.js';
import { setMainnetPolicy, mainnetPolicy, canTransact } from './mainnet-policy.js';
import { reconcile, reconcileReport, STATE_TEXT as RC_STATE, historyRetry, retryText } from './reconcile.js';
import { REGISTER_KEY, REASONS as RC_REASONS, reasonLabel, cleanRegister, addSubmitted, markKnown, unmark, forNetwork, registerSummary, settledChange, registerReportLines, parseRegisterReport, mergeRegisters, networkName as registerNetwork } from './pilot-register.js';
import { MAINNET_CAPS, CONFIRM_PHRASE } from '../firebase-wallet/functions/mainnet.js';
import { summarize, perDay, perWeek, trendText, filterRecords, toCSV, summaryText, isTestAddress } from './waitlist-insights.js';
import { collectDates, datesHeadline, datesText, datesIcs, KINDS as DATE_KINDS } from './owner-dates.js';
import { progressUpdate, updateMarkdown, updateHeadline, PERIODS as UPDATE_PERIODS } from './progress-update.js';
import { launchHistory, historyHeadline, historyMarkdown, weekTitle, entryLabel, WHO as HISTORY_WHO, whoLabels } from './launch-history.js';
import { PRIVACY_KEY, OUTCOMES as PR_OUTCOMES, typeLabel, outcomeLabel, defaultOutcome, localToday, cleanLog, addRequest, answerRequest, reopenRequest, removeRequest, requestState, logSummary, logMarkdown, privacyAttention, TARGET_DAYS, DUE_SOON_DAYS, privacyReportLines, parsePrivacyReport, mergePrivacyLogs } from './privacy-requests.js';
import { SESSION_KEY, LENGTHS, NEEDS, needShort, planSession, cleanSession, startSession, sessionProgress, planMarkdown, sessionSummary } from './test-session.js';
import { TIMING_KEY, sessionTimings, cleanTimings, addTimings, measuredTimes, estimateCorrections, paceRatio, timingLines, correctionsMarkdown, launchPace, daysAgo, minutesText as durationText, timingReportLines, parseTimingReport, mergeTimings, KEEP_PER_TEST as KEEP_TIMES } from './test-timing.js';
import { ACCESS_KEY, ACCESS_SERVICES, REVIEW_DAYS as ACCESS_DAYS, cleanReview, updateService, accessSummary, accessCheck, accessSummaryText, accessReportLines, parseAccessReport, mergeAccessReviews, localToday as accessToday } from './access-review.js';
import { cleanTransfers, filterTransfers, isFiltered, totals as historyTotals, byMonth, counterparties, cleanLabels, setLabel, labelOf, historyCSV, csvName as historyCsvName, summaryText as historySummary } from './history-tools.js';
import { addressFlags, checkCounts, matchesCheck, checkSummaryLine, testSignupCheck, findRemoveNote, removalRecheck, findRemoveResult, accessReply, deletionReply, CHECKS } from './waitlist-care.js';

const $ = selector => document.querySelector(selector);
const setText = (id, text) => { $(id).textContent = text; };
const show = (id, visible) => { $(id).hidden = !visible; };
let auth, api, session, connection, challenge, review, pendingHash;
let swapQuote = null, actionReview = null, checkoutReady = false, checkoutId = null;
const journal = new Map();
let lookupEntry = null; // the transaction last looked up by ID in the Track card (see renderLookup)
let queueEntry = null; // the wallet last checked in "Check the wallet's numbers" (see renderQueue)
const selectedNetwork = () => networkFor(Number($('#network-choice').value));
let generation = 0, verifiedAddress = null, busy = false, lastActivity = Date.now();
let dashboardFrame = null, dashboardLoading = false, dashboardTimer;
let waitlistCursor = null, waitlistEmail = '', waitlistTotal = 0;
const waitlistRecords = new Map();
let waitlistPeriod = 'day', waitlistLoadingAll = false, waitlistFlags = new Map(), removedTest = null;
const providers = new Map();
let signInInfo = null;
let lastBalances = { eth: null, usdc: null };
let autoLastRun = null, autoRunning = false;
let queueAutoLast = null, queueAutoRunning = false; // "Check the wallet's numbers" automatic re-check
function selectTab(name) {
  for (const tab of document.querySelectorAll('[data-tab]')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  for (const panel of document.querySelectorAll('.panel')) panel.hidden = panel.id !== `tab-${name}`;
  setText('#workspace-status', '');
  if (name === 'security') renderSecurity();
  if (name === 'registrations') { renderWaitlistTests(); renderPrivacyLog(); }
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
  journal.clear(); lookupEntry = null; $('#lookup-result').replaceChildren(); show('#lookup-result', false); queueEntry = null; $('#queue-result').replaceChildren(); show('#queue-result', false); $('#queue-wallet').value = ''; setText('#queue-status', ''); $('#transaction-journal').replaceChildren(); $('#tx-auto').checked = false; autoLastRun = null; setText('#tx-auto-status', ''); show('#tx-batch', false); setText('#lookup-status', ''); setText('#provider-message', ''); checkoutReady = false;
  session = null; connection?.close(); connection = null; clearWallet(); clearDashboard();
  waitlistCursor = null; waitlistEmail = ''; waitlistTotal = 0; waitlistRecords.clear();
  $('#waitlist-rows').replaceChildren(); $('#passkey-list').replaceChildren(); clearWaitlistInsights(); clearSecurity();
  for (const d of DECISIONS) discardDrafts.add(decisionKey(d)); renderDecisions(); clearReportImport();
  clearServices(); clearPortfolio(); clearMainnet();
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
  const canSend = verified && canTransact(connection.network);
  $('#review-transfer').disabled = busy || !canSend;
  $('#quote-swap').disabled = busy || !verified || !connection?.network.router;
  $('#prepare-swap').disabled = busy || !canSend || !swapQuote || !connection?.network.testnet;
  $('#revoke-allowance').disabled = busy || !canSend || !connection?.network.router;
  $('#lookup-transaction').disabled = busy || !verified;
  for (const b of document.querySelectorAll('#transaction-journal .tx-check, #transaction-journal .tx-find, #lookup-result .tx-check, #lookup-result .tx-find, #nonce-go')) b.disabled = busy || !connection?.address;
  if ($('#nonce-mine')) $('#nonce-mine').disabled = !connection?.address;
  $('#queue-go').disabled = busy || !connection?.address; $('#queue-mine').disabled = !connection?.address;
  for (const b of document.querySelectorAll('#queue-result .queue-find, #queue-result .tx-check, #queue-number-go')) b.disabled = busy || !connection?.address;
  $('#tx-check-all').disabled = busy || autoRunning || !connection?.address || !waitingItems(journal.values(), selectedNetwork().id).length;
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
  session = result; setMainnetPolicy(result.mainnet); renderMainnet(); renderPasskeys(); updateWalletControls();
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
  return { user, providers, passkeys, result: checkup({ emailVerified: !!user?.emailVerified, providers, passkeys, wallet: session?.wallet, access: accessCheck(accessSummary(accessReview, accessToday())) }), methods: signInMethods({ providers, passkeys }) };
}
function securityFix(fix) {
  if (fix === 'wallet') { selectTab('wallet'); window.scrollTo(0, 0); return; }
  if (fix === 'access') { openAccessService(accessSummary(accessReview, accessToday()).attention[0]?.service.id); return; }
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
    if (c.fix) { const b = document.createElement('button'); b.type = 'button'; b.className = 'text-button'; b.textContent = c.fix === 'wallet' ? 'Open Crypto tools ↗' : c.fix === 'access' ? 'Go to the access review ↓' : 'Go to Add a passkey ↓'; b.addEventListener('click', () => securityFix(c.fix)); body.append(b); }
    li.append(mark, body); list.append(li);
  }
  const ways = $('#sec-methods'); ways.replaceChildren();
  const all = [['Google', providers.includes('google.com')], ['Email & password', providers.includes('password')], [passkeys.length ? (passkeys.length === 1 ? '1 passkey' : `${passkeys.length} passkeys`) : 'Passkey', passkeys.length > 0]];
  for (const [label, on] of all) { const li = document.createElement('li'); li.className = on ? 'is-on' : 'is-off'; li.textContent = `${on ? '✓' : '—'} ${label}${on ? '' : ' · not set up'}`; ways.append(li); }
  renderSecurityTests();
  renderAccessReview();
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
// Owner access review: the outside accounts that control FYNX, reviewed every ACCESS_DAYS days.
// Fixed answers only (no passwords, codes or free text), saved in this browser and carried by the test report.
let accessReview = {};
const accessOpen = new Set();
try { accessReview = cleanReview(JSON.parse(localStorage.getItem(ACCESS_KEY) || 'null'), accessToday()); } catch { accessReview = {}; }
function saveAccessReview() { try { if (Object.keys(accessReview).length) localStorage.setItem(ACCESS_KEY, JSON.stringify(accessReview)); else localStorage.removeItem(ACCESS_KEY); } catch { /* kept until the page closes */ } }
const ACCESS_ANSWERS = { twoStep: [['yes', 'On'], ['no', 'Off'], ['unsure', 'Not sure']], codes: [['yes', 'Saved'], ['no', 'Not saved'], ['unsure', 'Not sure']] };
const ACCESS_BADGE = { risk: 'Gap', overdue: 'Overdue', never: 'Not reviewed', check: 'Finish checking', soon: 'Due soon', ok: 'Reviewed', unused: 'Not used yet' };
function renderAccessBadge(sum) {
  const tab = document.querySelector('[data-tab="security"]'); if (!tab) return;
  let badge = document.getElementById('sec-tab-badge');
  if (!badge) { badge = guideEl('span', 'tab-badge'); badge.id = 'sec-tab-badge'; badge.hidden = true; tab.append(badge); }
  const n = sum.urgent.length;
  badge.hidden = !n; badge.textContent = n ? String(n) : ''; badge.className = `tab-badge ${sum.risk ? 'is-overdue' : 'is-due-soon'}`;
  if (n) tab.setAttribute('aria-label', `Account security, ${n} ${n === 1 ? 'account needs' : 'accounts need'} attention in the access review`); else tab.removeAttribute('aria-label');
}
function openAccessService(id) {
  const target = id || ACCESS_SERVICES[0].id; accessOpen.add(target);
  if ($('#tab-security').hidden) selectTab('security'); else renderAccessReview();
  const row = document.querySelector(`#ar-list [data-service="${CSS.escape(target)}"]`);
  row?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  row?.querySelector('summary')?.focus({ preventScroll: true });
}
function setAccess(id, patch, focus, message) {
  accessReview = updateService(accessReview, id, patch); saveAccessReview(); accessOpen.add(id);
  if (session && !$('#tab-security').hidden) renderSecurity(); else renderAccessReview();
  renderLaunch();
  if (focus) document.querySelector(`#ar-list [data-service="${CSS.escape(id)}"] ${focus}`)?.focus({ preventScroll: true });
  if (message) setText('#ar-status', message);
}
function renderAccessReview() {
  const list = document.getElementById('ar-list'); if (!list) return;
  const today = accessToday(), sum = accessSummary(accessReview, today);
  renderAccessBadge(sum);
  const score = $('#ar-score'); score.replaceChildren();
  score.append(el('strong', '', `${sum.fine}/${sum.total}`), el('span', '', sum.total && sum.fine === sum.total ? 'all reviewed' : 'reviewed'));
  score.setAttribute('aria-label', `${sum.fine} of ${sum.total} accounts reviewed in the last ${ACCESS_DAYS} days`);
  score.className = `sec-score ${sum.total && sum.fine === sum.total ? 'is-done' : ''}`;
  setText('#ar-summary', sum.total && sum.fine === sum.total ? `Everything is reviewed. The next review is due by ${sum.nextDue}.` : [sum.risk && `${sum.risk} with a gap`, sum.overdue && `${sum.overdue} overdue`, sum.never && `${sum.never} not reviewed yet`, sum.check && `${sum.check} to finish checking`, sum.soon && `${sum.soon} due within two weeks`].filter(Boolean).join(' · '));
  list.replaceChildren();
  for (const r of sum.rows) {
    const { service: s, entry: e } = r, li = el('li', `ar-row is-${r.counted || r.state === 'unused' ? r.state : 'optional'}`); li.dataset.service = s.id;
    const det = el('details', 'ar-details'); det.open = accessOpen.has(s.id);
    det.addEventListener('toggle', () => { if (det.open) accessOpen.add(s.id); else accessOpen.delete(s.id); });
    const sumEl = el('summary', 'ar-summary'), head = el('div', 'ar-head');
    head.append(el('strong', 'ar-name', s.name), el('span', `launch-mark ar-badge is-${!r.counted && r.state === 'never' ? 'unused' : r.state}`, !r.counted && r.state === 'never' ? 'Optional' : ACCESS_BADGE[r.state]));
    sumEl.append(head, el('span', 'ar-state', !r.counted && r.state === 'never' ? 'Review it once you use it, or mark it Not used yet.' : r.title));
    det.append(sumEl);
    const body = el('div', 'ar-body');
    body.append(el('p', 'ar-controls', s.controls), el('p', 'hint', `What to check: ${s.check}`));
    const links = el('div', 'ar-links');
    for (const [label, href] of s.links) { const a = el('a', 'text-button', `${label} ↗`); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; links.append(a); }
    body.append(links);
    if (!s.core) {
      const lab = el('label', 'ar-unused'), box = el('input'); box.type = 'checkbox'; box.checked = !!e?.unused; box.className = 'ar-unused-box';
      box.addEventListener('change', () => setAccess(s.id, { unused: box.checked }, '.ar-unused-box', box.checked ? `${s.name}: marked not used yet. It is left out of the review.` : `${s.name}: in use. Review it like the others.`));
      lab.append(box, document.createTextNode(' Not used yet (leave it out of the review)')); body.append(lab);
    }
    if (!e?.unused) {
      const grid = el('div', 'ar-grid');
      for (const [field, title] of [['twoStep', s.id === 'github' ? 'Two-factor authentication' : '2-step verification'], ['codes', 'Recovery or backup codes saved offline']]) {
        const wrap = el('div', 'ar-field'), group = el('div', 'launch-results'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', `${s.name}: ${title}`);
        wrap.append(el('span', 'ar-label', title));
        for (const [value, label] of ACCESS_ANSWERS[field]) {
          const b = el('button', `launch-result ar-answer result-${value === 'yes' ? 'pass' : value === 'no' ? 'fail' : 'skip'}`, label); b.type = 'button'; b.dataset.field = field; b.dataset.value = value;
          b.setAttribute('aria-pressed', String(e?.[field] === value));
          b.addEventListener('click', () => setAccess(s.id, { [field]: e?.[field] === value ? '' : value }, `[data-field="${field}"][data-value="${value}"]`, `${s.name}: ${title.toLowerCase()} ${e?.[field] === value ? 'cleared' : `recorded as ${label.toLowerCase()}`}.`));
          group.append(b);
        }
        wrap.append(group); grid.append(wrap);
      }
      const pw = el('div', 'ar-field'), pid = `ar-people-${s.id}`, pl = el('label', 'ar-label', 'People with access'); pl.htmlFor = pid;
      const people = el('input', 'ar-people'); people.id = pid; people.type = 'number'; people.min = '0'; people.max = '99'; people.step = '1'; people.inputMode = 'numeric'; people.value = e?.people ?? '';
      people.addEventListener('change', () => {
        const v = people.value.trim(), n = Number(v);
        if (v && !(Number.isInteger(n) && n >= 0 && n <= 99)) { setText('#ar-status', 'Type a whole number from 0 to 99.'); people.value = e?.people ?? ''; return; }
        setAccess(s.id, { people: v === '' ? null : n }, '.ar-people', v === '' ? `${s.name}: people count cleared.` : `${s.name}: ${n} ${n === 1 ? 'person' : 'people'} with access recorded.`);
      });
      pw.append(pl, people, el('span', 'hint', s.people)); grid.append(pw);
      const dw = el('div', 'ar-field'), did = `ar-date-${s.id}`, dl = el('label', 'ar-label', 'Last reviewed'); dl.htmlFor = did;
      const date = el('input', 'ar-date'); date.id = did; date.type = 'date'; date.min = '2024-01-01'; date.max = today; date.value = e?.reviewed || '';
      date.addEventListener('change', () => {
        if (date.value && (date.value > today || date.value < '2024-01-01')) { setText('#ar-status', 'Choose a date from 2024 up to today.'); date.value = e?.reviewed || ''; return; }
        setAccess(s.id, { reviewed: date.value }, '.ar-date', date.value ? `${s.name}: last reviewed ${date.value}.` : `${s.name}: review date cleared.`);
      });
      const now = el('button', 'button secondary ar-today', 'Reviewed today'); now.type = 'button';
      now.addEventListener('click', () => setAccess(s.id, { reviewed: 'today' }, '.ar-today', `${s.name}: reviewed today. Next review by ${new Date(Date.parse(`${today}T00:00:00Z`) + ACCESS_DAYS * 86400000).toISOString().slice(0, 10)}.`));
      const row = el('div', 'ar-date-row'); row.append(date, now);
      dw.append(dl, row); grid.append(dw);
      body.append(grid);
    }
    det.append(body); li.append(det); list.append(li);
  }
}
$('#ar-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(accessSummaryText(accessReview, accessToday())); setText('#ar-status', 'Access review copied. It has account names and answers only: no addresses, passwords or codes.'); }
  catch { setText('#ar-status', 'Copying was blocked by the browser.'); }
});

// Real-money sending on Base: the owner's own switch and limits, stored by the server after a fresh sign-in.
function renderNetworkNote() {
  const network = selectedNetwork(), m = mainnetPolicy();
  setText('#network-note', network.testnet ? 'Test assets have no monetary value. Never send real money to a test network.' : m.enabled ? `Real money. Sending is on, up to ${m.ETH} ETH or ${m.USDC} USDC per transfer. Swaps stay off.` : 'Base is read-only: real-money sending is off. Only you can turn it on, below in Real-money sending.');
  const option = document.querySelector('#network-choice option[value="8453"]'); if (option) option.textContent = m.enabled ? 'Base · real money, sending on' : 'Base · real balances, read-only';
}
function renderMainnet() {
  const m = mainnetPolicy();
  setText('#mn-state', m.enabled ? `On · up to ${m.ETH} ETH or ${m.USDC} USDC per transfer${m.updatedAt ? ` · since ${new Date(m.updatedAt).toLocaleString()}` : ''}` : 'Off · Base is read-only');
  $('#mainnet-card').classList.toggle('is-on', m.enabled);
  if (m.enabled) { if (!$('#mn-eth').value) $('#mn-eth').value = m.ETH; if (!$('#mn-usdc').value) $('#mn-usdc').value = m.USDC; }
  setText('#mn-on', m.enabled ? 'Save new limits' : 'Turn on with these limits');
  show('#mn-off', m.enabled); renderNetworkNote(); updateWalletControls();
}
function clearMainnet() { setMainnetPolicy(null); $('#mn-form').reset(); setText('#mn-status', ''); renderMainnet(); }
async function saveMainnet(request, message) {
  const result = await api({ action: 'mainnet-settings', ...request });
  setMainnetPolicy(result.mainnet); connection?.cancelAction(); review = null; show('#transfer-review', false);
  $('#mn-confirm').value = ''; renderMainnet(); setText('#mn-status', message(result.mainnet));
}
$('#mn-form').addEventListener('submit', event => { event.preventDefault(); run($('#mn-on'), async () => {
  const request = { enabled: true, ETH: $('#mn-eth').value.trim(), USDC: $('#mn-usdc').value.trim(), confirm: $('#mn-confirm').value };
  if (request.confirm.trim() !== CONFIRM_PHRASE) { setText('#mn-status', `Type ${CONFIRM_PHRASE} to confirm.`); $('#mn-confirm').focus(); return; }
  try { await saveMainnet(request, m => `Real-money sending is on: up to ${m.ETH} ETH or ${m.USDC} USDC per transfer. Your wallet still asks you to approve each one.`); }
  catch (error) { if (/Unknown operation/.test(error?.message || '')) { setText('#mn-status', SERVER_UPDATE); return; } throw error; }
}, '#mn-status'); });
$('#mn-off').addEventListener('click', event => run(event.currentTarget, () => saveMainnet({ enabled: false }, () => 'Real-money sending is off. Base is read-only again.'), '#mn-status'));
setText('#mn-caps', `Pilot ceiling: ${MAINNET_CAPS.ETH} ETH and ${MAINNET_CAPS.USDC} USDC per transfer.`);
// Your services and Portfolio & history: answers from the FYNX server's data providers (keys stay on the server).
const notDeployed = error => /Unknown operation/.test(error?.message || '');
const SERVER_UPDATE = 'Your FYNX server has not been updated with this feature yet. Run the deploy step in the setup guide, then try again.';
async function serverCall(request, statusId) {
  try { return await api(request); }
  catch (error) { if (notDeployed(error)) { setText(statusId, SERVER_UPDATE); return null; } throw error; }
}
const SVC_STATES = { working: ['Working', 'ok'], missing: ['Not added yet', 'todo'], invalid: ['Key looks wrong', 'flag'], error: ['Not answering', 'flag'], off: ['Off · your switch', 'todo'], on: ['On', 'ok'] };
const SVC_HELP = {
  alchemy: 'Add alchemyKey to the FYNX_PROVIDERS secret (setup guide, step 1).',
  coingecko: 'Add coingeckoKey to the FYNX_PROVIDERS secret (setup guide, step 2).',
  backup: 'The public endpoint is busy or down; Alchemy covers it once added.',
  transak: 'Follow the Transak steps in docs/PROVIDER-SETUP.md (linked from the setup guide).',
  mainnet: '',
};
function renderServices(data) {
  const list = $('#svc-list'); list.replaceChildren();
  for (const svc of data.services || []) {
    const [label, tone] = SVC_STATES[svc.state] || ['Unknown', 'todo'];
    const li = el('li', `svc-item is-${tone}`), body = el('div');
    body.append(el('strong', '', svc.name), el('span', 'hint', svc.unlocks));
    if (tone !== 'ok' && SVC_HELP[svc.id]) body.append(el('span', 'hint svc-help', SVC_HELP[svc.id]));
    li.append(el('span', `svc-state is-${tone}`, `${label}${svc.ms ? ` · ${svc.ms} ms` : ''}`), body); list.append(li);
  }
  const ready = (data.services || []).filter(s => s.state === 'working').length;
  setText('#svc-checked', `${ready} of ${(data.services || []).length} working · checked ${new Date(data.checkedAt).toLocaleTimeString()}`);
}
function clearServices() { $('#svc-list').replaceChildren(); setText('#svc-checked', ''); setText('#svc-status', ''); }
$('#svc-check').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  const data = await serverCall({ action: 'services-status' }, '#svc-status'); checkSession();
  if (data) { renderServices(data); setText('#svc-status', 'Checked. Keys are never shown here.'); }
}, '#svc-status'));

const usd = value => value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const amountText = value => { const n = Number(value); return n === 0 ? '0' : n < 0.0001 ? '< 0.0001' : n.toLocaleString(undefined, { maximumFractionDigits: 6 }); };
let lastPortfolio = null, lastHistory = null, lastReconcile = null;
const historyAuto = { key: '', attempts: 0, cancelled: false, timer: 0, generation: -1, dueAt: 0 };
function clearPortfolio() {
  lastPortfolio = null; lastHistory = null; lastReconcile = null; clearReconcile();
  $('#pf-rows').replaceChildren(); $('#pf-history-list').replaceChildren(); show('#pf-table', false); show('#pf-total', false); show('#hx-tools', false); historyEditing = '';
  for (const id of ['#pf-total', '#pf-prices', '#pf-status']) setText(id, '');
}
$('#pf-load').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  const data = await serverCall({ action: 'portfolio' }, '#pf-status'); checkSession(); if (!data) return;
  lastPortfolio = data;
  let priceData = null, priceNote = '';
  try { priceData = await api({ action: 'prices' }); } catch (error) { priceNote = notDeployed(error) ? SERVER_UPDATE : errorMessage(error); }
  checkSession();
  const body = $('#pf-rows'); body.replaceChildren(); let total = 0, priced = false;
  for (const row of data.rows) {
    const tr = document.createElement('tr');
    const cells = [['Network', `${row.network}${row.testnet ? ' · test' : ''}`]];
    if (!row.ok) cells.push(['ETH', 'Not reachable'], ['USDC', '—'], ['Value (USD)', 'Try again shortly']);
    else {
      let value = 'Test assets · no value';
      if (!row.testnet) {
        if (priceData) { const v = Number(row.eth) * priceData.prices.ETH.usd + Number(row.usdc) * priceData.prices.USDC.usd; total += v; priced = true; value = usd(v); }
        else value = 'Add prices to see';
      }
      cells.push(['ETH', amountText(row.eth)], ['USDC', amountText(row.usdc)], ['Value (USD)', value]);
    }
    for (const [label, text] of cells) { const td = document.createElement('td'); td.dataset.label = label; td.textContent = text; tr.append(td); }
    body.append(tr);
  }
  show('#pf-table', true);
  setText('#pf-total', priced ? `${usd(total)} on Base (real assets) · ${data.address.slice(0, 6)}…${data.address.slice(-4)}` : `Wallet ${data.address.slice(0, 6)}…${data.address.slice(-4)}`); show('#pf-total', true);
  const p = priceData?.prices;
  setText('#pf-prices', p ? `Prices from ${priceData.source}, ${new Date(priceData.fetchedAt).toLocaleTimeString()}: ETH ${usd(p.ETH.usd)}${p.ETH.change24h !== null ? ` (${p.ETH.change24h >= 0 ? '+' : ''}${p.ETH.change24h.toFixed(2)}% 24h)` : ''} · USDC ${usd(p.USDC.usd)}. Balances via ${[...new Set(data.rows.filter(r => r.ok).map(r => r.via))].join(' and ') || '—'}.` : `Dollar values are off: ${priceNote}`);
  setText('#pf-status', `Checked ${new Date(data.checkedAt).toLocaleTimeString()}.`);
  renderReconcile();
}, '#pf-status'));
$('#pf-history').addEventListener('click', event => run(event.currentTarget, async checkSession => {
  historyAuto.attempts = 0; historyAuto.cancelled = false; await loadHistory(Number($('#pf-network').value), checkSession);
}, '#pf-status'));
async function loadHistory(chainId, checkSession, auto = false) {
  const data = await serverCall({ action: 'history', chainId }, '#pf-status'); checkSession(); if (!data) return false;
  lastHistory = data; renderHistory();
  setText('#pf-status', `${auto ? 'History loaded again automatically: ' : ''}${data.items.length} transfer${data.items.length === 1 ? '' : 's'} on ${data.network}${data.more ? ' (newest 100 shown)' : ''}.`);
  renderReconcile();
  return true;
}
// History tools (wallet-src/history-tools.js): filter, exact totals, months, the wallets you deal with, your own names
// for them (this browser only), CSV and a summary without addresses. Read-only: nothing is signed or sent.
const NAMES_KEY = 'fynx-owner-wallet-names-v1';
let walletNames = {}, historyEditing = '';
try { walletNames = cleanLabels(JSON.parse(localStorage.getItem(NAMES_KEY) || '{}')); } catch { walletNames = {}; }
function saveWalletNames() { try { if (Object.keys(walletNames).length) localStorage.setItem(NAMES_KEY, JSON.stringify(walletNames)); else localStorage.removeItem(NAMES_KEY); return true; } catch { return false; } }
const historyFilter = () => ({ direction: $('#hx-direction').value, token: $('#hx-token').value, query: $('#hx-query').value, labels: walletNames });
const shortId = a => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'unknown');
const utcDay = iso => (iso ? iso.slice(0, 10) : '—');
function renderHistory() {
  const data = lastHistory, list = $('#pf-history-list'); list.replaceChildren();
  if (!data) { show('#hx-tools', false); return; }
  const all = cleanTransfers(data.items), filter = historyFilter(), shown = filterTransfers(all, filter);
  show('#hx-tools', all.length > 0);
  if (!all.length) list.append(el('li', 'pf-empty', `No ETH or USDC transfers on ${data.network} for this wallet yet.`));
  else if (!shown.length) list.append(el('li', 'pf-empty', 'No transfers match these filters.'));
  for (const item of shown) {
    const li = el('li', `pf-tx is-${item.direction}`), main = el('div'), name = labelOf(walletNames, item.other);
    main.append(el('strong', '', `${item.direction === 'in' ? 'Received' : 'Sent'} ${item.amount} ${item.token}`), el('span', 'hint', `${item.direction === 'in' ? 'From' : 'To'} ${name ? `${name} (${shortId(item.other)})` : shortId(item.other)} · ${item.time ? new Date(item.time).toLocaleString() : `block ${item.block ?? '—'}`}`));
    const link = el('a', 'text-button', 'View ↗'); link.href = `${data.explorer}/tx/${item.hash}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `View transaction ${item.hash.slice(0, 10)} on the explorer`);
    li.append(el('span', 'pf-dir', item.direction === 'in' ? '↓' : '↑'), main, link); li.firstChild.setAttribute('aria-hidden', 'true'); list.append(li);
  }
  if (!all.length) return;
  setText('#hx-count', `${isFiltered(filter) ? `Showing ${shown.length} of ${all.length}` : `${all.length}`} transfer${all.length === 1 && !isFiltered(filter) ? '' : 's'} on ${data.network}${data.more ? ' · the newest 100 are loaded, older ones are not counted' : ''}.`);
  const body = $('#hx-totals'); body.replaceChildren();
  const rows = historyTotals(shown);
  if (!rows.length) { const tr = el('tr'), td = el('td', '', 'Nothing to add up.'); td.colSpan = 4; tr.append(td); body.append(tr); }
  for (const r of rows) {
    const tr = el('tr');
    for (const [label, text] of [['Asset', r.token], ['Received', `${r.received} (${r.countIn})`], ['Sent', `${r.sent} (${r.countOut})`], ['Net', r.net]]) { const td = el('td', '', text); td.dataset.label = label; tr.append(td); }
    body.append(tr);
  }
  const months = $('#hx-months'); months.replaceChildren();
  for (const m of byMonth(shown)) {
    const li = el('li'); li.append(el('strong', '', m.label), el('span', 'hint', `${m.count} transfer${m.count === 1 ? '' : 's'} · ${m.tokens.map(t => `${t.token} in ${t.received} / out ${t.sent}`).join(' · ')}`)); months.append(li);
  }
  const people = counterparties(shown, walletNames);
  setText('#hx-people-title', `Wallets you transact with (${people.length})`);
  const plist = $('#hx-people'); plist.replaceChildren();
  for (const p of people) {
    const li = el('li', `hx-person${p.once ? ' is-once' : ''}`), main = el('div');
    const head = el('strong', '', p.label || p.short);
    main.append(head);
    if (p.label) main.append(el('span', 'hint hx-addr', p.address));
    else if (p.address) main.append(el('span', 'hint hx-addr', p.address));
    main.append(el('span', 'hint', `${p.received} received · ${p.sent} sent · ${p.tokens.map(t => `${t.token} net ${t.net}`).join(' · ')} · ${p.first && p.last && utcDay(p.first) !== utcDay(p.last) ? `${utcDay(p.first)} to ${utcDay(p.last)}` : utcDay(p.last)} (UTC)`));
    if (p.once) main.append(el('span', 'hx-once', p.sent ? 'Single transfer: check this address is one you meant to use' : 'Single transfer'));
    const side = el('div', 'hx-side');
    if (p.address) {
      if (historyEditing === p.address.toLowerCase()) {
        const form = el('form', 'hx-name-form'), id = `hx-name-${p.address.slice(2, 10)}`;
        const label = el('label', 'visually-hidden-label', `Your name for ${p.short}`); label.htmlFor = id;
        const input = el('input'); input.id = id; input.maxLength = 40; input.value = p.label; input.autocomplete = 'off'; input.placeholder = 'e.g. Ledger test account';
        const save = el('button', 'button secondary', 'Save'); save.type = 'submit';
        const cancel = el('button', 'text-button', 'Cancel'); cancel.type = 'button';
        const finish = message => { historyEditing = ''; renderHistory(); setText('#hx-status', message); const again = [...$('#hx-people').querySelectorAll('[data-address]')].find(b => b.dataset.address === p.address.toLowerCase()); again?.focus(); };
        cancel.addEventListener('click', () => finish(''));
        input.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); finish(''); } });
        form.addEventListener('submit', event => {
          event.preventDefault();
          const result = setLabel(walletNames, p.address, input.value);
          if (result.error) { setText('#hx-status', result.error); input.focus(); return; }
          walletNames = result.labels;
          finish(saveWalletNames() ? (labelOf(walletNames, p.address) ? `Saved the name for ${p.short} in this browser.` : `Removed the name for ${p.short}.`) : 'This browser blocked saving. The name lasts until you reload.');
        });
        form.append(label, input, save, cancel); side.append(form);
        setTimeout(() => input.focus(), 0);
      } else {
        const edit = el('button', 'text-button', p.label ? 'Rename' : 'Name this wallet'); edit.type = 'button'; edit.dataset.address = p.address.toLowerCase();
        edit.setAttribute('aria-label', `${p.label ? 'Rename' : 'Name'} wallet ${p.short}`);
        edit.addEventListener('click', () => { historyEditing = p.address.toLowerCase(); setText('#hx-status', ''); renderHistory(); });
        side.append(edit);
      }
    }
    li.append(main, side); plist.append(li);
  }
  $('#hx-forget').hidden = !Object.keys(walletNames).length;
}
for (const id of ['#hx-direction', '#hx-token']) $(id).addEventListener('change', () => { historyEditing = ''; renderHistory(); });
$('#hx-query').addEventListener('input', () => { historyEditing = ''; renderHistory(); });
$('#hx-clear').addEventListener('click', () => { $('#hx-direction').value = 'all'; $('#hx-token').value = 'all'; $('#hx-query').value = ''; historyEditing = ''; renderHistory(); $('#hx-direction').focus(); });
$('#hx-csv').addEventListener('click', () => {
  if (!lastHistory) return;
  const shown = filterTransfers(cleanTransfers(lastHistory.items), historyFilter());
  const url = URL.createObjectURL(new Blob([historyCSV(shown, lastHistory, { labels: walletNames, known: pilotRegister.entries })], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
  a.href = url; a.download = historyCsvName(lastHistory); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  setText('#hx-status', `Downloaded ${shown.length} transfer${shown.length === 1 ? '' : 's'} as a spreadsheet (exact amounts, full addresses and transaction IDs). Keep it private.`);
});
$('#hx-copy').addEventListener('click', async () => {
  if (!lastHistory) return;
  const filter = historyFilter(), shown = filterTransfers(cleanTransfers(lastHistory.items), filter);
  try { await navigator.clipboard.writeText(historySummary(shown, lastHistory, { filter, more: lastHistory.more })); setText('#hx-status', 'Summary copied: totals and months only, no wallet addresses or transaction IDs.'); }
  catch { setText('#hx-status', 'Copying was blocked by the browser. Use “Download spreadsheet” instead.'); }
});
$('#hx-forget').addEventListener('click', () => {
  if (!window.confirm('Forget every wallet name you saved in this browser?')) return;
  walletNames = {}; saveWalletNames(); historyEditing = ''; renderHistory(); setText('#hx-status', 'Wallet names forgotten in this browser.'); $('#hx-query').focus();
});
// Automatic re-load (wallet-src/reconcile.js historyRetry): only for confirmed transactions the provider has not listed
// yet, after a short wait, at most twice for the same transactions. Paused while the page is hidden or busy; stops on sign-out.
function stopHistoryAuto(reset = true) {
  clearTimeout(historyAuto.timer); historyAuto.timer = 0;
  if (reset) Object.assign(historyAuto, { key: '', attempts: 0, cancelled: false });
}
function showHistoryAuto(plan, at) {
  const text = plan ? retryText(plan, at) : '';
  setText('#rc-auto-text', text); show('#rc-auto', Boolean(text)); $('#rc-auto-cancel').hidden = !(plan && plan.due);
}
function planHistoryAuto(result) {
  if (!result || historyAuto.generation !== generation) { stopHistoryAuto(); historyAuto.generation = generation; }
  const plan = historyRetry(result, historyAuto);
  if (plan.key !== historyAuto.key) { stopHistoryAuto(); historyAuto.key = plan.key; }
  if (!plan.due) { stopHistoryAuto(false); showHistoryAuto(plan); return false; }
  if (!historyAuto.timer) {
    const chainId = result.chainId, key = plan.key, expected = generation;
    const fire = () => {
      historyAuto.timer = 0;
      if (expected !== generation || !lastHistory || lastHistory.chainId !== chainId || historyAuto.key !== key || historyAuto.cancelled) return;
      if (document.hidden) { document.addEventListener('visibilitychange', () => { if (!historyAuto.timer) historyAuto.timer = setTimeout(fire, 2000); }, { once: true }); return; }
      if (busy) { historyAuto.timer = setTimeout(fire, 5000); return; }
      historyAuto.attempts += 1;
      run(null, checkSession => loadHistory(chainId, checkSession, true), '#pf-status');
    };
    historyAuto.timer = setTimeout(fire, plan.delayMs);
    historyAuto.dueAt = Date.now() + plan.delayMs;
  }
  showHistoryAuto(plan, new Date(historyAuto.dueAt).toLocaleTimeString());
  return true;
}
$('#rc-auto-cancel').addEventListener('click', () => {
  historyAuto.cancelled = true; stopHistoryAuto(false); if (lastReconcile) planHistoryAuto(lastReconcile);
  setText('#pf-status', 'Automatic history re-load turned off for these transactions.'); $('#rc-state').focus();
});
// Reconciliation (pilot / rollback step): history vs this page's transactions vs balances. Read-only, kept in memory only.
const RC_CHECK = { match: 'Matches', fees: 'Lower by network fees', differs: 'Differs', partial: 'History partial', unknown: 'Check balances first' };
function clearReconcile() { stopHistoryAuto(); show('#rc-auto', false); setText('#rc-auto-text', ''); for (const id of ['#rc-rows', '#rc-findings', '#rc-outside-list', '#rc-marked-list']) $(id).replaceChildren(); for (const id of ['#rc-state', '#rc-register', '#rc-updated']) setText(id, ''); show('#rc-updated', false); show('#rc-box', false); }
// Pilot transfer register (wallet-src/pilot-register.js): public transaction IDs only, in this browser only.
let pilotRegister;
try { pilotRegister = cleanRegister(JSON.parse(localStorage.getItem(REGISTER_KEY) || '{}')); } catch { pilotRegister = { entries: [] }; }
function savePilotRegister() { try { localStorage.setItem(REGISTER_KEY, JSON.stringify(pilotRegister)); return true; } catch { setText('#pf-status', 'This browser blocked saving. Remembered transfers last until you close the page.'); return false; } }
const txWhen = t => t.time ? new Date(t.time).toLocaleString() : `block ${t.block ?? '—'}`;
function explorerLink(hash) {
  const link = el('a', 'text-button', 'View ↗'); link.href = `${lastHistory.explorer}/tx/${hash}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `View transaction ${hash.slice(0, 10)} on the explorer`); return link;
}
function renderReconcileLists(result) {
  const outside = $('#rc-outside-list'), marked = $('#rc-marked-list'); outside.replaceChildren(); marked.replaceChildren();
  for (const t of result.outside) {
    const li = el('li', `rc-item${t.aboveLimit ? ' is-over' : ''}`), main = el('div'), id = `rc-reason-${t.hash.slice(2, 12)}`;
    main.append(el('strong', '', `Sent ${amountText(t.amount)} ${t.token}${t.aboveLimit ? ' · above the limit' : ''}`), el('span', 'hint', `To ${t.to ? `${t.to.slice(0, 6)}…${t.to.slice(-4)}` : 'unknown'} · ${txWhen(t)} · ${t.hash.slice(0, 10)}…`));
    const label = el('label', 'visually-hidden-label', `How was the ${amountText(t.amount)} ${t.token} transfer sent?`); label.htmlFor = id;
    const select = el('select'); select.id = id; select.append(new Option('How was it sent?', ''));
    for (const [value, text] of Object.entries(RC_REASONS)) select.append(new Option(text, value));
    const mark = el('button', 'button secondary', 'Mark as mine'); mark.type = 'button'; mark.dataset.hash = t.hash;
    mark.setAttribute('aria-label', `Mark as mine: sent ${amountText(t.amount)} ${t.token}, ${txWhen(t)}`);
    mark.addEventListener('click', () => {
      if (!select.value) { setText('#pf-status', 'Choose how the transfer was sent first.'); select.focus(); return; }
      pilotRegister = markKnown(pilotRegister, { hash: t.hash, chainId: result.chainId, reason: select.value });
      const saved = savePilotRegister(); renderReconcile();
      if (saved) setText('#pf-status', `Marked as yours: ${reasonLabel(select.value).toLowerCase()}. Remembered in this browser.`);
      ($('#rc-outside-list .button') || $('#rc-state')).focus();
    });
    li.append(main, label, select, explorerLink(t.hash), mark); outside.append(li);
  }
  for (const t of result.explained) {
    const li = el('li', `rc-item${t.aboveLimit ? ' is-over' : ''}`), main = el('div');
    main.append(el('strong', '', `Sent ${amountText(t.amount)} ${t.token}`), el('span', 'hint', `${reasonLabel(t.reason)} · ${txWhen(t)} · ${t.hash.slice(0, 10)}…`));
    const undo = el('button', 'text-button', 'Undo'); undo.type = 'button'; undo.setAttribute('aria-label', `Undo marking: sent ${amountText(t.amount)} ${t.token}, ${txWhen(t)}`);
    undo.addEventListener('click', () => {
      pilotRegister = unmark(pilotRegister, { hash: t.hash, chainId: result.chainId }); savePilotRegister(); renderReconcile();
      setText('#pf-status', 'No longer marked. The transfer is back on the list to check.');
      ($('#rc-marked-list .text-button:not([href])') || $('#rc-outside-list select') || $('#rc-state')).focus();
    });
    li.append(main, explorerLink(t.hash), undo); marked.append(li);
  }
  show('#rc-outside', result.outside.length > 0); show('#rc-marked', result.explained.length > 0);
  const sum = registerSummary(pilotRegister);
  setText('#rc-register', sum.page || sum.marked ? `Remembered in this browser since ${new Date(sum.since).toLocaleDateString()}: ${sum.page} transaction${sum.page === 1 ? '' : 's'} submitted from FYNX and ${sum.marked} marked as yours (public transaction IDs only). They travel to your other devices in the Launch readiness test report.` : 'Transactions you submit from this page are remembered in this browser, so a later reconciliation knows they came from FYNX.');
  $('#rc-forget').hidden = !(sum.page || sum.marked);
}
function renderReconcile() {
  if (!lastHistory) return;
  const balances = lastPortfolio?.rows?.find(r => r.chainId === lastHistory.chainId) || null;
  const result = lastReconcile = reconcile({ history: lastHistory, journal: [...journal.values()], balances, wallet: lastPortfolio?.address || null, policy: mainnetPolicy(), known: forNetwork(pilotRegister, lastHistory.chainId) });
  const state = $('#rc-state'); state.className = `rc-state is-${result.state}`; state.textContent = `${result.network} · ${RC_STATE[result.state]}`;
  const body = $('#rc-rows'); body.replaceChildren();
  for (const token of ['ETH', 'USDC']) {
    const t = result.totals[token], b = result.balance[token], tr = document.createElement('tr');
    const cells = [['Asset', token, ''], ['Received', `${amountText(t.in)} (${t.inCount})`, ''], ['Sent', `${amountText(t.out)} (${t.outCount})`, ''], ['Net', t.net.startsWith('-') ? `−${amountText(t.net.slice(1))}` : amountText(t.net), ''], ['Balance', b.actual === null ? '—' : amountText(b.actual), ''], ['Check', RC_CHECK[b.state], `is-${b.state}`]];
    for (const [label, text, cls] of cells) { const td = document.createElement('td'); td.dataset.label = label; td.textContent = text; if (cls) td.className = cls; tr.append(td); }
    body.append(tr);
  }
  const list = $('#rc-findings'); list.replaceChildren();
  for (const f of result.findings) list.append(el('li', `is-${f.tone}`, f.text));
  renderReconcileLists(result);
  show('#rc-box', true);
  return planHistoryAuto(result);
}
$('#rc-copy').addEventListener('click', async () => {
  if (!lastReconcile) return;
  try { await navigator.clipboard.writeText(reconcileReport(lastReconcile)); setText('#pf-status', 'Reconciliation report copied. It has totals, findings, dates, shortened addresses and public transaction IDs only.'); }
  catch { setText('#pf-status', 'Copying was blocked by the browser. Use Download instead.'); }
});
$('#rc-forget').addEventListener('click', () => {
  if (!window.confirm('Forget every remembered FYNX transaction and every transfer you marked as yours, in this browser? The next reconciliation will list them as “not from FYNX” again.')) return;
  pilotRegister = { entries: [] }; try { localStorage.removeItem(REGISTER_KEY); } catch { /* ignore */ }
  renderReconcile(); setText('#pf-status', 'Remembered transfers forgotten in this browser.'); $('#rc-state').focus();
});
$('#rc-download').addEventListener('click', () => {
  if (!lastReconcile) return;
  const url = URL.createObjectURL(new Blob([reconcileReport(lastReconcile)], { type: 'text/markdown' })), a = document.createElement('a');
  a.href = url; a.download = `fynx-reconciliation-${lastReconcile.network.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${lastReconcile.checkedAt.slice(0, 10)}.md`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  setText('#pf-status', 'Reconciliation report downloaded.');
});
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
  const result = await checkStatus(pendingHash, checkSession);
  setText('#transaction-status', `${result.label} on ${connection.network.name}. ${result.detail}`);
  if (isSettled(result)) show('#check-receipt', false);
}));
// Read-only status check: never signs or resends. Remembers the nonce so a
// later check can tell a replaced (sped-up/cancelled) transaction from a dropped one.
async function checkStatus(hash, checkSession) {
  const current = connection;
  if (!current?.address) throw new Error('Connect your wallet first.');
  const item = journal.get(hash);
  if (item && item.network.id !== current.network.id) throw new Error(`Switch to ${item.network.name} to check this transaction.`);
  const epoch = await current.assertCurrent();
  const result = await checkTransaction(request => current.provider.request(request), hash, item ? { from: item.address, nonce: item.nonce, submittedAt: item.submittedAt } : {}, current.network);
  checkSession(); await current.assertCurrent(epoch);
  if (current !== connection) throw new Error('Wallet changed.');
  const before = item?.status;
  if (item) { item.status = result.status; item.result = result; item.checkedAt = Date.now(); if (Number.isSafeInteger(result.nonce)) item.nonce = result.nonce; if (result.call) item.call = result.call; renderJournal(); }
  // Just turned out to be replaced: look up the speed-up / cancel that took its place once, by itself.
  if (item && result.status === 'replaced' && before !== 'replaced' && !item.replacement) {
    try { await lookUpReplacement(item, checkSession); } catch (error) { if (/session changed|Wallet changed|Sign in again/i.test(error.message || '')) throw error; item.replacementNote = `The replacement could not be looked up: ${errorMessage(error)}`; renderJournal(); }
  }
  // Keep the reconciliation current: a transfer that just settled changes what it expects in the history.
  if (item && lastHistory && settledChange(before, item, lastHistory.chainId)) {
    const auto = renderReconcile();
    setText('#rc-updated', `Updated ${new Date().toLocaleTimeString()}: “${item.label}” is now ${(result.label || result.status).toLowerCase()}. ${auto ? 'The history is loaded again by itself shortly to include it.' : 'Press Load history again to include it in the totals.'}`); show('#rc-updated', true);
  }
  return result;
}

// Read-only: finds the transaction that replaced a submitted one (same wallet, same nonce) and keeps it
// with the Track entry, so the list and the reconciliation can show where the transfer went.
async function lookUpReplacement(item, checkSession) {
  const current = connection;
  if (!current?.address) throw new Error('Connect your wallet first.');
  if (item.network.id !== current.network.id) throw new Error(`Switch to ${item.network.name} to look this up.`);
  const epoch = await current.assertCurrent();
  // Outgoing transfers in the loaded history are candidates when the connection cannot read old blocks.
  const candidates = lastHistory && lastHistory.chainId === item.network.id ? (lastHistory.items || []).filter(i => i && i.direction === 'out' && typeof i.hash === 'string' && !journal.has(i.hash)).map(i => i.hash).reverse() : [];
  const found = await findReplacement(request => current.provider.request(request), { hash: item.hash, from: item.address, nonce: item.nonce, original: item.call || null, submittedAt: item.submittedAt, candidates }, current.network);
  checkSession(); await current.assertCurrent(epoch);
  if (current !== connection) throw new Error('Wallet changed.');
  item.replacementCheckedAt = Date.now();
  if (found.state === 'found') {
    const first = !item.replacement || item.replacement.hash !== found.hash;
    item.replacement = found; item.replacementNote = null;
    // Remembered like a FYNX transfer, so a reconciliation in a later session still knows it.
    if (first) { pilotRegister = addSubmitted(pilotRegister, { hash: found.hash, label: `${item.label} (replacement)`.slice(0, 80), network: item.network, address: item.address, submittedAt: Date.now() }); savePilotRegister(); }
  } else item.replacementNote = found.detail;
  renderJournal();
  if (lastHistory && lastHistory.chainId === item.network.id) renderReconcile();
  return found;
}

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
  setText('#receive-network', current.network.name + (current.network.testnet ? ' · test assets only, no monetary value' : canTransact(current.network) ? ' · real assets: double-check the network before sending' : ' · real assets, sending is off'));
}
$('#receive-asset').addEventListener('change', () => run(null, renderReceive));
$('#network-choice').addEventListener('change', () => {
  connection?.close(); connection = null; clearWallet();
  renderNetworkNote();
  setText('#lookup-status', ''); renderJournal(); renderLookup(); setText('#queue-status', ''); renderQueue();
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
// Check every waiting transaction on this network, one after another (read-only, never resends).
async function checkWaiting(checkSession, { auto = false } = {}) {
  const items = waitingItems(journal.values(), selectedNetwork().id), results = [];
  for (const item of items) {
    try { results.push({ hash: item.hash, result: await checkStatus(item.hash, checkSession) }); }
    catch (error) { checkSession(); if (/Wallet changed|Switch to/.test(error.message || '')) throw error; results.push({ hash: item.hash, error }); }
  }
  autoLastRun = Date.now();
  const left = waitingItems(journal.values(), selectedNetwork().id).length;
  setText('#tx-auto-status', `${auto ? 'Automatic check' : 'Checked'} at ${new Date(autoLastRun).toLocaleTimeString()}. ${batchSummary(results)}${left ? ` ${left} still waiting.` : ' Nothing left waiting.'}`);
  if (!left && $('#tx-auto').checked) { $('#tx-auto').checked = false; setText('#tx-auto-status', `${$('#tx-auto-status').textContent} Automatic re-check turned off.`); }
  return results;
}
$('#tx-check-all').addEventListener('click', event => run(event.currentTarget, checkSession => checkWaiting(checkSession), '#tx-auto-status'));
$('#tx-auto').addEventListener('change', () => {
  autoLastRun = null;
  setText('#tx-auto-status', $('#tx-auto').checked ? `On: waiting transactions are re-checked every ${AUTO_CHECK_MS / 1000} seconds while this page is open and visible. Checking never signs or resends anything.` : 'Automatic re-check is off.');
  autoCheckTick();
});
async function autoCheckTick() {
  if (autoRunning || !autoCheckDue({ enabled: $('#tx-auto').checked, hidden: document.hidden, busy, connected: Boolean(connection?.address), waiting: waitingItems(journal.values(), selectedNetwork().id).length, lastRun: autoLastRun, now: Date.now() })) return;
  // Not run(): that would disable every button for a moment and drop keyboard focus while you work.
  // Reads only; a session change or another action starting stops it.
  autoRunning = true;
  const expected = generation, checkSession = () => { if (expected !== generation) throw new Error('Your session changed. Sign in again.'); };
  try { await checkWaiting(checkSession, { auto: true }); }
  catch (error) { if (expected === generation) setText('#tx-auto-status', `Automatic check paused: ${errorMessage(error)}`); }
  finally { autoRunning = false; autoLastRun = Date.now(); updateWalletControls(); }
}
setInterval(autoCheckTick, 5000);
// Automatic re-check of "Check the wallet's numbers". Reads only; never runs through run() so buttons
// and keyboard focus are left alone; pauses while hidden, busy, disconnected or on another network.
async function queueAutoTick() {
  const entry = queueEntry;
  if (!entry?.auto || queueAutoRunning) return;
  const page = queuePageItems(journal.values(), entry.queue, entry.network.id);
  if (!queueAutoDue({ enabled: entry.auto, hidden: document.hidden, busy, connected: Boolean(connection?.address), sameNetwork: connection?.network?.id === entry.network.id && selectedNetwork().id === entry.network.id, queue: entry.queue, pageWaiting: page.waiting.length, lastRun: queueAutoLast, now: Date.now() })) return;
  queueAutoRunning = true;
  const expected = generation, checkSession = () => { if (expected !== generation) throw new Error('Your session changed. Sign in again.'); };
  const active = $('#queue-result').contains(document.activeElement) ? document.activeElement : null, hadFocus = active?.id || '';
  const caret = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  try {
    const q = await checkQueue(checkSession, entry.queue.from), now = queueEntry;
    if (now) {
      const left = q.waiting + queuePageItems(journal.values(), q, now.network.id).waiting.length;
      now.autoNote = `Automatic check at ${new Date(now.checkedAt).toLocaleTimeString()}${now.change ? ' (what changed is shown above).' : ': no change yet. Checking again in 30 seconds.'}${left ? '' : ' Nothing is waiting, so the automatic re-check turned itself off.'}`;
      if (!left) now.auto = false;
      setText('#queue-status', `${queueSummary(q, queuePageItems(journal.values(), q, now.network.id)).title}.`);
    }
  } catch (error) {
    if (expected === generation && queueEntry) { queueEntry.autoNote = `Automatic check paused: ${errorMessage(error)}`; }
  } finally {
    queueAutoRunning = false; queueAutoLast = Date.now();
    if (expected === generation) { renderQueue(); const back = hadFocus ? document.getElementById(hadFocus) : null; if (back) { back.focus(); if (caret) try { back.setSelectionRange(...caret); } catch { /* not a text field */ } } }
  }
}
setInterval(queueAutoTick, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) queueAutoTick(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) autoCheckTick(); });
function trackTransaction(hash, label) {
  const entry = { hash, label, network: connection.network, address: connection.address, status: 'pending', submittedAt: Date.now(), nonce: null, result: null, checkedAt: null };
  journal.set(hash, entry); renderJournal();
  // Remembered in this browser so a later reconciliation knows this transfer came from FYNX.
  pilotRegister = addSubmitted(pilotRegister, entry); savePilotRegister();
}
function renderJournal() {
  const list = $('#transaction-journal'), focused = list.contains(document.activeElement) ? document.activeElement.dataset.hash : null;
  list.replaceChildren();
  for (const item of [...journal.values()].reverse()) {
    if (item.network.id !== selectedNetwork().id) continue;
    const row = document.createElement('li'), label = document.createElement('p'), link = document.createElement('a');
    row.className = `tx-row is-${item.status}`;
    const badge = guideEl('span', `tx-badge is-${item.status}`, item.result?.label || TX_LABELS[item.status] || item.status);
    label.append(guideEl('strong', '', item.label), document.createTextNode(' '), badge);
    link.textContent = item.hash;
    link.href = item.network.explorer + '/tx/' + item.hash; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'mono';
    row.append(label);
    if (item.result) {
      row.append(guideEl('p', 'tx-detail', item.result.detail));
      if (['confirmed', 'failed'].includes(item.status)) {
        const meter = guideEl('div', 'tx-meter'), bar = guideEl('span', ''), share = Math.min(100, Math.round(item.result.confirmations / item.result.target * 100));
        meter.setAttribute('role', 'img'); meter.setAttribute('aria-label', `${item.result.confirmations} of ${item.result.target} confirmations`);
        bar.style.width = share + '%'; meter.append(bar); row.append(meter, guideEl('p', 'tx-when', `${Math.min(item.result.confirmations, 9999)} of ${item.result.target} confirmations`));
      }
    }
    const meta = [`Submitted ${new Date(item.submittedAt || Date.now()).toLocaleTimeString()}`];
    if (Number.isSafeInteger(item.nonce)) meta.push(`nonce ${item.nonce}`);
    if (item.checkedAt) meta.push(`checked ${new Date(item.checkedAt).toLocaleTimeString()}`);
    row.append(link, guideEl('p', 'tx-when', meta.join(' · ')));
    if (item.status === 'replaced') row.append(replacementBox(item));
    if (!isSettled(item.result)) {
      const button = guideEl('button', 'text-button tx-check', item.result ? 'Check again' : 'Check status');
      button.type = 'button'; button.setAttribute('aria-label', `${item.result ? 'Check again' : 'Check status'}: ${item.label}`);
      button.disabled = busy || !connection?.address;
      button.dataset.hash = item.hash;
      button.addEventListener('click', async () => {
        await run(button, async checkSession => {
          const result = await checkStatus(item.hash, checkSession);
          setText('#lookup-status', `${item.label}: ${result.label}. ${result.detail}`);
        }, '#lookup-status');
        // The list re-renders; keep keyboard focus on the same transaction.
        const rows = [...document.querySelectorAll('#transaction-journal .tx-check')];
        (rows.find(b => b.dataset.hash === item.hash) || document.querySelector(`#transaction-journal a[href$="${item.hash}"]`))?.focus();
      });
      row.append(button);
    }
    list.append(row);
  }
  const waiting = waitingItems(journal.values(), selectedNetwork().id).length;
  show('#tx-batch', journal.size > 0 && [...journal.values()].some(i => i.network.id === selectedNetwork().id));
  $('#tx-check-all').disabled = busy || autoRunning || !connection?.address || !waiting;
  $('#tx-check-all').textContent = waiting ? `Check all waiting (${waiting})` : 'Check all waiting';
  if (focused) list.querySelector(`.tx-check[data-hash="${focused}"]`)?.focus();
  if (!list.children.length) { const empty = document.createElement('li'); empty.className = 'journal-empty'; empty.textContent = `No transactions submitted on ${selectedNetwork().name} in this page session yet.`; list.append(empty); }
  renderCryptoSetup(); renderQueue();
}
function replacementBox(item) {
  const box = guideEl('div', 'tx-replacement'), r = item.replacement;
  box.setAttribute('role', 'group'); box.setAttribute('aria-label', `Replacement of ${item.label}`);
  if (r) {
    const head = guideEl('p', 'tx-replacement-head');
    head.append(guideEl('strong', '', 'Replaced by '), guideEl('span', `tx-badge is-${r.status === 'pending' ? 'pending' : r.status}`, `${REPLACEMENT_KINDS[r.kind] || 'Replacement'} · ${r.status === 'confirmed' ? 'Confirmed' : r.status === 'failed' ? 'Failed on-chain' : 'Not confirmed yet'}`));
    const link = guideEl('a', 'mono', r.hash); link.href = `${item.network.explorer}/tx/${r.hash}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `Open the replacement ${r.hash} on the explorer`);
    box.append(head, link, guideEl('p', 'tx-detail', r.detail));
  } else {
    box.append(guideEl('p', 'tx-detail', item.replacementNote || 'The wallet used this transaction\'s number for another transaction. Find out which one: FYNX reads the network only, nothing is signed or sent.'));
  }
  if (item.replacementCheckedAt) box.append(guideEl('p', 'tx-when', `Looked up ${new Date(item.replacementCheckedAt).toLocaleTimeString()}`));
  if (!r || !r.deep) {
    const label = r ? 'Check the replacement again' : item.replacementCheckedAt ? 'Look again' : 'Find the replacement';
    const button = guideEl('button', 'text-button tx-find', label);
    button.type = 'button'; button.dataset.hash = item.hash; button.disabled = busy || !connection?.address;
    button.setAttribute('aria-label', `${label}: ${item.label}`);
    button.addEventListener('click', async () => {
      await run(button, async checkSession => {
        const found = await lookUpReplacement(item, checkSession);
        setText('#lookup-status', `${item.label}: ${found.state === 'found' ? `replaced by ${found.hash.slice(0, 10)}…. ${found.detail}` : found.detail}`);
      }, '#lookup-status');
      (document.querySelector(`#transaction-journal .tx-find[data-hash="${item.hash}"]`) || document.querySelector(`#transaction-journal a[href$="${item.hash}"]`))?.focus();
    });
    box.append(button);
  }
  return box;
}
// Looking up any transaction ID (also ones not submitted on this page): a result card with the facts,
// "Check again" while it is unsettled and, when it was replaced, "Find the replacement". Read-only;
// a replacement found here is not added to the pilot register (it was not submitted from FYNX).
const lookupOrigin = (hash, chainId) => journal.has(hash) ? 'page' : forNetwork(pilotRegister, chainId).some(e => e.kind === 'page' && e.hash === hash.toLowerCase()) ? 'register' : null;
async function lookUp(hash, checkSession) {
  const current = connection;
  const result = await checkStatus(hash, checkSession);
  const keep = lookupEntry && lookupEntry.hash.toLowerCase() === hash.toLowerCase() && lookupEntry.network.id === current.network.id ? lookupEntry : null;
  lookupEntry = { hash, network: current.network, result, checkedAt: Date.now(), replacement: keep?.replacement || null, note: keep?.note || null, findCheckedAt: keep?.findCheckedAt || null, nonceDraft: keep?.nonceDraft || null, nonceSearch: keep?.nonceSearch || null };
  return result;
}
// The wallet + number search for a looked-up ID the network no longer knows. Read-only; whatever it
// finds is shown with an explorer link and can be looked up in turn (it is not added to the register).
async function searchLookupByNonce(checkSession, wallet, nonce) {
  const entry = lookupEntry, current = connection;
  if (!entry || !current?.address) throw new Error('Connect your wallet first.');
  if (entry.network.id !== current.network.id) throw new Error(`Switch to ${entry.network.name} to search.`);
  const parsed = parseNonceSearch(wallet, nonce);
  if (!parsed.ok) throw new Error(parsed.error);
  const epoch = await current.assertCurrent();
  const candidates = lastHistory && lastHistory.chainId === entry.network.id ? (lastHistory.items || []).filter(i => i && typeof i.hash === 'string').map(i => i.hash).reverse() : [];
  const found = await findByNonce(request => current.provider.request(request), { from: parsed.from, nonce: parsed.nonce, exclude: entry.hash, candidates }, current.network);
  checkSession(); await current.assertCurrent(epoch);
  if (current !== connection || entry !== lookupEntry) throw new Error('Wallet changed.');
  entry.nonceSearch = { ...found, checkedAt: Date.now() };
  return found;
}
function renderNonceSearch(box, entry) {
  const wrap = guideEl('div', 'nonce-search');
  wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-labelledby', 'nonce-search-title');
  const title = guideEl('p', 'nonce-search-title'); title.id = 'nonce-search-title'; title.append(guideEl('strong', '', 'Search by wallet and number'));
  wrap.append(title, guideEl('p', 'tx-detail', 'Every transaction from a wallet has a number (the nonce). If you know the wallet and the number of the transaction that went missing (the explorer and the wallet\'s activity list show both), FYNX finds the transaction that used that number. FYNX only reads the network.'));
  const draft = entry.nonceDraft || { wallet: entry.nonceSearch?.from || entry.result.from || '', nonce: entry.nonceSearch ? String(entry.nonceSearch.nonce) : Number.isSafeInteger(entry.result.nonce) ? String(entry.result.nonce) : '' };
  const form = guideEl('form', 'nonce-form'); form.id = 'nonce-form'; form.noValidate = true;
  const wl = guideEl('label', '', 'Wallet address'); wl.htmlFor = 'nonce-wallet';
  const wi = guideEl('input', 'mono'); wi.id = 'nonce-wallet'; wi.autocomplete = 'off'; wi.spellcheck = false; wi.maxLength = 42; wi.placeholder = '0x…'; wi.value = draft.wallet;
  const nl = guideEl('label', '', 'Transaction number (nonce)'); nl.htmlFor = 'nonce-number';
  const ni = guideEl('input', ''); ni.id = 'nonce-number'; ni.inputMode = 'numeric'; ni.autocomplete = 'off'; ni.maxLength = 15; ni.placeholder = 'for example 12'; ni.value = draft.nonce;
  const keep = () => { entry.nonceDraft = { wallet: wi.value, nonce: ni.value }; };
  wi.addEventListener('input', keep); ni.addEventListener('input', keep);
  const row = guideEl('div', 'nonce-actions');
  const mine = guideEl('button', 'text-button', 'Use my connected wallet'); mine.type = 'button'; mine.id = 'nonce-mine'; mine.disabled = !connection?.address;
  mine.addEventListener('click', () => { wi.value = connection?.address || ''; keep(); ni.focus(); });
  const go = guideEl('button', 'button secondary', 'Search'); go.type = 'submit'; go.id = 'nonce-go'; go.disabled = busy || !connection?.address;
  row.append(go, mine);
  form.append(wl, wi, nl, ni, row);
  form.addEventListener('submit', async event => {
    event.preventDefault(); keep();
    const parsed = parseNonceSearch(wi.value, ni.value);
    if (!parsed.ok) { setText('#lookup-status', parsed.error); (parsed.field === 'wallet' ? wi : ni).focus(); return; }
    await run(go, async checkSession => {
      const f = await searchLookupByNonce(checkSession, wi.value, ni.value);
      setText('#lookup-status', f.state === 'found' ? `Number ${f.nonce}: ${f.hash.slice(0, 10)}…. ${f.detail}` : f.detail);
    }, '#lookup-status');
    renderLookup(); ($('#nonce-result a') || $('#nonce-go'))?.focus();
  });
  wrap.append(form);
  const res = entry.nonceSearch;
  if (res) {
    const out = guideEl('div', 'nonce-result'); out.id = 'nonce-result';
    if (res.state === 'found') {
      const h = guideEl('p', 'tx-replacement-head');
      h.append(guideEl('strong', '', `Number ${res.nonce} was used by `), guideEl('span', `tx-badge is-${res.status === 'pending' ? 'pending' : res.status}`, `${res.kind === 'cancel' ? 'Cancel · ' : ''}${res.status === 'confirmed' ? 'Confirmed' : res.status === 'failed' ? 'Failed on-chain' : 'Not confirmed yet'}`));
      const a = guideEl('a', 'mono', res.hash); a.href = `${entry.network.explorer}/tx/${res.hash}`; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', `Open ${res.hash} on the explorer`);
      out.append(h, a, guideEl('p', 'tx-detail', res.detail));
      const open = guideEl('button', 'text-button tx-check', 'Look up this transaction'); open.type = 'button'; open.id = 'nonce-open'; open.disabled = busy || !connection?.address;
      open.addEventListener('click', async () => {
        const target = res.hash;
        await run(open, async checkSession => { $('#lookup-hash').value = target; const r = await lookUp(target, checkSession); setText('#lookup-status', `${r.label}. ${r.detail}`); }, '#lookup-status');
        renderLookup(); $('#lookup-result a')?.focus();
      });
      out.append(open);
    } else out.append(guideEl('p', 'tx-detail', res.detail));
    out.append(guideEl('p', 'tx-when', `Searched ${new Date(res.checkedAt).toLocaleTimeString()} · wallet ${res.from.slice(0, 6)}…${res.from.slice(-4)}, number ${res.nonce}`));
    wrap.append(out);
  }
  box.append(wrap);
}
async function findLookupReplacement(checkSession) {
  const entry = lookupEntry, current = connection;
  if (!entry || !current?.address) throw new Error('Connect your wallet first.');
  if (entry.network.id !== current.network.id) throw new Error(`Switch to ${entry.network.name} to look this up.`);
  const epoch = await current.assertCurrent();
  const candidates = lastHistory && lastHistory.chainId === entry.network.id ? (lastHistory.items || []).filter(i => i && i.direction === 'out' && typeof i.hash === 'string').map(i => i.hash).reverse() : [];
  const found = await findReplacement(request => current.provider.request(request), { hash: entry.hash, from: entry.result.from, nonce: entry.result.nonce, original: entry.result.call || null, candidates }, current.network);
  checkSession(); await current.assertCurrent(epoch);
  if (current !== connection || entry !== lookupEntry) throw new Error('Wallet changed.');
  entry.findCheckedAt = Date.now();
  if (found.state === 'found') { entry.replacement = found; entry.note = null; } else entry.note = found.detail;
  return found;
}
function renderLookup() {
  const box = $('#lookup-result'), entry = lookupEntry;
  box.replaceChildren();
  if (!entry || entry.network.id !== selectedNetwork().id) { show('#lookup-result', false); return; }
  const r = entry.result, origin = lookupOrigin(entry.hash, entry.network.id);
  const head = guideEl('p', 'lookup-head');
  head.append(guideEl('strong', '', 'Looked-up transaction'), guideEl('span', `tx-badge is-${r.status}`, r.label));
  const link = guideEl('a', 'mono', entry.hash); link.href = `${entry.network.explorer}/tx/${entry.hash}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `Open ${entry.hash} on the explorer`);
  box.append(head, link, guideEl('p', 'tx-detail', r.detail));
  if (['confirmed', 'failed'].includes(r.status)) {
    const meter = guideEl('div', 'tx-meter'), bar = guideEl('span', ''), share = Math.min(100, Math.round(r.confirmations / r.target * 100));
    meter.setAttribute('role', 'img'); meter.setAttribute('aria-label', `${r.confirmations} of ${r.target} confirmations`);
    bar.style.width = share + '%'; meter.append(bar); box.append(meter);
  }
  const facts = guideEl('dl', 'lookup-facts');
  for (const [name, value] of lookupFacts(r, { origin })) facts.append(guideEl('dt', '', name), guideEl('dd', /^0x[0-9a-f]{40}$/i.test(value) ? 'mono' : '', value));
  box.append(facts);
  const canFind = canFindReplacement(r);
  if (r.status === 'replaced') {
    const rep = guideEl('div', 'tx-replacement'), found = entry.replacement;
    rep.setAttribute('role', 'group'); rep.setAttribute('aria-label', 'Replacement of the looked-up transaction');
    if (found) {
      const h = guideEl('p', 'tx-replacement-head');
      h.append(guideEl('strong', '', 'Replaced by '), guideEl('span', `tx-badge is-${found.status === 'pending' ? 'pending' : found.status}`, `${REPLACEMENT_KINDS[found.kind] || 'Replacement'} · ${found.status === 'confirmed' ? 'Confirmed' : found.status === 'failed' ? 'Failed on-chain' : 'Not confirmed yet'}`));
      const a = guideEl('a', 'mono', found.hash); a.href = `${entry.network.explorer}/tx/${found.hash}`; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', `Open the replacement ${found.hash} on the explorer`);
      rep.append(h, a, guideEl('p', 'tx-detail', found.detail));
    } else if (entry.note) rep.append(guideEl('p', 'tx-detail', entry.note));
    if (entry.findCheckedAt) rep.append(guideEl('p', 'tx-when', `Looked up ${new Date(entry.findCheckedAt).toLocaleTimeString()}`));
    if (canFind && (!found || !found.deep)) {
      const label = found ? 'Check the replacement again' : entry.findCheckedAt ? 'Look again' : 'Find the replacement';
      const b = guideEl('button', 'text-button tx-find', label); b.type = 'button'; b.id = 'lookup-find'; b.disabled = busy || !connection?.address;
      b.addEventListener('click', async () => {
        await run(b, async checkSession => {
          const f = await findLookupReplacement(checkSession);
          setText('#lookup-status', f.state === 'found' ? `Replaced by ${f.hash.slice(0, 10)}…. ${f.detail}` : f.detail);
        }, '#lookup-status');
        renderLookup(); ($('#lookup-find') || $('#lookup-result a'))?.focus();
      });
      rep.append(b);
    }
    if (rep.childNodes.length) box.append(rep);
  }
  box.append(guideEl('p', 'tx-detail lookup-next', lookupNext(r, { canFind, replacement: entry.replacement })));
  if (offersNonceSearch(r)) renderNonceSearch(box, entry);
  const meta = [`Checked ${new Date(entry.checkedAt).toLocaleTimeString()} on ${entry.network.name}`];
  box.append(guideEl('p', 'tx-when', meta.join(' · ')));
  const actions = guideEl('div', 'lookup-actions');
  if (!isSettled(r)) {
    const again = guideEl('button', 'text-button tx-check', 'Check again'); again.type = 'button'; again.id = 'lookup-again'; again.disabled = busy || !connection?.address;
    again.addEventListener('click', async () => {
      await run(again, async checkSession => { const res = await lookUp(entry.hash, checkSession); setText('#lookup-status', `${res.label}. ${res.detail}`); }, '#lookup-status');
      renderLookup(); ($('#lookup-again') || $('#lookup-result a'))?.focus();
    });
    actions.append(again);
  }
  const clear = guideEl('button', 'text-button', 'Clear'); clear.type = 'button';
  clear.addEventListener('click', () => { lookupEntry = null; renderLookup(); setText('#lookup-status', ''); $('#lookup-hash').focus(); });
  actions.append(clear); box.append(actions);
  show('#lookup-result', true);
}
$('#lookup-form').addEventListener('submit', event => { event.preventDefault(); run($('#lookup-transaction'), async checkSession => {
  const hash = $('#lookup-hash').value.trim();
  if (journal.has(hash)) {
    // Submitted on this page: the Track row already shows everything (and finds a replacement by itself).
    const result = await checkStatus(hash, checkSession);
    setText('#lookup-status', `${journal.get(hash).label}: ${result.label}. ${result.detail} It is in the list above.`);
    return;
  }
  const result = await lookUp(hash, checkSession);
  setText('#lookup-status', `${result.label}. ${result.detail}`);
}, '#lookup-status').then(renderLookup); });
// "Check the wallet's numbers": a standalone look at any wallet's transaction numbers (nonces) — how
// many are used, which one is waiting and holding up the rest — and a search for the transaction that
// used a given number. Read-only; nothing found here is added to the pilot register.
const historyHashes = networkId => lastHistory && lastHistory.chainId === networkId ? (lastHistory.items || []).filter(i => i && typeof i.hash === 'string').map(i => i.hash).reverse() : [];
async function checkQueue(checkSession, wallet) {
  const current = connection;
  if (!current?.address) throw new Error('Connect your wallet first.');
  const epoch = await current.assertCurrent();
  const queue = await walletQueue(request => current.provider.request(request), wallet);
  checkSession(); await current.assertCurrent(epoch);
  if (current !== connection) throw new Error('Wallet changed.');
  const keep = queueEntry && queueEntry.network.id === current.network.id && queueEntry.queue.from === queue.from ? queueEntry : null;
  queueEntry = { network: current.network, queue, checkedAt: Date.now(), search: keep?.search || null, numberDraft: keep?.numberDraft ?? '', auto: keep?.auto || false, autoNote: '', change: keep ? queueChange(keep.queue, queue) : '' };
  return queue;
}
async function searchQueueNumber(checkSession, nonce) {
  const entry = queueEntry, current = connection;
  if (!entry || !current?.address) throw new Error('Connect your wallet first.');
  if (entry.network.id !== current.network.id) throw new Error(`Switch to ${entry.network.name} to search.`);
  const parsed = parseNonceSearch(entry.queue.from, nonce);
  if (!parsed.ok) throw new Error(parsed.error);
  const epoch = await current.assertCurrent();
  const found = await findByNonce(request => current.provider.request(request), { from: parsed.from, nonce: parsed.nonce, candidates: historyHashes(entry.network.id) }, current.network);
  checkSession(); await current.assertCurrent(epoch);
  if (current !== connection || entry !== queueEntry) throw new Error('Wallet changed.');
  const page = found.state === 'not-used' ? pageMatch(journal.values(), parsed.from, parsed.nonce, entry.network.id) : null;
  entry.search = { ...found, page: page ? { hash: page.hash, label: page.label } : null, checkedAt: Date.now() };
  return entry.search;
}
function queueSearchNow(nonce, button) {
  return run(button, async checkSession => {
    const f = await searchQueueNumber(checkSession, nonce);
    setText('#queue-status', f.state === 'found' ? `Number ${f.nonce}: ${f.hash.slice(0, 10)}…. ${f.detail}` : f.detail);
  }, '#queue-status').then(() => { renderQueue(); ($('#queue-search-result a') || $('#queue-number'))?.focus(); });
}
function renderQueue() {
  const box = $('#queue-result'), entry = queueEntry;
  box.replaceChildren();
  if (!entry || entry.network.id !== selectedNetwork().id) { show('#queue-result', false); return; }
  const q = entry.queue, page = queuePageItems(journal.values(), q, entry.network.id), sum = queueSummary(q, page);
  const head = guideEl('p', 'lookup-head');
  head.append(guideEl('strong', '', sum.title), guideEl('span', `tx-badge is-${sum.state === 'waiting' ? 'replaced' : 'confirmed'}`, sum.state === 'waiting' ? `${q.waiting} waiting` : sum.state === 'fresh' ? 'Unused wallet' : 'Queue clear'));
  const link = guideEl('a', 'mono', q.from); link.href = `${entry.network.explorer}/address/${q.from}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `Open the wallet ${q.from} on the explorer`);
  box.append(head, link);
  const facts = guideEl('dl', 'lookup-facts');
  for (const [name, value] of sum.facts) facts.append(guideEl('dt', '', name), guideEl('dd', '', value));
  box.append(facts, guideEl('p', 'tx-detail', sum.detail));
  if (page.waiting.length || page.settle.length) {
    const list = guideEl('ul', 'queue-page');
    list.setAttribute('aria-label', 'Transactions submitted on this page from this wallet');
    for (const item of [...page.settle, ...page.waiting]) {
      const li = guideEl('li', '');
      const a = guideEl('a', '', `${item.label} · number ${item.nonce}`); a.href = '#transaction-journal';
      a.addEventListener('click', event => { event.preventDefault(); (document.querySelector(`#transaction-journal .tx-check[data-hash="${item.hash}"]`) || document.querySelector(`#transaction-journal a[href$="${item.hash}"]`))?.focus(); });
      li.append(a, guideEl('span', 'tx-when', item.nonce < q.used ? ' · number already used: check again' : ' · not in the queue'));
      list.append(li);
    }
    box.append(list);
  }
  // Search one number.
  const wrap = guideEl('div', 'nonce-search');
  wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-labelledby', 'queue-search-title');
  const title = guideEl('p', 'nonce-search-title'); title.id = 'queue-search-title'; title.append(guideEl('strong', '', 'Which transaction used a number?'));
  wrap.append(title);
  const quick = guideEl('div', 'nonce-actions queue-quick');
  for (const qk of sum.quick) {
    const b = guideEl('button', 'text-button queue-find', qk.label); b.type = 'button'; b.disabled = busy || !connection?.address;
    b.addEventListener('click', () => { entry.numberDraft = String(qk.nonce); queueSearchNow(String(qk.nonce), b); });
    quick.append(b);
  }
  if (quick.childNodes.length) wrap.append(quick);
  const form = guideEl('form', 'nonce-form queue-number-form'); form.noValidate = true;
  const nl = guideEl('label', '', 'Transaction number (nonce)'); nl.htmlFor = 'queue-number';
  const ni = guideEl('input', ''); ni.id = 'queue-number'; ni.inputMode = 'numeric'; ni.autocomplete = 'off'; ni.maxLength = 15; ni.placeholder = `0 to ${Math.max(0, q.next)}`; ni.value = entry.numberDraft;
  ni.addEventListener('input', () => { entry.numberDraft = ni.value; });
  const go = guideEl('button', 'button secondary', 'Find'); go.type = 'submit'; go.id = 'queue-number-go'; go.disabled = busy || !connection?.address;
  const actions = guideEl('div', 'nonce-actions'); actions.append(go);
  form.append(nl, ni, actions);
  form.addEventListener('submit', event => {
    event.preventDefault(); entry.numberDraft = ni.value;
    const parsed = parseNonceSearch(q.from, ni.value);
    if (!parsed.ok) { setText('#queue-status', parsed.error); ni.focus(); return; }
    queueSearchNow(ni.value, go);
  });
  wrap.append(form);
  const res = entry.search;
  if (res) {
    const out = guideEl('div', 'nonce-result'); out.id = 'queue-search-result';
    if (res.state === 'found') {
      const h = guideEl('p', 'tx-replacement-head');
      h.append(guideEl('strong', '', `Number ${res.nonce} was used by `), guideEl('span', `tx-badge is-${res.status === 'pending' ? 'pending' : res.status}`, `${res.kind === 'cancel' ? 'Cancel · ' : ''}${res.status === 'confirmed' ? 'Confirmed' : res.status === 'failed' ? 'Failed on-chain' : 'Not confirmed yet'}`));
      const a = guideEl('a', 'mono', res.hash); a.href = `${entry.network.explorer}/tx/${res.hash}`; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', `Open ${res.hash} on the explorer`);
      out.append(h, a, guideEl('p', 'tx-detail', res.detail));
      const open = guideEl('button', 'text-button tx-check', 'Look up this transaction'); open.type = 'button'; open.disabled = busy || !connection?.address;
      open.addEventListener('click', async () => {
        const target = res.hash;
        await run(open, async checkSession => { $('#lookup-hash').value = target; const r = await lookUp(target, checkSession); setText('#lookup-status', `${r.label}. ${r.detail}`); }, '#queue-status');
        renderLookup(); $('#lookup-result a')?.focus();
      });
      out.append(open);
    } else {
      out.append(guideEl('p', 'tx-detail', res.detail));
      if (res.page) out.append(guideEl('p', 'tx-detail', `Submitted on this page with this number: ${res.page.label} (${res.page.hash.slice(0, 10)}…). It has not been included yet; check it in the list above.`));
    }
    out.append(guideEl('p', 'tx-when', `Searched ${new Date(res.checkedAt).toLocaleTimeString()} · number ${res.nonce}`));
    wrap.append(out);
  }
  box.append(wrap);
  if (entry.change) box.append(guideEl('p', 'tx-detail queue-change', `Since the last check: ${entry.change}`));
  // Optional automatic re-check while something is waiting (same 30-second rule as Track).
  if (sum.state === 'waiting' || page.waiting.length || entry.auto) {
    const autoWrap = guideEl('div', 'queue-auto'), lab = guideEl('label', 'tx-auto'), cb = guideEl('input', '');
    cb.type = 'checkbox'; cb.id = 'queue-auto'; cb.checked = entry.auto; lab.htmlFor = 'queue-auto';
    lab.append(cb, document.createTextNode(` Re-check this wallet every ${AUTO_CHECK_MS / 1000} seconds while something is waiting`));
    const note = guideEl('p', 'hint queue-auto-status', entry.autoNote || (entry.auto ? `On: this wallet's numbers are read again every ${AUTO_CHECK_MS / 1000} seconds while this page is open and visible. Reading never signs, speeds up or cancels anything.` : ''));
    note.id = 'queue-auto-status'; note.setAttribute('aria-live', 'polite'); cb.setAttribute('aria-describedby', note.id);
    cb.addEventListener('change', () => { entry.auto = cb.checked; entry.autoNote = cb.checked ? '' : 'Automatic re-check of this wallet is off.'; queueAutoLast = Date.now(); renderQueue(); $('#queue-auto')?.focus(); });
    autoWrap.append(lab, note); box.append(autoWrap);
  }
  box.append(guideEl('p', 'tx-when', `Checked ${new Date(entry.checkedAt).toLocaleTimeString()} on ${entry.network.name} at block ${q.block}`));
  const row = guideEl('div', 'lookup-actions');
  const again = guideEl('button', 'text-button tx-check', 'Check again'); again.type = 'button'; again.id = 'queue-again'; again.disabled = busy || !connection?.address;
  again.addEventListener('click', () => run(again, async checkSession => { const qq = await checkQueue(checkSession, entry.queue.from); setText('#queue-status', queueSummary(qq, queuePageItems(journal.values(), qq, entry.network.id)).title + '.'); }, '#queue-status').then(() => { renderQueue(); ($('#queue-again') || $('#queue-wallet'))?.focus(); }));
  const clear = guideEl('button', 'text-button', 'Clear'); clear.type = 'button';
  clear.addEventListener('click', () => { queueEntry = null; renderQueue(); setText('#queue-status', ''); $('#queue-wallet').focus(); });
  row.append(again, clear); box.append(row);
  show('#queue-result', true);
}
$('#queue-mine').addEventListener('click', () => { $('#queue-wallet').value = connection?.address || ''; $('#queue-go').focus(); });
$('#queue-form').addEventListener('submit', event => {
  event.preventDefault();
  const wallet = $('#queue-wallet').value.trim() || connection?.address || '';
  const parsed = parseNonceSearch(wallet, '0');
  if (!parsed.ok) { setText('#queue-status', parsed.error); $('#queue-wallet').focus(); return; }
  $('#queue-wallet').value = wallet;
  run($('#queue-go'), async checkSession => {
    const q = await checkQueue(checkSession, wallet);
    setText('#queue-status', `${queueSummary(q, queuePageItems(journal.values(), q, connection.network.id)).title}.`);
  }, '#queue-status').then(() => { renderQueue(); if (queueEntry) $('#queue-result a')?.focus(); });
});
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
  waitlistFlags = addressFlags(waitlistRecords.values());
  renderWaitlistInsights(); renderWaitlistTests();
  const body = $('#waitlist-rows'); body.replaceChildren();
  const visible = waitlistEmail ? [...waitlistRecords.values()] : visibleRegistrations();
  if (!visible.length) {
    const row = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 4;
    cell.textContent = waitlistEmail ? 'No registration found for this email.' : waitlistRecords.size ? 'No loaded registration matches this filter.' : 'No registrations yet.'; row.append(cell); body.append(row);
  }
  if (!waitlistEmail && visible.length !== waitlistRecords.size) setText('#waitlist-count', `${waitlistTotal} registrations · ${waitlistRecords.size} loaded · ${visible.length} shown`);
  for (const record of visible) {
    const tr = document.createElement('tr');
    const flags = (waitlistFlags.get(record.id) || []).filter(f => f.kind !== 'test');
    for (const [label, value] of [['Email', isTestAddress(record.email) ? `${record.email} (test address)` : record.email], ['Registered', record.createdAt ? new Date(record.createdAt).toLocaleString() : 'Pending timestamp']]) {
      const td = document.createElement('td'); td.dataset.label = label; td.textContent = value;
      if (label === 'Email' && flags.length) { const tags = el('span', 'wl-flags'); for (const f of flags) tags.append(el('span', `wl-flag is-${f.kind}`, f.label)); td.append(tags); }
      tr.append(td);
    }
    const info = document.createElement('td'), details = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = record.status || 'Unknown status'; details.append(summary);
    for (const value of [`Consent: ${record.consent ? 'Recorded' : 'Not recorded'}`, `Notice: ${record.noticeVersion || 'Not recorded'}`, `Source: ${record.source || 'Not recorded'}`, `Expires: ${record.expiresAt ? new Date(record.expiresAt).toLocaleDateString() : 'Not recorded'}`]) { const line = document.createElement('p'); line.textContent = value; line.className = 'hint'; details.append(line); }
    for (const f of flags) details.append(el('p', `hint wl-flag-detail is-${f.kind}`, `${f.label}: ${f.detail}`));
    if (!isTestAddress(record.email)) {
      const reply = el('button', 'text-button', 'Draft privacy reply'); reply.type = 'button';
      reply.setAttribute('aria-label', `Draft a reply to a privacy request from ${record.email}`);
      reply.addEventListener('click', () => openPrivacyReply('access', record));
      details.append(reply);
    }
    info.dataset.label = 'Status & consent'; info.append(details); tr.append(info);
    const td = document.createElement('td'), remove = document.createElement('button'); remove.className = 'text-button'; remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove registration for ${record.email}`);
    remove.addEventListener('click', () => run(remove, async () => {
      if (!window.confirm(`Permanently remove ${record.email} from the active waitlist?`)) return;
      await api({ action: 'waitlist-remove', id: record.id });
      const removedAt = Date.now(), test = isTestAddress(record.email);
      if (test) removedTest = { record: { ...record }, check: testSignupCheck(record, { now: removedAt }), at: removedAt };
      waitlistRecords.delete(record.id); waitlistTotal = Math.max(0, waitlistTotal - 1); renderRegistrations();
      setText('#workspace-status', test ? 'Test registration removed. You can record the waitlist launch test below.' : 'Registration removed from the active waitlist. A deletion confirmation draft is ready below.');
      if (test) document.querySelector('#wl-recheck')?.focus({ preventScroll: false });
      else openPrivacyReply('deleted', record, removedAt);
    }));
    td.dataset.label = 'Action'; td.append(remove); tr.append(td); body.append(tr);
  }
}
// Waitlist insights: counts, sign-up chart, breakdowns and exports from the rows loaded in this browser only.
const waitlistFilter = () => ({ query: $('#wl-query').value, hideTests: $('#wl-hide-tests').checked, consent: $('#wl-consent').value });
const visibleRegistrations = () => filterRecords(waitlistRecords.values(), waitlistFilter()).filter(r => matchesCheck(r, waitlistFlags, $('#wl-check').value));
function clearWaitlistInsights() {
  waitlistLoadingAll = false; waitlistPeriod = 'day';
  $('#wl-stats').replaceChildren(); $('#wl-chart').replaceChildren(); $('#wl-breakdowns').replaceChildren();
  setText('#wl-coverage', ''); setText('#wl-status', ''); $('#wl-query').value = ''; $('#wl-hide-tests').checked = false; $('#wl-consent').value = 'all'; $('#wl-check').value = 'all';
  show('#waitlist-insights', false); show('#wl-filter', false);
  waitlistFlags = new Map(); removedTest = null; $('#wl-quality').replaceChildren(); closePrivacyReply(false);
  $('#wl-testcheck').replaceChildren(); show('#wl-testcheck', false); $('#wl-tests').replaceChildren(); setText('#wl-tests-count', ''); setText('#wl-tests-status', '');
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
  renderAddressCheck();
}
// Address check: counts with a "Show" button that sets the row filter.
function renderAddressCheck() {
  const list = $('#wl-quality'); list.replaceChildren();
  const counts = checkCounts(waitlistRecords.values(), waitlistFlags);
  const items = [
    ['duplicate', counts.groups ? `${counts.groups} inbox${counts.groups === 1 ? '' : 'es'} signed up more than once (${counts.duplicate} rows)` : 'No inbox signed up twice', counts.duplicate, 'Gmail ignores dots and anything after a “+”, so these reach the same person.'],
    ['typo', `${counts.typo} likely mistyped address${counts.typo === 1 ? '' : 'es'}`, counts.typo, 'For example gmial.com or .con. Mail to them will probably bounce; the person can join again with the right address.'],
    ['disposable', `${counts.disposable} throwaway inbox${counts.disposable === 1 ? '' : 'es'}`, counts.disposable, 'Temporary-inbox services; the person may not be reachable at launch.'],
    ['role', `${counts.role} shared mailbox${counts.role === 1 ? '' : 'es'}`, counts.role, 'info@, support@ and similar usually reach a team, not one person.'],
    ['expired', `${counts.expired} past the retention date`, counts.expired, 'Automatic deletion is queued and normally completes within a day.'],
  ];
  for (const [kind, title, count, hint] of items) {
    const li = el('li', `wl-q is-${count ? 'flag' : 'ok'}`), body = el('div');
    body.append(el('strong', '', title), el('span', 'hint', hint)); li.append(el('span', 'wl-q-mark', count ? '!' : '✓'), body);
    li.firstChild.setAttribute('aria-hidden', 'true');
    if (count) {
      const b = el('button', 'text-button', 'Show these'); b.type = 'button'; b.setAttribute('aria-label', `Show only: ${CHECKS.find(c => c[0] === kind)[1]}`);
      b.addEventListener('click', () => { $('#wl-check').value = kind; renderRegistrations(); $('#wl-check').focus(); setText('#wl-status', `Showing: ${CHECKS.find(c => c[0] === kind)[1]}. Choose “Every registration” to see all rows again.`); });
      li.append(b);
    }
    list.append(li);
  }
}
// Privacy request replies: a draft built from the loaded record, shown for copying. Never sent from here.
let replyFocus = null;
let replyKind = '';
function openPrivacyReply(kind, record, removedAt) {
  replyKind = kind; replyFocus = kind === 'access' ? document.activeElement : null;
  setText('#wl-reply-title', kind === 'access' ? `Reply to a request for their data · ${record.email}` : `Deletion confirmation · ${record.email}`);
  $('#wl-reply-text').value = kind === 'access' ? accessReply(record) : deletionReply(record, { removedAt });
  setText('#wl-reply-status', kind === 'access' ? 'If they asked to be removed instead, verify the request came from this mailbox, then press Remove.' : 'Removed. Send this only after you verified the request came from this mailbox.');
  show('#wl-reply', true); $('#wl-reply-title').focus();
}
function closePrivacyReply(restore = true) {
  replyKind = ''; $('#wl-reply-text').value = ''; setText('#wl-reply-status', ''); setText('#wl-reply-title', 'Privacy request reply'); show('#wl-reply', false);
  if (restore && replyFocus?.isConnected) replyFocus.focus(); replyFocus = null;
}
$('#wl-reply-close').addEventListener('click', () => closePrivacyReply());
$('#wl-reply-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#wl-reply-text').value); setText('#wl-reply-status', 'Reply copied. Paste it into your email and check it before sending.'); }
  catch { $('#wl-reply-text').select(); setText('#wl-reply-status', 'Copying was blocked by the browser. The text is selected: copy it with your keyboard.'); }
});
// Privacy request log: arrival date, what was asked, the 30-day due date and the answer. No email addresses; this browser only.
let privacyLog = { entries: [] }, prAnswering = '';
try { privacyLog = cleanLog(JSON.parse(localStorage.getItem(PRIVACY_KEY) || '{}')); } catch { privacyLog = { entries: [] }; }
// Hand-off request dates (sent on / answered on), this browser only; they travel in the test report.
let outsideRequests = { entries: {} };
try { outsideRequests = cleanRequests(JSON.parse(localStorage.getItem(OUTSIDE_KEY) || '{}')); } catch { outsideRequests = { entries: {} }; }
function saveOutsideRequests() { try { localStorage.setItem(OUTSIDE_KEY, JSON.stringify(outsideRequests)); return true; } catch { return false; } }
let outsideEvidence = { entries: {} };
try { outsideEvidence = cleanEvidence(JSON.parse(localStorage.getItem(EVIDENCE_KEY) || '{}')); } catch { outsideEvidence = { entries: {} }; }
function saveOutsideEvidence() { try { localStorage.setItem(EVIDENCE_KEY, JSON.stringify(outsideEvidence)); return true; } catch { return false; } }
function savePrivacyLog() { try { localStorage.setItem(PRIVACY_KEY, JSON.stringify(privacyLog)); } catch { setText('#pr-status', 'This browser blocked saving. The log lasts until you close the page.'); } renderPrivacyBadge(); renderLaunchDates(); }
// Open/overdue privacy requests on the Waitlist tab button, so a due answer is visible from every tab.
function renderPrivacyBadge() {
  const a = privacyAttention(privacyLog, localToday()), badge = $('#wl-tab-badge'), tab = document.querySelector('[data-tab="registrations"]');
  badge.textContent = a.badge; badge.className = `tab-badge is-${a.tone}`; badge.hidden = !a.open;
  badge.title = a.label;
  if (a.open) tab.setAttribute('aria-label', `Waitlist, ${a.label}`); else tab.removeAttribute('aria-label');
}
function openPrivacyRequest(id) {
  selectTab('registrations');
  const item = id ? document.querySelector(`#pr-list li[data-id="${CSS.escape(id)}"]`) : null, target = item || $('#pr-title');
  target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const focus = item?.querySelector('button') || $('#pr-received'); focus.focus({ preventScroll: true });
}
renderPrivacyBadge();
setInterval(renderPrivacyBadge, 60 * 60000);
const renderAccessTabBadge = () => renderAccessBadge(accessSummary(accessReview, accessToday()));
renderAccessTabBadge();
setInterval(renderAccessTabBadge, 60 * 60000);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
function renderPrivacyLog(focus) {
  const today = localToday(), s = logSummary(privacyLog, today);
  if (!$('#pr-received').value) $('#pr-received').value = today;
  $('#pr-received').max = today;
  setText('#pr-count', privacyLog.entries.length ? `${plural(s.open, 'open request')}${s.overdue ? ` · ${s.overdue} overdue` : ''}${s.nextDue ? ` · next due ${s.nextDue}` : ''}` : 'No requests logged yet.');
  const stats = $('#pr-stats'); stats.replaceChildren();
  for (const [value, label, cls] of [[s.open, 'Open', ''], [s.overdue, 'Overdue', s.overdue ? 'stat-bad' : ''], [s.dueSoon, `Due within ${DUE_SOON_DAYS} days`, s.dueSoon ? 'stat-you' : ''], [s.answered ? `${s.onTime} of ${s.answered}` : '—', s.answered ? `Answered on time · avg ${s.avgDays} days` : 'Answered on time', s.answered && !s.late ? 'stat-done' : '']]) {
    const li = el('li', `launch-stat ${cls}`.trim()); li.append(el('strong', '', String(value)), el('span', '', label)); stats.append(li);
  }
  const list = $('#pr-list'); list.replaceChildren();
  if (!privacyLog.entries.length) list.append(el('li', 'pr-empty hint', `When someone emails fynxteam5@gmail.com about their data, add it here with the day it arrived. You will see it counting down to its ${TARGET_DAYS}-day due date.`));
  for (const entry of privacyLog.entries) {
    const st = requestState(entry, today), li = el('li', `pr-item is-${st.state}`); li.dataset.id = entry.id;
    const head = el('div', 'pr-head'), what = el('div', 'pr-what');
    what.append(el('strong', '', typeLabel(entry.type)), el('span', 'hint', `Arrived ${entry.received} · due ${st.due}${entry.ref ? ` · ${entry.ref}` : ''}`));
    if (entry.note) what.append(el('span', 'hint', entry.note));
    if (entry.answered) what.append(el('span', 'hint', outcomeLabel(entry.outcome)));
    head.append(what, el('span', `pr-badge is-${st.state}`, st.label)); li.append(head);
    const actions = el('div', 'pr-actions');
    if (!entry.answered && prAnswering === entry.id) {
      const form = el('div', 'pr-answer'), dl = el('label', '', 'Answered on'), date = el('input'), ol = el('label', '', 'Answer'), sel = el('select');
      date.type = 'date'; date.value = today; date.min = entry.received; date.max = today; date.id = `pr-ans-date-${entry.id}`; dl.htmlFor = date.id;
      sel.id = `pr-ans-out-${entry.id}`; ol.htmlFor = sel.id;
      for (const [id, label] of PR_OUTCOMES) { const o = el('option', '', label); o.value = id; o.selected = id === defaultOutcome(entry.type); sel.append(o); }
      const save = el('button', 'button', 'Save answer'), cancel = el('button', 'text-button', 'Cancel'); save.type = cancel.type = 'button';
      save.dataset.prAction = 'save'; cancel.dataset.prAction = 'cancel';
      save.addEventListener('click', () => {
        const r = answerRequest(privacyLog, entry.id, { answered: date.value, outcome: sel.value });
        if (r.error) { setText('#pr-status', r.error); date.focus(); return; }
        privacyLog = r.log; prAnswering = ''; savePrivacyLog(); renderPrivacyLog({ id: entry.id, action: 'reopen' });
        setText('#pr-status', `Answer saved: ${requestState(r.entry, localToday()).label}.`);
      });
      cancel.addEventListener('click', () => { prAnswering = ''; renderPrivacyLog({ id: entry.id, action: 'answer' }); });
      date.addEventListener('keydown', e => { if (e.key === 'Escape') cancel.click(); }); sel.addEventListener('keydown', e => { if (e.key === 'Escape') cancel.click(); });
      const f1 = el('div'), f2 = el('div'); f1.append(dl, date); f2.append(ol, sel);
      form.append(f1, f2, save, cancel); li.append(form);
    } else if (!entry.answered) {
      const b = el('button', 'text-button', 'Mark answered'); b.type = 'button'; b.dataset.prAction = 'answer';
      b.setAttribute('aria-label', `Mark answered: ${typeLabel(entry.type)}, arrived ${entry.received}`);
      b.addEventListener('click', () => { prAnswering = entry.id; renderPrivacyLog(); document.getElementById(`pr-ans-date-${entry.id}`)?.focus(); });
      actions.append(b);
    } else {
      const b = el('button', 'text-button', 'Reopen'); b.type = 'button'; b.dataset.prAction = 'reopen';
      b.addEventListener('click', () => { privacyLog = reopenRequest(privacyLog, entry.id); savePrivacyLog(); renderPrivacyLog({ id: entry.id, action: 'answer' }); setText('#pr-status', 'Request reopened.'); });
      actions.append(b);
    }
    const del = el('button', 'text-button pr-delete', 'Delete'); del.type = 'button';
    del.setAttribute('aria-label', `Delete from the log: ${typeLabel(entry.type)}, arrived ${entry.received}`);
    del.addEventListener('click', () => {
      if (!window.confirm(`Delete this ${entry.answered ? 'answered' : 'open'} request from the log? This does not change the waitlist.`)) return;
      privacyLog = removeRequest(privacyLog, entry.id); if (prAnswering === entry.id) prAnswering = ''; savePrivacyLog(); renderPrivacyLog(); $('#pr-received').focus(); setText('#pr-status', 'Deleted from the log.');
    });
    if (!(prAnswering === entry.id && !entry.answered)) { actions.append(del); li.append(actions); }
    list.append(li);
  }
  if (focus) document.querySelector(`#pr-list [data-id="${CSS.escape(focus.id)}"] [data-pr-action="${focus.action}"]`)?.focus();
}
$('#pr-form').addEventListener('submit', event => {
  event.preventDefault();
  const r = addRequest(privacyLog, { received: $('#pr-received').value, type: $('#pr-type').value, ref: $('#pr-ref').value, note: $('#pr-note').value }, { today: localToday() });
  if (r.error) {
    const field = /^The reference/.test(r.error) ? '#pr-ref' : /^The note/.test(r.error) ? '#pr-note' : /asked/.test(r.error) ? '#pr-type' : '#pr-received';
    if (/recovery phrase/.test(r.error)) $(field).value = '';
    setText('#pr-status', r.error); $(field).focus(); return;
  }
  privacyLog = r.log; savePrivacyLog(); $('#pr-ref').value = ''; $('#pr-note').value = ''; $('#pr-received').value = localToday();
  renderPrivacyLog(); setText('#pr-status', `Added. ${requestState(r.entry, localToday()).label} (${requestState(r.entry, localToday()).due}).`);
});
$('#pr-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(logMarkdown(privacyLog, localToday())); setText('#pr-status', 'Request log copied (dates and request types only, no email addresses).'); }
  catch { setText('#pr-status', 'Copying was blocked by the browser. Use Download log instead.'); }
});
$('#pr-download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([logMarkdown(privacyLog, localToday())], { type: 'text/markdown;charset=utf-8' })), a = document.createElement('a');
  a.href = url; a.download = `fynx-privacy-requests-${localToday()}.md`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  setText('#pr-status', 'Request log downloaded (no email addresses).');
});
$('#wl-reply-log').addEventListener('click', () => {
  $('#pr-type').value = replyKind === 'deleted' ? 'delete' : 'access'; $('#pr-received').value = localToday();
  $('#wl-requests').scrollIntoView({ block: 'start' }); $('#pr-received').focus();
  setText('#pr-status', 'Set the day the request arrived, add a reference if you like, then press Add request. Mark it answered once you have replied.');
});
// First drawn when the Waitlist tab opens (selectTab), after every helper above is defined.
// Website-gate tests recorded right here (same records as Launch readiness, this browser only),
// with a check of the loaded test sign-ups and a one-press record after removing one.
function renderWaitlistTests() {
  const box = document.getElementById('wl-tests'); if (!box) return;
  const { gate, steps, total, done, failed } = gateTests(launchPlan, launchRecords, 'website');
  setText('#wl-tests-count', total ? `${done} of ${total} recorded${failed ? ` · ${failed} failed` : ''}` : '');
  box.replaceChildren();
  for (const { step, key, state, result, note, fixed } of steps) {
    const li = el('li', `sec-test is-${state}`); li.dataset.step = key;
    const head = el('div', 'sec-test-head');
    head.append(el('span', `launch-mark is-${state}`, fixed ? 'Done' : state === 'done' ? resultLabels[result] || 'Done' : state === 'failed' ? 'Failed' : 'To do'), el('span', 'sec-test-text', step.text));
    li.append(head);
    if (!fixed) {
      const group = el('div', 'launch-results'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', `Result: ${step.text}`);
      for (const r of RESULTS) {
        const b = el('button', `launch-result result-${r}`, resultLabels[r]); b.type = 'button'; b.dataset.result = r; b.setAttribute('aria-pressed', String(result === r));
        b.addEventListener('click', () => recordWaitlistStep(gate, step, { result: result === r ? '' : r }, `[data-result="${r}"]`));
        group.append(b);
      }
      li.append(group, stepNoteEditor(key, note, value => recordWaitlistStep(gate, step, { note: value }, '.step-note-toggle'), '#wl-tests-status'));
    }
    box.append(li);
  }
  renderTestSignupCheck(gate, steps);
}
function renderTestSignupCheck(gate, steps) {
  const wrap = $('#wl-testcheck'); wrap.replaceChildren();
  const tests = [...waitlistRecords.values()].filter(r => isTestAddress(r.email)).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 3);
  const findStep = steps.find(s => s.step.id === 'find-remove');
  for (const record of tests) {
    const c = testSignupCheck(record), section = el('section', `wl-tc is-${c.ok ? 'ok' : 'flag'}`);
    section.append(el('h4', '', `Test sign-up check · ${record.email} · ${c.passed} of ${c.total}`));
    const list = el('ul');
    for (const item of c.checks) { const li = el('li', item.ok ? 'is-ok' : 'is-flag'); li.append(el('span', 'wl-q-mark', item.ok ? '✓' : '!'), el('span', '', `${item.label}${item.detail ? ` · ${item.detail}` : ''}${item.ok ? '' : ' — missing'}`)); li.firstChild.setAttribute('aria-hidden', 'true'); list.append(li); }
    section.append(list, el('p', 'hint', c.ok ? 'Everything the waitlist should record is there. Now press Remove on this row in the table above.' : 'Something the waitlist should record is missing. Record the test as Failed with a note, and tell your developer.'));
    wrap.append(section);
  }
  if (removedTest && findStep && !findStep.fixed && findStep.result !== 'pass') {
    const offer = el('div', 'wl-tc wl-test-offer'); offer.id = 'wl-test-offer';
    const { record, check } = removedTest;
    const { recheck } = removedTest, result = findRemoveResult(check, recheck);
    offer.append(el('p', '', `You removed the test address ${record.email} after ${check.passed} of ${check.total} sign-up checks passed.`));
    if (recheck) offer.append(el('p', `wl-recheck ${recheck.gone ? 'is-ok' : 'is-flag'}`, recheck.gone ? `✓ Checked at ${new Date(recheck.at).toLocaleTimeString()}: an exact search for this address now finds nothing. It is gone from the active waitlist.` : `! Checked at ${new Date(recheck.at).toLocaleTimeString()}: an exact search still finds ${recheck.found} registration${recheck.found === 1 ? '' : 's'} for this address. Removal did not work; record it as Failed and tell your developer.`));
    else offer.append(el('p', 'hint', 'Before recording, check it is really gone: this runs the same exact search you would use for a real request (read-only).'));
    const actions = el('div', 'actions');
    const again = el('button', recheck ? 'text-button' : 'button', recheck ? 'Check again' : 'Check it is gone'); again.type = 'button'; again.id = 'wl-recheck';
    again.addEventListener('click', () => run(again, async () => {
      const current = generation, data = await api({ action: 'waitlist', email: record.email });
      if (current !== generation || !removedTest || removedTest.record.id !== record.id) return;
      removedTest = { ...removedTest, recheck: removalRecheck(record, data) };
      renderWaitlistTests();
      setText('#workspace-status', removedTest.recheck.gone ? 'Exact search finds nothing: the test address is gone.' : 'Exact search still finds this test address.');
      document.querySelector('#wl-test-offer .button')?.focus();
    }));
    const b = el('button', recheck ? 'button' : 'button secondary', result === 'pass' ? 'Record “find and remove” as Passed' : 'Record “find and remove” as Failed'); b.type = 'button';
    b.addEventListener('click', () => { recordWaitlistStep(gate, findStep.step, { result, note: findRemoveNote(record, check, { now: removedTest.at, recheck }) }, `[data-result="${result}"]`); removedTest = null; renderWaitlistTests(); });
    actions.append(recheck ? b : again, recheck ? again : b); offer.append(actions); wrap.append(offer);
  }
  show('#wl-testcheck', wrap.childElementCount > 0);
}
function recordWaitlistStep(gate, step, patch, focusKey) {
  const key = stepKey(gate.id, step.id), prev = launchRecords[key] || { result: '', note: '', at: 0 };
  const next = { ...prev, ...patch, at: Date.now() };
  if (!next.result && !next.note) delete launchRecords[key]; else launchRecords[key] = next;
  saveLaunchRecords(); renderLaunch(); renderWaitlistTests();
  document.querySelector(`#wl-tests [data-step="${CSS.escape(key)}"] ${focusKey}`)?.focus({ preventScroll: true });
  setText('#wl-tests-status', 'note' in patch && !('result' in patch) ? (next.note ? 'Note saved. It also appears in Launch readiness and your test report.' : 'Note removed.') : next.result ? `Recorded: ${resultLabels[next.result]}. It also appears in Launch readiness and your test report.` : 'Result cleared.');
}
$('#wl-open-launch').addEventListener('click', () => { selectTab('launch'); openGate('website'); });
for (const button of document.querySelectorAll('[data-wl-period]')) button.addEventListener('click', () => { waitlistPeriod = button.dataset.wlPeriod; renderWaitlistChart(); });
for (const [id, type] of [['#wl-query', 'input'], ['#wl-hide-tests', 'change'], ['#wl-consent', 'change'], ['#wl-check', 'change']]) $(id).addEventListener(type, () => renderRegistrations());
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
  const rows = visibleRegistrations();
  if (!rows.length) { setText('#wl-status', 'Nothing to download: no loaded registration matches the filter.'); return; }
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
  a.href = url; a.download = `fynx-waitlist-${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  setText('#wl-status', `Downloaded ${rows.length} registration${rows.length === 1 ? '' : 's'}${rows.length < waitlistTotal ? ` (of ${waitlistTotal}; only loaded rows matching the filter are included)` : ''}. The file contains email addresses — keep it private.`);
});
$('#wl-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(`${summaryText(summarize(waitlistRecords.values(), { total: waitlistTotal }))}\n${checkSummaryLine(checkCounts(waitlistRecords.values(), waitlistFlags))}`); setText('#wl-status', 'Summary copied (counts only, no email addresses).'); }
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
// "Your pace": the owner's own steps finished per week (from result times in this browser), the time the
// open tests still need and, once there is a steady pace, roughly when the owner's part is done.
let paceChartOpen = false;
function launchPaceBlock() {
  const now = Date.now(), pace = launchPace(launchPlan, launchRecords, { now, log: testTimings });
  const wrap = el('section', 'pace'); wrap.id = 'launch-pace'; wrap.setAttribute('aria-labelledby', 'pace-h');
  const head = el('div', 'pace-head'); const h = el('h3', '', 'Your pace'); h.id = 'pace-h';
  head.append(h, el('span', 'hint', 'Your own steps only. Engineering and outside parties are not in this estimate.')); wrap.append(head);
  const facts = el('ul', 'pace-facts');
  const fact = (big, small) => { const li = el('li'); li.append(el('strong', '', big), el('span', '', small)); facts.append(li); };
  fact(String(pace.last28), `${pace.last28 === 1 ? 'step' : 'steps'} finished in the last 4 weeks${pace.last28 ? ` (${pace.perWeek} a week)` : ''}`);
  const left = pace.ratio !== null && pace.mineLeft !== pace.minutesLeft ? pace.mineLeft : pace.minutesLeft;
  fact(pace.openTests ? `about ${durationText(left)}` : '0', pace.openTests ? `of testing left in ${pace.openTests} open ${pace.openTests === 1 ? 'test' : 'tests'}${left !== pace.minutesLeft ? ` (your measured times; estimates say ${durationText(pace.minutesLeft)})` : ''}` : 'open tests');
  fact(String(pace.otherOpen), `${pace.otherOpen === 1 ? 'decision or sign-off' : 'decisions and sign-offs'} still open`);
  wrap.append(facts);
  const forecast = el('p', 'pace-forecast');
  if (pace.forecast) forecast.append(el('strong', '', `At this pace your ${pace.open} open ${pace.open === 1 ? 'step is' : 'steps are'} done in about ${pace.forecast.weeks} ${pace.forecast.weeks === 1 ? 'week' : 'weeks'}`), document.createTextNode(` (around ${pace.forecast.date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}). A test session of an hour a week keeps it moving.`));
  else forecast.textContent = { done: 'All your own steps are finished. What remains is with engineering and outside parties.', 'not-started': 'No results recorded in this browser yet. Plan a test session below to start; a forecast appears after two finished steps in four weeks.', slow: `Fewer than two steps finished in the last four weeks, so there is no forecast yet.${pace.lastAt ? ` Last result recorded ${daysAgo(pace.lastAt, now) === 0 ? 'today' : `${daysAgo(pace.lastAt, now)} days ago`}.` : ''} Plan a short test session below to get going again.` }[pace.reason] || '';
  wrap.append(forecast);
  const max = Math.max(1, ...pace.buckets.map(b => b.count)), total = pace.buckets.reduce((n, b) => n + b.count, 0);
  const chart = el('div', 'wl-chart pace-chart');
  const axis = el('div', 'wl-axis'); axis.setAttribute('aria-hidden', 'true'); axis.append(el('span', '', String(max)), el('span', '', max > 1 ? String(Math.round(max / 2)) : ''), el('span', '', '0'));
  const bars = el('div', 'wl-bars'); bars.setAttribute('role', 'list'); bars.setAttribute('aria-label', `Your steps finished per week, last 8 weeks, oldest first: ${total} in all`);
  const labels = el('div', 'wl-labels'); labels.setAttribute('aria-hidden', 'true');
  pace.buckets.forEach((b, i) => {
    const bar = el('div', `wl-bar${b.count ? '' : ' zero'}${i === pace.buckets.length - 1 ? ' today' : ''}`); bar.setAttribute('role', 'listitem');
    const text = `${i === pace.buckets.length - 1 ? 'Last 7 days' : `Week to ${shortDate(b.end)}`}: ${b.count} ${b.count === 1 ? 'step' : 'steps'} finished`; bar.title = text; bar.setAttribute('aria-label', text);
    const fill = el('span'); fill.style.height = `${Math.round(b.count / max * 100)}%`; bar.append(fill); bars.append(bar);
    const fromEnd = pace.buckets.length - 1 - i; labels.append(el('span', '', fromEnd === 0 ? 'Now' : fromEnd % 2 ? '' : shortDate(b.end)));
  });
  chart.append(axis, bars, labels);
  const d = el('details', 'pace-more'); d.open = paceChartOpen; d.addEventListener('toggle', () => { paceChartOpen = d.open; }); d.append(el('summary', '', `Steps finished per week · ${total} in 8 weeks`), chart);
  wrap.append(d);
  return wrap;
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
  box.append(launchPaceBlock());
  const next = nextActions(launchPlan, launchRecords, 3), privacy = privacyAttention(privacyLog, localToday()), chase = outsideChase(), askAgain = outsideAskAgain(), share = outsideShare().slice(0, 2);
  const access = accessSummary(accessReview, accessToday()).urgent.slice(0, 2);
  const run = testSession && !testSession.finished ? sessionProgress(testSession, launchPlan, launchRecords) : null;
  const wrap = el('div', 'launch-next'); wrap.append(el('h3', '', run || next.length || privacy.next.length || access.length || chase.next.length || askAgain.next.length || share.length ? 'Your next steps' : 'All your steps are recorded'));
  if (run || next.length || privacy.next.length || access.length || chase.next.length || askAgain.next.length || share.length) {
    const list = el('ol');
    // A test session that is under way comes first: the owner is in the middle of it.
    if (run) {
      const li = el('li'); const b = el('button', 'text-button launch-next-link'); b.type = 'button';
      b.append(el('span', 'launch-next-gate', `Test session · ${run.recorded} of ${run.total} recorded`), el('span', '', run.current ? `Continue with: ${shortStep(run.current.step)}` : 'Every test is recorded: finish the session and copy the results.'));
      b.addEventListener('click', () => { const box = $('#test-session'); box?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); (box?.querySelector('.ts-row.is-current .launch-result') || box?.querySelector('#ts-finish'))?.focus({ preventScroll: true }); });
      li.append(b); list.append(li);
    }
    // A privacy answer that is due comes first: it has a date, launch steps do not.
    for (const item of privacy.next) {
      const li = el('li'); const b = el('button', `text-button launch-next-link is-${item.state}`); b.type = 'button';
      b.append(el('span', 'launch-next-gate', `Privacy request · ${item.label}`), el('span', '', `${item.title}${item.ref ? ` (${item.ref})` : ''}: answer by ${item.due}`));
      b.addEventListener('click', () => openPrivacyRequest(item.id)); li.append(b); list.append(li);
    }
    // Then accounts that control FYNX with a security gap or an overdue review (Account security → access review).
    for (const item of access) {
      const li = el('li'); const b = el('button', `text-button launch-next-link ${item.state === 'risk' ? 'is-overdue' : 'is-due-soon'}`); b.type = 'button';
      b.append(el('span', 'launch-next-gate', `Access review · ${item.service.id === 'inbox' ? 'Team inbox' : item.service.name}`), el('span', '', item.state === 'risk' ? `${item.title}: fix it, then record it in Account security.` : `${item.title}: check who has access and record it.`));
      b.addEventListener('click', () => openAccessService(item.service.id)); li.append(b); list.append(li);
    }
    // Then outside requests that have had no answer for CHASE_DAYS: they also have a date.
    for (const item of chase.next) {
      const li = el('li'); const b = el('button', 'text-button launch-next-link is-due-soon'); b.type = 'button';
      const entry = stepIndex(launchPlan).get(item.stepKey);
      b.append(el('span', 'launch-next-gate', `Send a reminder · ${item.party.name}`), el('span', '', `${entry ? shortStep(entry.step) : item.stepKey}: sent ${item.sent}, no answer after ${item.days} days`));
      b.addEventListener('click', () => openOutsideRequest(item.partyId, item.stepKey)); li.append(b); list.append(li);
    }
    // Then answered requests whose evidence is still incomplete CHASE_DAYS after the answer.
    for (const item of askAgain.next) {
      const li = el('li'); const b = el('button', 'text-button launch-next-link is-due-soon'); b.type = 'button';
      const entry = stepIndex(launchPlan).get(item.stepKey), n = item.missing.length;
      b.append(el('span', 'launch-next-gate', `Ask again for missing pieces · ${item.party.name}`), el('span', '', `${entry ? shortStep(entry.step) : item.stepKey}: answered ${item.answered}${item.lastArrived ? `, last piece arrived ${item.lastArrived}` : ''}, ${n} ${n === 1 ? 'piece' : 'pieces'} still missing after ${item.days} days`));
      b.addEventListener('click', () => openOutsideRequest(item.partyId, item.stepKey, true)); li.append(b); list.append(li);
    }
    // Then requests whose evidence has all come back while the step is still open: share the documents.
    for (const item of share) {
      const li = el('li'); const b = el('button', 'text-button launch-next-link'); b.type = 'button';
      const entry = stepIndex(launchPlan).get(item.stepKey);
      b.append(el('span', 'launch-next-gate', `Share the evidence · ${item.party.name}`), el('span', '', `${entry ? shortStep(entry.step) : item.stepKey}: everything came back. Send the documents so the step can be checked and marked done.`));
      b.addEventListener('click', () => openOutsideRequest(item.partyId, item.stepKey)); li.append(b); list.append(li);
    }
    for (const { gate, step, failed } of next) {
      const li = el('li'); const b = el('button', 'text-button launch-next-link'); b.type = 'button';
      b.append(el('span', 'launch-next-gate', `${failed ? 'Retest · ' : ''}${gate.title}`), el('span', '', step.text));
      b.addEventListener('click', () => { const k = stepKey(gate.id, step.id); if (findDecision(k)) openDecision(k); else if (k === DRILL_STEP) openDrill(); else openGate(gate.id); }); li.append(b); list.append(li);
    }
    wrap.append(list);
  } else wrap.append(el('p', 'muted', 'Copy the report below and share it so the checklist evidence can be updated.'));
  box.append(wrap);
  renderLaunchUpdate();
  renderLaunchHistory();
  renderLaunchDates();
}
// Launch order: what can be done now, what frees the most other work, and what still waits on another step.
const launchIndex = stepIndex(launchPlan);
function openStep(key) {
  const entry = launchIndex.get(key); if (!entry) return;
  openGate(entry.gate.id, false);
  const row = document.querySelector(`#launch-checklist [data-step="${CSS.escape(key)}"]`);
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  row.classList.add('is-highlight'); setTimeout(() => row.classList.remove('is-highlight'), 2400);
  (row.querySelector('.launch-result') || row.querySelector('.launch-step-text'))?.focus?.({ preventScroll: true });
}
function orderRow(row, { showWaits = false, showFrees = true } = {}) {
  const li = el('li', `lo-row${row.failed ? ' is-failed' : ''}`);
  const b = el('button', 'text-button lo-link'); b.type = 'button';
  b.append(el('span', 'lo-meta', `${byLabels[row.step.by]} · ${row.gate.title}${row.failed ? ' · failed, retest' : ''}`), el('span', 'lo-text', shortStep(row.step)));
  b.addEventListener('click', () => openStep(row.key));
  li.append(b);
  if (showFrees && row.unblocks) li.append(el('span', 'lo-frees', `frees ${row.unblocks} ${row.unblocks === 1 ? 'step' : 'steps'}`));
  if (showWaits && row.on.length) {
    const w = el('p', 'lo-waits'); w.append(el('span', '', 'Waits for: '));
    row.on.forEach(({ gate, step }, i) => {
      const k = stepKey(gate.id, step.id), link = el('button', 'text-button lo-dep', `${shortStep(step)}${gate.id === row.gate.id ? '' : ` (${gate.title})`}`); link.type = 'button';
      link.addEventListener('click', () => openStep(k));
      if (i) w.append(document.createTextNode(' · '));
      w.append(link);
    });
    li.append(w);
  }
  return li;
}
function renderLaunchOrder() {
  const box = $('#launch-order'); if (!box) return;
  const wasOpen = new Set([...box.querySelectorAll('details[open]')].map(d => d.dataset.part));
  const o = launchOrder(launchPlan, launchRecords); box.replaceChildren();
  const head = el('div', 'lo-head');
  head.append(el('h3', '', 'What can move now'), el('p', 'hint', 'Some steps only make sense after others (a passkey has to be added before you can sign in with it; counsel has to be hired before they can review). This is a suggested order: you can still record any result at any time.'));
  box.append(head);
  const stats = el('ul', 'lo-stats');
  for (const [part, n, label] of [['you', o.readyYou.length, 'ready for you now'], ['others', o.readyOthers.length, 'ready for engineering or outside parties'], ['waiting', o.waiting.length, 'waiting on another step']]) {
    const li = el('li'), b = el('button', `lo-stat lo-${part}`); b.type = 'button';
    b.append(el('strong', '', String(n)), el('span', '', label));
    b.addEventListener('click', () => { const d = box.querySelector(`details[data-part="${part}"]`); if (d) { d.open = true; d.querySelector('summary').focus(); d.scrollIntoView({ block: 'nearest' }); } });
    li.append(b); stats.append(li);
  }
  box.append(stats);
  if (!o.ready.length && !o.waiting.length) { box.append(el('p', 'muted', 'Every step is done or recorded.')); return; }
  const top = o.top.slice(0, 3);
  if (top.length) {
    const t = el('div', 'lo-top'); t.append(el('h4', '', 'Do these first: they free the most other steps'));
    const ol = el('ol', 'lo-list'); for (const row of top) ol.append(orderRow(row)); t.append(ol); box.append(t);
  }
  for (const [part, rows, title, opts] of [
    ['you', o.readyYou, 'Ready for you now', {}],
    ['others', o.readyOthers, 'Ready for engineering or outside parties', {}],
    ['waiting', o.waiting, 'Waiting on another step', { showWaits: true, showFrees: false }],
  ]) {
    const d = el('details', 'lo-part'); d.dataset.part = part; d.open = wasOpen.has(part);
    d.append(el('summary', '', `${title} (${rows.length})`));
    if (rows.length) { const ol = el('ol', 'lo-list'); for (const row of rows) ol.append(orderRow(row, opts)); d.append(ol); }
    else d.append(el('p', 'muted', part === 'waiting' ? 'Nothing is waiting: every open step can start now.' : 'Nothing in this group can start right now.'));
    box.append(d);
  }
  box.append(engineeringBox(o, wasOpen.has('eng-preview')));
  box.append(outsideBox(wasOpen.has('out-preview')));
}
// "What engineering can start now": a short list to paste to the engineer or Claude (checklist text and results only, no notes).
function engineeringBox(o, previewOpen = false) {
  const eng = [...o.ready, ...o.waiting].filter(r => r.step.by === 'engineering');
  const ready = o.ready.filter(r => r.step.by === 'engineering').length;
  const wrap = el('div', 'lo-eng'); wrap.id = 'lo-eng';
  wrap.append(el('h4', '', 'Hand off to engineering'), el('p', 'hint', eng.length
    ? `${ready} engineering ${ready === 1 ? 'step can' : 'steps can'} start now and ${eng.length - ready} ${eng.length - ready === 1 ? 'is' : 'are'} waiting. Copy the list and paste it into a message to your engineer or Claude: it says what to build first, what is still waiting, and what only you (or an outside party) can do to unblock it. Notes are left out.`
    : 'Every engineering step is done or recorded.'));
  if (!eng.length) return wrap;
  const status = el('p', 'status'); status.id = 'lo-eng-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const brief = () => engineeringBrief(launchPlan, launchRecords);
  const actions = el('div', 'actions');
  const copy = el('button', 'button secondary', 'Copy what engineering can start now'); copy.type = 'button'; copy.id = 'lo-eng-copy';
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(brief()); status.textContent = 'Copied. Paste it into a message to your engineer or Claude.'; }
    catch { status.textContent = 'Copying was blocked by the browser. Use Download instead.'; }
  });
  const dl = el('button', 'text-button', 'Download'); dl.type = 'button'; dl.id = 'lo-eng-download';
  dl.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([brief()], { type: 'text/markdown;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = `fynx-engineering-next-${new Date().toISOString().slice(0, 10)}.md`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Engineering list downloaded.';
  });
  actions.append(copy, dl);
  const preview = el('details', 'lo-part lo-eng-preview'); preview.dataset.part = 'eng-preview';
  preview.append(el('summary', '', 'Preview the list'));
  const pre = el('pre', 'lo-eng-pre'); preview.addEventListener('toggle', () => { if (preview.open) pre.textContent = brief(); });
  preview.append(pre);
  if (previewOpen) { preview.open = true; pre.textContent = brief(); }
  wrap.append(actions, preview, status);
  return wrap;
}
// "Hand off to outside parties": per party (lawyer, payment provider, security reviewer, market data),
// what can be asked now, what waits and on what, the questions to answer and the evidence to ask back.
let outsideParty = PARTIES[0].id;
const evidenceOpen = new Set(); // "What came back" lists the owner opened by hand (kept across re-renders)
function outsideBox(previewOpen = false) {
  const all = partyStatus(launchPlan, launchRecords, decisionAnswers), today = localToday();
  const s = all.find(x => x.party.id === outsideParty) || all[0];
  const tracked = x => x.rows.filter(r => r.state !== 'not-needed').map(r => r.key);
  const wrap = el('div', 'lo-eng lo-out'); wrap.id = 'lo-out';
  wrap.append(el('h4', '', 'Hand off to outside parties'), el('p', 'hint', 'Pick who you are writing to. The list says what you can ask them now, what has to happen first, the questions they need to answer and what to ask them to send back. It uses your decision answers; notes are left out. Questions, not legal or security advice.'));
  const pick = el('div', 'lo-out-pick'); pick.setAttribute('role', 'group'); pick.setAttribute('aria-label', 'Outside party');
  for (const x of all) {
    const b = el('button', `lo-out-party${x.party.id === s.party.id ? ' is-on' : ''}`); b.type = 'button'; b.dataset.party = x.party.id;
    b.setAttribute('aria-pressed', String(x.party.id === s.party.id));
    const reqLine = partyRequestLine(partyRequests(outsideRequests, x.party.id, x.rows.filter(r => r.state === 'ready' || r.state === 'waiting').map(r => r.key), today));
    b.append(el('strong', '', x.party.name), el('span', '', partyLine(x)));
    if (reqLine) b.append(el('span', `lo-out-req${/to chase/.test(reqLine) ? ' is-chase' : ''}`, reqLine));
    const evLine = partyEvidenceLine(partyEvidence(outsideEvidence, x.party.id, tracked(x)));
    if (evLine) b.append(el('span', 'lo-out-ev', evLine));
    const askAgain = missingAttention(outsideRequests, outsideEvidence, x.rows.filter(r => r.state === 'ready' || r.state === 'waiting').map(r => requestId(x.party.id, r.key)), today).count;
    if (askAgain) b.append(el('span', 'lo-out-req is-chase', `${askAgain} to ask again for missing pieces`));
    b.addEventListener('click', () => { outsideParty = x.party.id; const next = outsideBox(); wrap.replaceWith(next); next.querySelector(`[data-party="${CSS.escape(x.party.id)}"]`)?.focus(); });
    pick.append(b);
  }
  wrap.append(pick);
  wrap.append(el('p', 'lo-out-who', `Who: ${s.contact.text}`));
  wrap.append(el('p', 'hint lo-req-hint', `Record the day you send each request and the day the answer arrives. After ${CHASE_DAYS} days without an answer the request shows “Send a reminder” here and in Your next steps, and the copied list says when you first asked. The same happens when they answered but pieces of evidence are still missing ${CHASE_DAYS} days after their answer (or after the last piece that arrived, if that is later). Dates only, kept in this browser and carried in your test report.`));
  const ol = el('ul', 'lo-out-steps');
  for (const r of s.rows) {
    const li = el('li', `lo-out-step is-${r.state}`);
    const b = el('button', 'text-button lo-link'); b.type = 'button';
    b.append(el('span', 'lo-meta', `${handoffStateText[r.state]} · ${r.gate.title}`), el('span', 'lo-text', shortStep(r.step)));
    b.addEventListener('click', () => openStep(r.key));
    li.append(b);
    if (r.state === 'waiting') {
      const w = el('p', 'lo-waits'); w.append(el('span', '', 'First: '));
      r.on.forEach(({ gate, step }, i) => {
        const k = stepKey(gate.id, step.id), link = el('button', 'text-button lo-dep', `${shortStep(step)} (${byLabels[step.by]})`); link.type = 'button';
        link.addEventListener('click', () => openStep(k));
        if (i) w.append(document.createTextNode(' · '));
        w.append(link);
      });
      li.append(w);
    } else if (r.state === 'not-needed') li.append(el('p', 'lo-waits', r.spec.onlyIf.reason));
    if (r.state !== 'not-needed') li.append(requestTracker(s.party, r, today), evidenceTracker(s.party, r));
    ol.append(li);
  }
  wrap.append(ol);
  const status = el('p', 'status'); status.id = 'lo-out-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  if (outsideStatus) { status.textContent = outsideStatus; outsideStatus = ''; }
  const sentDates = Object.fromEntries(tracked(s).map(k => [k, outsideRequests.entries[requestId(s.party.id, k)]]).filter(([, e]) => e?.sent));
  const evStates = Object.fromEntries(tracked(s).map(k => { const id = requestId(s.party.id, k); return [k, evidenceState(id, outsideEvidence.entries[id])]; }));
  const brief = () => outsideBrief(launchPlan, launchRecords, s.party.id, decisionAnswers, { sent: sentDates, evidence: evStates });
  const actions = el('div', 'actions');
  const copy = el('button', 'button secondary', `Copy the list for the ${s.party.short}`); copy.type = 'button'; copy.id = 'lo-out-copy';
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(brief()); status.textContent = `Copied. Paste it into an email to the ${s.party.short}.`; }
    catch { status.textContent = 'Copying was blocked by the browser. Use Download instead.'; }
  });
  const dl = el('button', 'text-button', 'Download'); dl.type = 'button'; dl.id = 'lo-out-download';
  dl.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([brief()], { type: 'text/markdown;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = `fynx-handoff-${s.party.id}-${new Date().toISOString().slice(0, 10)}.md`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = `List for the ${s.party.short} downloaded.`;
  });
  const evCopy = el('button', 'text-button', 'Copy evidence summary'); evCopy.type = 'button'; evCopy.id = 'lo-out-ev-copy';
  evCopy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(evidenceSummary(outsideEvidence, evidenceRows())); status.textContent = 'Evidence summary copied (all parties). Send it together with the documents themselves: a tick alone does not mark a step done.'; }
    catch { status.textContent = 'Copying was blocked by the browser. The ticks are also in your test report under “Outside evidence received”.'; }
  });
  actions.append(copy, dl, evCopy);
  const preview = el('details', 'lo-part lo-eng-preview'); preview.dataset.part = 'out-preview';
  preview.append(el('summary', '', 'Preview the list'));
  const pre = el('pre', 'lo-eng-pre'); preview.addEventListener('toggle', () => { if (preview.open) pre.textContent = brief(); });
  preview.append(pre);
  if (previewOpen) { preview.open = true; pre.textContent = brief(); }
  wrap.append(actions, preview, status);
  return wrap;
}
// Sent on / answered on for one hand-off request. Dates only; saved in this browser; in the test report.
let outsideStatus = '';
function requestTracker(party, r, today) {
  const id = requestId(party.id, r.key), entry = outsideRequests.entries[id], st = outsideRequestState(entry, today);
  const base = `lo-req-${party.id}-${r.key.replace(/[^a-z0-9-]/gi, '-')}`;
  const box = el('div', `lo-req is-${st.state}`); box.dataset.req = id;
  box.append(el('p', 'lo-req-state', r.state === 'done' && st.state === 'not-sent' ? 'Step done · no request dates recorded' : st.label));
  const change = (field, value, focusId) => {
    const res = setRequestDate(outsideRequests, id, field, value, { today: localToday() });
    if (res.error) { outsideStatus = res.error; }
    else if (res.unchanged) { outsideStatus = 'Dates unchanged.'; }
    else {
      outsideRequests = res.log;
      const saved = saveOutsideRequests(), ns = outsideRequestState(outsideRequests.entries[id], localToday());
      outsideStatus = `${party.name}, ${shortStep(r.step)}: ${ns.label}.${saved ? '' : ' This browser blocked saving; the dates last until you close the page.'}`;
    }
    renderLaunchOverview(); renderLaunchOrder();
    document.getElementById(focusId)?.focus();
  };
  for (const [field, label] of [['sent', 'Sent on'], ['answered', 'Answered on']]) {
    if (field === 'answered' && !entry?.sent) continue;
    const wrap = el('span', 'lo-req-field'), input = el('input'), lab = el('label', '', label);
    input.type = 'date'; input.id = `${base}-${field}`; input.max = today; input.value = entry?.[field] || ''; lab.htmlFor = input.id;
    input.setAttribute('aria-describedby', 'lo-out-status');
    input.addEventListener('change', () => change(field, input.value, input.id));
    wrap.append(lab, input); box.append(wrap);
  }
  const quick = el('button', 'text-button lo-req-today'); quick.type = 'button';
  if (!entry?.sent) { quick.textContent = 'Sent today'; quick.id = `${base}-sent-today`; quick.addEventListener('click', () => change('sent', localToday(), `${base}-answered-today`)); box.append(quick); }
  else if (!entry.answered) { quick.textContent = 'Answered today'; quick.id = `${base}-answered-today`; quick.addEventListener('click', () => change('answered', localToday(), `${base}-answered`)); box.append(quick); }
  if (entry?.sent) {
    const clear = el('button', 'text-button lo-req-clear', 'Clear dates'); clear.type = 'button'; clear.id = `${base}-clear`;
    clear.setAttribute('aria-label', `Clear the request dates for ${shortStep(r.step)}`);
    clear.addEventListener('click', () => change('sent', '', `${base}-sent-today`)); box.append(clear);
  }
  return box;
}
// "What came back": tick each piece of evidence the party was asked to send back. Ticks only, this browser.
function evidenceTracker(party, r) {
  const id = requestId(party.id, r.key), items = evidenceItems(id), st = evidenceState(id, outsideEvidence.entries[id]);
  const base = `lo-ev-${party.id}-${r.key.replace(/[^a-z0-9-]/gi, '-')}`;
  const entry = outsideRequests.entries[id];
  // Folded until something can have come back (a tick or an answer date), so long lists stay short.
  const missing = r.state !== 'done' ? missingAfterAnswer(id, entry, outsideEvidence.entries[id], localToday()) : null;
  const outer = el('details', `lo-ev is-${st.state}${missing?.due ? ' is-ask-again' : ''}`); outer.dataset.ev = id; outer.open = Boolean(st.count || entry?.answered || evidenceOpen.has(id));
  outer.addEventListener('toggle', () => { if (outer.open) evidenceOpen.add(id); else evidenceOpen.delete(id); });
  const sum = el('summary'); sum.append(el('span', 'lo-ev-title', 'What came back'), el('span', 'lo-ev-count', st.count ? `${st.count} of ${st.total}` : `${st.total} to come back`)); outer.append(sum);
  const box = el('fieldset', 'lo-ev-set'); outer.append(box);
  box.append(el('legend', 'visually-hidden-label', `What came back from the ${party.short}`));
  const stateLine = el('p', 'lo-ev-state', st.label); stateLine.id = `${base}-state`; box.append(stateLine);
  const ul = el('ul', 'lo-ev-list');
  for (const it of items) {
    const li = el('li'), input = el('input'), lab = el('label');
    input.type = 'checkbox'; input.id = `${base}-${it.id}`; input.checked = st.received.includes(it); input.setAttribute('aria-describedby', stateLine.id);
    lab.htmlFor = input.id; lab.append(input, el('span', '', it.label));
    const saveAndSay = () => {
      const saved = saveOutsideEvidence(), ns = evidenceState(id, outsideEvidence.entries[id]);
      outsideStatus = `${party.name}, ${shortStep(r.step)}: ${ns.label}.${saved ? '' : ' This browser blocked saving; the ticks last until you close the page.'}`;
    };
    input.addEventListener('change', () => {
      const res = setEvidenceItem(outsideEvidence, id, it.id, input.checked);
      if (res.error) outsideStatus = res.error;
      else if (!res.unchanged) {
        outsideEvidence = res.log;
        // A new tick is dated today; change the date next to it if it arrived earlier.
        if (input.checked) { const d = setReceivedDate(outsideEvidence, id, it.id, localToday(), { today: localToday() }); if (!d.error && !d.unchanged) outsideEvidence = d.log; }
        saveAndSay();
      }
      renderLaunchOverview(); renderLaunchOrder();
      document.getElementById(input.id)?.focus();
    });
    li.append(lab);
    if (input.checked) {
      const when = el('span', 'lo-ev-when'), dl = el('label', '', 'Arrived'), di = el('input');
      di.type = 'date'; di.id = `${input.id}-on`; di.min = EVIDENCE_FIRST_DAY; di.max = localToday(); di.value = st.receivedOn[it.id] || ''; dl.htmlFor = di.id;
      di.setAttribute('aria-label', `Date it arrived: ${it.label}`); di.setAttribute('aria-describedby', 'lo-out-status');
      di.addEventListener('change', () => {
        const res = setReceivedDate(outsideEvidence, id, it.id, di.value, { today: localToday() });
        if (res.error) outsideStatus = res.error;
        else if (res.unchanged) outsideStatus = 'Date unchanged.';
        else { outsideEvidence = res.log; saveAndSay(); }
        renderLaunchOverview(); renderLaunchOrder();
        document.getElementById(di.id)?.focus();
      });
      when.append(dl, di); li.append(when);
    }
    ul.append(li);
  }
  box.append(ul);
  if (missing) {
    const note = el('p', `lo-ev-note${missing.due ? ' is-due' : ''}`, `${missing.label}.${missing.nothingTicked ? ' If some of it already arrived, tick it above first.' : ''}`);
    note.id = `${base}-missing`; box.append(note);
  }
  if (st.count && r.state !== 'done') {
    if (st.state === 'complete') box.append(el('p', 'lo-ev-note is-ready', 'Everything is in. Check the documents, then share them with “Copy evidence summary” so this step can be marked done in the checklist. Ticking does not mark it done by itself.'));
    else box.append(el('p', 'lo-ev-note', 'The copied list now thanks them for what arrived and asks only for what is still missing.'));
    if (!entry?.answered) box.append(el('p', 'lo-ev-note', entry?.sent ? 'Tip: also record the “Answered on” date above.' : 'Tip: also record when you sent the request and when they answered, above.'));
  }
  return outer;
}
// Every hand-off request (party + step, not-needed ones left out) in display order, with a short title.
function evidenceRows() {
  const out = [];
  for (const s of partyStatus(launchPlan, launchRecords, decisionAnswers)) for (const r of s.rows) if (r.state !== 'not-needed') out.push({ id: requestId(s.party.id, r.key), title: shortStep(r.step), open: r.state !== 'done' });
  return out;
}
function outsideShare() { return readyToShare(outsideEvidence, evidenceRows().filter(r => r.open).map(r => r.id)); }
// Requests still needing an answer (open steps only) that have waited CHASE_DAYS or more.
function outsideChase(limit = 2) {
  const skip = new Set();
  for (const s of partyStatus(launchPlan, launchRecords, decisionAnswers)) for (const r of s.rows) if (r.state === 'done' || r.state === 'not-needed') skip.add(requestId(s.party.id, r.key));
  return outsideAttention(outsideRequests, localToday(), { limit, skip });
}
// Answered requests (open steps only) whose evidence is still incomplete CHASE_DAYS after the answer.
function outsideAskAgain(limit = 2) {
  return missingAttention(outsideRequests, outsideEvidence, evidenceRows().filter(r => r.open).map(r => r.id), localToday(), { limit });
}
// "Your dates": privacy answers, outside reminders, evidence to ask again for and access reviews, soonest
// first, with a calendar file. Fixed words only (no references, notes or typed text) go into the copy and
// the .ics file, because calendars are usually synced to an outside service.
const DATES_SHOWN = 6;
let datesExpanded = false;
const ownerLink = () => (location.protocol === 'https:' ? `${location.origin}${location.pathname}` : '');
const ownerDates = () => collectDates({ privacy: privacyLog, requests: outsideRequests, evidence: outsideEvidence, openRequests: evidenceRows().filter(r => r.open), access: accessReview, today: localToday() });
const shortDay = day => { const d = new Date(`${day}T12:00:00Z`); return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }); };
function openDateItem(item) {
  if (item.kind === 'privacy') openPrivacyRequest(item.ref.id);
  else if (item.kind === 'access') openAccessService(item.ref.serviceId);
  else openOutsideRequest(item.ref.partyId, item.ref.stepKey, item.kind === 'evidence');
}
function renderLaunchDates() {
  const box = document.getElementById('launch-dates'); if (!box) return;
  const d = ownerDates(), status = el('p', 'hint ld-status'); status.setAttribute('role', 'status');
  box.replaceChildren();
  const head = el('div', 'lo-head');
  head.append(el('h3', '', 'Your dates'), el('p', 'hint', 'Everything in this workspace that has a date: privacy answers, reminders to outside parties, evidence to ask for again and the 90-day access reviews. Add them to your calendar so nothing is missed between visits.'));
  box.append(head);
  const line = el('p', `od-headline ${d.overdue ? 'is-overdue' : d.today || d.soon ? 'is-due-soon' : ''}`, datesHeadline(d)); box.append(line);
  if (!d.items.length) {
    box.append(el('p', 'muted od-empty', 'Dates appear here when you log a privacy request (Waitlist tab), record the day you sent a request to an outside party (What can move now → Hand off to outside parties) or record an access review (Account security).'));
    return;
  }
  const list = el('ol', 'od-list'), shown = datesExpanded ? d.items : d.items.slice(0, DATES_SHOWN);
  for (const item of shown) {
    const li = el('li', `od-row is-${item.state}`);
    const when = el('div', 'od-when'); when.append(el('strong', '', shortDay(item.date)), el('span', '', item.when));
    const body = el('div', 'od-body'); body.append(el('span', 'od-kind', DATE_KINDS[item.kind]), el('strong', 'od-title', item.title), el('span', 'od-detail', item.detail));
    const go = el('button', 'text-button od-open', 'Open'); go.type = 'button';
    go.setAttribute('aria-label', `Open: ${item.title}`);
    go.addEventListener('click', () => openDateItem(item));
    li.append(when, body, go); list.append(li);
  }
  box.append(list);
  if (d.items.length > DATES_SHOWN) {
    const more = el('button', 'text-button od-more', datesExpanded ? 'Show fewer' : `Show all ${d.items.length} dates`); more.type = 'button'; more.setAttribute('aria-expanded', String(datesExpanded));
    more.addEventListener('click', () => { datesExpanded = !datesExpanded; renderLaunchDates(); document.querySelector('#launch-dates .od-more')?.focus(); });
    box.append(more);
  }
  if (d.later) box.append(el('p', 'hint', `${d.later} more ${d.later === 1 ? 'date is' : 'dates are'} further than six months away.`));
  const actions = el('div', 'od-actions');
  const ics = el('button', 'button secondary', 'Add to calendar (.ics)'); ics.type = 'button'; ics.id = 'od-ics';
  ics.addEventListener('click', () => {
    const today = localToday(), url = URL.createObjectURL(new Blob([datesIcs(ownerDates(), { today, link: ownerLink() })], { type: 'text/calendar;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = `fynx-owner-dates-${today}.ics`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = `Calendar file downloaded with ${d.items.length} ${d.items.length === 1 ? 'date' : 'dates'}. Open it to add them to your calendar; overdue items land on today. Download it again after changes: the same events are updated, finished ones are not removed by the file.`;
  });
  const copy = el('button', 'text-button', 'Copy dates'); copy.type = 'button'; copy.id = 'od-copy';
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(datesText(ownerDates(), localToday())); status.textContent = 'Dates copied (fixed words only: no references or notes).'; }
    catch { status.textContent = 'Copying was blocked by the browser. Use Add to calendar instead.'; }
  });
  actions.append(ics, copy); box.append(actions, status,
    el('p', 'hint', 'The calendar file holds only fixed words (request types, party names, step and service names). Your references and notes stay in this browser.'));
}
// "Progress update": a plain-language note on the last 7, 14 or 30 days for the team, an adviser or an
// investor. Fixed words, dates and counts only (wallet-src/progress-update.js); notes and references stay out.
let updateDays = 7, updatePreviewOpen = false;
function currentUpdate() {
  let drillState = null; try { drillState = drill; } catch { drillState = null; }
  return progressUpdate({ plan: launchPlan, records: launchRecords, answers: decisionAnswers, requests: outsideRequests, privacy: privacyLog, drill: drillState, dates: ownerDates(), timings: testTimings, days: updateDays, today: localToday() });
}
function renderLaunchUpdate(focusSel = '') {
  const box = document.getElementById('launch-update'); if (!box) return;
  const u = currentUpdate(), status = el('p', 'hint ld-status'); status.id = 'pu-status'; status.setAttribute('role', 'status');
  box.replaceChildren();
  const head = el('div', 'lo-head');
  head.append(el('h3', '', 'Progress update'), el('p', 'hint', 'A short note on how the launch is going, ready to paste into an email or chat for your team, an adviser or an investor. It is written from what this browser has recorded: test results, outside requests, dates and counts.'));
  box.append(head);
  const pick = el('div', 'pu-periods'); pick.setAttribute('role', 'group'); pick.setAttribute('aria-label', 'Period');
  for (const d of UPDATE_PERIODS) {
    const b = el('button', `pu-period${d === updateDays ? ' is-on' : ''}`, `Last ${d} days`); b.type = 'button'; b.dataset.days = String(d);
    b.setAttribute('aria-pressed', String(d === updateDays));
    b.addEventListener('click', () => { updateDays = d; renderLaunchUpdate(`[data-days="${d}"]`); });
    pick.append(b);
  }
  box.append(pick, el('p', 'pu-headline', updateHeadline(u)));
  const facts = el('ul', 'pace-facts pu-facts');
  const fact = (big, small) => { const li = el('li'); li.append(el('strong', '', big), el('span', '', small)); facts.append(li); };
  const moved = u.overall.percent - u.overall.startPercent;
  fact(`${u.overall.percent}%`, moved > 0 ? `done, up from ${u.overall.startPercent}%` : 'done, no change in this period');
  const doneCount = u.finished.length + u.checklist.length;
  fact(String(doneCount), `${doneCount === 1 ? 'step' : 'steps'} finished${u.checklist.length ? ` (${u.finished.length} yours, ${u.checklist.length} engineering or outside)` : ''}${u.failed.length ? ` · ${u.failed.length} to retest` : ''}`);
  const waiting = u.outside.reduce((n, p) => n + p.rows.filter(r => r.state !== 'answered').length, 0), answered = u.outside.reduce((n, p) => n + p.rows.filter(r => r.state === 'answered').length, 0);
  fact(String(waiting), `${waiting === 1 ? 'request' : 'requests'} waiting on outside parties${answered ? ` · ${answered} answered` : ''}`);
  fact(String(u.coming.length), `${u.coming.length === 1 ? 'date' : 'dates'} overdue or in the next 14 days`);
  box.append(facts);
  if (u.finished.length) {
    const list = el('ul', 'pu-done'); list.setAttribute('aria-label', `Finished in the last ${u.days} days`);
    for (const f of u.finished.slice(0, 5)) {
      const li = el('li'); const b = el('button', 'text-button lo-link'); b.type = 'button';
      b.append(el('span', 'lo-meta', `${f.result === 'skip' ? 'Not applicable' : 'Passed'} · ${shortDay(new Date(f.at).toISOString().slice(0, 10))} · ${f.gate}`), el('span', 'lo-text', f.text));
      b.addEventListener('click', () => openStep(f.key)); li.append(b); list.append(li);
    }
    box.append(list);
    if (u.finished.length > 5) box.append(el('p', 'hint', `and ${u.finished.length - 5} more in the full update.`));
  }
  if (u.checklist.length) {
    const list = el('ul', 'pu-done'); list.setAttribute('aria-label', `Recorded done in the checklist in the last ${u.days} days`);
    for (const c of u.checklist.slice(0, 5)) {
      const li = el('li'); const b = el('button', 'text-button lo-link'); b.type = 'button';
      b.append(el('span', 'lo-meta', `${byLabels[c.by]} · recorded done ${shortDay(c.date)} · ${c.gate}`), el('span', 'lo-text', c.text));
      b.addEventListener('click', () => openStep(c.key)); li.append(b); list.append(li);
    }
    box.append(list);
    if (u.checklist.length > 5) box.append(el('p', 'hint', `and ${u.checklist.length - 5} more in the full update.`));
  }
  if (!u.finished.length && !u.checklist.length) box.append(el('p', 'muted pu-empty', `Nothing finished in the last ${u.days} days. Record results in the checklist below (or plan a test session) and they show up here.`));
  const text = () => updateMarkdown(currentUpdate());
  const actions = el('div', 'od-actions');
  const copy = el('button', 'button secondary', 'Copy update'); copy.type = 'button'; copy.id = 'pu-copy';
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text()); status.textContent = 'Update copied. It contains fixed words, dates and counts only: no notes, references, email or wallet addresses.'; }
    catch { status.textContent = 'Copying was blocked by the browser. Use Download instead.'; }
  });
  const short = el('button', 'text-button', 'Copy one-line summary'); short.type = 'button'; short.id = 'pu-short';
  short.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(updateHeadline(currentUpdate())); status.textContent = 'One-line summary copied.'; }
    catch { status.textContent = 'Copying was blocked by the browser.'; }
  });
  const dl = el('button', 'text-button', 'Download (.md)'); dl.type = 'button'; dl.id = 'pu-download';
  dl.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([text()], { type: 'text/markdown;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = `fynx-progress-update-${localToday()}.md`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Update downloaded.';
  });
  actions.append(copy, short, dl);
  const preview = el('details', 'lo-part pu-preview'); preview.append(el('summary', '', 'Preview the update'));
  const pre = el('pre', 'lo-eng-pre'); preview.append(pre);
  preview.addEventListener('toggle', () => { updatePreviewOpen = preview.open; if (preview.open) pre.textContent = text(); });
  if (updatePreviewOpen) { preview.open = true; pre.textContent = text(); }
  box.append(actions, preview, status, el('p', 'hint', 'Results recorded on another device count once you bring them in with “Bring in results from another device” below. The update never claims a launch date or that FYNX is live.'));
  if (focusSel) box.querySelector(focusSel)?.focus();
}
// "What's been finished": every finished launch step with its date (checklist doneOn + this browser's
// results), by week, with a running total. Fixed words and dates only (wallet-src/launch-history.js).
let historyWho = 'all', historyAll = false, historyPreviewOpen = false;
const HISTORY_WEEKS_SHOWN = 3;
function currentHistory() { return launchHistory(launchPlan, launchRecords, { who: historyWho, today: localToday() }); }
function historyRow(e) {
  const li = el('li', `lh-row is-${e.by}`);
  const b = el('button', 'text-button lo-link'); b.type = 'button';
  b.append(el('span', 'lo-meta', `${e.date ? `${shortDay(e.date)} · ` : ''}${entryLabel(e)} · ${e.gate}`), el('span', 'lo-text', e.text));
  b.addEventListener('click', () => openStep(e.key));
  li.append(b); return li;
}
function renderLaunchHistory(focusSel = '') {
  const box = document.getElementById('launch-history'); if (!box) return;
  const h = currentHistory(), status = el('p', 'hint ld-status'); status.id = 'lh-status'; status.setAttribute('role', 'status');
  box.replaceChildren();
  const head = el('div', 'lo-head');
  head.append(el('h3', '', 'What’s been finished'), el('p', 'hint', 'Every finished launch step with its date: engineering and outside-party work from the checklist, and your own tests from this browser. Open any line to see the step.'));
  box.append(head, el('p', 'pu-headline', historyHeadline(h)));
  const pick = el('div', 'pu-periods'); pick.setAttribute('role', 'group'); pick.setAttribute('aria-label', 'Show work by');
  for (const w of HISTORY_WHO) {
    const b = el('button', `pu-period${w === historyWho ? ' is-on' : ''}`, `${whoLabels[w]} (${h.counts[w] || 0})`); b.type = 'button'; b.dataset.who = w;
    b.setAttribute('aria-pressed', String(w === historyWho));
    b.addEventListener('click', () => { historyWho = w; historyAll = false; renderLaunchHistory(`[data-who="${w}"]`); });
    pick.append(b);
  }
  box.append(pick);
  // Running total, last 8 weeks (all parties).
  const run = el('ol', 'lh-run'); run.setAttribute('aria-label', 'Launch steps done by the end of each week, last 8 weeks, oldest first');
  for (const r of h.running) {
    const li = el('li', `lh-week${r.current ? ' is-now' : ''}`);
    const label = `${r.current ? 'This week' : weekTitle(r.week)}: ${r.done} of ${h.total} done (${r.percent}%)${r.added ? `, ${r.added} added` : ''}`;
    li.setAttribute('aria-label', label); li.title = label;
    const bar = el('span', 'lh-bar'); const fill = el('span', 'lh-fill'); fill.style.width = `${r.percent}%`; bar.append(fill);
    li.append(el('span', 'lh-when', r.current ? 'This week' : shortDay(r.week)), bar, el('span', 'lh-num', `${r.percent}%${r.added ? ` · +${r.added}` : ''}`));
    run.append(li);
  }
  const chart = el('details', 'pace-more lh-chart'); chart.open = true; chart.append(el('summary', '', 'Done by the end of each week'), run);
  box.append(chart);
  if (!h.shown) box.append(el('p', 'muted pu-empty', historyWho === 'you' ? 'None of your own steps are finished yet. Record Passed or Not applicable in the checklist below (or plan a test session) and they appear here with the date.' : `Nothing finished yet for ${whoLabels[historyWho].toLowerCase()}.`));
  const weeks = historyAll ? h.weeks : h.weeks.slice(0, HISTORY_WEEKS_SHOWN);
  for (const w of weeks) {
    const sec = el('div', 'lh-group');
    const parts = ['you', 'engineering', 'outside'].filter(k => w.by[k]).map(k => `${w.by[k]} ${whoLabels[k].toLowerCase()}`);
    sec.append(el('h4', 'lh-title', `${weekTitle(w.week)} · ${w.entries.length} ${w.entries.length === 1 ? 'step' : 'steps'}${historyWho === 'all' && parts.length > 1 ? ` (${parts.join(', ')})` : ''}`));
    const list = el('ul', 'pu-done'); for (const e of w.entries) list.append(historyRow(e)); sec.append(list); box.append(sec);
  }
  if (h.weeks.length > HISTORY_WEEKS_SHOWN) {
    const more = el('button', 'text-button lh-more', historyAll ? 'Show fewer weeks' : `Show all ${h.weeks.length} weeks`); more.type = 'button'; more.setAttribute('aria-expanded', String(historyAll));
    more.addEventListener('click', () => { historyAll = !historyAll; renderLaunchHistory('.lh-more'); });
    box.append(more);
  }
  for (const [list, title] of [[h.undated, 'Finished, date not recorded'], [h.baseline, `Already done when the checklist started${h.started ? ` (${shortDay(h.started)})` : ''}`]]) {
    if (!list.length) continue;
    const d = el('details', 'lo-part lh-group'); d.append(el('summary', '', `${title} · ${list.length}`));
    const ul = el('ul', 'pu-done'); for (const e of list) ul.append(historyRow(e)); d.append(ul); box.append(d);
  }
  const text = () => historyMarkdown(currentHistory(), { product: launchPlan.product });
  const actions = el('div', 'od-actions');
  const copy = el('button', 'button secondary', 'Copy history'); copy.type = 'button'; copy.id = 'lh-copy';
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text()); status.textContent = `History copied (${whoLabels[historyWho].toLowerCase()}). Fixed words and dates only: no notes.`; }
    catch { status.textContent = 'Copying was blocked by the browser. Use Download instead.'; }
  });
  const dl = el('button', 'text-button', 'Download (.md)'); dl.type = 'button'; dl.id = 'lh-download';
  dl.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([text()], { type: 'text/markdown;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = `fynx-launch-history-${localToday()}.md`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'History downloaded.';
  });
  actions.append(copy, dl);
  const preview = el('details', 'lo-part pu-preview'); preview.append(el('summary', '', 'Preview the history'));
  const pre = el('pre', 'lo-eng-pre'); preview.append(pre);
  preview.addEventListener('toggle', () => { historyPreviewOpen = preview.open; if (preview.open) pre.textContent = text(); });
  if (historyPreviewOpen) { preview.open = true; pre.textContent = text(); }
  box.append(actions, preview, status, el('p', 'hint', 'Checklist dates are the day a step was recorded as done in the FYNX launch checklist. Your own dates are when you recorded the result in this browser; results from another device count once you bring them in below.'));
  if (focusSel) box.querySelector(focusSel)?.focus();
}
function openOutsideRequest(partyId, stepKey, toEvidence = false) {
  outsideParty = partyId; renderLaunchOrder();
  const id = CSS.escape(requestId(partyId, stepKey));
  const box = toEvidence ? document.querySelector(`#lo-out [data-ev="${id}"]`) || document.querySelector(`#lo-out [data-req="${id}"]`) : document.querySelector(`#lo-out [data-req="${id}"]`);
  if (!box) return;
  if (box.tagName === 'DETAILS') box.open = true;
  box.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  box.classList.add('is-highlight'); setTimeout(() => box.classList.remove('is-highlight'), 2400);
  box.querySelector('input')?.focus({ preventScroll: true });
}
// Gate summary line: which open steps the gate's waiting steps still wait for.
function gateBlockedLine(item) {
  const { waiting, blockers } = gateBlockers(launchPlan, launchRecords, item.id, launchIndex);
  if (!waiting) return null;
  const line = el('p', 'lo-waits launch-blocked');
  line.append(el('strong', '', `Blocked by (${waiting} ${waiting === 1 ? 'step waits' : 'steps wait'}): `));
  blockers.forEach((b, i) => {
    const link = el('button', 'text-button lo-dep', `${shortStep(b.step)}${b.gate.id === item.id ? '' : ` (${b.gate.title})`} · ${byLabels[b.step.by]}${b.count > 1 ? ` · holds ${b.count}` : ''}`); link.type = 'button';
    link.addEventListener('click', () => openStep(b.key));
    if (i) line.append(document.createTextNode(' · '));
    line.append(link);
  });
  return line;
}
// Test session planner: one sitting's worth of the owner's open tests, in a sensible order.
let testSession = null;
try { testSession = cleanSession(JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'), launchPlan); } catch { testSession = null; }
const sessionDraft = { minutes: 30, have: new Set(testSession?.have || ['test-wallet']), mine: true };
let sessionStatus = '';
// How long each test really took, measured in finished sessions (whole minutes per step; this browser only).
let testTimings = {};
try { testTimings = cleanTimings(JSON.parse(localStorage.getItem(TIMING_KEY) || 'null'), launchPlan); } catch { testTimings = {}; }
function saveTestTimings() { try { if (Object.keys(testTimings).length) localStorage.setItem(TIMING_KEY, JSON.stringify(testTimings)); else localStorage.removeItem(TIMING_KEY); } catch { /* the times last until the page closes */ } }
// Keep the times of a session that ends (finished or stopped). Adding the same session twice changes nothing.
function archiveSessionTimes() {
  if (!testSession) return 0;
  const { log, added } = addTimings(testTimings, sessionTimings(testSession, launchPlan, launchRecords));
  if (added) { testTimings = log; saveTestTimings(); }
  return added;
}
function saveTestSession() { try { if (testSession) localStorage.setItem(SESSION_KEY, JSON.stringify(testSession)); else localStorage.removeItem(SESSION_KEY); } catch { sessionStatus = 'This browser blocked saving. The session lasts until you close the page.'; } }
function sessionNeeds(needs) {
  const wrap = el('span', 'ts-needs');
  for (const n of needs) wrap.append(el('span', 'ts-need', needShort[n]));
  return wrap;
}
async function copySession(text, done) {
  try { await navigator.clipboard.writeText(text); sessionStatus = done; }
  catch { sessionStatus = 'Copying was blocked by the browser. Use Copy test report further down instead.'; }
  renderTestSession();
}
function recordSessionStep(key, result) {
  const entry = launchIndex.get(key); if (!entry) return;
  const prev = launchRecords[key] || { result: '', note: '', at: 0 }, rec = launchRecords[key];
  const fresh = Boolean(rec?.result) && (rec.at || 0) >= (testSession?.started || 0);
  const next = { ...prev, result: fresh && rec.result === result ? '' : result, at: Date.now() };
  if (!next.result && !next.note) delete launchRecords[key]; else launchRecords[key] = next;
  saveLaunchRecords();
  const p = sessionProgress(testSession, launchPlan, launchRecords, measuredTimes(testTimings));
  sessionStatus = next.result ? `${resultLabels[next.result]}: ${shortStep(entry.step)}. ${p.complete ? 'Every test in this session is recorded.' : `${p.total - p.recorded} to go.`}` : `Result cleared: ${shortStep(entry.step)}.`;
  renderLaunch(); renderCryptoTests();
  const box = $('#test-session');
  (box?.querySelector('.ts-row.is-current .launch-result') || box?.querySelector('#ts-finish') || box?.querySelector(`[data-key="${CSS.escape(key)}"] .launch-result`))?.focus({ preventScroll: false });
}
function renderSessionPlanner(box) {
  box.append(el('div', 'lo-head'));
  box.firstChild.append(el('h3', '', 'Plan a test session'), el('p', 'hint', 'Say how long you have and what is at hand. FYNX picks your open tests that fit, failed ones first for a retest, in the order the checklist suggests (a passkey is added before you sign in with it). Times are estimates.'));
  const form = el('div', 'ts-form');
  const lenSet = el('fieldset', 'ts-set'); lenSet.append(el('legend', '', 'How long do you have?'));
  const chips = el('div', 'ts-chips');
  for (const m of LENGTHS) {
    const b = el('button', 'launch-chip', m < 60 ? `${m} min` : `${m / 60 === 1 ? '1 hour' : `${m / 60} hours`}`); b.type = 'button'; b.setAttribute('aria-pressed', String(sessionDraft.minutes === m));
    b.addEventListener('click', () => { sessionDraft.minutes = m; renderTestSession(); $('#test-session')?.querySelector('.ts-chips [aria-pressed="true"]')?.focus(); });
    chips.append(b);
  }
  lenSet.append(chips);
  const haveSet = el('fieldset', 'ts-set'); haveSet.append(el('legend', '', 'What do you have with you?'));
  const list = el('div', 'ts-have');
  for (const [n, label] of Object.entries(NEEDS)) {
    const l = el('label', 'ts-check'), c = el('input'); c.type = 'checkbox'; c.checked = sessionDraft.have.has(n); c.dataset.need = n;
    c.addEventListener('change', () => { if (c.checked) sessionDraft.have.add(n); else sessionDraft.have.delete(n); renderTestSession(); $('#test-session')?.querySelector(`[data-need="${n}"]`)?.focus(); });
    l.append(c, el('span', '', label)); list.append(l);
  }
  haveSet.append(list); form.append(lenSet, haveSet); box.append(form);
  const times = measuredTimes(testTimings), measuredCount = Object.keys(times).length, useMine = sessionDraft.mine && measuredCount > 0;
  if (measuredCount) {
    const l = el('label', 'ts-check ts-mine'), c = el('input'); c.type = 'checkbox'; c.checked = sessionDraft.mine; c.id = 'ts-use-mine';
    c.addEventListener('change', () => { sessionDraft.mine = c.checked; renderTestSession(); $('#ts-use-mine')?.focus(); });
    l.append(c, el('span', '', `Plan with my own times (${measuredCount} ${measuredCount === 1 ? 'test' : 'tests'} measured in earlier sessions; the others use the estimate)`)); box.append(l);
  }
  const planned = planSession(launchPlan, launchRecords, { minutes: sessionDraft.minutes, have: [...sessionDraft.have], times: useMine ? times : null });
  if (!planned.openTests) { box.append(el('p', 'muted', 'All your tests are recorded. Copy the test report below and share it so the checklist evidence can be updated.')); return; }
  const head = el('p', 'ts-total');
  head.append(el('strong', '', planned.steps.length ? `${planned.steps.length} ${planned.steps.length === 1 ? 'test' : 'tests'} · about ${planned.total} of ${planned.minutes} minutes` : 'Nothing fits this session yet'), el('span', 'muted', ` · ${planned.openTests} open ${planned.openTests === 1 ? 'test' : 'tests'} in all`));
  box.append(head);
  if (planned.steps.length) {
    const ol = el('ol', 'ts-plan');
    for (const s of planned.steps) {
      const li = el('li', `ts-plan-row${s.retest ? ' is-failed' : ''}`);
      const b = el('button', 'text-button lo-link'); b.type = 'button';
      b.append(el('span', 'lo-meta', `${s.retest ? 'Retest · ' : ''}${s.gate.title} · about ${s.minutes} min${s.measured ? ` (your time; estimate ${s.estimate})` : ''}`), el('span', 'lo-text', shortStep(s.step)));
      b.addEventListener('click', () => openStep(s.key));
      li.append(b); if (s.needs.length) li.append(sessionNeeds(s.needs)); ol.append(li);
    }
    box.append(ol);
  } else box.append(el('p', 'muted', planned.gear.length ? 'Your open tests need something you have not ticked above, or more time.' : 'Your open tests need more time than this, or wait on steps by others first.'));
  const out = [];
  if (planned.gear.length) out.push(['gear', `${planned.gear.length} need something you did not tick`, planned.gear.map(s => `${shortStep(s.step)} (needs ${s.missing.map(n => needShort[n]).join(', ')})`)]);
  if (planned.noTime.length) out.push(['time', `${planned.noTime.length} did not fit the time`, planned.noTime.map(s => `${shortStep(s.step)} (about ${s.minutes} min)`)]);
  if (planned.waiting.length) out.push(['waiting', `${planned.waiting.length} wait on another step first`, planned.waiting.map(s => `${shortStep(s.step)} (after: ${s.on.map(o => shortStep(o.step)).join('; ')})`)]);
  if (out.length) {
    const d = el('details', 'ts-out'); d.append(el('summary', '', `Left out: ${out.map(o => o[1]).join(' · ')}`));
    for (const [, title, rows] of out) { d.append(el('h4', '', title)); const ul = el('ul'); for (const r of rows) ul.append(el('li', '', r)); d.append(ul); }
    box.append(d);
  }
  if (planned.elsewhere) box.append(el('p', 'hint', `${planned.elsewhere} of your open steps are decisions, sign-offs or paperwork rather than tests. They are answered in the decision worksheet below or in the checklist.`));
  const actions = el('div', 'actions');
  const start = el('button', 'button', 'Start this session'); start.type = 'button'; start.id = 'ts-start'; start.disabled = !planned.steps.length;
  start.addEventListener('click', () => {
    testSession = startSession(planned, { minutes: sessionDraft.minutes, have: [...sessionDraft.have], mine: useMine }); saveTestSession();
    sessionStatus = `Session started: ${planned.steps.length} ${planned.steps.length === 1 ? 'test' : 'tests'}. Record each result here as you go.`;
    renderLaunch(); $('#test-session')?.querySelector('.ts-row.is-current .launch-result')?.focus();
  });
  const copy = el('button', 'button secondary', 'Copy plan'); copy.type = 'button'; copy.disabled = !planned.steps.length;
  copy.addEventListener('click', () => copySession(planMarkdown(planned, { have: [...sessionDraft.have] }), 'Plan copied. Paste it into your notes to keep beside you.'));
  actions.append(start, copy); box.append(actions);
  renderMeasuredTimes(box);
}
// What earlier sessions measured, and which estimates in the checklist are clearly off.
function renderMeasuredTimes(box) {
  const measured = Object.keys(testTimings).length;
  const d = el('details', 'ts-out ts-times'); d.id = 'ts-times';
  if (!measured) {
    d.append(el('summary', '', 'Your measured times'), el('p', 'hint', 'Not measured yet. During a session, FYNX times each test from one result to the next (a gap of more than three times the estimate counts as a break and is not timed). Finished sessions keep the times here, and later plans can use them. Times measured on another device come in with “Bring in results from another device”.'));
    box.append(d); return;
  }
  const fixes = estimateCorrections(launchPlan, testTimings), ratio = paceRatio(launchPlan, testTimings), times = measuredTimes(testTimings);
  d.append(el('summary', '', `Your measured times: ${measured} ${measured === 1 ? 'test' : 'tests'}${fixes.length ? ` · ${fixes.length} ${fixes.length === 1 ? 'estimate' : 'estimates'} to correct` : ''}`));
  if (ratio !== null) d.append(el('p', 'hint', ratio >= 1.1 ? `Your tests take about ${Math.round((ratio - 1) * 100)}% longer than the estimates.` : ratio <= 0.9 ? `Your tests take about ${Math.round((1 - ratio) * 100)}% less time than the estimates.` : 'Your tests take about as long as the estimates.'));
  d.append(el('p', 'hint', 'These times travel inside your test report (Copy test report or Download report), so your phone, iPad and computer can plan with the same times.'));
  const ul = el('ul', 'ts-times-list');
  for (const [key, { gate, step }] of launchIndex) {
    if (times[key] === undefined) continue;
    const fix = fixes.find(f => f.key === key), li = el('li', fix ? 'is-off' : '');
    li.append(el('span', '', `${shortStep(step)} (${gate.title})`), el('span', 'ts-times-num', `${times[key]} min · estimate ${step.minutes}${testTimings[key].length > 1 ? ` · ${testTimings[key].length} times` : ''}${fix ? ' · off' : ''}`));
    ul.append(li);
  }
  d.append(ul);
  const actions = el('div', 'actions');
  const copy = el('button', 'button secondary', 'Copy estimates to correct'); copy.type = 'button';
  copy.addEventListener('click', () => copySession(correctionsMarkdown(launchPlan, testTimings), fixes.length ? `Copied ${fixes.length} ${fixes.length === 1 ? 'estimate' : 'estimates'} to correct. Share the list so the checklist times can be updated.` : 'Copied: every measured test is close to its estimate.'));
  const forget = el('button', 'text-button', 'Forget measured times'); forget.type = 'button';
  forget.addEventListener('click', () => { if (!window.confirm('Forget every measured test time in this browser? Your test results are kept.')) return; testTimings = {}; saveTestTimings(); sessionStatus = 'Measured times forgotten. Results are kept.'; renderLaunch(); });
  actions.append(copy, forget); d.append(actions); box.append(d);
}
function renderSessionRun(box) {
  const p = sessionProgress(testSession, launchPlan, launchRecords, measuredTimes(testTimings)), timing = sessionTimings(testSession, launchPlan, launchRecords);
  const head = el('div', 'lo-head');
  head.append(el('h3', '', testSession.finished ? 'Test session finished' : 'Test session in progress'), el('p', 'hint', `Started ${new Date(testSession.started).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · planned ${testSession.minutes} minutes. Results are the same as the checklist below and stay in this browser. Add notes (browser, device, transaction ID) in the checklist with “Add a note”.`));
  box.append(head);
  box.append(progressBar(p.recorded, p.total, `${p.recorded} of ${p.total} tests recorded`));
  const line = el('p', 'ts-total');
  line.append(el('strong', '', `${p.recorded} of ${p.total} recorded`), el('span', 'muted', ` · ${p.passed} passed · ${p.failed} failed · ${p.skipped} not applicable${p.complete ? '' : ` · about ${p.minutesLeft} min left`}${timing.timed ? ` · took ${durationText(timing.actual)} so far (estimate ${durationText(timing.estimate)})` : ''}`));
  box.append(line);
  const ol = el('ol', 'ts-run');
  for (const r of p.rows) {
    const current = !testSession.finished && p.current?.key === r.key;
    const li = el('li', `ts-row${current ? ' is-current' : ''}${r.recorded ? ` is-${r.result}` : ''}`); li.dataset.key = r.key;
    const top = el('div', 'ts-row-top');
    const t = r.recorded ? timing.byKey[r.key] : null;
    top.append(el('span', 'lo-meta', `${current ? 'Now · ' : ''}${r.gate.title} · ${t ? (t.took === null ? `not timed (a break) · estimate ${r.estimate} min` : `took ${t.took} min · estimate ${r.estimate} min`) : `about ${r.minutes} min${r.minutes !== r.estimate ? ` (your time; estimate ${r.estimate})` : ''}`}`), el('span', 'launch-mark', r.recorded ? resultLabels[r.result] : current ? 'Up next' : 'To do'));
    li.append(top, el('p', 'launch-step-text', r.step.text));
    if (r.needs.length) li.append(sessionNeeds(r.needs));
    const controls = el('div', 'launch-step-controls');
    const group = el('div', 'launch-results'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', `Result: ${shortStep(r.step)}`);
    for (const result of RESULTS) {
      const b = el('button', `launch-result result-${result}`, resultLabels[result]); b.type = 'button';
      b.setAttribute('aria-pressed', String(r.recorded && r.result === result));
      b.addEventListener('click', () => recordSessionStep(r.key, result)); group.append(b);
    }
    controls.append(group);
    if (r.step.tab) {
      const go = el('button', 'text-button launch-go', `Open ${tabLabels[r.step.tab]} ↗`); go.type = 'button';
      go.addEventListener('click', () => { if (r.step.tab === 'public') window.open('./', '_blank', 'noopener'); else { selectTab(r.step.tab); window.scrollTo(0, 0); } });
      controls.append(go);
    }
    if (r.key === DRILL_STEP) { const go = el('button', 'text-button launch-go', 'Run it with the practice guide ↓'); go.type = 'button'; go.addEventListener('click', () => openDrill()); controls.append(go); }
    const note = el('button', 'text-button launch-go', launchRecords[r.key]?.note ? 'Edit note in the checklist ↓' : 'Add a note in the checklist ↓'); note.type = 'button';
    note.addEventListener('click', () => { openStep(r.key); document.querySelector(`#launch-checklist [data-step="${CSS.escape(r.key)}"] .launch-note`)?.focus({ preventScroll: true }); });
    controls.append(note); li.append(controls); ol.append(li);
  }
  box.append(ol);
  const actions = el('div', 'actions');
  if (!testSession.finished) {
    const finish = el('button', p.complete ? 'button' : 'button secondary', p.complete ? 'Finish session' : 'Finish early'); finish.type = 'button'; finish.id = 'ts-finish';
    finish.addEventListener('click', () => { testSession = { ...testSession, finished: Date.now() }; saveTestSession(); const kept = archiveSessionTimes(); sessionStatus = `Session finished: ${p.passed} passed, ${p.failed} failed, ${p.skipped} not applicable${p.total - p.recorded ? `, ${p.total - p.recorded} not recorded` : ''}.${kept ? ` Kept the times of ${kept} ${kept === 1 ? 'test' : 'tests'} for your next plans.` : ''}`; renderLaunch(); $('#ts-copy')?.focus(); });
    actions.append(finish);
  }
  const copy = el('button', testSession.finished ? 'button' : 'button secondary', 'Copy session results'); copy.type = 'button'; copy.id = 'ts-copy';
  copy.addEventListener('click', () => copySession(sessionSummary(testSession, launchPlan, launchRecords, { appendix: timingLines(sessionTimings(testSession, launchPlan, launchRecords)) }), 'Session results copied (results only, no notes). Share them, or the full test report, so the checklist evidence can be updated.'));
  const again = el('button', 'text-button', testSession.finished ? 'Plan another session' : 'Stop and plan again'); again.type = 'button';
  again.addEventListener('click', () => {
    if (!testSession.finished && p.recorded && !window.confirm('Stop this session? The results you recorded are kept.')) return;
    archiveSessionTimes();
    sessionDraft.minutes = testSession.minutes; sessionDraft.have = new Set(testSession.have); sessionDraft.mine = testSession.mine || sessionDraft.mine; testSession = null; saveTestSession();
    sessionStatus = 'Session closed. Your recorded results are kept.'; renderLaunch(); $('#ts-start')?.focus();
  });
  actions.append(copy, again); box.append(actions);
  if (testSession.finished && p.failed) box.append(el('p', 'hint', 'Failed tests come first in your next session, for a retest once the problem is fixed.'));
}
function renderTestSession() {
  const box = $('#test-session'); if (!box) return;
  const wasOpen = box.querySelector('.ts-out:not(.ts-times)')?.open, timesOpen = box.querySelector('#ts-times')?.open;
  box.replaceChildren();
  if (testSession) renderSessionRun(box); else renderSessionPlanner(box);
  const out = box.querySelector('.ts-out:not(.ts-times)'); if (out && wasOpen) out.open = true;
  const tbox = box.querySelector('#ts-times'); if (tbox && timesOpen) tbox.open = true;
  const status = el('p', 'status'); status.id = 'ts-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.textContent = sessionStatus; sessionStatus = '';
  box.append(status);
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
  const waits = state === 'done' ? [] : waitingOn(launchPlan, launchRecords, key, launchIndex);
  const mark = el('span', 'launch-mark', state === 'done' ? (step.done ? 'Done' : resultLabels[rec?.result] || 'Done') : state === 'failed' ? 'Failed' : waits.length ? 'Waiting' : step.by === 'you' ? 'To do' : 'Open');
  top.append(mark); li.append(top);
  if (waits.length) {
    const w = el('p', 'lo-waits launch-waits'); w.append(el('span', '', 'Best done after: '));
    waits.forEach(({ gate: g, step: s }, i) => {
      const k = stepKey(g.id, s.id), link = el('button', 'text-button lo-dep', `${shortStep(s)}${g.id === gate.id ? '' : ` (${g.title})`}`); link.type = 'button';
      link.addEventListener('click', () => openStep(k));
      if (i) w.append(document.createTextNode(' · '));
      w.append(link);
    });
    li.append(w);
  }
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
  renderLaunchOverview(); renderLaunchOrder(); renderTestSession(); renderLaunchFilters();
  const list = $('#launch-checklist'); list.replaceChildren();
  for (const item of launchPlan.items) {
    if (launchFilter !== 'all' && groupOf(item.status) !== launchFilter) continue;
    const p = gateProgress(item, launchRecords), blocked = gateBlockers(launchPlan, launchRecords, item.id, launchIndex);
    const details = el('details', `launch-item group-${groupOf(item.status)}`); details.id = `gate-${item.id}`; details.dataset.gate = item.id; details.open = open.has(item.id);
    const summary = el('summary'), title = el('strong', '', item.title), state = el('span', 'launch-state', statusLabels[item.status]);
    const meter = el('span', 'launch-meter'); meter.append(progressBar(p.done, p.total, `${p.done} of ${p.total} steps done`), el('span', '', `${p.done}/${p.total}${p.failed ? ` · ${p.failed} failed` : ''}${blocked.waiting ? ` · ${blocked.waiting} waiting` : ''}`));
    summary.append(title, state, meter); details.append(summary);
    for (const [label, text] of [['Current', item.current], ['To finish', item.next], ['Responsible', item.responsibility]]) {
      const line = el('p'), lead = el('strong', '', `${label}: `); line.append(lead, document.createTextNode(text)); details.append(line);
    }
    const blockedLine = gateBlockedLine(item); if (blockedLine) details.append(blockedLine);
    const steps = el('ol', 'launch-steps'); for (const step of item.steps || []) steps.append(stepRow(item, step));
    details.append(el('h3', 'launch-steps-h', 'Steps'), steps);
    const link = el('a', '', 'Evidence and context ↗'); link.href = `https://github.com/EA-LA/FYNX-Wallet/blob/main/${item.evidence}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
    details.append(link); list.append(details);
  }
  if (!list.children.length) list.append(el('p', 'muted', 'No gates in this view.'));
  if (focusStep) list.querySelector(`[data-step="${CSS.escape(focusStep)}"] [aria-pressed="true"], [data-step="${CSS.escape(focusStep)}"] .launch-note`)?.focus({ preventScroll: true });
  renderDecisions();
}
const launchReport = () => reportMarkdown(launchPlan, launchRecords, { browser: browserSummary(navigator.userAgent), appendix: [...decisionReportLines(decisionAnswers, decisionSavedTimes()), ...privacyReportLines(privacyLog), ...drillReportLines(drill), ...registerReportLines(pilotRegister), ...requestReportLines(outsideRequests), ...evidenceReportLines(outsideEvidence), ...timingReportLines(testTimings, launchPlan), ...accessReportLines(accessReview, accessToday())] });
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
  const dec = parseDecisions(text), decCount = Object.keys(dec.answers).length;
  const prIn = parsePrivacyReport(text), prCount = prIn.log.entries.length, prDeleted = prIn.log.deleted.length, drIn = parseDrillReport(text), drCount = drIn.runs.length;
  const rgIn = parseRegisterReport(text), rgCount = rgIn.register.entries.length;
  const rqIn = parseRequestReport(text), rqCount = Object.keys(rqIn.log.entries).length;
  const evIn = parseEvidenceReport(text), evCount = Object.keys(evIn.log.entries).length;
  const tmIn = parseTimingReport(text, launchPlan), tmCount = tmIn.count;
  const arIn = parseAccessReport(text, accessToday()), arCount = arIn.count;
  if (!count && !decCount && !prCount && !prDeleted && !drCount && !rgCount && !rqCount && !evCount && !tmCount && !arCount) { setText('#import-status', parsed.looksLikeReport ? 'This report has no recorded results to bring in.' : 'This does not look like a FYNX launch test report. Use Copy test report or Download report on your other device.'); return; }
  const m = mergeRecords(launchRecords, parsed.records), index = launchStepIndex();
  const dm = mergeDecisions(decisionAnswers, decisionSavedTimes(), dec.answers, dec.times);
  const pm = mergePrivacyLogs(privacyLog, prIn.log), drm = mergeDrills(drill, drIn.runs), rgm = mergeRegisters(pilotRegister, rgIn.register);
  const rqm = mergeRequests(outsideRequests, rqIn.log), evm = mergeEvidence(outsideEvidence, evIn.log), tmm = mergeTimings(testTimings, tmIn.log, launchPlan);
  const arm = mergeAccessReviews(accessReview, arIn.review, accessToday());
  pendingImport = { records: m.merged, decisions: dm, privacy: pm, drill: drm, register: rgm, requests: rqm, evidence: evm, timings: tmm, access: arm };
  const sum = guideEl('ul', 'launch-import-sum');
  for (const [cls, n, label] of [['is-add', m.added.length, 'new here'], ['is-update', m.updated.length, 'newer than this browser'], ['is-same', m.same.length, 'already here'], ['is-kept', m.kept.length, 'kept: this browser is newer']]) if (n) sum.append(guideEl('li', cls, `${n} ${label}`));
  if (parsed.refused) sum.append(guideEl('li', 'is-kept', `${parsed.refused} note${parsed.refused === 1 ? '' : 's'} left out: looked like a key`));
  if (parsed.unknown.length) sum.append(guideEl('li', 'is-kept', `${parsed.unknown.length} line${parsed.unknown.length === 1 ? '' : 's'} not matched to a current step`));
  if (count || sum.children.length) box.append(guideEl('h4', '', `${count} result${count === 1 ? '' : 's'} found in the report`), sum);
  const list = guideEl('ul', 'launch-import-list'), what = { added: 'New', updated: 'Newer', kept: 'Kept yours', same: 'Same' };
  for (const kind of ['added', 'updated', 'kept', 'same']) for (const key of m[kind]) {
    const hit = index.get(key), rec = parsed.records[key]; if (!hit) continue;
    const li = guideEl('li'), body = guideEl('div');
    body.append(guideEl('span', '', hit.step.text), guideEl('small', '', `${hit.gate.title} · ${rec.result ? resultLabels[rec.result] : 'Note only'}${rec.at ? ` · recorded ${new Date(rec.at).toLocaleString()}` : ''}${rec.note ? ` · Note: ${rec.note}` : ''}${kind === 'kept' ? ` · this browser has ${launchRecords[key]?.result ? resultLabels[launchRecords[key].result] : 'a note'} from later` : ''}`));
    li.append(guideEl('span', `import-mark import-${kind}`, what[kind]), body); list.append(li);
  }
  box.append(list);
  if (decCount) {
    const dsum = guideEl('ul', 'launch-import-sum');
    for (const [cls, n, label] of [['is-add', dm.added.length, 'new here'], ['is-update', dm.updated.length, 'saved later than this browser'], ['is-same', dm.same.length, 'already here'], ['is-kept', dm.kept.length, 'kept: this browser saved later']]) if (n) dsum.append(guideEl('li', cls, `${n} ${label}`));
    if (dec.refused) dsum.append(guideEl('li', 'is-kept', `${dec.refused} answer${dec.refused === 1 ? '' : 's'} left out: looked like a key`));
    box.append(guideEl('h4', '', `${decCount} decision${decCount === 1 ? '' : 's'} found in the report`), dsum);
    const dl = guideEl('ul', 'launch-import-list');
    for (const kind of ['added', 'updated', 'kept', 'same']) for (const key of dm[kind]) {
      const d = findDecision(key); if (!d) continue;
      const li = guideEl('li'), body = guideEl('div'), at = dec.times[key];
      body.append(guideEl('span', '', d.title), guideEl('small', '', `${answerText(d, dec.answers[key])}${at ? ` · saved ${new Date(at).toLocaleString()}` : ''}${kind === 'kept' ? ' · this browser’s answer is newer and stays' : ''}`));
      li.append(guideEl('span', `import-mark import-${kind}`, what[kind]), body); dl.append(li);
    }
    box.append(dl);
  }
  if (prCount || prDeleted) {
    const psum = guideEl('ul', 'launch-import-sum');
    for (const [cls, n, label] of [['is-add', pm.added.length, 'new here'], ['is-update', pm.updated.length, 'changed later than this browser'], ['is-same', pm.same.length, 'already here'], ['is-kept', pm.kept.length, 'kept: this browser changed it later'], ['is-update', pm.removed.length, 'deleted on the other device, will be deleted here'], ['is-same', pm.gone.length, 'already deleted here, not brought back'], ['is-kept', pm.keptDeleted.length, 'deleted on the other device but changed here later, kept']]) if (n) psum.append(guideEl('li', cls, `${n} ${label}`));
    if (prIn.unknown) psum.append(guideEl('li', 'is-kept', `${prIn.unknown} line${prIn.unknown === 1 ? '' : 's'} not understood`));
    box.append(guideEl('h4', '', prCount ? `${prCount} privacy request${prCount === 1 ? '' : 's'} found in the report${prDeleted ? ` (and ${prDeleted} deletion${prDeleted === 1 ? '' : 's'})` : ''}` : `${prDeleted} privacy request deletion${prDeleted === 1 ? '' : 's'} found in the report`), psum);
    const pl = guideEl('ul', 'launch-import-list'), byId = new Map(prIn.log.entries.map(e => [e.id, e]));
    for (const kind of ['added', 'updated', 'kept']) for (const id of pm[kind]) {
      const e = byId.get(id); if (!e) continue;
      const li = guideEl('li'), body = guideEl('div');
      body.append(guideEl('span', '', typeLabel(e.type)), guideEl('small', '', `Arrived ${e.received} · ${e.answered ? `answered ${e.answered} (${outcomeLabel(e.outcome)})` : `open, due ${requestState(e, localToday()).due}`}${kind === 'kept' ? ' · this browser’s version is newer and stays' : ''}`));
      li.append(guideEl('span', `import-mark import-${kind}`, what[kind]), body); pl.append(li);
    }
    for (const e of pm.removed) {
      const li = guideEl('li'), body = guideEl('div');
      body.append(guideEl('span', '', typeLabel(e.type)), guideEl('small', '', `Arrived ${e.received} · deleted on the other device${e.ref ? ` · this browser’s reference “${e.ref}” goes with it` : ''}`));
      li.append(guideEl('span', 'import-mark import-updated', 'Delete'), body); pl.append(li);
    }
    if (pl.children.length) box.append(pl);
    box.append(guideEl('p', 'hint', 'References and notes are not in the report; they stay on the device where you typed them. Deleting a request travels too: it is deleted here unless you changed it here after it was deleted.'));
  }
  if (drCount) {
    const newRuns = drm.added.length - drm.dropped, dsum = guideEl('ul', 'launch-import-sum');
    for (const [cls, n, label] of [['is-add', newRuns, `practice run${newRuns === 1 ? '' : 's'} new here`], ['is-update', drm.ticked, `follow-up${drm.ticked === 1 ? '' : 's'} ticked off on the other device`], ['is-same', drm.same.length, 'already here'], ['is-kept', drm.dropped, 'older than the five runs kept, left out']]) if (n) dsum.append(guideEl('li', cls, `${n} ${label}`));
    if (drIn.refused) dsum.append(guideEl('li', 'is-kept', `${drIn.refused} item${drIn.refused === 1 ? '' : 's'} left out: looked like a key`));
    box.append(guideEl('h4', '', `${drCount} practice run${drCount === 1 ? '' : 's'} found in the report`), dsum);
    const rl = guideEl('ul', 'launch-import-list');
    for (const run of drm.added) {
      if (!drm.drill.history.includes(run)) continue;
      const li = guideEl('li'), body = guideEl('div'), f = r => Object.values(r.answers).filter(a => a.followUp).length;
      body.append(guideEl('span', '', findScenario(run.scenario)?.title || 'Practice run'), guideEl('small', '', `Finished ${new Date(run.finishedAt).toLocaleString()} · ${run.people.length} people · ${f(run)} follow-up${f(run) === 1 ? '' : 's'}`));
      li.append(guideEl('span', 'import-mark import-added', 'New'), body); rl.append(li);
    }
    if (rl.children.length) box.append(rl);
  }
  if (rgCount) {
    const rsum = guideEl('ul', 'launch-import-sum');
    for (const [cls, n, label] of [['is-add', rgm.added.length, 'new here'], ['is-update', rgm.updated.length, 'marked later than this browser'], ['is-same', rgm.same.length, 'already here'], ['is-kept', rgm.kept.length, 'kept: this browser marked it later'], ['is-kept', rgm.dropped, 'older than the newest 300 kept, left out']]) if (n) rsum.append(guideEl('li', cls, `${n} ${label}`));
    if (rgIn.unknown) rsum.append(guideEl('li', 'is-kept', `${rgIn.unknown} line${rgIn.unknown === 1 ? '' : 's'} not understood`));
    box.append(guideEl('h4', '', `${rgCount} remembered pilot transfer${rgCount === 1 ? '' : 's'} found in the report`), rsum);
    const gl = guideEl('ul', 'launch-import-list'), shown = [...rgm.added.map(e => ['added', e]), ...rgm.updated.map(e => ['updated', e])];
    for (const [kind, e] of shown.slice(0, 20)) {
      const li = guideEl('li'), body = guideEl('div');
      body.append(guideEl('span', '', e.kind === 'page' ? `From FYNX: ${e.label}` : `Marked as mine: ${reasonLabel(e.reason)}`), guideEl('small', '', `${e.hash.slice(0, 10)}…${e.hash.slice(-6)} · ${registerNetwork(e.chainId)} · ${new Date(e.at).toLocaleString()}`));
      li.append(guideEl('span', `import-mark import-${kind}`, what[kind]), body); gl.append(li);
    }
    if (shown.length > 20) gl.append(guideEl('li', 'hint', `and ${shown.length - 20} more`));
    if (gl.children.length) box.append(gl);
    box.append(guideEl('p', 'hint', 'Only public transaction IDs travel; wallet addresses stay on each device. “Undo” on a mark and “Forget remembered transfers” do not travel: do them on each device.'));
  }
  if (rqCount) {
    const qsum = guideEl('ul', 'launch-import-sum');
    for (const [cls, n, label] of [['is-add', rqm.added.length, 'new here'], ['is-update', rqm.updated.length, 'changed later than this browser'], ['is-same', rqm.same.length, 'already here'], ['is-kept', rqm.kept.length, 'kept: this browser changed it later']]) if (n) qsum.append(guideEl('li', cls, `${n} ${label}`));
    if (rqIn.unknown) qsum.append(guideEl('li', 'is-kept', `${rqIn.unknown} line${rqIn.unknown === 1 ? '' : 's'} not understood`));
    box.append(guideEl('h4', '', `${rqCount} outside request date${rqCount === 1 ? '' : 's'} found in the report`), qsum);
    const ql = guideEl('ul', 'launch-import-list');
    for (const kind of ['added', 'updated', 'kept']) for (const id of rqm[kind]) {
      const e = rqIn.log.entries[id], [pid, key] = [id.slice(0, id.indexOf('|')), id.slice(id.indexOf('|') + 1)], hit = index.get(key);
      const li = guideEl('li'), body = guideEl('div');
      body.append(guideEl('span', '', `${PARTIES.find(p => p.id === pid)?.name || pid}: ${hit ? shortStep(hit.step) : key}`), guideEl('small', '', `${e.sent ? `Sent ${e.sent}${e.answered ? ` · answered ${e.answered}` : ' · no answer yet'}` : 'Dates cleared on the other device'}${kind === 'kept' ? ' · this browser’s dates are newer and stay' : ''}`));
      li.append(guideEl('span', `import-mark import-${kind}`, what[kind]), body); ql.append(li);
    }
    if (ql.children.length) box.append(ql);
  }
  if (evCount) {
    const esum = guideEl('ul', 'launch-import-sum');
    for (const [cls, n, label] of [['is-add', evm.added.length, 'new here'], ['is-update', evm.updated.length, 'changed later than this browser'], ['is-same', evm.same.length, 'already here'], ['is-kept', evm.kept.length, 'kept: this browser changed it later']]) if (n) esum.append(guideEl('li', cls, `${n} ${label}`));
    if (evIn.unknown) esum.append(guideEl('li', 'is-kept', `${evIn.unknown} line${evIn.unknown === 1 ? '' : 's'} not understood`));
    box.append(guideEl('h4', '', `Evidence ticks for ${evCount} outside request${evCount === 1 ? '' : 's'} found in the report`), esum);
    const el2 = guideEl('ul', 'launch-import-list');
    for (const kind of ['added', 'updated', 'kept']) for (const id of evm[kind]) {
      const e = evIn.log.entries[id], pid = id.slice(0, id.indexOf('|')), key = id.slice(id.indexOf('|') + 1), hit = index.get(key), st = evidenceState(id, e);
      const li = guideEl('li'), body = guideEl('div');
      body.append(guideEl('span', '', `${PARTIES.find(p => p.id === pid)?.name || pid}: ${hit ? shortStep(hit.step) : key}`), guideEl('small', '', `${st.count ? `${st.count} of ${st.total} pieces received` : 'Ticks cleared on the other device'}${kind === 'kept' ? ' · this browser’s ticks are newer and stay' : ''}`));
      li.append(guideEl('span', `import-mark import-${kind}`, what[kind]), body); el2.append(li);
    }
    if (el2.children.length) box.append(el2);
  }
  if (tmCount || tmIn.unknown || tmIn.leftOut) {
    const tsum = guideEl('ul', 'launch-import-sum');
    for (const [cls, n, label] of [['is-add', tmm.added, `measurement${tmm.added === 1 ? '' : 's'} new here`], ['is-same', tmm.same, 'already here'], ['is-kept', tmm.older, `older than the newest ${KEEP_TIMES} kept per test, left out`], ['is-kept', tmIn.leftOut, 'left out (repeats, or tests that are no longer timed)'], ['is-kept', tmIn.unknown, `line${tmIn.unknown === 1 ? '' : 's'} not understood`]]) if (n) tsum.append(guideEl('li', cls, `${n} ${label}`));
    box.append(guideEl('h4', '', `${tmCount} measured test time${tmCount === 1 ? '' : 's'} found in the report`), tsum);
    const tl = guideEl('ul', 'launch-import-list'), mineNow = measuredTimes(testTimings), after = measuredTimes(tmm.log);
    for (const key of tmm.tests.slice(0, 20)) {
      const hit = index.get(key); if (!hit) continue;
      const li = guideEl('li'), body = guideEl('div');
      body.append(guideEl('span', '', shortStep(hit.step)), guideEl('small', '', `${hit.gate.title} · your time ${mineNow[key] !== undefined && mineNow[key] !== after[key] ? `${mineNow[key]} → ${after[key]}` : after[key]} min · estimate ${hit.step.minutes} min`));
      li.append(guideEl('span', 'import-mark import-added', 'New'), body); tl.append(li);
    }
    if (tmm.tests.length > 20) tl.append(guideEl('li', 'hint', `and ${tmm.tests.length - 20} more`));
    if (tl.children.length) box.append(tl);
    box.append(guideEl('p', 'hint', 'Only the step, the minutes and when each result was recorded travel. “Forget measured times” does not travel: do it on each device.'));
  }
  if (arCount || arIn.unknown) {
    const asum = guideEl('ul', 'launch-import-sum');
    for (const [cls, n, label] of [['is-add', arm.added.length, 'new here'], ['is-update', arm.updated.length, 'changed later than this browser'], ['is-same', arm.same.length, 'already here'], ['is-kept', arm.kept.length, 'kept: this browser changed it later'], ['is-kept', arIn.unknown, `line${arIn.unknown === 1 ? '' : 's'} not understood`]]) if (n) asum.append(guideEl('li', cls, `${n} ${label}`));
    box.append(guideEl('h4', '', `${arCount} access review answer${arCount === 1 ? '' : 's'} found in the report`), asum);
    const al = guideEl('ul', 'launch-import-list'), states = accessSummary(arm.review, accessToday()).rows;
    for (const kind of ['added', 'updated', 'kept']) for (const id of arm[kind]) {
      const r = states.find(x => x.service.id === id), inc = arIn.review[id]; if (!r || !inc) continue;
      const li = guideEl('li'), body = guideEl('div');
      body.append(guideEl('span', '', r.service.name), guideEl('small', '', `${inc.unused ? 'Not used yet' : inc.reviewed ? `Reviewed ${inc.reviewed}` : 'Not reviewed'}${kind === 'kept' ? ' · this browser’s answers are newer and stay' : ''}`));
      li.append(guideEl('span', `import-mark import-${kind}`, what[kind]), body); al.append(li);
    }
    if (al.children.length) box.append(al);
  }
  const actions = guideEl('div', 'actions'), results = m.added.length + m.updated.length, decisions = dm.added.length + dm.updated.length;
  const requests = pm.added.length + pm.updated.length + pm.removed.length, logChanged = requests || pm.keptDeleted.length, runs = Math.max(0, drm.added.length - drm.dropped), ticks = drm.ticked, transfers = rgm.added.length + rgm.updated.length, asks = rqm.added.length + rqm.updated.length, evTicks = evm.added.length + evm.updated.length, timesIn = tmm.added, accessIn = arm.added.length + arm.updated.length, changes = results + decisions + requests + runs + ticks + transfers + asks + evTicks + timesIn + accessIn;
  const n = (k, word) => (k ? `${k} ${word}${k === 1 ? '' : 's'}` : '');
  const list3 = [n(results, 'result'), n(decisions, 'decision'), n(pm.added.length + pm.updated.length, 'privacy request'), n(pm.removed.length, 'privacy request deletion'), n(runs, 'practice run'), n(ticks, 'follow-up tick'), n(transfers, 'pilot transfer'), n(asks, 'outside request date'), n(evTicks, 'evidence list'), n(timesIn, 'measured test time'), n(accessIn, 'access review answer')].filter(Boolean);
  const parts = list3.length > 1 ? `${list3.slice(0, -1).join(', ')} and ${list3[list3.length - 1]}` : list3[0] || '';
  const apply = guideEl('button', 'button', changes ? `Add ${parts} to this browser` : 'Nothing new to add'); apply.type = 'button'; apply.id = 'import-apply'; apply.disabled = !changes;
  apply.addEventListener('click', () => {
    if (!pendingImport) return;
    const { records, decisions: d, privacy: pmi, drill: dri, register: rgi, requests: rqi, evidence: evi, timings: tmi, access: ari } = pendingImport;
    launchRecords = cleanRecords(records, launchPlan); saveLaunchRecords();
    if (decisions) {
      for (const key of [...d.added, ...d.updated]) discardDrafts.add(key);
      decisionAnswers = cleanAnswers(d.answers); decisionTimes = cleanTimes(d.times, decisionAnswers); saveDecisionAnswers();
    }
    if (logChanged) { privacyLog = pmi.log; savePrivacyLog(); renderPrivacyLog(); }
    if (runs || ticks) { drill = dri.drill; saveDrill(); }
    if (transfers) { pilotRegister = rgi.register; savePilotRegister(); renderReconcile(); }
    if (asks) { outsideRequests = rqi.log; saveOutsideRequests(); }
    if (evTicks) { outsideEvidence = evi.log; saveOutsideEvidence(); }
    if (timesIn) { testTimings = tmi.log; saveTestTimings(); }
    if (accessIn) { accessReview = ari.review; saveAccessReview(); renderAccessTabBadge(); renderSecurity(); }
    clearReportImport(); renderLaunch(); renderCryptoTests(); renderSecurityTests(); renderWaitlistTests();
    setText('#import-status', `${parts} added. Progress, next steps, the decision worksheet, the privacy request log, the practice runs, the pilot reconciliation, the outside hand-off dates and evidence ticks, your measured test times, the access review and your test report now include them.`);
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
let decisionAnswers = {}, decisionTimes = {};
try { decisionAnswers = cleanAnswers(JSON.parse(localStorage.getItem(DECISIONS_KEY) || '{}')); } catch { decisionAnswers = {}; }
try { decisionTimes = cleanTimes(JSON.parse(localStorage.getItem(DECISION_TIMES_KEY) || '{}'), decisionAnswers); } catch { decisionTimes = {}; }
function saveDecisionAnswers() {
  decisionTimes = cleanTimes(decisionTimes, decisionAnswers);
  try { localStorage.setItem(DECISIONS_KEY, JSON.stringify(decisionAnswers)); localStorage.setItem(DECISION_TIMES_KEY, JSON.stringify(decisionTimes)); return true; } catch { setText('#ld-status', 'This browser blocked saving. Answers last until you close the page.'); return false; }
}
// When each answer was saved (older answers fall back to the time their step was recorded), so imports keep the latest.
const decisionSavedTimes = () => Object.fromEntries(Object.keys(decisionAnswers).map(key => [key, decisionTimes[key] || launchRecords[key]?.at || 0]));
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
  const savedAt = Date.now();
  decisionAnswers[key] = out; decisionTimes[key] = savedAt; saveDecisionAnswers();
  const issues = problems(decision, out), gate = launchPlan.items.find(g => g.id === decision.gate);
  const prev = launchRecords[key] || { result: '', note: '', at: 0 };
  if (!issues.length) launchRecords[key] = { result: 'pass', note: decisionNote(decision, out), at: savedAt };
  else if (prev.result === 'pass' || prev.result === 'skip') launchRecords[key] = { ...prev, result: '', at: savedAt };
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
  decisionAnswers = {}; decisionTimes = {}; for (const d of DECISIONS) discardDrafts.add(decisionKey(d)); try { localStorage.removeItem(DECISIONS_KEY); localStorage.removeItem(DECISION_TIMES_KEY); } catch { /* ignore */ }
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
      setText('#dr-status', `${stage.title}: ${result === 'gap' ? 'gap noted' : 'handled'}.`);
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
  renderFollowUps();
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
// Follow-ups from finished runs as a to-do list. Ticking one off is saved with the run, in this browser only.
function renderFollowUps() {
  const box = document.getElementById('dr-followups'); if (!box) return;
  const items = followUpList(drill), p = followUpProgress(drill), count = $('#dr-follow-count');
  count.textContent = p.total ? (p.done === p.total ? `All ${p.total} done` : `${p.done} of ${p.total} done`) : 'None yet';
  count.className = `launch-mark ${p.total && p.done === p.total ? 'is-done' : p.total ? 'is-open' : ''}`;
  box.replaceChildren();
  if (!items.length) { box.append(el('p', 'muted', 'No follow-ups yet. When a stage turns up a gap, the follow-up you write appears here after the run is finished.')); return; }
  const ul = el('ul', 'dr-todo');
  items.forEach(item => {
    const id = `dr-todo-${item.runAt}-${item.stage.id}`, li = el('li', item.doneAt ? 'is-done' : '');
    const input = el('input'); input.type = 'checkbox'; input.id = id; input.checked = Boolean(item.doneAt);
    const lab = el('label'); lab.htmlFor = id;
    lab.append(el('span', 'dr-todo-text', item.text), el('small', '', `${item.stage.title} · ${item.scenario?.title || 'Practice run'} · ${new Date(item.runAt).toLocaleDateString()}${item.doneAt ? ` · done ${new Date(item.doneAt).toLocaleDateString()}` : ''}`));
    input.addEventListener('change', () => {
      drill = setFollowUpDone(drill, item.runAt, item.stage.id, input.checked ? Date.now() : 0); saveDrill(); renderFollowUps();
      document.getElementById(id)?.focus({ preventScroll: true });
      const np = followUpProgress(drill);
      setText('#dr-status', `${input.checked ? 'Marked done' : 'Opened again'}: ${item.text}. ${np.done} of ${np.total} follow-ups done.`);
    });
    li.append(input, lab); ul.append(li);
  });
  const actions = el('div', 'actions'), copy = el('button', 'button secondary', 'Copy follow-up list'); copy.type = 'button';
  copy.addEventListener('click', () => copyDrill(followUpText(launchPlan, drill), 'Follow-up list copied. Share it with your team.'));
  actions.append(copy); box.append(ul, actions);
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
