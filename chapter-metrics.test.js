'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Parser=require('./manuscript-parser'),CM=require('./chapter-metrics');

const CLEAN='She crossed the compound before dawn and waited by the gate for the riders to arrive. Oumar counted the herd twice and found nothing wrong with the ledger. ';
const PASSIVE='The gate was opened by the guard. The herd was counted by Oumar. The rope was pulled by the boy. ';

// Issues carry offsets into the full text; the module buckets them by chapter span.
function issuesFor(text,phrase,type){
  const out=[];let at=text.indexOf(phrase);
  while(at!==-1){out.push({type,index:at,length:phrase.length});at=text.indexOf(phrase,at+phrase.length);}
  return out;
}
function book(bodyFor,chapters=8,repeats=14){
  let text='';
  for(let c=1;c<=chapters;c++){text+='Chapter '+c+'\n\n';for(let i=0;i<repeats;i++)text+=bodyFor(c)+'\n\n';}
  return text;
}

test('a book with no standout chapter reports no outliers',()=>{
  const text=book(()=>CLEAN);
  const report=CM.analyze(Parser.parse(text),{issues:issuesFor(text,'was opened by','passive')});
  assert.equal(report.applicable,true);
  assert.equal(report.outliers.length,0);
});

test('a single loud chapter is isolated, and only that chapter',()=>{
  const text=book(c=>CLEAN+(c===5?PASSIVE:''));
  const report=CM.analyze(Parser.parse(text),{issues:issuesFor(text,'was opened by the guard','passive')});
  assert.equal(report.applicable,true);
  assert.equal(report.outliers.length,1);
  assert.equal(report.outliers[0].metric,'passive');
  assert.match(report.outliers[0].title,/Chapter 5/);
});

test('a measure absent everywhere else is high severity and quotes no ratio',()=>{
  const text=book(c=>CLEAN+(c===5?PASSIVE:''));
  const report=CM.analyze(Parser.parse(text),{issues:issuesFor(text,'was opened by the guard','passive')});
  const only=report.outliers[0];
  assert.equal(only.uniqueToChapter,true);
  assert.equal(only.ratio,null,'no ratio is claimed when the median is zero');
  assert.equal(only.severity,'high');
});

test('a proportional difference is reported as a multiple of the book’s own norm',()=>{
  // Every chapter has some passive voice; chapter 5 has far more.
  const text=book(c=>CLEAN+PASSIVE+(c===5?PASSIVE.repeat(4):''));
  const report=CM.analyze(Parser.parse(text),{issues:issuesFor(text,'was opened by the guard','passive')});
  const hit=report.outliers.find(o=>/Chapter 5/.test(o.title));
  assert.ok(hit,'the heavy chapter is flagged');
  assert.equal(hit.uniqueToChapter,false);
  assert.ok(hit.ratio>1.75,'ratio exceeds the reporting threshold');
  assert.ok(hit.median>0,'the median reflects the rest of the book');
});

test('too few chapters is declined honestly rather than guessed',()=>{
  const text=book(()=>CLEAN,2);
  const report=CM.analyze(Parser.parse(text),{issues:[]});
  assert.equal(report.applicable,false);
  assert.match(report.reason,/chapters/i);
  assert.deepEqual(report.outliers,[]);
});

test('front matter is never compared as a chapter',()=>{
  const text='Copyright 2026 by the author. All rights reserved.\n\n'+book(()=>CLEAN);
  const parsed=Parser.parse(text);
  const report=CM.analyze(parsed,{issues:[]});
  assert.equal(report.applicable,true);
  assert.ok(report.chapters.every(c=>!/front|copyright/i.test(c.title)),'no front-matter unit is measured');
});

test('missing or malformed input never throws',()=>{
  for(const parsed of [null,{},{chapters:[]},{chapters:[{id:'x',kind:'chapter',start:0,end:10,wordCount:5,text:'hi'}]}]){
    const report=CM.analyze(parsed,null);
    assert.equal(typeof report.applicable,'boolean');
    assert.ok(Array.isArray(report.outliers));
  }
});
