import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, Interface } from 'ethers';
import { AssetConnection, ERC20, ROUTER, receiveURI } from '../wallet-src/asset-client.js';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';
import { createWalletChallenge, verifyWalletChallenge } from '../firebase-wallet/functions/core.js';
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
test('Canonical assets have network-specific receive QR URIs; mainnet remains read-only',async()=>{
 const {p,client}=fixture(8453);await client.connect();assert.equal(await client.tokenBalance(),'100.0');
 assert.match(receiveURI(NETWORKS[84532],signer.address,'USDC'), /@84532\/transfer\?address=/);
 assert.match(receiveURI(NETWORKS[8453],signer.address), /@8453$/);
 await assert.rejects(client.prepareTransfer(other,'0.001'),/Mainnet/);
 await assert.rejects(client.prepareTokenTransfer(other,'1'),/Mainnet/);
 const quote=await client.quoteSwap('ETH','0.001');await assert.rejects(client.prepareSwap(quote),/Mainnet/);await assert.rejects(client.prepareRevoke(),/Mainnet/);
 assert.equal(p.calls.some(c=>c.method==='eth_sendTransaction'),false);
});
test('ERC20 transfers validate decimals, exact units, simulation, balance and review identity',async()=>{
 const {p,client}=fixture();await client.connect();
 for(const value of ['0','26','1.0000001','1e-3','-1'])await assert.rejects(client.prepareTokenTransfer(other,value));
 p.decimals=18;await assert.rejects(client.prepareTokenTransfer(other,'1'),/decimals/);p.decimals=6;
 p.tokenOK=false;await assert.rejects(client.prepareTokenTransfer(other,'1'),/simulation/);p.tokenOK=true;
 p.tokens=1n;await assert.rejects(client.prepareTokenTransfer(other,'1'),/Not enough/);p.tokens=100000000n;
 const r=await client.prepareTokenTransfer(other,'1.234567'),parsed=ERC20.parseTransaction(r.tx);
 assert.equal(parsed.name,'transfer');assert.equal(parsed.args[0],other);assert.equal(parsed.args[1],1234567n);
 await assert.rejects(client.sendAction({...r}));
 await client.sendAction(r);await assert.rejects(client.sendAction(r));
 assert.equal(p.calls.filter(c=>c.method==='eth_sendTransaction').length,1);
});
test('Swap calldata pins router, recipient, amount, slippage and deadline; illiquid/unsafe quotes fail',async()=>{
 const {p,client}=fixture();await client.connect();
 await assert.rejects(client.quoteSwap('ETH','0.001',200));
 p.noLiquidity=true;await assert.rejects(client.quoteSwap('ETH','0.001'),/No liquid route/);p.noLiquidity=false;
 p.output=100n;await assert.rejects(client.quoteSwap('ETH','0.001'),/No liquid route/);p.output=2490000n;
 const q=await client.quoteSwap('ETH','0.001',50),r=await client.prepareSwap(q);
 const outer=ROUTER.parseTransaction(r.tx),inner=ROUTER.parseTransaction({data:outer.args[1][0]});
 assert.equal(r.tx.to,NETWORKS[84532].router);assert.equal(outer.args[0],BigInt(Math.floor(q.expiresAt/1000)));
 assert.equal(inner.args[0].recipient,signer.address);assert.equal(inner.args[0].amountIn,1000000000000000n);assert.equal(inner.args[0].amountOutMinimum,2477550n);
 assert.equal(BigInt(r.tx.value),1000000000000000n);
 p.reject=true;await assert.rejects(client.sendAction(r),{code:4001});p.reject=false;await assert.rejects(client.sendAction(r));
});
test('USDC approval is exact, existing insufficient allowance resets to zero, and revocation is available',async()=>{
 const {p,client}=fixture();await client.connect();p.output=39800000000000n;
 const q=await client.quoteSwap('USDC','0.1');let r=await client.prepareSwap(q);
 let parsed=ERC20.parseTransaction(r.tx);assert.equal(parsed.name,'approve');assert.equal(parsed.args[0],NETWORKS[84532].router);assert.equal(parsed.args[1],100000n);
 p.allowance=1n;r=await client.prepareSwap(q);assert.equal(ERC20.parseTransaction(r.tx).args[1],0n);
 p.allowance=100000n;r=await client.prepareSwap(q);assert.equal(r.kind,'swap');
 const calls=ROUTER.parseTransaction(r.tx).args[1];assert.equal(calls.length,2);
 assert.equal(ROUTER.parseTransaction({data:calls[1]}).args[1],signer.address);
 assert.equal(ERC20.parseTransaction((await client.prepareRevoke()).tx).args[1],0n);
});
test('Account changes, expiry, insufficient gas and concurrent replay cannot submit an action',async()=>{
 const {p,client}=fixture();await client.connect();
 const r=await client.prepareTokenTransfer(other,'1');p.eth=0n;await assert.rejects(client.sendAction(r),/Not enough/);p.eth=10n**18n;
 const next=await client.prepareTokenTransfer(other,'1');const now=Date.now;
 try{Date.now=()=>next.expiresAt+1;await assert.rejects(client.sendAction(next),/expired/)}finally{Date.now=now}
 const changed=await client.prepareTokenTransfer(other,'1');p.emit('accountsChanged');await assert.rejects(client.sendAction(changed));await client.connect();
 const valid=await client.prepareTokenTransfer(other,'1');const results=await Promise.allSettled([client.sendAction(valid),client.sendAction(valid)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('Wallet proof binds each supported chain and rejects a tampered chain',async()=>{
 for(const chainId of [84532,8453]){const c=createWalletChallenge('owner',{address:signer.address,chainId});const sig=await signer.signMessage(c.message);assert.equal(verifyWalletChallenge(c,'owner',sig).chainId,chainId);assert.throws(()=>verifyWalletChallenge({...c,chainId:11155111},'owner',sig));}
});
