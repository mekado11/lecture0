// AuthorScrolls narrative momentum v1.
// Tracks setup -> recurrence -> unresolved pressure without prescribing the author's next move.
const NarrativeMomentum=(()=>{
 const RESOLVE=/\b(resolved|revealed|confessed|found|returned|recovered|solved|forgave|forgiven|paid|fulfilled|completed|finished|ended|dead|died)\b/i;
 function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9' -]/g,' ').replace(/\s+/g,' ').trim();}
 function signature(t){const words=norm(t.evidence).split(' ').filter(w=>w.length>4&&!['chapter','later','before','after','about','their','there','where','which','would','could','should'].includes(w));return [...new Set([t.cue,...(t.characters||[]),...words.slice(0,5)].map(norm).filter(Boolean))];}
 function overlap(a,b){const A=new Set(a),B=new Set(b);let n=0;for(const x of A)if(B.has(x))n++;return n;}
 function build(candidates=[]){const groups=[];for(const t of candidates){const sig=signature(t);let best=null,bestScore=0;for(const g of groups){const s=overlap(sig,g.signature);if(s>bestScore){best=g;bestScore=s;}}if(best&&bestScore>=2){best.events.push(t);best.signature=[...new Set(best.signature.concat(sig))];}else groups.push({signature:sig,events:[t]});}
  return groups.map((g,idx)=>{const ev=g.events.sort((a,b)=>String(a.chapterId).localeCompare(String(b.chapterId)));const resolved=ev.some(e=>RESOLVE.test(e.evidence||''));const recurrence=ev.length;const pressure=resolved?'resolved':recurrence>=4?'high':recurrence>=2?'building':'setup';return {id:'arc-'+String(idx+1).padStart(3,'0'),label:(ev[0].characters?.[0]?[ev[0].characters[0],ev[0].cue].join(' · '):ev[0].cue),status:resolved?'possibly_resolved':'open',pressure,recurrence,firstChapterId:ev[0].chapterId,lastChapterId:ev[ev.length-1].chapterId,characters:[...new Set(ev.flatMap(e=>e.characters||[]))],evidence:ev.map(e=>({chapterId:e.chapterId,text:e.evidence})).slice(-6),requiresAuthorReview:true};});
 }
 function enrich(intel){return {...intel,narrativeMomentum:{version:1,arcs:build(intel.plotThreadCandidates||[])}};}
 return {signature,build,enrich};
})();
if(typeof window!=='undefined')window.NarrativeMomentum=NarrativeMomentum;
if(typeof module!=='undefined'&&module.exports)module.exports=NarrativeMomentum;
