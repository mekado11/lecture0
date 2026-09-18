const assert=require('assert');
const CI=require('./continuity-intelligence');
const age=[
 {subject:'Mara',predicate:'is',object:'twenty-eight years old',chapterId:'chapter-001',evidence:'Mara is twenty-eight years old.',confidence:.7},
 {subject:'Mara',predicate:'is',object:'thirty-two years old',chapterId:'chapter-010',evidence:'Mara is thirty-two years old.',confidence:.7}
];
let result=CI.contradictionCandidates(age);
assert.strictEqual(result.contradictions.length,0,'age changes are not automatic contradictions');
assert.strictEqual(result.changes.length,1,'age changes should be timeline/state review candidates');
const residence=[
 {subject:'Mara',predicate:'lives',object:'in Boston',chapterId:'chapter-001',evidence:'Mara lives in Boston.',confidence:.7},
 {subject:'Mara',predicate:'lives',object:'in Dallas',chapterId:'chapter-010',evidence:'Mara lives in Dallas.',confidence:.7}
];
result=CI.contradictionCandidates(residence);
assert.strictEqual(result.contradictions.length,0,'mutable residence changes are not automatic contradictions');
assert.strictEqual(result.changes.length,1);
const identity=[
 {subject:'Mara',predicate:'is',object:"Daniel's sister",chapterId:'chapter-001',evidence:"Mara is Daniel's sister.",confidence:.7},
 {subject:'Mara',predicate:'is',object:"Daniel's mother",chapterId:'chapter-010',evidence:"Mara is Daniel's mother.",confidence:.7}
];
result=CI.contradictionCandidates(identity);
assert.strictEqual(result.contradictions.length,1,'incompatible stable kinship should remain a continuity review candidate');
assert.strictEqual(result.contradictions[0].requiresAuthorReview,true);
const parsed={chapters:[{id:'chapter-001',body:'Mara vowed to find the missing necklace. Daniel promised to help.'}]};
const chars=[{canonicalName:'Mara',aliases:[]},{canonicalName:'Daniel',aliases:[]}];
const threads=CI.plotThreadCandidates(parsed,[],chars);
assert(threads.length>=1);
assert.strictEqual(threads[0].status,'candidate');
console.log('continuity-intelligence tests passed');
