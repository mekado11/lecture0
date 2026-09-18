// AuthorScrolls continuity + plot-thread intelligence v1.\n// Surfaces candidates for writer review; it does not declare narrative choices wrong.\nconst ContinuityIntelligence = (() => {\n  const NORMALIZE = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');\n  const MUTABLE = new Set(['lives','lived','works','worked','wants','wanted','needs','needed','knows','knew','loves','loved','hates','hated']);
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
  }\n\n  function plotThreadCandidates(parsed, facts, characters) {\n    const threads=[];\n    const cue=/\b(secret|promise|mystery|missing|disappear(?:ed)?|threat|owed|debt|revenge|search(?:ing)?|find|discover(?:ed)?|investigat(?:e|ed|ing)|must|swore|vowed|plan(?:ned)?|goal|mission)\b/i;\n    for (const chapter of parsed?.chapters || []) {\n      const sentences=(chapter.body || chapter.text || '').match(/[^.!?]+[.!?]+/g) || [];\n      for (const sentence of sentences) {\n        const hit=sentence.match(cue);\n        if (!hit) continue;\n        const involved=(characters || []).filter(c => {\n          const names=[c.canonicalName,...(c.aliases||[])];\n          return names.some(n => sentence.toLowerCase().includes(n.toLowerCase()));\n        }).map(c=>c.canonicalName);\n        threads.push({\n          id:'thread-candidate-'+String(threads.length+1).padStart(3,'0'),\n          status:'candidate', cue:hit[0].toLowerCase(), chapterId:chapter.id,\n          characters:involved, evidence:sentence.trim().slice(0,500), confidence:.55,\n          requiresAuthorReview:true\n        });\n        if (threads.length >= 200) return threads;\n      }\n    }\n    return threads;\n  }\n\n  function enrich(parsed, intelligence) {\n    return {\n      ...intelligence,\n      continuity: contradictionCandidates(intelligence.facts || []).contradictions,\n      stateChanges: contradictionCandidates(intelligence.facts || []).changes,\n      plotThreadCandidates: plotThreadCandidates(parsed, intelligence.facts || [], intelligence.characters || [])\n    };\n  }\n  return { factKind, contradictionCandidates, plotThreadCandidates, enrich };\n})();\nif (typeof window !== 'undefined') window.ContinuityIntelligence = ContinuityIntelligence;\nif (typeof module !== 'undefined' && module.exports) module.exports = ContinuityIntelligence;\n