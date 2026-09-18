// Minimal dependency-free tests for ManuscriptParser.
const assert = require('assert');
const Parser = require('./manuscript-parser');

const sample = 'Preface note\n\nChapter 1\nAlice arrived.\n\nChapter 2: The Door\nBob left.';
const parsed = Parser.parse(sample);
assert.strictEqual(parsed.chapterCount, 3);
assert.strictEqual(parsed.chapters[0].title, 'Front Matter');
assert.strictEqual(parsed.chapters[1].title, 'Chapter 1');
assert.strictEqual(parsed.chapters[2].title, 'Chapter 2: The Door');
assert.strictEqual(parsed.chapters.map(c => c.text).join(''), sample);
assert.strictEqual(Parser.parse('Just one continuous manuscript.').chapterCount, 1);
assert.strictEqual(Parser.parse('').chapterCount, 0);
console.log('manuscript-parser tests passed');
