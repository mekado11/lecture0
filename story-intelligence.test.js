const assert = require('assert');
const Parser = require('./manuscript-parser');
const BI = require('./book-intelligence');
const SI = require('./story-intelligence');

const text = [
  'Chapter 1',
  'Daniel Carter is a doctor. Daniel Carter knows Mara. Mara was afraid.',
  'Daniel spoke to Mara before leaving.',
  '',
  'Chapter 2',
  'Daniel wanted answers. Mara knew Daniel was angry.'
].join('\n');
const parsed = Parser.parse(text);
const base = BI.build(parsed);
const story = SI.enrich(parsed, base);
assert(story.characters.some(c => c.canonicalName === 'Daniel Carter'));
assert(story.relationships.some(r => r.characters.includes('Daniel Carter') && r.characters.includes('Mara')));
assert(story.facts.some(f => f.subject === 'Daniel Carter' && f.predicate === 'is'));
assert(story.facts.every(f => f.chapterId && f.evidence));
console.log('story-intelligence tests passed');
