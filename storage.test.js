'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const createFixture=require('./demo-firebase');
const Storage=require('./storage');
global.ManuscriptParser=require('./manuscript-parser');
global.Analyzer={analyze:text=>({overall:text.length,scores:{},genre:{label:'Fantasy'}})};
function setup(){
  const fixture=createFixture();global.firebase=fixture.firebase;
  Storage.db=fixture.db;Storage.userId=fixture.user.uid;Storage._writes=new Map();Storage._revisions=new Map();
  return fixture;
}
test('Unicode chunks obey byte budget and reconstruct exactly',()=>{
  const text='🪶é故事abc'.repeat(100);
  const parts=Storage._splitChapterText(text,31);
  assert.equal(parts.join(''),text);
  parts.forEach(part=>assert.ok(Buffer.byteLength(part)<=31));
});
test('failed replacement keeps the last committed draft readable',async()=>{
  const f=setup();const id=await Storage.saveManuscript('draft.txt','Chapter 1\nOld draft',null);
  f.fail=(op,path)=>path.includes('/chapters/');
  await assert.rejects(Storage.updateManuscript(id,'New draft',null));
  assert.equal((await Storage.getManuscript(id)).text,'Chapter 1\nOld draft');
});
test('failed root commit leaves the prior generation intact',async()=>{
  const f=setup();const id=await Storage.saveManuscript('draft.txt','Original',null);
  f.fail=(op,path)=>path.endsWith('/'+id);
  await assert.rejects(Storage.updateManuscript(id,'Replacement',null));
  assert.equal((await Storage.getManuscript(id)).text,'Original');
});
test('same-name drafts have distinct identities and serialized writes retain last edit',async()=>{
  setup();const a=await Storage.saveManuscript('draft.txt','One',null),b=await Storage.saveManuscript('draft.txt','Two',null);
  assert.notEqual(a,b);assert.equal((await Storage.getManuscripts()).length,2);
  await Promise.all([Storage.updateManuscript(a,'Three',null),Storage.updateManuscript(a,'Four',null)]);
  assert.equal((await Storage.getManuscript(a)).text,'Four');
});
test('snapshots publish last and restore protects unsaved working text',async()=>{
  const f=setup();const id=await Storage.saveManuscript('draft.txt','Original',null);
  f.fail=(op,path)=>path.includes('/parts/');
  await assert.rejects(Storage.saveVersion(id,null,'Broken'));
  assert.equal((await Storage.getVersions(id)).length,0);
  f.fail=null;const version=await Storage.saveVersion(id,null,'Original');
  await Storage.updateManuscript(id,'Saved edit',null);
  assert.equal(await Storage.restoreVersion(id,version,null,'Unsaved edit'),'Original');
  const safety=(await Storage.getVersions(id)).find(v=>v.reason==='before_restore');
  assert.equal((await Storage.getVersion(id,safety.id)).text,'Unsaved edit');
});
test('truncated snapshots and drafts are rejected, not silently restored',async()=>{
  const f=setup();const id=await Storage.saveManuscript('draft.txt','Original',null);
  const version=await Storage.saveVersion(id,null,'Original');
  for(const key of [...f.records.keys()])if(key.includes('/parts/'))f.records.delete(key);
  await assert.rejects(Storage.getVersion(id,version),/incomplete/);
  for(const key of [...f.records.keys()])if(key.includes('/chapters/'))f.records.delete(key);
  await assert.rejects(Storage.getManuscript(id),/incomplete/);
});
test('legacy inline and chunked manuscripts remain readable',async()=>{
  const f=setup(),base='users/test-author/manuscripts/';
  f.records.set(base+'inline',{text:'Legacy inline',schemaVersion:2});
  f.records.set(base+'original',{text:'Original schema-less draft'});
  f.records.set(base+'chunked',{schemaVersion:2,textLength:6});
  f.records.set(base+'chunked/chapters/b',{index:1,partIndex:0,text:'def'});
  f.records.set(base+'chunked/chapters/a',{index:0,partIndex:0,text:'abc'});
  assert.equal((await Storage.getManuscript('inline')).text,'Legacy inline');
  assert.equal((await Storage.getManuscript('original')).text,'Original schema-less draft');
  assert.equal((await Storage.getManuscript('chunked')).text,'abcdef');
});
test('deleting a manuscript removes snapshots and their parts',async()=>{
  const f=setup(),id=await Storage.saveManuscript('draft.txt','Original',null);
  await Storage.saveVersion(id,null,'Original');
  await Storage.deleteManuscript(id);
  assert.ok(![...f.records.keys()].some(key=>key.includes('/manuscripts/'+id)));
});
test('stale device cannot overwrite a newer committed manuscript',async()=>{
  setup();const id=await Storage.saveManuscript('draft.txt','Original',null);
  const other={...Storage,_writes:new Map(),_revisions:new Map()};
  await other.getManuscript(id);
  await Storage.updateManuscript(id,'Device one edit',null);
  await assert.rejects(other.updateManuscript(id,'Device two stale edit',null),/another device/i);
  assert.equal((await Storage.getManuscript(id)).text,'Device one edit');
});
test('simultaneous device commits publish only one winner',async()=>{
  setup();const id=await Storage.saveManuscript('draft.txt','Original',null);
  const other={...Storage,_writes:new Map(),_revisions:new Map()};
  await other.getManuscript(id);
  const results=await Promise.allSettled([
    Storage.updateManuscript(id,'One',null),other.updateManuscript(id,'Two',null)
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.ok(['One','Two'].includes((await Storage.getManuscript(id)).text));
});
test('reader retries when a concurrent save removes the generation it started reading',async()=>{
  const f=setup(),id=await Storage.saveManuscript('draft.txt','Original',null);
  const reader={...Storage,_writes:new Map(),_revisions:new Map()};
  f.beforeQuery=async path=>{
    if(path.endsWith('/chapters')){
      f.beforeQuery=null;
      await Storage.updateManuscript(id,'Concurrent newer draft',null);
    }
  };
  assert.equal((await reader.getManuscript(id)).text,'Concurrent newer draft');
});
test('same-length corruption is detected in manuscripts and snapshots',async()=>{
  const f=setup(),id=await Storage.saveManuscript('draft.txt','Original',null);
  const version=await Storage.saveVersion(id,null,'Original');
  for(const [key,data] of f.records){
    if(key.includes('/chapters/')||key.includes('/parts/'))f.records.set(key,{...data,text:'Tampered'});
  }
  await assert.rejects(Storage.getManuscript(id),/integrity/i);
  await assert.rejects(Storage.getVersion(id,version),/integrity/i);
});
test('new saves require a valid digest while legacy schema 3 stays readable',async()=>{
  const f=setup(),id=await Storage.saveManuscript('draft.txt','Original',null);
  const ref='users/test-author/manuscripts/'+id,record=f.records.get(ref);
  assert.equal(record.schemaVersion,4);
  assert.match(record.contentHash,/^[a-f0-9]{64}$/);
  const {contentHash,...legacy}=record;
  f.records.set(ref,{...legacy,schemaVersion:3});
  assert.equal((await Storage.getManuscript(id)).text,'Original');
  f.records.set(ref,{...legacy,schemaVersion:4});
  await assert.rejects(Storage.getManuscript(id),/integrity/i);
});
test('restore participates in the same write queue and does not run the analyzer',async()=>{
  const f=setup(),id=await Storage.saveManuscript('draft.txt','Original',null);
  const version=await Storage.saveVersion(id,null,'Original');
  const pending=Storage.updateManuscript(id,'Before restore',null);
  let calls=0;
  global.Analyzer={analyze(){calls++;throw new Error('Storage must not analyze');}};
  const restoring=Storage.restoreVersion(id,version,{genre:{primary:'fantasy',label:'Fantasy'}});
  const afterwards=Storage.updateManuscript(id,'After restore',null);
  await Promise.all([pending,restoring,afterwards]);
  assert.equal(calls,0);
  assert.equal((await Storage.getManuscript(id)).text,'After restore');
  const safety=(await Storage.getVersions(id)).find(v=>v.reason==='before_restore');
  assert.equal((await Storage.getVersion(id,safety.id)).text,'Before restore');
});
test('failed commit removes its own unpublished chunks without harming the prior draft',async()=>{
  const f=setup(),id=await Storage.saveManuscript('draft.txt','Original',null);
  const parts=()=>[...f.records.keys()].filter(k=>k.includes('/chapters/'));
  const before=parts();
  f.fail=(_op,path)=>path.endsWith('/'+id);
  await assert.rejects(Storage.updateManuscript(id,'Replacement',null));
  assert.deepEqual(parts(),before);
  assert.equal((await Storage.getManuscript(id)).text,'Original');
});
test('ambiguous commit acknowledgement never deletes the now-active generation',async()=>{
  const f=setup(),id=await Storage.saveManuscript('draft.txt','Original',null);
  const transaction=f.db.runTransaction.bind(f.db);
  f.db.runTransaction=async fn=>{await transaction(fn);throw new Error('Lost acknowledgement');};
  await assert.rejects(Storage.updateManuscript(id,'Committed despite acknowledgement loss',null),/acknowledgement/);
  assert.equal((await Storage.getManuscript(id)).text,'Committed despite acknowledgement loss');
});
test('uncommitted snapshots cannot be restored even when their parts are complete',async()=>{
  const f=setup(),id=await Storage.saveManuscript('draft.txt','Original',null);
  const version=await Storage.saveVersion(id,null,'Original');
  const path=`users/test-author/manuscripts/${id}/versions/${version}`;
  f.records.set(path,{...f.records.get(path),saveState:'writing'});
  await assert.rejects(Storage.getVersion(id,version),/incomplete/i);
  await assert.rejects(Storage.restoreVersion(id,version),/incomplete/i);
  assert.equal((await Storage.getManuscript(id)).text,'Original');
});
test('restoring marks scores pending instead of carrying scores from another text',async()=>{
  setup();const id=await Storage.saveManuscript('draft.txt','Original',null);
  const version=await Storage.saveVersion(id,null,'Original');
  await Storage.updateManuscript(id,'Different text',{overall:95,scores:{clarity:95}});
  await Storage.restoreVersion(id,version,{overall:95,scores:{clarity:95},genre:{primary:'fantasy',label:'Fantasy'}});
  const restored=await Storage.getManuscript(id);
  assert.equal(restored.analysisState,'pending');
  assert.equal(restored.overall,null);
  assert.deepEqual(restored.scores,{});
});
