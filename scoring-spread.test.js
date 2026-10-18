// Scoring spread regression guard.
// The recalibrated curves must keep clean, bloated, and awful prose separated by
// >= 25 points on the overall composite. If this fails, the curves have compressed
// again and need recalibration (see scoring-recalibration-proposal.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
const fs = require('fs');
eval(fs.readFileSync(__dirname + '/analyzer.js', 'utf8')
  .replace('const Analyzer = {', 'global.Analyzer = {'));
const A = global.Analyzer;

const cleanPara = "The gate groaned. Alice slipped through before it could close. Rain needled her face. Across the courtyard, Bob waited, knife drawn. \"You're late.\" \"Road was watched.\" She barred the door. \"Dawn. We leave at dawn.\" ";
const bloatedPara = "Alice very slowly pushed the heavy gate open in a deliberate manner. The rain was falling very hard in an extremely relentless fashion. Bob was standing by the wall and a knife was being held by him. \"You are really very late,\" he said in an annoyed tone of voice. ";
const awfulPara = "It was very very extremely quite rather fairly pretty much sort of kind of a dark and stormy night in a very real way, you know? The thing was done by him in a hasty manner and it was very important. \"Hello there,\" he said loudly and clearly in a loud voice that was very loud. She was very tired and extremely sleepy and quite drowsy and rather exhausted. It is what it is, basically, at the end of the day. ";

function mk(para, n, chapters) {
  const ch = [];
  for (let c = 1; c <= chapters; c++) ch.push('Chapter ' + c + '\n\n' + para.repeat(n));
  return ch.join('\n\n');
}

test('scoring spread: clean/bloated/awful separate by >= 25 points', () => {
  const clean = A.analyze(mk(cleanPara, 10, 6), 'fiction', {}).overall;
  const bloated = A.analyze(mk(bloatedPara, 10, 6), 'fiction', {}).overall;
  const awful = A.analyze(mk(awfulPara, 10, 6), 'fiction', {}).overall;
  // Direction: clean > bloated > awful
  assert.ok(clean > bloated, `clean (${clean}) should outscore bloated (${bloated})`);
  assert.ok(bloated > awful, `bloated (${bloated}) should outscore awful (${awful})`);
  // Spread: at least 25 points from best to worst
  const spread = clean - awful;
  assert.ok(spread >= 25, `spread clean-awful is ${spread}, need >= 25 (clean=${clean}, awful=${awful})`);
});

test('scoring spread: self-help clean vs awful separate meaningfully', () => {
  const shClean = "Chapter 1: Start\n\nYou are stuck, and that is okay. Most people feel overwhelmed. Pick one habit. Do it today. For example, write one paragraph. Research shows small steps build momentum. ";
  const shAwful = "Chapter 1: Start\n\nIt was generally believed that being stuck was common. The feeling was felt by many. It was suggested things be done. Momentum was thought to be built. ";
  const mkSH = (p) => ('Chapter 1: Start\n\n' + p.repeat(15) + '\n\n').repeat(5);
  const c = A.analyze(mkSH(shClean), 'selfHelp', {}).selfHelpScores.overall;
  const a = A.analyze(mkSH(shAwful), 'selfHelp', {}).selfHelpScores.overall;
  assert.ok(c > a, `sh clean (${c}) should outscore sh awful (${a})`);
  assert.ok(c - a >= 20, `sh spread is ${c - a}, need >= 20`);
});

test('scores are deterministic across runs', () => {
  const text = mk(cleanPara, 10, 6);
  const r1 = A.analyze(text, 'fiction', {}).overall;
  const r2 = A.analyze(text, 'fiction', {}).overall;
  assert.strictEqual(r1, r2, 'scores must be deterministic');
});
