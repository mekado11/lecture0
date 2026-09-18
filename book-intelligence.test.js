const assert = require('assert');
const Parser = require('./manuscript-parser');
const BI = require('./book-intelligence');

const text = [
  'Chapter 1',
  'I walked toward Mara. Mara watched me cross the room. I knew Mara was afraid.',
  '',
  'Chapter 2',
  'Daniel watched Mara leave. He followed her outside. Daniel knew she had lied.'
].join('\n');
const book = BI.build(Parser.parse(text));
assert.strictEqual(book.chapterCount, 2);
assert.strictEqual(book.chapters[0].pov.mode, 'first');
assert.strictEqual(book.chapters[1].pov.mode, 'third');
assert.strictEqual(book.pov.multiPOV, true);
assert.strictEqual(book.pov.chapterChanges.length, 1);
assert(book.characters.some(c => c.canonicalName === 'Mara'));

const evidence = BI.buildScoreEvidence({
  overall: 43,
  scores: { plot: 52, transitions: 46, dialogue: 55, grammar: 60 },
  readerPerspective: { hookStrength: 0, engagementScore: 16, clarityScore: 68 },
  issues: [{ type: 'plot' }]
});
assert.strictEqual(evidence.pacing.value, 49);
assert.strictEqual(evidence.hook.value, 0);
assert.strictEqual(evidence.engagement.value, 16);
assert.strictEqual(BI.findScoreConflicts(evidence).length, 0);

const contradictory = BI.buildScoreEvidence({
  scores: { plot: 80, transitions: 80 },
  readerPerspective: { hookStrength: 5, engagementScore: 75 },
  issues: []
});
assert.strictEqual(BI.findScoreConflicts(contradictory)[0].reason, 'Large opening/engagement divergence');
\nconsole.log('book-intelligence tests passed');
