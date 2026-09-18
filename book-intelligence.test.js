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
console.log('book-intelligence tests passed');
