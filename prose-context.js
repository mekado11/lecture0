// AuthorScrolls — Prose Context
// Identifies what KIND of passage each paragraph is, so the rest of the engine can stop
// judging every sentence by one yardstick. A 45-word sentence is a flaw in an action beat
// and a virtue in a reflective one; passive voice is weak in a fight and correct in
// exposition; repetition is sloppy in narration and deliberate anaphora in rhetoric.
//
// This module only IDENTIFIES the mode. It holds no opinion about what is good, and it
// asserts no target values — norms are derived per manuscript by prose-norms.js.
const ProseContext = (() => {
  'use strict';

  const MODES = ['dialogue', 'action', 'reflection', 'description', 'exposition'];

  // Signal vocabularies. These identify register, not quality — a word appearing here is
  // never itself a fault.
  const PHYSICAL_VERBS = /\b(ran|run|runs|grabbed|grab|grabs|turned|turns|slammed|pushed|pulled|threw|throws|shoved|struck|hit|kicked|leapt|leaped|jumped|ducked|dodged|swung|seized|yanked|dragged|hauled|burst|charged|raced|sprinted|stumbled|staggered|lunged|dove|dived|rolled|crawled|climbed|fell|crashed|snatched|flung|spun|whirled|bolted|fled|chased|caught|dropped|lifted|slapped|punched|stabbed|fired|shot)\b/gi;
  const INTERIOR = /\b(thought|thinks|thinking|wondered|wonders|realized|realised|realizes|remembered|remembers|knew|knows|felt|feels|feeling|believed|believes|hoped|hopes|feared|fears|doubted|doubts|imagined|imagines|considered|considers|understood|understands|suspected|wished|wishes|regretted|regrets)\b/gi;
  const SENSORY = /\b(smell|smelled|scent|taste|tasted|sound|sounded|heard|hearing|saw|seeing|sight|touch|touched|texture|rough|smooth|soft|hard|warm|cold|cool|hot|bright|dim|dark|pale|golden|crimson|scarlet|grey|gray|silver|shadow|shadows|light|glow|glimmer|gleam|scent|fragrance|aroma|bitter|sweet|sour|salt|salty|damp|dry|dusty|humid|silence|silent|quiet|loud|echo)\b/gi;
  const ABSTRACT = /\b\w+(tion|sion|ment|ness|ity|ance|ence|ism|ship|hood|dom)\b/gi;
  const GENERALISING = /\b(often|usually|generally|typically|always|never|most people|many people|tends to|tend to|in general|as a rule|research|studies|evidence|therefore|however|because of this|which means|for example|for instance)\b/gi;
  const SECOND_PERSON = /\b(you|your|yours|yourself)\b/gi;
  const BACKSTORY = /\b(had been|had gone|had come|had said|had known|had felt|had seen|years before|years earlier|long ago|back then|once|used to)\b/gi;

  function count(text, re) { const m = text.match(re); return m ? m.length : 0; }
  function words(text) { return (String(text || '').match(/\b[\p{L}\p{N}'’-]+\b/gu) || []).length; }

  // Proportion of the paragraph's characters sitting inside quotation marks.
  function dialogueShare(text) {
    let inside = 0, open = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (open === null) { if (c === '"' || c === '“') open = i; }
      else if (c === '"' || c === '”') { inside += i - open; open = null; }
    }
    return text.length ? inside / text.length : 0;
  }

  function sentences(text) { return String(text || '').split(/(?<=[.!?])\s+/).filter(s => s.trim()); }

  function classifyParagraph(text) {
    const wordCount = words(text);
    if (wordCount < 12) return { mode: 'mixed', confidence: 0, wordCount };

    const per1k = n => n / wordCount * 1000;
    const share = dialogueShare(text);
    const sents = sentences(text);
    const avgSentence = sents.length ? wordCount / sents.length : wordCount;

    const scores = {
      // Speech dominates the paragraph.
      dialogue: share > 0.25 ? 60 + share * 60 : share * 40,
      // Physical verbs, short sentences, low abstraction.
      action: per1k(count(text, PHYSICAL_VERBS)) * 2.2
        + (avgSentence < 14 ? 18 : avgSentence < 20 ? 8 : 0)
        - per1k(count(text, ABSTRACT)) * 0.8,
      // Interiority: thinking, remembering, questioning.
      reflection: per1k(count(text, INTERIOR)) * 2.4
        + per1k(count(text, BACKSTORY)) * 1.2
        + count(text, /\?/g) * 6,
      // Sensory detail with comparatively little happening.
      description: per1k(count(text, SENSORY)) * 1.8
        + (avgSentence > 18 ? 10 : 0)
        - per1k(count(text, PHYSICAL_VERBS)) * 1.0,
      // Generalisation, abstraction, instruction — the nonfiction register.
      exposition: per1k(count(text, ABSTRACT)) * 1.1
        + per1k(count(text, GENERALISING)) * 2.6
        + per1k(count(text, SECOND_PERSON)) * 1.4
    };
    // Speech crowds out the others when it genuinely dominates.
    if (share > 0.45) { scores.action *= 0.5; scores.description *= 0.4; scores.exposition *= 0.4; }

    const ranked = MODES.map(m => [m, scores[m]]).sort((a, b) => b[1] - a[1]);
    const [topMode, topScore] = ranked[0];
    const runnerUp = ranked[1][1];
    // Confidence is the margin over the runner-up, not the raw score: a paragraph that reads
    // equally like two modes should be treated as mixed rather than forced into one.
    const margin = topScore <= 0 ? 0 : (topScore - runnerUp) / topScore;
    if (topScore < 8 || margin < 0.18) return { mode: 'mixed', confidence: 0, wordCount, avgSentence };
    return { mode: topMode, confidence: Math.min(1, Math.round(margin * 100) / 100), wordCount, avgSentence };
  }

  // Segment the whole text, preserving exact offsets so issues can be matched by position.
  function classify(text) {
    const source = String(text || '');
    const passages = [];
    const splitter = /\n\s*\n/g;
    let last = 0, match;
    const push = (start, end) => {
      const chunk = source.slice(start, end);
      if (!chunk.trim()) return;
      const lead = chunk.length - chunk.trimStart().length;
      const body = chunk.trim();
      passages.push(Object.assign({ start: start + lead, end: start + lead + body.length }, classifyParagraph(body)));
    };
    while ((match = splitter.exec(source)) !== null) { push(last, match.index); last = match.index + match[0].length; }
    push(last, source.length);
    return passages;
  }

  // Binary search a classified passage list for the passage containing an offset.
  function passageAt(passages, offset) {
    let low = 0, high = passages.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1, p = passages[mid];
      if (offset < p.start) high = mid - 1;
      else if (offset >= p.end) low = mid + 1;
      else return p;
    }
    return null;
  }

  function distribution(passages) {
    const out = { dialogue: 0, action: 0, reflection: 0, description: 0, exposition: 0, mixed: 0 };
    let total = 0;
    for (const p of passages) { out[p.mode] = (out[p.mode] || 0) + p.wordCount; total += p.wordCount; }
    for (const key of Object.keys(out)) out[key] = total ? Math.round(out[key] / total * 100) : 0;
    return out;
  }

  return { classify, classifyParagraph, passageAt, distribution, MODES };
})();

if (typeof window !== 'undefined') window.ProseContext = ProseContext;
if (typeof module !== 'undefined' && module.exports) module.exports = ProseContext;
