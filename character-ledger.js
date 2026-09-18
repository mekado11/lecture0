// AuthorScrolls character ledger v1.
// Builds evidence-backed character cards from the intelligence already extracted.
const CharacterLedger=(()=>{
 function build(intel={}){return (intel.characters||[]).map(c=>{
  const names=new Set([c.canonicalName,...(c.aliases||[])]);
  const facts=(intel.facts||[]).filter(f=>names.has(f.subject));
  const relationships=(intel.relationshipIntelligence?.relationships||[]).filter(r=>(r.characters||[]).some(n=>names.has(n)));
  const threads=(intel.narrativeMomentum?.arcs||[]).filter(a=>(a.characters||[]).some(n=>names.has(n)));
  const timeline=(intel.timeline?.events||[]).filter(e=>(e.characters||[]).some(n=>names.has(n)));
  const continuity=(intel.continuity||[]).filter(x=>names.has(x.first?.subject)||names.has(x.second?.subject)||names.has(x.subject));
  return {id:c.id||c.canonicalName.toLowerCase().replace(/[^a-z0-9]+/g,'-'),name:c.canonicalName,aliases:c.aliases||[],mentions:c.mentions||0,chapterIds:c.chapterIds||[],facts:facts.slice(0,30),relationships:relationships.slice(0,20),threads:threads.slice(0,20),timeline:timeline.slice(0,30),continuity:continuity.slice(0,20),lastSeenChapterId:(c.chapterIds||[]).slice(-1)[0]||null};
 });}
 function enrich(intel){return {...intel,characterLedger:{version:1,characters:build(intel)}};}
 return {build,enrich};
})();
if(typeof window!=='undefined')window.CharacterLedger=CharacterLedger;
if(typeof module!=='undefined'&&module.exports)module.exports=CharacterLedger;
