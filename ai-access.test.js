'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function proxy({profile={tier:'beta'},deleted=false,unavailable=false,env={}}={}) {
  const db={
    collection:name=>({doc:uid=>({path:name+'/'+uid})}),
    getAll:async()=> {
      if(unavailable)throw new Error('Authority unavailable');
      return [{exists:profile!==null,data:()=>profile},{exists:deleted}];
    }
  };
  const context={module:{exports:{}},process:{env},console,Buffer,Set,Date,
    require:id=>{
      if(id==='https')return {request(){throw new Error('This test must not contact a provider');}};
      if(id==='./_auth')return {verifyToken:async()=>({user:{uid:'author'}}),getAdmin:()=>({firestore:()=>db})};
      if(id==='./_ratelimit')return {checkAndIncrement:async()=>{throw new Error('Rate authority unavailable');}};
      return require(id);
    }};
  vm.runInNewContext(fs.readFileSync(require.resolve('./api/claude'),'utf8'),context);
  return context.module.exports;
}
async function call(handler) {
  const res={statusCode:0,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},setHeader(){}};
  await handler({method:'POST',headers:{'x-model':'openai-fast'},body:{messages:[{role:'user',content:'Synthetic'}]}},res);
  return res;
}
test('AI access authority failures are retryable and never grant cached access',async()=>{
  const res=await call(proxy({unavailable:true,env:{ADMIN_UIDS:'author'}}));
  assert.equal(res.statusCode,503);assert.equal(res.body.error.code,'ACCESS_UNAVAILABLE');
});
test('deletion tombstones block privileged AI accounts too',async()=>{
  const res=await call(proxy({deleted:true,env:{ADMIN_UIDS:'author'}}));
  assert.equal(res.statusCode,403);
});
test('corrupt tier values fail closed; with the subscription gate on, so do missing profiles',async()=>{
  for(const profile of [{tier:'invented'},{tier:'toString'},{tier:'__proto__'}]){
    const res=await call(proxy({profile}));assert.equal(res.statusCode,403,JSON.stringify(profile));
  }
  for(const profile of [null,{},{tier:'invented'}]){
    const res=await call(proxy({profile,env:{AI_REQUIRE_SUBSCRIPTION:'1'}}));assert.equal(res.statusCode,403,JSON.stringify(profile));
  }
});
test('pre-launch: an ordinary account with no tier reaches the provider check',async()=>{
  for(const profile of [null,{}]){
    const res=await call(proxy({profile}));assert.equal(res.statusCode,503,'past the tier gate, stopped only by the absent provider key');
  }
});
test('AI provider and rate authority failures never fall back to another provider',async()=>{
  assert.equal((await call(proxy())).statusCode,503);
  assert.equal((await call(proxy({env:{OPENAI_API_KEY:'synthetic-never-sent'}}))).statusCode,503);
});
