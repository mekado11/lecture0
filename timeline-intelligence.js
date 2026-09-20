// AuthorScrolls timeline intelligence v1.
// Extracts explicit temporal evidence and orders events by manuscript position.
const TimelineIntelligence=(()=>{
 // Bare 'before'/'after' are not time cues: they fire on "as before", "looked after",
 // "named after". They only mark time as part of a temporal phrase. Explicit dates,
 // seasons and decade spans were previously missed entirely.
 const MONTH='(?:January|February|March|April|May|June|July|August|September|October|November|December)';
 const PART='(?:day|morning|afternoon|evening|night|week|month|year|summer|winter|spring|autumn|fall)';
 const TIME_CUE=new RegExp('\\b(?:'+[
   '\\d{1,2}\\s+'+MONTH+'\\s+\\d{4}',
   MONTH+'\\s+\\d{1,2},?\\s+\\d{4}',
   '(?:in|by|since|until|around|during)\\s+(?:the\\s+)?(?:year\\s+)?(?:1[0-9]{3}|20[0-9]{2})',
   '\\d+\\s+(?:minutes?|hours?|days?|weeks?|months?|years?|decades?)\\s+(?:later|earlier|ago|afterwards?|before|after)',
   '(?:a|one|two|three|four|five|several|many)\\s+(?:decade|century|centuries|year|month|week|day)s?\\s+(?:later|earlier|ago|afterwards?)',
   'the\\s+(?:next|previous|following|last)\\s+'+PART,
   'that\\s+'+PART,
   '(?:last|next)\\s+'+PART,
   '(?:before|after)\\s+(?:dawn|dusk|daybreak|midnight|noon|sunrise|sunset|the\\s+war|the\\s+funeral|the\\s+wedding|the\\s+fire)',
   'the\\s+'+PART+'\\s+(?:before|after)',
   'later|earlier|meanwhile|afterwards|thereafter|subsequently',
   'yesterday|tomorrow|tonight|today|years\\s+ago'
 ].join('|')+')\\b','i');
 function sentencesWithOffsets(text){const out=[];const re=/[^.!?\n]+(?:[.!?]+|$)/gm;let m;while((m=re.exec(text||'')))out.push({text:m[0].trim(),start:m.index,end:re.lastIndex});return out.filter(x=>x.text);}
 function extract(parsed,characters=[]){const events=[];for(const chapter of parsed?.chapters||[]){for(const s of sentencesWithOffsets(chapter.body||chapter.text||'')){const cue=s.text.match(TIME_CUE);if(!cue)continue;const involved=characters.filter(c=>[c.canonicalName,...(c.aliases||[])].some(n=>s.text.toLowerCase().includes(n.toLowerCase()))).map(c=>c.canonicalName);events.push({id:'event-'+String(events.length+1).padStart(4,'0'),chapterId:chapter.id,chapterIndex:chapter.index,sourceOffset:s.start,cue:cue[0],characters:involved,evidence:s.text.slice(0,500),order:events.length,confidence:.65,source:'explicit_time_cue'});}}return events;}
 function classifyTransitions(events){return events.map(e=>({...e,transition:/later|next|following|tomorrow/i.test(e.cue)?'forward':/earlier|previous|ago|yesterday|last /i.test(e.cue)?'backward':'relative'}));}
 function enrich(parsed,intelligence){const events=classifyTransitions(extract(parsed,intelligence.characters||[]));return {...intelligence,timeline:{version:1,events,eventCount:events.length}};}
 return {sentencesWithOffsets,extract,classifyTransitions,enrich};
})();
if(typeof window!=='undefined')window.TimelineIntelligence=TimelineIntelligence;
if(typeof module!=='undefined'&&module.exports)module.exports=TimelineIntelligence;
