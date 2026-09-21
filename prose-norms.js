// AuthorScrolls — Prose Norms
// Re-weights findings against the norms of THIS manuscript, mode by mode. Nothing here
// asserts a target value: every comparison is against what this author actually does in
// passages of the same kind. A long sentence is judged against the author's other long-form
// reflective passages, not against a number somebody picked.
//
// Findings are never deleted. A mode-appropriate finding is marked `contextSuppressed` with
// a plain-language reason, so it can be excluded from scoring and still shown on request.
const ProseNorms = (() => {
  'use strict';
  const context = (typeof module !== 'undefined' && module.exports)
    ? require('./prose-context')
    : (typeof ProseContext !== 'undefined' ? ProseContext : globalThis.ProseContext);

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function words(text) { return (String(text || '').match(/\b[\p{L}\p{N}'’-]+\b/gu) || []).length; }

  // What this manuscript's own sentences look like, per mode.
  function sentenceNorms(text, passages) {
    const byMode = {};
    for (const passage of passages) {
      if (passage.mode === 'mixed') continue;
      const body = text.slice(passage.start, passage.end);
      for (const sentence of body.split(/(?<=[.!?])\s+/)) {
        const length = words(sentence);
        if (length < 3) continue;
        (byMode[passage.mode] = byMode[passage.mode] || []).push(length);
      }
    }
    const norms = {};
    for (const [mode, lengths] of Object.entries(byMode)) {
      if (lengths.length < 8) continue; // too few sentences in this mode to have a norm
      const mid = median(lengths);
      const upper = median(lengths.filter(l => l > mid));   // the author's own "long" for this mode
      norms[mode] = { median: mid, long: upper || mid, sentences: lengths.length };
    }
    return norms;
  }

  // Which findings are appropriate to the mode they sit in. Each rule states a reason in the
  // author's language, because a suppressed finding the author cannot interrogate is worse
  // than one that was never raised.
  function judge(issue, passage, norms) {
    const mode = passage.mode;
    const type = issue.type;
    const sentenceWords = type === 'sentence-length' ? words(issue.text || '') : 0;
    const norm = norms[mode];

    if (type === 'sentence-length') {
      // Only meaningful where the author writes long by habit.
      if ((mode === 'reflection' || mode === 'description' || mode === 'exposition') && norm) {
        if (sentenceWords <= norm.long) {
          return { action: 'suppress', reason: 'Long, but typical of your ' + mode + ' passages (this book runs about '
            + Math.round(norm.long) + ' words in those). Length reads as deliberate here.' };
        }
        return { action: 'keep' };
      }
      if (mode === 'action' && norm && sentenceWords > norm.long) {
        return { action: 'raise', reason: 'Long for an action passage, where your own writing usually runs about '
          + Math.round(norm.median) + ' words a sentence. Length slows the beat.' };
      }
    }

    if (type === 'passive') {
      if (mode === 'exposition') {
        return { action: 'suppress', reason: 'Passive voice in explanatory writing, where the action’s subject is often beside the point.' };
      }
      if (mode === 'action') {
        return { action: 'raise', reason: 'Passive voice inside an action passage, where it puts the reader at one remove from the event.' };
      }
    }

    if (type === 'weak-verb') {
      // Vividness is a virtue of action and description. Elsewhere the plain verb is
      // usually the right one, and "crafted" for "made" would be a worse sentence.
      if (mode === 'exposition') return { action: 'suppress', reason: 'A plain verb in explanatory writing, where the precision of the point matters more than the vividness of the action.' };
      if (mode === 'dialogue') return { action: 'suppress', reason: 'A plain verb inside speech, which is how people talk.' };
      if (mode === 'reflection') return { action: 'suppress', reason: 'A plain verb in a reflective passage, where the thought is the point and the verb should not compete with it.' };
    }

    if (type === 'repetition' && (mode === 'exposition' || mode === 'dialogue')) {
      return { action: 'suppress', reason: mode === 'dialogue'
        ? 'Repetition inside speech, which is how people actually talk.'
        : 'Repetition in explanatory writing, where a repeated phrase often carries the argument deliberately.' };
    }

    if (type === 'show-tell' && mode === 'exposition') {
      return { action: 'suppress', reason: 'Stating things plainly is the job of an explanatory passage; showing is a narrative technique.' };
    }

    if (type === 'adverb' && mode === 'dialogue') {
      return { action: 'raise', reason: 'Adverb attached to speech, where a stronger line of dialogue usually does the work instead.' };
    }

    return { action: 'keep' };
  }

  // Annotates issues in place and returns a summary. Scoring should use `scored`.
  function apply(text, issues, passages) {
    const list = Array.isArray(issues) ? issues : [];
    if (!passages || !passages.length) return { scored: list, suppressed: [], norms: {}, applied: 0 };
    const norms = sentenceNorms(text, passages);
    const suppressed = [];
    let applied = 0;

    for (const issue of list) {
      // A rhetorical repetition (parallel structure) is the device, whatever passage it sits
      // in — including an epigraph too short for the classifier to call.
      if (issue.type === 'repetition' && issue.rhetorical === 'parallel') {
        issue._context = { mode: 'parallel', action: 'suppress',
          reason: 'Repetition inside parallel structure, where the echoed word carries the sentence pair on purpose.' };
        issue.contextSuppressed = true; suppressed.push(issue); applied++;
        continue;
      }
      // A stance adverb qualifies the claim it sits in, whatever the passage; an adverb on a
      // speech tag is the classic target, whatever the passage.
      if (issue.type === 'adverb' && issue.stance) {
        issue._context = { mode: 'stance', action: 'suppress',
          reason: 'A stance adverb (how often, how much, how certain) qualifies the claim it sits in. It is doing work, not padding.' };
        issue.contextSuppressed = true; suppressed.push(issue); applied++;
        continue;
      }
      if (issue.type === 'adverb' && issue.tagAdjacent && !issue.contextRaised) {
        issue._context = { mode: 'speech-tag', action: 'raise',
          reason: 'Adverb attached to a speech tag, where a stronger line of dialogue or a plainer tag usually does the work instead.' };
        issue.severity = issue.severity === 'low' ? 'medium' : 'high';
        issue.contextRaised = true; applied++;
        continue;
      }
      const passage = context.passageAt(passages, issue.index);
      if (!passage || passage.mode === 'mixed') continue;
      // Only act where the classifier was actually confident.
      if (!(passage.confidence >= 0.3)) continue;
      const verdict = judge(issue, passage, norms);
      if (verdict.action === 'keep') continue;
      issue._context = { mode: passage.mode, reason: verdict.reason, action: verdict.action };
      applied++;
      if (verdict.action === 'suppress') { issue.contextSuppressed = true; suppressed.push(issue); }
      else if (verdict.action === 'raise') {
        issue.severity = issue.severity === 'low' ? 'medium' : 'high';
        issue.contextRaised = true;
      }
    }
    return { scored: list.filter(i => !i.contextSuppressed), suppressed, norms, applied };
  }

  return { apply, sentenceNorms, judge, median };
})();

if (typeof globalThis !== 'undefined') globalThis.ProseNorms = ProseNorms;   // window, worker self, and Node
if (typeof window !== 'undefined') window.ProseNorms = ProseNorms;
if (typeof module !== 'undefined' && module.exports) module.exports = ProseNorms;
