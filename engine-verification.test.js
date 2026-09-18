'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Parser=require('./manuscript-parser'),DI=require('./document-intelligence'),Pipeline=require('./intelligence-pipeline'),Retrieval=require('./manuscript-retrieval'),Runner=require('./analysis-runner');
const {nonfiction}=require('./scripts/manuscript-fixtures');
const analyzerContext={console};vm.createContext(analyzerContext);
vm.runInContext(fs.readFileSync(require.resolve('./analyzer'),'utf8')+'\nthis.engine=Analyzer;',analyzerContext);
const Analyzer=analyzerContext.engine;
test('classification is finite and author genre overrides contradictory surface cues',()=>{
  const parsed=Parser.parse(nonfiction(2,2));
  assert.ok(Number.isFinite(DI.classify(parsed).confidence));
  assert.equal(DI.classify(parsed,{genre:{primary:'fantasy'}}).type,'fiction');
  assert.equal(DI.classify(Parser.parse('An essay about truth.'),{genre:{primary:'philosophy'}}).type,'nonfiction');
  const intel=Pipeline.build(nonfiction(2,2),{genre:{primary:'selfHelp'}}).intel;
  for(const key of ['concepts','claims','personalEvidence','reflectionQuestions','actions','recommendations']){
    assert.ok(intel.nonfiction[key].length,key);assert.ok(intel.nonfiction[key].every(row=>row.chapterId),key+' provenance');
  }
  assert.equal(intel.characterLedger.characters.length,0,'Do not turn concepts into fictional characters');
});
test('parser preserves source, main chapter semantics, empty shape and review nesting',()=>{
  const source='Introduction\nNotes.\nChapter 1: Start\nFirst.\nChapter 2: Next\nSecond.\nPart 1: Mid-Chapter Review\nChapter 1: Start\nRecap.\nChapter 2: Next\nRecap.\nChapter 3: End\nDone.';
  const parsed=Parser.parse(source);
  assert.deepEqual(parsed.chapterNumbers,[1,2,3]);assert.equal(parsed.chapters.map(c=>c.text).join(''),source);
  assert.equal(Parser.parse('').unitCount,0);
});
test('long-book retrieval reaches opening, middle and ending within a strict budget',()=>{
  const text=nonfiction(30,60),t=performance.now(),built=Pipeline.build(text,{genre:{primary:'selfHelp'}});
  assert.ok(text.split(/\s+/).length>60000);
  const packet=Retrieval.contextPacket('Whole book structure',built.parsed,built.intel);
  assert.ok(JSON.stringify(packet).length<=80000);
  assert.ok(packet.overview.chapters.some(c=>c.excerpts.join('').includes('UNIQUE_ANCHOR_1')));
  assert.ok(packet.overview.chapters.some(c=>c.excerpts.join('').includes('UNIQUE_ANCHOR_15')||c.excerpts.join('').includes('UNIQUE_ANCHOR_16')));
  assert.ok(packet.overview.chapters.some(c=>c.excerpts.join('').includes('ENDING_ANCHOR_30')));
  const late=Retrieval.contextPacket('ENDING_ANCHOR_30',built.parsed,built.intel);
  assert.ok(late.chapters.some(c=>c.text.includes('ENDING_ANCHOR_30')));
  assert.ok(JSON.stringify(Retrieval.contextPacket('whole book',built.parsed,built.intel,5,1800)).length<=1800);
  console.log(`Synthetic benchmark: ${text.split(/\s+/).length} words; structure/retrieval ${Math.round(performance.now()-t)}ms`);
});
test('nonfiction scores are repeatable and fiction-only dimensions remain N/A',()=>{
  const text=nonfiction(4,4),a=Analyzer.analyze(text,'selfHelp'),b=Analyzer.analyze(text,'selfHelp');
  assert.equal(a.scoreModel,'self-help-v1');
  assert.equal(a.scores.dialogue,null);assert.equal(a.scores.showTell,null);
  assert.deepEqual(a.scores,b.scores);assert.equal(a.overall,b.overall);
  assert.equal(a.dnfAnalysis.eval_mode,'nonfiction');
});
test('whole-book AI receives nonfiction evidence and ending, not only an opening slice',async()=>{
  let sent;const analysis={genre:{primary:'selfHelp',label:'Self-Help'},scores:{},overall:60};
  const context={console,window:{__userPlan:'premium'},ManuscriptParser:Parser,BookIntelligence:{},ManuscriptRetrieval:Retrieval,IntelligencePipeline:Pipeline,
    firebase:{auth:()=>({currentUser:{getIdToken:async()=>'test'}})},AbortController,setTimeout,clearTimeout,
    fetch:async(_,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({content:[{text:'{\"answer\":\"advisory\"}'}]})};}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('./ai-engine'),'utf8')+'\nthis.engine=AIEngine;',context);
  await context.engine._callClaude(null,'Review','Return JSON',nonfiction(30,8),'deepCritique',{analysis});
  const payload=JSON.stringify(sent);assert.ok(payload.includes('ENDING_ANCHOR_30'));assert.ok(payload.includes('nonfiction'));assert.ok(payload.includes('sampled'));
  assert.equal(context.engine._applyAIDerivedScores,undefined,'No dormant AI score blending path');
  assert.equal(analysis.overall,60);
});
test('application has no manuscript or AI result browser-storage writes',()=>{
  for(const name of ['app.js','ai-engine.js','storage.js']){
    const source=fs.readFileSync(name,'utf8');
    assert.doesNotMatch(source,/setItem\(['"](?:ml_autosave|ml_saves|ml_bookshelf|ml_cache|ml_versions|fixes:)/);
    assert.doesNotMatch(source,/r\.scores\.\w+\s*=(?!=)/,'No external-check score mutation');
  }
});
test('Smart Scan grounds late issues and invalidates advice after a same-length edit',async()=>{
  let calls=0,payload='';
  const context={console,window:{__userPlan:'premium'},firebase:{auth:()=>({currentUser:{getIdToken:async()=>'test'}})},
    AbortController,setTimeout,clearTimeout,fetch:async(_,options)=>{
      calls++;payload=options.body;return {ok:true,json:async()=>({content:[{text:'[]'}]})};
    }};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('./ai-engine'),'utf8')+'\nthis.engine=AIEngine;',context);
  const text='Opening sentence. '.repeat(3000)+'ENDING_CONTEXT we really tried.';
  const issue={index:text.indexOf('really'),type:'adverb',text:'really',length:6};
  const analysis={genre:{primary:'selfHelp'}};
  await context.engine.smartScan(null,text,[issue],analysis);
  assert.ok(payload.includes('ENDING_CONTEXT'));assert.ok(payload.includes('selfHelp'));
  await context.engine.smartScan(null,text,[issue],analysis);
  assert.equal(calls,1,'Same text and context reuse tab memory');
  await context.engine.smartScan(null,text.replace('Opening','Changed'),[issue],analysis);
  assert.equal(calls,2,'Edits invalidate advice even when length is unchanged');
  assert.doesNotMatch(fs.readFileSync('ai-engine.js','utf8'),/collection\(['"]aiScans/,'No stale per-document persistent scan cache');
});
function workers(){
  const created=[];
  const factory=()=>{const listeners=new Map();const worker={terminated:false,addEventListener:(name,cb)=>listeners.set(name,cb),removeEventListener:name=>listeners.delete(name),postMessage:message=>worker.request=message,terminate:()=>worker.terminated=true,emit:data=>listeners.get('message')?.({data}),listenerCount:()=>listeners.size};created.push(worker);return worker;};
  return {factory,created};
}
test('worker timeout terminates the worker, clears listeners, and permits retry',async()=>{
  const f=workers(),runner=new Runner(f.factory,10);
  await assert.rejects(runner.analyze('text','fantasy'),/timed out/);
  assert.equal(f.created[0].terminated,true);assert.equal(f.created[0].listenerCount(),0);
  const next=runner.analyze('retry','fantasy'),worker=f.created[1];
  worker.emit({version:worker.request.version,type:'result',data:{overall:70}});
  assert.equal((await next).overall,70);assert.equal(worker.listenerCount(),0);
});
test('superseded analysis cannot publish stale results',async()=>{
  const f=workers(),runner=new Runner(f.factory),first=runner.analyze('old');
  const rejected=assert.rejects(first,{name:'AbortError'});
  runner.cancel();await rejected;
  const second=runner.analyze('new'),worker=f.created[1];
  f.created[0].emit({version:1,type:'result',data:{overall:1}});
  worker.emit({version:worker.request.version,type:'result',data:{overall:90}});
  assert.equal((await second).overall,90);
});
