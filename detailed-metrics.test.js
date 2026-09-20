'use strict';
// The Detailed tab must show numbers read off the manuscript. These pin the four that were
// not: names counted from sentence-initial capitals, a lexical ratio that fell with length,
// a pacing sub-score floored by an uncapped count, and a heatmap that saw only exposition.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
globalThis.ProseContext=require('./prose-context');globalThis.ProseNorms=require('./prose-norms');
eval(fs.readFileSync(require.resolve('./analyzer'),'utf8')+'; globalThis.Analyzer=Analyzer;');

test('names are words capitalised where grammar did not force it; sentence openers are not names',()=>{
  const t=['Your first job is to notice. Most people never do. Every morning you wake and let the story run. Consider what it costs.',
    'I grew up in Lagos with a mother who worked three jobs; Zara, my sister, worked two. Zara taught me patience. "Start now," Zara said.',
    'Take a piece of paper. Write down one goal. Whether you succeed matters less than whether you begin. Patience is not waiting.',
    'Research suggests that context shapes behaviour. Research is not a verdict. Research, at best, is a lamp.'].join('\n\n');
  const names=Analyzer.analyzeCharacters(t).list.map(c=>c.name);
  assert.ok(names.includes('Zara'),names.join(','));
  for(const w of ['Your','Most','Every','Consider','Take','Write','Whether','Patience','Research'])
    assert.ok(!names.includes(w),w+' is a sentence opener, not a name: '+names.join(','));
});

test('lexical diversity is stable across length instead of collapsing with it',()=>{
  const base='The harbour lay quiet under a thin morning haze, and Ola counted the boats twice before she trusted the number. Nothing moved but a heron, patient as a debt. She wrote the figure in the ledger, closed it, and walked the length of the pier to where the old man mended his nets with fingers that no longer felt the cold. ';
  const short=Analyzer.analyzeStyle(base.repeat(8));
  const long=Analyzer.analyzeStyle(base.repeat(200));
  assert.ok(Math.abs(short.lexicalDiversity-long.lexicalDiversity)<=3,'short '+short.lexicalDiversity+' vs long '+long.lexicalDiversity);
  assert.equal(long.lexicalMetric,'MSTTR-100');
  assert.ok(long.uniqueWords<=short.uniqueWords+1,'unique-word count is the raw figure and is reported separately');
});

test('pacing rhythm is not floored by counting quoted paragraphs, and no-dialogue prose is not capped at 45',()=>{
  const said='"'+'We should have left before the rain came, and now the road is gone and the bridge with it, so tell me what you would have me do,'.repeat(2)+'" she said, and then she said a great deal more about the bridge and the rain and the road, most of it repeated, until the paragraph ran well past eighty words and nobody in the room could remember how it had begun.';
  const plain='The road was gone. The bridge had gone with it. She counted what remained: a lamp, two ropes, and the long afternoon.';
  const heavy=Analyzer.analyzeLineEditing(Array(30).fill(said).join('\n\n')+'\n\n'+plain,'literary');
  assert.ok(heavy.pacing.score>0,'thirty long dialogue paragraphs cost a capped penalty, not the whole score: '+heavy.pacing.score);
  const none=Analyzer.analyzeLineEditing(Array(30).fill(plain).join('\n\n'),'selfHelp');
  assert.ok(none.pacing.score>45,'prose without dialogue can score above the old ceiling: '+none.pacing.score);
  const quotedTerm='He called it "grit". The word did the work of a paragraph. '.repeat(20);
  const terms=Analyzer.analyzeLineEditing(quotedTerm,'selfHelp');
  assert.equal(terms.pacing.longDialogueParagraphs,0,'a quoted term is not a dialogue paragraph');
});

test('a clean manuscript is not held under a hidden ceiling, and POV is N/A for nonfiction',()=>{
  const plain='The road was gone. The bridge had gone with it. She counted what remained: a lamp, two ropes, and the long afternoon nobody had asked for.';
  const nf=Analyzer.analyzeLineEditing(Array(30).fill(plain).join('\n\n'),'selfHelp');
  for(const dim of ['tone','precision','pacing','extraneous'])
    assert.ok(nf[dim].score>=80,dim+' can score high when nothing is wrong: '+nf[dim].score);
  assert.equal(nf.pov.score,null,'POV is not a nonfiction dimension');
  assert.equal(nf.flow.score,null,'word-overlap continuity is not judged for nonfiction');
  assert.equal(nf.flow.advisory,true);
  assert.ok(nf.score>=85,'the composite is over the applicable dimensions only: '+nf.score);
  const fic=Analyzer.analyzeLineEditing(Array(30).fill(plain).join('\n\n'),'literary');
  assert.ok(fic.pov.score>=90,'consistent third person: '+fic.pov.score);
  assert.ok(Number.isFinite(fic.flow.score),'fiction continuity is scored');
});

test('self-help dimensions are rates: the same book five times over scores the same',()=>{
  const chapter='You are tired, and you are not alone. Research shows that most people feel stuck. Start today: write down one goal. Try this exercise before you sleep. In my experience, this works, and the key is consistency. For example, a client once told me she had failed for years.';
  const once=Analyzer._analyzeSelfHelp(Array(6).fill(chapter).join('\n\n'),'book');
  const five=Analyzer._analyzeSelfHelp(Array(30).fill(chapter).join('\n\n'),'book');
  for(const k of ['clarityReadability','readerIdentification','practicalApplication','structureProgression','insightQuality','voiceAuthority','emotionalMomentum','evidenceSupport'])
    assert.ok(Math.abs(once[k]-five[k])<=2,k+': '+once[k]+' vs '+five[k]);
  assert.ok(once.practicalApplication<100,'a modest rate of actions does not saturate the dimension: '+once.practicalApplication);
  assert.match(once.evidence.practical,/\/1K imperatives/);
});

test('self-help dimension cards carry the counts they were built from',()=>{
  const t=Array(12).fill('You are tired. Research shows that most people feel stuck. Start today: write down one goal. In my experience, this works.').join('\n\n');
  const sh=Analyzer._analyzeSelfHelp(t,'book');
  for(const k of ['clarity','reader','practical','structure','insight','voice','momentum','evidence'])
    assert.match(sh.evidence[k],/\d/,k+' quotes a number');
  assert.match(sh.evidence.practical,/imperatives/);
  assert.match(sh.evidence.reader,/"you"/);
});

test('two-word names are kept whole and a sentence-opening word before them is trimmed',()=>{
  const t='Then Philip Gates arrived, and then the rain. Philip Gates had the letter. Everyone waited for Philip Gates, as everyone did. Every morning began the same way, and every evening too. Philip Gates smiled.';
  const list=Analyzer.analyzeCharacters(t,'literary').list;
  assert.ok(list.some(c=>c.name==='Philip Gates'),list.map(c=>c.name).join(','));
  assert.ok(!list.some(c=>/^(Then|Every|Everyone)/.test(c.name)),list.map(c=>c.name).join(','));
  assert.equal(Analyzer.analyzeCharacters(t,'selfHelp').applicable,false,'expository nonfiction reports the dimension as not applicable');
});

test('a stray "like" and one formal word are not a tonal clash',()=>{
  const t=('She looked like her mother and, subsequently, like nobody at all. The things she kept were small. ').repeat(40);
  const le=Analyzer.analyzeLineEditing(t,'literary');
  assert.ok(!le.findings.some(f=>f.type==='tone'),JSON.stringify(le.findings));
});

test('filter phrases are rated per thousand words, not counted raw',()=>{
  const body='The lamp burned low. She read the page again and did not believe it. '.repeat(400); // ~5,600 words
  const withFive=body+'She began to read. He started to speak. They continued to walk. She managed to smile. He attempted to explain.';
  const le=Analyzer.analyzeLineEditing(withFive,'literary');
  assert.ok(le.extraneous.score>=40,'five filter phrases in 5,600 words do not zero the score: '+le.extraneous.score);
  assert.equal(le.extraneous.filterPhrases,5);
});

test('the heatmap follows the passage classifier and can see more than exposition',()=>{
  const action='He ran for the gate. Bello grabbed his arm and shoved him back. The rope snapped. Zara leapt the ditch, stumbled, caught herself on the post. Behind them the herd burst through the fence. ';
  const dialogue='"You cannot go back," Oumar said. "Not tonight." Zara turned on him. "Watch me." "They will be waiting at the crossing," he said. "I know," she said. "That is the point." ';
  const exposition='Most people assume that poverty is a failure of effort. Research suggests otherwise: circumstance, opportunity and timing generally account for more variation than motivation does. You can work relentlessly and still lose ground. ';
  const t=action.repeat(8)+'\n\n'+dialogue.repeat(8)+'\n\n'+exposition.repeat(8);
  const pacing=Analyzer.analyzePacing(t);
  assert.equal(pacing.source,'passage-classifier');
  const types=new Set(pacing.segments.map(s=>s.type));
  assert.ok(types.has('action')&&types.has('dialogue')&&types.has('exposition'),[...types].join(','));
  assert.equal(pacing.segments.reduce((n,s)=>n+s.wordCount,0),t.trim().split(/\s+/).length);
});
