'use strict';
// The manuscript mode decides which judgments are whole-book judgments. A text is called a full
// manuscript only on evidence (closing marker, novel length, the author's word), never because
// it has three chapter headings.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
globalThis.ProseContext=require('./prose-context');globalThis.ProseNorms=require('./prose-norms');
eval(fs.readFileSync(require.resolve('./analyzer'),'utf8')+'; globalThis.Analyzer=Analyzer;');
const para='Mara walked the length of the wall again, looking for the door in the ivy, and found only the wind. ';
const words=n=>Array.from({length:Math.ceil(n/18)},()=>para).join('');
const chapters=(from,to,perChapter)=>Array.from({length:to-from+1},(_,i)=>'Chapter '+(from+i)+'\n\n'+words(perChapter)).join('\n\n');

test('eight chapters of twenty thousand words are a partial manuscript, not a full one',()=>{
  const m=Analyzer.detectMode(chapters(1,8,2600));
  assert.equal(m.mode,'partial');
  assert.match(m.label,/^Partial manuscript \(chapters 1–8\)$/);
  assert.equal(m.wholeBook,false);
  assert.deepEqual(m.chapterRange,{first:1,last:8});
  assert.ok(m.reasons.some(r=>/under the 25,000/.test(r)),m.reasons.join(' | '));
});

test('a closing marker, novel length, or the author establishes a full manuscript',()=>{
  const ended=Analyzer.detectMode(chapters(1,8,2600)+'\n\nTHE END\n');
  assert.equal(ended.mode,'book');
  assert.ok(ended.closingMarker);
  const long=Analyzer.detectMode(chapters(1,12,2600));
  assert.equal(long.mode,'book','31,000 words is novel-length');
  const told=Analyzer.detectMode(chapters(1,8,2600),'book');
  assert.equal(told.mode,'book');
  assert.equal(told.confidence,'author');
  assert.equal(told.label,'Full Manuscript');
});

test('numbering that starts past one is a partial manuscript at any length',()=>{
  const m=Analyzer.detectMode(chapters(12,40,2600));
  assert.equal(m.mode,'partial');
  assert.match(m.reasons[0],/starts at 12/);
});

test('an excerpt, a single chapter, and roman or spelled-out numbering',()=>{
  assert.equal(Analyzer.detectMode(words(900)).mode,'excerpt');
  assert.equal(Analyzer.detectMode(words(3000)).mode,'chapter');
  assert.equal(Analyzer.detectMode('Chapter One\n\n'+words(3000)).mode,'chapter','one heading is one chapter');
  const roman=Analyzer.detectMode(['I','II','III','IV'].map(n=>'CHAPTER '+n+'. A TITLE\n\n'+words(2000)).join('\n\n'));
  assert.equal(roman.mode,'partial');
  assert.deepEqual(roman.chapterRange,{first:1,last:4});
});

test('whole-book structure findings wait for a full manuscript; the author can supply that',()=>{
  const quiet='She sat by the window and thought about the years that had passed since the house was sold, and about what her mother would have said of the garden now. ';
  const scene='"Run!" Mara shouted. Behind her Daniel grabbed the rope and pulled. The door slammed. "Now," she said to Daniel. They ran for the gate. ';
  const unit=(s,q)=>Array.from({length:q},()=>quiet.repeat(2)).concat(Array.from({length:s},()=>scene.repeat(2))).join('\n\n');
  const book=[8,8,2,2,2,2,2,2].map((n,i)=>'Chapter '+(i+1)+'\n\n'+unit(n,8)).join('\n\n');
  const auto=Analyzer.analyze(book,'literary');
  assert.equal(auto.manuscriptMode.mode,'partial');
  const ids=auto.plot.findings.map(f=>f.id);
  assert.ok(!ids.includes('ending-drop')&&!ids.includes('peak-early'),'no ending or climax judgment on a partial: '+ids.join());
  assert.ok(auto.plot.notAssessed.some(s=>/not confirmed as a full manuscript/.test(s)));
  const confirmed=Analyzer.analyze(book,'literary',{modeOverride:'book'});
  assert.equal(confirmed.manuscriptMode.mode,'book');
  assert.equal(confirmed.manuscriptMode.confidence,'author');
  const ids2=confirmed.plot.findings.map(f=>f.id);
  assert.ok(ids2.includes('ending-drop')&&ids2.includes('peak-early'),ids2.join());
});
