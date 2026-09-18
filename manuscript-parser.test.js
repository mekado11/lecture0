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

const reviewSample = [
  'Introduction','Opening text.','Chapter 1: Start','Main one.','Chapter 2: Next','Main two.',
  'Part 1: Chapter Review','Review of chapters 1-2','Chapter 1 — Start','Recap one.','Chapter 2 — Next','Recap two.',
  'Chapter 3: Continue','Main three.','Chapter 4: Bonus: Chapter Toolkits','Bonus Toolkit: Chapter-by-Chapter Reflection and Action Guide',
  'Chapter 1 — Start','Reflection questions:','• What changed?','Action: Write it down.','Chapter 5: Finish','Done.'
].join('\n');
const reviewed = Parser.parse(reviewSample);
assert.strictEqual(reviewed.chapterCount, 6, 'review/toolkit child headings must not inflate top-level chapter count');
assert(reviewed.chapters.some(c => c.kind === 'review'));
assert(reviewed.chapters.some(c => c.title === 'Chapter 5: Finish'));
