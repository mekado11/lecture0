'use strict';
// Narrative and Argument Structure are described, not scored. Units come from headings, scene
// breaks or equal segments; each unit's scene (or illustration) share comes from the passage
// classifier; findings are phrased for the author and point at units. These tests pin that.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
globalThis.ProseContext=require('./prose-context');globalThis.ProseNorms=require('./prose-norms');
eval(fs.readFileSync(require.resolve('./analyzer'),'utf8')+'; globalThis.Analyzer=Analyzer;');
const lit={primary:'literary'},nf={primary:'philosophy'};
const quiet='She sat by the window and thought about the years that had passed since the house was sold, and about what her mother would have said of the garden now, and whether anyone remembered the roses. ';
const scene='"Run!" Mara shouted. Behind her Daniel grabbed the rope and pulled. The door slammed. Mara ducked, rolled, and came up with the knife. "Now," she said to Daniel. "Go now." They ran for the gate. ';
const unit=(sceneN,quietN)=>Array.from({length:quietN},()=>quiet.repeat(2)).concat(Array.from({length:sceneN},()=>scene.repeat(2))).join('\n\n');
const book=profile=>profile.map((n,i)=>'Chapter '+(i+1)+'\n\n'+unit(n,8)).join('\n\n');
const ids=p=>p.findings.map(f=>f.id);

test('structure is described, not scored, and the overall renormalises without it',()=>{
  const r=Analyzer.analyze(book([2,2,3,6,8,3]),'literary');
  assert.equal(r.plot.score,null);
  assert.equal(r.plot.scored,false);
  assert.equal(r.scores.plot,null);
  assert.ok(Number.isFinite(r.overall));
  assert.equal(r.plot.arc,'structure');
  assert.match(r.plot.methodology,/not scored/);
  assert.match(r.plot.methodology,/Stakes, causality/);
});

test('findings name the unit and the measurement: a spike, a drop near the ending, an early peak, a flat book',()=>{
  const early=Analyzer.analyzePlot(book([8,8,2,2,2,2,2,2]),'book',lit);
  assert.ok(ids(early).includes('heavy'),ids(early).join());
  const heavy=early.findings.find(f=>f.id==='heavy');
  assert.equal(heavy.unit,1);
  assert.match(heavy.title,/^Chapter 1 is unusually scene-heavy$/);
  assert.match(heavy.text,/% of it is action or dialogue, against a typical \d+% in this manuscript/);
  assert.ok(ids(early).includes('ending-drop'),'the final third is far below the rest: '+ids(early).join());
  const drop=early.findings.find(f=>f.id==='ending-drop');
  assert.match(drop.title,/falls away near the ending/);
  assert.match(drop.text,/Chapter 6 to Chapter 8 average \d+% action or dialogue, against \d+%/);
  assert.ok(ids(early).includes('peak-early'));
  const late=Analyzer.analyzePlot(book([2,2,2,2,2,6,8,3]),'book',lit);
  assert.ok(!ids(late).includes('ending-drop')&&!ids(late).includes('peak-early'),ids(late).join());
  const flat=Analyzer.analyzePlot(book([4,4,4,4,4,4,4,4]),'book',lit);
  assert.ok(ids(flat).includes('flat'));
  assert.ok(!ids(flat).includes('peak-early'),'a flat book has no peak to place');
  // Cast persistence comes from the same character analysis as the cast tab.
  const cast=late.findings.find(f=>f.id==='cast');
  assert.match(cast.title,/2 of 2 named characters appear in more than one chapter/);
  assert.match(cast.text,/(Mara|Daniel), the most-mentioned, appears in 8 of 8 chapters/);
  assert.equal(cast.info,true,'a persistent cast is information, not a flag');
});

test('units carry what the editor needs to jump to them',()=>{
  const p=Analyzer.analyzePlot(book([2,3,4,5]),'book',lit);
  assert.equal(p.unitSource,'chapter');
  for(const u of p.units){
    assert.ok(u.index&&u.label&&u.heading&&/^Chapter \d+$/.test(u.heading));
    assert.ok(u.opening.startsWith('She sat by the window'),'the first words after the heading: '+u.opening);
    assert.ok(Number.isFinite(u.words)&&Number.isFinite(u.sceneShare));
  }
  assert.match(p.overview,/^4 chapters from headings\. Action or dialogue ranges from \d+% to \d+% of a chapter, highest in Chapter \d\.$/);
});

test('no headings or breaks: equal segments; capitalised titles count as headings; too little text is not measured',()=>{
  const seg=Analyzer.analyzePlot(unit(2,8)+'\n\n'+unit(6,8)+'\n\n'+unit(3,8),'chapter',lit);
  assert.equal(seg.unitSource,'segment');
  assert.ok(seg.notAssessed.some(s=>/not a full manuscript/.test(s)));
  const caps=['THE GATE','THE ROPE','THE KNIFE','THE ROAD'].map((t,i)=>t+'\n\n'+unit(i+2,8)).join('\n\n');
  const c=Analyzer.analyzePlot(caps,'book',lit);
  assert.equal(c.unitSource,'chapter');
  assert.deepEqual(c.units.map(u=>u.label),['THE GATE','THE ROPE','THE KNIFE','THE ROAD']);
  const breaks=Analyzer.analyzePlot([unit(2,8),unit(6,8),unit(3,8),unit(1,8)].join('\n\n* * *\n\n'),'chapter',lit);
  assert.equal(breaks.unitSource,'scene-break');
  const short=Analyzer.analyzePlot(unit(1,3),'excerpt',lit);
  assert.equal(short.applicable,false);
  assert.equal(short.score,null);
  assert.deepEqual(short.findings,[]);
});

// Nonfiction: the same skeleton read for an argument.
const claim='Most people assume that discipline is a matter of effort. Research generally suggests that it is a matter of environment: the systems around a person decide what is easy, and habits follow what is easy. Therefore the question is not how hard you try but what your surroundings make automatic. ';
const story='Consider Elena, a nurse in Leeds. She kept a running shoe on the kitchen table and ran every morning for a year. When she moved the shoe to the cupboard, she stopped within a week. Her sister laughed and moved it back. ';
const nfUnit=(storyN,claimN,connective=true)=>Array.from({length:claimN},(_,i)=>(connective&&i%2?'However, ':'')+claim.repeat(2)).concat(Array.from({length:storyN},()=>story.repeat(2))).join('\n\n');
const nfBook=(profile,thin=-1)=>profile.map((n,i)=>'Chapter '+(i+1)+': Systems\n\n'+nfUnit(n,8,i!==thin)).join('\n\n');

test('nonfiction structure: illustration against exposition per chapter, signposting, key terms; no thesis-phrase lexicon',()=>{
  const p=Analyzer.analyzePlot(nfBook([1,1,6,1,1,1],3),'book',nf);
  assert.equal(p.arc,'nonfiction-structure');
  assert.equal(p.score,null);
  assert.equal(p.unitSource,'chapter');
  assert.equal(p.unitCount,6);
  assert.ok(p.units.every(u=>Number.isFinite(u.illustrationShare)&&Number.isFinite(u.signpostRate)));
  assert.ok(ids(p).includes('heavy'),ids(p).join());
  const heavy=p.findings.find(f=>f.id==='heavy');
  assert.equal(heavy.unit,3);
  assert.match(heavy.title,/is unusually illustration-heavy$/);
  assert.match(heavy.text,/example, story or scene/);
  const sign=p.findings.find(f=>f.id==='signposting');
  assert.ok(sign&&sign.unit===4,'the chapter with no connectives is named: '+JSON.stringify(sign));
  assert.match(sign.text,/0 of its \d+ paragraphs open with a connective/);
  const concepts=p.findings.find(f=>f.id==='concepts');
  assert.ok(concepts,'key terms are the argument’s cast');
  assert.match(concepts.text,/appears in \d+ of 6 chapters/);
  assert.ok(!('thesisSignals' in p),'no claim-phrase counting survives');
  assert.match(p.methodology,/Whether the argument is sound is not measured/);
});

test('nonfiction findings are quiet when nothing stands out, and the pipeline routes nonfiction here',()=>{
  const even=Analyzer.analyzePlot(nfBook([2,2,2,2,2,2]),'book',nf);
  assert.ok(!ids(even).includes('heavy')&&!ids(even).includes('light')&&!ids(even).includes('signposting'),ids(even).join());
  const r=Analyzer.analyze(nfBook([1,1,6,1,1,1]),'philosophy');
  assert.equal(r.plot.arc,'nonfiction-structure');
  assert.equal(r.scores.plot,null);
});

// The manuscript from the report: real chapters interleaved with ~110-word recap pages headed
// "Chapter N — …". Recaps must not set the typical length, invert the length finding, or add
// zeros to the curve.
test('recap and summary pages are folded into the chapter before them, not counted as chapters',()=>{
  const chapter=i=>'Chapter '+i+': Systems\n\n'+nfUnit(i%3===0?2:1,14);
  const recap=i=>'Chapter '+i+' — Recap: the starting point\n\nRemember the one idea from this chapter. Write it down, keep it near you, and return to it before you read on. That is the whole exercise for today, and it is enough. '.repeat(3);
  const parts=[];for(let i=1;i<=12;i++){parts.push(chapter(i));if(i%2===0)parts.push(recap(i));}
  for(let i=1;i<=6;i++)parts.push(recap(i));
  const p=Analyzer.analyzePlot(parts.join('\n\n'),'book',nf);
  assert.equal(p.unitCount,12,'twelve chapters, not '+p.unitCount);
  assert.equal(p.folded,12);
  assert.match(p.overview,/12 short headed sections \(recaps, summaries or contents pages\) are counted with the chapter before them/);
  assert.ok(p.units.every(u=>u.words>=300),'no recap-sized unit survives');
  const len=p.findings.find(f=>f.id==='length');
  assert.ok(len.info||len.units.length<=2,'the real chapters are the norm, not the outliers: '+len.title);
  assert.ok(!/ and .* and .* and /.test(len.text),'outliers are listed briefly');
});

test('an early peak is reported only when the peak stands out from the typical chapter',()=>{
  const slight=Analyzer.analyzePlot(book([3,2,2,2,2,2,2,2]),'book',lit);
  const p=slight.curve;
  assert.ok(!slight.findings.some(f=>f.id==='peak-early'),'a few points above typical is not a finding: '+JSON.stringify(p));
  const strong=Analyzer.analyzePlot(book([8,8,2,2,2,2,2,2]),'book',lit);
  assert.ok(strong.findings.some(f=>f.id==='peak-early'));
});

test('self-help argument progression is described from the unit model, and the overall renormalises without it',()=>{
  const book=nfBook([1,1,6,1,1,1],3);
  const r=Analyzer.analyze(book,'selfHelp');
  const sh=r.selfHelpScores;
  assert.equal(sh.structureProgression,null);
  assert.ok(!/this book argues|in conclusion|thesis/i.test(sh.plain.structure),'no phrase-lexicon verdict: '+sh.plain.structure);
  assert.match(sh.plain.structure,/illustration|signpost|chapter|key terms/i);
  const w={clarityReadability:.15,readerIdentification:.15,practicalApplication:.15,insightQuality:.15,voiceAuthority:.10,emotionalMomentum:.10,evidenceSupport:.05};
  let tot=0,wt=0;for(const k in w){tot+=sh[k]*w[k];wt+=w[k];}
  assert.equal(r.overall,Math.round(tot/wt),'the overall is the weighted mean of the seven scored dimensions');
  assert.equal(Analyzer.recalcOverall(r),r.overall,'recalculation agrees with the first pass');
  assert.equal(typeof Analyzer._analyzeArgumentStructure,'undefined','the phrase-lexicon model is gone');
});
