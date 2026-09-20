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
//   ai         — needs the advisory layer. Never affects a score, quotes no statistic.
//   author     — only the writer can answer. We ask; we do not guess.
//
// Where a status boundary exists it is a judgement call, so the observation always states
// the raw figure alongside it. The author can disagree with our reading and still have the
// number.
const GenreExpectations = (() => {
  'use strict';

  const EVIDENCE = { STRUCTURAL: 'structural', PROXY: 'proxy', AI: 'ai', AUTHOR: 'author' };

  const words = t => (String(t || '').match(/\b[\p{L}\p{N}'’-]+\b/gu) || []).length;
  const density = (text, re) => { const m = String(text || '').match(re); return (m ? m.length : 0) / Math.max(words(text), 1) * 1000; };
  const chaptersOf = parsed => (parsed && parsed.chapters || []).filter(c => c.kind === 'chapter' || c.kind === 'opening');
  const unknown = observation => ({ status: 'unknown', observation });

  // ---- shared structural measures ------------------------------------------------------

  // Which chapters two characters both appear in. The backbone of "are these two on the
  // page together?", which no keyword count can answer.
  function coOccurrence(intel, parsed) {
    const people = ((intel && intel.characterLedger && intel.characterLedger.characters) || [])
      .filter(c => c.chapterIds && c.chapterIds.length);
    if (people.length < 2) return null;
    const [a, b] = people;
    const ids = chaptersOf(parsed).map(c => c.id);
    const setA = new Set(a.chapterIds), setB = new Set(b.chapterIds);
    const shared = ids.filter(id => setA.has(id) && setB.has(id));
    return { a: a.name, b: b.name, totalChapters: ids.length, sharedChapters: shared.length,
      firstSharedIndex: shared.length ? ids.indexOf(shared[0]) : -1, sharedIds: shared };
  }

  const modeMix = analysis => {
    const mix = analysis && analysis.proseContext && analysis.proseContext.distribution;
    return mix && Object.keys(mix).length ? mix : null;
  };

  // A vocabulary trend across the arc. Explicitly a proxy: it measures word choice, not craft.
  function arcTrend(parsed, re) {
    const chapters = chaptersOf(parsed);
    if (chapters.length < 4) return null;
    const series = chapters.map(c => Math.round(density(c.body || c.text, re) * 10) / 10);
    const third = Math.max(1, Math.floor(series.length / 3));
    const avg = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
    const opening = Math.round(avg(series.slice(0, third)) * 10) / 10;
    const closing = Math.round(avg(series.slice(-third)) * 10) / 10;
    return { series, opening, closing,
      direction: closing > opening * 1.2 ? 'rising' : closing < opening * 0.8 ? 'falling' : 'flat' };
  }

  // Balance of scene against explanation. Catches the genre failure where a world or an
  // argument is delivered at the reader instead of lived through.
  const sceneBalance = ({ lectureAt = 45, easeAt = 25, noun = 'The world' }) => (ctx) => {
    const mix = modeMix(ctx.analysis);
    if (!mix) return unknown('Passage modes were not available for this manuscript.');
    const scene = (mix.action || 0) + (mix.dialogue || 0) + (mix.description || 0);
    return { status: mix.exposition <= easeAt ? 'met' : mix.exposition <= lectureAt ? 'partial' : 'unmet',
      observation: noun + ': explanatory passages are ' + mix.exposition + '% of the book against '
        + scene + '% scene (action, dialogue and description).', detail: mix };
  };

  const interiority = ({ metAt = 15, partialAt = 7 }) => (ctx) => {
    const mix = modeMix(ctx.analysis);
    if (!mix) return unknown('Passage modes were not available for this manuscript.');
    return { status: mix.reflection >= metAt ? 'met' : mix.reflection >= partialAt ? 'partial' : 'unmet',
      observation: 'Reflective passages make up ' + mix.reflection + '% of the book'
        + (mix.dialogue ? ', dialogue ' + mix.dialogue + '%' : '') + '.', detail: mix };
  };

  // How much of the book the central figure is actually present for.
  const leadPresence = ({ role = 'The protagonist' }) => (ctx) => {
    const people = (ctx.intel && ctx.intel.characterLedger && ctx.intel.characterLedger.characters) || [];
    const lead = people[0];
    const total = chaptersOf(ctx.parsed).length;
    if (!lead || !total) return unknown('A recurring central character could not be identified with confidence.');
    const share = lead.chapterIds.length / total;
    return { status: share >= 0.7 ? 'met' : share >= 0.4 ? 'partial' : 'unmet',
      observation: role + ' appears to be ' + lead.name + ', present in ' + lead.chapterIds.length
        + ' of ' + total + ' chapters.', detail: { name: lead.name, chapters: lead.chapterIds.length, total } };
  };

  // A recurring supporting cast, rather than a crowd that appears once each.
  const castRecurrence = ({ minRecurring = 3 }) => (ctx) => {
    const people = (ctx.intel && ctx.intel.characterLedger && ctx.intel.characterLedger.characters) || [];
    if (!people.length) return unknown('No recurring characters were identified with confidence.');
    const recurring = people.filter(c => (c.chapterIds || []).length >= 2);
    return { status: recurring.length >= minRecurring ? 'met' : recurring.length ? 'partial' : 'unmet',
      observation: recurring.length + ' character' + (recurring.length === 1 ? '' : 's') + ' recur across two or more chapters'
        + (recurring.length ? ' (' + recurring.slice(0, 4).map(c => c.name).join(', ') + ')' : '') + '.',
      detail: { recurring: recurring.length, total: people.length } };
  };

  const povSteadiness = () => (ctx) => {
    const pov = ctx.intel && ctx.intel.pov;
    if (!pov || !pov.modes || !pov.modes.length) return unknown('Point of view could not be read for this manuscript.');
    const changes = (pov.chapterChanges || []).length;
    return { status: changes === 0 ? 'met' : changes <= 2 ? 'partial' : 'unmet',
      observation: 'Point of view reads as ' + pov.modes.join(' and ')
        + (changes ? ', changing at ' + changes + ' chapter boundar' + (changes === 1 ? 'y' : 'ies') : ', steady across chapters')
        + '. A deliberate multi-POV structure will show here too.', detail: pov };
  };

  const trendMeasure = ({ re, label, risingIsGood = true, absentNote }) => (ctx) => {
    const trend = arcTrend(ctx.parsed, re);
    if (!trend) return unknown('Too few chapters to read a trend across the arc.');
    // Nothing detected is not a flat trend — it is an absence of measurement, and reporting
    // it as "flat" would dress a blank in the clothes of a finding.
    if (trend.opening === 0 && trend.closing === 0) return Object.assign(unknown(absentNote), { detail: trend });
    const good = risingIsGood ? trend.direction === 'rising' : trend.direction !== 'rising';
    return { status: good ? 'met' : trend.direction === 'flat' ? 'partial' : 'unmet',
      observation: label + ' moves from ' + trend.opening + ' to ' + trend.closing
        + ' per 1,000 words across the book (' + trend.direction + ').', detail: trend };
  };

  // Some genres are defined by what they keep OUT. A cosy mystery that reads like a
  // procedural has broken its promise even though nothing is technically wrong.
  const densityCeiling = ({ re, label, ceiling, note }) => (ctx) => {
    const chapters = chaptersOf(ctx.parsed);
    if (!chapters.length) return unknown('No chapters were available to measure.');
    const whole = chapters.map(c => c.body || c.text).join('\n\n');
    const rate = Math.round(density(whole, re) * 10) / 10;
    return { status: rate <= ceiling ? 'met' : rate <= ceiling * 2 ? 'partial' : 'unmet',
      observation: label + ' runs at ' + rate + ' per 1,000 words. ' + note, detail: { rate, ceiling } };
  };

  // How much of the book is spent in motion, as distinct from scene generally.
  const actionShare = ({ metAt = 25, partialAt = 12 }) => (ctx) => {
    const mix = modeMix(ctx.analysis);
    if (!mix) return unknown('Passage modes were not available for this manuscript.');
    return { status: mix.action >= metAt ? 'met' : mix.action >= partialAt ? 'partial' : 'unmet',
      observation: 'Action passages are ' + mix.action + '% of the book, description ' + mix.description + '%.',
      detail: mix };
  };

  // Chronology actually tracked through the book, from extracted time cues.
  const timeTracked = ({ subject = 'The account' }) => (ctx) => {
    const events = (ctx.intel && ctx.intel.timeline && ctx.intel.timeline.events) || [];
    const total = chaptersOf(ctx.parsed).length || 1;
    const covered = new Set(events.map(e => e.chapterId)).size;
    if (!events.length) return unknown(subject + ' has no explicit time cues, so its chronology could not be read. Time carried by implication will not show up here.');
    return { status: covered / total >= 0.5 ? 'met' : 'partial',
      observation: events.length + ' explicit time cue' + (events.length === 1 ? '' : 's') + ' across '
        + covered + ' of ' + total + ' chapters.', detail: { events: events.length, covered, total } };
  };

  // Nonfiction structure that document-intelligence already extracts per chapter.
  const nonfictionCoverage = ({ key, singular, plural }) => (ctx) => {
    const nf = ctx.intel && ctx.intel.nonfiction;
    if (!nf) return unknown('This manuscript was not read as nonfiction, so its structure was not extracted.');
    const rows = nf[key] || [];
    const total = chaptersOf(ctx.parsed).length || 1;
    const covered = new Set(rows.map(r => r.chapterId)).size;
    const share = covered / total;
    return { status: share >= 0.6 ? 'met' : share > 0 ? 'partial' : 'unmet',
      observation: rows.length + ' ' + (rows.length === 1 ? singular : plural) + ' found, across '
        + covered + ' of ' + total + ' chapters.', detail: { found: rows.length, covered, total } };
  };

  // ---- vocabularies used only by proxy measures ----------------------------------------
  const CONTROL = /\b(regime|council|authority|state|ministry|bureau|sector|district|ration|curfew|permit|patrol|surveillance|compliance|forbidden|outlawed|mandatory|assigned|citizen|subject|obey|order|law|rule|decree|punishment|sentence)\b/gi;
  const TENSION = /\b(danger|threat|fear|afraid|risk|caught|escape|hide|hunted|warning|trapped|desperate|urgent|too late|running out|blood|death|kill|lose|betray)\b/gi;
  const DREAD = /\b(wrong|strange|cold|silence|silent|watching|watched|behind|shadow|whisper|scratch|creak|stain|rot|wet|breathing|still|empty|alone|closer|something)\b/gi;
  const WONDER = /\b(magic|spell|rune|relic|beast|dragon|realm|kingdom|prophecy|curse|ancient|forbidden|ritual|blade|throne|sorcer|witch|god|temple|enchant)\b/gi;
  const TECH = /\b(ship|orbit|station|drive|reactor|module|protocol|system|colony|planet|signal|data|neural|implant|android|drone|quantum|hull|airlock|terraform)\b/gi;
  const GORE = /\b(blood|bloody|gore|corpse|mutilat|dismember|torture|scream|butcher|stab|slash|entrails|viscera|rotting|decay)\b/gi;
  const FRONTIER = /\b(saddle|rifle|holster|sheriff|marshal|ranch|cattle|prairie|canyon|mesa|homestead|stagecoach|saloon|spurs|corral|rustler|frontier|territory|wagon)\b/gi;
  const JOURNEY = /\b(road|trail|river|mountain|harbour|harbor|port|sail|march|crossing|map|compass|horizon|distance|onward|league|expedition|voyage|camp)\b/gi;
  const ARGUMENT = /\b(therefore|thus|hence|it follows|suppose|assume|premise|conclusion|argument|objection|counter|consider|granted|entails|implies|contradiction|necessarily|sufficient)\b/gi;
  const PERIOD = /\b(carriage|lantern|telegram|corset|parlour|parlor|regiment|musket|shilling|steamer|cobbles|bonnet|servant|estate|manor|coachman|petticoat|gaslight)\b/gi;

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
            if (!co) return unknown('Two recurring characters could not be identified with confidence, so page-sharing could not be measured.');
            const share = co.sharedChapters / Math.max(co.totalChapters, 1);
            const firstAt = co.firstSharedIndex < 0 ? null : Math.round((co.firstSharedIndex / Math.max(co.totalChapters, 1)) * 100);
            return { status: co.sharedChapters === 0 ? 'unmet' : share >= 0.5 ? 'met' : 'partial',
              observation: co.sharedChapters === 0
                ? co.a + ' and ' + co.b + ' never appear in the same chapter.'
                : co.a + ' and ' + co.b + ' share ' + co.sharedChapters + ' of ' + co.totalChapters
                  + ' chapters' + (firstAt !== null ? ', first together about ' + firstAt + '% of the way in' : '') + '.',
              detail: co };
          } },
        { id: 'interiority', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The reader is inside someone’s feelings',
          why: 'The genre runs on interior response. A romance told entirely from the outside reads as events rather than intimacy.',
          measure: interiority({ metAt: 15, partialAt: 7 }) },
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
            if (!trend) return unknown('Too few chapters to look at how the world is introduced.');
            return { status: trend.opening >= 2 ? 'met' : trend.opening >= 0.8 ? 'partial' : 'unmet',
              observation: 'Language of control and authority runs at ' + trend.opening + ' per 1,000 words in the opening third, and '
                + trend.closing + ' in the closing third (' + trend.direction + ').', detail: trend };
          } },
        { id: 'shown-not-lectured', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The world is lived in, not explained at the reader',
          why: 'The common failure of the genre is worldbuilding delivered as exposition. This compares how much of the book is explanatory against how much is scene.',
          measure: sceneBalance({ noun: 'The world' }) },
        { id: 'pressure', evidence: EVIDENCE.PROXY,
          expectation: 'The pressure tightens as the book goes on',
          why: 'Dystopias fail when the danger stays level. Measured here as the trend in threat language across chapters, which is a proxy for tension, not tension itself.',
          measure: trendMeasure({ re: TENSION, label: 'Threat language',
            absentNote: 'No threat language was found anywhere, so the shape of the pressure could not be read. If your danger is carried by situation rather than wording, this measure will not see it.' }) },
        { id: 'resistance', evidence: EVIDENCE.AI,
          expectation: 'Someone refuses, and pays for it',
          why: 'Whether a character genuinely resists, and at what cost, is a question about meaning. The engine will not infer it from vocabulary.' }
      ]
    },

    thriller: {
      label: 'Thriller / Suspense',
      promise: 'A reader opens a thriller to be pulled forward. They expect scene over explanation, a threat that grows rather than holds steady, and a reason to keep turning pages at the end of each chapter.',
      expectations: [
        { id: 'scene-driven', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The book moves in scene, not summary',
          why: 'Momentum is the promise. Explanation stops the clock the plot is running on.',
          measure: sceneBalance({ noun: 'Pace', easeAt: 20, lectureAt: 40 }) },
        { id: 'escalation', evidence: EVIDENCE.PROXY,
          expectation: 'The threat grows through the book',
          why: 'A thriller whose danger is as loud in chapter two as in chapter thirty has nowhere left to go. Measured as threat vocabulary across the arc, which is a proxy for real escalation.',
          measure: trendMeasure({ re: TENSION, label: 'Threat language',
            absentNote: 'No threat language was found, so escalation could not be read. Danger carried by situation rather than wording will not show up here.' }) },
        { id: 'protagonist-present', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The reader stays with someone they are afraid for',
          why: 'Suspense needs a person to be anxious about. A protagonist who disappears for long stretches takes the anxiety with them.',
          measure: leadPresence({ role: 'The central figure' }) },
        { id: 'stakes-personal', evidence: EVIDENCE.AI,
          expectation: 'The danger costs this character something specific',
          why: 'Generic peril does not grip. Whether the stakes are personal is a judgement about meaning, not a count.' }
      ]
    },

    mystery: {
      label: 'Mystery / Crime',
      promise: 'A reader opens a mystery to play fair against the author. They expect a question posed early, a cast who could plausibly be responsible, an investigator they stay with, and a solution that was reachable from the page.',
      expectations: [
        { id: 'investigator-present', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The reader stays with the investigator',
          why: 'The reader solves the puzzle over the detective’s shoulder. Chapters away from them are chapters away from the game.',
          measure: leadPresence({ role: 'The investigating figure' }) },
        { id: 'suspects', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'There is a cast who could each have done it',
          why: 'A mystery with one candidate is not a puzzle. Recurring characters are what make an alternative answer feel possible.',
          measure: castRecurrence({ minRecurring: 3 }) },
        { id: 'scene-driven', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The investigation happens on the page',
          why: 'Deduction summarised after the fact denies the reader the chance to get there first.',
          measure: sceneBalance({ noun: 'Investigation', easeAt: 25, lectureAt: 45 }) },
        { id: 'fair-play', evidence: EVIDENCE.AI,
          expectation: 'The solution was reachable from what the reader was shown',
          why: 'Fairness is the genre’s core contract, and it is a judgement about whether clues were genuinely planted — not something a word count can settle.' }
      ]
    },

    horror: {
      label: 'Horror / Paranormal',
      promise: 'A reader opens horror to be unsettled. They expect ordinary things to start going wrong, dread to accumulate rather than arrive all at once, and to be shown the wrongness rather than told the rules of it.',
      expectations: [
        { id: 'dread-builds', evidence: EVIDENCE.PROXY,
          expectation: 'Dread accumulates rather than arriving at once',
          why: 'Horror lives in anticipation. Measured as the trend in unease vocabulary, which is word choice rather than atmosphere itself.',
          measure: trendMeasure({ re: DREAD, label: 'Unease language',
            absentNote: 'No unease vocabulary was found, so the build could not be read. Dread carried by situation or implication will not show up in word counts.' }) },
        { id: 'shown-not-explained', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The wrongness is shown, not explained',
          why: 'Explaining a horror reliably reduces it. This compares scene against exposition.',
          measure: sceneBalance({ noun: 'The threat', easeAt: 20, lectureAt: 40 }) },
        { id: 'someone-to-fear-for', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'There is someone the reader fears for',
          why: 'Fear needs an occupant. A cast the reader never settles into makes events rather than terror.',
          measure: leadPresence({ role: 'The central figure' }) },
        { id: 'rules-hold', evidence: EVIDENCE.AI,
          expectation: 'Whatever is wrong behaves consistently',
          why: 'A threat that breaks its own logic stops being frightening and becomes arbitrary. That is a judgement about meaning.' }
      ]
    },

    fantasy: {
      label: 'Fantasy',
      promise: 'A reader opens a fantasy for a world with its own rules and a story lived inside them. They expect wonder to be present throughout rather than front-loaded, a cast to travel with, and the world delivered through scene rather than lecture.',
      expectations: [
        { id: 'lived-in-world', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The world is inhabited, not explained',
          why: 'The most common fantasy failure is the worldbuilding lecture. This compares explanation against scene.',
          measure: sceneBalance({ noun: 'The world', easeAt: 25, lectureAt: 45 }) },
        { id: 'wonder-sustained', evidence: EVIDENCE.PROXY,
          expectation: 'Wonder is sustained, not front-loaded',
          why: 'A world that stops being strange after the opening chapters quietly becomes ordinary. Measured as the spread of the fantastic in the vocabulary, which is a crude reading of a subtle thing.',
          measure: trendMeasure({ re: WONDER, label: 'Language of the fantastic', risingIsGood: false,
            absentNote: 'No fantastical vocabulary was found, so its spread could not be read.' }) },
        { id: 'cast', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'There is a company to travel with',
          why: 'Fantasy readers bond with a group as much as a plot. Characters who appear once are scenery.',
          measure: castRecurrence({ minRecurring: 3 }) },
        { id: 'rules-consistent', evidence: EVIDENCE.AI,
          expectation: 'The world’s rules stay consistent once set',
          why: 'Magic that can do anything resolves nothing. Consistency is a judgement about meaning across the whole book.' }
      ]
    },

    scifi: {
      label: 'Science Fiction',
      promise: 'A reader opens science fiction for an idea taken seriously and followed through. They expect the concept to shape events rather than decorate them, to live in the world rather than be briefed on it, and for consequences to follow the premise.',
      expectations: [
        { id: 'lived-in-world', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The reader lives in the idea rather than being briefed on it',
          why: 'Exposition is the genre’s standing temptation. This compares explanation against scene.',
          measure: sceneBalance({ noun: 'The premise', easeAt: 25, lectureAt: 45 }) },
        { id: 'concept-present', evidence: EVIDENCE.PROXY,
          expectation: 'The idea stays present across the book',
          why: 'A premise introduced and then abandoned leaves a novel that could have been set anywhere. Measured as the spread of the concept vocabulary, which is a crude proxy for thematic presence.',
          measure: trendMeasure({ re: TECH, label: 'Language of the premise', risingIsGood: false,
            absentNote: 'No speculative vocabulary was found, so the presence of the idea could not be read.' }) },
        { id: 'someone-to-follow', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'A person carries the idea',
          why: 'Concepts do not generate feeling on their own; someone has to live with the consequences.',
          measure: leadPresence({ role: 'The central figure' }) },
        { id: 'consequences', evidence: EVIDENCE.AI,
          expectation: 'The premise has consequences the story follows through',
          why: 'The difference between science fiction and set dressing is whether the idea changes what happens. That is a judgement about meaning.' }
      ]
    },

    literary: {
      label: 'Literary Fiction',
      promise: 'A reader opens literary fiction for consciousness and language. They expect interiority, a voice that is doing something deliberate, and a shape that rewards attention even where plot is quiet. The genre is defined partly by breaking convention, so these are observations rather than requirements.',
      expectations: [
        { id: 'interiority', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The reader spends time inside a consciousness',
          why: 'Interiority is usually the engine of the form. A low figure is not a fault if the distance is deliberate.',
          measure: interiority({ metAt: 20, partialAt: 10 }) },
        { id: 'pov-deliberate', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'Point of view is handled deliberately',
          why: 'Literary fiction shifts perspective more often than most genres, and does it on purpose. This reports what the book does so you can confirm it is intended.',
          measure: povSteadiness() },
        { id: 'voice', evidence: EVIDENCE.AI,
          expectation: 'The prose has a voice of its own',
          why: 'Distinctiveness is the whole game here, and it is the least countable thing in writing.' }
      ]
    },

    ya: {
      label: 'Young Adult',
      promise: 'A reader opens YA for a young protagonist whose inner life is taken seriously, in a voice that sounds like a person rather than an adult reporting on one. They expect to stay close to that character throughout.',
      expectations: [
        { id: 'close-to-protagonist', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The reader stays close to one young protagonist',
          why: 'YA runs on identification. Distance from the protagonist costs the genre its main engine.',
          measure: leadPresence({ role: 'The protagonist' }) },
        { id: 'interiority', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'Their inner life is on the page',
          why: 'The reader is there for what it feels like, not only for what happens.',
          measure: interiority({ metAt: 18, partialAt: 9 }) },
        { id: 'pov-steady', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'Perspective is steady enough to inhabit',
          why: 'Frequent shifts make identification harder, unless the alternation is itself the design.',
          measure: povSteadiness() },
        { id: 'voice-authentic', evidence: EVIDENCE.AI,
          expectation: 'The voice sounds like the age it claims',
          why: 'Authenticity of voice is exactly what YA readers detect first, and it cannot be counted.' }
      ]
    },

    historical: {
      label: 'Historical Fiction',
      promise: 'A reader opens historical fiction to be somewhere else in time and believe it. They expect period texture carried through the whole book rather than assembled in the opening, and history lived through rather than recounted.',
      expectations: [
        { id: 'lived-not-recounted', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'History is lived through, not recounted',
          why: 'Research delivered as explanation turns a novel into a lecture with characters in it.',
          measure: sceneBalance({ noun: 'The period', easeAt: 25, lectureAt: 45 }) },
        { id: 'texture-sustained', evidence: EVIDENCE.PROXY,
          expectation: 'Period texture continues past the opening',
          why: 'Detail often clusters at the start and thins out. Measured as period vocabulary across the arc, which catches only the most literal kind of texture.',
          measure: trendMeasure({ re: PERIOD, label: 'Period detail', risingIsGood: false,
            absentNote: 'No period-specific vocabulary was found, so its spread could not be read. Texture carried by syntax, custom or attitude will not show up here.' }) },
        { id: 'someone-to-follow', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'A person carries the period',
          why: 'The reader needs someone to be there with, not a setting to be shown.',
          measure: leadPresence({ role: 'The central figure' }) },
        { id: 'anachronism', evidence: EVIDENCE.AI,
          expectation: 'Nothing breaks the period',
          why: 'Anachronism is a factual judgement about a specific time and place, which this engine has no basis to make.' }
      ]
    },

    memoir: {
      label: 'Memoir',
      promise: 'A reader opens a memoir for a life rendered as story. They expect the narrator present on the page, scenes rather than summary, and reflection that earns the events rather than merely reporting them.',
      expectations: [
        { id: 'narrator-present', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The narrator is on the page',
          why: 'Memoir is told from inside a life. This reports the point of view the book actually uses.',
          measure: povSteadiness() },
        { id: 'scene-not-summary', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The life is shown in scenes, not summarised',
          why: 'Summary is the most common memoir failure: a life reported rather than re-entered.',
          measure: sceneBalance({ noun: 'The telling', easeAt: 30, lectureAt: 50 }) },
        { id: 'reflection', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'Reflection earns the events',
          why: 'What separates memoir from anecdote is the meaning made of what happened.',
          measure: interiority({ metAt: 18, partialAt: 8 }) },
        { id: 'shape', evidence: EVIDENCE.AI,
          expectation: 'The life has been shaped into a story',
          why: 'Chronology is not structure. Whether a life has been given a shape is a judgement about meaning.' }
      ]
    },

    selfHelp: {
      label: 'Self-Help',
      promise: 'A reader opens a self-help book to change something. They expect to be addressed directly, to be given claims supported by evidence or lived example, and to leave each chapter with something they can actually do.',
      expectations: [
        { id: 'actionable', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'Each chapter leaves the reader something to do',
          why: 'The promise of the genre is change, and change needs an action. This counts the explicit actions the book states.',
          measure: nonfictionCoverage({ key: 'actions', singular: 'explicit action', plural: 'explicit actions' }) },
        { id: 'evidence', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'Claims are backed by evidence or lived example',
          why: 'Assertion without support is the failure mode readers abandon. This counts attributed claims and personal evidence the book supplies.',
          measure: (ctx) => {
            const nf = ctx.intel && ctx.intel.nonfiction;
            if (!nf) return unknown('This manuscript was not read as nonfiction, so its structure was not extracted.');
            const claims = (nf.claims || []).length, lived = (nf.personalEvidence || []).length;
            const total = chaptersOf(ctx.parsed).length || 1;
            const covered = new Set([...(nf.claims || []), ...(nf.personalEvidence || [])].map(r => r.chapterId)).size;
            return { status: covered / total >= 0.6 ? 'met' : covered ? 'partial' : 'unmet',
              observation: claims + ' attributed claim' + (claims === 1 ? '' : 's') + ' and ' + lived
                + ' passage' + (lived === 1 ? '' : 's') + ' of personal evidence, across ' + covered + ' of ' + total + ' chapters.',
              detail: { claims, lived, covered, total } };
          } },
        { id: 'reader-addressed', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The reader is spoken to directly',
          why: 'Self-help is written at a person. This reports how much of the book is in the instructional register.',
          measure: (ctx) => {
            const mix = modeMix(ctx.analysis);
            if (!mix) return unknown('Passage modes were not available for this manuscript.');
            return { status: mix.exposition >= 25 ? 'met' : mix.exposition >= 10 ? 'partial' : 'unmet',
              observation: 'Explanatory and instructional passages are ' + mix.exposition + '% of the book'
                + (mix.reflection ? ', reflection ' + mix.reflection + '%' : '') + '.', detail: mix };
          } },
        { id: 'promise-delivered', evidence: EVIDENCE.AI,
          expectation: 'The book delivers the change it promises',
          why: 'Whether a reader would actually be changed is the whole question, and the one least suited to counting.' }
      ]
    }
,

    romantasy: {
      label: 'Romantasy',
      promise: 'A reader opens a romantasy for both halves of the bargain: a relationship that carries the book, and a world with rules of its own. Neither is decoration for the other.',
      expectations: [
        { id: 'together', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The two leads share the page',
          why: 'The relationship is half the promise. A world, however rich, does not substitute for it.',
          measure: (ctx) => {
            const co = coOccurrence(ctx.intel, ctx.parsed);
            if (!co) return unknown('Two recurring characters could not be identified with confidence.');
            const share = co.sharedChapters / Math.max(co.totalChapters, 1);
            return { status: co.sharedChapters === 0 ? 'unmet' : share >= 0.5 ? 'met' : 'partial',
              observation: co.sharedChapters === 0 ? co.a + ' and ' + co.b + ' never appear in the same chapter.'
                : co.a + ' and ' + co.b + ' share ' + co.sharedChapters + ' of ' + co.totalChapters + ' chapters.',
              detail: co };
          } },
        { id: 'lived-in-world', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The world is inhabited, not explained',
          why: 'The other half of the bargain. Worldbuilding delivered as lecture stalls the romance as surely as it stalls a fantasy.',
          measure: sceneBalance({ noun: 'The world', easeAt: 25, lectureAt: 45 }) },
        { id: 'interiority', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The reader is inside the feeling',
          why: 'Romantasy readers come for longing as much as spectacle.',
          measure: interiority({ metAt: 15, partialAt: 7 }) },
        { id: 'stakes-entwined', evidence: EVIDENCE.AI,
          expectation: 'The world\u2019s danger and the relationship bear on each other',
          why: 'When the plot and the romance run on separate tracks the book reads as two books. Whether they are entwined is a judgement about meaning.' }
      ]
    },

    cozyMystery: {
      label: 'Cozy Mystery',
      promise: 'A reader opens a cosy for a puzzle solved somewhere they want to be. They expect an amateur they like, a community who recur, and violence kept firmly off the page.',
      expectations: [
        { id: 'community', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'There is a community, not just a case',
          why: 'The place and its people are the reason the reader returns. A cosy with a thin cast is a procedural in a village.',
          measure: castRecurrence({ minRecurring: 4 }) },
        { id: 'sleuth-present', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The reader stays with the amateur sleuth',
          why: 'The pleasure is watching an ordinary person work it out.',
          measure: leadPresence({ role: 'The sleuth' }) },
        { id: 'violence-off-page', evidence: EVIDENCE.PROXY,
          expectation: 'The violence stays off the page',
          why: 'This is the genre\u2019s defining restraint. Measured as the density of graphic vocabulary, which reads word choice rather than what a scene actually depicts.',
          measure: densityCeiling({ re: GORE, label: 'Graphic vocabulary', ceiling: 1.5,
            note: 'Cosy readers expect the aftermath, not the act.' }) },
        { id: 'fair-play', evidence: EVIDENCE.AI,
          expectation: 'The solution was reachable from the page',
          why: 'Fairness is the puzzle\u2019s contract, and whether clues were genuinely planted cannot be counted.' }
      ]
    },

    adventure: {
      label: 'Adventure',
      promise: 'A reader opens an adventure to be taken somewhere and kept moving. They expect momentum, physical consequence, and a journey that goes somewhere rather than circling.',
      expectations: [
        { id: 'in-motion', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The book spends its time in motion',
          why: 'Momentum is the promise. Reflection and explanation are the brakes.',
          measure: actionShare({ metAt: 25, partialAt: 12 }) },
        { id: 'journey', evidence: EVIDENCE.PROXY,
          expectation: 'The journey keeps moving through new ground',
          why: 'Adventure flags when the setting stops changing. Measured as the spread of travel and landscape vocabulary, a crude stand-in for actual movement.',
          measure: trendMeasure({ re: JOURNEY, label: 'Language of journey', risingIsGood: false,
            absentNote: 'No travel or landscape vocabulary was found, so movement through the world could not be read.' }) },
        { id: 'someone-to-follow', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'A person carries the journey',
          why: 'Events without someone to be anxious for are a travelogue.',
          measure: leadPresence({ role: 'The central figure' }) },
        { id: 'consequence', evidence: EVIDENCE.AI,
          expectation: 'The journey costs something',
          why: 'Peril without consequence stops mattering. That is a judgement about meaning, not a count.' }
      ]
    },

    western: {
      label: 'Western',
      promise: 'A reader opens a western for landscape, a code under pressure, and a confrontation that has been earned. They expect the country itself to be present on the page.',
      expectations: [
        { id: 'landscape', evidence: EVIDENCE.PROXY,
          expectation: 'The country is present throughout',
          why: 'Landscape is a character in this genre. Measured as frontier vocabulary across the arc, which catches only its most literal surface.',
          measure: trendMeasure({ re: FRONTIER, label: 'Frontier detail', risingIsGood: false,
            absentNote: 'No frontier vocabulary was found, so the presence of the country could not be read.' }) },
        { id: 'lived-not-recounted', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The world is lived in, not recounted',
          why: 'History and setting delivered as explanation flatten a form built on immediacy.',
          measure: sceneBalance({ noun: 'The country', easeAt: 25, lectureAt: 45 }) },
        { id: 'someone-to-follow', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The reader stays with one figure',
          why: 'The western runs on a person tested by a place.',
          measure: leadPresence({ role: 'The central figure' }) },
        { id: 'code', evidence: EVIDENCE.AI,
          expectation: 'A code is tested, not just stated',
          why: 'What separates the genre from costume is whether principle costs the character something. A judgement about meaning.' }
      ]
    },

    biography: {
      label: 'Biography',
      promise: 'A reader opens a biography for a real life made legible. They expect the subject present throughout, claims that rest on evidence, and a life shaped into a story rather than a chronology.',
      expectations: [
        { id: 'subject-present', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The subject is present throughout',
          why: 'Biographies drift into context and lose the person. This reports how much of the book the subject actually occupies.',
          measure: leadPresence({ role: 'The subject' }) },
        { id: 'evidenced', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'Claims rest on evidence',
          why: 'Authority is the genre\u2019s currency. This counts the attributed claims the book actually supplies.',
          measure: nonfictionCoverage({ key: 'claims', singular: 'attributed claim', plural: 'attributed claims' }) },
        { id: 'chronology', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The reader can place events in time',
          why: 'A life told without temporal anchors becomes a set of anecdotes. This counts explicit time cues across chapters.',
          measure: timeTracked({ subject: 'This biography' }) },
        { id: 'shape', evidence: EVIDENCE.AI,
          expectation: 'The life has been given a shape',
          why: 'Chronology is not structure. Whether a life has been made into a story is a judgement about meaning.' }
      ]
    },

    historyNF: {
      label: 'History',
      promise: 'A reader opens a history to understand what happened and why it mattered. They expect evidence, a chronology they can follow, and interpretation that is distinguishable from record.',
      expectations: [
        { id: 'evidenced', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'Claims are attributed',
          why: 'History without attribution is assertion. This counts the attributed claims present in the text.',
          measure: nonfictionCoverage({ key: 'claims', singular: 'attributed claim', plural: 'attributed claims' }) },
        { id: 'chronology', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The reader can follow the sequence',
          why: 'Chronological footing is what lets a reader hold a period in mind. This counts explicit time cues across chapters.',
          measure: timeTracked({ subject: 'This history' }) },
        { id: 'narrative', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'Analysis is carried by narrative',
          why: 'History that never lands in scene becomes an argument the reader cannot picture.',
          measure: sceneBalance({ noun: 'The account', easeAt: 40, lectureAt: 65 }) },
        { id: 'interpretation-marked', evidence: EVIDENCE.AI,
          expectation: 'Interpretation is distinguishable from record',
          why: 'Readers must be able to tell evidence from the historian\u2019s reading of it. That distinction is a judgement about meaning.' }
      ]
    },

    trueCrime: {
      label: 'True Crime',
      promise: 'A reader opens true crime for a real case handled responsibly. They expect sourcing, a sequence they can follow, and victims treated as people rather than plot devices.',
      expectations: [
        { id: 'sourced', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The account is sourced',
          why: 'Real cases carry real consequences for real people. This counts the attributed claims the book supplies.',
          measure: nonfictionCoverage({ key: 'claims', singular: 'attributed claim', plural: 'attributed claims' }) },
        { id: 'chronology', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The sequence is followable',
          why: 'A case the reader cannot order is a case they cannot assess. This counts explicit time cues across chapters.',
          measure: timeTracked({ subject: 'This account' }) },
        { id: 'restraint', evidence: EVIDENCE.PROXY,
          expectation: 'Detail serves understanding rather than spectacle',
          why: 'The genre\u2019s ethical line. Measured only as the density of graphic vocabulary, which cannot tell dwelling from reporting \u2014 read it as a prompt to look, not a verdict.',
          measure: densityCeiling({ re: GORE, label: 'Graphic vocabulary', ceiling: 3,
            note: 'Worth checking whether the detail is doing work for the reader.' }) },
        { id: 'victims', evidence: EVIDENCE.AI,
          expectation: 'Victims are people, not plot devices',
          why: 'This is the responsibility the genre carries, and no count can speak to it.' }
      ]
    },

    philosophy: {
      label: 'Philosophy / Religion',
      promise: 'A reader opens philosophy to follow an argument they can test. They expect reasoning made visible, examples that illuminate rather than decorate, and objections met rather than avoided.',
      expectations: [
        { id: 'reasoning-visible', evidence: EVIDENCE.PROXY,
          expectation: 'The reasoning is visible on the page',
          why: 'A reader must be able to follow the steps in order to disagree with them. This is a proxy: it counts argumentative connectives, which show the shape of an argument and say nothing whatever about whether it is any good.',
          measure: (ctx) => {
            const chapters = chaptersOf(ctx.parsed);
            if (!chapters.length) return unknown('No chapters were available to measure.');
            const rate = Math.round(density(chapters.map(c => c.body || c.text).join('\n\n'), ARGUMENT) * 10) / 10;
            return { status: rate >= 3 ? 'met' : rate >= 1 ? 'partial' : 'unmet',
              observation: 'Argumentative connectives (therefore, suppose, it follows) run at ' + rate
                + ' per 1,000 words. Sparse scaffolding can mean the steps are implicit rather than absent.',
              detail: { rate } };
          } },
        { id: 'examples', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'Abstractions are brought down to cases',
          why: 'Examples are how an argument becomes checkable. This counts the illustrative passages the text supplies.',
          measure: nonfictionCoverage({ key: 'personalEvidence', singular: 'illustrative passage', plural: 'illustrative passages' }) },
        { id: 'not-only-assertion', evidence: EVIDENCE.STRUCTURAL,
          expectation: 'The book is more than sustained assertion',
          why: 'Philosophy delivered as unbroken exposition asks for agreement rather than assent.',
          measure: sceneBalance({ noun: 'The argument', easeAt: 50, lectureAt: 75 }) },
        { id: 'objections', evidence: EVIDENCE.AI,
          expectation: 'The strongest objection is met',
          why: 'Whether an argument engages its best opponent is the measure of its seriousness, and it cannot be counted.' }
      ]
    }
  };

  function forGenre(primary) { return GENRES[primary] || null; }

  function evaluate(primary, ctx) {
    const model = forGenre(primary);
    if (!model) return { applicable: false, reason: 'No reader-expectation model has been written for this genre yet.' };
    const context = ctx || {};
    const results = model.expectations.map(item => {
      const base = { id: item.id, expectation: item.expectation, why: item.why, evidence: item.evidence };
      if (!item.measure) {
        return Object.assign(base, { status: 'unknown',
          observation: item.evidence === EVIDENCE.AI
            ? 'Needs the AI reader to judge; it never affects your scores.'
            : 'Only you can answer this one.' });
      }
      try { return Object.assign(base, item.measure(context)); }
      catch (_) { return Object.assign(base, unknown('This could not be measured for this manuscript.')); }
    });
    return { applicable: true, genre: primary, label: model.label, promise: model.promise,
      expectations: results, measured: results.filter(r => r.status !== 'unknown').length };
  }

  return { evaluate, forGenre, EVIDENCE, GENRES, coOccurrence, arcTrend };
})();

if (typeof globalThis !== 'undefined') globalThis.GenreExpectations = GenreExpectations;
if (typeof window !== 'undefined') window.GenreExpectations = GenreExpectations;
if (typeof module !== 'undefined' && module.exports) module.exports = GenreExpectations;
