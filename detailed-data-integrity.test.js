'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const ctx={console}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require.resolve('./analyzer'),'utf8')+'\nthis.Analyzer=Analyzer;',ctx);
const A=ctx.Analyzer;

function fictionText(){
  return [
    'Mara opened the letter. The room was quiet and she wondered what waited outside.',
    'Mara said, "We leave tonight." Jonas grabbed the bag as danger closed around them.',
    'They ran through the station. The guards attacked, Jonas fought back, and Mara escaped the trap.',
    'At dawn Mara returned home. The threat was resolved, the family reunited, and the street was calm.'
  ].join('\n\n');
}
function nonfictionText(){
  return [
    'The central claim of this chapter is that small financial habits compound over time.',
    'For example, research and survey data show that repeated saving decisions matter. Therefore, the evidence supports a systems approach.',
    'However, behavior changes when incentives change. In addition, a case study provides evidence for the claim.',
    'In conclusion, taken together, the evidence shows why consistent action matters.'
  ].join('\n\n');
}

test('copy score is length-normalized and monotonic',()=>{
  assert.equal(A.scoreCopyEditing([],10000),100);
  const mk=n=>Array.from({length:n},(_,i)=>({type:'adverb',index:i}));
  assert.ok(A.scoreCopyEditing(mk(10),10000)>A.scoreCopyEditing(mk(100),10000));
  assert.equal(A.scoreCopyEditing(mk(10),10000),A.scoreCopyEditing(mk(20),20000));
});

test('fiction structure exposes measured unit provenance, and says what it could not assess',()=>{
  const short=A.analyzePlot(fictionText(),'chapter',{primary:'fiction'});
  assert.equal(short.applicable,false,'four short paragraphs are too little to measure structure');
  assert.equal(short.score,null);
  const chapters=Array.from({length:5},(_,i)=>'Chapter '+(i+1)+'\n\n'+Array.from({length:12},()=>fictionText()).join('\n\n')).join('\n\n');
  const p=A.analyzePlot(chapters,'book',{primary:'fiction'});
  assert.equal(p.arc,'structure');
  assert.equal(p.unitSource,'chapter');
  assert.equal(p.unitCount,5);
  assert.ok(p.units.every(u=>Number.isFinite(u.words)));
  // This context has no passage classifier: rhythm and shape are declared not assessed, not faked.
  assert.ok(p.notAssessed.some(s=>/classifier unavailable/.test(s)));
  assert.ok(p.components.lengthControl&&p.components.cast,'length control and cast persistence need no classifier');
  assert.ok(Number.isFinite(p.score));
});

test('nonfiction structure uses argument evidence and never fiction substitutions',()=>{
  const p=A.analyzePlot(nonfictionText(),{}, {primary:'nonfiction'});
  assert.equal(p.arc,'nonfiction');
  assert.equal(p.applicable,true);
  assert.ok(p.thesisSignals>0);
  assert.ok(p.evidenceSignals>0);
  assert.ok(p.transitionSignals>0);
  assert.ok(p.synthesisSignals>0);
  assert.equal(p.hasClimax,null);
  assert.equal(p.hasResolution,null);
});

test('dialogue score reports observed candidates, not invented literary subscores',()=>{
  const one=A.analyzeDialogue(fictionText(),{primary:'fiction'});
  assert.equal(one.applicable,false,'one line is too few to score a density');
  assert.equal(one.score,null);
  const lines=Array.from({length:12},(_,i)=>'"We leave at dawn and we take the north road, whatever the guards say," '+(i%2?'Mara':'Jonas')+' said.').join('\n\n');
  const d=A.analyzeDialogue(fictionText()+'\n\n'+lines,{primary:'fiction'});
  assert.equal(d.applicable,true);
  assert.ok(Number.isFinite(d.score));
  assert.ok(Number.isFinite(d.candidateCount));
  assert.ok(Number.isFinite(d.candidatesPer100));
  assert.equal(d.naturalness,null);
  assert.equal(d.purposefulness,null);
});

test('overall bundle renormalizes around non-applicable dimensions',()=>{
  const base={plot:80,transitions:70,copy:90,line:75,style:80,dialogue:null,showTell:null,grammar:95,clarity:85,discipline:80,efficiency:90,engagement:75,momentum:70};
  const b=A._computeScoreBundle(base);
  assert.ok(Number.isFinite(b.overall));
  assert.ok(b.overall>=0&&b.overall<=100);
  assert.ok(Number.isFinite(b.subScores.narrativeHealth));
  assert.ok(Number.isFinite(b.subScores.languageQuality));
});
