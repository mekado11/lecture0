// AuthorScrolls relationship intelligence v1.
// Explicit relationship cues only; chapter co-occurrence alone is not treated as a relationship.
const RelationshipIntelligence=(()=>{
 const PATTERNS=[['family',/\b(mother|father|mom|dad|sister|brother|daughter|son|wife|husband|aunt|uncle|cousin|grandmother|grandfather)\b/i],['romantic',/\b(girlfriend|boyfriend|fiancee?|spouse|lover|dating|married|kissed|loved)\b/i],['friendship',/\b(friend|best friend|trusted|confidant)\b/i],['conflict',/\b(enemy|rival|hated|betrayed|threatened|fought|feared|suspected)\b/i],['professional',/\b(boss|manager|employee|partner|colleague|coworker|client|teacher|student|doctor|patient)\b/i]];
 function sentences(text){return String(text||'').match(/[^.!?
]+[.!?]+|[^.!?
]+$/g)?.map(s=>s.trim()).filter(Boolean)||[];}
 function escRe(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
 function namesIn(sentence,characters){return characters.filter(c=>[c.canonicalName,...(c.aliases||[])].some(n=>new RegExp('(?:^|[^\\p{L}\\p{N}])'+escRe(n)+'(?=$|[^\\p{L}\\p{N}])','iu').test(sentence))).map(c=>c.canonicalName);}
 function extract(parsed,characters=[]){const out=[];for(const ch of parsed?.chapters||[]){for(const s of sentences(ch.body||ch.text)){const names=[...new Set(namesIn(s,characters))];if(names.length!==2)continue;for(const [type,re] of PATTERNS){const m=s.match(re);if(!m)continue;for(let a=0;a<names.length;a++)for(let b=a+1;b<names.length;b++)out.push({id:'rel-'+String(out.length+1).padStart(4,'0'),characters:[names[a],names[b]],type,cue:m[0],chapterId:ch.id,evidence:s.slice(0,500),confidence:.78,source:'explicit_relationship_cue',requiresAuthorReview:true});}}}return out.slice(0,500);}
 function summarize(evidence=[]){const map=new Map();for(const e of evidence){const key=[...e.characters].sort().join('|');if(!map.has(key))map.set(key,{characters:e.characters,types:new Set(),chapterIds:new Set(),evidence:[]});const r=map.get(key);r.types.add(e.type);r.chapterIds.add(e.chapterId);r.evidence.push({chapterId:e.chapterId,type:e.type,text:e.evidence});}return [...map.values()].map((r,i)=>({id:'relationship-'+String(i+1).padStart(3,'0'),characters:r.characters,types:[...r.types],chapterIds:[...r.chapterIds],evidence:r.evidence.slice(-8),status:'observed',requiresAuthorReview:true}));}
 function enrich(parsed,intel){const evidence=extract(parsed,intel.characters||[]);return {...intel,relationshipIntelligence:{version:1,evidence,relationships:summarize(evidence)}};}
 return {sentences,namesIn,extract,summarize,enrich};
})();
if(typeof window!=='undefined')window.RelationshipIntelligence=RelationshipIntelligence;
if(typeof module!=='undefined'&&module.exports)module.exports=RelationshipIntelligence;
