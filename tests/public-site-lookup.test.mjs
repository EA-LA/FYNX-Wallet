import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public-site/app.js', import.meta.url), 'utf8');

function load(hash) {
  const app = { innerHTML: '' };
  const context = {
    Object, Map, Set, BigInt, location: { hash, href: `https://example.test/${hash}` },
    window: { addEventListener() {}, scrollTo() {} }, requestAnimationFrame() {},
    document: { title: '', addEventListener() {}, getElementById: () => null, querySelector: s => (s === '#app' ? app : null), querySelectorAll: () => [] },
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/^import[^\n]+\n/, '').replace('connectFirebase();', '')
    + '\nthis.lookupTarget=lookupTarget;this.lookupResultHtml=lookupResultHtml;this.convertAmount=convertAmount;this.feeEstimate=feeEstimate;this.parseAmount=parseAmount;this.formatUnits=formatUnits;this.starters=starters;', context);
  return { context, app };
}

test('networks page has the lookup and unit tools with deep links', () => {
  for (const hash of ['#networks', '#networks/lookup', '#networks/units']) {
    const { app, context } = load(hash);
    assert.equal(context.document.title, 'Networks · FYNX Wallet', hash);
    assert.match(app.innerHTML, /id="net-lookup"/);
    assert.match(app.innerHTML, /id="lookup-input"/);
    assert.match(app.innerHTML, /id="net-units"/);
    assert.match(app.innerHTML, /id="units-amount"/);
    assert.match(app.innerHTML, /not a live fee/);
    assert.match(app.innerHTML, /href="#learn\/gwei"/);
  }
});

test('lookup builds explorer links for each supported format', () => {
  const { context } = load('#networks');
  const t = v => context.lookupTarget(v);
  assert.equal(t(''), null);
  const addr = t('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
  assert.equal(addr.type, 'Address');
  assert.deepEqual(Array.from(addr.links, l => l[1]), [
    'https://etherscan.io/address/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    'https://basescan.org/address/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    'https://sepolia.etherscan.io/address/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    'https://sepolia.basescan.org/address/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  ]);
  const bad = t('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96046'.replace('dA6', 'Da6'));
  assert.equal(bad.kind, 'danger');
  assert.equal(bad.links.length, 0);
  const tx = t(`0x${'ab'.repeat(32)}`);
  assert.equal(tx.type, 'Transaction ID');
  assert.equal(tx.secret, true);
  assert.equal(tx.links[0][1], `https://etherscan.io/tx/0x${'ab'.repeat(32)}`);
  const btcTx = t('f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16');
  assert.equal(btcTx.links[0][1], 'https://mempool.space/tx/f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16');
  assert.equal(btcTx.secret, true);
  assert.deepEqual(Array.from(t('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq').links, l => l[1]), ['https://mempool.space/address/bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq']);
  assert.ok(t('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx').links.every(l => /testnet/.test(l[1])));
  assert.equal(t('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2').links.length, 2);
  assert.match(t('So11111111111111111111111111111111111111112').links[1][1], /\?cluster=devnet$/);
  const sig = t('5'.repeat(1) + 'h'.repeat(87));
  assert.equal(sig.secret, true);
  assert.match(sig.links[0][1], /^https:\/\/explorer\.solana\.com\/tx\//);
  assert.match(t('Vitalik.eth').links[0][1], /^https:\/\/app\.ens\.domains\/vitalik\.eth$/);
  assert.match(t('0x1234').title, /Incomplete/);
  assert.match(t('hello!').title, /Not a recognised/);
});

test('lookup refuses secrets and hides links for key-like IDs until confirmed', () => {
  const { context } = load('#networks');
  const phrase = context.lookupTarget('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
  assert.equal(phrase.kind, 'danger');
  assert.equal(phrase.clear, true);
  assert.equal(phrase.links.length, 0);
  const wif = context.lookupTarget('5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ');
  assert.equal(wif.kind, 'danger');
  assert.equal(wif.clear, true);
  assert.equal(context.lookupTarget(`xpub${'a'.repeat(107)}`).links.length, 0);
  const tx = context.lookupTarget(`0x${'ab'.repeat(32)}`);
  const hidden = context.lookupResultHtml(tx, false);
  assert.doesNotMatch(hidden, /etherscan/);
  assert.match(hidden, /id="lookup-confirm"/);
  const shown = context.lookupResultHtml(tx, true);
  assert.match(shown, /href="https:\/\/etherscan\.io\/tx\//);
  assert.match(shown, /rel="noopener noreferrer"/);
  assert.doesNotMatch(context.lookupResultHtml(context.lookupTarget('<img src=x>.eth'), true), /<img/);
});

test('unit converter is exact and rejects impossible amounts', () => {
  const { context } = load('#networks');
  const rows = r => JSON.parse(JSON.stringify(Object.fromEntries(r.rows)));
  assert.deepEqual(rows(context.convertAmount('ETH', '1', 'ETH')), { ETH: '1', gwei: '1,000,000,000', wei: '1,000,000,000,000,000,000' });
  assert.deepEqual(rows(context.convertAmount('ETH', '21000', 'gwei')), { ETH: '0.000021', gwei: '21,000', wei: '21,000,000,000,000' });
  assert.deepEqual(rows(context.convertAmount('USDC', '1,234.5', 'USDC')), { USDC: '1,234.5', 'base units': '1,234,500,000' });
  assert.deepEqual(rows(context.convertAmount('BTC', '0,5', 'BTC')), { BTC: '0.5', sats: '50,000,000' });
  assert.deepEqual(rows(context.convertAmount('SOL', '1', 'lamports')), { SOL: '0.000000001', lamports: '1' });
  assert.equal(rows(context.convertAmount('ETH', '0.1', 'ETH')).wei, '100,000,000,000,000,000');
  assert.match(context.convertAmount('USDC', '0.0000001', 'USDC').error, /at most 6 decimal/);
  assert.match(context.convertAmount('ETH', '1.5', 'wei').error, /cannot be split/);
  assert.match(context.convertAmount('ETH', '-1', 'ETH').error, /negative/);
  assert.match(context.convertAmount('ETH', '1e5', 'ETH').error, /numbers only/);
  assert.equal(context.convertAmount('ETH', '', 'ETH').empty, true);
});

test('fee arithmetic multiplies gas by gas price exactly', () => {
  const { context } = load('#networks');
  const f = context.feeEstimate('21000', '2');
  assert.equal(f.eth, '0.000042');
  assert.equal(f.gwei, '42,000');
  assert.equal(context.feeEstimate('21,000', '0.5').eth, '0.0000105');
  assert.match(context.feeEstimate('21000', '').error, /gas price/);
  assert.match(context.feeEstimate('1.5', '2').error, /whole number/);
});

test('homepage Start here row includes the new lookup and family sheet tools', () => {
  const { app, context } = load('#home');
  assert.equal(context.starters.length, 6);
  assert.match(app.innerHTML, /href="#networks\/lookup"/);
  assert.match(app.innerHTML, /href="#security\/sheet"/);
});

test('lookup accepts explorer links and puts their network first', () => {
  const { context } = load('#networks');
  const t = v => context.lookupTarget(v);
  const tx = `0x${'ab'.repeat(32)}`;
  const base = t(`https://basescan.org/tx/${tx}`);
  assert.equal(base.kind, 'ok');
  assert.equal(base.found, tx);
  assert.equal(base.secret, false);
  assert.equal(base.links[0][1], `https://basescan.org/tx/${tx}`);
  assert.equal(base.links.length, 4);
  assert.match(base.title, /Base explorer link/);
  const sep = t(`sepolia.etherscan.io/address/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045#tokentxns`);
  assert.equal(sep.links[0][0], 'Ethereum Sepolia (test)');
  const btc = t('https://mempool.space/testnet4/tx/f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16');
  assert.equal(btc.links[0][0], 'Bitcoin testnet4 (test)');
  assert.equal(t('https://blockstream.info/address/bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq').links[0][0], 'Bitcoin');
  assert.equal(t('https://explorer.solana.com/address/So11111111111111111111111111111111111111112?cluster=devnet').links[0][0], 'Solana devnet (test)');
  assert.equal(t('https://solscan.io/account/So11111111111111111111111111111111111111112').links[0][0], 'Solana');
  const html = context.lookupResultHtml(base, false);
  assert.match(html, /Found in the link/);
  assert.match(html, /href="https:\/\/basescan\.org\/tx\//);
});

test('lookup warns on look-alike, empty and mismatched explorer links', () => {
  const { context } = load('#networks');
  const t = v => context.lookupTarget(v);
  const fake = t(`https://etherscan.io.verify-wallet.com/tx/0x${'ab'.repeat(32)}`);
  assert.equal(fake.kind, 'warn');
  assert.equal(fake.links.length, 0);
  assert.match(fake.body, /look-alike/);
  assert.equal(t('https://etherscan.io/').links.length, 0);
  assert.match(t('https://etherscan.io/gastracker').title, /no transaction or address/);
  assert.match(t('https://etherscan.io/address/bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq').title, /do not match/);
  assert.equal(t('https://etherscan.io/tx/0x12').kind, 'warn');
  assert.equal(t('https://etherscan.io/tx/%E0%A4%A').kind, 'warn');
  assert.equal(t('vitalik.eth').type, 'Name');
});

test('networks and security pages have an "On this page" row with deep links', () => {
  for (const [hash, ids] of [['#networks', ['plan', 'check', 'lookup', 'units']], ['#security', ['scam', 'approve', 'backup', 'sheet']]]) {
    const { app } = load(hash);
    assert.match(app.innerHTML, /aria-label="On this page"/);
    for (const id of ids) assert.match(app.innerHTML, new RegExp(`href="${hash}/${id}"`));
  }
});
