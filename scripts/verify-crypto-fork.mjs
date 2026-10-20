// Optional local integration test. Install ganache@7.9.2 in an isolated tooling directory.
// FYNX_GANACHE_MODULE must be the absolute path to its dist/node/core.js.
import { pathToFileURL } from 'node:url';
if (!process.env.FYNX_GANACHE_MODULE?.startsWith('/')) throw new Error('Set FYNX_GANACHE_MODULE to an isolated Ganache module path.');
const { default: ganache } = await import(pathToFileURL(process.env.FYNX_GANACHE_MODULE));
import { AssetConnection, ERC20 } from '../wallet-src/asset-client.js';
import { NETWORKS } from '../firebase-wallet/functions/networks.js';
import assert from 'node:assert/strict';
const remote={request:async({method,params=[]})=>{
 if(!/^(eth_(get|call|chainId|blockNumber)|net_version|web3_clientVersion)/.test(method))throw Error('Remote RPC is read-only: '+method);
 const r=await fetch('https://sepolia.base.org',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});const d=await r.json();if(d.error)throw Error(d.error.message);
 // Ganache cannot decode OP deposit transactions. Only block transaction lists are omitted;
 // contract code/storage and state roots come unchanged from the public read-only RPC.
 if(method.startsWith('eth_getBlockBy')&&d.result)d.result.transactions=[];
 return d.result;
}};
const provider=ganache.provider({fork:{provider:remote},chain:{chainId:84532},wallet:{totalAccounts:2,defaultBalance:10},logging:{quiet:true}});
try {
 const wrapper={request:args=>provider.request(args.method==='eth_requestAccounts'?{method:'eth_accounts'}:args),on:provider.on.bind(provider),removeListener:provider.removeListener.bind(provider)};
 const accounts=await provider.request({method:'eth_accounts'}), client=new AssetConnection(wrapper,()=>{},84532);await client.connect();
 const initial=await client.tokenBalance();
 const quote=await client.quoteSwap('ETH','0.001'), review=await client.prepareSwap(quote), buy=await client.sendAction(review);
 assert.equal((await client.receipt(buy)).status,'confirmed');
 const afterBuy=await client.tokenBalance();assert.ok(Number(afterBuy)>Number(initial));
 const transfer=await client.prepareTokenTransfer(accounts[1],'0.1'), send=await client.sendAction(transfer);assert.equal((await client.receipt(send)).status,'confirmed');
 const [received]=await client.call(NETWORKS[84532].usdc,ERC20,'balanceOf',[accounts[1]]);assert.equal(received,100000n);
 let reverse=await client.quoteSwap('USDC','0.1'), approval=await client.prepareSwap(reverse);assert.equal(approval.kind,'approval');
 const approve=await client.sendAction(approval);assert.equal((await client.receipt(approve)).status,'confirmed');
 reverse=await client.quoteSwap('USDC','0.1');const sellReview=await client.prepareSwap(reverse);assert.equal(sellReview.kind,'swap');
 const ethBeforeSell=BigInt(await provider.request({method:'eth_getBalance',params:[client.address,'latest']}));
 const sell=await client.sendAction(sellReview);assert.equal((await client.receipt(sell)).status,'confirmed');
 const ethAfterSell=BigInt(await provider.request({method:'eth_getBalance',params:[client.address,'latest']}));
 const sellReceipt=await provider.request({method:'eth_getTransactionReceipt',params:[sell]});
 const receivedETH=ethAfterSell-ethBeforeSell+BigInt(sellReceipt.gasUsed)*BigInt(sellReceipt.effectiveGasPrice);assert.ok(receivedETH>=reverse.minimum);
 const [allowance]=await client.call(NETWORKS[84532].usdc,ERC20,'allowance',[client.address,NETWORKS[84532].router]);assert.equal(allowance,0n);
 const revoke=await client.sendAction(await client.prepareRevoke());assert.equal((await client.receipt(revoke)).status,'confirmed');
 await assert.rejects(client.prepareTokenTransfer(accounts[1],'25'), /Not enough|revert/);
 const evidence={kind:'Isolated local fork of Base Sepolia; no public transactions broadcast',time:new Date().toISOString(),initialUSDC:initial,afterBuyUSDC:afterBuy,recipientIncrease:'0.1 USDC',buy,send,approve,sell,revoke,receivedETHWei:receivedETH.toString(),remainingAllowance:allowance.toString(),status:'all assertions passed'};
 console.log(evidence);
}catch(e){console.error(e.message);process.exitCode=1;}finally{await provider.disconnect()}
