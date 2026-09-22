'use strict';
// AI analysis runs once per 24 hours per user, enforced at the API. A run is the burst of
// analysis requests fired together; it opens on the first successful response and closes
// fifteen minutes later; the next run is 24 hours after it opened. Per-request features
// (Ask Book, rewrite) are untouched, and the dev tier is exempt.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const rl=require('./api/_ratelimit');

test('the analysis window: open on success, a grace period for the burst, then closed until 24 hours',async()=>{
  const t0=Date.parse('2026-09-22T10:00:00Z');
  const uid='window-'+Math.random();
  assert.deepEqual(await rl.analysisRun(uid,t0),{allowed:true,startedAt:null,nextAt:null});
  await rl.openAnalysisRun(uid,t0);
  const inBurst=await rl.analysisRun(uid,t0+10*60*1000);
  assert.equal(inBurst.allowed,true,'the rest of the burst goes through');
  assert.equal(inBurst.startedAt,t0);
  const later=await rl.analysisRun(uid,t0+20*60*1000);
  assert.equal(later.allowed,false);
  assert.equal(later.nextAt,t0+rl.ANALYSIS_PERIOD_MS);
  await rl.openAnalysisRun(uid,t0+20*60*1000);
  assert.equal((await rl.analysisRun(uid,t0+21*60*1000)).startedAt,t0,'a second open inside the period does not move the clock');
  assert.equal((await rl.analysisRun(uid,t0+rl.ANALYSIS_PERIOD_MS+1)).allowed,true,'the day is over');
});

function proxy({feature,tier='premium',run,env={OPENAI_API_KEY:'k'},provider=200}={}){
  const calls={analysisRun:0,open:0,provider:0};
  const db={collection:name=>({doc:uid=>({path:name+'/'+uid})}),getAll:async()=>[{exists:true,data:()=>({tier})},{exists:false}]};
  const context={module:{exports:{}},process:{env},console,Buffer,Set,Date,Number,Math,JSON,
    require:id=>{
      if(id==='https'){
        return {request(options,onResponse){
          calls.provider++;
          const listeners={};
          const res={statusCode:provider,on(ev,fn){listeners[ev]=fn;}};
          return {on(){},setTimeout(){},write(){},end(){setImmediate(()=>{onResponse(res);listeners.data('{"choices":[{"message":{"content":"{}"}}]}');listeners.end();});}};
        }};
      }
      if(id==='./_auth')return {verifyToken:async()=>({user:{uid:'author'}}),getAdmin:()=>({firestore:()=>db})};
      if(id==='./_ratelimit')return {checkAndIncrement:async()=>1,analysisRun:async()=>{calls.analysisRun++;return run||{allowed:true,startedAt:null,nextAt:null};},openAnalysisRun:async()=>{calls.open++;}};
      return require(id);
    }};
  vm.runInNewContext(fs.readFileSync(require.resolve('./api/claude'),'utf8'),context);
  const handler=context.module.exports;
  return {calls,async call(){
    const res={statusCode:200,headers:{},status(c){this.statusCode=c;return this;},json(b){this.body=b;return this;},setHeader(k,v){this.headers[k]=v;}};
    await handler({method:'POST',headers:{'x-model':'openai-fast','x-feature':feature},body:{messages:[{role:'user',content:'Synthetic'}]}},res);
    return res;
  }};
}

test('a second analysis run inside 24 hours is refused with the next time, before the daily count',async()=>{
  const nextAt=Date.now()+3600000;
  const p=proxy({feature:'deepCritique',run:{allowed:false,startedAt:nextAt-86400000,nextAt}});
  const res=await p.call();
  assert.equal(res.statusCode,429);
  assert.equal(res.body.error.code,'ANALYSIS_COOLDOWN');
  assert.equal(res.body.error.nextAt,nextAt);
  assert.match(res.body.error.message,/once every 24 hours/);
  assert.ok(Number(res.headers['Retry-After'])>0);
  assert.equal(p.calls.provider,0,'nothing reached a provider');
});

test('the run opens only after a successful provider response',async()=>{
  const ok=proxy({feature:'editingRoadmap'});
  await ok.call();
  assert.equal(ok.calls.analysisRun,1);
  assert.equal(ok.calls.open,1,'a successful analysis opens the window');
  const failed=proxy({feature:'editingRoadmap',provider:500});
  await failed.call();
  assert.equal(failed.calls.open,0,'a failed provider call does not spend the run');
});

test('per-request features and the dev tier never consult the analysis window',async()=>{
  const ask=proxy({feature:'ask-manuscript',run:{allowed:false,startedAt:1,nextAt:Date.now()+1000}});
  const res=await ask.call();
  assert.equal(res.statusCode,200);
  assert.equal(ask.calls.analysisRun,0);
  const dev=proxy({feature:'deepCritique',run:{allowed:false,startedAt:1,nextAt:Date.now()+1000},env:{OPENAI_API_KEY:'k',ADMIN_UIDS:'author'}});
  assert.equal((await dev.call()).statusCode,200);
  assert.equal(dev.calls.analysisRun,0);
});
