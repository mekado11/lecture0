'use strict';
// Plot Structure is measured from how a manuscript is built (units, scene-versus-summary
// share per unit, peak placement and release, unit-length control, cast persistence), not
// from a lexicon of tension words. These tests pin the ordering and the provenance.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
globalThis.ProseContext=require('./prose-context');globalThis.ProseNorms=require('./prose-norms');
eval(fs.readFileSync(require.resolve('./analyzer'),'utf8')+'; globalThis.Analyzer=Analyzer;');
const lit={primary:'literary'};
const quiet='She sat by the window and thought about the years that had passed since the house was sold, and about what her mother would have said of the garden now, and whether anyone remembered the roses. ';
const scene='"Run!" Mara shouted. Behind her Daniel grabbed the rope and pulled. The door slammed. Mara ducked, rolled, and came up with the knife. "Now," she said to Daniel. "Go now." They ran for the gate. ';
const unit=(sceneN,quietN)=>Array.from({length:quietN},()=>quiet.repeat(2)).concat(Array.from({length:sceneN},()=>scene.repeat(2))).join('\n\n');
const book=profile=>profile.map((n,i)=>'Chapter '+(i+1)+'\n\n'+unit(n,8)).join('\n\n');

test('a late peak with a release outranks an early peak, which outranks a flat book',()=>{
  const late=Analyzer.analyzePlot(book([2,2,2,2,2,6,8,3]),'book',lit);
  const early=Analyzer.analyzePlot(book([8,8,2,2,2,2,2,2]),'book',lit);
  const flat=Analyzer.analyzePlot(book([4,4,4,4,4,4,4,4]),'book',lit);
  assert.ok(late.score>early.score&&early.score>flat.score,[late.score,early.score,flat.score].join(' > '));
  assert.equal(late.unitSource,'chapter');
  assert.equal(late.unitCount,8);
  assert.equal(late.curve.peakIndex,7,'the most scene-heavy unit is where the scenes are');
  assert.equal(late.curve.release,true);
  assert.equal(early.curve.release,true);
  assert.ok(early.curve.peakPosition<0.5);
  assert.equal(flat.components.rhythm.value,0,'no variation is measured as no variation');
  assert.ok(!flat.components.shape&&flat.notAssessed.some(s=>/flat/.test(s)),'a flat book has no peak to place, and is not penalised twice');
  assert.match(late.components.cast.basis,/2 of 2 named characters recur .* (Mara|Daniel) present in 8 of 8 units/);
});

test('no headings or breaks: equal segments cut at paragraph boundaries, and no arc shape on a chapter',()=>{
  const t=unit(2,8)+'\n\n'+unit(6,8)+'\n\n'+unit(3,8);
  const p=Analyzer.analyzePlot(t,'chapter',lit);
  assert.equal(p.unitSource,'segment');
  assert.ok(p.unitCount>=3);
  assert.ok(p.notAssessed.some(s=>/not a full manuscript/.test(s)),'peak placement is not judged on a single chapter');
  assert.ok(!p.components.shape);
  assert.ok(Number.isFinite(p.score));
  const breaks=[unit(2,8),unit(6,8),unit(3,8),unit(1,8)].join('\n\n* * *\n\n');
  assert.equal(Analyzer.analyzePlot(breaks,'chapter',lit).unitSource,'scene-break');
});

test('too little text is not measured, and every unit carries its provenance',()=>{
  const p=Analyzer.analyzePlot(unit(1,3),'excerpt',lit);
  assert.equal(p.score,null);
  assert.equal(p.applicable,false);
  const full=Analyzer.analyzePlot(book([2,3,4,5]),'book',lit);
  for(const u of full.units){
    assert.ok(u.label&&Number.isFinite(u.words)&&Number.isFinite(u.sceneShare)&&Number.isFinite(u.classifiedShare));
    assert.ok(Array.isArray(u.cast));
  }
  assert.match(full.methodology,/not measured/);
  assert.equal(full.hasRisingAction,null,'no keyword arc labels survive');
});

test('the analysis pipeline feeds the structure score and its basis into scores and evidence',()=>{
  const r=Analyzer.analyze(book([2,2,3,6,8,3]),'literary');
  assert.equal(r.plot.arc,'structure');
  assert.equal(r.scores.plot,r.plot.score);
  assert.ok(r.plot.units.length>=4);
  assert.ok(r.plot.cast.lead,'the lead is named from the same character analysis the cast tab uses');
});
