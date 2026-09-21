'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const pipeline=require('./intelligence-pipeline');
test('installed Admin SDK initializes authentication and storage adapters without network',()=>{
  const {spawnSync}=require('node:child_process');
  const run=spawnSync(process.execPath,['-e',`
    const a=require('./api/_auth').getAdmin();
    if(!a||typeof a.auth().verifyIdToken!=='function'||typeof a.firestore().collection!=='function'||!a.firestore.FieldValue.serverTimestamp())process.exit(1);
  `],{cwd:__dirname,env:{...process.env,FIREBASE_SERVICE_ACCOUNT:'',FIREBASE_PROJECT_ID:'demo-authorscrolls'},encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
});
test('shared intelligence pipeline composes all required evidence modules',()=>{
  const result=pipeline.build('Chapter 1\nAlice was Bob’s sister. Alice was twenty years old.\n\nChapter 2\nThree years later, Alice saw Bob.');
  assert.equal(result.parsed.chapterCount,2);
  assert.ok(result.intel.characterLedger);
  assert.ok(result.intel.relationshipIntelligence);
  assert.ok(result.intel.timeline);
});
test('Ask Book sends its retrieved context instead of an empty manuscript',async()=>{
  let sent;
  const context={console,window:{__userPlan:'premium'},localStorage:{getItem:()=>null,setItem(){}},
    firebase:{auth:()=>({currentUser:{uid:'test',getIdToken:async()=>'token'}})},
    fetch:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({content:[{text:'{"answer":"grounded"}'}]})};},
    AbortController,setTimeout,clearTimeout};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('./ai-engine'),'utf8')+'\nthis.engine=AIEngine;',context);
  await context.engine._callClaude(null,'question','prompt','','ask-manuscript',{contextOverride:'RETRIEVED BOOK CONTEXT: Alice trusted Bob.'});
  assert.ok(JSON.stringify(sent).includes('RETRIEVED BOOK CONTEXT: Alice trusted Bob.'));
});
test('webhook exports its raw-body configuration after assigning handler',()=>{
  assert.equal(require('./api/webhook').config.api.bodyParser,false);
});
test('production quota cannot silently fall back to process memory',async()=>{
  const before=process.env.NODE_ENV;process.env.NODE_ENV='production';
  try{await assert.rejects(require('./api/_ratelimit').checkAndIncrement('test','2026-01-01'),/Persistent/);}
  finally{if(before==null)delete process.env.NODE_ENV;else process.env.NODE_ENV=before;}
});
test('local server denies private files and unauthenticated provider calls',async()=>{
  const server=require('./server');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    for(const file of ['/.env','/server.js','/api/_auth.js','/package.json','/.git/config','/scripts/manuscript-fixtures.js','/scripts/build-review-preview.js'])
      assert.equal((await fetch(base+file)).status,404,file);
    assert.equal((await fetch(base+'/app.js?v=test')).status,200);
    assert.equal((await fetch(base+'/api/claude',{method:'POST',body:'{}'})).status,401);
    assert.equal((await fetch(base+'/api/grammar',{method:'POST',body:'{}'})).status,401);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
