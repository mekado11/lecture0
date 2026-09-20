'use strict';
// The inline "suggestions" (weak verb, repetition) must be measurements of THIS manuscript,
// judged for the passage they sit in, never a fixed list applied blindly.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
globalThis.ProseContext=require('./prose-context');globalThis.ProseNorms=require('./prose-norms');
eval(fs.readFileSync(require.resolve('./analyzer'),'utf8')+'; globalThis.Analyzer=Analyzer;');

const weak=(text)=>Analyzer.findWeakVerbs(text,'literary');
const rep=(text)=>Analyzer.findRepetitions(text);

test('a participle, a passive and an idiom are not the sentence\'s verb and are never raised',()=>{
  const t=[
    'Just choices, made quietly, and alone.',        // participial phrase
    'The bed was made before dawn.',                 // passive: another detector's job
    'None of it made sense to her.',                 // idiom
    'He made up his mind and made for the door.',    // particle, idiom
    'She started to run. He seemed to think so. They came to realize it.', // aspectual / raising
    'I thought that he was lying. She thought about it.', // a clause pondered cannot take
  ].join(' ');
  assert.deepEqual(weak(t),[],JSON.stringify(weak(t).map(i=>i.text)));
});

test('a verb the author already varies is left alone; a verb the author leans on is raised with its count',()=>{
  const varied='Mara walked to the gate. Daniel strode after her. Ola trudged behind. Bello walked home. Zara paced the yard. Kemi ambled past. Femi walked on. Tunde sauntered by.';
  assert.deepEqual(weak(varied),[],'walked is 3 of 8 walking verbs: no habit to report');
  const leaning='Mara walked to the gate. Daniel walked toward her. Ola walked behind. Bello walked home. Zara walked the yard. Kemi walked past. Femi walked on.';
  const found=weak(leaning);
  assert.ok(found.length>=3,'the habit is raised');
  assert.match(found[0].message,/"walked" carries 7 of the 7 walking verbs/);
  assert.match(found[0].message,/per 1,000 words/);
  assert.equal(found[0].detail.uses,7);
  assert.equal(found[0].detail.family,0);
  assert.doesNotMatch(found[0].suggestion,/^Try:/,'the alternatives are offered to weigh, not as a fix to apply');
});

test('shown instances are spread across the manuscript, not taken from its opening',()=>{
  let t='';for(let i=0;i<40;i++)t+='She walked to the well and back. ';
  const found=weak(t);
  assert.equal(found.length,8,'display cap');
  assert.match(found[0].suggestion,/Showing 8 of 40 uses/);
  const span=found[found.length-1].index-found[0].index;
  assert.ok(span>t.length*0.7,'instances reach into the last third of the text');
});

test('a plain verb is set aside in explanation and speech, kept in action, with a reason on the record',()=>{
  const exposition='Most people assume that effort is the whole story. I made a study of it. The evidence made a different case. Research generally made this clear. You will find the argument made in every chapter. This is what the data made of it.';
  const action='Bello made a grab for the rope. Zara made a dash for the ditch. Oumar made a lunge at the gate. The herd made a run at the fence. He made a leap for the wall.';
  const r=Analyzer.analyze(exposition+'\n\n'+action,'literary');
  const made=r.issues.filter(i=>i.type==='weak-verb');
  assert.ok(made.length>0,'the verb is raised somewhere');
  const inExposition=made.filter(i=>i.index<exposition.length);
  const inAction=made.filter(i=>i.index>=exposition.length);
  assert.ok(inExposition.length>0&&inExposition.every(i=>i.contextSuppressed),'explanatory uses are set aside');
  assert.match(inExposition[0]._context.reason,/explanatory writing/);
  assert.ok(inAction.length>0&&inAction.every(i=>!i.contextSuppressed),'action uses are kept');
  // Counts beside the score are counts of what scored.
  assert.equal(r.issueCounts['weak-verb'],inAction.length);
});

test('a name repeated across sentences is a name, not a repetition',()=>{
  const t='Alice trusted Bob. Alice returned to Bob at dusk. The gate was open. The gate was never open.';
  const found=rep(t).map(i=>i.text);
  assert.ok(!found.includes('alice'),found.join(','));
  assert.ok(found.includes('gate'),'an echoed common word is still raised: '+found.join(','));
});

test('a word repeated inside parallel structure is the device, not a fault — even in an epigraph',()=>{
  const t='“Poverty does not disappear through sympathy. It disappears through decisions.”\n\nIntroduction\n\nSit with me for a moment. You have been standing long enough.\n\nNow, perhaps you feel like you are doing everything right and still coming up short.';
  const r=Analyzer.analyze(t,'selfHelp');
  const through=r.issues.find(i=>i.type==='repetition'&&i.text==='through');
  assert.ok(through,'the repetition is still on the record');
  assert.equal(through.rhetorical,'parallel');
  assert.equal(through.contextSuppressed,true,'set aside although the epigraph is too short for the passage classifier');
  assert.match(through._context.reason,/parallel structure/);
  // An echo that is not parallel (different order, different shape) is still raised.
  const scene='He grabbed the rope and swung across the ditch as the herd broke the fence behind him. The rope snapped, and Bello grabbed the post before the water took him.';
  const found=Analyzer.findRepetitions(scene).filter(i=>i.text==='rope'||i.text==='grabbed');
  assert.ok(found.length>0&&found.every(i=>!i.rhetorical),JSON.stringify(found));
});

test('repetition in explanatory prose is set aside with a reason, and the count follows the score',()=>{
  const t='Merriam-Webster defines poverty as a lack of money or comfort. But poverty is also the absence of access to healthcare, to education, to what a child needs to grow. It is the choice nobody makes for the child. The overworked parent is doing three jobs at once, and it is affecting more people than we generally admit.';
  const r=Analyzer.analyze(t,'selfHelp');
  const reps=r.issues.filter(i=>i.type==='repetition');
  assert.ok(reps.length>0,'the repetition is still on the record');
  assert.ok(reps.every(i=>i.contextSuppressed),'but set aside for explanatory prose');
  assert.match(reps[0]._context.reason,/explanatory/);
  assert.equal(r.issueCounts.repetition,0,'the count beside the score is the count that scored');
});
