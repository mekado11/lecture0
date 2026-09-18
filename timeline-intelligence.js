// AuthorScrolls timeline intelligence v1.
// Extracts explicit temporal evidence and orders events by manuscript position.
const TimelineIntelligence=(()=>{
 const TIME_CUE=/\b(later|earlier|before|after|meanwhile|the next (?:day|morning|week|month|year)|the previous (?:day|night|week|month|year)|that (?:morning|afternoon|evening|night)|the following (?:day|week|month|year)|\d+\s+(?:minutes?|hours?|days?|weeks?|months?|years?)\s+(?:later|earlier|ago)|yesterday|tomorrow|tonight|today|last (?:night|week|month|year)|next (?:week|month|year)|years ago)\b/i;
 function sentencesWithOffsets(text){const out=[];const re=/[^.!?
]+[.!?]+|[^.!?
]+$/g;let m;while((m=re.exec(text||'')))out.push({text:m[0].trim(),start:m.index,end:re.lastIndex});return out.filter(x=>x.text);}
 function extract(parsed,characters=[]){const events=[];for(const chapter of parsed?.chapters||[]){for(const s of sentencesWithOffsets(chapter.body||chapter.text||'')){const cue=s.text.match(TIME_CUE);if(!cue)continue;const involved=characters.filter(c=>[c.canonicalName,...(c.aliases||[])].some(n=>s.text.toLowerCase().includes(n.toLowerCase()))).map(c=>c.canonicalName);events.push({id:'event-'+String(events.length+1).padStart(4,'0'),chapterId:chapter.id,chapterIndex:chapter.index,sourceOffset:s.start,cue:cue[0],characters:involved,evidence:s.text.slice(0,500),order:events.length,confidence:.65,source:'explicit_time_cue'});}}return events;}
 function classifyTransitions(events){return events.map(e=>({...e,transition:/later|next|following|tomorrow/i.test(e.cue)?'forward':/earlier|previous|ago|yesterday|last /i.test(e.cue)?'backward':'relative'}));}
 function enrich(parsed,intelligence){const events=classifyTransitions(extract(parsed,intelligence.characters||[]));return {...intelligence,timeline:{version:1,events,eventCount:events.length}};}
 return {sentencesWithOffsets,extract,classifyTransitions,enrich};
})();
if(typeof window!=='undefined')window.TimelineIntelligence=TimelineIntelligence;
if(typeof module!=='undefined'&&module.exports)module.exports=TimelineIntelligence;
