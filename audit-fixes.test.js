'use strict';
// Fixes from the six-dimension audit (plot, transitions, copy, line, style, dialogue). Each
// test is the false finding or the punished-normal-prose case that motivated the change.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
globalThis.ProseContext=require('./prose-context');globalThis.ProseNorms=require('./prose-norms');
eval(fs.readFileSync(require.resolve('./analyzer'),'utf8')+'; globalThis.Analyzer=Analyzer;');
const lit={primary:'literary'};

test('passive voice: a bare "-en" or "-ed" ending is not a participle',()=>{
  const t='It was then that she saw him. The gate was open. He was even taller. There were seven of them. That was when it began. The men were ten miles off. The sky was red. She was naked to the wind. It was indeed late.';
  assert.deepEqual(Analyzer.findPassiveVoice(t,lit).map(i=>i.text),[]);
  const real='The letter was written by Mara. The bridge had been broken. The door was shut. He was driven home.';
  assert.deepEqual(Analyzer.findPassiveVoice(real,lit).map(i=>i.text.split(/\s+by/)[0]),['was written','been broken','was shut','was driven']);
  assert.deepEqual(Analyzer.findPassiveVoice('She was gone. The tree had fallen.',lit),[],'gone and fallen are intransitive');
});

test('grammar: the subjunctive, speech cadence and a double object are not errors',()=>{
  const t='She spoke as if she were sure of it. I wish it were morning. If he were here, he would laugh. "Eh! you mustn\'t cry," she said. "My word! she\'s a plain little thing." They gave her her own way in everything.';
  assert.deepEqual(Analyzer.findGrammarIssues(t).map(i=>i.text),[]);
  const bad='She were tired. the road was long. He said the the word twice. "Go" he said.';
  assert.deepEqual(Analyzer.findGrammarIssues(bad).map(i=>i.text).sort(),['" he said','. t','She were','the the']);
  // The tag rule must read smart quotes too, and a comma before the closing quote is correct.
  assert.deepEqual(Analyzer.findGrammarIssues('“Go” he said. "Stay," she said.').map(i=>i.text),['” he said']);
});

test('repetition: no synonym table, tags and function words are not echoes',()=>{
  const t='"Yes," said Martha. "It tastes nice today," said Mary. There was a door in the wall. There was never a key to the door. She looked at the garden. She looked again.';
  const reps=Analyzer.findRepetitions(t);
  assert.ok(!reps.some(i=>/^(said|there|never)$/.test(i.text)),JSON.stringify(reps.map(i=>i.text)));
  const door=reps.find(i=>i.text==='door');
  assert.ok(door,'a content word that echoes is still reported');
  assert.doesNotMatch(door.suggestion,/Try:|entrance|threshold/,'no fixed alternatives');
  assert.equal(door.autoFix,false);
});

test('copy editing scores the set the workbench lists, without grammar',()=>{
  const issues=[{type:'passive'},{type:'grammar'},{type:'grammar'},{type:'adverb'}];
  assert.equal(Analyzer.scoreCopyEditing(issues,1000),Analyzer.scoreCopyEditing(issues.filter(i=>i.type!=='grammar'),1000));
});

test('transitions: dialogue exchanges and chapter headings are not judged as paragraph boundaries',()=>{
  const prose=(n)=>Array.from({length:n},(_,i)=>i%2?'The garden waited behind the wall, and the wall was older than the house.':'She walked the length of the wall again, looking for the door in the ivy.').join('\n\n');
  const exchange=Array.from({length:20},(_,i)=>i%2?'"No. Not tonight."':'"Are you coming?" Mara asked.').join('\n\n');
  const t=prose(8)+'\n\n'+exchange+'\n\nChapter 2\n\n'+prose(8);
  const r=Analyzer.analyzeTransitions(t);
  assert.ok(r.skipped.dialogue>=20,'dialogue boundaries counted, not scored: '+JSON.stringify(r.skipped));
  assert.ok(r.skipped.heading>=2,'heading boundaries counted, not scored');
  assert.equal(r.measuredBoundaries,r.details.length);
  assert.ok(r.details.every(d=>!/^["“]/.test(t.split(/\n\s*\n/)[d.toParagraph-1].trim())),'no measured boundary lands on a spoken line');
  assert.ok(r.score>=90,'the prose itself is continuous: '+r.score);
  const onlyDialogue=Analyzer.analyzeTransitions(exchange);
  assert.equal(onlyDialogue.score,null,'nothing to measure is not a zero');
  assert.match(onlyDialogue.reason,/dialogue/);
});

test('style: described not scored, and a first-person narrator is first person',()=>{
  const fp=Array.from({length:30},()=>'My sister waited at the gate. I told her the truth and she laughed at me. My father said nothing. He looked at his hands and I looked at mine.').join('\n\n');
  const s=Analyzer.analyzeStyle(fp);
  assert.equal(s.score,null);
  assert.equal(s.pov,'First Person');
  assert.equal(s.pronouns.first,180,'"My" at a sentence start is counted (six first-person words per paragraph, not four)');
  const third=Array.from({length:30},()=>'She waited at the gate. He told her the truth and she laughed at him. Her father said nothing.').join('\n\n');
  assert.equal(Analyzer.analyzeStyle(third).pov,'Third Person');
  const le=Analyzer.analyzeLineEditing(fp,'literary');
  assert.equal(le.pov.score,null);
  assert.ok(!le.findings.some(f=>f.type==='pov'),'no mixed-narration finding for a first-person narrator');
  const r=Analyzer.analyze(fp,'literary');
  assert.equal(r.scores.style,null);
  assert.ok(Number.isFinite(r.overall),'the overall renormalises without style');
});

test('dialogue: a tag adverb needs a speech verb, and a handful of lines is not scored',()=>{
  const lines=Array.from({length:12},(_,i)=>'"We leave at dawn and take the north road, whatever the guards say," '+(i%2?'Mara':'Jonas')+' said.');
  const clean=Analyzer.analyzeDialogue(lines.join('\n\n')+'\n\nIt was "not only" late but "for only" the second time. "How highly" they rated it.',lit);
  assert.equal(clean.adverbTags,0,'"not only" after a quote is not a tag adverb');
  const tagged=Analyzer.analyzeDialogue(lines.join('\n\n')+'\n\n"Go," she said softly. "Stay," said Mara coldly.',lit);
  assert.equal(tagged.adverbTags,2);
  const few=Analyzer.analyzeDialogue('"Yes," she said.\n\n"Fine."\n\n"We leave at dawn," he said.',lit);
  assert.equal(few.score,null);
  assert.equal(few.applicable,false);
});
