const assert=require('assert');
const Parser=require('./manuscript-parser');
const DI=require('./document-intelligence');

const text=[
  'Introduction',
  'This book asks you to examine your choices.',
  'Chapter 1: Awareness',
  'According to the Example Institute, the pattern affects many households.',
  'I call this the family tax.',
  'My family lived through this.',
  'Reflection questions:',
  '• What belief are you carrying?',
  'Action: Write down one belief and test it this week.',
  'Chapter 2: Accountability',
  'Recommendations',
  'Ask yourself what you can change today.'
].join('\n');

const parsed=Parser.parse(text);
const classified=DI.classify(parsed);
assert.strictEqual(classified.type,'nonfiction');
const intel=DI.build(parsed);
assert(intel.claims.length>=1);
assert(intel.concepts.some(x=>x.name.toLowerCase().includes('family tax')));
assert(intel.personalEvidence.length>=1);
assert(intel.reflectionQuestions.length>=1);
assert(intel.actions.length>=1);
assert(intel.recommendations.length>=1);
assert(intel.claims.every(x=>x.chapterId&&x.evidence));
console.log('document-intelligence tests passed');
