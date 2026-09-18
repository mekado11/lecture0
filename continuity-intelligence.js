// AuthorScrolls continuity + plot-thread intelligence v1.
// Surfaces candidates for writer review; it does not declare narrative choices wrong.
const ContinuityIntelligence = (() => {
  const NORMALIZE = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const MUTABLE = new Set(['lives','lived','works','worked','wants','wanted','needs','needed','knows','knew','loves','loved','hates','hated']);
  function factKind(fact){
    const p=NORMALIZE(fact.predicate),o=NORMALIZE(fact.object);
    if(/\\b\\d{1,3}\\s+years? old\\b/.test(o))return 'age';
    if(MUTABLE.has(p))return 'mutable_state';
    if(p==='is'||p==='was'){
      if(/\\b(mother|father|sister|brother|daughter|son|wife|husband|aunt|uncle|cousin|grandmother|grandfather)\\b/.test(o))return 'kinship_or_identity';
      return 'descriptive_state';
    }
    if(p==='has'||p==='had')return 'possession_or_attribute';
    return 'unknown';
  }
  function contradictionCandidates(facts) {
    const groups=new Map();
    for(const fact of facts||[]){const key=NORMALIZE(fact.subject);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({...fact,factKind:fact.factKind||factKind(fact)});}
    const contradictions=[],changes=[];
    for(const group of groups.values())for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
      const a=group[i],b=group[j];if(a.chapterId===b.chapterId)continue;
      const samePredicate=NORMALIZE(a.predicate)===NORMALIZE(b.predicate),differentObject=NORMALIZE(a.object)&&NORMALIZE(b.object)&&NORMALIZE(a.object)!==NORMALIZE(b.object);
      if(!samePredicate||!differentObject)continue;
      const mutable=['age','mutable_state','descriptive_state','possession_or_attribute','unknown'].includes(a.factKind)||['age','mutable_state','descriptive_state','possession_or_attribute','unknown'].includes(b.factKind);
      const item={subject:a.subject,first:a,second:b,confidence:Math.min(a.confidence||.5,b.confidence||.5),requiresAuthorReview:true};
      if(mutable)changes.push({...item,type:'state_change_candidate',severity:'info',reason:'Value changed across chapters; timeline context may explain it'});
      else contradictions.push({...item,type:'continuity_candidate',severity:'review',reason:'Different stable identity values stated across chapters'});
    }
    return {contradictions:contradictions.slice(0,200),changes:changes.slice(0,200)};
  }

  function plotThreadCandidates(parsed, facts, characters) {
    const threads=[];
    const cue=/\b(secret|promise|mystery|missing|disappear(?:ed)?|threat|owed|debt|revenge|search(?:ing)?|find|discover(?:ed)?|investigat(?:e|ed|ing)|must|swore|vowed|plan(?:ned)?|goal|mission)\b/i;
    for (const chapter of parsed?.chapters || []) {
      const sentences=(chapter.body || chapter.text || '').match(/[^.!?]+[.!?]+/g) || [];
      for (const sentence of sentences) {
        const hit=sentence.match(cue);
        if (!hit) continue;
        const involved=(characters || []).filter(c => {
          const names=[c.canonicalName,...(c.aliases||[])];
          return names.some(n => sentence.toLowerCase().includes(n.toLowerCase()));
        }).map(c=>c.canonicalName);
        threads.push({
          id:'thread-candidate-'+String(threads.length+1).padStart(3,'0'),
          status:'candidate', cue:hit[0].toLowerCase(), chapterId:chapter.id,
          characters:involved, evidence:sentence.trim().slice(0,500), confidence:.55,
          requiresAuthorReview:true
        });
        if (threads.length >= 200) return threads;
      }
    }
    return threads;
  }

  function enrich(parsed, intelligence) {
    const continuityResult=contradictionCandidates(intelligence.facts || []);
    return {
      ...intelligence,
      continuity: continuityResult.contradictions,
      stateChanges: continuityResult.changes,
      plotThreadCandidates: plotThreadCandidates(parsed, intelligence.facts || [], intelligence.characters || [])
    };
  }
  return { factKind, contradictionCandidates, plotThreadCandidates, enrich };
})();
if (typeof window !== 'undefined') window.ContinuityIntelligence = ContinuityIntelligence;
if (typeof module !== 'undefined' && module.exports) module.exports = ContinuityIntelligence;
