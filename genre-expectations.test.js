'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
globalThis.ProseContext=require('./prose-context');globalThis.ProseNorms=require('./prose-norms');
eval(fs.readFileSync(require.resolve('./analyzer'),'utf8')+'; globalThis.Analyzer=Analyzer;');
const Pipeline=require('./intelligence-pipeline'),GE=require('./genre-expectations');

// Build the context exactly the way the app does, through the shared pipeline, so the tests
// exercise the same composition the Intelligence window relies on. Assembling `intel` by hand
// here silently skipped DocumentIntelligence, and with it every nonfiction structure.
function build(text,genre){
  const analysis=Analyzer.analyze(text,genre);
  const built=Pipeline.build(text,analysis);
  return {parsed:built.parsed,intel:built.intel,analysis};
}
const filler='The road ran east past the mill where the water turned slow and grey beneath the alders.';
function romance(meetAtChapter){
  let t='';
  for(let c=1;c<=10;c++){
    t+='Chapter '+c+'\n\n';
    t+=(c>=meetAtChapter?'Mara found Daniel by the river. Daniel took her hand and Mara felt the years fall away.'
                        :'Mara walked the market alone. She wondered what her life might have been, and remembered the winter.')+'\n\n';
    for(let i=0;i<5;i++)t+=filler+'\n\n';
  }
  return t;
}

test('an unknown genre is declined rather than answered with a generic model',()=>{
  const report=GE.evaluate('westernXYZ',build(romance(2),'western'));
  assert.equal(report.applicable,false);
  assert.match(report.reason,/no reader-expectation model/i);
});

test('every expectation declares how it is evidenced',()=>{
  const report=GE.evaluate('romance',build(romance(2),'romance'));
  const allowed=new Set(Object.values(GE.EVIDENCE));
  for(const item of report.expectations){
    assert.ok(allowed.has(item.evidence),item.id+' declares a known evidence level');
    assert.ok(item.why && item.why.length>30,item.id+' explains why a reader cares');
  }
});

test('judgements of meaning are never claimed as measurements',()=>{
  for(const genre of ['romance','dystopian']){
    const report=GE.evaluate(genre,build(romance(2),genre));
    for(const item of report.expectations){
      if(item.evidence!==GE.EVIDENCE.AI) continue;
      assert.equal(item.status,'unknown',genre+'/'+item.id+' must not assert a verdict');
      assert.doesNotMatch(item.observation,/\d+%/,'an AI-judged expectation quotes no statistic');
    }
  }
});

test('leads who share the page early read differently from leads who meet late',()=>{
  const early=GE.evaluate('romance',build(romance(2),'romance')).expectations.find(e=>e.id==='together');
  const late =GE.evaluate('romance',build(romance(9),'romance')).expectations.find(e=>e.id==='together');
  assert.equal(early.evidence,'structural');
  assert.ok(early.detail.sharedChapters>late.detail.sharedChapters,'the early-meeting book shares more chapters');
  assert.ok(late.detail.firstSharedIndex>early.detail.firstSharedIndex,'the late-meeting book meets later in the arc');
  assert.match(late.observation,/Mara and Daniel share \d+ of \d+ chapters/);
  assert.notEqual(late.status,'met');
});

test('a dystopia delivered as lecture is caught structurally, not by vocabulary',()=>{
  const lecture='The regime generally assigns each citizen to a sector at birth, and the council determines which permits apply, because the authority of the ministry is absolute and compliance is mandatory.';
  let t=''; for(let c=1;c<=8;c++){t+='Chapter '+c+'\n\n';for(let i=0;i<6;i++)t+=lecture+'\n\n';}
  const item=GE.evaluate('dystopian',build(t,'dystopian')).expectations.find(e=>e.id==='shown-not-lectured');
  assert.equal(item.evidence,'structural');
  assert.equal(item.status,'unmet');
  assert.match(item.observation,/explanatory passages are \d+%/i,'the figure is quoted so the author can disagree with our reading');
});

test('a self-help book is measured on what it actually gives the reader to do',()=>{
  const chapter=(n)=>'Chapter '+n+'\n\n'
    +'I woke at four and walked to the site. My mother had already left before dawn.\n\n'
    +'According to a study, small habits compound far more than motivation does.\n\n'
    +'Reflection questions:\n\nWhat would you change first?\n\n'
    +'Action: Write down one belief you want to test this week.\n\n';
  let t=''; for(let c=1;c<=6;c++) t+=chapter(c);
  const report=GE.evaluate('selfHelp',build(t,'selfHelp'));
  const actions=report.expectations.find(e=>e.id==='actionable');
  const evidence=report.expectations.find(e=>e.id==='evidence');
  assert.equal(actions.evidence,'structural');
  assert.equal(actions.status,'met','explicit actions are present in every chapter');
  assert.match(actions.observation,/explicit action/);
  assert.equal(evidence.status,'met');
  assert.match(evidence.observation,/attributed claim/);
});

test('a self-help book with no actions is told so plainly',()=>{
  let t=''; for(let c=1;c<=6;c++) t+='Chapter '+c+'\n\nMost people assume that effort is the whole story. Research generally suggests otherwise.\n\n';
  const actions=GE.evaluate('selfHelp',build(t,'selfHelp')).expectations.find(e=>e.id==='actionable');
  assert.equal(actions.status,'unmet');
  assert.match(actions.observation,/0 explicit actions/);
});

test('every modelled genre states a promise and evidences every expectation',()=>{
  const allowed=new Set(Object.values(GE.EVIDENCE));
  for(const [name,model] of Object.entries(GE.GENRES)){
    assert.ok(model.promise && model.promise.length>80,name+' states what a reader comes for');
    assert.ok(model.expectations.length>=3,name+' has enough to say to be worth showing');
    for(const item of model.expectations){
      assert.ok(allowed.has(item.evidence),name+'/'+item.id+' declares a known evidence level');
      assert.ok(item.why && item.why.length>30,name+'/'+item.id+' explains why a reader cares');
      // The central discipline: a judgement of meaning must never carry a measurement.
      if(item.evidence===GE.EVIDENCE.AI) assert.equal(item.measure,undefined,name+'/'+item.id+' must not measure');
      // A proxy must admit in its own words that it is one.
      if(item.evidence===GE.EVIDENCE.PROXY)
        assert.match(item.why,/proxy|word choice|vocabulary|crude|not .*itself|only the most literal/i,
          name+'/'+item.id+' states its own limitation');
    }
  }
});

test('every modelled genre survives a manuscript that suits it badly',()=>{
  const bland='She walked to the window and looked at the garden where the light fell across the grass.';
  let t=''; for(let c=1;c<=6;c++){t+='Chapter '+c+'\n\n';for(let i=0;i<5;i++)t+=bland+'\n\n';}
  const ctx=build(t,'literary');
  for(const name of Object.keys(GE.GENRES)){
    const report=GE.evaluate(name,ctx);
    assert.equal(report.applicable,true,name+' returns a report');
    for(const item of report.expectations)
      assert.ok(['met','partial','unmet','unknown'].includes(item.status),name+'/'+item.id+' has a valid status');
  }
});

test('a scene-driven dystopia with rising threat reads as meeting its promises',()=>{
  const lecture='The regime assigns each citizen to a sector, and the council determines which permits apply.';
  const scene='Kira ran for the sector gate. The patrol shouted behind her. She ducked beneath the rail.';
  const scary='They would kill her if they caught her. The danger was closer now and the threat hung over every door.';
  let t='';
  for(let c=1;c<=8;c++){ t+='Chapter '+c+'\n\n'+lecture+'\n\n';
    for(let i=0;i<5;i++)t+=scene+'\n\n';
    for(let i=0;i<(c>5?4:0);i++)t+=scary+'\n\n'; }
  const report=GE.evaluate('dystopian',build(t,'dystopian'));
  assert.equal(report.expectations.find(e=>e.id==='shown-not-lectured').status,'met');
  assert.equal(report.expectations.find(e=>e.id==='pressure').status,'met');
});

test('an absence of signal is reported as unknown, never as a flat trend',()=>{
  const bland='She walked to the window and looked at the garden where the light fell across the grass.';
  let t=''; for(let c=1;c<=8;c++){t+='Chapter '+c+'\n\n';for(let i=0;i<6;i++)t+=bland+'\n\n';}
  const item=GE.evaluate('dystopian',build(t,'dystopian')).expectations.find(e=>e.id==='pressure');
  assert.equal(item.status,'unknown');
  assert.match(item.observation,/could not be read/);
});

test('proxy measures admit they are proxies',()=>{
  const report=GE.evaluate('dystopian',build(romance(2),'dystopian'));
  for(const item of report.expectations.filter(e=>e.evidence===GE.EVIDENCE.PROXY)){
    assert.match(item.why,/proxy|word choice|vocabulary|not .*craft|not tension itself/i,
      item.id+' states its own limitation');
  }
});

test('malformed input never throws',()=>{
  for(const ctx of [{},{parsed:null,intel:null,analysis:null},{parsed:{chapters:[]},intel:{},analysis:{}}]){
    assert.doesNotThrow(()=>GE.evaluate('romance',ctx));
    assert.doesNotThrow(()=>GE.evaluate('dystopian',ctx));
  }
});
