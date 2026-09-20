// AuthorScrolls — Chapter Metrics
// Compares each chapter against the REST OF THE SAME BOOK, which needs no external corpus
// and stays honest: it reports where a manuscript is unlike itself, never how it compares to
// books we have not measured. Rates are per 1,000 words so long and short chapters compare.
//
// Outliers use median + median absolute deviation, not mean + standard deviation: with a
// handful of chapters a single extreme chapter drags the mean toward itself and hides the very
// thing we are looking for. The median barely moves.
const ChapterMetrics = (() => {
  'use strict';

  const METRICS = [
    { key: 'passive',         label: 'Passive voice' },
    { key: 'adverb',          label: 'Adverbs' },
    { key: 'weak-verb',       label: 'Weak verbs' },
    { key: 'wordy',           label: 'Wordy phrases' },
    { key: 'cliche',          label: 'Clichés' },
    { key: 'repetition',      label: 'Repeated words' },
    { key: 'show-tell',       label: 'Telling, not showing' },
    { key: 'sentence-length', label: 'Long sentences' },
    { key: 'grammar',         label: 'Grammar' },
    { key: 'confused-word',   label: 'Confused words' }
  ];

  const MIN_CHAPTERS = 4;   // below this a median carries no information
  const MIN_WORDS = 300;    // below this a per-1,000-word rate is mostly noise
  const MIN_RATE = 0.8;     // ignore statistically loud but practically trivial differences
  const RATIO = 1.75;       // and require a real multiple of the book's own norm

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function mad(values, mid) {
    if (!values.length) return 0;
    return median(values.map(v => Math.abs(v - mid)));
  }
  function countWords(text) { return (String(text || '').match(/\b[\p{L}\p{N}'’-]+\b/gu) || []).length; }

  function averageSentenceWords(text) {
    const sentences = String(text || '').split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (!sentences.length) return 0;
    return countWords(text) / sentences.length;
  }

  // Assign each issue to the chapter whose [start,end) span contains its offset.
  function bucketIssues(chapters, issues) {
    const buckets = new Map(chapters.map(c => [c.id, Object.create(null)]));
    const ordered = [...chapters].sort((a, b) => a.start - b.start);
    for (const issue of issues || []) {
      const at = issue && typeof issue.index === 'number' ? issue.index : -1;
      if (at < 0) continue;
      let low = 0, high = ordered.length - 1, found = null;
      while (low <= high) {
        const midpoint = (low + high) >> 1, chapter = ordered[midpoint];
        if (at < chapter.start) high = midpoint - 1;
        else if (at >= chapter.end) low = midpoint + 1;
        else { found = chapter; break; }
      }
      if (!found) continue;
      const bucket = buckets.get(found.id);
      bucket[issue.type] = (bucket[issue.type] || 0) + 1;
    }
    return buckets;
  }

  function analyze(parsed, analysis) {
    const all = (parsed && parsed.chapters) || [];
    // Only real chapters: front matter, tables of contents and back matter are not the author's prose.
    const chapters = all.filter(c => c.kind === 'chapter' || c.kind === 'opening');
    const eligible = chapters.filter(c => (c.wordCount || countWords(c.body || c.text)) >= MIN_WORDS);

    if (chapters.length < MIN_CHAPTERS) {
      return { applicable: false, reason: chapters.length <= 1
        ? 'No chapter breaks were detected, so chapters cannot be compared.'
        : 'Only ' + chapters.length + ' chapters were detected. At least ' + MIN_CHAPTERS + ' are needed to compare them.',
        chapters: [], outliers: [] };
    }
    if (eligible.length < MIN_CHAPTERS) {
      return { applicable: false, reason: 'Most chapters are under ' + MIN_WORDS + ' words, which is too short to compare reliably.',
        chapters: [], outliers: [] };
    }

    const buckets = bucketIssues(eligible, (analysis && analysis.issues) || []);
    const rows = eligible.map(chapter => {
      const words = chapter.wordCount || countWords(chapter.body || chapter.text);
      const counts = buckets.get(chapter.id) || {};
      const per1k = {};
      for (const { key } of METRICS) per1k[key] = (counts[key] || 0) / Math.max(words, 1) * 1000;
      return { id: chapter.id, title: chapter.title, index: chapter.index, wordCount: words,
        counts, rates: per1k, avgSentenceWords: Math.round(averageSentenceWords(chapter.body || chapter.text) * 10) / 10 };
    });

    const outliers = [];
    for (const { key, label } of METRICS) {
      const values = rows.map(r => r.rates[key]);
      const mid = median(values);
      const spread = mad(values, mid);
      for (const row of rows) {
        const value = row.rates[key];
        if (value < MIN_RATE) continue;                       // trivial in absolute terms
        if (mid > 0 && value < mid * RATIO) continue;          // not a real multiple of the norm
        // Robust z-score. When every chapter is identical the spread is zero, so fall back to
        // the ratio test alone rather than dividing by zero.
        const score = spread > 0 ? 0.6745 * (value - mid) / spread : (mid > 0 ? value / mid : 0);
        if (spread > 0 && score < 3.5) continue;
        // A median of zero means no other chapter does this at all, which is the clearest
        // signal available — not a weak one, and there is no ratio to quote.
        const unique = mid === 0;
        outliers.push({ chapterId: row.id, title: row.title, metric: key, label,
          value: Math.round(value * 10) / 10, median: Math.round(mid * 10) / 10,
          count: row.counts[key] || 0,
          ratio: unique ? null : Math.round(value / mid * 10) / 10,
          uniqueToChapter: unique,
          severity: (unique && value >= MIN_RATE * 2) || score >= 6 || (mid > 0 && value >= mid * 3) ? 'high' : 'medium' });
      }
    }
    // High severity first, then the largest departure from the book's own norm.
    const rank = o => (o.severity === 'high' ? 1000 : 0) + (o.uniqueToChapter ? 100 : (o.ratio || 0));
    outliers.sort((a, b) => rank(b) - rank(a));

    // Length outliers are structural rather than line-level, so they are reported separately.
    const lengths = rows.map(r => r.wordCount);
    const lengthMid = median(lengths), lengthSpread = mad(lengths, lengthMid);
    const lengthNotes = lengthSpread > 0 ? rows.filter(r =>
      Math.abs(0.6745 * (r.wordCount - lengthMid) / lengthSpread) >= 3.5
    ).map(r => ({ chapterId: r.id, title: r.title, wordCount: r.wordCount, median: lengthMid,
      direction: r.wordCount > lengthMid ? 'longer' : 'shorter' })) : [];

    return { applicable: true, chapterCount: rows.length, chapters: rows,
      outliers: outliers.slice(0, 25), lengthNotes: lengthNotes.slice(0, 6),
      medians: Object.fromEntries(METRICS.map(({ key }) => [key, Math.round(median(rows.map(r => r.rates[key])) * 10) / 10])) };
  }

  return { analyze, METRICS, median, mad };
})();

if (typeof globalThis !== 'undefined') globalThis.ChapterMetrics = ChapterMetrics;   // window, worker self, and Node
if (typeof window !== 'undefined') window.ChapterMetrics = ChapterMetrics;
if (typeof module !== 'undefined' && module.exports) module.exports = ChapterMetrics;
