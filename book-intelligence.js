// AuthorScrolls — Book Intelligence Layer v1
// Deterministic foundation for whole-book context. AI enrichment can merge into this
// structure later, but the base model is useful offline and never invents story facts.

const BookIntelligence = (() => {
  const STOP_NAMES = new Set([
    'The','A','An','And','But','Or','If','When','Then','This','That','These','Those',
    'He','She','They','His','Her','Their','I','We','You','It','Chapter','Part','Book'
  ]);

  function stripDialogue(text) {
    return String(text || '').replace(/[“"][^”"]*[”"]/g, ' ');
  }

  function detectPOV(text) {
    const narration = stripDialogue(text);
    const first = (narration.match(/\b(I|me|my|mine|myself|we|us|our|ours)\b/g) || []).length;
    const third = (narration.match(/\b(he|him|his|she|her|hers|they|them|their|theirs)\b/gi) || []).length;
    const second = (narration.match(/\b(you|your|yours)\b/gi) || []).length;
    const total = first + third + second;
    if (!total) return { mode: 'unknown', confidence: 0, counts: { first, third, second } };
    const ranked = [['first', first], ['third', third], ['second', second]].sort((a,b) => b[1] - a[1]);
    const confidence = ranked[0][1] / Math.max(1, total);
    return { mode: confidence >= 0.58 ? ranked[0][0] : 'mixed', confidence, counts: { first, third, second } };
  }

  function extractCharacterCandidates(text) {
    const counts = new Map();
    const matches = String(text || '').match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g) || [];
    for (const name of matches) {
      if (STOP_NAMES.has(name) || name.length > 60) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts.entries()]
      .filter(([,mentions]) => mentions >= 2)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 30)
      .map(([name,mentions]) => ({ name, mentions }));
  }

  function buildScoreEvidence(analysis) {
    if (!analysis) return {};
    const rp = analysis.readerPerspective || {};
    const scores = analysis.scores || {};
    const issues = analysis.issues || [];
    const byType = type => issues.filter(i => i.type === type || i.category === type).length;
    const metric = (value, source, evidence = []) => ({
      value: Number.isFinite(value) ? Math.round(value) : null,
      source,
      evidence,
      status: Number.isFinite(value) ? 'measured' : 'not_measured'
    });
    return {
      overall: metric(analysis.overall, 'Analyzer.recalcOverall', ['weighted category scores']),
      plot: metric(scores.plot, 'Analyzer plot score', [byType('plot') + ' plot issue(s)']),
      pacing: metric(Number.isFinite(scores.plot) && Number.isFinite(scores.transitions) ? (scores.plot + scores.transitions) / 2 : null, 'plot + transitions composite', ['plot=' + (scores.plot ?? 'N/A'), 'transitions=' + (scores.transitions ?? 'N/A')]),
      hook: metric(rp.hookStrength, 'Analyzer.analyzeReaderPerspective', [byType('hook') + ' hook issue(s)']),
      engagement: metric(rp.engagementScore, 'Analyzer.analyzeReaderPerspective', ['reader-perspective heuristic']),
      clarity: metric(rp.clarityScore, 'Analyzer.analyzeReaderPerspective', [byType('clarity') + ' clarity issue(s)']),
      dialogue: metric(scores.dialogue, 'Analyzer dialogue score', [byType('dialogue') + ' dialogue issue(s)']),
      grammar: metric(scores.grammar, 'Analyzer grammar score', [byType('grammar') + ' grammar issue(s)'])
    };
  }

  function findScoreConflicts(evidence) {
    const conflicts = [];
    const hook = evidence?.hook?.value, engagement = evidence?.engagement?.value;
    if (hook != null && engagement != null && Math.abs(hook - engagement) >= 45) {
      conflicts.push({ metrics: ['hook','engagement'], severity: 'review', reason: 'Large opening/engagement divergence', values: { hook, engagement } });
    }
    const pacing = evidence?.pacing?.value, plot = evidence?.plot?.value;
    if (pacing != null && plot != null && Math.abs(pacing - plot) >= 35) {
      conflicts.push({ metrics: ['pacing','plot'], severity: 'review', reason: 'Pacing composite diverges sharply from plot score', values: { pacing, plot } });
    }
    return conflicts;
  }

  function build(parsed, analysis = null) {
    const chapters = (parsed?.chapters || []).map(chapter => {
      const pov = detectPOV(chapter.body || chapter.text);
      return {
        id: chapter.id,
        index: chapter.index,
        title: chapter.title,
        wordCount: chapter.wordCount,
        pov,
        characterCandidates: extractCharacterCandidates(chapter.body || chapter.text)
      };
    });

    const aggregate = new Map();
    chapters.forEach(chapter => chapter.characterCandidates.forEach(candidate => {
      const key = candidate.name.toLowerCase();
      const current = aggregate.get(key) || { canonicalName: candidate.name, mentions: 0, chapterIds: [] };
      current.mentions += candidate.mentions;
      if (!current.chapterIds.includes(chapter.id)) current.chapterIds.push(chapter.id);
      aggregate.set(key, current);
    }));

    const povModes = chapters.filter(c => c.pov.mode !== 'unknown').map(c => c.pov.mode);
    const changes = [];
    for (let i = 1; i < chapters.length; i++) {
      const prev = chapters[i - 1].pov, cur = chapters[i].pov;
      if (prev.mode !== 'unknown' && cur.mode !== 'unknown' && prev.mode !== cur.mode && prev.confidence >= .58 && cur.confidence >= .58) {
        changes.push({ fromChapterId: chapters[i - 1].id, toChapterId: chapters[i].id, from: prev.mode, to: cur.mode });
      }
    }

    const scoreEvidence = buildScoreEvidence(analysis);
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      chapterCount: chapters.length,
      chapters,
      characters: [...aggregate.values()].sort((a,b) => b.mentions - a.mentions),
      scoreEvidence,
      scoreConflicts: findScoreConflicts(scoreEvidence),
      pov: {
        modes: [...new Set(povModes)],
        chapterChanges: changes,
        // A chapter boundary change is evidence, not automatically an error. This avoids
        // the false-positive behavior of treating multi-POV novels as inconsistent.
        multiPOV: new Set(povModes.filter(m => m !== 'mixed')).size > 1
      }
    };
  }

  return { build, detectPOV, extractCharacterCandidates, buildScoreEvidence, findScoreConflicts };
})();

if (typeof window !== 'undefined') window.BookIntelligence = BookIntelligence;
if (typeof module !== 'undefined' && module.exports) module.exports = BookIntelligence;
