// Bounded, source-grounded retrieval. Sampling is not a claim to read every word.
const ManuscriptRetrieval = (() => {
  const STOP = new Set('the a an and or but if then than to of in on at for from with by is was are were be been being it this that these those i me my we our you your he him his she her they them their what how why book manuscript chapter happened tell about'.split(' '));
  const terms = s => [...new Set(String(s||'').toLowerCase().match(/[\p{L}\p{N}_'’-]{3,}/gu)?.filter(w=>!STOP.has(w))||[])];
  const broad = query => /\b(whole|entire|overall|overview|summary|summarize|summarise|themes?|central|progression|structure|ending|conclusion)\b/i.test(query);
  function score(query, chapter, intel) {
    const q=terms(query),hay=(chapter.title+' '+(chapter.body||chapter.text||'')).toLowerCase();
    let result=q.reduce((n,t)=>n+(hay.includes(t)?2:0),0);
    for(const c of intel.characters||[])if([c.canonicalName,...(c.aliases||[])].some(n=>query.toLowerCase().includes(n.toLowerCase()))&&c.chapterIds.includes(chapter.id))result+=8;
    for(const f of intel.facts||[])if(f.chapterId===chapter.id&&q.some(t=>(f.subject+' '+f.predicate+' '+f.object).toLowerCase().includes(t)))result+=3;
    return result;
  }
  function snippet(text,query,max=4500) {
    text=String(text||'');if(text.length<=max)return text;
    const lower=text.toLowerCase(),positions=terms(query).map(t=>lower.indexOf(t)).filter(n=>n>=0);
    const start=Math.max(0,(positions[0]||0)-Math.floor(max*.3));
    return text.slice(start,start+max);
  }
  function anchors(length,limit) {
    const count=Math.min(length,Math.max(1,limit));
    return Array.from({length:count},(_,i)=>count===1?0:Math.round(i*(length-1)/(count-1)));
  }
  function retrieve(query,parsed,intel={},limit=5) {
    const all=(parsed?.chapters||[]).map(chapter=>({chapter,score:score(query,chapter,intel)}));
    let ranked=all.filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.chapter.index-b.chapter.index).slice(0,limit);
    if(!ranked.length&&broad(query))ranked=anchors(all.length,limit).map(i=>all[i]);
    return ranked.map(({chapter:c,score})=>({chapterId:c.id,title:c.title,score,text:snippet(c.body||c.text,query)}));
  }
  function overview(parsed,intel={},maxChapters=24) {
    const all=parsed?.chapters||[];
    return {
      documentType:intel.documentType||null,chapterCount:parsed?.chapterCount||0,unitCount:all.length,
      scope:'Sampled excerpts across the book, not complete chapter summaries. Do not infer missing events or claims.',
      chapters:anchors(all.length,maxChapters).map(i=>{
        const c=all[i],body=c.body||c.text||'';
        const excerpts=body.length<=1000?[body]:[body.slice(0,330),body.slice(Math.floor(body.length/2),Math.floor(body.length/2)+330),body.slice(-330)];
        return {chapterId:c.id,title:c.title,index:c.index,kind:c.kind,wordCount:c.wordCount,excerpts};
      })
    };
  }
  function contextPacket(query,parsed,intel={},limit=5,maxChars=80000) {
    if(maxChars<1000)throw new Error('Context budget must be at least 1000 characters');
    const chapters=retrieve(query,parsed,intel,limit),ids=new Set(chapters.map(c=>c.chapterId));
    const inScope=row=>ids.has(row.chapterId);
    const packet={
      version:5,query:String(query).slice(0,2000),documentType:intel.documentType||null,chapters,
      overview:overview(parsed,intel),characters:(intel.characters||[]).filter(c=>c.chapterIds.some(id=>ids.has(id))).slice(0,20),
      facts:(intel.facts||[]).filter(inScope).slice(0,40),
      relationships:(intel.relationshipIntelligence?.relationships||[]).filter(r=>r.chapterIds.some(id=>ids.has(id))).slice(0,20),
      timeline:(intel.timeline?.events||[]).filter(inScope).slice(0,30),
      stateChanges:(intel.stateChanges||[]).filter(c=>ids.has(c.first?.chapterId)||ids.has(c.second?.chapterId)).slice(0,20),
      continuity:(intel.continuity||[]).filter(c=>ids.has(c.first?.chapterId)||ids.has(c.second?.chapterId)).slice(0,20),
      plotThreads:(intel.narrativeMomentum?.arcs||intel.plotThreadCandidates||[]).filter(t=>(t.chapterIds||[t.chapterId]).some(id=>ids.has(id))).slice(0,20),
      nonfiction:intel.nonfiction?Object.fromEntries(Object.entries(intel.nonfiction).map(([k,rows])=>[k,rows.filter(inScope).slice(0,20)])):null
    };
    // Bound the complete payload, not just passages. Remove optional evidence first.
    const size=()=>JSON.stringify(packet).length;
    for(const rows of [...Object.values(packet.nonfiction||{}),packet.characters,packet.facts,packet.relationships,packet.timeline,packet.stateChanges,packet.continuity,packet.plotThreads]){
      while(rows.length&&size()>maxChars)rows.pop();
    }
    while(packet.overview.chapters.length>3&&size()>maxChars)packet.overview.chapters.splice(1,1);
    while(packet.chapters.length>1&&size()>maxChars)packet.chapters.pop();
    if(size()>maxChars){
      packet.truncated=true;
      for(const c of packet.overview.chapters)c.excerpts=c.excerpts.map(t=>t.slice(0,80));
      if(packet.chapters[0])packet.chapters[0].text=packet.chapters[0].text.slice(0,300);
    }
    while(packet.overview.chapters.length&&size()>maxChars)packet.overview.chapters.pop();
    if(size()>maxChars){packet.chapters=[];packet.query=packet.query.slice(0,80);}
    return packet;
  }
  return {terms,score,snippet,retrieve,overview,contextPacket};
})();
if(typeof window!=='undefined')window.ManuscriptRetrieval=ManuscriptRetrieval;
if(typeof module!=='undefined'&&module.exports)module.exports=ManuscriptRetrieval;
