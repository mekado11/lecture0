'use strict';
// The AI reply must survive the shapes real providers send: a thinking block before the text,
// JSON in a code fence, prose around the object, and an answer cut off at the length limit.
// A failure says so and is never cached, so Retry does not replay blank cards.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');

function engine(replies){
  const store=new Map();let calls=0;
  const context={console:{...console,warn(){},error(){}},window:{__userPlan:'premium'},
    localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem(k,v){store.set(k,String(v));},removeItem(k){store.delete(k);}},
    firebase:{auth:()=>({currentUser:{uid:'test',getIdToken:async()=>'token'}})},
    fetch:async()=>{const body=replies[Math.min(calls,replies.length-1)];calls++;return {ok:true,status:200,json:async()=>body};},
    AbortController,setTimeout,clearTimeout,Date,Math,JSON,Number,String,Array,Object,Map,Set};
  context.window.localStorage=context.localStorage;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('./ai-engine'),'utf8')+'\nthis.engine=AIEngine;',context);
  return {engine:context.engine,calls:()=>calls};
}

test('the text after a thinking block, inside a code fence, is read as the answer',async()=>{
  const {engine:E}=engine([{content:[{type:'thinking',thinking:''},{type:'text',text:'Here is the reading:\n```json\n{"overallAssessment":"Clear voice.","strengths":["Voice"],"priorityFix":"Tighten chapter 3"}\n```'}],stop_reason:'end_turn',usage:{}}]);
  const out=await E._callClaude(null,'system','user','Chapter 1\n\nSome manuscript text.','deepCritique',{contextOverride:'CTX'});
  assert.equal(out.parseError,undefined);
  assert.equal(out.overallAssessment,'Clear voice.');
  assert.deepEqual(out.strengths,['Voice']);
});

test('a cut-off answer is reported as such, and is not cached',async()=>{
  const {engine:E,calls}=engine([
    {content:[{type:'text',text:'{"overallAssessment":"Clear voice.","strengths":['}],stop_reason:'max_tokens',usage:{}},
    {content:[{type:'text',text:'{"overallAssessment":"Clear voice.","strengths":[]}'}],stop_reason:'end_turn',usage:{}}
  ]);
  const first=await E._callClaude(null,'system','user','Chapter 1\n\nSome manuscript text.','deepCritique',{contextOverride:'CTX'});
  assert.equal(first.parseError,true);
  assert.equal(first.truncated,true);
  assert.match(first.raw,/Clear voice/);
  const second=await E._callClaude(null,'system','user','Chapter 1\n\nSome manuscript text.','deepCritique',{contextOverride:'CTX'});
  assert.equal(calls(),2,'the failed reply was not served from cache');
  assert.equal(second.overallAssessment,'Clear voice.');
  const third=await E._callClaude(null,'system','user','Chapter 1\n\nSome manuscript text.','deepCritique',{contextOverride:'CTX'});
  assert.equal(calls(),2,'the good reply is cached');
  assert.equal(third.overallAssessment,'Clear voice.');
});

test('parseStructured: bare, fenced, surrounded by prose, or absent',()=>{
  const {engine:E}=engine([]);
  assert.deepEqual(E.parseStructured('{"a":1}'),{a:1});
  assert.deepEqual(E.parseStructured('Sure.\n```json\n{"a":1}\n```\nDone.'),{a:1});
  assert.deepEqual(E.parseStructured('The result {"a":{"b":2}} as requested'),{a:{b:2}});
  assert.equal(E.parseStructured('{"a":'),null);
  assert.equal(E.parseStructured(''),null);
  assert.equal(E.responseText({content:[{type:'thinking',thinking:'x'},{type:'text',text:'one'},{type:'text',text:'two'}]}),'one\ntwo');
});

test('the server carries an OpenAI length cut-off through as stop_reason max_tokens',async()=>{
  const sent=[];
  const db={collection:n=>({doc:u=>({path:n+'/'+u})}),getAll:async()=>[{exists:true,data:()=>({tier:'premium'})},{exists:false}]};
  const context={module:{exports:{}},process:{env:{OPENAI_API_KEY:'k'}},console,Buffer,Set,Date,Number,Math,JSON,
    require:id=>{
      if(id==='https')return {request(options,onResponse){sent.push(JSON.parse(options._body||'{}'));const l={};const res={statusCode:200,on(e,f){l[e]=f;}};return {on(){},setTimeout(){},write(b){options._body=b;sent.push(JSON.parse(b));},end(){setImmediate(()=>{onResponse(res);l.data('{"choices":[{"message":{"content":"{\\"a\\":"},"finish_reason":"length"}],"usage":{}}');l.end();});}};}};
      if(id==='./_auth')return {verifyToken:async()=>({user:{uid:'author'}}),getAdmin:()=>({firestore:()=>db})};
      if(id==='./_ratelimit')return {checkAndIncrement:async()=>1,analysisRun:async()=>({allowed:true,startedAt:null,nextAt:null}),openAnalysisRun:async()=>{}};
      return require(id);
    }};
  vm.runInNewContext(fs.readFileSync(require.resolve('./api/claude'),'utf8'),context);
  const res={statusCode:200,status(c){this.statusCode=c;return this;},json(b){this.body=b;return this;},setHeader(){}};
  await context.module.exports({method:'POST',headers:{'x-model':'openai-fast','x-feature':'ask-manuscript'},body:{max_tokens:8192,messages:[{role:'user',content:'x'}]}},res);
  assert.equal(res.body.stop_reason,'max_tokens');
  const body=sent.find(b=>b&&b.max_tokens);
  assert.equal(body.max_tokens,8192,'the raised limit reaches the provider');
});
