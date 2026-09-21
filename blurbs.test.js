'use strict';
// Back-cover material must be the author's sentences with a stated basis, never lines the
// engine wrote, and a nonfiction book must not be handed a protagonist and a crisis.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
globalThis.ProseContext=require('./prose-context');globalThis.ProseNorms=require('./prose-norms');
eval(fs.readFileSync(require.resolve('./analyzer'),'utf8')+'; globalThis.Analyzer=Analyzer;');

const INVENTED=/must face a choice|one chance to survive|lose everything|no turning back|Nothing will ever be the same|Some doors, once opened|The countdown has begun|has become a fight for/;

function selfHelp(){
  const filler='Most people assume that effort is the whole story. Research generally suggests otherwise, and the pattern repeats in every city I have worked in. ';
  let t='Introduction\n\nSit with me for a moment. If that’s you, take a seat. I wrote this for you.\n\nNow, perhaps you feel like you are doing everything right and still coming up short—carrying invisible weight, performing fine while struggling.\n\nWhen I arrived in the United States, I carried one bag and a pair of shoes.\n\n';
  for(let c=1;c<=8;c++){t+='Chapter '+c+': Practice '+c+'\n\n';for(let i=0;i<40;i++)t+=filler+'\n\n';t+='Action: Write down one belief you want to test this week.\n\nAccording to a 2019 study, small habits compound.\n\n';}
  return t;
}
// Paragraphed like a book (the framework slices by paragraph), with a short first chapter so
// the inciting line at the top of chapter 2 falls inside the first quarter.
function novel(){
  const para=(s,n)=>{let out='';for(let i=0;i<n;i++){out+=s;if(i%10===9)out+='\n\n';}return out;};
  let t='Chapter 1\n\nMara wanted the harbour and nothing else. Mara walked the pier each morning and counted the boats.\n\n';
  t+=para('Mara watched the water while Daniel mended the nets, and the town went on as it always had. ',60);
  t+='\n\nChapter 2\n\nThen one day a letter arrived for Mara, and Daniel would not say who had sent it.\n\n';
  t+=para('Mara read it twice. Daniel said nothing. The harbour was quiet and the fear in the town grew like weather. ',120);
  t+='\n\nChapter 3\n\nBut Daniel had lied about the letter, and Mara knew it.\n\n';
  t+=para('Mara decided she must find the sender before the storm. Daniel followed her along the pier. ',120);
  t+='\n\nChapter 4\n\nEverything Mara had built was lost in a single night.\n\n';
  t+=para('Mara stood at the edge of the pier. If she left now she would lose the harbour, the boats, and Daniel. ',120);
  return t;
}

test('a nonfiction book gets material by role, not a protagonist and a crisis',()=>{
  const r=Analyzer.analyze(selfHelp(),'selfHelp');
  const b=r.blurbs;
  assert.equal(b.available,true);
  assert.equal(b.kind,'material');
  assert.ok(!('protagonist' in b),'no protagonist is invented for a self-help book');
  assert.ok(!JSON.stringify(b).match(INVENTED),'no fiction filler anywhere');
  assert.ok(b.material.promise.rows.some(row=>/I wrote this for you/.test(row.text)),JSON.stringify(b.material.promise));
  assert.ok(b.material.problem.rows.some(row=>/coming up short/.test(row.text)));
  assert.ok(b.material.authorStake.rows.some(row=>/When I arrived/.test(row.text)));
  assert.ok(b.material.promise.rows.every(row=>typeof row.section==='string'),'every row says where it came from');
});

test('fiction answers carry the basis they were chosen on, and missing beats are gaps, not filler',()=>{
  const r=Analyzer.analyze(novel(),'literary');
  const b=r.blurbs;
  assert.equal(b.kind,'framework');
  assert.equal(b.protagonist,'Mara');
  for(const key of ['statusQuo','incitingIncident','conflict','attempt','crisis','stakes']){
    assert.ok(b.framework[key].basis.length>20,key+' states its basis');
  }
  assert.match(b.framework.statusQuo.basis,/wants, needs or hopes/);
  assert.match(b.framework.incitingIncident.basis,/containing “(arrived|one day)”/i);
  for(const bl of b.blurbs){
    assert.ok(!INVENTED.test(bl.text),bl.style+' contains an invented line: '+bl.text);
    assert.ok(Number.isFinite(bl.gaps));
  }
  // The three shapes that used to end on a stock closer now end on a gap the author writes;
  // the other two may end on a manuscript sentence when every beat was found.
  for(const style of ['Question Hook','Stakes Forward','Cinematic']){
    const bl=b.blurbs.find(x=>x.style===style);
    assert.ok(bl.gaps>=1,style+' leaves its closing line to the author');
    assert.match(bl.text,/\[[^\]]+\]\s*$/,style+' ends on a gap, not an invented line');
  }
});

test('tone is a rate per thousand words, and a handful of dark words in a long book is not "dark"',()=>{
  let t='Chapter 1\n\n';for(let i=0;i<1500;i++)t+='She walked to the market and bought bread, then carried it home along the river. ';
  t+='The fear passed. The dark came early. Fear again, and the dark, and a shadow, and one more fear.';
  const b=Analyzer.analyze(t,'literary').blurbs;
  assert.ok(b.toneRates&&Number.isFinite(b.toneRates.dark));
  assert.ok(b.toneRates.dark<1,'six words in twenty thousand: '+b.toneRates.dark);
  assert.equal(b.toneDetected,'no dominant tone vocabulary');
});
