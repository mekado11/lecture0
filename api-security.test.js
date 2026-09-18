'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {Readable}=require('node:stream');
function load(name,mocks={},env={}){
  const context={module:{exports:{}},require:id=>mocks[id]||require(id),process:{env},console,Buffer,URLSearchParams,Set,Map,Date};
  vm.runInNewContext(fs.readFileSync(require.resolve('./api/'+name),'utf8'),context);
  return context.module.exports;
}
function response(){return {code:200,status(code){this.code=code;return this;},json(value){this.body=value;return this;},setHeader(){},end(){}};}
test('all authenticated mutation endpoints reject missing identity',async()=>{
  for(const name of ['claude','grammar','account','redeem']){
    const handler=load(name,{'./_auth':{verifyToken:async()=>({user:null}),getAdmin:()=>null},'./_ratelimit':{}});
    const res=response();await handler({method:'POST',headers:{},body:{}},res);
    assert.equal(res.code,401,name);
  }
});
test('unverified admin email does not grant a model entitlement',async()=>{
  const handler=load('claude',{'./_auth':{verifyToken:async()=>({user:{uid:'ordinary',email:'admin@authorscrolls.com',email_verified:false}}),getAdmin:()=>null},'./_ratelimit':{}});
  const res=response();await handler({method:'POST',headers:{'x-model':'claude'},body:{messages:[{role:'user',content:'test'}]}},res);
  assert.equal(res.code,403);
});
test('checkout rejects invalid plans instead of silently charging for Starter',async()=>{
  const handler=load('checkout',{'./_auth':{verifyToken:async()=>({user:{uid:'test',email:'writer@example.test'}})}},{STRIPE_SECRET_KEY:'test-only'});
  const res=response();await handler({method:'POST',headers:{},body:{plan:'unexpected'}},res);assert.equal(res.code,400);
});
test('account deletion requires recent authentication and exact confirmation',async()=>{
  let adminUsed=false;
  const handler=load('account',{'./_auth':{verifyToken:async()=>({user:{uid:'test',auth_time:1}}),getAdmin:()=>({firestore(){adminUsed=true;}})}});
  const res=response();await handler({method:'POST',headers:{},body:{action:'delete',confirmation:'permanently delete'}},res);
  assert.equal(res.code,403);assert.equal(adminUsed,false);
});
test('account deletion cancels billing before recursively deleting data and identity',async()=>{
  const order=[];
  const profile={stripeSubscriptionId:'sub-test'};
  const db={collection:name=>({doc:()=>({get:async()=>({data:()=>profile}),set:async()=>order.push(name),delete:async()=>order.push(name)})}),
    recursiveDelete:async()=>order.push('manuscripts')};
  const stripe={subscriptions:{retrieve:async()=>({status:'active'}),cancel:async()=>order.push('billing')}};
  const firestore=Object.assign(()=>db,{FieldValue:{serverTimestamp:()=>0}});
  const handler=load('account',{'./_auth':{verifyToken:async()=>({user:{uid:'test',auth_time:Date.now()/1000}}),getAdmin:()=>({firestore,auth:()=>({deleteUser:async()=>order.push('identity')})})},stripe:()=>stripe},{STRIPE_SECRET_KEY:'test-only'});
  const res=response();await handler({method:'POST',headers:{},body:{action:'delete',confirmation:'permanently delete'}},res);
  assert.equal(res.code,200);assert.deepEqual(order,['accountDeletions','billing','manuscripts','pushSubscriptions','userSessions','checkoutLocks','identity']);
});
test('webhook failures ask Stripe to retry rather than acknowledging lost entitlement',async()=>{
  const event={type:'checkout.session.completed',data:{object:{subscription:'sub-test',metadata:{userId:'test',plan:'premium'}}}};
  const stripe={webhooks:{constructEvent:()=>event},subscriptions:{retrieve:async()=>{throw new Error('Temporary Stripe outage');}}};
  const handler=load('webhook',{'./_auth':{getAdmin:()=>({})},stripe:()=>stripe},{STRIPE_SECRET_KEY:'test-only',STRIPE_WEBHOOK_SECRET:'test-only'});
  const req=Readable.from([Buffer.from('signed-test')]);req.method='POST';req.headers={};
  const res=response();await handler(req,res);assert.equal(res.code,503);
});
test('webhook rejects bad signatures',async()=>{
  const handler=load('webhook',{'./_auth':{},stripe:()=>({webhooks:{constructEvent(){throw new Error('bad signature');}}})},{STRIPE_SECRET_KEY:'test-only',STRIPE_WEBHOOK_SECRET:'test-only'});
  const req=Readable.from([Buffer.from('invalid')]);req.method='POST';req.headers={};
  const res=response();await handler(req,res);assert.equal(res.code,400);
});
test('webhook serializes entitlements and ignores duplicate or older subscription events',async()=>{
  let profile={},writes=0,deleted=false;
  const db={
    collection:name=>({doc:()=>({name})}),
    runTransaction:async fn=>fn({get:async ref=>ref.name==='accountDeletions'?{exists:deleted}:{exists:true,data:()=>profile},set:(_ref,value)=>{profile={...profile,...value};writes++;}})
  };
  const firestore=Object.assign(()=>db,{FieldValue:{serverTimestamp:()=>({server:true})}});
  let event={id:'evt-new',created:200,type:'customer.subscription.updated',data:{object:{id:'sub-new'}}};
  let sub={id:'sub-new',created:150,status:'active',customer:'cus-test',metadata:{userId:'test',plan:'premium'}};
  const handler=load('webhook',{'./_auth':{getAdmin:()=>({firestore})},stripe:()=>({
    webhooks:{constructEvent:()=>event},subscriptions:{retrieve:async()=>sub}
  })},{STRIPE_SECRET_KEY:'test-only',STRIPE_WEBHOOK_SECRET:'test-only'});
  async function send(){const req=Readable.from([Buffer.from('signed')]);req.method='POST';req.headers={};const res=response();await handler(req,res);assert.equal(res.code,200);}
  await send();assert.equal(profile.tier,'premium');assert.equal(writes,1);
  await send();assert.equal(writes,1,'Duplicate is idempotent');
  event={...event,id:'evt-old',created:100};
  sub={...sub,id:'sub-old',created:50,metadata:{userId:'test',plan:'starter'}};
  await send();assert.equal(writes,1,'Older event is ignored');
  event={...event,id:'evt-late-old-sub',created:300};
  await send();assert.equal(writes,1,'Late update to an older subscription is ignored');
  event={id:'evt-delete-old',created:400,type:'customer.subscription.deleted',data:{object:{...sub,status:'canceled'}}};
  await send();assert.equal(profile.tier,'premium');
  deleted=true;
  event={id:'evt-after-deletion',created:500,type:'customer.subscription.updated',data:{object:{id:'sub-newer'}}};
  sub={...sub,id:'sub-newer',created:500};
  await send();assert.equal(writes,1,'Deletion tombstone blocks profile resurrection');
});
test('checkout blocks an existing subscription and reuses an in-flight session',async()=>{
  const fixture=require('./scripts/firebase-fixture')();
  let creations=0,subscription={status:'active'};
  const profileRef=fixture.db.collection('users').doc('test');
  await profileRef.set({stripeSubscriptionId:'sub-existing'});
  const handler=load('checkout',{'./_auth':{verifyToken:async()=>({user:{uid:'test',email:'writer@example.test'}}),getAdmin:()=>({firestore:()=>fixture.db})},stripe:()=>({
    subscriptions:{retrieve:async()=>subscription},
    checkout:{sessions:{create:async()=>{creations++;return {id:'cs-test',url:'https://checkout.stripe.com/test'};}}}
  })},{STRIPE_SECRET_KEY:'test-only'});
  const req={method:'POST',headers:{},body:{plan:'starter'}};
  let res=response();await handler(req,res);assert.equal(res.code,409);assert.equal(creations,0);
  subscription={status:'canceled'};
  res=response();await handler(req,res);assert.equal(res.code,200);assert.equal(creations,1);
  res=response();await handler(req,res);assert.equal(res.code,200);assert.equal(creations,1);
  res=response();await handler({...req,body:{plan:'premium'}},res);assert.equal(res.code,409);assert.equal(creations,1);
});
