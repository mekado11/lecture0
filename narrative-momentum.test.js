const assert=require('assert');
const NM=require('./narrative-momentum');
const candidates=[
 {cue:'missing',chapterId:'chapter-002',characters:['Mara'],evidence:'Mara searched for the missing necklace.'},
 {cue:'find',chapterId:'chapter-005',characters:['Mara'],evidence:'Mara vowed to find the missing necklace.'},
 {cue:'searching',chapterId:'chapter-009',characters:['Mara'],evidence:'Mara was still searching for the missing necklace.'}
];
const arcs=NM.build(candidates);
assert(arcs.length>=1);
assert(arcs.some(a=>a.recurrence>=2));
assert(arcs.some(a=>a.pressure==='building'||a.pressure==='high'));
assert(arcs.every(a=>a.requiresAuthorReview===true));
console.log('narrative-momentum tests passed');
