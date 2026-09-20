'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const PC=require('./prose-context'),PN=require('./prose-norms');

const SAMPLE={
  action:'He ran for the gate. Bello grabbed his arm and shoved him back. The rope snapped. Zara leapt the ditch, stumbled, caught herself on the post. Behind them the herd burst through the fence.',
  dialogue:'"You cannot go back," Oumar said. "Not tonight." Zara turned on him. "Watch me." "They will be waiting at the crossing," he said. "I know," she said. "That is the point."',
  reflection:'She wondered whether her mother had known. All those years she had believed the story, and now she was not sure she believed any of it. What did it mean to be told the truth so late? She remembered the kitchen and felt something turn over in her chest.',
  description:'The compound lay grey in the early light. Dust hung over the thorn fence, and the water in the trough had gone still and cold. Shadows pooled beneath the granary. Everything smelled faintly of smoke and dry grass.',
  exposition:'Most people assume that poverty is a failure of effort. Research suggests otherwise: circumstance, opportunity and timing generally account for more variation than motivation does. You can work relentlessly and still lose ground.'
};

test('each prose mode is identified from its own register',()=>{
  for(const [expected,text] of Object.entries(SAMPLE)){
    const got=PC.classifyParagraph(text);
    assert.equal(got.mode,expected,expected+' was classified as '+got.mode);
    assert.ok(got.confidence>0.15,expected+' should be identified with a real margin');
  }
});

test('an ambiguous or tiny paragraph is called mixed rather than forced into a mode',()=>{
  assert.equal(PC.classifyParagraph('He went.').mode,'mixed');
  assert.equal(PC.classifyParagraph('').mode,'mixed');
});

test('passage offsets map back to the source text',()=>{
  const text=SAMPLE.action+'\n\n'+SAMPLE.exposition;
  const passages=PC.classify(text);
  assert.equal(passages.length,2);
  for(const p of passages) assert.equal(text.slice(p.start,p.end),p.mode==='action'?SAMPLE.action:SAMPLE.exposition);
  assert.equal(PC.passageAt(passages,5).mode,'action');
  assert.equal(PC.passageAt(passages,text.length-5).mode,'exposition');
  assert.equal(PC.passageAt(passages,-1),null);
});

test('norms are derived per mode from the manuscript itself',()=>{
  const text=[SAMPLE.action,SAMPLE.action,SAMPLE.reflection,SAMPLE.reflection].join('\n\n');
  const norms=PN.sentenceNorms(text,PC.classify(text));
  assert.ok(norms.action,'action norm derived');
  assert.ok(norms.reflection,'reflection norm derived');
  assert.ok(norms.reflection.median>norms.action.median,
    'the book’s own reflective sentences run longer than its action sentences');
});

test('a long sentence typical of the author’s reflective writing is not counted against them',()=>{
  const long='She wondered whether her mother had known all along, and whether the knowing had cost her something she never named, because the story had been told so many times that it had worn smooth.';
  const text=Array.from({length:8},()=>long).join('\n\n');
  const passages=PC.classify(text);
  const issue={type:'sentence-length',index:text.indexOf(long),text:long};
  const result=PN.apply(text,[issue],passages);
  assert.equal(issue.contextSuppressed,true);
  assert.match(issue._context.reason,/typical of your reflection passages/);
  assert.equal(result.scored.length,0,'suppressed findings do not reach scoring');
});

test('the same length inside an action passage is raised, not excused',()=>{
  const tight='He ran for the gate. Bello grabbed his arm. The rope snapped. Zara leapt the ditch.';
  const bloated='He ran for the gate and grabbed the rope which had been left coiled by the post where Bello had dropped it earlier that morning before the herd burst through the fence.';
  const text=Array.from({length:10},()=>tight).join('\n\n')+'\n\n'+bloated;
  const passages=PC.classify(text);
  const issue={type:'sentence-length',index:text.indexOf(bloated),text:bloated};
  PN.apply(text,[issue],passages);
  assert.equal(issue.contextRaised,true);
  assert.equal(issue.contextSuppressed,undefined);
  assert.match(issue._context.reason,/action passage/);
});

test('passive voice is judged by where it sits',()=>{
  const expo='Poverty is generally understood as a failure of effort. The claim was repeated so often that it was rarely examined, and the evidence was usually ignored by most observers.';
  const expoIssue={type:'passive',index:expo.indexOf('was repeated'),text:'was repeated'};
  PN.apply(expo,[expoIssue],PC.classify(expo));
  assert.equal(expoIssue.contextSuppressed,true,'explanatory passive is register, not error');

  const act='He ran for the gate. The rope was pulled by the boy. Bello was struck hard and thrown back against the post.';
  const actIssue={type:'passive',index:act.indexOf('was pulled'),text:'was pulled'};
  PN.apply(act,[actIssue],PC.classify(act));
  assert.equal(actIssue.contextRaised,true,'action passive distances the reader');
});

test('every adjustment carries a reason the author can read',()=>{
  const text=Array.from({length:8},()=>SAMPLE.exposition).join('\n\n');
  const issues=[{type:'show-tell',index:10,text:'assume'},{type:'repetition',index:20,text:'poverty'}];
  PN.apply(text,issues,PC.classify(text));
  for(const issue of issues){
    if(!issue._context) continue;
    assert.ok(issue._context.reason.length>20,'reason is explanatory, not a code');
    assert.ok(['suppress','raise'].includes(issue._context.action));
    assert.ok(issue._context.mode);
  }
});

test('findings are annotated, never discarded',()=>{
  const text=Array.from({length:8},()=>SAMPLE.exposition).join('\n\n');
  const issues=[{type:'passive',index:text.indexOf('is generally'),text:'is generally understood'}];
  const result=PN.apply(text,issues,PC.classify(text));
  assert.equal(issues.length,1,'the original list still holds every finding');
  assert.equal(result.scored.length+result.suppressed.length,1);
});

test('malformed input never throws',()=>{
  for(const bad of [null,undefined,'',123,{}]){
    assert.doesNotThrow(()=>PC.classify(bad));
    assert.doesNotThrow(()=>PN.apply(bad,null,PC.classify(bad)));
  }
});
