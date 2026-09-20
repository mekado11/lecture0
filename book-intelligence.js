// AuthorScrolls — Book Intelligence Layer v1
// Deterministic foundation for whole-book context. AI enrichment can merge into this
// structure later, but the base model is useful offline and never invents story facts.

const BookIntelligence = (() => {
  // Function words, sentence openers and common non-person capitalisations. This list is a
  // backstop only — the real filter is the sentence-position test in extractCharacterCandidates,
  // which is what separates a name from any word that merely starts a sentence.
  const STOP_NAMES = new Set([
    'The','A','An','And','But','Or','Nor','So','Yet','For','If','When','While','Then','Than',
    'This','That','These','Those','There','Here','Not','No','Now','Never','Always','Once',
    'He','She','They','His','Her','Hers','Their','Them','It','Its','I','We','Us','Our','You','Your',
    'Him','Himself','Herself','Themselves','Myself','Ourselves','Who','Whom','Whose','What','Which',
    'Why','How','Where','Because','Since','Although','Though','Unless','Until','Before','After',
    'During','Between','Through','Across','Behind','Beneath','Beside','Beyond','Within','Without',
    'Every','Each','Some','Something','Someone','Somebody','Somewhere','Anything','Anyone','Anybody',
    'Nothing','Nobody','Everything','Everyone','Everybody','Many','Most','Much','More','Less','Few',
    'Both','Either','Neither','All','Any','One','Two','Three','Four','Five','Six','Seven','Eight',
    'Nine','Ten','First','Second','Third','Last','Next','Another','Other','Such','Same','Own',
    'Yes','Maybe','Perhaps','Even','Still','Just','Only','Also','Again','Ever','Well','Sure',
    'Let','Look','Listen','Wait','Come','Go','Stop','Please','Thank','Thanks','Sorry','Hello','Goodbye',
    'Was','Were','Is','Are','Been','Being','Have','Has','Had','Did','Does','Do','Can','Could',
    'Will','Would','Shall','Should','May','Might','Must','Am','Get','Got','Make','Made','Take','Took',
    'Chapter','Part','Book','Prologue','Epilogue','Introduction','Preface','Foreword','Afterword',
    'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
    'January','February','March','April','May','June','July','August','September','October',
    'November','December','Today','Tomorrow','Yesterday','Morning','Evening','Night','Day',
    'God','Lord','Allah','Heaven','Hell','Earth','Sun','Moon','Sky','Gold','Silver','Iron','Water',
    'Road','Map','Ground','Fire','Wind','Rain','Blood','Death','Life','Time','Truth','Home','House'
  ]);

  // Words that follow a name often enough to be evidence of personhood.
  const PERSON_VERBS = /^\s*(said|says|asked|replied|answered|whispered|shouted|called|cried|laughed|smiled|nodded|shrugged|sighed|frowned|turned|looked|walked|ran|stood|sat|knew|thought|felt|wanted|took|gave|told|watched|waited|came|went|would|could|had|was|is|has|'s|’s)\b/i;
  // Titles and address forms that precede a name.
  const PERSON_TITLES = /\b(mr|mrs|ms|miss|dr|doctor|professor|prof|sir|madam|madame|lady|lord|king|queen|prince|princess|chief|captain|sergeant|general|colonel|father|mother|mama|mamma|papa|baba|auntie|aunty|aunt|uncle|brother|sister|elder|master|mistress|saint|st)\.?\s*$/i;

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

  // A capitalised word is only evidence of a name when it is capitalised in a position that
  // does NOT require capitalisation. "Not", "There", "Because", "Gold" reach the top of a
  // frequency list purely by starting sentences; "Zara" earns its place mid-sentence. So we
  // record WHERE each capitalisation happened and keep only words that appear mid-sentence,
  // or that carry direct person evidence (a title, a possessive, or a speech/action verb).
  function collectNameStats(text) {
    const source = String(text || '');
    const stats = new Map(); // name -> {mid, initial, evidence}
    const re = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g;
    let match;
    while ((match = re.exec(source)) !== null) {
      const name = match[0];
      if (name.length > 60) continue;
      const parts = name.split(/\s+/);
      if (parts.every(part => STOP_NAMES.has(part))) continue;
      // Single words on the stop list are never names; a multi-word phrase survives only if
      // at least one word is not a stop word (e.g. "Mama Nneka" keeps its second word).
      if (parts.length === 1 && STOP_NAMES.has(name)) continue;

      const before = source.slice(Math.max(0, match.index - 40), match.index);
      const after = source.slice(match.index + name.length, match.index + name.length + 14);
      // Sentence-initial = start of text, or preceded only by terminal punctuation /
      // an opening quote / a newline. Everything else counts as mid-sentence.
      const sentenceInitial = /(^|[.!?][)"”’']?\s+|\n\s*|["“‘(]\s*)$/.test(before) || match.index === 0;
      const record = stats.get(name) || { mid: 0, initial: 0, evidence: 0 };
      if (sentenceInitial) record.initial++; else record.mid++;
      if (PERSON_TITLES.test(before)) record.evidence += 2;       // "Mama Nneka", "Chief Bello"
      if (/^['’]s\b/.test(after)) record.evidence += 2;            // "Zara's"
      if (PERSON_VERBS.test(after)) record.evidence += 1;          // "Zara said"
      stats.set(name, record);
    }
    return stats;
  }

  // Qualification runs on WHOLE-BOOK totals, never per chapter: a name is often sentence-initial
  // in one chapter and mid-sentence in another, and judging each chapter in isolation would
  // discard it from both.
  function qualifyNames(stats, limit = 30) {
    const out = [];
    for (const [name, record] of stats) {
      const mentions = record.mid + record.initial;
      if (mentions < 2) continue;
      // Needs at least one capitalisation that grammar did not force, or direct person
      // evidence. A word that is ONLY ever sentence-initial is not a name, however frequent.
      if (!(record.mid >= 1 || record.evidence >= 2)) continue;
      out.push({ name, mentions, midSentence: record.mid, evidence: record.evidence });
    }
    return out
      .sort((a,b) => (b.midSentence + b.evidence) - (a.midSentence + a.evidence) || b.mentions - a.mentions)
      .slice(0, limit)
      .map(({ name, mentions }) => ({ name, mentions }));
  }

  function mergeNameStats(target, source) {
    for (const [name, record] of source) {
      const current = target.get(name) || { mid: 0, initial: 0, evidence: 0 };
      current.mid += record.mid; current.initial += record.initial; current.evidence += record.evidence;
      target.set(name, current);
    }
    return target;
  }

  function extractCharacterCandidates(text) {
    return qualifyNames(collectNameStats(text));
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
    const plot=analysis.plot||{}, pacing=analysis.pacing||{}, dialogue=analysis.dialogue||{};
    const plotEvidence=plot.arc==='nonfiction'
      ? ['claim signals='+(plot.thesisSignals??0),'evidence signals='+(plot.evidenceSignals??0),'transition signals='+(plot.transitionSignals??0),'synthesis signals='+(plot.synthesisSignals??0)]
      : ['peak quarter='+(plot.peakQuarter??'N/A'),'tension signals='+(plot.quarters||[]).reduce((n,q)=>n+(q.tensionSignals||0),0),'action signals='+(plot.quarters||[]).reduce((n,q)=>n+(q.actionSignals||0),0),'resolution signals='+(plot.quarters||[]).reduce((n,q)=>n+(q.resolutionSignals||0),0)];
    const paceSegments=Array.isArray(pacing.segments)?pacing.segments:[];
    return {
      overall: metric(analysis.overall, 'Analyzer._computeScoreBundle', ['applicable dimensions only; weights renormalized']),
      plot: metric(scores.plot, plot.arc==='nonfiction'?'Analyzer._analyzeArgumentStructure':'Analyzer.analyzePlot', plotEvidence),
      pacing: metric(Number.isFinite(scores.plot)&&Number.isFinite(scores.transitions)?(scores.plot+scores.transitions)/2:null,'plot + transitions composite',['plot='+(scores.plot??'N/A'),'transitions='+(scores.transitions??'N/A'),'classified pacing segments='+paceSegments.length]),
      hook: metric(rp.hookStrength,'Analyzer.analyzeReaderPerspective',[byType('hook')+' hook finding(s)']),
      engagement: metric(rp.engagementScore,'Analyzer.analyzeReaderPerspective',['reader-perspective heuristic']),
      clarity: metric(rp.clarityScore,'Analyzer.analyzeReaderPerspective',[byType('clarity')+' clarity finding(s)']),
      copy: metric(scores.copy,'Analyzer.scoreCopyEditing',['validated copy findings='+['passive','adverb','cliche','wordy','confused-word','repetition','grammar'].reduce((n,t)=>n+byType(t),0)]),
      line: metric(scores.line,'Analyzer line-editing evidence model',['length-normalized observed candidates']),
      style: metric(scores.style,'Analyzer.analyzeStyle',['MSTTR/rhythm/observed style metrics']),
      dialogue: metric(scores.dialogue,'Analyzer.analyzeDialogue',['dialogue lines='+(dialogue.count??0),'observed candidates='+(dialogue.candidateCount??0)]),
      showTell: metric(scores.showTell,'Analyzer show/tell candidate-density index',[byType('show-tell')+' candidate(s)']),
      grammar: metric(scores.grammar,'Analyzer grammar density model',[byType('grammar')+' grammar finding(s)'])
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
    // Collect raw capitalisation statistics per chapter, then qualify against book-wide
    // totals so a name is judged on all its evidence, not one chapter's worth.
    const bookStats = new Map();
    const chapterStats = (parsed?.chapters || []).map(chapter => {
      const stats = collectNameStats(chapter.body || chapter.text);
      mergeNameStats(bookStats, stats);
      return stats;
    });
    const qualified = new Set(qualifyNames(bookStats, 60).map(candidate => candidate.name));

    const chapters = (parsed?.chapters || []).map((chapter, index) => {
      const pov = detectPOV(chapter.body || chapter.text);
      const stats = chapterStats[index];
      const candidates = [...stats.entries()]
        .filter(([name]) => qualified.has(name))
        .map(([name, record]) => ({ name, mentions: record.mid + record.initial }))
        .sort((a,b) => b.mentions - a.mentions)
        .slice(0, 30);
      return {
        id: chapter.id,
        index: chapter.index,
        title: chapter.title,
        wordCount: chapter.wordCount,
        pov,
        characterCandidates: candidates
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
