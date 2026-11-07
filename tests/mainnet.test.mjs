import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Wallet, Interface } from 'ethers';
import { AssetConnection, ERC20, ROUTER } from '../wallet-src/asset-client.js';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';
import { cleanMainnetRequest, readMainnet, sendLimit, MAINNET_CAPS, TEST_LIMITS, CONFIRM_PHRASE, OFF } from '../firebase-wallet/functions/mainnet.js';
import { setMainnetPolicy, mainnetPolicy, canTransact } from '../wallet-src/mainnet-policy.js';
const signer=Wallet.createRandom(), other=Wallet.createRandom().address;
const Q=new Interface(['function quoteExactInputSingle((address,address,uint256,uint24,uint160)) returns(uint256,uint160,uint32,uint256)']);
const P=new Interface(['function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)']);
const F=new Interface(['function getPool(address,address,uint24) view returns(address)']);
function fixture(chain=84532){
 const events=new Map(), calls=[];
 const p={chain,account:signer.address,allowance:0n,tokens:100000000n,eth:10n**18n,decimals:6,output:2490000n,tokenOK:true,noLiquidity:false,reject:false,
 on:(e,fn)=>events.set(e,fn),removeListener:e=>events.delete(e),emit:e=>events.get(e)?.(),calls,
 request:async({method,params=[]})=>{
 calls.push({method,params}); const n=NETWORKS[p.chain];
 if(method==='eth_chainId')return n.hex;
 if(['eth_accounts','eth_requestAccounts'].includes(method))return[p.account];
 if(method==='eth_blockNumber')return'0x100';
 if(method==='eth_getBalance')return'0x'+p.eth.toString(16);
 if(method==='eth_gasPrice')return'0x3b9aca00';
 if(method==='eth_estimateGas')return'0xc350';
 if(method==='eth_getCode')return params[0].toLowerCase()===other.toLowerCase()?'0x':'0x6000';
 if(method==='eth_sendTransaction'){if(p.reject)throw Object.assign(Error('rejected'),{code:4001});return'0x'+'1'.repeat(64)}
 if(method==='eth_call'){
  const tx=params[0];
  if(tx.to.toLowerCase()===n.usdc.toLowerCase()){
   const parsed=ERC20.parseTransaction(tx);
   const value={decimals:p.decimals,balanceOf:p.tokens,allowance:p.allowance,transfer:p.tokenOK,approve:p.tokenOK}[parsed.name];
   return ERC20.encodeFunctionResult(parsed.name,[value]);
  }
  if(tx.to.toLowerCase()===n.factory?.toLowerCase())return F.encodeFunctionResult('getPool',[other]);
  if(tx.to.toLowerCase()===n.quoter?.toLowerCase()){if(p.noLiquidity)throw Error('no pool');return Q.encodeFunctionResult('quoteExactInputSingle',[p.output,20000n*(1n<<96n),0,80000])}
  if(tx.to.toLowerCase()===other.toLowerCase())return P.encodeFunctionResult('slot0',[p.chain===8453?(1n<<96n)/20000n:20000n*(1n<<96n),0,0,0,0,0,true]);
  if(tx.to.toLowerCase()===n.router?.toLowerCase())return ROUTER.encodeFunctionResult('multicall',[[]]);
 }
 throw Error('Unexpected '+method);
 }};
 return {p,client:new AssetConnection(p,()=>{},chain)};
}

// Plain ETH transfers estimate at 21,000 gas.
function ethFixture(chain) { const f = fixture(chain), inner = f.p.request; f.p.request = async a => a.method === 'eth_estimateGas' && !a.params?.[0]?.data ? '0x5208' : inner(a); return f; }
const on = { enabled: true, ETH: '0.02', USDC: '50', confirm: CONFIRM_PHRASE };

test('turning on needs the typed phrase and limits within the pilot ceiling', () => {
  assert.deepEqual(cleanMainnetRequest({ enabled: false, ETH: '5' }), { enabled: false, ETH: null, USDC: null });
  assert.deepEqual(cleanMainnetRequest(on), { enabled: true, ETH: '0.02', USDC: '50' });
  assert.deepEqual(cleanMainnetRequest({ ...on, ETH: '0.0200', USDC: '50.0', confirm: `  ${CONFIRM_PHRASE} ` }), { enabled: true, ETH: '0.02', USDC: '50' });
  assert.equal(cleanMainnetRequest({ ...on, ETH: MAINNET_CAPS.ETH, USDC: MAINNET_CAPS.USDC }).ETH, '0.1');
  for (const bad of [{}, { enabled: 'yes' }, { ...on, confirm: 'turn on real money' }, { ...on, confirm: '' }, { ...on, ETH: '0.11' }, { ...on, USDC: '250.000001' }, { ...on, ETH: '0' }, { ...on, ETH: '-1' }, { ...on, ETH: '1e-2' }, { ...on, USDC: '' }, { ...on, ETH: '0.1234567890123456789' }])
    assert.throws(() => cleanMainnetRequest(bad), undefined, JSON.stringify(bad));
});

test('stored settings are read defensively: anything odd means off', () => {
  for (const raw of [null, undefined, {}, { enabled: 'true', ETH: '0.01', USDC: '1' }, { enabled: true, ETH: '5', USDC: '1' }, { enabled: true, ETH: '0.01' }]) assert.equal(readMainnet(raw), OFF);
  assert.equal(readMainnet({ enabled: true, ETH: '0.01', USDC: '10', updatedAt: '2026-11-07T00:00:00Z' }).USDC, '10');
  const base = NETWORKS[8453], test = NETWORKS[84532];
  assert.equal(sendLimit(test, 'ETH', null), TEST_LIMITS.ETH); assert.equal(sendLimit(test, 'USDC', null), TEST_LIMITS.USDC);
  assert.equal(sendLimit(base, 'ETH', null), null); assert.equal(sendLimit(base, 'ETH', on), '0.02'); assert.equal(sendLimit(base, 'DAI', on), null);
  assert.equal(base.transactionsEnabled, false, 'the network table itself never enables mainnet');
});

test('off by default: nothing on Base can be prepared or sent', async () => {
  setMainnetPolicy(null);
  const { p, client } = ethFixture(8453); await client.connect();
  assert.equal(canTransact(NETWORKS[8453]), false);
  await assert.rejects(client.prepareTransfer(other, '0.001'), /Mainnet \(real-money\) sending is off/);
  await assert.rejects(client.prepareTokenTransfer(other, '1'), /Mainnet/);
  assert.equal(p.calls.some(c => c.method === 'eth_sendTransaction'), false);
});

test('on with limits: Base transfers up to the limit, above it refused, swaps stay off, turning off stops a reviewed transfer', async () => {
  setMainnetPolicy(cleanMainnetRequest(on));
  assert.equal(mainnetPolicy().ETH, '0.02');
  const { p, client } = ethFixture(8453); await client.connect();
  const review = await client.prepareTransfer(other, '0.02');
  assert.equal(review.tx.chainId, NETWORKS[8453].hex); assert.equal(review.amount, '0.02');
  await assert.rejects(client.prepareTransfer(other, '0.021'), /up to 0\.02 ETH/);
  const usdc = await client.prepareTokenTransfer(other, '50'); assert.equal(usdc.kind, 'token-transfer');
  await assert.rejects(client.prepareTokenTransfer(other, '50.01'), /real-money limit is 50 USDC/);
  const quote = await client.quoteSwap('ETH', '0.001');
  await assert.rejects(client.prepareSwap(quote), /Swaps with real money stay off/);
  const again = await client.prepareTransfer(other, '0.01');
  setMainnetPolicy({ enabled: false });
  await assert.rejects(client.sendTransfer(again), /Mainnet/);
  assert.equal(p.calls.some(c => c.method === 'eth_sendTransaction'), false);
  // Test networks keep their own small limits whatever the mainnet setting.
  setMainnetPolicy(cleanMainnetRequest({ ...on, ETH: '0.1' }));
  const t = ethFixture(84532); await t.client.connect();
  await assert.rejects(t.client.prepareTransfer(other, '0.02'), /up to 0\.01 test ETH/);
  setMainnetPolicy(null);
});

test('server: the switch needs a fresh sign-in, is audited and reaches the session and services check', async () => {
  const src = await readFile(new URL('../firebase-wallet/functions/index.js', import.meta.url), 'utf8');
  assert.match(src, /const fresh = \[[^\]]*'mainnet-settings'/);
  const block = src.slice(src.indexOf("case 'mainnet-settings'"), src.indexOf("case 'dashboard'"));
  assert.match(block, /cleanMainnetRequest\(input\)/); assert.match(block, /audit\(db, user\.uid, setting\.enabled \? 'mainnet\.on' : 'mainnet\.off'\)/);
  assert.ok(src.indexOf("case 'mainnet-settings'") > src.indexOf('await ownerGuard('));
  assert.match(src, /mainnet: readMainnet\(wallet\.data\(\)\?\.mainnet\)/);
  assert.match(src, /mainnet: readMainnet\(\(await profile\.get\(\)\)\.data\(\)\?\.mainnet\)/);
  const app = await readFile(new URL('../wallet-src/app.js', import.meta.url), 'utf8');
  assert.match(app, /clearServices\(\); clearPortfolio\(\); clearMainnet\(\);/, 'sign-out turns the local policy off');
});
