// AuthorScrolls — Genre Expectations
// Genre is a contract with the reader. This module states what a reader of a genre comes
// for, then shows what THIS manuscript actually does about it. It does not assert targets:
// there is no "romance must reach its ending by 95%" here, because that is a rule somebody
// typed, and every good book that breaks it would be marked wrong.
//
// Every expectation declares how it is evidenced, and the honesty of the whole feature
// depends on that tag being accurate:
//   structural — read from document structure or entities. Trustworthy.
//   proxy      — vocabulary or pattern density. Indicative only, and labelled as such.
//   ai         — needs the advisory layer. Never affects a score.
//   author     — only the writer can answer. We ask; we do not guess.
const GenreExpectations = (() => {
  'use strict';

  const EVIDENCE = { STRUCTURAL: 'structural', PROXY: 'proxy', AI: 'ai', AUTHOR: 'author' };

  const words = t => (String(t || '').match(/\b[\p{L}\p{N}'’-]+\b/gu) || []).length;
  const density = (text, re) => { const m = String(text || '').match(re); return (m ? m.length : 0) / Math.max(words(text), 1) * 1000; };

  // ---- shared structural measures ------------------------------------------------------
  // Which chapters two characters both appear in. The backbone of "are these two on the
  // page together?", which no keyword count can answer.
  function coOccurrence(intel, parsed) {
    const people = ((intel && intel.characterLedger && intel.characterLedger.characters) || [])
      .filter(c => c.chapterIds && c.chapterIds.length);
    if (people.length < 2) return null;
    const [a, b] = people;
    const chapters = (parsed && parsed.chapters || []).filter(c => c.kind === 'chapter' || c.kind === 'opening');
    const ids = chapters.map(c => c.id);
    const setA = new Set(a.chapterIds), setB = new Set(b.chapterIds);
    const shared = ids.filter(id => setA.has(id) && setB.has(id));
    const firstShared = shared.length ? ids.indexOf(shared[0]) : -1;
    return { a: a.name, b: b.name, totalChapters: ids.length, sharedChapters: shared.length,
      firstSharedIndex: firstShared, sharedIds: shared };
  }

  // How the book divides between showing and explaining, from prose-context.
  function modeMix(analysis) {
    const mix = analysis && analysis.proseContext && analysis.proseContext.distribution;
    return mix && Object.keys(mix).length ? mix : null;
  }

  // A vocabulary trend across the arc. Explicitly a proxy: it measures word choice, not craft.
  function arcTrend(parsed, re) {
    const chapters = (parsed && parsed.chapters || []).filter(c => c.kind === 'chapter' || c.kind === 'opening');
    if (chapters.length < 4) return null;
    const series = chapters.map(c => Math.round(density(c.body || c.text, re) * 10) / 10);
    const third = Math.max(1, Math.floor(series.length / 3));
    const opening = series.slice(0, third).reduce((s, v) => s + v, 0) / third;
    const closing = series.slice(-third).reduce((s, v) => s + v, 0) / third;
    return { series, opening: Math.round(opening * 10) / 10, closing: Math.round(closing * 10) / 10,
      direction: closing > opening * 1.2 ? 'rising' : closing < opening * 0.8 ? 'falling' : 'flat' };
  }

  const CONTROL = /\b(regime|council|authority|state|ministry|bureau|sector|district|ration|curfew|permit|patrol|surveillance|compliance|forbidden|outlawed|mandatory|assigned|citizen|subject|obey|order|law|rule|decree|punishment|sentence)\b/gi;
  const TENSION = /\b(danger|threat|fear|afraid|risk|caught|escape|hide|hunted|warning|trapped|desperate|urgent|too late|running out|blood|death|kill|lose|betray)\b/gi;

  // ---- genre models --------------------------------------------------------------------
  const GENRES = {
    romance: {
      label: 'Romance',
      promise: 'A reader opens a romance for the relationship. They expect the two leads to meet, to spend real time on the page together, to be kept apart by something that matters, and to arrive somewhere emotionally earned.',
      expectations: [
        { id: 'together', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The two leads share the page, and early',
          why: 'Romance readers are waiting for the pair. Chapters where neither is present with the other are chapters the central promise is paused.',
          measure: (ctx) => {
            const co = coOccurrence(ctx.intel, ctx.parsed);
            if (!co) return { status: 'unknown', observation: 'Two recurring characters could not be identified with confidence, so page-sharing could not be measured.' };
            const share = co.sharedChapters / Math.max(co.totalChapters, 1);
            const firstAt = co.firstSharedIndex < 0 ? null : Math.round((co.firstSharedIndex / Math.max(co.totalChapters, 1)) * 100);
            return {
              status: co.sharedChapters === 0 ? 'unmet' : share >= 0.5 ? 'met' : 'partial',
              observation: co.sharedChapters === 0
                ? co.a + ' and ' + co.b + ' never appear in the same chapter.'
                : co.a + ' and ' + co.b + ' share ' + co.sharedChapters + ' of ' + co.totalChapters
                  + ' chapters' + (firstAt !== null ? ', first together about ' + firstAt + '% of the way in' : '') + '.',
              detail: co };
          } },
        { id: 'interiority', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The reader is inside someone’s feelings',
          why: 'The genre runs on interior response. A romance told entirely from the outside reads as events rather than intimacy.',
          measure: (ctx) => {
            const mix = modeMix(ctx.analysis);
            if (!mix) return { status: 'unknown', observation: 'Passage modes were not available for this manuscript.' };
            return { status: mix.reflection >= 15 ? 'met' : mix.reflection >= 7 ? 'partial' : 'unmet',
              observation: 'Reflective passages make up ' + mix.reflection + '% of the book'
                + (mix.dialogue ? ', dialogue ' + mix.dialogue + '%' : '') + '.', detail: mix };
          } },
        { id: 'obstacle', evidence: EVIDENCE.AI,
          expectation: 'Something real keeps them apart',
          why: 'Without an obstacle the reader has nothing to wait for. This is a judgement about meaning, not word choice, so the engine will not pretend to measure it.' },
        { id: 'payoff', evidence: EVIDENCE.AI,
          expectation: 'The ending pays off the feeling the book built',
          why: 'Romance readers expect an emotionally earned close. Whether an ending is earned cannot be counted.' }
      ]
    },

    dystopian: {
      label: 'Dystopian',
      promise: 'A reader opens a dystopia to understand a system and watch someone collide with it. They expect the rules of the world to become clear, to see the cost of those rules paid by people, and for the pressure to tighten rather than stay level.',
      expectations: [
        { id: 'rules-early', evidence: EVIDENCE.PROXY,
          expectation: 'The rules of the world arrive early',
          why: 'A reader cannot feel a transgression until they know what is forbidden. Measured here only as the density of control and authority language, which is word choice, not worldbuilding craft.',
          measure: (ctx) => {
            const trend = arcTrend(ctx.parsed, CONTROL);
            if (!trend) return { status: 'unknown', observation: 'Too few chapters to look at how the world is introduced.' };
            return { status: trend.opening >= 2 ? 'met' : trend.opening >= 0.8 ? 'partial' : 'unmet',
              observation: 'Language of control and authority runs at ' + trend.opening + ' per 1,000 words in the opening third, and '
                + trend.closing + ' in the closing third (' + trend.direction + ').', detail: trend };
          } },
        { id: 'shown-not-lectured', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The world is lived in, not explained at the reader',
          why: 'The common failure of the genre is worldbuilding delivered as exposition. This compares how much of the book is explanatory against how much is scene.',
          measure: (ctx) => {
            const mix = modeMix(ctx.analysis);
            if (!mix) return { status: 'unknown', observation: 'Passage modes were not available for this manuscript.' };
            const scene = (mix.action || 0) + (mix.dialogue || 0) + (mix.description || 0);
            return { status: mix.exposition <= 25 ? 'met' : mix.exposition <= 45 ? 'partial' : 'unmet',
              observation: 'Explanatory passages are ' + mix.exposition + '% of the book against ' + scene + '% scene (action, dialogue and description).',
              detail: mix };
          } },
        { id: 'pressure', evidence: EVIDENCE.PROXY,
          expectation: 'The pressure tightens as the book goes on',
          why: 'Dystopias fail when the danger stays level. Measured here as the trend in threat language across chapters, which is a proxy for tension, not tension itself.',
          measure: (ctx) => {
            const trend = arcTrend(ctx.parsed, TENSION);
            if (!trend) return { status: 'unknown', observation: 'Too few chapters to read a trend across the arc.' };
            // Nothing detected is not a flat trend — it is an absence of measurement, and
            // reporting it as "flat" would dress a blank in the clothes of a finding.
            if (trend.opening === 0 && trend.closing === 0) {
              return { status: 'unknown', detail: trend,
                observation: 'No threat language was found anywhere, so the shape of the pressure could not be read. If your danger is carried by situation rather than wording, this measure will not see it.' };
            }
            return { status: trend.direction === 'rising' ? 'met' : trend.direction === 'flat' ? 'partial' : 'unmet',
              observation: 'Threat language moves from ' + trend.opening + ' to ' + trend.closing + ' per 1,000 words across the book (' + trend.direction + ').',
              detail: trend };
          } },
        { id: 'resistance', evidence: EVIDENCE.AI,
          expectation: 'Someone refuses, and pays for it',
          why: 'Whether a character genuinely resists, and at what cost, is a question about meaning. The engine will not infer it from vocabulary.' }
      ]
    }
  };

  function forGenre(primary) { return GENRES[primary] || null; }

  function evaluate(primary, ctx) {
    const model = forGenre(primary);
    if (!model) return { applicable: false, reason: 'No reader-expectation model has been written for this genre yet.' };
    const results = model.expectations.map(item => {
      const base = { id: item.id, expectation: item.expectation, why: item.why, evidence: item.evidence };
      if (!item.measure) {
        return Object.assign(base, { status: 'unknown',
          observation: item.evidence === EVIDENCE.AI
            ? 'Needs the AI reader to judge; it never affects your scores.'
            : 'Only you can answer this one.' });
      }
      try { return Object.assign(base, item.measure(ctx)); }
      catch (_) { return Object.assign(base, { status: 'unknown', observation: 'This could not be measured for this manuscript.' }); }
    });
    return { applicable: true, genre: primary, label: model.label, promise: model.promise,
      expectations: results,
      measured: results.filter(r => r.status !== 'unknown').length };
  }

  return { evaluate, forGenre, EVIDENCE, GENRES, coOccurrence, arcTrend };
})();

if (typeof globalThis !== 'undefined') globalThis.GenreExpectations = GenreExpectations;
if (typeof window !== 'undefined') window.GenreExpectations = GenreExpectations;
if (typeof module !== 'undefined' && module.exports) module.exports = GenreExpectations;
