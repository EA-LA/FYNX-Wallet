import test from 'node:test';
import assert from 'node:assert/strict';
import { providerStatus, createCheckout, checkoutStatus } from '../firebase-wallet/functions/fiat.js';
const wallet={address:'0x0000000000000000000000000000000000000001',chainId:11155111};
const config={enabled:true,environment:'STAGING',apiKey:'sandbox-example-key',accessToken:'sandbox-example-access-token',expiresAt:Math.floor(Date.now()/1000)+3600};
function fixture(){
 const records=new Map();
 const db={collection:()=>({doc:id=>({create:async value=>records.set(id,value),get:async()=>({exists:records.has(id),data:()=>records.get(id)})})})};
 const args={raw:JSON.stringify(config),db,uid:'owner',wallet,input:{direction:'BUY',address:wallet.address},ip:'127.0.0.1'};
 return{records,args};
}
test('Missing, expired, disabled or production configuration can never enable payments',()=>{
 for(const raw of ['{}','bad',JSON.stringify({...config,environment:'PRODUCTION'}),JSON.stringify({...config,expiresAt:1}),JSON.stringify({...config,enabled:false})])assert.equal(providerStatus(raw).sandboxReady,false);
 assert.equal(providerStatus(JSON.stringify(config)).productionReady,false);
 assert.equal(JSON.stringify(providerStatus(JSON.stringify(config))).includes(config.accessToken),false);
});
test('Checkout binds verified wallet, fixed sandbox host, product and reference; failures create no local order',async()=>{
 const {args,records}=fixture();let body;
 const fetcher=async(url,options)=>{assert.equal(url,'https://api-gateway-stg.transak.com/api/v2/auth/session');assert.equal(options.redirect,'error');body=JSON.parse(options.body);return{ok:true,json:async()=>({data:{widgetUrl:'https://global-stg.transak.com/?sessionId=example'}})}};
 const result=await createCheckout({...args,fetcher});assert.equal(body.widgetParams.partnerOrderId,result.id);assert.equal(body.widgetParams.walletAddress,wallet.address);assert.equal(body.widgetParams.disableWalletAddressForm,true);assert.equal(records.size,1);
 for(const override of [{wallet:null},{wallet:{...wallet,chainId:8453}},{input:{...args.input,address:'0x0000000000000000000000000000000000000002'}},{input:{...args.input,direction:'ANY'}},{ip:''}])await assert.rejects(createCheckout({...args,...override,fetcher}));
 for(const url of ['https://global.transak.com/?sessionId=x','https://evil.example/?sessionId=x','https://global-stg.transak.com.evil.example/?sessionId=x'])await assert.rejects(createCheckout({...args,fetcher:async()=>({ok:true,json:async()=>({data:{widgetUrl:url}})})}));
 await assert.rejects(createCheckout({...args,fetcher:async()=>({ok:false,status:401})}),{code:'unavailable'});
 await assert.rejects(createCheckout({...args,fetcher:async()=>{throw Error('secret-token in internal error')}}),e=>e.code==='unavailable'&&!e.message.includes('secret-token'));
 assert.equal(records.size,1);
});
test('Only matching server-fetched provider orders return sandbox status; no balance is credited',async()=>{
 const {args,records}=fixture();const sessionId='a'.repeat(48),orderId='11111111-2222-3333-4444-555555555555';
 records.set(sessionId,{kind:'fiat-sandbox',uid:'owner',address:wallet.address,direction:'BUY',expiresAt:{toMillis:()=>Date.now()+60000}});
 const order={_id:orderId,partnerOrderId:sessionId,walletAddress:wallet.address,isBuyOrSell:'BUY',network:'ethereum',cryptoCurrency:'ETH',fiatCurrency:'USD',status:'COMPLETED'};
 const make=data=>async(url)=>{assert.equal(url,'https://api-stg.transak.com/partners/api/v2/order/'+orderId);return{ok:true,json:async()=>({data})}};
 const request={...args,input:{sessionId,orderId},fetcher:make(order)};
 const result=await checkoutStatus(request);assert.equal(result.sandbox,true);assert.match(result.message,/not a real payment/);
 for(const status of ['FAILED','REFUNDED','PENDING_DELIVERY_FROM_TRANSAK'])assert.equal((await checkoutStatus({...request,fetcher:make({...order,status})})).status,status);
 for(const bad of [{partnerOrderId:'different'},{walletAddress:'different'},{network:'base'},{isBuyOrSell:'SELL'}])await assert.rejects(checkoutStatus({...request,fetcher:make({...order,...bad})}));
 await assert.rejects(checkoutStatus({...request,uid:'another-user'}));
 assert.equal(records.size,1);
});
