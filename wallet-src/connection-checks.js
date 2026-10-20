export async function checkConnections({ call, wallet }) {
  // The real session handler verifies owner identity/App Check and reads Firestore.
  const session = await call({ action: 'session' });
  if (session?.ok !== true || session.role !== 'owner' || !Array.isArray(session.passkeys)) throw new Error('The owner backend did not confirm the connection.');
  const results = [
    { label: 'Owner authorization and app verification', state: 'passed', detail: 'Confirmed by the owner backend.' },
    { label: 'Private database connection', state: 'passed', detail: 'The backend read your workspace records successfully.' },
  ];
  if (!wallet?.address) results.push({ label: 'Connected wallet', state: 'untested', detail: 'Connect and verify a wallet in Crypto tools to check its network.' });
  else {
    try { await wallet.assertCurrent(); results.push({ label: 'Connected wallet network', state: 'passed', detail: `The current account is connected on ${wallet.network?.name || 'the selected test network'}. This check does not test signing or transfers.` }); }
    catch { results.push({ label: 'Connected wallet network', state: 'failed', detail: 'The wallet changed, disconnected or is on another network. Reconnect on the selected network.' }); }
  }
  return results;
}
