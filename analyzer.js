// ManuscriptLens - Analysis Engine v2

// Fiction overall-score weights — single source of truth used by both analyze() and recalcOverall().
// Changing a weight here automatically keeps both in sync.
const _FICTION_WEIGHTS = {
  plot: 0.09, transitions: 0.07, copy: 0.10, line: 0.09, style: 0.07,
  dialogue: 0.06, showTell: 0.07, grammar: 0.10,
  clarity: 0.09, discipline: 0.07, efficiency: 0.06, engagement: 0.07, momentum: 0.06
};
// Quick sanity check: weights must sum to 1.00
// (Object.values(_FICTION_WEIGHTS).reduce((a,b)=>a+b,0) === 1.00 ✓)

const SECTION_TYPES = {
  FRONT_MATTER: 'front_matter',
  NARRATIVE: 'narrative',
  BACK_MATTER: 'back_matter',
  UNKNOWN: 'unknown'
};

const FRONT_MATTER_PATTERNS = [
  /^copyright\b/i,
  /all rights reserved/i,
  /isbn[:\s\d-]/i,
  /library of congress/i,
  /published by/i,
  /publisher'?s? note/i,
  /work of fiction/i,
  /important disclaimer/i,
  /^disclaimer\b/i,
  /^legal notice/i,
  /^dedication\s*$/i,
  /^acknowledg(e)?ments?\s*$/i,
  /^table of contents\s*$/i,
  /^contents\s*$/i,
  /^preface\b/i,
  /^foreword\b/i,
  /^title page\b/i,
  /first (edition|printing)/i,
  /printed in (the )?[a-z]/i,
  /no part of this (book|publication|work)/i,
  /without (the )?(prior )?written permission/i,
  /^also by\b/i,
  /cover (design|art|photo)/i,
  /^©/,
  /this (book|publication) is (designed|intended) to provide/i,
  /the author and publisher/i
];

const BACK_MATTER_PATTERNS = [
  /^about the author\b/i,
  /^acknowledg(e)?ments?\s*$/i,
  /^appendix\b/i,
  /^glossary\s*$/i,
  /^bibliograph/i,
  /^index\s*$/i,
  /^end ?notes?\s*$/i,
  /^references\s*$/i,
  /^also by\b/i,
  /^afterword\b/i,
  /^resources\s*$/i
];

const Analyzer = {

  // ========================
  // DOCUMENT SEGMENTATION — stage 1 of the pipeline.
  // Classify front matter (copyright/ISBN/dedication/ToC/disclaimers) and back matter
  // (about the author/appendix/index) BEFORE any literary analysis. Narrative-only
  // dimensions (hook, plot, pacing, dialogue, POV, show-vs-tell) must never score a
  // copyright page. Fails open: if segmentation is uncertain, the whole text is treated
  // as narrative — exactly the pre-segmentation behavior.
  // ========================
  segmentDocument(text) {
    const fallback = {
      narrativeStart: 0, narrativeEnd: text.length,
      frontMatterWords: 0, backMatterWords: 0, narrativeWords: (text.match(/\b\w+\b/g) || []).length,
      sections: [{ type: SECTION_TYPES.NARRATIVE, start: 0, end: text.length }],
      applicable: true
    };
    if (!text || text.length < 400) return fallback;

    // Split into blocks (blank-line separated), preserving exact offsets
    const blocks = [];
    let cursor = 0;
    for (const part of text.split(/(\n\s*\n)/)) {
      if (part.trim() && !/^\n\s*\n$/.test(part)) blocks.push({ text: part, start: cursor, end: cursor + part.length });
      cursor += part.length;
    }
    if (blocks.length < 2) return fallback;

    const wordCount = s => (s.match(/\b\w+\b/g) || []).length;
    const isFrontBlock = b => {
      const t = b.text.trim();
      if (FRONT_MATTER_PATTERNS.some(re => re.test(t))) return true;
      // Metadata-ish: short block containing publishing tokens
      if (wordCount(t) <= 60 && /(©|\(c\)\s*\d{4}|isbn|www\.|\.com\b|@|\b\d{4} by\b|edition|publishing|publisher)/i.test(t)) return true;
      return false;
    };
    // Table of contents: a block whose lines are mostly chapter labels / dotted page refs
    const isTocBlock = b => {
      const lines = b.text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 4) return false;
      const tocLines = lines.filter(l =>
        /^(chapter|part|prologue|epilogue|introduction|section|appendix)\b/i.test(l) || /\.{2,}\s*\d+\s*$/.test(l) || /\s\d{1,4}\s*$/.test(l) && l.length < 60
      ).length;
      return tocLines / lines.length > 0.6;
    };
    const isHeadingOnly = b => wordCount(b.text) <= 12 && !/[.!?]\s*["']?\s*$/.test(b.text.trim());

    // ---- Find where narrative starts ----
    // Front matter continues only while blocks AFFIRMATIVELY look like front matter
    // (patterns / ToC / bare headings / tiny fragments). The first ordinary prose block
    // ends it — this direction fails open: uncertain blocks count as narrative.
    let firstNarrativeIdx = 0;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const isFrontish = isFrontBlock(b) || isTocBlock(b) || isHeadingOnly(b) || wordCount(b.text) < 15;
      // Safety valve: never classify more than 30% of the doc as front matter
      if (!isFrontish || b.end > text.length * 0.3) { firstNarrativeIdx = i; break; }
      firstNarrativeIdx = i + 1;
    }
    if (firstNarrativeIdx >= blocks.length) firstNarrativeIdx = 0;
    // Include an immediately-preceding chapter/part heading with the narrative it introduces
    if (firstNarrativeIdx > 0) {
      const prev = blocks[firstNarrativeIdx - 1];
      if (isHeadingOnly(prev) && !isFrontBlock(prev) && !isTocBlock(prev)) firstNarrativeIdx -= 1;
    }

    // ---- Find where back matter starts: last BACK heading in the final 20% of the doc ----
    let backStartOffset = text.length;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (b.start < text.length * 0.8) break;
      if (BACK_MATTER_PATTERNS.some(re => re.test(b.text.trim()))) backStartOffset = b.start;
    }

    const narrativeStart = blocks[firstNarrativeIdx] ? blocks[firstNarrativeIdx].start : 0;
    const narrativeEnd = Math.max(narrativeStart, backStartOffset);
    const narrativeWords = wordCount(text.slice(narrativeStart, narrativeEnd));
    // Fail open when segmentation leaves too little narrative to trust
    if (narrativeWords < 150) return fallback;

    const sections = [];
    if (narrativeStart > 0) sections.push({ type: SECTION_TYPES.FRONT_MATTER, start: 0, end: narrativeStart });
    sections.push({ type: SECTION_TYPES.NARRATIVE, start: narrativeStart, end: narrativeEnd });
    if (narrativeEnd < text.length) sections.push({ type: SECTION_TYPES.BACK_MATTER, start: narrativeEnd, end: text.length });

    return {
      narrativeStart, narrativeEnd,
      frontMatterWords: wordCount(text.slice(0, narrativeStart)),
      backMatterWords: wordCount(text.slice(narrativeEnd)),
      narrativeWords,
      sections,
      applicable: true
    };
  },

  // ========================
  // GENRE FAMILY HELPERS
  // ========================
  NONFICTION_GENRES: new Set(['memoir','selfHelp','biography','historyNF','trueCrime','philosophy','nonfiction']),

  isNonfiction(genre) {
    if (!genre) return false;
    const key = typeof genre === 'string' ? genre : (genre.primary || '');
    return this.NONFICTION_GENRES.has(key);
  },

  _GENRE_LABELS_INTERNAL: {
    scifi:'Science Fiction',fantasy:'Fantasy',romance:'Romance',thriller:'Thriller/Suspense',
    mystery:'Mystery/Crime',horror:'Horror/Paranormal',historical:'Historical Fiction',
    dystopian:'Dystopian',ya:'Young Adult',literary:'Literary Fiction',romantasy:'Romantasy',
    cozyMystery:'Cozy Mystery',adventure:'Adventure',western:'Western',
    memoir:'Memoir/Autobiography',selfHelp:'Self-Help',biography:'Biography',
    historyNF:'History',trueCrime:'True Crime',philosophy:'Philosophy/Religion',
    nonfiction:'Nonfiction',fiction:'Fiction'
  },

  _genreLabelFor(key) {
    return this._GENRE_LABELS_INTERNAL[key] || key;
  },

  // ========================
  // MANUSCRIPT MODE DETECTION
  // ========================
  detectMode(text) {
    const words = (text.match(/\b\w+\b/g) || []).length;
    const lower = text.toLowerCase();

    // Check for chapter headings
    const chapterHeadings = (text.match(/^(chapter\s+\d+|chapter\s+[a-z]+|part\s+\d+|part\s+[a-z]+)/gim) || []).length;
    // Scene breaks
    const sceneBreaks = (text.match(/\n\s*(\*\s*\*\s*\*|---|\* \* \*|#)\s*\n/g) || []).length;
    // Estimated pages (~250 words/page)
    const estPages = Math.round(words / 250);

    let mode = 'chapter'; // default
    let confidence = 'auto';

    if (chapterHeadings >= 3) {
      mode = 'book';
    } else if (words > 25000) {
      mode = 'book';
    } else if (words > 8000 && (chapterHeadings >= 1 || sceneBreaks >= 3)) {
      mode = 'book';
    } else if (words < 1500) {
      mode = 'excerpt';
    } else {
      mode = 'chapter';
    }

    const modeLabels = {
      excerpt: 'Excerpt / Scene',
      chapter: 'Chapter',
      book: 'Full Manuscript'
    };

    return {
      mode,
      label: modeLabels[mode],
      confidence,
      wordCount: words,
      estPages,
      chapterHeadings,
      sceneBreaks
    };
  },

  // ========================
  // PASSIVE VOICE DETECTION
  // ========================
  PASSIVE_PATTERNS: [
    // Irregular participles are listed by word. A bare "-en" ending is not one: "was then",
    // "was open", "were seven" and "was even" are not passive. "gone" and "fallen" are
    // intransitive and never passive either.
    /\b(was|were|is|are|been|being|be)\s+(being\s+)?([\w]+ed|awoken|beaten|bitten|blown|broken|built|caught|chosen|cut|done|drawn|driven|eaten|felt|flown|forbidden|forgiven|forgotten|fought|found|frozen|given|gotten|grown|heard|held|hidden|hit|hung|hurt|kept|known|laden|laid|led|left|lent|let|lost|made|meant|met|mistaken|overtaken|overthrown|paid|proven|put|read|rewritten|rid|ridden|run|said|sat|seen|sent|set|sewn|shaken|shot|shown|shrunken|shut|smitten|sold|sown|spent|spoken|stolen|stood|stricken|struck|stuck|sung|sunken|sworn|swollen|taken|taught|thought|thrown|told|torn|trodden|understood|undertaken|withdrawn|woken|won|worn|woven|written)\b/gi
  ],
  // Non-passive -ed words that look passive but aren't (adjectives)
  PASSIVE_EXCEPTIONS: new Set([
    // Words that end in "-ed" but are not participles at all
    'red','bed','shed','sled','bred','need','indeed','seed','weed','reed','feed','speed',
    'sacred','hundred','kindred','hatred','naked','wicked','wretched','crooked','ragged',
    'rugged','jagged','dogged','aged','beloved','learned','blessed','cursed','wed',
    'interested','excited','bored','tired','married','worried','surprised',
    'pleased','satisfied','determined','experienced','advanced','complicated',
    'dedicated','detailed','distinguished','educated','exhausted','fascinated',
    'frightened','frustrated','motivated','organized','overwhelmed','relaxed',
    'reserved','skilled','stressed','talented','thrilled','touched','troubled',
    'terrified','scared','concerned','convinced','confused','depressed',
    'embarrassed','amazed','annoyed','ashamed','devoted','disappointed',
    'disgusted','horrified','impressed','obsessed','panicked','perplexed',
    'prepared','puzzled','relieved','shocked','startled','stunned',
    'committed','focused','inspired','attached','composed','connected',
    'distracted','disturbed','doomed','engaged','humiliated','isolated',
    'offended','paralyzed','rattled','resigned','settled','trapped'
  ]),

  // ========================
  // ADVERB DETECTION
  // ========================
  // Adverbs that qualify a CLAIM rather than an action: how often, how much, how certain, in
  // what order. "Research generally suggests" and "she eventually agreed" are doing work; the
  // craft target is the manner adverb propping up a weak verb ("walked slowly", "said softly").
  // Intensifiers (really, extremely, totally…) are deliberately NOT here: they are the padding.
  STANCE_ADVERBS: new Set(['generally','usually','typically','normally','often','frequently','rarely','seldom','occasionally','sometimes','mostly','largely','mainly','partly','partially','particularly','especially','specifically','simply','merely','nearly','roughly','approximately','exactly','precisely','probably','possibly','certainly','definitely','clearly','obviously','apparently','presumably','arguably','undoubtedly','ultimately','eventually','finally','initially','originally','recently','currently','previously','formerly','lately','increasingly','significantly','relatively','comparatively','similarly','likewise','consequently','accordingly','additionally','alternatively','essentially','fundamentally','technically','actually','basically','honestly','frankly','ideally','importantly','notably','interestingly','surprisingly','unfortunately','fortunately','hopefully','namely','respectively','historically','traditionally','statistically','theoretically','practically','effectively','directly','indirectly','equally','only','early','daily','weekly','monthly','yearly']),

  findAdverbs(text, genre) {
    const issues = [];
    // Nonfiction softening. This multiplies SEVERITY WEIGHT, never confidence: confidence is
    // a claim about whether the detection is real, and the validation layer discards anything
    // under 0.6. Multiplying confidence by 0.3-0.5 therefore deleted every one of these
    // findings for nonfiction instead of softening them. Register-appropriate instances are
    // now handled contextually by prose-norms.js, with a reason the author can read.
    const nfSoften = this.isNonfiction(genre);
    const nfWeight = 1;
    const regex = /\b(\w+ly)\b/gi;
    let match;
    // Comprehensive exceptions: -ly words that are NOT adverbs (adjectives, nouns, verbs).
    // Note: 'gently' and 'unlikely' are real adverbs and must NOT be listed here.
    const exceptions = new Set([
      // Adjectives ending in -ly
      'only','early','daily','holy','lonely','friendly','likely','ugly','costly',
      'deadly','elderly','ghostly','ghastly','goodly','heavenly','homely','jolly',
      'kindly','leisurely','lively','lovely','manly','measly','melancholy',
      'oily','orderly','scholarly','shapely','silly','sly','smelly','surly','timely',
      'unruly','woolly','worldly','comely','cowardly','curly','burly','grisly','hilly',
      'princely','seemly','sickly','stately','steely','wily','womanly','beastly',
      'bristly','bubbly','chilly','cleanly','crinkly',
      'crumbly','cuddly','dastardly','dimply','drizzly','fatherly',
      'frilly','frizzly','gangly','giggly','gnarly','godly','grizzly',
      'grumbly','jangly','jiggly','kingly','knightly','lowly',
      'matronly','motherly','neighborly','northerly','pearly',
      'pimply','portly','prickly','priestly','queenly','rascally','rumply','scaly',
      'sisterly','slovenly','southerly','sparkly','spindly','sprightly','squiggly',
      'straggly','ungainly','unmanly','unsightly','wiggly',
      'wrinkly',
      // Nouns ending in -ly
      'family','supply','rally','belly','bully','fly','july','apply','reply',
      'multiply','ally','italy','lily','folly','tally','assembly','anomaly',
      'jelly','gully','holly','monopoly','poly','trolley'
    ]);
    while ((match = regex.exec(text)) !== null) {
      const word = match[1].toLowerCase();
      if (exceptions.has(word)) continue;
      // Verify the match is actually an adverb by checking surrounding context
      // True adverbs typically modify verbs: "[adverb] [verb]" or "[verb] [adverb]"
      const before = text.substring(Math.max(0, match.index - 30), match.index).toLowerCase();
      const after = text.substring(match.index + match[1].length, Math.min(text.length, match.index + match[1].length + 30)).toLowerCase();
      // Confidence: higher if it appears next to a verb pattern
      let confidence = 0.7; // base confidence for -ly words
      if (/\b(was|were|is|are|had|have|has|did|could|would|should|will|might|can)\s*$/.test(before)) confidence = 0.5; // likely adjective after linking verb
      if (/^\s*(the|a|an|this|that|his|her|its|their|our|my|your)\b/.test(after)) confidence = 0.4; // before determiner = likely not adverb
      if (/\b(very|too|so|quite|rather|extremely)\s*$/.test(before)) confidence = 0.3; // "very quickly" — "quickly" IS an adverb but "very clumsy" — "clumsy" is not
      if (/^\s*[,.]/.test(after) && /\b(is|was|were|are|been|being|seem|look|feel|appear|become)\b/.test(before)) confidence = 0.3; // predicate adjective
      if (confidence < 0.6) continue; // skip low confidence

      // Find the verb the adverb modifies (word immediately before or after)
      const beforeWords = text.substring(Math.max(0, match.index - 40), match.index).match(/\b(\w+)\b/g) || [];
      const afterWords = text.substring(match.index + match[1].length, Math.min(text.length, match.index + match[1].length + 40)).match(/\b(\w+)\b/g) || [];
      const candidateVerb = (beforeWords[beforeWords.length - 1] || afterWords[0] || '').toLowerCase();
      const specificRewrite = this._adverbToStrongVerb(candidateVerb, word);

      const stance = this.STANCE_ADVERBS.has(word);
      // Attached to a speech tag ("said softly", "softly said"): the classic target.
      const tagAdjacent = /\b(said|asked|replied|whispered|shouted|muttered|answered|cried|called|told|snapped|sighed)\b\s*$/i.test(before) || /^\s*(said|asked|replied|whispered|shouted|muttered|answered|cried|called|told|snapped|sighed)\b/i.test(after);
      // Part of a deliberate list or stack ("quietly, persistently wrong"): deleting one word
      // leaves punctuation debris, so it is offered for editing, never applied.
      const listed = /^\s*,/.test(after) || /,\s*$/.test(before);
      issues.push({
        type: 'adverb', text: match[1], index: match.index, length: match[1].length,
        severity: 'low', confidence: confidence * nfWeight,
        stance, tagAdjacent, listed, autoFix: !stance && !listed,
        message: stance
          ? `"${match[1]}" qualifies a claim (how often, how much, how certain) rather than an action.`
          : `Adverb "${match[1]}" — consider a stronger verb that doesn't need modification.`,
        suggestion: specificRewrite || (stance ? `Keep it if the qualification is meant; cut it if the claim stands without it.` : `Remove "${match[1]}" and strengthen the verb it modifies.`)
      });
    }
    // The manuscript's own rate of manner adverbs, quoted on every finding so the author can
    // see whether this is a habit or a one-off. Stance adverbs are not counted as the habit.
    const totalWords = Math.max(1, (text.match(/\b\w+\b/g) || []).length);
    const manner = issues.filter(i => !i.stance);
    const mannerPerK = Math.round(manner.length / totalWords * 1000 * 10) / 10;
    for (const i of manner) {
      i.detail = { mannerAdverbs: manner.length, perK: mannerPerK };
      i.message += ` This manuscript uses ${manner.length} manner adverbs (${mannerPerK} per 1,000 words).`;
    }
    return issues;
  },

  // Adverb+verb → single strong verb map
  // Matches common patterns like "walked quickly" → "hurried/dashed/rushed"
  _adverbToStrongVerb(verb, adverb) {
    const map = {
      'walked+quickly':['hurried','dashed','rushed'],'walked+slowly':['strolled','ambled','sauntered'],
      'walked+quietly':['crept','tiptoed','stole'],'walked+heavily':['trudged','plodded','stomped'],
      'ran+quickly':['sprinted','bolted','raced'],'ran+slowly':['jogged','trotted'],
      'said+quietly':['whispered','murmured','muttered'],'said+loudly':['shouted','yelled','bellowed'],
      'said+angrily':['snapped','growled','barked'],'said+happily':['laughed','beamed','chirped'],
      'said+sadly':['sighed','mumbled'],'said+quickly':['blurted','rushed'],
      'said+firmly':['declared','stated','asserted'],'said+nervously':['stammered','faltered'],
      'looked+quickly':['glanced','glimpsed'],'looked+carefully':['scrutinized','examined','studied'],
      'looked+angrily':['glared','scowled'],'looked+sadly':['gazed'],
      'moved+quickly':['darted','lunged','bolted'],'moved+slowly':['crept','edged','drifted'],
      'laughed+loudly':['roared','cackled','howled'],'laughed+quietly':['chuckled','giggled'],
      'cried+loudly':['wailed','howled','sobbed'],'cried+quietly':['whimpered','wept'],
      'ate+quickly':['devoured','gobbled','wolfed'],'ate+slowly':['nibbled','picked'],
      'drank+quickly':['gulped','guzzled'],'drank+slowly':['sipped','nursed'],
      'hit+hard':['slammed','smashed','punched'],'hit+softly':['tapped','patted'],
      'closed+quickly':['slammed','snapped'],'closed+softly':['eased','pulled'],
      'opened+quickly':['flung','yanked','wrenched'],'opened+slowly':['eased','edged'],
      'spoke+quickly':['blurted','rushed'],'spoke+quietly':['whispered','murmured'],
      'held+tightly':['clenched','gripped','clutched'],'held+loosely':['cradled','cupped'],
      'turned+quickly':['spun','whirled','wheeled'],'turned+slowly':['pivoted','swiveled'],
      'sat+heavily':['slumped','collapsed','flopped'],'sat+quietly':['settled','perched'],
      'smiled+broadly':['grinned','beamed'],'smiled+sadly':['grimaced'],
      'thought+carefully':['pondered','considered','deliberated'],'thought+quickly':['realized'],
      'breathed+heavily':['panted','gasped','puffed'],'breathed+quietly':['exhaled']
    };
    const key = verb + '+' + adverb.toLowerCase();
    const alts = map[key];
    if (alts && alts.length) {
      return `Try: "${verb} ${adverb}" → "${alts.slice(0,3).join('" / "')}"`;
    }
    return null;
  },

  // ========================
  // CLICHE DETECTION
  // ========================
  CLICHES: [
    'at the end of the day','few and far between','in the nick of time',
    'it was a dark and stormy night','all that glitters is not gold',
    'better late than never','beat around the bush','bite the bullet',
    'break the ice','burning the midnight oil','caught red-handed',
    'cold as ice','cool as a cucumber','cry over spilt milk',
    'dead as a doornail','diamond in the rough','easy as pie',
    'fit as a fiddle','go the extra mile','heart of gold',
    'hit the nail on the head','icing on the cake','in a nutshell',
    'kill two birds with one stone','last but not least','leave no stone unturned',
    'let the cat out of the bag','light at the end of the tunnel',
    'once in a blue moon','piece of cake','read between the lines',
    'right as rain','sharp as a tack','sick as a dog',
    'take it with a grain of salt','the apple of my eye','the calm before the storm',
    'the grass is always greener','the tip of the iceberg','think outside the box',
    'time heals all wounds','under the weather','when pigs fly',
    'a chip on your shoulder','add insult to injury','back to the drawing board',
    'barking up the wrong tree','blood is thicker than water',
    'butterflies in my stomach','caught between a rock and a hard place',
    'every cloud has a silver lining','head over heels','hit the ground running',
    'it takes two to tango','jump on the bandwagon','keep your chin up',
    'let sleeping dogs lie','method to the madness','needle in a haystack',
    'on thin ice','pull yourself together','raining cats and dogs',
    'see eye to eye','steal someone\'s thunder','take the bull by the horns',
    'the best of both worlds','the elephant in the room','the whole nine yards',
    'tip of the iceberg','turn a blind eye','two peas in a pod',
    'up in the air','water under the bridge','wear your heart on your sleeve',
    'crystal clear','like a punch to the gut','hit her like','hit him like'
  ],

  findCliches(text) {
    const issues = [];
    const lower = text.toLowerCase();
    for (const cliche of this.CLICHES) {
      let idx = lower.indexOf(cliche);
      while (idx !== -1) {
        issues.push({
          type: 'cliche', text: text.substring(idx, idx + cliche.length),
          index: idx, length: cliche.length, severity: 'medium', confidence: 0.95,
          message: `Cliche: "${cliche}" — overused expression that weakens your voice.`,
          suggestion: 'Replace with original phrasing that fits your voice.'
        });
        idx = lower.indexOf(cliche, idx + 1);
      }
    }
    return issues;
  },

  // ========================
  // WEAK VERB DETECTION
  // ========================
  // A generic verb is only a fault when the author leans on it. Each entry names the
  // alternatives we can offer and the wider family of specific verbs an author may already
  // be using. The detector measures THIS manuscript's reliance on the generic verb against
  // that family and says nothing when the author already varies. Where it does speak it
  // quotes the count, so the author can disagree with the reading. Whether the passage is
  // one where vividness is even a virtue is decided afterwards by prose-norms.js.
  WEAK_VERBS: {
    walked:  { doing:'walking',  alts:'strode, ambled, trudged, sauntered',       family:['strode','ambled','trudged','sauntered','paced','marched','strolled','wandered','shuffled','stalked','crept','limped','hiked','trekked','stepped','tramped','plodded'] },
    looked:  { doing:'looking',  alts:'glanced, peered, gazed, scrutinized',      family:['glanced','peered','gazed','scrutinized','scrutinised','stared','watched','studied','eyed','glared','squinted','surveyed','regarded','scanned','searched','inspected','examined'] },
    went:    { doing:'going',    alts:'hurried, wandered, dashed, strolled',      family:['hurried','wandered','dashed','strolled','headed','travelled','traveled','drove','rode','flew','crossed','climbed','descended','departed','marched','trudged','made for'] },
    got:     { doing:'getting',  alts:'obtained, acquired, seized, snatched',     family:['obtained','acquired','seized','snatched','grabbed','fetched','received','earned','bought','caught','gathered','collected','secured','won'] },
    put:     { doing:'placing',  alts:'placed, positioned, deposited, set',       family:['placed','positioned','deposited','laid','dropped','tucked','slid','shoved','stuffed','rested','propped','hung','planted','set down','slipped'] },
    made:    { doing:'making',   alts:'crafted, fashioned, constructed, forged',  family:['crafted','fashioned','constructed','forged','built','shaped','assembled','formed','created','produced','carved','stitched','brewed','baked','cooked','drew','moulded','molded'] },
    came:    { doing:'arriving', alts:'arrived, emerged, appeared, materialized', family:['arrived','emerged','appeared','materialized','materialised','approached','entered','returned','reached','surfaced','drifted','burst','crept','slipped','stumbled in','walked in'] },
    thought: { doing:'thinking', alts:'pondered, mused, considered, reflected',   family:['pondered','mused','considered','reflected','wondered','realized','realised','suspected','decided','reasoned','weighed','imagined','recalled','remembered','brooded','deliberated'] },
    saw:     { doing:'seeing',   alts:'noticed, observed, spotted, witnessed',    family:['noticed','observed','spotted','witnessed','glimpsed','watched','recognized','recognised','spied','discerned','sighted','caught sight','made out'] },
    ran:     { doing:'running',  alts:'sprinted, dashed, bolted, jogged',         family:['sprinted','dashed','bolted','jogged','raced','fled','hurried','rushed','charged','tore','scrambled','darted','loped','galloped','pelted'] },
    moved:   { doing:'moving',   alts:'shifted, glided, crept, lunged',           family:['shifted','glided','crept','lunged','slid','edged','drifted','swayed','stepped','shuffled','eased','swung','leaned','rolled','inched'] },
    turned:  { doing:'turning',  alts:'pivoted, swiveled, whirled, rotated',      family:['pivoted','swiveled','swivelled','whirled','rotated','spun','wheeled','twisted','swung','faced','veered','rounded','swerved'] },
    seemed:  { doing:'seeming',  alts:'appeared, suggested, indicated, implied',  family:['appeared','suggested','indicated','implied','looked','sounded','struck'] },
    started: { doing:'starting', alts:'began, commenced, initiated, launched',    family:['began','commenced','initiated','launched','opened','set out','set off','took up','embarked','kicked off'] },
    stood:   { doing:'standing', alts:'towered, loomed, perched, positioned',     family:['towered','loomed','perched','positioned','rose','waited','lingered','leaned','hovered','straightened','remained','planted','braced','froze'] },
    sat:     { doing:'sitting',  alts:'perched, settled, reclined, lounged',      family:['perched','settled','reclined','lounged','slumped','sank','crouched','squatted','knelt','sprawled','rested','dropped','hunched'] },
    held:    { doing:'holding',  alts:'clutched, gripped, grasped, cradled',      family:['clutched','gripped','grasped','cradled','clasped','squeezed','hugged','carried','pinned','hoisted','balanced','steadied','clung'] }
  },
  // Constructions in which the generic verb is not doing the sentence's main work, or sits
  // in an idiom no "vivid" verb can replace ("made sense", "looked after", "turned out").
  WEAK_VERB_PARTICLES: /^(up|out|off|over|down|into|through|away|back|around|round|along|forward|aside|after|like|as if|as though)\b/i,
  WEAK_VERB_IDIOMS: {
    made:['sense','sure','it','of','do','use','room','time','money','peace','clear','good','well','certain','fun','love','light','way','a point','a decision','a difference','a living','a mistake','a fool','an effort','an appearance','an exception','the most','the best','the case','the cut','matters','amends','ends meet','his way','her way','their way','my way','our way','its way','me','him','her','them','us','you','himself','herself','themselves','myself','yourself','ourselves','itself'],
    got:['rid','used','married','lost','ready','tired','sick','hurt','caught','stuck','dressed','home','here','there','hold','wind','word','on with','the better','the message','the point','the idea','the hang','the feeling','the impression','the sense','in the way','under way','underway','going'],
    came:['across','about','true','apart','upon','first','second','last','close','of','undone','alive','loose','clean','to terms','to light','to life','to rest','to pass','to a head','to an end','to mind','to the conclusion','to nothing','to blows','to power','to grief','to the point','with'],
    went:['on','ahead','wrong','well','badly','mad','quiet','silent','still','cold','white','pale','red','dark','blank','numb','without','by','about','for','to sleep','to bed','to war','to work','to school','to church','to court','to great lengths','out of','missing','unanswered','unnoticed','unheard','unsaid','so far','too far','further','on to'],
    looked:['forward','the part','the other way','it','tired','pale','older','younger','different','fine','good','bad','well','lost','alike','sad','happy','worried','confused','surprised','exhausted','beautiful','terrible','awful','ridiculous','small','tiny','huge','thin','sick','ill','dead','alive','young','old','new','strange','odd','familiar','unhappy','angry','afraid','scared','nervous','calm','relieved','pleased','embarrassed','ashamed','proud','grim','serious','stern','kind','gentle','cold','warm','as'],
    put:['together','an end','a stop','it','him','her','them','me','us','you','pressure','weight','faith','trust','effort','money','words','simply','bluntly','plainly','differently','another way','to bed','to sleep','to death','to use','to work','to rest','to shame','to the test','up with','paid','right','straight','on'],
    turned:['against','to','toward','towards','red','pale','white','cold','sour','bad','a corner','a profit','a blind eye','the corner','the page','the tables','the tide','the key','the lock','the handle','the wheel','the volume','heads','tail','turtle','left','right','on','in','it','him','her','them','me','us','you','sixty','seventy','forty','fifty','thirty','twenty','eighteen','twenty-one','a year','two','three','four','five','six','seven','eight','nine','ten'],
    started:['again','from','with','on','in','as','at','by','the car','the engine','the fire','a fire','a fight','a family','a business','a company','a conversation','a war','something','it','trouble','work','school','college','university','life','over'],
    seemed:['to','like','that','so','as'],
    stood:['still','firm','fast','ground','his ground','her ground','their ground','my ground','trial','a chance','in for','on end','on ceremony','corrected','accused','a round','the test','to reason','watch','guard','by','for','alone','together','apart','tall','there','here','at','in','on','before','behind','beside','between','near','next','over','under','with','and','to','a','an','the'],
    sat:['still','tight','through','by','with','at','beside','next','across','opposite','on','in','for','the exam','the test','well','badly','right','wrong','quietly','silently','alone','together','there','here','and','a','an','the','up','down','back','out'],
    held:['together','still','fast','firm','tight','good','true','sway','court','office','hands','breath','his breath','her breath','their breath','my breath','our breath','the line','the door','the floor','the fort','a grudge','a meeting','a candle','an election','a position','a record','the record','the view','the belief','the opinion','that','it','him','her','them','me','us','you','forth','a moment','the key','on to','onto','back','in','up','out','off','over','down','at bay','to','with','for','sway','water'],
    thought:['better','twice','aloud','out loud','hard','long','little','much','nothing','for a moment','through','ahead','otherwise','differently','police','crime','leader','experiment','process','bubble','it','he','she','they','we','you','i','the','this','there','that','of','about','so','not','to','with','and','myself','himself','herself','themselves','ourselves','yourself','maybe','perhaps','how','what','why','where','when','who','which','if','as'],
    saw:['to','through','off','fit','red','the light','the point','the world','the doctor','a doctor','the dentist','the last of','the back of','eye to eye','the end of','action','service','sense','reason','the funny side','the error','the writing'],
    ran:['late','low','high','dry','short','wild','deep','smooth','rough','free','riot','aground','amok','the risk','the show','the shop','the business','the company','the numbers','the country','the household','the meeting','the race','a hand','a finger','a bath','a fever','a temperature','a business','a shop','an errand','errands','a tab','a check','a test','tests','in the family','its course','his course','her course','their course','a mile','miles','the length','in circles','a red light','a story','an ad','an article','a headline','a program','a programme','a scan','a report','a piece','for','with','on','to','from','at','in','past','by','across','between','and','a','an','the','it','him','her','them','me','us','you'],
    moved:['on','in','past','toward','towards','to tears','to action','to speak','to say','to write','to ask','to help','to laughter','house','home','abroad','ahead','closer','nearer','that','the motion','the goalposts','the needle','the meeting','the date','the deadline','the time','heaven and earth','mountains','the crowd','the audience','the jury','the reader','me','him','her','them','us','you','deeply','profoundly','greatly','with','by','at','and','to','a','an','the','it','his','her','their','my','our','its','from']
  },

  findWeakVerbs(text, genre) {
    const issues = [];
    const SHOWN_PER_VERB = 8;    // highlights per verb: a display cap, stated in the finding
    const MIN_USES = 3;          // fewer than this is not a habit
    const RELIANCE = 0.6;        // share of the family the generic verb must carry to be raised
    const totalWords = Math.max(1, (text.match(/\b\w+\b/g) || []).length);
    const lower = text.toLowerCase();
    const countAll = word => {
      const m = lower.match(new RegExp('\\b' + word.replace(/\s+/g, '\\s+') + '\\b', 'g'));
      return m ? m.length : 0;
    };

    for (const [verb, entry] of Object.entries(this.WEAK_VERBS)) {
      const regex = new RegExp(`\\b${verb}\\b`, 'gi');
      const clean = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (this._weakVerbIsIdiomatic(text, verb, match.index)) continue;
        clean.push(match);
      }
      const uses = clean.length;
      if (uses < MIN_USES) continue;
      const family = entry.family.reduce((sum, w) => sum + countAll(w), 0);
      const reliance = uses / (uses + family);
      if (reliance < RELIANCE) continue;  // the author already varies; nothing to say
      const perK = Math.round(uses / totalWords * 1000 * 10) / 10;
      const message = `"${verb}" carries ${uses} of the ${uses + family} ${entry.doing} verbs in this manuscript (${perK} per 1,000 words). A more specific verb would show the action.`;
      const shown = Math.min(uses, SHOWN_PER_VERB);
      const suggestion = `Alternatives to weigh: ${entry.alts}.` + (uses > shown ? ` Showing ${shown} of ${uses} uses.` : '');
      // Spread the shown instances across the manuscript rather than taking the first few,
      // so a habit in chapter twenty is as visible as one in chapter one.
      for (let k = 0; k < shown; k++) {
        const m = clean[Math.floor(k * uses / shown)];
        issues.push({
          type: 'weak-verb', text: m[0], index: m.index, length: m[0].length,
          severity: 'low', confidence: 0.9, message, suggestion,
          detail: { verb, uses, family, reliance: Math.round(reliance * 100) / 100, perK }
        });
      }
    }
    return issues;
  },

  // True where the verb is not carrying the sentence, or sits in an idiom. Rules first
  // (participle, passive, aspectual "started to", a clause after "thought"), then the
  // per-verb idiom list.
  _weakVerbIsIdiomatic(text, verb, index) {
    const before = text.slice(Math.max(0, index - 14), index);
    if (/[,;:—–-]\s*$/.test(before)) return true;                    // ", made quietly"
    if (/\b(am|is|are|was|were|be|been|being|get|gets|got|getting|having|to)\s+$/i.test(before)) return true;
    if (verb === 'got' && /\b(have|has|had|'ve|'s|'d|’ve|’s|’d)\s+$/i.test(before)) return true;
    const afterTrim = text.slice(index + verb.length, index + verb.length + 40).replace(/^\s+/, '');
    if (!afterTrim) return false;
    if (this.WEAK_VERB_PARTICLES.test(afterTrim)) return true;
    if (/^to\s+[a-z]+/i.test(afterTrim) && ['started', 'seemed', 'came', 'got', 'went'].includes(verb)) return true;
    if (verb === 'started' && /^[a-z]+ing\b/i.test(afterTrim)) return true;
    const lowerAfter = afterTrim.toLowerCase();
    return (this.WEAK_VERB_IDIOMS[verb] || []).some(p =>
      lowerAfter.startsWith(p) && !/[a-z]/.test(lowerAfter.charAt(p.length)));
  },

  // ========================
  // WORDY PHRASE DETECTION
  // ========================
  WORDY_PHRASES: {
    'in order to':'to','due to the fact that':'because','in the event that':'if',
    'at this point in time':'now','for the purpose of':'to',
    'in spite of the fact that':'although','on account of':'because',
    'in the process of':'while','has the ability to':'can','is able to':'can',
    'it is important to note that':'(omit)','the fact that':'(omit or rephrase)',
    'a large number of':'many','a majority of':'most','at the present time':'now',
    'by means of':'by','each and every':'each','first and foremost':'first',
    'give consideration to':'consider','in close proximity to':'near',
    'in the near future':'soon','make a decision':'decide','on a daily basis':'daily',
    'prior to':'before','subsequent to':'after','take into consideration':'consider',
    'with regard to':'about','with the exception of':'except'
  },

  findWordyPhrases(text) {
    const issues = [];
    const lower = text.toLowerCase();
    for (const [phrase, replacement] of Object.entries(this.WORDY_PHRASES)) {
      let idx = lower.indexOf(phrase);
      while (idx !== -1) {
        issues.push({
          type: 'wordy', text: text.substring(idx, idx + phrase.length),
          index: idx, length: phrase.length, severity: 'medium', confidence: 0.95,
          message: `Wordy phrase: "${phrase}"`,
          suggestion: `Replace with: "${replacement}"`
        });
        idx = lower.indexOf(phrase, idx + 1);
      }
    }
    return issues;
  },

  // Irregular past participle → simple past for active voice conversion
  PARTICIPLE_TO_PAST: {
    built:'built',caught:'caught',chosen:'chose',cut:'cut',done:'did',drawn:'drew',
    driven:'drove',eaten:'ate',fallen:'fell',felt:'felt',found:'found',forgotten:'forgot',
    fought:'fought',given:'gave',gone:'went',grown:'grew',heard:'heard',held:'held',
    hidden:'hid',hit:'hit',hung:'hung',hurt:'hurt',kept:'kept',known:'knew',laid:'laid',
    led:'led',left:'left',lent:'lent',let:'let',lost:'lost',made:'made',meant:'meant',
    met:'met',paid:'paid',put:'put',read:'read',rid:'rid',run:'ran',said:'said',sat:'sat',
    seen:'saw',sent:'sent',set:'set',shot:'shot',shown:'showed',shut:'shut',sold:'sold',
    spent:'spent',spoken:'spoke',stood:'stood',stuck:'stuck',struck:'struck',sung:'sang',
    sworn:'swore',taken:'took',taught:'taught',thought:'thought',thrown:'threw',told:'told',
    torn:'tore',understood:'understood',woken:'woke',won:'won',worn:'wore',written:'wrote'
  },

  // ========================
  // PASSIVE VOICE
  // ========================
  findPassiveVoice(text, genre) {
    const issues = [];
    // Nonfiction softening. This multiplies SEVERITY WEIGHT, never confidence: confidence is
    // a claim about whether the detection is real, and the validation layer discards anything
    // under 0.6. Multiplying confidence by 0.3-0.5 therefore deleted every one of these
    // findings for nonfiction instead of softening them. Register-appropriate instances are
    // now handled contextually by prose-norms.js, with a reason the author can read.
    const nfSoften = this.isNonfiction(genre);
    const nfWeight = 1;
    for (const pattern of this.PASSIVE_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        // Skip passive-looking adjectives ("was interested", "was tired")
        const lastWord = match[0].split(/\s+/).pop().toLowerCase();
        if (this.PASSIVE_EXCEPTIONS.has(lastWord)) continue;

        // Try to extract “by [agent]” for a concrete active-voice fix
        const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 80);
        const byAgent = afterMatch.match(/^\s+by\s+([A-Z][\w]*(?:\s+[A-Z][\w]*)*|(?:the|a|an|his|her|their|my|our|its)\s+[\w]+(?:\s+[\w]+)?)/);
        let suggestion, issueText = match[0], issueLen = match[0].length;
        if (byAgent) {
          const agent = byAgent[1].trim();
          const participle = lastWord;
          const simplePast = this.PARTICIPLE_TO_PAST[participle] || participle;
          const fixText = agent + ' ' + simplePast;
          issueText = match[0] + byAgent[0];
          issueLen = issueText.length;
          suggestion = 'Replace with: “' + fixText + '”';
        } else {
          const verb = lastWord;
          const activePast = this.PARTICIPLE_TO_PAST[verb] || verb;
          // Look backward for a subject (pronoun or name) in the same sentence
          const sentBack = text.lastIndexOf('.', match.index - 1);
          const beforePassive = text.substring(sentBack === -1 ? 0 : sentBack + 1, match.index).trim();
          const pronounHit = beforePassive.match(/\b(I|you|he|she|they|we|it|anyone|someone|everyone|nobody)\b/gi);
          const nameHit = beforePassive.match(/\b([A-Z][a-z]{2,})\b/g);
          const subject = pronounHit ? pronounHit[pronounHit.length - 1] : nameHit ? nameHit[nameHit.length - 1] : null;
          const doer = subject || 'someone';
          // Build a plain-English suggestion with a concrete example
          if (activePast !== verb) {
            suggestion = `”${match[0].trim()}” hides who's acting. Ask: who did this? Then rewrite starting with them. Try: “${doer} ${activePast}...”`;
          } else {
            suggestion = `”${match[0].trim()}” is passive — we don't see who's responsible. Ask: who is doing this to whom? Start your sentence with that person instead.`;
          }
        }

        issues.push({
          type: 'passive', text: issueText, index: match.index, length: issueLen,
          severity: nfSoften ? 'low' : 'medium', confidence: 0.85 * nfWeight,
          message: `Passive voice: “${match[0]}”`,
          suggestion
        });
      }
    }
    return issues;
  },

  // ========================
  // WORD REPETITION
  // ========================
  findRepetitions(text) {
    const issues = [];
    const lower = text.toLowerCase();
    const sentenceRegex = /[^.!?]*[.!?]+/g;
    const sentBounds = [];
    let sm;
    while ((sm = sentenceRegex.exec(text)) !== null) {
      sentBounds.push({ start: sm.index, end: sm.index + sm[0].length, raw: sm[0] });
    }
    // Handle trailing text without punctuation
    if (sentBounds.length === 0) return issues;

    const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with',
      'by','from','is','it','its','was','were','are','be','been','being','have','has','had',
      'do','does','did','will','would','could','should','may','might','shall','can','that',
      'this','these','those','i','you','he','she','we','they','me','him','her','us','them',
      'my','your','his','our','their','not','no','so','as','if','then','than','into','up',
      'out','about','just','very','all','also','how','what','when','where','which','who',
      // Function words of four letters or more, and the invisible dialogue tags. Their
      // recurrence is grammar, not a word-choice habit.
      'there','here','like','some','never','always','ever','mine','yours','ours','theirs',
      'herself','himself','itself','myself','yourself','themselves','ourselves','only','even',
      'much','many','more','most','such','other','others','over','under','onto','upon','from',
      'been','being','again','still','while','until','after','before','because','though',
      'although','whether','either','neither','both','each','every','quite','rather','really',
      'would','could','should','might','must','shall','will','have','does','done','said','asked',
      'something','nothing','anything','everything','someone','anyone','everyone','nobody']);
    // No synonym table. A fixed list of alternatives ("said" → "stated, remarked") is not
    // advice about this manuscript; the finding says where the echo is and leaves the word
    // to the author.
    const seen = new Set();
    // Names repeat because they are names. A capitalised word whose lowercase form never
    // occurs anywhere in this manuscript is treated as one and never raised; "Alice" is a
    // name, "The" and "Poverty" at a sentence start are not.
    const lowercaseForms = new Set(text.match(/\b[a-z]{4,}\b/g) || []);

    for (let i = 0; i < sentBounds.length - 1; i++) {
      const s1 = sentBounds[i], s2 = sentBounds[i + 1];
      const words1 = s1.raw.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const words2 = s2.raw.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const set1 = new Set(words1.filter(w => !stopWords.has(w)));
      const names = new Set();
      for (const raw of [s1.raw, s2.raw]) {
        (raw.match(/\b[A-Z][a-z]{3,}\b/g) || []).forEach(tok => {
          const w = tok.toLowerCase();
          if (!lowercaseForms.has(w)) names.add(w);
        });
      }
      // Parallel structure ("Poverty does not disappear through sympathy. It disappears
      // through decisions.") repeats on purpose: two short sentences of similar length that
      // share two or more content stems in the same order. The finding stays on the record,
      // marked rhetorical, and prose-norms sets it aside with that reason.
      const stem = w => w.replace(/(ies|es|s|ed|ing)$/, '');
      const content = raw => (raw.toLowerCase().match(/\b[a-z]{4,}\b/g) || []).filter(w => !stopWords.has(w)).map(stem);
      const all1 = (s1.raw.match(/\b[\w'’]+\b/g) || []).length, all2 = (s2.raw.match(/\b[\w'’]+\b/g) || []).length;
      let parallel = false;
      if (all1 <= 16 && all2 <= 16 && all1 > 0 && all2 > 0 && Math.max(all1, all2) / Math.min(all1, all2) <= 2) {
        const c1 = content(s1.raw), c2 = content(s2.raw);
        const sharedInOrder = [];
        let from = 0;
        for (const w of c2) { const at = c1.indexOf(w, from); if (at !== -1) { sharedInOrder.push(w); from = at + 1; } }
        parallel = sharedInOrder.length >= 2;
      }
      for (const word of words2) {
        if (set1.has(word) && !stopWords.has(word) && !names.has(word)) {
          // Find the word position within the second sentence's known bounds
          const wordIdx = lower.indexOf(word, s2.start);
          if (wordIdx === -1 || wordIdx >= s2.end) continue;
          const key = word + ':' + wordIdx;
          if (seen.has(key)) continue;
          seen.add(key);
          issues.push({
            type: 'repetition', text: word, index: wordIdx, length: word.length,
            severity: 'low', confidence: 0.85, message: `"${word}" repeated in consecutive sentences.`,
            suggestion: `"${word}" also appears in the sentence before. Vary it if the echo is accidental; keep it if it is doing work.`,
            autoFix: false,
            ...(parallel ? { rhetorical: 'parallel' } : {})
          });
        }
      }
    }
    return issues;
  },

  // ========================
  // LONG SENTENCE DETECTION
  // ========================
  findLongSentences(text) {
    const issues = [];
    const sentenceRegex = /[^.!?]*[.!?]+/g;
    let match;
    while ((match = sentenceRegex.exec(text)) !== null) {
      const sentence = match[0].trim();
      const wordCount = sentence.split(/\s+/).length;
      if (wordCount > 35) {
        // Find the best natural break point (conjunction, clause boundary)
        let breakHint = '';
        const conjMatch = sentence.match(/^(.{40,}?)\s+(,\s+)?(but|and|however|because|although|while|when|which|who|though|since|yet|so|or|where|that)\s+(.+)$/i);
        if (conjMatch) {
          breakHint = `Break after "${conjMatch[3]}": "${conjMatch[1].trim()}." then "${conjMatch[3].charAt(0).toUpperCase() + conjMatch[3].slice(1)} ${conjMatch[4].substring(0, 40).trim()}..."`;
        } else {
          const commaMatch = sentence.match(/^(.{40,}?),\s+(.+)$/);
          if (commaMatch) breakHint = `Break at the comma: "${commaMatch[1].trim()}." then "${commaMatch[2].substring(0, 50).trim()}..."`;
        }
        issues.push({
          type: 'sentence-length',
          text: sentence,
          index: match.index, length: sentence.length, confidence: 0.95,
          severity: wordCount > 50 ? 'high' : 'medium',
          message: `Long sentence (${wordCount} words). Consider breaking it up.`,
          suggestion: breakHint || `Split this ${wordCount}-word sentence at a conjunction or clause boundary.`
        });
      }
    }
    return issues;
  },

  // ========================
  // SHOW VS TELL DETECTION
  // ========================
  findShowVsTell(text, genre) {
    if (this.isNonfiction(genre)) return []; // show/tell is a fiction concept; skip for nonfiction
    const issues = [];
    // Emotion-specific show suggestions: physical sensation, action, or behavior
    const showMap = {
      angry: 'jaw tightened, hands clenched, voice sharpened',
      furious: 'knuckles whitened, breath hissed through teeth, vision narrowed',
      sad: 'tears pricked, throat tightened, shoulders slumped',
      miserable: 'chest hollowed, eyes fixed on the floor, voice flat',
      happy: 'smile pulled at her mouth, steps lightened, laughter spilled out',
      delighted: 'grin spread wide, laughter bubbled up, she bounced on her heels',
      scared: 'pulse raced, skin prickled, breath caught',
      afraid: 'knees weakened, mouth went dry, pulse hammered in the ears',
      terrified: 'blood drained, every muscle locked, she could not swallow',
      nervous: 'fingers drummed, foot tapped, breath came shallow',
      anxious: 'stomach knotted, eyes darted to the door, nails bit into palms',
      excited: 'pulse quickened, grin broke free, words tumbled out',
      lonely: 'silence pressed in, the empty chair drew the eye',
      jealous: 'chest tightened when she saw them, jaw locked',
      proud: 'chin lifted, shoulders squared, chest filled',
      guilty: 'gaze dropped, throat worked, words caught',
      ashamed: 'cheeks burned, eyes would not meet his, shoulders curled inward',
      confused: 'brow furrowed, gaze lost focus, words trailed',
      frustrated: 'fist struck the table, breath huffed out, jaw ground',
      disappointed: 'shoulders fell, smile faded, eyes turned away',
      relieved: 'shoulders dropped, breath released, eyes closed',
      grateful: 'hand found his, eyes softened, voice thickened',
      hopeful: 'leaned forward, chin lifted, breath caught',
      desperate: 'fingers clawed at the door, voice cracked, eyes wild',
      tired: 'rubbed his eyes, shoulders sagged, each step dragged',
      exhausted: 'collapsed into the chair, eyelids drooped, voice a croak',
      bored: 'eyes wandered the room, fingers tapped, mouth flattened',
      annoyed: 'jaw tightened, breath hissed out, eyes narrowed',
      beautiful: 'heads turned when she entered, conversation faltered',
      ugly: 'children looked twice, then looked away',
      gorgeous: 'the room seemed to quiet around her',
      handsome: 'women glanced, then glanced again'
    };
    const tellingPatterns = [
      {
        regex: /\b(felt|feeling)\s+(angry|happy|sad|scared|afraid|nervous|anxious|excited|lonely|jealous|proud|guilty|ashamed|confused|frustrated|disappointed|relieved|grateful|hopeful|desperate|miserable|furious|terrified|delighted)\b/gi,
        msg: 'Telling emotion',
        sugFn: m => showMap[m[2].toLowerCase()] ? `Show it instead of naming it. Try a physical tell: "${showMap[m[2].toLowerCase()]}"` : 'Show through physical sensation or action.'
      },
      {
        regex: /\b(was|were|seemed|looked)\s+(beautiful|ugly|tired|angry|happy|sad|scared|afraid|nervous|excited|bored|confused|annoyed|furious|delighted|miserable|exhausted|terrified|gorgeous|handsome|attractive|hideous)\b/gi,
        msg: 'Telling state',
        sugFn: m => showMap[m[2].toLowerCase()] ? `Show the state instead of declaring it. Try: "${showMap[m[2].toLowerCase()]}"` : 'Show through action or reaction from others.'
      },
      {
        regex: /\b(obviously|clearly|evidently|apparently)\b/gi,
        msg: 'Telling the reader what is obvious',
        sugFn: () => 'Cut the word. If it\'s obvious to the reader, you don\'t need to say so. If it\'s not obvious, show the evidence.'
      },
      {
        regex: /\b(she|he|they)\s+(knew|realized|understood)\b/gi,
        msg: 'Telling internal realization',
        sugFn: m => `Don't announce the realization — show what triggers it. Instead of "${m[0]}", show the detail or dialogue that makes the reader realize it too.`
      },
      {
        regex: /\bcould\s+(feel|sense|tell|see|hear|smell|taste)\b/gi,
        msg: 'Filter word distances the reader',
        sugFn: m => `Remove "could ${m[1]}". Instead of "she could feel the cold," write "the cold bit through her coat." Drop the filter, go direct to sensation.`
      }
    ];
    for (const { regex, msg, sugFn } of tellingPatterns) {
      let match;
      const r = new RegExp(regex.source, regex.flags);
      while ((match = r.exec(text)) !== null) {
        issues.push({
          type: 'show-tell', text: match[0], index: match.index, length: match[0].length,
          severity: 'medium', confidence: 0.85, message: `${msg}: "${match[0]}"`,
          suggestion: sugFn(match)
        });
      }
    }
    return issues;
  },

  // ========================
  // COMMONLY CONFUSED WORDS
  // ========================
  findConfusedWords(text) {
    const issues = [];
    const patterns = [
      { regex: /\b(could|would|should|must|might)\s+of\b/gi,
        fix: (m) => m[1] + ' have',
        msg: '"$0" should be "$1 have." "Of" is not a verb.' },
      { regex: /\balot\b/g,
        fix: () => 'a lot',
        msg: '"Alot" is not a word. Use "a lot" (two words).' },
      { regex: /\bsneak\s+peak\b/gi,
        fix: () => 'sneak peek',
        msg: '"Peak" is a mountain top. "Peek" is a quick look.' },
      { regex: /\bpeaked\s+(my|his|her|their|our|your|its)\s+(interest|curiosity)\b/gi,
        fix: (m) => 'piqued ' + m[1] + ' ' + m[2],
        msg: '"Peaked" means reached a summit. "Piqued" means stimulated.' },
      { regex: /\bpeeked\s+(my|his|her|their|our|your|its)\s+(interest|curiosity)\b/gi,
        fix: (m) => 'piqued ' + m[1] + ' ' + m[2],
        msg: '"Peeked" means looked furtively. "Piqued" means stimulated.' },
      { regex: /\bbare\s+with\s+me\b/gi,
        fix: () => 'bear with me',
        msg: '"Bare" means naked or to expose. "Bear with me" means be patient.' },
      { regex: /\bfree\s+reign\b/gi,
        fix: () => 'free rein',
        msg: '"Reign" is a monarch\'s rule. "Rein" is a strap — giving slack, not authority.' },
      { regex: /\breign(ed|s|ing)\s+(in|back)\b/gi,
        fix: (m) => 'rein' + (m[1]||'') + ' ' + m[2],
        msg: '"Reign" is a monarch\'s rule. "Rein in/back" means to restrain, from horsemanship.' },
      { regex: /\bbaited\s+breath\b/gi,
        fix: () => 'bated breath',
        msg: '"Baited" means set a trap. "Bated" means held back (abated).' },
      { regex: /\btake\s+a\s+breathe\b/gi,
        fix: () => 'take a breath',
        msg: '"Breathe" is the verb. "Breath" is the noun.' },
      { regex: /\b(couldn't|can't|didn't|won't|cannot|could\s+not|don't)\s+breath\b/gi,
        fix: (m) => m[1] + ' breathe',
        msg: '"Breath" is the noun. "Breathe" is the verb — use it after verbs.' },
      { regex: /\bfor\s+all\s+intensive\s+purposes\b/gi,
        fix: () => 'for all intents and purposes',
        msg: 'The phrase is "intents and purposes," not "intensive purposes."' },
      { regex: /\bsupposably\b/gi,
        fix: () => 'supposedly',
        msg: '"Supposably" is not standard. Use "supposedly."' },
      { regex: /\birregardless\b/gi,
        fix: () => 'regardless',
        msg: '"Irregardless" is a double negative. Use "regardless."' },
      { regex: /\bcould\s+care\s+less\b/gi,
        fix: () => 'couldn\'t care less',
        msg: '"Could care less" means you still care. "Couldn\'t care less" means you don\'t.' },
      { regex: /\bhoning\s+in\b/gi,
        fix: () => 'homing in',
        msg: '"Hone" means to sharpen. "Home in" means to move toward a target.' },
      { regex: /\bflush\s+out\s+(the\s+)?(idea|plan|concept|detail|strategy|proposal|thought|story|plot|character|scene|chapter|outline|draft|manuscript)\b/gi,
        fix: (m) => 'flesh out ' + (m[1]||'') + m[2],
        msg: '"Flush out" means to drive from hiding. "Flesh out" means to add substance.' },
      { regex: /\btow\s+the\s+line\b/gi,
        fix: () => 'toe the line',
        msg: '"Tow" means to pull. "Toe the line" means to conform — standing with toes at a line.' },
      { regex: /\bwet\s+(my|his|her|their|our|your|its|the)\s+appetite\b/gi,
        fix: (m) => 'whet ' + m[1] + ' appetite',
        msg: '"Wet" means to dampen. "Whet" means to sharpen or stimulate.' },
      { regex: /\bper\s+say\b/gi,
        fix: () => 'per se',
        msg: '"Per se" is Latin for "by itself." "Per say" is a misspelling.' },
      { regex: /\bdeep[\s-]seeded\b/gi,
        fix: () => 'deep-seated',
        msg: '"Deep-seated" means firmly established — like a seat, not a seed.' },
      { regex: /\bbeckon\s+call\b/gi,
        fix: () => 'beck and call',
        msg: '"Beck" is a gesture of summoning. "Beck and call" — at someone\'s gesture and voice.' },
      { regex: /\bmute\s+point\b/gi,
        fix: () => 'moot point',
        msg: '"Mute" means silent. "Moot" means debatable or irrelevant.' },
      { regex: /\bwreck\s+havoc\b/gi,
        fix: () => 'wreak havoc',
        msg: '"Wreck" means to destroy. "Wreak" means to cause or inflict.' },
      { regex: /\bon\s+accident\b/gi,
        fix: () => 'by accident',
        msg: 'Standard English uses "by accident," not "on accident."' },
      { regex: /\b(the\s+)?throws?\s+of\s+(passion|grief|agony|ecstasy|death|despair|anger|rage)\b/gi,
        fix: (m) => (m[1]||'') + 'throes of ' + m[2],
        msg: '"Throws" means to hurl. "Throes" means intense struggle or suffering.' },
      { regex: /\bwrecking\s+havoc\b/gi,
        fix: () => 'wreaking havoc',
        msg: '"Wrecking" means demolishing. "Wreaking" means causing or inflicting.' },
      { regex: /\b(taught|taunt)\s+(rope|wire|string|line|chain|cable|muscle|fabric|cloth|skin|bow|sail)\b/gi,
        fix: (m) => 'taut ' + m[2],
        msg: '"Taught" is past tense of teach. "Taut" means tight or stretched.' },
      // AFFECT vs EFFECT — only high-confidence contexts to avoid false positives
      { regex: /\btake\s+affect\b/gi,
        fix: () => 'take effect',
        msg: '"Affect" is a verb. Things "take effect" (noun).' },
      { regex: /\bside\s+affects?\b/gi,
        fix: (m) => 'side effect' + (/s$/i.test(m[0]) ? 's' : ''),
        msg: '"Affect" is a verb. The noun is "effect" — side effects.' },
      { regex: /\b(a|an|the|this|that|its|no)\s+affect\s+on\b/gi,
        fix: (m) => m[1] + ' effect on',
        msg: '"Affect" is a verb. After an article, use the noun "effect."' },
      { regex: /\b(adversely|negatively|positively|directly|greatly|deeply|badly|severely)\s+effect(s|ed|ing)?\b/gi,
        fix: (m) => m[1] + ' affect' + (m[2] || ''),
        msg: '"Effect" is a noun. The verb is "affect" — to influence.' },
      // ACCEPT vs EXCEPT
      { regex: /\b(everyone|everybody|everything|anyone|anybody|anything|nothing|no\s+one|nobody)\s+accept\b/gi,
        fix: (m) => m[1] + ' except',
        msg: '"Accept" means to receive. "Except" means excluding.' },
      // PRINCIPAL vs PRINCIPLE
      { regex: /\bprinciple\s+(reason|goal|aim|objective|concern|source|cause|focus|purpose|role|character|difference|means|method|argument|component|factor|element|ingredient|city|export|investigator)\b/gi,
        fix: (m) => 'principal ' + m[1],
        msg: '"Principle" is a noun (a rule). The adjective meaning "main" is "principal."' },
      { regex: /\b(basic|general|guiding|moral|fundamental|core|first|underlying)\s+principals?\b/gi,
        fix: (m) => m[1] + ' principle' + (/s$/i.test(m[0]) ? 's' : ''),
        msg: '"Principal" is a person or means "main." A rule or belief is a "principle."' },
      { regex: /\bprincipals?\s+of\s+(physics|economics|design|law|mathematics|justice|democracy|freedom|nature|science|accounting|management|writing)\b/gi,
        fix: (m) => 'principles of ' + m[1],
        msg: '"Principal" is a person or means "main." Rules of a field are "principles."' },
      // LIE vs LAY — only unambiguous constructions
      { regex: /\blays\s+down\s+(on|in|beside|under|next)\b/gi,
        fix: (m) => 'lies down ' + m[1],
        msg: '"Lay" takes an object (lay the book down). Without one, use "lie" — lies down.' },
      { regex: /\b(was|were|is|are)\s+laying\s+(down|awake|still|there)\b/gi,
        fix: (m) => m[1] + ' lying ' + m[2],
        msg: '"Laying" takes an object. Without one, use "lying."' },
      // COMPLEMENT vs COMPLIMENT
      { regex: /\bcomplimentary\s+(colors?|colours?|angles?|flavors?|flavours?)\b/gi,
        fix: (m) => 'complementary ' + m[1],
        msg: '"Complimentary" means free or praising. Things that complete each other are "complementary."' },
      { regex: /\bcomplements?\s+on\s+(your|his|her|their|my|our|the)\b/gi,
        fix: (m) => 'compliment' + (m[0].toLowerCase().startsWith('complements') ? 's' : '') + ' on ' + m[1],
        msg: '"Complement" means to complete. Praise is a "compliment."' },
      // STATIONARY vs STATIONERY
      { regex: /\b(writing|personalized|personalised|office|wedding|embossed)\s+stationary\b/gi,
        fix: (m) => m[1] + ' stationery',
        msg: '"Stationary" means not moving. Paper goods are "stationery" (with an e).' },
      { regex: /\b(remained?|remains|stood|stayed|stays|held|kept)\s+stationery\b/gi,
        fix: (m) => m[1] + ' stationary',
        msg: '"Stationery" is paper goods. Not moving is "stationary" (with an a).' },
      // LOOSE vs LOSE
      { regex: /\bloosing\b/gi,
        fix: () => 'losing',
        msg: '"Loosing" means releasing (archaic). You almost certainly mean "losing."' },
      { regex: /\bloose\s+(the|my|his|her|their|our|your)\s+(game|match|battle|war|fight|bet|job|mind|way|nerve|balance|grip|temper|faith|hope|weight|money|track|sight|interest|patience|control|argument|election|house|keys)\b/gi,
        fix: (m) => 'lose ' + m[1] + ' ' + m[2],
        msg: '"Loose" means not tight. To misplace or be defeated is "lose."' },
    ];

    for (const p of patterns) {
      let match;
      const r = new RegExp(p.regex.source, p.regex.flags);
      while ((match = r.exec(text)) !== null) {
        const fixText = p.fix(match);
        const msg = p.msg.replace('$0', match[0]).replace('$1', match[1] || '');
        issues.push({
          type: 'confused-word', text: match[0], index: match.index, length: match[0].length,
          severity: 'high', confidence: 0.95, message: msg,
          suggestion: 'Replace with: "' + fixText + '"'
        });
      }
    }
    return issues;
  },

  // ========================
  // READABILITY (Flesch-Kincaid)
  // ========================
  countSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const vowelGroups = word.match(/[aeiouy]{1,2}/g);
    return vowelGroups ? vowelGroups.length : 1;
  },

  fleschKincaid(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.match(/\b[a-z']+\b/gi) || [];
    if (sentences.length === 0 || words.length === 0) return { grade: 0, ease: 0 };
    let totalSyllables = 0;
    for (const w of words) totalSyllables += this.countSyllables(w);
    const avgSentLen = words.length / sentences.length;
    const avgSyllables = totalSyllables / words.length;
    const ease = 206.835 - (1.015 * avgSentLen) - (84.6 * avgSyllables);
    const grade = (0.39 * avgSentLen) + (11.8 * avgSyllables) - 15.59;
    return { grade: Math.max(0, Math.round(grade * 10) / 10), ease: Math.round(ease * 10) / 10 };
  },

  // ========================
  // SENTENCE VARIETY
  // ========================
  analyzeSentenceVariety(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return { score: 0, details: {} };
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    const starters = sentences.map(s => s.trim().split(/\s+/)[0]?.toLowerCase());
    const starterCounts = {};
    starters.forEach(s => { if (s) starterCounts[s] = (starterCounts[s] || 0) + 1; });
    const starterValues = Object.values(starterCounts);
    const maxStarterRepeat = starterValues.length > 0 ? Math.max(...starterValues) : 0;
    const starterVariety = Object.keys(starterCounts).length / starters.length;
    const declarative = (text.match(/[^.!?]*\./g) || []).length;
    const interrogative = (text.match(/[^.!?]*\?/g) || []).length;
    const exclamatory = (text.match(/[^.!?]*!/g) || []).length;
    let score = 15;
    if (stdDev > 3) score += 10;
    if (stdDev > 5) score += 15;
    if (stdDev > 8) score += 10;
    if (starterVariety > 0.7) score += 20;
    else if (starterVariety > 0.5) score += 12;
    else if (starterVariety > 0.3) score += 5;
    if (maxStarterRepeat > sentences.length * 0.3) score -= 15;
    else if (maxStarterRepeat <= sentences.length * 0.1) score += 5;
    if (interrogative > 0 && exclamatory > 0 && declarative > 0) score += 10;
    else if (interrogative > 0 || exclamatory > 0) score += 5;
    if (avg >= 12 && avg <= 20) score += 10;
    else if (avg > 30) score -= 10;
    return {
      score: Math.min(100, Math.max(0, score)),
      avgLength: Math.round(avg), stdDev: Math.round(stdDev * 10) / 10,
      totalSentences: sentences.length,
      starterVariety: Math.round(starterVariety * 100),
      types: { declarative, interrogative, exclamatory }
    };
  },

  // ========================
  // GENRE DETECTION - FULL SPECTRUM
  // ========================
  detectGenre(text) {
    const lower = text.toLowerCase();
    const scores = {};
    const dialogueCount = (text.match(/[""\u201C][^""\u201D]*[""\u201D]/g) || []).length;
    const narrativePatterns = (text.match(/\b(he|she|they|it)\s+(said|walked|looked|turned|stood|sat|ran|felt|knew|thought|asked|whispered|replied|nodded|shook|grabbed|pulled|pushed|stepped|moved|watched|stared|smiled|laughed|cried|screamed|shouted|muttered|sighed|gasped|frowned)\b/gi) || []).length;

    // Helper: count keyword hits
    const countHits = (words) => words.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);

    // ---- FICTION GENRES ----

    // Science Fiction
    scores.scifi = countHits(['spaceship','galaxy','planet','alien','robot','android','laser','cybernetic','hologram','warp','hyperspace','terraforming','quantum','nanobots','dystopia','utopia','cyborg','artificial intelligence','starship','colonize','interstellar','futuristic','simulation','clone','mutation','spacecraft','colony','reactor','orbit','shuttle','faster-than-light','star system','asteroid','nebula','federation','neural','implant','drone','sentient','biotech','nanotech','cryosleep','wormhole','singularity','outpost','off-world','deep space','radiation','oxygen','atmosphere','habitat','cargo ship','beacon','protocol']) * 3;

    // Fantasy
    scores.fantasy = countHits(['dragon','wizard','magic','sword','kingdom','castle','spell','enchanted','elf','dwarf','quest','prophecy','sorcerer','mythical','realm','throne','potion','wand','goblin','troll','knight','ancient','mage','conjure','enchantment','dark lord','chosen one','amulet','artifact','magical','fae','faerie','elven','dwarven','orc','demon','summoner','necromancer','warlock','paladin','arcane','rune','scroll','staff','cloak','dungeon','tower','forest','enchanted forest','dark magic','blood magic']) * 3;

    // Romance
    scores.romance = countHits(['love','kiss','heart','passion','desire','romance','attraction','chemistry','relationship','boyfriend','girlfriend','husband','wife','wedding','marriage','swoon','embrace','caress','longing','yearning','soulmate','first love','falling for','butterflies','date','dating','proposal','heartbreak','second chance','enemies to lovers','slow burn','forbidden love']) * 3;
    // Dialogue + emotional language boost for romance
    if (dialogueCount > 10 && scores.romance > 5) scores.romance += 10;

    // Thriller & Suspense
    scores.thriller = countHits(['murder','detective','suspect','crime','investigate','weapon','victim','witness','chase','escape','danger','threat','conspiracy','assassin','knife','gun','blood','shadow','followed','stalked','hostage','ransom','bomb','undercover','agent','CIA','FBI','operative','target','surveillance','sniper','intel','classified','deadline','ticking','countdown','betrayal','double-cross']) * 3;

    // Mystery & Crime
    scores.mystery = countHits(['clue','murder','detective','suspect','alibi','evidence','crime scene','forensic','investigation','whodunit','corpse','body','motive','red herring','sleuth','case','solved','unsolved','inspector','witness','testimony','interrogation','confession']) * 3;

    // Horror & Paranormal
    scores.horror = countHits(['horror','terror','ghost','haunted','demon','possession','curse','evil','nightmare','scream','blood','gore','undead','zombie','vampire','werewolf','creature','monster','dark','shadow','dread','fear','spine','chill','supernatural','paranormal','poltergeist','exorcism','ritual','sacrifice','occult','séance','crypt','cemetery','grave','asylum']) * 3;

    // Historical Fiction
    scores.historical = countHits(['century','era','reign','king','queen','emperor','duke','duchess','lord','lady','manor','estate','carriage','horse','musket','cannon','regiment','soldier','battle','treaty','colony','colonial','plantation','slavery','abolition','suffrage','revolution','civil war','victorian','medieval','renaissance','tudor','regency','edwardian','ancient rome','ancient greece','war of','the great war','prohibition','depression','1800s','1900s']) * 3;

    // Dystopian
    scores.dystopian = countHits(['dystopia','dystopian','regime','totalitarian','surveillance','oppression','freedom','rebellion','resistance','uprising','control','propaganda','citizen','subject','district','zone','sector','ration','curfew','forbidden','outlawed','compliance','dissent','underground','escape','wall','barrier','test','trial','chosen','sorted','selected','engineered','modified']) * 3;
    // Dystopian is close to sci-fi, boost if both present
    if (scores.dystopian > 5 && scores.scifi > 5) scores.dystopian += 10;

    // Young Adult
    scores.ya = countHits(['school','high school','college','teenager','teen','prom','homework','parents','mom','dad','best friend','crush','locker','cafeteria','bully','popular','cool kids','first time','growing up','coming of age','sixteen','seventeen','eighteen','graduation','summer break']) * 3;

    // Literary Fiction (harder to detect - focus on style markers)
    scores.literary = 0;
    const avgSentLen = text.split(/[.!?]+/).filter(s=>s.trim()).length;
    const uniqueWords = new Set((text.match(/\b[a-z]+\b/g)||[]).map(w=>w.toLowerCase()));
    const lexDiv = uniqueWords.size / Math.max(text.split(/\s+/).length, 1);
    if (lexDiv > 0.55) scores.literary += 10;
    if (narrativePatterns > 10 && dialogueCount < 5) scores.literary += 8; // heavy narration, light dialogue
    if (countHits(['metaphor','silence','memory','light','shadow','weight','absence','longing','reflection','consciousness','identity','solitude','meaning','truth','beauty','time','loss']) > 4) scores.literary += 10;

    // Romantasy (Romance + Fantasy)
    scores.romantasy = 0;
    if (scores.romance > 10 && scores.fantasy > 10) scores.romantasy = Math.round((scores.romance + scores.fantasy) * 0.6);

    // Cozy Mystery
    scores.cozyMystery = 0;
    if (scores.mystery > 5 && countHits(['cat','dog','bakery','bookshop','cafe','village','neighbor','garden','knitting','baking','tea','cozy','small town','amateur','curious']) > 2) scores.cozyMystery = scores.mystery + 10;

    // Adventure
    scores.adventure = countHits(['adventure','journey','treasure','map','expedition','discover','explore','survive','wild','jungle','island','mountain','ocean','ship','sail','pirate','cave','danger','quest','navigate','compass','voyage']) * 3;

    // Western
    scores.western = countHits(['cowboy','ranch','saloon','sheriff','outlaw','frontier','prairie','desert','horse','cattle','revolver','duel','marshal','gunfight','posse','wanted','stagecoach','gold rush','homestead','rustler']) * 3;

    // ---- NON-FICTION GENRES ----

    // Memoir & Autobiography
    scores.memoir = 0;
    const firstPersonCount = (text.match(/\bI\b/g) || []).length;
    const totalWords = text.split(/\s+/).length;
    if (firstPersonCount / totalWords > 0.03 && countHits(['remember','childhood','grew up','my mother','my father','my family','looking back','years later','in those days','my life','i was born','memoir','autobiography']) > 2) scores.memoir = 20 + countHits(['remember','childhood','grew up','my mother','my father','my family','looking back','years later','in those days','my life']) * 3;

    // Self-Help
    scores.selfHelp = countHits(['habit','mindset','productivity','goal','success','motivation','strategy','step-by-step','exercise','practice','technique','improve','transform','achieve','overcome','chapter summary','action item','takeaway','framework','principle','rule','tip']) * 3;
    // Direct reader address is THE self-help signature — fiction is almost never written
    // in sustained second person. Dense "you/your" strongly outweighs topical keyword overlap
    // (a poverty memoir hits 'freedom'/'control'/'escape' in the dystopian list but reads
    // nothing like dystopian fiction).
    const secondPersonCount = (lower.match(/\byou\b|\byour\b/g) || []).length;
    const totalWordsForNF = text.split(/\s+/).length;
    const secondPersonDensity = secondPersonCount / Math.max(totalWordsForNF, 1);
    if (secondPersonDensity > 0.015) scores.selfHelp += 30;
    else if (secondPersonDensity > 0.008) scores.selfHelp += 15;

    // Biography
    scores.biography = 0;
    if (countHits(['born in','early life','career','legacy','death of','the life of','biography','biographical','his life','her life','contributions','achievements','influential']) > 3) scores.biography = 15;

    // History (non-fiction)
    scores.historyNF = countHits(['historical','historian','archaeological','document','primary source','secondary source','archive','century','era','civilization','dynasty','empire','colony','revolution','according to records','historians believe','evidence suggests']) * 3;

    // True Crime
    scores.trueCrime = 0;
    if (countHits(['true crime','real-life','case file','investigation','detective','police report','forensic','convicted','trial','prosecution','defense','jury','verdict','sentence','prison','parole','cold case','serial','perpetrator']) > 3) scores.trueCrime = 15;

    // Philosophy & Religion
    scores.philosophy = countHits(['philosophy','philosophical','existence','consciousness','morality','ethics','belief','faith','spiritual','divine','sacred','theology','metaphysics','epistemology','ontology','existential','nihilism','stoicism','mindfulness','meditation','soul','enlightenment']) * 3;

    // General fiction signals
    let fictionBase = 0;
    if (dialogueCount > 3) fictionBase += 15;
    if (dialogueCount > 10) fictionBase += 10;
    if (narrativePatterns > 3) fictionBase += 15;
    if (narrativePatterns > 10) fictionBase += 10;
    const properNouns = text.match(/\b[A-Z][a-z]{2,}\b/g) || [];
    const nameFreq = {};
    properNouns.forEach(n => { nameFreq[n] = (nameFreq[n] || 0) + 1; });
    if (Object.values(nameFreq).filter(c => c >= 3).length >= 2) fictionBase += 10;

    // Nonfiction base signals
    let nfBase = countHits(['research','study','according to','evidence','data','analysis','conclusion','hypothesis','methodology','statistics','furthermore','therefore','consequently','in conclusion']) * 3;
    if ((text.match(/^\d+\.\s/gm) || []).length > 3) nfBase += 8;
    if ((text.match(/\(\d{4}\)/g) || []).length > 2) nfBase += 10;
    // Sustained direct address ("you/your") is a nonfiction register, not a fiction one
    if (secondPersonDensity > 0.015) nfBase += 20;
    else if (secondPersonDensity > 0.008) nfBase += 10;

    // Determine winner
    // Fiction genres get fiction base added
    const fictionGenres = ['scifi','fantasy','romance','thriller','mystery','horror','historical','dystopian','ya','literary','romantasy','cozyMystery','adventure','western'];
    fictionGenres.forEach(g => { if (scores[g] > 0) scores[g] += fictionBase; });

    // Nonfiction genres get nf base added
    const nfGenres = ['memoir','selfHelp','biography','historyNF','trueCrime','philosophy'];
    nfGenres.forEach(g => { if (scores[g] > 0) scores[g] += nfBase; });

    // Add fallback fiction/nonfiction
    scores.fiction = fictionBase;
    scores.nonfiction = nfBase;

    // Sort and pick winner
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    let primary = sorted[0][1] > 0 ? sorted[0][0] : 'fiction';

    // If nonfiction wins but fiction signals are MUCH stronger AND no structural nonfiction markers, default to fiction.
    // Hardened from 0.6× → 1.5× threshold + structural-marker short-circuit so dialogue/character names alone
    // don't flip a self-help / memoir / biography back to fiction.
    const hasStructuralNonfiction = nfBase >= 30
      || (text.match(/^\d+\.\s/gm) || []).length > 3
      || (text.match(/\(\d{4}\)/g) || []).length > 2
      // Sustained direct reader address is structural nonfiction — memoir/self-help
      // anecdotes ("my mother... she said") inflate fictionBase, but fiction is
      // essentially never written in dense second person.
      || secondPersonDensity > 0.015;
    if (['nonfiction','historyNF','biography','memoir','selfHelp'].includes(primary)
        && fictionBase >= nfBase * 1.5
        && !hasStructuralNonfiction) {
      primary = 'fiction';
    }

    const genreLabels = {
      fiction:'Fiction', scifi:'Science Fiction', nonfiction:'Nonfiction',
      fantasy:'Fantasy', thriller:'Thriller/Suspense', mystery:'Mystery/Crime',
      horror:'Horror/Paranormal', historical:'Historical Fiction',
      dystopian:'Dystopian', ya:'Young Adult', literary:'Literary Fiction',
      romance:'Romance', romantasy:'Romantasy', cozyMystery:'Cozy Mystery',
      adventure:'Adventure', western:'Western',
      memoir:'Memoir/Autobiography', selfHelp:'Self-Help',
      biography:'Biography', historyNF:'History (Non-Fiction)',
      trueCrime:'True Crime', philosophy:'Philosophy/Religion'
    };

    // Also detect secondary genre
    const secondary = sorted[1] && sorted[1][1] > 5 ? sorted[1][0] : null;

    return {
      primary,
      label: genreLabels[primary] || primary,
      secondary: secondary ? genreLabels[secondary] || secondary : null,
      scores
    };
  },

  // ========================
  // STRUCTURE (fiction)
  // ========================
  // The manuscript's skeleton, measured from how it is built rather than from a lexicon of
  // tension words: its units (chapters, scene breaks, or equal segments when it has
  // neither); how much of each unit is scene (action and dialogue, the modes a reader lives
  // through in real time) against summary (reflection, description, exposition); where the
  // most scene-heavy stretch sits and whether the book comes down from it; how the unit
  // lengths hold to the book's own median; and whether the named cast persists across
  // units. It does not measure stakes, causality or what a character wants: nothing
  // lexical can, and the methodology says so.
  _structureUnits(text, mode) {
    const wordsIn = s => (s.match(/\b[\w\u2019'-]+\b/g) || []).length;
    let m, marks = [], source = 'chapter';
    const headingRe = /^[ \t]*(?:(?:chapter|part|book)\s+(?:\d+|[ivxlc]+|[a-z]+(?:[- ][a-z]+)?)\b[^\n]{0,80}|(?:prologue|epilogue|interlude)\b[^\n]{0,80})$/gim;
    const shortLabel = s => { const t = s.trim().replace(/\s+/g, ' '); if (t.length <= 36) return t; const cut = t.slice(0, 36); return cut.slice(0, Math.max(cut.lastIndexOf(' '), 12)) + '…'; };
    while ((m = headingRe.exec(text)) !== null) marks.push({ at: m.index, end: m.index + m[0].length, label: shortLabel(m[0]), heading: m[0].trim().replace(/\s+/g, ' ') });
    // Titles set in capitals on their own line ("THOUGHT AND CHARACTER") are headings when
    // the manuscript has at least three of them.
    if (marks.length < 2) {
      const caps = [], capsRe = /^[ \t]*([A-Z][A-Z0-9 ,'’:;&\-]{3,70})[ \t]*$/gm;
      while ((m = capsRe.exec(text)) !== null) { const t = m[1].trim(); if (t.split(/\s+/).length <= 10 && /[A-Z]{2}/.test(t)) caps.push({ at: m.index, end: m.index + m[0].length, label: shortLabel(t), heading: t }); }
      if (caps.length >= 3) marks = caps;
    }
    if (marks.length < 2) {
      marks = []; source = 'scene-break';
      const breakRe = /\n[ \t]*(?:\*\s*\*\s*\*|#{1,3}|-{3,}|~{3,})[ \t]*\n/g;
      let n = 1;
      while ((m = breakRe.exec(text)) !== null) marks.push({ at: m.index, end: m.index + m[0].length, label: 'Scene ' + (++n) });
    }
    if (marks.length >= 2) {
      const units = [];
      let cursor = 0, label = source === 'chapter' ? 'Opening' : 'Scene 1', heading = null;
      for (const mk of marks) {
        const body = text.slice(cursor, mk.at), w = wordsIn(body);
        if (w >= 60) units.push({ label, heading, start: cursor, end: mk.at, words: w });
        cursor = mk.end; label = mk.label; heading = mk.heading || null;
      }
      const tail = text.slice(cursor), tw = wordsIn(tail);
      if (tw >= 60) units.push({ label, heading, start: cursor, end: text.length, words: tw });
      if (units.length >= 3) return { units, source };
    }
    // Neither headings nor breaks: equal segments cut at paragraph boundaries.
    const total = wordsIn(text);
    const n = Math.max(3, Math.min(24, Math.round(total / (mode === 'book' ? 1500 : 400))));
    const paras = [];
    const splitter = /\n\s*\n/g; let last = 0;
    while ((m = splitter.exec(text)) !== null) { paras.push({ start: last, end: m.index }); last = m.index + m[0].length; }
    paras.push({ start: last, end: text.length });
    const units = []; let acc = 0, uStart = 0, k = 1;
    for (const p of paras) {
      acc += wordsIn(text.slice(p.start, p.end));
      if (acc >= k * total / n && k < n) { units.push({ label: 'Segment ' + k, start: uStart, end: p.end, words: acc - (units.length ? units.reduce((a, u) => a + u.words, 0) : 0) }); uStart = p.end; k++; }
    }
    const used = units.reduce((a, u) => a + u.words, 0);
    if (total - used >= 60) units.push({ label: 'Segment ' + k, start: uStart, end: text.length, words: total - used });
    return { units, source: 'segment' };
  },
  // Shared by both structure models: units, their prose composition, robust statistics.
  _structureBase(text, mode) {
    const wordsIn = s => (s.match(/\b[\w’'-]+\b/g) || []).length;
    const { units, source } = this._structureUnits(text, mode);
    const classifier = typeof ProseContext !== 'undefined';
    let passages = [];
    if (classifier) { try { passages = ProseContext.classify(text); } catch (e) { passages = []; } }
    units.forEach((u, i) => {
      u.index = i + 1;
      const tally = { dialogue: 0, action: 0, reflection: 0, description: 0, exposition: 0, mixed: 0 };
      for (const p of passages) { if (p.start >= u.start && p.start < u.end) tally[p.mode] = (tally[p.mode] || 0) + p.wordCount; }
      const classified = tally.dialogue + tally.action + tally.reflection + tally.description + tally.exposition;
      u.classifiedShare = u.words ? Math.round(classified / u.words * 100) : 0;
      const pct = n => classified ? Math.round(n / classified * 100) : null;
      u.actionShare = pct(tally.action); u.dialogueShare = pct(tally.dialogue); u.reflectionShare = pct(tally.reflection);
      u.descriptionShare = pct(tally.description); u.expositionShare = pct(tally.exposition);
      u.sceneShare = classified ? Math.round((tally.action + tally.dialogue) / classified * 100) : null;
      u.illustrationShare = classified ? Math.round((tally.action + tally.dialogue + tally.description) / classified * 100) : null;
      const slice = text.slice(u.start, u.end);
      const sents = slice.match(/[^.!?]+[.!?]+/g) || [];
      u.meanSentence = sents.length ? Math.round(u.words / sents.length * 10) / 10 : null;
      // The first line of prose after the heading, so the editor can be scrolled to this unit.
      const afterHeading = u.heading ? slice.replace(u.heading, '') : slice;
      u.opening = afterHeading.trim().replace(/\s+/g, ' ').slice(0, 90);
      // Paragraph-level signposting: paragraphs that open with a connective, per 1,000 words.
      const paras = slice.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      const signposts = paras.filter(p => /^(however|moreover|furthermore|meanwhile|consequently|therefore|nevertheless|nonetheless|additionally|similarly|conversely|in contrast|on the other hand|as a result|in addition|for example|for instance|in other words|in fact|indeed|likewise|accordingly|thus|hence|first|second|third|finally|next|then|but|so|yet|still|also)\b/i.test(p)).length;
      u.paragraphs = paras.length; u.signposts = signposts; u.signpostRate = u.words ? Math.round(signposts / u.words * 10000) / 10 : 0;
    });
    return { units, source, classifier, wordsIn };
  },
  _robust(values) {
    const v = values.filter(x => Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return { median: null, mad: null };
    const median = v[v.length >> 1];
    const dev = v.map(x => Math.abs(x - median)).sort((a, b) => a - b);
    return { median, mad: dev[dev.length >> 1] };
  },
  // Structural findings shared by fiction and nonfiction: "what should the author look at, and
  // why". Every sentence is built from a measurement of this manuscript; the thresholds (a unit
  // 2.5 MADs and at least 12 points from the manuscript's own median; a final third at 70% or
  // less of the rest) are stated in the methodology and are the only fixed numbers here.
  _structureFindings(units, share, vocab, mode) {
    const findings = [];
    const n = units.length, measured = units.filter(u => u[share] != null);
    const noun = vocab.unitNoun, Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
    const nameOf = u => u.heading ? u.label : Noun + ' ' + u.index;
    const range = list => list.length === 1 ? nameOf(list[0]) : list.length === 2 ? nameOf(list[0]) + ' and ' + nameOf(list[1]) : nameOf(list[0]) + ' to ' + nameOf(list[list.length - 1]);
    if (measured.length >= 4) {
      const { median, mad } = this._robust(measured.map(u => u[share]));
      const band = Math.max(12, 2.5 * (mad || 0));
      const heavy = measured.filter(u => u[share] >= median + band);
      const light = measured.filter(u => u[share] <= median - band || (u[share] <= 10 && median >= 25));
      for (const u of heavy) findings.push({ id: 'heavy', unit: u.index, units: [u.index], title: nameOf(u) + ' is unusually ' + vocab.heavy, text: Math.round(u[share]) + '% of it is ' + vocab.what + ', against a typical ' + median + '% in this manuscript. ' + vocab.heavyWhy });
      for (const u of light) findings.push({ id: 'light', unit: u.index, units: [u.index], title: (u.index === 1 ? 'The opening ' + noun : nameOf(u)) + ' is almost entirely ' + vocab.light, text: Math.round(u[share]) + '% of it is ' + vocab.what + ', against a typical ' + median + '%. ' + vocab.lightWhy });
      // Drop-off or build near the end: the final third against everything before it.
      const cut = Math.floor(measured.length * 2 / 3);
      const before = measured.slice(0, cut), after = measured.slice(cut);
      const mean = a => a.reduce((x, u) => x + u[share], 0) / a.length;
      if (after.length >= 2 && before.length >= 2) {
        const mb = Math.round(mean(before)), ma = Math.round(mean(after));
        if (ma <= mb * 0.7 && mb - ma >= 8) findings.push({ id: 'ending-drop', unit: after[0].index, units: after.map(u => u.index), title: vocab.dropTitle, text: range(after) + ' average ' + ma + '% ' + vocab.what + ', against ' + mb + '% in the ' + noun + 's before them. ' + vocab.dropWhy });
      }
      // Flat: nothing rises or falls.
      const max = Math.max(...measured.map(u => u[share])), min = Math.min(...measured.map(u => u[share]));
      if (max - min < 5) findings.push({ id: 'flat', unit: null, units: [], title: 'Every ' + noun + ' is built the same way', text: vocab.what.charAt(0).toUpperCase() + vocab.what.slice(1) + ' stays between ' + min + '% and ' + max + '% across all ' + n + ' ' + noun + 's. ' + vocab.flatWhy });
      // Where the most concentrated unit sits, full manuscripts only.
      if (mode === 'book' && max - min >= 5) {
        const peak = measured.find(u => u[share] === max);
        const pos = (peak.index - 1) / Math.max(n - 1, 1);
        if (pos < 0.34) findings.push({ id: 'peak-early', unit: peak.index, units: [peak.index], title: 'The most ' + vocab.heavy + ' ' + noun + ' comes early', text: nameOf(peak) + ' carries the most ' + vocab.what + ' in the manuscript (' + max + '%), ' + Math.round(pos * 100) + '% of the way through. ' + vocab.earlyWhy });
      }
    }
    // Unit length against the manuscript's own median.
    if (n >= 4) {
      const { median } = this._robust(units.map(u => u.words));
      const outliers = units.filter(u => u.words < median * 0.3 || u.words > median * 3);
      findings.push({ id: 'length', unit: outliers[0] ? outliers[0].index : null, units: outliers.map(u => u.index), title: (n - outliers.length) + ' of ' + n + ' ' + noun + 's are within the manuscript’s normal length', text: 'The typical ' + noun + ' runs ' + median.toLocaleString() + ' words.' + (outliers.length ? ' ' + outliers.map(u => nameOf(u) + ' (' + u.words.toLocaleString() + ' words)').join(' and ') + (outliers.length === 1 ? ' is' : ' are') + ' far outside that range.' : ' None is far outside that range.'), info: !outliers.length });
    }
    return findings;
  },
  analyzePlot(text, mode, genre, characters) {
    if(this.isNonfiction(genre)) return this._analyzeNonfictionStructure(text,mode,genre);
    const legacy = { hasRisingAction: null, hasClimax: null, hasResolution: null, hasCliffhanger: null, hasSceneGoal: null };
    const totalWords = (text.match(/\b[\w’'-]+\b/g) || []).length;
    if (totalWords < 1200) return { score: null, scored: false, applicable: false, arc: 'insufficient-data', details: 'Under 1,200 words: too short to measure structure.', units: [], unitCount: 0, findings: [], components: {}, notAssessed: ['structure: under 1,200 words'], ...legacy };
    const { units, source, classifier } = this._structureBase(text, mode);
    const n = units.length, notAssessed = [];
    const measured = units.filter(u => u.sceneShare != null);
    if (!classifier) notAssessed.push('scene and summary: passage classifier unavailable');
    else if (measured.length < 4) notAssessed.push('scene and summary: fewer than four classified units');
    if (mode !== 'book') notAssessed.push('placement of the most scene-heavy unit: not a full manuscript');
    const findings = this._structureFindings(units, 'sceneShare', {
      unitNoun: source === 'chapter' ? 'chapter' : source === 'scene-break' ? 'scene' : 'segment',
      what: 'action or dialogue', heavy: 'scene-heavy', light: 'summary',
      heavyWhy: 'This is where the manuscript spends its dramatised time. Make sure the moment earns that weight.',
      lightWhy: 'If this stretch carries a turn in the story, it is being told rather than shown.',
      dropTitle: 'Scene-driven writing falls away near the ending',
      dropWhy: 'Review whether the conclusion is being summarised rather than dramatised.',
      flatWhy: 'Nothing rises or falls: the reader gets the same proportion of scene in every unit.',
      earlyWhy: 'Nothing later reaches that level of dramatisation; check whether the ending is carried by scene or by summary.'
    }, mode);
    // Cast persistence, from the same character analysis the cast tab shows.
    const cast = characters && characters.list ? characters.list : this.analyzeCharacters(text, genre).list;
    const named = (cast || []).slice(0, 40);
    let castInfo = { qualified: named.length, recurring: 0, lead: null, leadUnits: null, names: [] };
    if (named.length >= 2 && n >= 2) {
      const esc = s => s.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
      castInfo.names = named.map(c => { const re = new RegExp('\\b' + esc(c.name) + '\\b'); const inUnits = units.filter(u => re.test(text.slice(u.start, u.end))).length; return { name: c.name, units: inUnits, mentions: c.mentions }; });
      castInfo.recurring = castInfo.names.filter(c => c.units >= 2).length;
      castInfo.lead = castInfo.names[0].name; castInfo.leadUnits = castInfo.names[0].units;
      for (const u of units) u.cast = castInfo.names.filter(c => new RegExp('\\b' + esc(c.name) + '\\b').test(text.slice(u.start, u.end))).map(c => c.name).slice(0, 8);
      const noun = source === 'chapter' ? 'chapter' : 'unit';
      findings.push({ id: 'cast', unit: null, units: [], title: castInfo.recurring + ' of ' + named.length + ' named characters appear in more than one ' + noun, text: castInfo.lead + ', the most-mentioned, appears in ' + castInfo.leadUnits + ' of ' + n + ' ' + noun + 's.' + (castInfo.leadUnits / n < 0.5 ? ' The character the book names most is absent from more than half of it.' : ''), info: castInfo.leadUnits / n >= 0.5 });
    } else notAssessed.push('cast persistence: fewer than two named characters');
    const shares = measured.map(u => u.sceneShare);
    const curve = shares.length ? { peakIndex: measured[shares.indexOf(Math.max(...shares))].index, peakShare: Math.max(...shares), lowShare: Math.min(...shares), lastUnitShare: shares[shares.length - 1] } : null;
    const overview = this._structureOverview(units, source, curve, 'sceneShare', 'action or dialogue', findings);
    return { score: null, scored: false, applicable: n >= 3, arc: 'structure', mode: mode === 'book' ? 'book' : 'chapter',
      methodology: 'Structure is described, not scored. Units come from chapter headings, scene breaks, or equal segments; each unit’s share of scene (action and dialogue) against summary comes from the passage classifier; a unit is called unusual when it sits 2.5 MADs and at least 12 points from the manuscript’s own median; the ending is compared as the final third against the rest. Stakes, causality and what a character wants are not measured.',
      overview, findings,
      units: units.map(u => ({ index: u.index, label: u.label, heading: u.heading || null, opening: u.opening, words: u.words, sceneShare: u.sceneShare, actionShare: u.actionShare, dialogueShare: u.dialogueShare, reflectionShare: u.reflectionShare, descriptionShare: u.descriptionShare, expositionShare: u.expositionShare, classifiedShare: u.classifiedShare, meanSentence: u.meanSentence, cast: u.cast || [] })),
      unitCount: n, unitSource: source, curve, cast: castInfo, notAssessed, ...legacy };
  },
  _structureOverview(units, source, curve, share, what, findings) {
    const noun = source === 'chapter' ? 'chapter' : source === 'scene-break' ? 'scene' : 'segment';
    const n = units.length;
    let s = n + ' ' + noun + 's' + (source === 'chapter' ? ' from headings' : source === 'scene-break' ? ' from scene breaks' : ' (no headings or scene breaks found, so equal segments)') + '. ';
    if (curve) {
      const peak = units.find(u => u.index === curve.peakIndex);
      const peakName = peak.heading ? peak.label : noun.charAt(0).toUpperCase() + noun.slice(1) + ' ' + peak.index;
      s += what.charAt(0).toUpperCase() + what.slice(1) + ' ranges from ' + curve.lowShare + '% to ' + curve.peakShare + '% of a ' + noun + ', highest in ' + peakName + (/…$/.test(peakName) ? '' : '.');
      const drop = findings.find(f => f.id === 'ending-drop');
      if (drop) s += ' It thins through the final third.';
    }
    return s;
  },
  // Nonfiction: the same skeleton read for an argument. Illustration (example, story, scene:
  // the classifier’s action, dialogue and description) against exposition; paragraph-level
  // signposting; unit length; and whether the book’s key terms persist across units.
  _keyTerms(text) {
    const stop = new Set('about above after again against almost along already also although always among another anyone anything around because become becomes before began begin behind being below between beyond cannot could different during either enough every everything first further having himself herself however itself little might myself nothing often other others ought people perhaps rather really seemed several should since someone something sometimes still their there these things those though through toward under until upon where whether which while whole whose within without would yourself years young great small large right thing think thought known shall would could should might must will cannot'.split(' '));
    const counts = {}, caps = {};
    for (const m of text.matchAll(/\b([A-Za-z][a-z’']{4,})\b/g)) {
      const w = m[1].toLowerCase().replace(/[’'].*$/, '');
      if (w.length < 5 || stop.has(w)) continue;
      counts[w] = (counts[w] || 0) + 1; if (/^[A-Z]/.test(m[1])) caps[w] = (caps[w] || 0) + 1;
    }
    return Object.entries(counts).filter(([w, c]) => c >= 5 && (caps[w] || 0) / c < 0.5).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([term, count]) => ({ term, count }));
  },
  _analyzeNonfictionStructure(text, mode, genre) {
    const legacy = { hasRisingAction: null, hasClimax: null, hasResolution: null, hasCliffhanger: null, hasSceneGoal: null };
    const totalWords = (text.match(/\b[\w’'-]+\b/g) || []).length;
    if (totalWords < 1200) return { score: null, scored: false, applicable: false, arc: 'insufficient-data', details: 'Under 1,200 words: too short to measure structure.', units: [], unitCount: 0, findings: [], notAssessed: ['structure: under 1,200 words'], ...legacy };
    const { units, source, classifier } = this._structureBase(text, mode);
    const n = units.length, notAssessed = [];
    const measured = units.filter(u => u.illustrationShare != null);
    if (!classifier) notAssessed.push('illustration and exposition: passage classifier unavailable');
    else if (measured.length < 4) notAssessed.push('illustration and exposition: fewer than four classified units');
    const noun = source === 'chapter' ? 'chapter' : source === 'scene-break' ? 'section' : 'segment';
    const findings = this._structureFindings(units, 'illustrationShare', {
      unitNoun: noun, what: 'example, story or scene', heavy: 'illustration-heavy', light: 'exposition',
      heavyWhy: 'The argument pauses here for its longest stretch of showing. Make sure the point it illustrates is stated.',
      lightWhy: 'A claim that runs this long without an example is the easiest place for a reader to stop believing you.',
      dropTitle: 'Illustration falls away near the end',
      dropWhy: 'Closing chapters often summarise; check that the final argument still gets an example.',
      flatWhy: 'Every unit mixes claim and example in the same proportion.',
      earlyWhy: 'Later chapters lean harder on assertion; check whether their claims are still illustrated.'
    }, mode);
    // Signposting: the unit with the fewest paragraph-level connectives against the manuscript’s median.
    if (n >= 4 && (this._robust(units.map(u => u.signpostRate)).median || 0) >= 2) {
      const { median, mad } = this._robust(units.map(u => u.signpostRate));
      const thin = units.filter(u => u.paragraphs >= 6 && u.signpostRate <= Math.max(0, median - Math.max(2, 2.5 * (mad || 0))));
      const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
      for (const u of thin.slice(0, 3)) findings.push({ id: 'signposting', unit: u.index, units: [u.index], title: (u.heading ? u.label : Noun + ' ' + u.index) + ' has the fewest signposts', text: u.signposts + ' of its ' + u.paragraphs + ' paragraphs open with a connective (' + u.signpostRate + ' per 1,000 words against a typical ' + median + '). Readers find their way through an argument by its connectives.' });
    }
    // Key terms persisting across units: the argument’s cast.
    const terms = this._keyTerms(text);
    let concepts = { terms: [], persistent: 0, lead: null, leadUnits: null };
    if (terms.length >= 3 && n >= 2) {
      concepts.terms = terms.map(t => { const re = new RegExp('\\b' + t.term, 'i'); return { term: t.term, count: t.count, units: units.filter(u => re.test(text.slice(u.start, u.end))).length }; });
      concepts.persistent = concepts.terms.filter(t => t.units >= Math.ceil(n / 2)).length;
      concepts.lead = concepts.terms[0].term; concepts.leadUnits = concepts.terms[0].units;
      findings.push({ id: 'concepts', unit: null, units: [], title: concepts.persistent + ' of ' + concepts.terms.length + ' key terms run through most of the book', text: '“' + concepts.lead + '”, the most frequent, appears in ' + concepts.leadUnits + ' of ' + n + ' ' + noun + 's.' + (concepts.persistent / concepts.terms.length < 0.5 ? ' Most of the book’s central vocabulary is local to a few ' + noun + 's.' : ''), info: concepts.persistent / concepts.terms.length >= 0.5 });
    } else notAssessed.push('key-term persistence: too few recurring terms');
    const shares = measured.map(u => u.illustrationShare);
    const curve = shares.length ? { peakIndex: measured[shares.indexOf(Math.max(...shares))].index, peakShare: Math.max(...shares), lowShare: Math.min(...shares), lastUnitShare: shares[shares.length - 1] } : null;
    const overview = this._structureOverview(units, source, curve, 'illustrationShare', 'example, story or scene', findings);
    return { score: null, scored: false, applicable: n >= 3, arc: 'nonfiction-structure', mode: mode === 'book' ? 'book' : 'chapter',
      methodology: 'Argument structure is described, not scored. Units come from headings, section breaks, or equal segments; each unit’s share of illustration (example, story, scene) against exposition comes from the passage classifier; signposting is the rate of paragraphs opening with a connective; key terms are the manuscript’s most frequent content words. A unit is called unusual when it sits 2.5 MADs and at least 12 points from the manuscript’s own median. Whether the argument is sound is not measured.',
      overview, findings,
      units: units.map(u => ({ index: u.index, label: u.label, heading: u.heading || null, opening: u.opening, words: u.words, illustrationShare: u.illustrationShare, expositionShare: u.expositionShare, reflectionShare: u.reflectionShare, descriptionShare: u.descriptionShare, actionShare: u.actionShare, dialogueShare: u.dialogueShare, classifiedShare: u.classifiedShare, meanSentence: u.meanSentence, signposts: u.signposts, signpostRate: u.signpostRate, paragraphs: u.paragraphs })),
      unitCount: n, unitSource: source, curve, concepts, notAssessed, ...legacy };
  },

  // ========================
  // ARGUMENT STRUCTURE (nonfiction equivalent of plot)
  // Scores: thesis clarity, evidence density, logical transitions, conclusion synthesis
  // ========================
  _analyzeArgumentStructure(text, mode) {
    const paragraphs=text.split(/\n\s*\n/).filter(p=>p.trim());
    const words=text.match(/\b[\w’'-]+\b/g)||[], totalWords=words.length;
    if(paragraphs.length<3)return {score:null,applicable:false,arc:'nonfiction',details:'Too little text for argument-structure measurement.',paragraphCount:paragraphs.length,quarters:[]};
    const opening=paragraphs.slice(0,Math.min(3,paragraphs.length)).join(' ');
    const closing=paragraphs.slice(-Math.min(3,paragraphs.length)).join(' ');
    const claimRe=/\b(i argue|this book argues|this chapter argues|the central claim|the thesis|the problem is|the question is|we will show|i will show|this book shows|this chapter shows)\b/gi;
    const evidenceRe=/\b(for example|for instance|according to|research|study|studies|data|evidence|statistics|case study|survey|experiment|analysis found|results show)\b/gi;
    const transitionRe=/\b(first|second|third|finally|therefore|consequently|however|moreover|furthermore|in addition|on the other hand|in contrast|as a result|nevertheless|thus|hence|accordingly|meanwhile|subsequently)\b/gi;
    const synthesisRe=/\b(in conclusion|in summary|to summarize|taken together|overall|ultimately|the takeaway|the evidence shows|we have seen|this means)\b/gi;
    const thesisSignals=(opening.match(claimRe)||[]).length;
    const evidenceSignals=(text.match(evidenceRe)||[]).length+(text.match(/\([^)]*\b(19|20)\d{2}\b[^)]*\)|\[\d+\]/g)||[]).length;
    const transitionSignals=(text.match(transitionRe)||[]).length;
    const synthesisSignals=(closing.match(synthesisRe)||[]).length;
    const evidencePerK=+(evidenceSignals/Math.max(totalWords,1)*1000).toFixed(2);
    const transitionPerK=+(transitionSignals/Math.max(totalWords,1)*1000).toFixed(2);
    const observed=[thesisSignals>0,evidenceSignals>0,transitionSignals>0,synthesisSignals>0];
    const score=Math.round(observed.filter(Boolean).length/observed.length*100);
    const qSize=Math.ceil(paragraphs.length/4);
    const quarters=[0,1,2,3].map(i=>{const t=paragraphs.slice(i*qSize,Math.min((i+1)*qSize,paragraphs.length)).join(' '),wc=(t.match(/\b[\w’'-]+\b/g)||[]).length,e=(t.match(evidenceRe)||[]).length;return {quarter:i+1,wordCount:wc,evidenceSignals:e,evidencePerK:+(e/Math.max(wc,1)*1000).toFixed(2)}});
    return {score,applicable:true,arc:'nonfiction',methodology:'Observed claim, evidence, transition, and closing-synthesis signals.',thesisSignals,evidenceSignals,transitionSignals,synthesisSignals,evidencePerK,transitionPerK,hasThesis:thesisSignals>0,hasEvidence:evidenceSignals>0,hasTransitions:transitionSignals>0,hasConclusion:synthesisSignals>0,paragraphCount:paragraphs.length,quarters,hasRisingAction:null,hasClimax:null,hasResolution:null,hasCliffhanger:null,hasSceneGoal:null};
  },

  // ========================
  // SELF-HELP SCORING ENGINE
  // Scores: problem → insight → belief → action journey
  // ========================
  _analyzeSelfHelp(text, mode) {
    const lower = text.toLowerCase();
    const totalWords = (text.match(/\b\w+\b/g) || []).length;
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    // Every component below is a RATE per 1,000 words (or a ratio), ramped linearly to a
    // stated ceiling. Capped raw counts saturated every cap on any book-length manuscript,
    // so a 70,000-word book scored 100 on Practical Application by length alone. Ceilings
    // are approximate bands; the measured rate is shown beside the score so the band never
    // stands in for the number. Each dimension's components sum to 100.
    const perK = n => n / Math.max(totalWords, 1) * 1000;
    const ramp = (rate, full, max) => Math.min(max, Math.round(rate / full * max));

    // 1. Clarity & Readability (15%) — ease of reading, sentence and paragraph length
    const fk = this.fleschKincaid(text);
    let clarityReadability = 25;
    if (fk.ease >= 70) clarityReadability += 30;
    else if (fk.ease >= 60) clarityReadability += 20;
    else if (fk.ease >= 50) clarityReadability += 12;
    else if (fk.ease >= 40) clarityReadability += 5;
    else clarityReadability -= 5;
    const sentLens = sentences.map(s => s.trim().split(/\s+/).length);
    const avgSentLen = sentLens.reduce((a, b) => a + b, 0) / Math.max(sentLens.length, 1);
    if (avgSentLen >= 10 && avgSentLen <= 18) clarityReadability += 15;
    else if (avgSentLen < 10) clarityReadability += 8;
    else if (avgSentLen > 28) clarityReadability -= 10;
    const shortParaRatio = paragraphs.filter(p => p.split(/\s+/).length < 80).length / Math.max(paragraphs.length, 1);
    if (shortParaRatio > 0.65) clarityReadability += 15;
    else if (shortParaRatio > 0.4) clarityReadability += 8;
    const transCount = (lower.match(/\b(however|therefore|furthermore|because|although|first|second|third|finally|next|also|specifically|for example|in contrast|as a result)\b/g) || []).length;
    const transPerK = perK(transCount);
    if (transPerK > 5) clarityReadability += 15;
    else if (transPerK > 2) clarityReadability += 8;
    clarityReadability = Math.max(0, Math.min(100, clarityReadability));

    // 2. Reader Identification (15%) — does the text speak directly to the reader's situation?
    const youCount = (lower.match(/\b(you|your|you're|you've|you'll|you'd|yourself)\b/g) || []).length;
    const youPerK = perK(youCount);
    const weCount = (lower.match(/\b(we|our|we're|we've|ourselves)\b/g) || []).length;
    const wePerK = perK(weCount);
    const problemLang = (lower.match(/\b(struggle|stuck|difficult|challenge|frustrated|overwhelmed|confus|problem|obstacle|barrier|fail|afraid|fear|anxious|worry|stress|burnout|pain|suffer)\b/g) || []).length;
    const empathyMarkers = (lower.match(/\b(many\s+(of\s+us|people)|you'?ve?\s+probably|you\s+may|it'?s?\s+(okay|ok|normal)|you'?re?\s+not\s+alone|most\s+(people|of\s+us))\b/g) || []).length;
    let readerIdentification = 15;
    if (youPerK >= 20) readerIdentification += 35;
    else if (youPerK >= 12) readerIdentification += 25;
    else if (youPerK >= 6) readerIdentification += 15;
    else if (youPerK >= 2) readerIdentification += 8;
    if (wePerK >= 5) readerIdentification += 15;
    else if (wePerK >= 2) readerIdentification += 8;
    const probPerK = perK(problemLang);
    if (probPerK >= 8) readerIdentification += 20;
    else if (probPerK >= 4) readerIdentification += 12;
    else if (probPerK >= 2) readerIdentification += 6;
    readerIdentification += ramp(perK(empathyMarkers), 0.6, 15);
    readerIdentification = Math.max(0, Math.min(100, readerIdentification));

    // 3. Practical Application (15%) — does the text give readers actionable steps?
    const imperativeCount = (lower.match(/^[ \t]*(start|begin|try|do|write|create|build|think|ask|consider|practice|identify|notice|reflect|choose|focus|imagine|take|make|find|set|list|define|describe|explore|check|review|plan|commit|schedule|track)\b/gm) || []).length;
    const exerciseMarkers = (lower.match(/\b(exercise|action\s+(item|step|plan)|try\s+this|do\s+this|practice|write\s+(down|it\s+out)|homework|challenge\s+yourself|your\s+task|activity)\b/g) || []).length;
    const stepPatterns = (text.match(/^\s*\d+[\.\)]\s+\w/gm) || []).length;
    const howToPatterns = (lower.match(/\b(how\s+to|step\s+\d+|step-by-step|here'?s?\s+how|in\s+(three|four|five|two)\s+steps?)\b/g) || []).length;
    const implPatterns = (lower.match(/\b(implement|apply\s+this|use\s+this|put\s+(this|it)\s+(into|to)\s+(practice|use)|in\s+practice|actionable|tactic|technique|method|approach|strategy|framework|blueprint|system)\b/g) || []).length;
    // No base: a book that gives the reader nothing to do scores what it earned.
    let practicalApplication = 0;
    practicalApplication += ramp(perK(imperativeCount), 2.5, 25);
    practicalApplication += ramp(perK(exerciseMarkers), 1.0, 25);
    practicalApplication += ramp(perK(stepPatterns), 1.0, 20);
    practicalApplication += ramp(perK(howToPatterns), 0.5, 15);
    practicalApplication += ramp(perK(implPatterns), 1.5, 15);
    practicalApplication = Math.max(0, Math.min(100, practicalApplication));

    // 4. Structure / Progression (15%) — thesis → evidence → transitions → conclusion
    const argStructure = this._analyzeArgumentStructure(text, mode);
    const structureProgression = argStructure.score;

    // 5. Insight Quality (15%) — non-obvious, memorable ideas backed by specific claims
    const insightMarkers = (lower.match(/\b(the\s+truth\s+is|here'?s?\s+(why|what|the\s+thing)|the\s+real\s+(reason|problem|issue|truth)|what\s+most\s+people|counterintuitive|paradox|the\s+key\s+(insight|idea|principle|lesson)|aha|breakthrough|mindset\s+shift|reframe|rethink)\b/g) || []).length;
    const researchClaims = (lower.match(/\b(research\s+(shows?|suggests?|finds?)|studies?\s+(shows?|suggests?|finds?)|data\s+(shows?|suggests?)|evidence\s+(shows?|suggests?)|science\s+(says?|shows?|confirms?)|experts?\s+(say|find|agree))\b/g) || []).length;
    const specificStats = (text.match(/\b\d+[\.,]?\d*\s*(percent|%|people|times|years|days|weeks|months|hours|studies|participants)\b/gi) || []).length;
    const novelFraming = (lower.match(/\b(think\s+of\s+it\s+(as|like)|reframe|instead\s+of|contrary\s+to|most\s+people\s+(think|believe|assume)|the\s+opposite|what\s+if\s+I\s+told\s+you)\b/g) || []).length;
    let insightQuality = 20;
    insightQuality += ramp(perK(insightMarkers), 1.0, 30);
    insightQuality += ramp(perK(researchClaims), 0.6, 20);
    insightQuality += ramp(perK(specificStats), 1.0, 15);
    insightQuality += ramp(perK(novelFraming), 0.6, 15);
    insightQuality = Math.max(0, Math.min(100, insightQuality));

    // 6. Voice & Authority (10%) — author sounds credible and confident
    const authorityMarkers = (lower.match(/\b(i'?ve\s+(found|learned|discovered|seen|worked|helped|spent|observed)|in\s+my\s+experience|over\s+the\s+(years|past)|what\s+i'?ve?\s+(found|learned|discovered))\b/g) || []).length;
    const hedgeWords = (lower.match(/\b(maybe|perhaps|possibly|might\s+be|could\s+be|seems?\s+like|sort\s+of|kind\s+of)\b/g) || []).length;
    const hedgePerK = perK(hedgeWords);
    const confidentAssertions = (lower.match(/\b(the\s+(key|secret|answer|solution|truth|fact|reality|point)\s+is|this\s+(is|will|does|works)|you\s+(will|can|should|must|need\s+to)|the\s+(most\s+important|biggest|main|core|fundamental))\b/g) || []).length;
    let voiceAuthority = 45;
    voiceAuthority += ramp(perK(authorityMarkers), 0.6, 30);
    if (hedgePerK > 10) voiceAuthority -= 20;
    else if (hedgePerK > 5) voiceAuthority -= 10;
    else if (hedgePerK > 2) voiceAuthority -= 5;
    voiceAuthority += ramp(perK(confidentAssertions), 3.0, 25);
    voiceAuthority = Math.max(0, Math.min(100, voiceAuthority));

    // 7. Emotional Momentum (10%) — energizes reader toward change
    const transformWords = (lower.match(/\b(transform|achieve|succeed|thrive|flourish|grow|breakthrough|improve|progress|change|overcome|conquer|master|elevate|uplift|inspire|motivate|empower|unlock|discover|build|develop|strengthen|expand)\b/g) || []).length;
    const motivationalPhrases = (lower.match(/\b(you\s+can|you\s+will|it'?s?\s+possible|imagine\s+(if|when|yourself|being|having)|when\s+you\s+(finally|start|begin|decide|commit)|you\s+(already|deserve))\b/g) || []).length;
    const energyDensity = perK(transformWords);
    let emotionalMomentum = 35;
    if (energyDensity >= 15) emotionalMomentum += 40;
    else if (energyDensity >= 8) emotionalMomentum += 28;
    else if (energyDensity >= 4) emotionalMomentum += 18;
    else if (energyDensity >= 2) emotionalMomentum += 10;
    emotionalMomentum += ramp(perK(motivationalPhrases), 1.5, 25);
    emotionalMomentum = Math.max(0, Math.min(100, emotionalMomentum));

    // 8. Evidence & Support (5%) — data, research, stories that back up claims
    const evidenceMarkers = (lower.match(/\b(for\s+example|for\s+instance|research|study|studies|data|evidence|according\s+to|statistics|percent|percentage|case\s+in\s+point|specifically|in\s+fact|demonstrates|illustrates)\b/g) || []).length;
    const citationMarkers = (text.match(/\(\d{4}\)|\[\d+\]|\bpage\s+\d+/gi) || []).length;
    const storyMarkers = (lower.match(/\b(when\s+I|let\s+me\s+tell\s+you|here'?s?\s+a\s+(story|case|example)|I\s+remember|a\s+(client|student|friend|colleague|reader|person)\s+(once|told|asked|came))\b/g) || []).length;
    const evidencePerK = perK(evidenceMarkers);
    let evidenceSupport = 25;
    if (evidencePerK >= 8) evidenceSupport += 50;
    else if (evidencePerK >= 4) evidenceSupport += 35;
    else if (evidencePerK >= 2) evidenceSupport += 20;
    else if (evidencePerK >= 1) evidenceSupport += 10;
    evidenceSupport += ramp(perK(citationMarkers), 0.5, 15);
    evidenceSupport += ramp(perK(storyMarkers), 1.0, 10);
    evidenceSupport = Math.max(0, Math.min(100, evidenceSupport));

    const overall = Math.round(
      clarityReadability   * 0.15 +
      readerIdentification * 0.15 +
      practicalApplication * 0.15 +
      structureProgression * 0.15 +
      insightQuality       * 0.15 +
      voiceAuthority       * 0.10 +
      emotionalMomentum    * 0.10 +
      evidenceSupport      * 0.05
    );

    return {
      overall,
      clarityReadability, readerIdentification, practicalApplication,
      structureProgression, insightQuality, voiceAuthority,
      emotionalMomentum, evidenceSupport,
      // The counts each dimension was built from, so a card can show its basis instead of
      // a word like "Clean" that implies an inspection nobody made.
      evidence: {
        clarity: `Flesch ${Math.round(fk.ease)} · ${Math.round(avgSentLen)} words/sentence · ${Math.round(shortParaRatio * 100)}% short paragraphs`,
        reader: `${youPerK.toFixed(1)}/1K "you" · ${probPerK.toFixed(1)}/1K problem words · ${perK(empathyMarkers).toFixed(1)}/1K empathy cues`,
        practical: `${perK(imperativeCount).toFixed(1)}/1K imperatives (${imperativeCount}) · ${perK(exerciseMarkers).toFixed(1)}/1K exercises (${exerciseMarkers}) · ${perK(stepPatterns).toFixed(1)}/1K numbered steps · ${perK(howToPatterns).toFixed(1)}/1K how-tos`,
        structure: `${argStructure.thesisSignals || 0} thesis · ${argStructure.evidenceSignals || 0} evidence · ${argStructure.transitionSignals || 0} transition · ${argStructure.synthesisSignals || 0} synthesis signals`,
        insight: `${perK(insightMarkers).toFixed(1)}/1K insight cues (${insightMarkers}) · ${perK(researchClaims).toFixed(1)}/1K research claims · ${perK(specificStats).toFixed(1)}/1K figures · ${perK(novelFraming).toFixed(1)}/1K reframes`,
        voice: `${perK(authorityMarkers).toFixed(1)}/1K experience claims (${authorityMarkers}) · ${perK(confidentAssertions).toFixed(1)}/1K assertions · ${hedgePerK.toFixed(1)}/1K hedges`,
        momentum: `${energyDensity.toFixed(1)}/1K change words · ${perK(motivationalPhrases).toFixed(1)}/1K motivational phrases (${motivationalPhrases})`,
        evidence: `${evidencePerK.toFixed(1)}/1K evidence cues · ${perK(citationMarkers).toFixed(1)}/1K citations (${citationMarkers}) · ${perK(storyMarkers).toFixed(1)}/1K stories (${storyMarkers})`
      }
    };
  },

  // ========================
  // TRANSITION ANALYSIS
  // ========================
  // A boundary is measured only between two prose paragraphs. A spoken line shares no
  // content words with the line before it and needs no connective, so an exchange of
  // dialogue is not a run of broken transitions; a chapter heading is not a paragraph at all.
  // Those boundaries are counted and reported, never scored.
  _paragraphKind(p){
    const t=p.trim();
    if(/^["“]/.test(t)||/["“][A-Z][^"”\n]{18,}[.,!?…][”"]/.test(t)) return 'dialogue';
    if(/^(chapter|part|book|prologue|epilogue|interlude)\b/i.test(t)&&t.split(/\s+/).length<=12) return 'heading';
    if(!/\n/.test(t)&&t.split(/\s+/).length<=8&&!/[.!?,;:]["”]?$/.test(t)) return 'heading';
    return 'prose';
  },
  analyzeTransitions(text) {
    const paragraphs=text.split(/\n\s*\n/).filter(p=>p.trim());
    const kinds=paragraphs.map(p=>this._paragraphKind(p));
    const skipped={dialogue:0,heading:0};
    const notMeasured=(reason)=>({score:null,totalParagraphs:paragraphs.length,measuredBoundaries:0,skipped,transitionsUsed:0,smoothTransitions:0,smoothRate:null,details:[],applicable:false,reason,metric:'supported prose-to-prose paragraph boundaries'});
    if(paragraphs.length<2) return notMeasured('Fewer than two paragraphs.');
    const stop=new Set('the a an and or but of to in on at for from with by as is are was were be been being it this that these those he she they we you i his her their our your my not no do did does have has had'.split(' '));
    const contentWords=s=>(s.toLowerCase().match(/\b[a-z]{4,}\b/g)||[]).filter(w=>!stop.has(w));
    const transitionRe=/^(however|moreover|furthermore|meanwhile|consequently|therefore|nevertheless|nonetheless|additionally|similarly|conversely|in contrast|on the other hand|as a result|in addition|for example|for instance|in other words|in fact|indeed|likewise|accordingly|thus|hence|still|yet|also|then|next|finally|afterwards|later|before|after|during|while|although|though|even though|because|since|when|once|until|unless)\b/i;
    let transitionsUsed=0,smoothTransitions=0;
    const details=[];
    for(let i=1;i<paragraphs.length;i++){
      if(kinds[i]!=='prose'||kinds[i-1]!=='prose'){
        const why=(kinds[i]==='heading'||kinds[i-1]==='heading')?'heading':'dialogue';
        skipped[why]++;
        continue;
      }
      const prev=contentWords(paragraphs[i-1]), curr=contentWords(paragraphs[i]);
      const prevSet=new Set(prev), currSet=new Set(curr);
      const shared=[...new Set(curr.filter(w=>prevSet.has(w)))];
      const union=new Set([...prev,...curr]).size;
      const overlap=union?shared.length/union:0;
      const currTrim=paragraphs[i].trim();
      const marker=(currTrim.match(transitionRe)||[])[1]||null;
      const pronounBridge=/^(he|she|they|it|this|that|these|those|such|his|her|their)\b/i.test(currTrim);
      // A transition is supported by an explicit connective, meaningful lexical carryover,
      // or a referential bridge. This is evidence, not a claim that a transition "feels smooth."
      const supported=Boolean(marker)||overlap>=0.06||(pronounBridge&&shared.length>=1);
      if(marker) transitionsUsed++;
      if(supported) smoothTransitions++;
      details.push({fromParagraph:i,toParagraph:i+1,marker,sharedTerms:shared.slice(0,8),overlapScore:Math.round(overlap*100),pronounBridge,supported});
    }
    if(details.length<3) return notMeasured('Fewer than three prose-to-prose paragraph boundaries ('+skipped.dialogue+' dialogue and '+skipped.heading+' heading boundaries were not measured).');
    const smoothRate=Math.round(smoothTransitions/details.length*100);
    // Score is explicitly the supported-boundary rate. No arbitrary +20 floor or bonus
    // for using a preferred percentage of transition words.
    return {score:smoothRate,totalParagraphs:paragraphs.length,measuredBoundaries:details.length,skipped,transitionsUsed,smoothTransitions,smoothRate,details,applicable:true,metric:'supported prose-to-prose paragraph boundaries'};
  },

  // ========================
  // DIALOGUE ANALYSIS
  // ========================
  analyzeDialogue(text, genre) {
    const matches=text.match(/[“"][^”"\n]*[”"]/g)||[];
    const totalWords=(text.match(/\b[\w’'-]+\b/g)||[]).length;
    const isNF=this.isNonfiction(genre);
    if(!matches.length)return {score:null,n_a:true,count:0,ratio:0,applicable:false,findings:[],methodology:'No dialogue measured; absence is not a quality defect.'};
    const lengths=matches.map(d=>(d.match(/\b[\w’'-]+\b/g)||[]).length);
    const dialogueWords=lengths.reduce((a,b)=>a+b,0), ratio=dialogueWords/Math.max(totalWords,1)*100;
    if(isNF&&ratio<5)return {score:null,n_a:true,count:matches.length,ratio:+ratio.toFixed(1),applicable:false,findings:[],methodology:'Minimal nonfiction dialogue is descriptive only.'};
    // A density over a handful of lines is noise: one "Fine." in three lines is 33 per 100.
    if(matches.length<10)return {score:null,n_a:true,count:matches.length,ratio:+ratio.toFixed(1),applicable:false,findings:[],methodology:'Fewer than ten dialogue lines; too few to score a density.'};
    const speechVerbs='said|asked|whispered|shouted|muttered|replied|exclaimed|declared|murmured|yelled|cried|answered|stated|remarked|noted|suggested|demanded|insisted|pleaded|warned|admitted|announced|argued|claimed|complained|confirmed|denied|explained|protested|responded|snapped|stammered|added|sighed|laughed|called|repeated|growled|hissed|breathed|grumbled|urged|begged|inquired|echoed';
    const tagRe=new RegExp('[”"]\\s*('+speechVerbs+')\\b','gi');
    const tags={}; for(const m of text.matchAll(tagRe)){const v=m[1].toLowerCase();tags[v]=(tags[v]||0)+1;}
    const totalTags=Object.values(tags).reduce((a,b)=>a+b,0),saidAsked=(tags.said||0)+(tags.asked||0);
    // A tag adverb sits on a speech verb: "she said softly", "said Mary coldly". Any "-ly"
    // word after any closing quote ("not only", "for only") is not one.
    const notAdverb=/^(only|early|family|reply|supply|apply|holy|ugly|likely|lonely|friendly|lively|silly|jolly|belly|daily|elderly|kindly|lovely|deadly|costly|timely|italy|july|fly|ally|rally|bully|tally|folly|lily|jelly)$/i;
    const tagAdverbRe=new RegExp('[”"]\\s*(?:\\w+\\s+){0,2}(?:'+speechVerbs+')\\s+(?:\\w+\\s+)?(\\w+ly)\\b|[”"]\\s*(?:\\w+\\s+){0,2}(\\w+ly)\\s+(?:'+speechVerbs+')\\b','gi');
    let adverbTags=0; for(const m of text.matchAll(tagAdverbRe)){const w=m[1]||m[2];if(w&&!notAdverb.test(w))adverbTags++;}
    const smallTalk=matches.filter(d=>/^[“"]\s*(hi|hello|hey|how are you|good morning|good evening|goodbye|bye|thanks|thank you|okay|ok|yeah|yes|no|fine|right|well|hmm|oh)\s*[.!?]?[”"]$/i.test(d)).length;
    const expositionMarkers=(text.match(/[“"][^”"]*\b(as you know|as we discussed|as i mentioned|let me explain|you need to understand)\b[^”"]*[”"]/gi)||[]).length;
    const longLines=lengths.filter(n=>n>60).length;
    const mean=lengths.reduce((a,b)=>a+b,0)/lengths.length;
    const sd=Math.sqrt(lengths.reduce((n,v)=>n+(v-mean)**2,0)/lengths.length);
    const findings=[];
    if(adverbTags)findings.push({type:'tags',severity:'low',count:adverbTags,message:adverbTags+' dialogue-tag adverb candidate'+(adverbTags===1?'':'s')+' detected; review in context.'});
    if(expositionMarkers)findings.push({type:'naturalness',severity:'medium',count:expositionMarkers,message:expositionMarkers+' explicit exposition-in-dialogue marker'+(expositionMarkers===1?'':'s')+' detected.'});
    if(longLines)findings.push({type:'conciseness',severity:'low',count:longLines,message:longLines+' dialogue line'+(longLines===1?'':'s')+' exceed 60 words; review as possible monologues.'});
    if(smallTalk)findings.push({type:'purpose',severity:'low',count:smallTalk,message:smallTalk+' standalone pleasantry/filler candidate'+(smallTalk===1?'':'s')+' detected; these may be intentional.'});
    // Only objectively detectable anti-pattern densities affect this quality index.
    const candidateCount=adverbTags+expositionMarkers+longLines+smallTalk;
    const candidatesPer100=candidateCount/Math.max(matches.length,1)*100;
    const score=Math.max(0,Math.min(100,Math.round(100/(1+candidatesPer100/35))));
    return {score,applicable:true,count:matches.length,ratio:+ratio.toFixed(1),methodology:'Observed dialogue anti-pattern density; naturalness/purpose are not inferred as facts.',tags,saidRatio:totalTags?Math.round(saidAsked/totalTags*100):null,avgLength:+mean.toFixed(1),lengthVariety:+sd.toFixed(1),tagDiscipline:null,conciseness:null,showNotTell:null,purposefulness:null,naturalness:null,adverbTags,longSpeeches:longLines,smallTalk,asYouKnow:expositionMarkers,candidateCount,candidatesPer100:+candidatesPer100.toFixed(1),findings};
  },

  // ========================
  // STYLE ANALYSIS
  // ========================
  analyzeStyle(text) {
    const words=text.match(/\b[a-z']+\b/gi)||[];
    const totalWords=words.length;
    const lowerWords=words.map(w=>w.toLowerCase());
    const uniqueWords=new Set(lowerWords);
    const paragraphs=text.split(/\n\s*\n/).filter(p=>p.trim());
    const sentences=text.match(/[^.!?]+[.!?]+/g)||[];
    const sentLens=sentences.map(s=>(s.match(/\b[\w’'-]+\b/g)||[]).length).filter(Boolean);
    const paraLens=paragraphs.map(p=>(p.match(/\b[\w’'-]+\b/g)||[]).length);
    const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
    const sd=a=>{const m=mean(a);return a.length?Math.sqrt(a.reduce((n,v)=>n+(v-m)**2,0)/a.length):0};
    // Type-token ratio collapses as manuscripts get longer. Use MSTTR: mean TTR over
    // equal 100-word windows, which makes the vocabulary metric length-comparable.
    const window=100,ttrs=[];
    for(let i=0;i<lowerWords.length;i+=window){const w=lowerWords.slice(i,i+window);if(w.length>=50)ttrs.push(new Set(w).size/w.length);}
    const lexicalDiversity=ttrs.length?mean(ttrs):(uniqueWords.size/Math.max(totalWords,1));
    const avgWordLen=mean(words.map(w=>w.length));
    // Case-insensitive like the other two: "My" and "Me" at a sentence start are first person.
    const firstPerson=(text.match(/\b(I|me|my|mine|myself)\b/gi)||[]).length;
    const secondPerson=(text.match(/\b(you|your|yours|yourself|yourselves)\b/gi)||[]).length;
    const thirdPerson=(text.match(/\b(he|she|they|him|her|them|his|hers|their|theirs)\b/gi)||[]).length;
    // A first-person narrator still says "he" and "she" of everyone else, so first person
    // wins whenever it leads; the 1.5x margin applies only between second and third.
    const pov=firstPerson>0&&firstPerson>=Math.max(secondPerson,thirdPerson)*0.6?'First Person':secondPerson>Math.max(firstPerson,thirdPerson)*1.5?'Second Person':thirdPerson>Math.max(firstPerson,secondPerson)*1.5?'Third Person':'Mixed';
    const sentenceStdDev=sd(sentLens),paragraphStdDev=sd(paraLens);
    // Style is described, not scored. The old score was 100 minus fixed penalties at
    // thresholds real prose never crosses (MSTTR under 45%, sentence SD under 3), so every
    // manuscript scored 100 and the dimension only inflated the overall. The measurements
    // stay; a score returns when there is one that discriminates.
    return {score:null,scored:false,totalWords,uniqueWords:uniqueWords.size,lexicalDiversity:Math.round(lexicalDiversity*100),lexicalMetric:'MSTTR-100',avgWordLength:Math.round(avgWordLen*10)/10,avgSentenceLength:Math.round(mean(sentLens)*10)/10,sentenceLengthStdDev:Math.round(sentenceStdDev*10)/10,avgParagraphLength:Math.round(mean(paraLens)),paragraphLengthStdDev:Math.round(paragraphStdDev*10)/10,pov,pronouns:{first:firstPerson,second:secondPerson,third:thirdPerson},paragraphCount:paragraphs.length,sentenceCount:sentences.length};
  },

  // ========================
  // PACING ANALYSIS
  // ========================
  // The heatmap colours each 200-word stretch by the kind of prose it is. Where the
  // five-mode passage classifier is available (it always is in the app and its worker) each
  // segment takes the mode that covers most of its characters, and an ambiguous stretch is
  // called mixed rather than forced. The keyword fallback below is only for environments
  // without the classifier.
  analyzePacing(text) {
    // Fixed-size windows are retained for a stable heatmap, but every block now carries
    // provenance (word range + excerpt) and classifications are based on observed signals.
    const tokens = (text.match(/\S+/g) || []);
    const segmentSize = 200;
    if (typeof ProseContext !== 'undefined') {
      try {
        const passages = ProseContext.classify(text);
        if (passages && passages.length) return this._pacingFromPassages(text, passages, segmentSize);
      } catch (e) { /* fall through to the keyword estimate */ }
    }
    const segments = [];
    for (let i = 0; i < tokens.length; i += segmentSize) {
      const slice = tokens.slice(i, i + segmentSize);
      const chunk = slice.join(' ');
      const lower = chunk.toLowerCase();
      const wordCount = slice.length;
      const sentences = chunk.split(/[.!?]+/).filter(s => s.trim());
      const dialogueMatches = chunk.match(/[“"][^”"]*[”"]/g) || [];
      const dialogueWords = dialogueMatches.reduce((n,d)=>n+(d.match(/\b[\w’'-]+\b/g)||[]).length,0);
      const actionHits = (lower.match(/\b(ran|run|jumped|fought|grabbed|threw|slammed|crashed|bolted|sprinted|dodged|punched|kicked|fired|chased|escaped|attacked|blocked|dove|lunged|swung|struck|smashed|raced|rushed|burst|charged|leaped|dashed|pulled|pushed|climbed|fell|turned|moved)\b/g)||[]).length;
      const reflectionHits = (lower.match(/\b(thought|felt|wondered|realized|realised|remembered|considered|reflected|pondered|mused|believed|feared|hoped|imagined)\b/g)||[]).length;
      const descriptionHits = (lower.match(/\b(looked|appeared|seemed|color|colour|light|dark|bright|shadow|tall|small|large|wide|narrow|cold|warm|hot|quiet|loud|smell|scent|sound|voice|sky|room|street|building|landscape)\b/g)||[]).length;
      const expositionHits = (lower.match(/\b(because|therefore|means|meant|explained|history|reason|result|example|according|known|understood|information|fact|process)\b/g)||[]).length;
      const scores = {
        action: actionHits / Math.max(wordCount,1),
        dialogue: dialogueWords / Math.max(wordCount,1),
        description: descriptionHits / Math.max(wordCount,1),
        reflection: reflectionHits / Math.max(wordCount,1),
        exposition: expositionHits / Math.max(wordCount,1)
      };
      // Dialogue is measured as word share; other modes are lexical signals. Require
      // evidence before assigning a specialized mode; otherwise exposition is the neutral fallback.
      let type='exposition';
      const ranked=Object.entries(scores).filter(([k])=>k!=='exposition').sort((a,b)=>b[1]-a[1]);
      if(scores.dialogue>=0.12) type='dialogue';
      else if(scores.action>=0.018 && ranked[0]?.[0]==='action') type='action';
      else if(scores.reflection>=0.015 && ranked[0]?.[0]==='reflection') type='reflection';
      else if(scores.description>=0.018 && ranked[0]?.[0]==='description') type='description';
      segments.push({
        type,
        startWord:i+1,endWord:i+wordCount,wordCount,
        actionDensity:Math.round(scores.action*1000)/10,
        dialogueDensity:Math.round(scores.dialogue*1000)/10,
        descriptionDensity:Math.round(scores.description*1000)/10,
        reflectionDensity:Math.round(scores.reflection*1000)/10,
        excerpt:chunk.slice(0,180)
      });
    }
    const counts={action:0,dialogue:0,description:0,exposition:0,reflection:0,mixed:0};
    segments.forEach(s=>{counts[s.type]=(counts[s.type]||0)+1;});
    return { segments, segmentSize, counts, totalSegments:segments.length, source: 'keyword-estimate' };
  },

  // Each 200-word segment takes the passage mode that covers most of its characters; an
  // ambiguous stretch is called mixed rather than forced. Every block keeps its word range
  // and an excerpt so the colour can be checked against the text.
  _pacingFromPassages(text, passages, segmentSize) {
    const tokenRe = /\S+/g;
    const tokens = [];
    let t;
    while ((t = tokenRe.exec(text)) !== null) tokens.push({ start: t.index, end: t.index + t[0].length });
    const segments = [];
    const counts = { action: 0, dialogue: 0, description: 0, exposition: 0, reflection: 0, mixed: 0 };
    let p = 0;
    for (let i = 0; i < tokens.length; i += segmentSize) {
      const last = Math.min(i + segmentSize, tokens.length) - 1;
      const segStart = tokens[i].start, segEnd = tokens[last].end;
      const weight = {};
      while (p > 0 && passages[p].start > segStart) p--;
      for (let q = p; q < passages.length && passages[q].start < segEnd; q++) {
        const overlap = Math.min(segEnd, passages[q].end) - Math.max(segStart, passages[q].start);
        if (overlap > 0) weight[passages[q].mode] = (weight[passages[q].mode] || 0) + overlap;
        if (passages[q].end <= segStart) p = q;
      }
      const ranked = Object.entries(weight).sort((a, b) => b[1] - a[1]);
      const total = ranked.reduce((sum, [, w]) => sum + w, 0) || 1;
      const type = ranked.length ? ranked[0][0] : 'mixed';
      counts[type] = (counts[type] || 0) + 1;
      segments.push({ type, share: Math.round(ranked.length ? ranked[0][1] / total * 100 : 0),
        startWord: i + 1, endWord: last + 1, wordCount: last - i + 1, excerpt: text.slice(segStart, Math.min(segEnd, segStart + 180)) });
    }
    return { segments, segmentSize, counts, totalSegments: segments.length, source: 'passage-classifier' };
  },

  // ========================
  // CHARACTER TRACKING
  // ========================
  // A capitalised word is evidence of a name only where grammar did not force the capital.
  // Two tests, both read off the manuscript rather than a list of names:
  //   1. a word that also occurs in lowercase anywhere in the text is a common word
  //      ("Your", "Consider", "Research", "Poverty"), however often it opens a sentence;
  //   2. a word must be capitalised mid-sentence at least twice, or carry direct person
  //      evidence (a possessive, a speech attribution); one that is only ever
  //      sentence-initial is not a name.
  // Calendar words and manuscript furniture are the only fixed exclusions. Character
  // tracking is a narrative dimension: expository nonfiction reports it as not applicable.
  analyzeCharacters(text, genre) {
    const genreKey = typeof genre === 'string' ? genre : (genre && genre.primary) || '';
    if (this.isNonfiction(genre) && !['memoir', 'biography', 'trueCrime'].includes(genreKey)) return { list: [], applicable: false };
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const paraBounds = [];
    let cursor = 0;
    for (const p of paragraphs) { const at = text.indexOf(p, cursor); paraBounds.push({ start: at, end: at + p.length }); cursor = at + p.length; }
    const lowercaseForms = new Set(text.match(/\b[a-z]{3,}\b/g) || []);
    const fixedSkips = /^(Chapter|Part|Section|Book|Prologue|Epilogue|Introduction|Preface|Foreword|Afterword|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|June|July|August|September|October|November|December)$/;
    const passes = w => !lowercaseForms.has(w.toLowerCase()) && !fixedSkips.test(w);
    const candidates = {};
    const nameRegex = /\b([A-Z][a-z]{2,})((?:\s+[A-Z][a-z]{2,}){0,2})\b/g;
    let match, pi = 0;
    while ((match = nameRegex.exec(text)) !== null) {
      // Trim words that fail the tests from either end of a capitalised run, so "Then Philip
      // Gates" yields "Philip Gates" and "Every Morning" yields nothing.
      let parts = (match[1] + match[2]).split(/\s+/);
      let offset = 0;
      while (parts.length && !passes(parts[0])) { offset += parts[0].length + 1; parts.shift(); }
      while (parts.length && !passes(parts[parts.length - 1])) parts.pop();
      if (!parts.length) continue;
      const name = parts.join(' ');
      const at = match.index + offset;
      const before = text.slice(Math.max(0, at - 8), at);
      const after = text.slice(at + name.length, at + name.length + 3);
      const sentenceInitial = at === 0 || /(?:[.!?\u2026]["\u201D\u2019')\]]*\s+|\n\s*|["\u201C\u2018(\[]\s*|:\s+)$/.test(before);
      const c = candidates[name] || (candidates[name] = { mentions: 0, mid: 0, possessive: 0, paragraphs: new Set(), dialogueCount: 0 });
      c.mentions++;
      if (!sentenceInitial || parts.length > 1) c.mid++;
      if (/^[\u2019']s\b/.test(after)) c.possessive++;
      while (pi < paraBounds.length - 1 && at >= paraBounds[pi].end) pi++;
      c.paragraphs.add(pi);
    }
    // Dialogue attribution (\u2026" Zara said) is direct evidence of a person.
    const dialogueAttr = text.match(/["\u201D]\s*([A-Z][a-z]+)\s+(said|asked|whispered|replied|muttered|exclaimed|shouted|cried)/g) || [];
    dialogueAttr.forEach(d => {
      const nameMatch = d.match(/["\u201D]\s*([A-Z][a-z]+)/);
      if (nameMatch && candidates[nameMatch[1]]) candidates[nameMatch[1]].dialogueCount++;
    });
    const list = Object.entries(candidates)
      .filter(([_, d]) => d.mentions >= 3 && (d.mid >= 2 || d.dialogueCount >= 1 || d.possessive >= 1))
      // Evidence decides whether a word is a name; once it is, how often the book mentions it
      // decides its place. A lead who opens most of her sentences must not rank below a
      // secondary character who happens to sit mid-sentence.
      .sort((a, b) => b[1].mentions - a[1].mentions || (b[1].mid + b[1].dialogueCount + b[1].possessive) - (a[1].mid + a[1].dialogueCount + a[1].possessive))
      .slice(0, 40)
      .map(([name, d]) => ({
        name, mentions: d.mentions, midSentence: d.mid, evidenceCount: d.mid + d.dialogueCount + d.possessive,
        paragraphs: Array.from(d.paragraphs).sort((a, b) => a - b),
        dialogueCount: d.dialogueCount
      }));
    return { list, applicable: true };
  },

  // ========================
  // READER'S PERSPECTIVE
  // ========================
  analyzeReaderPerspective(text, mode, allIssues = [], genre) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const totalWords = text.split(/\s+/).length;
    const lower = text.toLowerCase();
    const isNF = this.isNonfiction(genre);

    // Hook strength - analyze first paragraph + factor in issue density
    const firstPara = paragraphs[0] || '';
    // Base 25 (was 10): the old scale made even decent openings read 0–25/100.
    let hookStrength = 25;
    if (firstPara.includes('?')) hookStrength += 10;
    if ((firstPara.match(/[""\u201C]/g) || []).length > 0) hookStrength += 10;
    if (firstPara.split(/\s+/).length < 50) hookStrength += 5;
    // Short, punchy first sentence is a hook in any genre
    const firstSentence_hook = (text.match(/[^.!?]*[.!?]/) || [''])[0].trim();
    if (firstSentence_hook && firstSentence_hook.split(/\s+/).length <= 12) hookStrength += 8;
    const tensionInOpening = (firstPara.toLowerCase().match(/\b(danger|fear|mystery|secret|death|blood|shadow|dark|strange|suddenly|never|always)\b/g) || []).length;
    if (tensionInOpening > 0) hookStrength += tensionInOpening * 5;
    // Nonfiction: rhetorical hooks (direct address, questions, bold claims)
    if (isNF) {
      const nfHooks = (firstPara.match(/\b(you|your|we|our|must|need|imagine|consider|think|ask yourself)\b/gi) || []).length;
      hookStrength += Math.min(20, nfHooks * 3);
    }
    // Mild penalty for high issue density. Kept small on purpose: issue density already
    // drives the copy/grammar scores — hammering the hook too was double jeopardy that
    // pinned hookStrength at 0 for any verbose manuscript.
    const issuesPerK_hook = allIssues.length / Math.max(totalWords / 1000, 1);
    if (issuesPerK_hook > 20) hookStrength -= 15;
    else if (issuesPerK_hook > 12) hookStrength -= 10;
    else if (issuesPerK_hook > 6) hookStrength -= 5;
    // Check first 3 paragraphs for passive voice and weak verbs (weakens hook)
    const openingText = paragraphs.slice(0, 3).join(' ').toLowerCase();
    const openingPassives = (openingText.match(/\b(was|were)\s+\w+ed\b/g) || []).length;
    const openingAdverbs = (openingText.match(/\w+ly\b/g) || []).length;
    if (openingPassives > 2) hookStrength -= 10;
    if (openingAdverbs > 3) hookStrength -= 5;
    hookStrength = Math.max(0, Math.min(100, hookStrength));

    // Emotional word density — expanded for nonfiction (empowerment, struggle, social justice)
    const fictionEmotions = (lower.match(/\b(love|hate|fear|anger|joy|sadness|grief|terror|hope|despair|rage|jealousy|shame|guilt|pride|longing|anxiety|excitement|dread|relief|sorrow|anguish|fury|bliss|agony|ecstasy|panic|horror)\b/g) || []).length;
    const nfEmotions = isNF ? (lower.match(/\b(struggle|resilience|overcome|empower|transform|courage|strength|dignity|injustice|inequality|vulnerability|determination|sacrifice|perseverance|frustration|exhaustion|survival|freedom|oppression|betrayal|truth|failure|success|suffer|pain|healing|growth|burden|weight)\b/g) || []).length : 0;
    const emotionWords = fictionEmotions + nfEmotions;
    const emotionalConnection = Math.min(100, Math.round(emotionWords / totalWords * 1000 * 10));

    // Page-turner quotient - check for hooks at paragraph breaks
    let hookCount = 0;
    for (let i = 0; i < paragraphs.length - 1; i++) {
      const lastSentence = paragraphs[i].split(/[.!?]/).filter(s => s.trim()).pop() || '';
      const ls = lastSentence.toLowerCase();
      if (ls.includes('?') || ls.includes('but') || ls.includes('however') || ls.includes('suddenly') ||
          ls.includes('then') || ls.includes('until') || /\b(never|always|everything|nothing)\b/.test(ls)) {
        hookCount++;
      }
      // Nonfiction: rhetorical hooks and argument connectors
      if (isNF && (/\b(here'?s?\s+(why|how|what)|the\s+(truth|reality|problem|answer)|consider\s+this|think\s+about|let\s+me|what\s+if|you\s+need|you\s+must)\b/i.test(ls))) {
        hookCount++;
      }
    }
    const pageturnerScore = paragraphs.length > 1 ? Math.min(100, Math.round(hookCount / (paragraphs.length - 1) * 100 * 1.5)) : 50;

    // Engagement score
    const engagementScore = Math.round(hookStrength * 0.3 + pageturnerScore * 0.35 + emotionalConnection * 0.35);

    // Pacing feel
    const avgParaLen = totalWords / Math.max(paragraphs.length, 1);
    let pacingFeel = 'Well-paced';
    if (avgParaLen > 150) pacingFeel = 'Slow - paragraphs are dense, reader may lose focus';
    else if (avgParaLen > 100) pacingFeel = 'Moderate - some sections feel heavy';
    else if (avgParaLen < 30) pacingFeel = 'Rushed - consider developing scenes more';

    // Clarity score — measures how easy the text is to follow
    let clarityScore = 25;
    // Sentence length: readable average = 10-20 words
    const _clSentLens = text.split(/[.!?]+/).filter(s => s.trim()).map(s => s.trim().split(/\s+/).length);
    const _clAvgSent = _clSentLens.reduce((a, b) => a + b, 0) / Math.max(_clSentLens.length, 1);
    if (_clAvgSent >= 10 && _clAvgSent <= 20) clarityScore += 15;
    else if (_clAvgSent < 10) clarityScore += 10;
    else if (_clAvgSent > 30) clarityScore -= 10;
    // Transition words help readers follow the argument
    const _clTrans = (lower.match(/\b(however|therefore|furthermore|because|although|since|instead|also|first|second|finally|next|then|consequently|moreover|specifically|for example|in contrast|as a result|on the other hand)\b/g) || []).length;
    const _clTransPerK = _clTrans / Math.max(totalWords / 1000, 1);
    if (_clTransPerK > 5) clarityScore += 20;
    else if (_clTransPerK > 2) clarityScore += 12;
    else if (_clTransPerK > 1) clarityScore += 5;
    // Short paragraphs (easier to digest)
    const _clShortParas = paragraphs.filter(p => p.split(/\s+/).length < 60).length;
    if (_clShortParas / Math.max(paragraphs.length, 1) > 0.7) clarityScore += 15;
    else if (_clShortParas / Math.max(paragraphs.length, 1) > 0.4) clarityScore += 8;
    // Penalize only genuinely ambiguous pronoun density (not "this"/"that" which are connective)
    const _clAmbigPro = (lower.match(/\b(he|she|they|it)\b/g) || []).length;
    if (_clAmbigPro / Math.max(totalWords, 1) > 0.06) clarityScore -= 10;
    clarityScore = Math.max(0, Math.min(100, clarityScore));

    // Immersion breakers
    const immersionBreakers = [];
    // Info dumps (very long paragraphs with no dialogue)
    paragraphs.forEach((p, i) => {
      const pWords = p.split(/\s+/).length;
      const hasDialogue = /[""\u201C]/.test(p);
      if (pWords > 200 && !hasDialogue) {
        immersionBreakers.push({ text: p.substring(0, 80) + '...', location: `Paragraph ${i+1}`, reason: 'Potential info dump - long paragraph with no dialogue or action' });
      }
    });
    // Over-explaining
    const overExplain = text.match(/\b(in other words|that is to say|what I mean is|to put it another way)\b/gi) || [];
    overExplain.forEach(m => {
      immersionBreakers.push({ text: m, location: 'Various', reason: 'Over-explaining - trust your reader' });
    });

    // Emotional journey
    const emotionMap = { exciting: 0, tense: 0, sad: 0, calm: 0, hopeful: 0 };
    const excitingW = ['exciting','thrill','adventure','rush','incredible','amazing','spectacular','burst','explode','race'];
    const tenseW = ['fear','danger','threat','dark','shadow','knife','death','blood','scream','panic','terror','desperate'];
    const sadW = ['sad','grief','loss','mourn','tear','cry','sorrow','lonely','empty','abandoned','broken'];
    const calmW = ['peace','quiet','gentle','soft','warm','comfort','rest','serene','still','calm','breeze'];
    const hopefulW = ['hope','light','dawn','new','begin','dream','promise','future','believe','together','smile'];
    excitingW.forEach(w => { const m = lower.match(new RegExp(`\\b${w}\\b`, 'g')); if (m) emotionMap.exciting += m.length; });
    tenseW.forEach(w => { const m = lower.match(new RegExp(`\\b${w}\\b`, 'g')); if (m) emotionMap.tense += m.length; });
    sadW.forEach(w => { const m = lower.match(new RegExp(`\\b${w}\\b`, 'g')); if (m) emotionMap.sad += m.length; });
    calmW.forEach(w => { const m = lower.match(new RegExp(`\\b${w}\\b`, 'g')); if (m) emotionMap.calm += m.length; });
    hopefulW.forEach(w => { const m = lower.match(new RegExp(`\\b${w}\\b`, 'g')); if (m) emotionMap.hopeful += m.length; });
    const maxEmotion = Math.max(...Object.values(emotionMap), 1);
    const emotionalJourney = Object.entries(emotionMap).map(([emotion, count]) => ({
      emotion, intensity: Math.round(count / maxEmotion * 100)
    }));

    // DNF Risk - now handled by dedicated analyzeDNF engine
    const dnfRisk = 0; // placeholder, replaced by dnfAnalysis in final output

    // Overall verdict
    let overallVerdict = 'Solid manuscript with good reader engagement.';
    if (engagementScore >= 80) overallVerdict = isNF ? 'Highly engaging! The voice and momentum will carry readers through.' : 'Highly engaging! Readers will have a hard time putting this down.';
    else if (engagementScore >= 60) overallVerdict = isNF ? 'Good engagement overall. Tighten a few sections to keep readers moving chapter to chapter.' : 'Good engagement overall. A few areas could be tightened to keep readers hooked.';
    else if (engagementScore >= 40) overallVerdict = isNF ? 'Moderate engagement. Use more direct address, concrete stories, and clear payoffs per chapter.' : 'Moderate engagement. Consider strengthening hooks, pacing, and emotional resonance.';
    else overallVerdict = isNF ? 'Needs work on engagement. Open with the reader\'s problem, promise a specific outcome, and ground claims in lived examples.' : 'Needs work on engagement. Focus on a stronger opening, clearer stakes, and emotional connection.';

    return { engagementScore, hookStrength, pageturnerScore, emotionalConnection, pacingFeel, clarityScore, immersionBreakers, emotionalJourney, dnfRisk, overallVerdict };
  },

  // ========================
  // GRAMMAR CHECKER (local, no API dependency)
  // Catches what a real human editor would flag:
  // double words, agreement errors, punctuation, tense shifts,
  // dialogue formatting, capitalization, fragments
  // ========================
  findGrammarIssues(text) {
    const issues = [];
    const sentences = text.split(/(?<=[.!?])\s+/);

    // --- 1. DOUBLE WORDS ("the the", "and and") ---
    const doubleRe = /\b(\w{2,})\s+\1\b/gi;
    let dm;
    while ((dm = doubleRe.exec(text)) !== null) {
      // "had had", "that that", and a double object ("gave her her own way") are grammar.
      if (/^(had|that|is|do|was|in|so|no|her|him|them|us|me|you)$/i.test(dm[1])) continue;
      issues.push({
        type: 'grammar', text: dm[0], index: dm.index, length: dm[0].length,
        severity: 'high', confidence: 0.95,
        message: 'Repeated word "' + dm[1] + '." Likely a typo.',
        suggestion: 'Remove the duplicate: "' + dm[1] + '"'
      });
    }

    // --- 2. SUBJECT-VERB AGREEMENT ---
    const agreementPatterns = [
      { re: /\b(he|she|it)\s+(don't)\b/gi, fix: '$1 doesn\'t', msg: '"$2" should be "doesn\'t" with "$1."' },
      { re: /\b(they|we|you)\s+(doesn't)\b/gi, fix: '$1 don\'t', msg: '"$2" should be "don\'t" with "$1."' },
      { re: /\b(he|she|it)\s+(were)\b/gi, fix: '$1 was', msg: '"$2" should be "was" with "$1" (unless subjunctive).' },
      { re: /\b(they|we)\s+(was)\b/gi, fix: '$1 were', msg: '"$2" should be "were" with "$1."' },
      { re: /\b(he|she|it)\s+(have)\s+(?!to\b|a\b|no\b|the\b|been\b)/gi, fix: '$1 has', msg: '"have" should be "has" with "$1."' },
      { re: /\b(I)\s+(has)\b/gi, fix: '$1 have', msg: '"has" should be "have" with "I."' },
      { re: /\b(he|she|it)\s+(are)\b/gi, fix: '$1 is', msg: '"are" should be "is" with "$1."' },
      { re: /\b(I)\s+(is)\b/gi, fix: '$1 am', msg: '"is" should be "am" with "I."' },
    ];
    for (const p of agreementPatterns) {
      let m;
      const r = new RegExp(p.re.source, p.re.flags);
      while ((m = r.exec(text)) !== null) {
        const inDialogue = this._isInsideQuotes(text, m.index);
        if (inDialogue) continue;
        // "as if she were", "I wish it were", "if he were": the subjunctive is correct.
        if (/^were$/i.test(m[2]) && /\b(as if|as though|if|even if|wish|wished|wishes|wishing|suppose|supposing|though|unless|whether|lest)\s*$/i.test(text.slice(Math.max(0, m.index - 24), m.index))) continue;
        const fixed = p.fix.replace('$1', m[1]).replace('$2', m[2]);
        issues.push({
          type: 'grammar', text: m[0], index: m.index, length: m[0].length,
          severity: 'high', confidence: 0.9,
          message: p.msg.replace('$1', m[1]).replace('$2', m[2]),
          suggestion: 'Replace with: "' + fixed + '"'
        });
      }
    }

    // --- 3. CAPITALIZATION AFTER SENTENCE-ENDING PUNCTUATION ---
    const capRe = /([.!?])\s+([a-z])/g;
    let cm;
    while ((cm = capRe.exec(text)) !== null) {
      // Inside speech, "Eh! you mustn't" and "My word! she's" are the speaker's cadence,
      // not a capitalisation error. The agreement rules skip quoted text; so does this one.
      if (this._isInsideQuotes(text, cm.index)) continue;
      const before = text.substring(Math.max(0, cm.index - 15), cm.index + 1);
      if (/\.\.\.$/.test(before)) continue;
      // Single uppercase letter + period (U.S., A.M., D.C.)
      if (/\b[A-Z]\.\s*$/.test(before)) continue;
      // Internal-period abbreviation (Ph.D., e.g., i.e., a.m.)
      if (/\.\w\.$/i.test(before)) continue;
      // Known abbreviations — titles, academic, months, legal, citation
      if (/\b(Mr|Mrs|Ms|Dr|Prof|Rev|Gen|Gov|Rep|Sen|Sgt|Lt|Capt|Maj|Col|Jr|Sr|Hon|Fr|St|vs|etc|al|ed|eds|vol|no|pp|pt|ch|fig|sec|dept|govt|corp|inc|ltd|approx|est|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.\s*$/i.test(before)) continue;
      const charIdx = cm.index + cm[0].length - 1;
      const badChar = text[charIdx];
      issues.push({
        type: 'grammar', text: cm[0], index: cm.index, length: cm[0].length,
        severity: 'medium', confidence: 0.85,
        message: 'Sentence should start with a capital letter.',
        suggestion: 'Capitalize: "' + badChar.toUpperCase() + '"'
      });
    }

    // --- 4. DIALOGUE PUNCTUATION ---
    // Missing comma before dialogue tag: "Hello" he said
    const dtagRe = /([.!?,]?)(["\u201D])\s+(he|she|they|I|we|it|[A-Z][a-z]+)\s+(said|asked|whispered|shouted|yelled|muttered|replied|murmured|growled|hissed|snapped|stammered|called|cried|exclaimed|answered|demanded|pleaded|begged|insisted|warned|suggested|offered|added|continued|began|started|interrupted|responded|acknowledged|admitted|agreed|announced|argued|barked|bellowed|blurted|boasted|breathed|chanted|chided|chimed|choked|clucked|coaxed|commanded|commented|complained|conceded|concluded|confessed|confided|confirmed|croaked|crooned|cursed|declared|denied|drawled|echoed|elaborated|emphasized|encouraged|estimated|explained|faltered|gasped|giggled|gloated|grumbled|grunted|guessed|gulped|huffed|hummed|implored|informed|interjected|joked|lamented|laughed|lectured|lied|lisped|maintained|marveled|mentioned|mimicked|moaned|mocked|mumbled|mused|nagged|narrated|noted|objected|observed|ordered|panted|parroted|persisted|persuaded|piped|pondered|pouted|praised|prayed|pressed|proclaimed|promised|prompted|pronounced|proposed|protested|provoked|purred|quavered|quipped|quoted|ranted|reasoned|recalled|reckoned|recounted|reflected|refused|reminded|repeated|reported|requested|resumed|retorted|revealed|roared|sang|scoffed|scolded|screamed|sighed|slurred|smiled|smirked|sneered|snickered|sniffed|snorted|sobbed|speculated|spluttered|squeaked|squealed|stammered|stated|stuttered|surmised|taunted|teased|threatened|thundered|urged|uttered|ventured|vowed|wailed|warned|wept|whimpered|whined|whispered|wondered|worried|yawned)\b/g;
    let dtm;
    while ((dtm = dtagRe.exec(text)) !== null) {
      if (dtm[1]) continue;
      const fullMatch = dtm[0];
      const qMark = dtm[2];
      issues.push({
        type: 'grammar', text: fullMatch, index: dtm.index, length: fullMatch.length,
        severity: 'medium', confidence: 0.88,
        message: 'Missing comma before dialogue tag.',
        suggestion: 'Add a comma before the closing quote: ...,' + qMark + ' ' + dtm[3] + ' ' + dtm[4]
      });
    }

    // (Its/it's and their/there are handled below in expanded rules 9-10)

    // --- 7. YOUR/YOU'RE ---
    const yourContraction = /\b(your)\s+(going|coming|being|doing|making|getting|running|walking|looking|trying|saying|telling|asking|thinking|feeling|leaving|staying|kidding|joking|wrong|right|welcome|sure|correct|crazy|insane|mad|angry|happy|sad|beautiful|amazing|wonderful|terrible|horrible|fired|hired|invited|finished|done)\b/gi;
    let ycm;
    while ((ycm = yourContraction.exec(text)) !== null) {
      issues.push({
        type: 'grammar', text: ycm[0], index: ycm.index, length: ycm[0].length,
        severity: 'high', confidence: 0.9,
        message: '"Your" is possessive. "You\'re" (you are) is needed here.',
        suggestion: 'Replace with: "you\'re ' + ycm[2] + '"'
      });
    }

    // --- 8. THEN vs THAN ---
    const thenComp = /\b(more|less|better|worse|bigger|smaller|taller|shorter|faster|slower|older|younger|harder|easier|stronger|weaker|greater|fewer|higher|lower|rather|other)\s+then\b/gi;
    let tcm;
    while ((tcm = thenComp.exec(text)) !== null) {
      issues.push({
        type: 'grammar', text: tcm[0], index: tcm.index, length: tcm[0].length,
        severity: 'high', confidence: 0.92,
        message: '"Then" is about time. "Than" is for comparisons.',
        suggestion: 'Replace with: "' + tcm[1] + ' than"'
      });
    }

    // --- 9. THEIR vs THERE / THEY'RE ---
    const theirAre = /\b(their)\s+(is|are|was|were|isn't|aren't|wasn't|weren't)\b/gi;
    let tam;
    while ((tam = theirAre.exec(text)) !== null) {
      issues.push({
        type: 'grammar', text: tam[0], index: tam.index, length: tam[0].length,
        severity: 'high', confidence: 0.9,
        message: '"Their" is possessive. "There" is needed before "' + tam[2] + '".',
        suggestion: 'Replace with: "there ' + tam[2] + '"'
      });
    }

    // --- 10. ITS vs IT'S — expanded coverage ---
    const itsExpanded = /\bit's\s+(own|way|place|name|color|colour|shape|size|tail|head|body|eyes|purpose|meaning|value|weight|surface|edge|base|end|core|peak|center|contents|nature|origin|source|beauty|power|strength|potential|limits|boundaries|essence|impact|effect|form|function|role|structure|design|style|presence|absence|focus|direction|path|course|tone|voice|message|image|history|future|fate|mark|shadow|reflection|influence|title|version|appearance|opposite|equivalent|replacement|cost|price|worth|depth|width|height|length|beginning|middle|bottom|top|front|back|side|interior|exterior|surface|texture|scent|smell|taste|sound|rhythm|pattern|frequency|range|scope|scale|context|significance|relevance|implications|consequences|limitations|features|properties|qualities|characteristics|components|elements|ingredients|origins|roots|foundation|framework|capacity|ability|tendency|habit|behavior|behaviour|personality|identity|legacy|reputation|appeal|charm|magic|mystery|secret|weakness|flaw|fault|downfall|undoing|demise|destruction|survival|existence|birth|death|arrival|departure|return|presence|domain|territory|realm|kingdom|world|environment|habitat|nest|lair|den|home|shelter|cover|skin|shell|hull|armor|armour|frame|skeleton|spine|backbone|flesh|blood|breath|heartbeat|pulse|soul|spirit|ghost|memory|shadow|echo)\b/gi;
    let itsm;
    while ((itsm = itsExpanded.exec(text)) !== null) {
      issues.push({
        type: 'grammar', text: itsm[0], index: itsm.index, length: itsm[0].length,
        severity: 'high', confidence: 0.92,
        message: '"It\'s" means "it is." For possession, use "its" (no apostrophe).',
        suggestion: 'Replace with: "its ' + itsm[1] + '"'
      });
    }

    // --- 11. MISSING APOSTROPHE IN COMMON CONTRACTIONS ---
    const contractionRe = /\b(dont|wont|cant|didnt|doesnt|isnt|wasnt|arent|werent|wouldnt|couldnt|shouldnt|hasnt|havent|hadnt|aint|mustnt|neednt|theres|wheres|thats|heres|whos|whats|theyre|youre|weve|theyd|youd|itll|theyll|youll|wholl)\b/gi;
    let crm;
    while ((crm = contractionRe.exec(text)) !== null) {
      const inQ = this._isInsideQuotes(text, crm.index);
      if (inQ) continue;
      const word = crm[1];
      const fixMap = {
        dont:"don't",wont:"won't",cant:"can't",didnt:"didn't",doesnt:"doesn't",
        isnt:"isn't",wasnt:"wasn't",arent:"aren't",werent:"weren't",
        wouldnt:"wouldn't",couldnt:"couldn't",shouldnt:"shouldn't",
        hasnt:"hasn't",havent:"haven't",hadnt:"hadn't",aint:"ain't",
        mustnt:"mustn't",neednt:"needn't",
        theres:"there's",wheres:"where's",thats:"that's",heres:"here's",
        whos:"who's",whats:"what's",theyre:"they're",
        youre:"you're",weve:"we've",theyd:"they'd",youd:"you'd",
        itll:"it'll",theyll:"they'll",youll:"you'll",wholl:"who'll"
      };
      issues.push({
        type: 'grammar', text: word, index: crm.index, length: word.length,
        severity: 'medium', confidence: 0.93,
        message: 'Missing apostrophe in contraction.',
        suggestion: 'Replace with: "' + fixMap[word] + '"'
      });
    }

    // --- 12. TENSE CONSISTENCY — REMOVED ---
    // The -ed regex matched adjectives (excited, limited, adapted) as past-tense
    // verbs, producing hundreds of false positives in nonfiction where authors
    // intentionally mix past narration with present analysis. Removed entirely.

    return issues;
  },

  _isInsideQuotes(text, index) {
    let inSingle = false, inDouble = false, inSmart = false;
    for (let i = 0; i < index && i < text.length; i++) {
      const c = text[i];
      if (c === '"' && !inSingle) inDouble = !inDouble;
      else if (c === "'" && !inDouble && (i === 0 || /\s/.test(text[i-1]))) inSingle = !inSingle;
      else if (c === '“') inSmart = true;
      else if (c === '”') inSmart = false;
    }
    return inDouble || inSingle || inSmart;
  },

  // ========================
  // DEEP WRITING QUALITY ENGINE
  // Measures: clarity, discipline, efficiency, engagement
  // ========================
  analyzeWritingQuality(text, issues, sentenceVariety, readability, dialogue, style, genre) {
    const words = text.match(/\b\w+\b/g) || [];
    const totalWords = words.length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const lower = text.toLowerCase();
    const isNF = this.isNonfiction(genre);
    const fillerWeight = isNF ? 0.4 : 1; // self-help uses "simply", "actually" rhetorically

    // === CLARITY (is the writing direct and easy to follow?) ===
    let clarityScore = 20;
    const modifierStacks = (text.match(/\b\w+ly\s+\w+ly\b/gi) || []).length;
    const modifierStackRate = modifierStacks / Math.max(totalWords, 1) * 1000;
    const pronouns = (lower.match(/\b(he|she|it|they|them|this|that)\b/g) || []).length;
    const pronounRatio = pronouns / Math.max(totalWords, 1);
    const weakOpenings = (text.match(/(?:^|\.\s+)(It was|There was|There were|It is|There is)\b/gi) || []).length;
    const overComma = sentences.filter(s => (s.match(/,/g) || []).length >= 4).length;
    const punchySentences = sentences.filter(s => s.trim().split(/\s+/).length <= 6).length;
    const punchyRatio = punchySentences / Math.max(sentences.length, 1);
    // All penalties below are RATE-based (per 1000 words / per sentence) and individually
    // capped. A raw-count penalty (e.g. "weakOpenings * 4") is fine on a 2,000-word sample
    // but catastrophic on a 70,000-word manuscript — 230 weak openings × 4 = -920, which
    // floors Clarity to 0 regardless of every other signal. Capping each term keeps one
    // heuristic from being able to zero out the whole score on a long document.
    if (modifierStackRate < 0.3) clarityScore += 15; else clarityScore -= Math.min(20, (modifierStackRate - 0.3) * 10);
    // Pronoun penalty: "this" and "that" are connective in nonfiction, not unclear references.
    // For nonfiction, only penalize he/she/they/it ambiguity. For fiction, keep full list.
    const _wqProThreshold = isNF ? 0.10 : 0.08;
    const _wqProPenalty = isNF ? 200 : 400;
    if (pronounRatio < 0.06) clarityScore += 15; else if (pronounRatio < _wqProThreshold) clarityScore += 8; else clarityScore -= Math.min(20, (pronounRatio - _wqProThreshold) * _wqProPenalty);
    const weakOpeningRate = weakOpenings / Math.max(sentences.length, 1);
    if (weakOpeningRate < 0.02) clarityScore += 15; else clarityScore -= Math.min(20, (weakOpeningRate - 0.02) * 300);
    const overCommaRate = overComma / Math.max(sentences.length, 1);
    if (overCommaRate < 0.05) clarityScore += 10; else clarityScore -= Math.min(15, (overCommaRate - 0.05) * 150);
    if (punchyRatio > 0.15) clarityScore += 15; else if (punchyRatio > 0.08) clarityScore += 8;

    let disciplineScore = 15;
    const fillersRaw = (lower.match(/\b(very|really|quite|rather|somewhat|basically|actually|literally|just|simply|perhaps|maybe|slightly|a bit|sort of|kind of|a little|in fact|of course|to be honest|needless to say)\b/g) || []).length;
    const fillers = fillersRaw * fillerWeight; // soften for nonfiction
    const fillerRate = fillers / Math.max(totalWords, 1) * 1000;
    const redundants = (lower.match(/\b(each and every|first and foremost|full and complete|true and accurate|null and void|various and sundry|cease and desist|aid and abet|ways and means)\b/g) || []).length;
    const hedges = (lower.match(/\b(seemed to|appeared to|began to|started to|tried to|managed to|proceeded to|happened to|continued to)\b/g) || []).length;
    const allVerbs = (lower.match(/\b(was|were|is|are|had|has|have|did|does|do|got|get|went|go|came|come|made|make|said|took|take)\b/g) || []).length;
    const strongVerbRatio = 1 - (allVerbs / Math.max(totalWords, 1));
    if (fillerRate < 3) disciplineScore += 25; else if (fillerRate < 8) disciplineScore += 15; else if (fillerRate < 15) disciplineScore += 5; else disciplineScore -= Math.min(25, fillerRate * 2);
    const redundantRate = redundants / Math.max(totalWords, 1) * 1000;
    if (redundants === 0) disciplineScore += 10; else disciplineScore -= Math.min(15, redundantRate * 20);
    const hedgeRate = hedges / Math.max(totalWords, 1) * 1000;
    if (hedgeRate < 1) disciplineScore += 15; else if (hedgeRate < 3) disciplineScore += 8; else disciplineScore -= Math.min(20, hedgeRate * 3);
    if (strongVerbRatio > 0.95) disciplineScore += 20; else if (strongVerbRatio > 0.9) disciplineScore += 12; else if (strongVerbRatio > 0.85) disciplineScore += 5;

    let efficiencyScore = 20;
    const wordyCount = issues.filter(i => i.type === 'wordy').length;
    const wordyRate = wordyCount / Math.max(totalWords, 1) * 1000;
    const overExplain = (lower.match(/\b(in other words|that is to say|what this means is|to put it simply|as mentioned before|as we have seen|it should be noted that|it is worth noting)\b/g) || []).length;
    const overExplainRate = overExplain / Math.max(totalWords, 1) * 1000;
    const stageDir = (lower.match(/\b(he turned and|she turned and|he looked at|she looked at|he walked to|she walked to|he sat down|she sat down|he stood up|she stood up|he reached for|she reached for)\b/g) || []).length;
    const stageDirRate = stageDir / Math.max(totalWords, 1) * 1000;
    const avgParaWords = totalWords / Math.max(paragraphs.length, 1);
    if (wordyRate < 1) efficiencyScore += 20; else if (wordyRate < 3) efficiencyScore += 12; else efficiencyScore -= Math.min(20, wordyRate * 3);
    if (overExplain === 0) efficiencyScore += 15; else efficiencyScore -= Math.min(15, overExplainRate * 15);
    if (stageDir === 0) efficiencyScore += 10; else efficiencyScore -= Math.min(15, stageDirRate * 10);
    if (avgParaWords < 80) efficiencyScore += 15; else if (avgParaWords < 120) efficiencyScore += 8; else if (avgParaWords > 180) efficiencyScore -= 15;

    let engagementScore = 15;
    const questions = (text.match(/\?/g) || []).length;
    if (isNF) {
      // Nonfiction engagement is rhetorical, not dramatic: direct address, questions,
      // stories/examples, concrete evidence. The fiction branch below penalizes
      // "paragraphs without dialogue" \u2014 which floored every self-help book to 0.
      const directAddressRate = (lower.match(/\byou\b|\byour\b/g) || []).length / Math.max(totalWords, 1) * 1000;
      const exampleMarkers = (lower.match(/\b(for example|for instance|imagine|consider|picture this|case in point|let me tell you|i remember|when i was|a client|a student|a reader|research shows|studies show|one study|true story)\b/g) || []).length;
      const exampleRate = exampleMarkers / Math.max(totalWords, 1) * 1000;
      const numberFacts = (text.match(/\b\d+(\.\d+)?%?\b/g) || []).length;
      if (directAddressRate > 8) engagementScore += 25; else if (directAddressRate > 3) engagementScore += 15; else if (directAddressRate > 1) engagementScore += 8;
      engagementScore += Math.min(15, Math.round(questions / Math.max(totalWords / 1000, 1) * 3));
      if (exampleRate > 1) engagementScore += 25; else if (exampleRate > 0.4) engagementScore += 15; else if (exampleMarkers > 0) engagementScore += 8;
      if (numberFacts / Math.max(totalWords, 1) * 1000 > 1) engagementScore += 10;
    } else {
      const infoDumps = paragraphs.filter(p => p.split(/\s+/).length > 200 && !/[\u201C""]/.test(p)).length;
      let noDialogueStreak = 0, maxStreak = 0;
      paragraphs.forEach(p => { if (!/[\u201C""]/.test(p)) { noDialogueStreak++; maxStreak = Math.max(maxStreak, noDialogueStreak) } else { noDialogueStreak = 0 } });
      const sensory = (lower.match(/\b(smell|taste|touch|sound|sight|heard|felt|warm|cold|rough|smooth|bitter|sweet|sharp|soft|bright|dim|loud|quiet|whisper|roar|glimmer|shadow|echo)\b/g) || []).length;
      const sensoryRate = sensory / Math.max(totalWords, 1) * 1000;
      const emotionTags = (text.match(/[\u201D""]\s*\w+\s+(angrily|sadly|happily|nervously|excitedly|furiously|quietly|loudly|softly|tearfully|breathlessly)/gi) || []).length;
      if (infoDumps === 0) engagementScore += 15; else engagementScore -= infoDumps * 8;
      if (maxStreak <= 3) engagementScore += 15; else if (maxStreak <= 5) engagementScore += 5; else engagementScore -= (maxStreak - 5) * 4;
      if (questions > 0) engagementScore += Math.min(12, questions * 2);
      if (sensoryRate > 5) engagementScore += 15; else if (sensoryRate > 3) engagementScore += 10; else if (sensoryRate > 1) engagementScore += 5;
      engagementScore -= emotionTags * 4;
      const hasDialogueEng = paragraphs.some(p => /[\u201C""]/.test(p));
      if (hasDialogueEng) engagementScore += 8;
    }

    let dialogueQuality = (dialogue.score == null) ? 70 : dialogue.score; // neutral default for nonfiction N/A
    if (dialogue.count > 0 && dialogue.saidRatio > 60 && dialogue.saidRatio < 90) dialogueQuality += 5;
    if (dialogue.count > 0 && dialogue.saidRatio < 30) dialogueQuality -= 10;
    dialogueQuality = Math.min(100, Math.max(0, dialogueQuality));

    let momentumScore = 20;
    let _wqDetailExtras = {};
    if (isNF) {
      // Nonfiction momentum is structural cadence, not car chases: section headings,
      // transitional signposts, actionable imperatives, digestible paragraphs.
      const nfHeadings = (text.match(/^(chapter|part|step|rule|principle|lesson|habit|law|key)\b[^\n]*$/gim) || []).length;
      const signposts = (lower.match(/\b(first|second|third|next|then|finally|here's the point|the point is|which means|bottom line|in short|the takeaway)\b/g) || []).length;
      const signpostRate = signposts / Math.max(totalWords, 1) * 1000;
      const imperatives = (text.match(/(?:^|\.\s+)(Start|Stop|Try|Ask|Write|List|Take|Choose|Pick|Set|Make|Do|Think|Remember|Notice|Practice|Focus)\b/g) || []).length;
      const imperativeRate = imperatives / Math.max(totalWords, 1) * 1000;
      if (nfHeadings > 2) momentumScore += 15; else if (nfHeadings > 0) momentumScore += 8;
      if (signpostRate > 3) momentumScore += 25; else if (signpostRate > 1.5) momentumScore += 15; else if (signpostRate > 0.5) momentumScore += 8;
      if (imperativeRate > 1.5) momentumScore += 25; else if (imperativeRate > 0.5) momentumScore += 15; else if (imperatives > 0) momentumScore += 8;
      if (avgParaWords < 110) momentumScore += 10;
      _wqDetailExtras = { signposts, imperatives, sectionHeadings: nfHeadings };
    } else {
      const backstory = (lower.match(/\b(he remembered|she remembered|years ago|back when|it had been|there had been|used to be|once upon a time|long ago|in those days)\b/g) || []).length;
      const backstoryRate = backstory / Math.max(totalWords, 1) * 1000;
      const sceneBreaks = (text.match(/\n\s*\*\s*\*\s*\*|\n\s*#|\n\s*---/g) || []).length;
      const actionVerbs = (lower.match(/\b(ran|grabbed|turned|slammed|pushed|pulled|threw|shouted|raced|lunged|leaped|opened|decided|chose|moved|stepped|spoke|asked|demanded|refused)\b/g) || []).length;
      const actionRate = actionVerbs / Math.max(totalWords, 1) * 1000;
      if (backstoryRate < 0.5) momentumScore += 20; else if (backstoryRate < 1.5) momentumScore += 10; else momentumScore -= backstory * 4;
      if (sceneBreaks > 0) momentumScore += 10;
      if (actionRate > 5) momentumScore += 20; else if (actionRate > 2) momentumScore += 12; else if (actionRate > 1) momentumScore += 5;
      if (paragraphs.some(p => /[“""]/.test(p))) momentumScore += 10;
      _wqDetailExtras = { backstoryMarkers: backstory };
    }

    // Clamp all scores
    clarityScore = Math.min(100, Math.max(0, Math.round(clarityScore)));
    disciplineScore = Math.min(100, Math.max(0, Math.round(disciplineScore)));
    efficiencyScore = Math.min(100, Math.max(0, Math.round(efficiencyScore)));
    engagementScore = Math.min(100, Math.max(0, Math.round(engagementScore)));
    momentumScore = Math.min(100, Math.max(0, Math.round(momentumScore)));

    const overall = Math.round(clarityScore * 0.25 + disciplineScore * 0.2 + efficiencyScore * 0.2 + engagementScore * 0.2 + momentumScore * 0.15);

    return {
      overall, clarityScore, disciplineScore, efficiencyScore, engagementScore, dialogueQuality, momentumScore,
      details: {
        fillerWords: fillers, hedgeWords: hedges, weakOpenings,
        modifierStacks, overExplain,
        punchySentences,
        avgParagraphLength: Math.round(avgParaWords),
        pronounDensity: Math.round(pronounRatio * 100),
        fillerRate: Math.round(fillerRate * 10) / 10,
        ..._wqDetailExtras
      }
    };
  },

  // ========================
  // TRUE LINE EDITING ENGINE
  // Evaluates: tone consistency, sentence flow, word precision,
  // pacing rhythm, POV discipline, extraneous language, paragraph
  // transitions at the sentence level
  // ========================
  analyzeLineEditing(text, genre) {
    const isNF=this.isNonfiction(genre);
    const sentences=(text.match(/[^.!?]+[.!?]+/g)||[]).map(s=>s.trim()).filter(Boolean);
    const paragraphs=text.split(/\n\s*\n/).filter(p=>p.trim());
    const words=text.match(/\b[\w’'-]+\b/g)||[];
    const totalWords=words.length;
    if(sentences.length<3) return {score:null,applicable:false,tone:{score:null},flow:{score:null},precision:{score:null},pacing:{score:null},pov:{score:null},extraneous:{score:null},findings:[]};
    const findings=[];
    const perK=n=>n/Math.max(totalWords,1)*1000;
    const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
    const sd=a=>{const m=mean(a);return a.length?Math.sqrt(a.reduce((n,v)=>n+(v-m)**2,0)/a.length):0};
    const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));

    // Tone: report observable register mixing. Formal/casual vocabulary is not inherently
    // good or bad; only unusually dense mixing creates a modest consistency penalty.
    const lower=text.toLowerCase();
    const formal=(lower.match(/\b(nevertheless|furthermore|notwithstanding|henceforth|whereby|therein|aforementioned|commenced|endeavored|subsequently|utilized|ascertained|pursuant|heretofore)\b/g)||[]).length;
    const casual=(lower.match(/\b(gonna|wanna|gotta|kinda|sorta|stuff|cool|awesome|totally|basically|literally|super|pretty much|you know)\b/g)||[]).length;
    const registerMix=Math.min(formal,casual);
    const registerMixRate=perK(registerMix);
    let toneScore=clamp(100-Math.min(35,registerMixRate*8));
    if(registerMixRate>1) findings.push({type:'tone',severity:'low',count:registerMix,ratePerK:+registerMixRate.toFixed(2),message:registerMix+' mixed-register signals ('+registerMixRate.toFixed(1)+' per 1K words). Review them in context; intentional voice shifts may be valid.'});

    // Flow: lexical continuity is a signal, not proof of smoothness. Remove the old
    // assumption that zero repeated 4+ letter words means a sentence transition is bad.
    const stop=new Set('the a an and or but of to in on at for from with by as is are was were be been being it this that these those he she they we you i his her their our your my not no do did does have has had'.split(' '));
    const cw=s=>(s.toLowerCase().match(/\b[a-z]{4,}\b/g)||[]).filter(w=>!stop.has(w));
    const connector=/^(but|and|so|then|yet|still|however|meanwhile|instead|also|furthermore|besides|next|after|before|later|now|finally|therefore|because|although|while)\b/i;
    let unsupported=0;
    const flowEvidence=[];
    for(let i=1;i<sentences.length;i++){
      const a=cw(sentences[i-1]),b=cw(sentences[i]),aset=new Set(a),shared=[...new Set(b.filter(w=>aset.has(w)))];
      const hasConnector=connector.test(sentences[i]);
      const supported=hasConnector||shared.length>0;
      if(!supported) unsupported++;
      if(!supported&&flowEvidence.length<20) flowEvidence.push({fromSentence:i,toSentence:i+1,excerpt:sentences[i].slice(0,140)});
    }
    const unsupportedRate=unsupported/Math.max(sentences.length-1,1)*100;
    // Word overlap between adjacent sentences is not a test of flow in any register: a
    // published novel runs near 80% "unsupported" and floored at the maximum penalty. The
    // counts stay as description; nothing is scored on them.
    const flowScore=null;

    // Precision: normalize all penalties by manuscript length. Common words are candidates,
    // not automatically "bad"; the score responds only to unusually high density.
    const vagueMatches=lower.match(/\b(thing|things|stuff|something|somehow|somewhat|somewhere|nice|good|bad|big|small|very|really|quite|rather|pretty|got|get|went|came|made|did)\b/g)||[];
    const vagueRate=perK(vagueMatches.length);
    const redundant=lower.match(/\b(completely destroyed|totally ruined|very unique|absolutely perfect|completely finished|totally dead|very essential|extremely crucial|quite obvious|absolutely necessary)\b/g)||[];
    const redundantRate=perK(redundant.length);
    let precisionScore=clamp(100-Math.min(45,Math.max(0,vagueRate-12)*1.5)-Math.min(20,redundantRate*5));
    if(vagueRate>20) findings.push({type:'precision',severity:'medium',count:vagueMatches.length,ratePerK:+vagueRate.toFixed(1),message:vagueMatches.length+' broad/imprecise-word candidates ('+vagueRate.toFixed(1)+' per 1K words). Review flagged passages; do not replace mechanically.'});
    if(redundant.length) findings.push({type:'precision',severity:'low',count:redundant.length,ratePerK:+redundantRate.toFixed(1),message:redundant.length+' potentially redundant modifier phrase'+(redundant.length===1?'':'s')+' detected.'});

    // Pacing rhythm: sentence-length variation is descriptive. Penalize only extreme
    // uniformity; do not declare 5–12 words of standard deviation universally "ideal."
    const lengths=sentences.map(s=>(s.match(/\b[\w’'-]+\b/g)||[]).length).filter(Boolean);
    const avgLen=mean(lengths), stdDev=sd(lengths);
    // A dialogue paragraph carries a spoken line (capital after the quote, punctuation before the close), not merely a quoted term.
    const dialogueParas=paragraphs.filter(p=>/["\u201C][A-Z][^"\u201D\n]{18,}[.,!?\u2026][\u201D"]/.test(p));
    const longDialogue=dialogueParas.filter(p=>(p.match(/\b[\w’'-]+\b/g)||[]).length>100);
    let pacingScore=100;
    if(lengths.length>=10&&stdDev<2.5) pacingScore-=30;
    else if(lengths.length>=10&&stdDev<4) pacingScore-=15;
    const longDialogueRate=longDialogue.length/Math.max(dialogueParas.length,1)*100;
    if(dialogueParas.length>=3&&longDialogueRate>30) pacingScore-=Math.min(25,Math.round(longDialogueRate/3));
    pacingScore=clamp(pacingScore);
    if(stdDev<4&&lengths.length>=10) findings.push({type:'pacing',severity:'low',message:'Sentence-length variation is low (SD '+stdDev.toFixed(1)+'). Review rhythm in context rather than targeting a fixed sentence length.'});
    if(longDialogue.length) findings.push({type:'pacing',severity:'low',count:longDialogue.length,message:longDialogue.length+' dialogue paragraph'+(longDialogue.length===1?'':'s')+' exceed 100 words; inspect for monologue density.'});

    // POV: pronoun ratios cannot prove a POV violation. Preserve them as descriptive
    // telemetry and only surface candidate mixed-narration passages for fiction.
    const narration=text.replace(/[“"][^”"\n]{0,600}[”"]/g,' ');
    const first=(narration.match(/\b(I|me|my|mine|myself)\b/g)||[]).length;
    const second=(narration.match(/\b(you|your|yours|yourself|yourselves)\b/gi)||[]).length;
    const third=(narration.match(/\b(he|she|him|her|his|hers)\b/gi)||[]).length;
    const totalPronouns=Math.max(first+second+third,1);
    const shares={first:first/totalPronouns,second:second/totalPronouns,third:third/totalPronouns};
    const dominant=Object.entries(shares).sort((a,b)=>b[1]-a[1])[0][0];
    const sorted=Object.values(shares).sort((a,b)=>b-a);
    // A first-person narrator who describes other people uses "he" and "she" constantly;
    // a pronoun mix cannot tell that from a slip. The shares are reported, not scored.
    const mixedNarration=!isNF&&totalPronouns>=30&&sorted[0]<0.7&&sorted[1]>0.2;
    const povScore=null;

    // Extraneous language: length-normalized candidate density. "That" and dialogue tags
    // are not automatically errors, so they remain telemetry instead of fixed penalties.
    const filterMatches=lower.match(/\b(began to|started to|proceeded to|continued to|attempted to|happened to|managed to)\b/g)||[];
    const filterRate=perK(filterMatches.length);
    const thatCount=(lower.match(/\bthat\b/g)||[]).length;
    const thatRate=perK(thatCount);
    let extraneousScore=clamp(100-Math.min(40,Math.max(0,filterRate-2)*6));
    if(filterRate>3) findings.push({type:'extraneous',severity:'low',count:filterMatches.length,ratePerK:+filterRate.toFixed(1),message:filterMatches.length+' filter-phrase candidates ('+filterRate.toFixed(1)+' per 1K words). Review for places where the direct verb is stronger.'});

    const dims=[toneScore,precisionScore,pacingScore,extraneousScore];
    const score=clamp(mean(dims));
    return {
      score,applicable:true,
      methodology:'Evidence-normalized line-editing model over tone, precision, rhythm and extraneous language; counts are normalized by manuscript length. Sentence continuity and POV are described, not scored.',
      tone:{score:toneScore,formalWords:formal,casualWords:casual,registerMix,registerMixRate:+registerMixRate.toFixed(2)},
      flow:{score:flowScore,advisory:true,unsupportedBoundaries:unsupported,unsupportedRate:+unsupportedRate.toFixed(1),evidence:flowEvidence},
      precision:{score:precisionScore,vagueWords:vagueMatches.length,vagueRatePerK:+vagueRate.toFixed(1),redundantMods:redundant.length,redundantRatePerK:+redundantRate.toFixed(1)},
      pacing:{score:pacingScore,avgSentenceLength:+avgLen.toFixed(1),stdDev:+stdDev.toFixed(1),longDialogueParagraphs:longDialogue.length,longDialogueRate:+longDialogueRate.toFixed(1)},
      pov:{score:povScore,advisory:true,dominant,firstPerson:first,secondPerson:second,thirdPerson:third,shares:{first:Math.round(shares.first*100),second:Math.round(shares.second*100),third:Math.round(shares.third*100)},mixedCandidate:mixedNarration},
      extraneous:{score:extraneousScore,filterPhrases:filterMatches.length,filterRatePerK:+filterRate.toFixed(1),thatCount,thatRatePerK:+thatRate.toFixed(1)},
      findings
    };
  },

  // ========================
  // BLURB ENGINE
  // Extracts story elements using the 6-question framework,
  // then assembles 5 blurb variations. Only runs in book mode.
  // ========================
  // ========================
  // SCENE EMOTION DETECTOR
  // Tags segments with emotion emojis for fun visual feedback
  // ========================
  detectSceneEmotions(text) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const scenes = [];
    const lower = text.toLowerCase();

    const emotionPatterns = {
      spicy: { emoji: '🌶️', label: 'Spicy', color: '#e74c3c', words: ['kiss','kissed','kissing','lips','caress','caressed','desire','passion','passionate','embrace','embraced','intimate','naked','undressed','skin against','breath quickened','moaned','whispered against','pulled closer','bodies','bedroom','between the sheets','made love','lovemaking','aroused','seduced','seductive','heat between','trembled under'] },
      fight: { emoji: '⚔️', label: 'Battle', color: '#e67e22', words: ['fight','fought','punch','punched','kicked','sword','blade','weapon','attack','attacked','battle','war','blood','wound','wounded','struck','slammed','crashed','dodged','blocked','parried','swung','charged','shield','arrow','gunshot','explosion','combat','wrestle','strangled','choked'] },
      sad: { emoji: '💔', label: 'Heartbreak', color: '#3498db', words: ['cried','sobbed','tears','weeping','grief','mourned','loss','died','death','funeral','grave','buried','heartbroken','devastated','empty','hollow','ache','ached','lonely','abandoned','goodbye','farewell','never see','lost forever','held back tears'] },
      scary: { emoji: '😱', label: 'Terror', color: '#8e44ad', words: ['scream','screamed','terror','terrified','horror','blood','dark','shadow','creature','monster','ghost','haunted','nightmare','dread','feared','lurking','stalking','chased','trapped','escape','panic','frozen with fear','heart pounding','couldn\'t breathe','eyes wide'] },
      funny: { emoji: '😂', label: 'Comedy', color: '#f1c40f', words: ['laughed','laughing','hilarious','ridiculous','absurd','joke','grinned','chuckled','snorted','giggled','funny','comedy','prank','stumbled','tripped','embarrassed','awkward','blurted','oops','clumsy','face turned red'] },
      mystery: { emoji: '🔍', label: 'Mystery', color: '#1abc9c', words: ['clue','discovered','secret','hidden','mysterious','strange','puzzle','evidence','investigate','suspicious','disappear','vanished','unknown','cryptic','riddle','suspect','alibi','detective','trail','traced'] },
      triumph: { emoji: '🏆', label: 'Triumph', color: '#f39c12', words: ['victory','won','triumph','conquered','overcame','succeeded','achieved','celebrated','cheered','finally','at last','made it','proud','glory','champion','hero','saved','rescued','breakthrough'] },
      tender: { emoji: '🤗', label: 'Tender', color: '#e91e63', words: ['held','hugged','gentle','softly','whispered','comforted','safe','warm','smiled','together','hand in hand','leaned against','stroked','forehead','protected','cradled','loved','i love you','you matter','not alone'] },
      danger: { emoji: '⚡', label: 'Danger', color: '#e74c3c', words: ['danger','dangerous','threat','bomb','explosion','deadline','countdown','ticking','chase','chased','running','escape','life or death','survive','trap','ambush','cornered','no way out','hurry'] },
      revelation: { emoji: '💡', label: 'Revelation', color: '#9b59b6', words: ['realized','revelation','truth','discovered','suddenly understood','everything clicked','the answer','it all made sense','couldn\'t believe','secret revealed','unmasked','exposed','the real','all along','never knew'] }
    };

    paragraphs.forEach((para, idx) => {
      const pl = para.toLowerCase();
      let bestEmotion = null;
      let bestCount = 0;

      for (const [emotion, data] of Object.entries(emotionPatterns)) {
        const hits = data.words.filter(w => pl.includes(w)).length;
        if (hits > bestCount) { bestCount = hits; bestEmotion = emotion; }
      }

      if (bestEmotion && bestCount >= 2) {
        const data = emotionPatterns[bestEmotion];
        scenes.push({
          paragraph: idx + 1,
          emotion: bestEmotion,
          emoji: data.emoji,
          label: data.label,
          color: data.color,
          intensity: Math.min(3, bestCount), // 1-3 scale
          preview: para.substring(0, 80) + (para.length > 80 ? '...' : '')
        });
      }
    });

    return { scenes, total: scenes.length };
  },

  // ========================
  // OPENING DIAGNOSIS ENGINE
  // Analyzes the first ~500 words for specific weakness patterns
  // Scans for section headings so the writer can identify where their book actually begins.
  // Returns an array of { label, index } sorted by position. No magic inference — just headings.
  detectSections(text) {
    const pattern = /^[ \t]*(chapter\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|[ivxlc]+)|part\s+(?:\d+|one|two|three|four|[ivxlc]+)|prologue|epilogue|introduction|preface|foreword|afterword|conclusion|interlude|section\s+\d+|act\s+(?:\d+|one|two|three)|scene\s+\d+|note from the author|author'?s?\s+note|about the author|acknowledgments?)[ \t]*$/gim;
    const seen = new Set();
    const results = [];
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const raw = m[0].trim();
      const label = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
      const key = label.toLowerCase();
      if (!seen.has(key)) { seen.add(key); results.push({ label: label.substring(0, 60), index: m.index }); }
    }
    return results;
  },

  // and provides genre-aware improvement strategies
  // ========================
  diagnoseOpening(text, genre) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const opening = paragraphs.slice(0, Math.min(5, paragraphs.length)).join('\n\n');
    const openingLower = opening.toLowerCase();
    const firstSentence = (text.match(/[^.!?]*[.!?]/)||[''])[0].trim();
    const firstPara = (paragraphs[0] || '').trim();
    const firstParaWords = firstPara.split(/\s+/).length;

    const problems = [];
    const strategies = [];

    // === DETECT ANTI-PATTERNS ===

    // 1. Weather opening ("It was a dark and stormy night")
    if (/^(it was|the sun|the rain|the wind|the sky|the clouds|the fog|the snow|the storm|outside|the weather)/i.test(firstSentence)) {
      problems.push({ id: 'weather', severity: 'high', title: 'Weather Opening', desc: 'Starting with weather is one of the most common weak openings. It tells the reader about the setting before giving them a reason to care about anyone in it.', fix: 'Start with a character doing something, or open with dialogue. Let weather emerge naturally as part of the scene.' });
    }

    // 2. Waking up / morning routine
    if (/^(.*?(woke up|woke to|opened (his|her|their) eyes|alarm|morning|the alarm|rolled over|got out of bed|stretched|yawned))/i.test(firstPara)) {
      problems.push({ id: 'waking', severity: 'high', title: 'Waking Up Opening', desc: 'Opening with a character waking up signals that nothing interesting is happening yet. The reader is waiting for the story to actually start.', fix: 'Start at the moment something changes. Skip the morning routine and drop the reader into the first conflict or tension.' });
    }

    // 3. Backstory dump (opening is all exposition, no action or dialogue)
    const hasDialogue = /[""\u201C]/.test(firstPara);
    const hasAction = /\b(walked|ran|grabbed|turned|looked|opened|closed|stepped|moved|reached|pulled|pushed)\b/i.test(firstPara);
    const hasBackstory = (openingLower.match(/\b(had been|used to|always|years ago|before|once|growing up|childhood|remembered|back when|for as long as|ever since)\b/g) || []).length;
    if (hasBackstory > 3 && !hasDialogue && !hasAction) {
      problems.push({ id: 'backstory', severity: 'high', title: 'Backstory Dump', desc: 'The opening is explaining the character\'s past instead of showing them in the present. Readers haven\'t bonded with the character yet, so they don\'t care about their history.', fix: 'Start in the present moment with action or tension. Weave backstory in later, after the reader is invested.' });
    }

    // 4. "It was" / "There was" opening (weak, passive)
    if (/^(it was|there was|there were|it is|there is)/i.test(firstSentence)) {
      problems.push({ id: 'itwas', severity: 'medium', title: '"It was / There was" Opening', desc: 'Starting with "It was" or "There was" creates distance between the reader and the story. It\'s telling, not showing.', fix: 'Replace with a specific, concrete image or action. Instead of "It was quiet," try "Silence pressed against the walls."' });
    }

    // 5. Too much description, no character
    const charMentions = (opening.match(/\b[A-Z][a-z]{2,}\b/g) || []).length;
    if (firstParaWords > 60 && charMentions < 2 && !hasDialogue) {
      problems.push({ id: 'nochar', severity: 'medium', title: 'Missing Character', desc: 'The opening paragraph is over 60 words with no named character and no dialogue. The reader has nobody to connect with.', fix: 'Introduce a character in the first sentence or two. Give them a name, a want, and a problem.' });
    }

    // 6. No tension/conflict in first 3 paragraphs
    const earlyTension = (openingLower.match(/\b(but|however|problem|danger|wrong|strange|never|couldn\'t|shouldn\'t|threat|fear|worried|nervous|mistake|trouble|secret|lie|risk|deadline)\b/g) || []).length;
    if (earlyTension < 2) {
      problems.push({ id: 'notension', severity: 'medium', title: 'No Early Tension', desc: 'The first few paragraphs lack conflict or tension words. Without a question or problem, the reader has no reason to continue.', fix: 'Introduce a source of tension within the first page — a question unanswered, a problem unsolved, something off or wrong.' });
    }

    // 7. No hook (first sentence doesn't raise a question or create intrigue)
    const firstSentWords = firstSentence.split(/\s+/).length;
    const hasQuestion = firstSentence.includes('?');
    const hasConflict = /\b(but|never|wrong|last|only|couldn\'t|shouldn\'t|dead|blood|secret|lie|strange|impossible)\b/i.test(firstSentence);
    const hasSpecificity = /\b[A-Z][a-z]{2,}\b/.test(firstSentence); // proper noun
    if (!hasQuestion && !hasConflict && !hasSpecificity && firstSentWords > 5) {
      problems.push({ id: 'nohook', severity: 'low', title: 'Weak First Sentence', desc: 'The first sentence doesn\'t raise a question, create intrigue, or introduce a specific character. It\'s generic.', fix: 'Your first sentence should make the reader ask "What?" or "Why?" — create intrigue, specificity, or a micro-mystery.' });
    }

    // 8. Telling emotions instead of showing
    const tellingOpening = (openingLower.match(/\b(felt sad|felt happy|felt angry|felt nervous|felt scared|was angry|was happy|was sad|was nervous|was excited|was worried)\b/g) || []).length;
    if (tellingOpening > 1) {
      problems.push({ id: 'telling', severity: 'medium', title: 'Telling Emotions in Opening', desc: 'The opening tells the reader how characters feel instead of showing through action and dialogue.', fix: '"She was nervous" → "Her fingers drummed the table." Show emotion through body language and action.' });
    }

    // 9. Passive voice heavy opening
    const passiveOpening = (opening.match(/\b(was|were|is|are|been|being)\s+(being\s+)?\w+(ed|en)\b/gi) || []).length;
    if (passiveOpening > 3) {
      problems.push({ id: 'passive', severity: 'low', title: 'Passive Opening', desc: passiveOpening + ' passive constructions in the opening. Passive voice creates distance and weakens the prose.', fix: 'Rewrite in active voice: "The door was opened by Sarah" → "Sarah opened the door."' });
    }

    // 10. Too long before something happens
    const firstActionIdx = opening.search(/\b(said|walked|ran|grabbed|turned|opened|closed|stepped|shouted|whispered|pulled|pushed|hit|threw|caught|dropped)\b/i);
    if (firstActionIdx > 500) {
      problems.push({ id: 'slowstart', severity: 'medium', title: 'Slow Start', desc: 'Over 500 characters of text before any physical action occurs. The opening feels static.', fix: 'Move action earlier. Start your character doing something — even a small gesture creates forward motion.' });
    }

    // === GENRE-AWARE STRATEGIES ===
    const g = genre?.primary;

    // Universal strategies
    strategies.push({ title: 'Start Mid-Scene', desc: 'Drop the reader into a moment already in progress. No setup, no explanation. The reader catches up naturally.', example: 'Instead of: "John had been a detective for twenty years..." Try: "The body was still warm when John arrived."' });

    strategies.push({ title: 'Open with Voice', desc: 'Let your character\'s personality come through immediately. A distinctive voice hooks readers faster than any plot.', example: 'Instead of: "Sarah was a baker who lived in Portland." Try: "The sourdough starter had been alive longer than any of Sarah\'s relationships, and she was fine with that."' });

    // Genre-specific strategies
    if (g === 'thriller' || g === 'mystery') {
      strategies.push({ title: 'Start with the Crime/Threat', desc: 'Open with the inciting incident or its immediate aftermath. Don\'t build up to it — start there.', example: '"The phone rang at 3 AM. Nobody calls at 3 AM with good news."' });
      strategies.push({ title: 'Clock Starts Ticking', desc: 'Establish a deadline in the first paragraph. Urgency = unputdownable.', example: '"In forty-eight hours, someone in this room would be dead. The detective just didn\'t know who yet."' });
    }
    if (g === 'romance') {
      strategies.push({ title: 'The Meet-Cute Collision', desc: 'Open with the love interests meeting in an unexpected, memorable way. Chemistry on page one.', example: '"She\'d spilled coffee on worse people. But none of them had looked at her like that afterward."' });
      strategies.push({ title: 'Establish the Want', desc: 'Show what your protagonist is missing or has sworn off. The reader needs to know what they need before they get it.', example: '"Three rules: no dating coworkers, no dating neighbors, and absolutely no dating anyone who smiled like that."' });
    }
    if (g === 'fantasy' || g === 'scifi') {
      strategies.push({ title: 'Ground in the Familiar, Then Break It', desc: 'Start with something the reader recognizes, then reveal the one thing that\'s different about your world.', example: '"The market looked like any other — until you noticed the prices were listed in memories, not coins."' });
      strategies.push({ title: 'Start with a Rule Being Broken', desc: 'Show the rules of your world by having someone violate them. Instant tension + worldbuilding.', example: '"Nobody crossed the Wall. That\'s what they said. That\'s what everyone believed. Until Mara did."' });
    }
    if (g === 'horror') {
      strategies.push({ title: 'Something Is Wrong', desc: 'Open with normalcy that has one detail slightly off. The reader feels unease before they know why.', example: '"The house was exactly as she remembered it. Except for the door. The door was on the wrong side."' });
      strategies.push({ title: 'Foreshadow the End', desc: 'Hint at what\'s coming. Let the reader dread it.', example: '"If I had known what was in the basement, I never would have rented the house. But I didn\'t know. Not then."' });
    }
    if (g === 'literary') {
      strategies.push({ title: 'Open with an Image', desc: 'A single, vivid, surprising image that captures the thematic heart of the story.', example: '"The light that morning was the color of old photographs — warm and already fading."' });
    }
    if (g === 'historical') {
      strategies.push({ title: 'Sensory Time Travel', desc: 'Don\'t tell the reader the year. Make them feel it through smell, sound, and texture.', example: '"The air tasted of coal smoke and horse. Sarah pulled her shawl tighter and pushed through the crowd toward the factory gates."' });
    }
    if (g === 'ya') {
      strategies.push({ title: 'Authentic Teen Voice', desc: 'Sound like a real teenager — not an adult writing a teenager. Voice > plot in the first paragraph.', example: '"Three things I knew for sure: my mom was going to kill me, my best friend already hated me, and this was definitely the worst Tuesday of my life."' });
    }

    // Always add this one last
    strategies.push({ title: 'The One-Sentence Test', desc: 'If a reader only reads your first sentence and decides whether to continue — does your first sentence earn the second?', example: 'Read your first sentence in isolation. Does it make you want to know more? If not, rewrite it until it does.' });

    // Score the opening
    // Start from a base that requires EARNING a high score, not just avoiding penalties
    const severityWeight = { high: 4, medium: 2.5, low: 1.5 };
    const totalPenalty = problems.reduce((s, p) => s + severityWeight[p.severity], 0);

    // Positive signals that earn points
    const positiveSignals = [
      hasQuestion || hasConflict,    // Hook in first sentence
      hasSpecificity,                // Named character early
      earlyTension >= 2,             // Tension words present
      hasDialogue,                   // Dialogue in opening
      hasAction,                     // Action in opening
      firstSentWords <= 20,          // Concise first sentence
    ].filter(Boolean).length;

    // Base score: 50 + up to 30 from positive signals + up to 20 from lack of problems
    const signalBonus = Math.round(positiveSignals / 6 * 30);
    const penaltyDeduction = Math.round(totalPenalty * 8);
    const cleanBonus = problems.length === 0 ? 20 : Math.max(0, 15 - problems.length * 5);
    const openingScore = Math.max(0, Math.min(100, 50 + signalBonus + cleanBonus - penaltyDeduction));

    return {
      score: openingScore,
      firstSentence,
      firstParagraph: firstPara,
      problems,
      strategies,
      genre: genre.primary
    };
  },

  // ========================
  // GENRE-SPECIFIC SCANNERS
  // Each genre has "what good looks like" — we check for essential elements
  // ========================
  analyzeGenreElements(text, genre) {
    const primary = genre.primary;
    const lower = text.toLowerCase();
    const countHits = (words) => words.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);
    const countAll = (words) => words.reduce((n, w) => n + ((lower.match(new RegExp('\\b' + w + '\\b', 'g')) || []).length), 0);

    // Define elements per genre
    const genreElements = {
      romance: {
        name: 'Romance',
        elements: [
          { name: 'Meet-Cute / Introduction', check: () => countHits(['met','first time','noticed','caught my eye','walked in','stranger','new','arrived']) > 1, tip: 'How do the love interests meet? Make the first encounter memorable.' },
          { name: 'Chemistry & Attraction', check: () => countHits(['heart','pulse','breath','skin','lips','eyes','smile','touch','close','warmth','electricity','tension','aware']) > 3, tip: 'Show physical and emotional chemistry through sensory detail, not just telling.' },
          { name: 'Obstacles to Love', check: () => countHits(['but','however','couldn\'t','shouldn\'t','wrong','forbidden','complicated','secret','lie','past','fear','trust','distance','rival']) > 3, tip: 'What keeps them apart? The best romances have internal AND external obstacles.' },
          { name: 'Emotional Vulnerability', check: () => countHits(['afraid','scared','trust','hurt','pain','wall','guard','open up','let in','vulnerable','honest','truth','confess','admit']) > 2, tip: 'Characters must become emotionally vulnerable. Walls coming down = reader investment.' },
          { name: 'Resolution / HEA', check: () => countHits(['together','love','forever','always','finally','happy','smile','home','future','promise','yes','stay','chose','choice']) > 2, tip: 'Romance readers expect a satisfying emotional payoff — HEA (Happily Ever After) or HFN (Happy For Now).' }
        ]
      },
      thriller: {
        name: 'Thriller/Suspense',
        elements: [
          { name: 'Ticking Clock', check: () => countHits(['time','deadline','hours','minutes','before','too late','running out','countdown','hurry','race','must','now']) > 2, tip: 'Create urgency. Give the protagonist a deadline that raises stakes with every passing moment.' },
          { name: 'Escalating Stakes', check: () => countHits(['worse','escalat','danger','threat','kill','death','lose','everything','no way out','trapped','closing in']) > 3, tip: 'Each chapter should raise the stakes higher. What starts as a problem should become life-or-death.' },
          { name: 'Cliffhanger Chapter Endings', check: () => { const paras = text.split(/\n\s*\n/); const hooks = paras.filter(p => /[?!]$|but\b|however\b|suddenly\b|then\b/.test(p.trim())); return hooks.length > paras.length * 0.3; }, tip: 'End chapters on cliffhangers. The reader should NEED to turn the page.' },
          { name: 'Red Herrings / Misdirection', check: () => countHits(['seemed','appeared','thought','assumed','believed','suspected','wrong','mislead','deceive','trick','real','actually','truth']) > 3, tip: 'Plant false leads. Make the reader suspect the wrong person or solution.' },
          { name: 'Twist / Revelation', check: () => countHits(['reveal','truth','real','actually','all along','never','secret','discovered','realized','impossible','can\'t believe']) > 2, tip: 'A great thriller needs at least one major twist that reframes everything the reader thought they knew.' }
        ]
      },
      mystery: {
        name: 'Mystery/Crime',
        elements: [
          { name: 'Crime / Puzzle Setup', check: () => countHits(['murder','dead','body','crime','missing','stolen','disappear','found','scene','victim']) > 2, tip: 'Establish the crime or mystery clearly. The reader needs to know what question they\'re trying to answer.' },
          { name: 'Clues Planted Fairly', check: () => countHits(['noticed','found','detail','evidence','clue','mark','trace','fingerprint','witness','saw','heard','remembered']) > 3, tip: 'Plant clues the reader can find. A fair mystery gives the reader a chance to solve it before the detective does.' },
          { name: 'Suspect Pool', check: () => countHits(['suspect','alibi','motive','could have','might have','accused','questioned','interrogat','interview','denied','admitted']) > 2, tip: 'Create at least 3-4 viable suspects, each with motive and opportunity.' },
          { name: 'Red Herrings', check: () => countHits(['seemed','appeared','wrong','mislead','innocent','wasn\'t','actually','surprise']) > 2, tip: 'Plant false leads that logically misdirect without cheating the reader.' },
          { name: 'Satisfying Reveal', check: () => countHits(['reveal','truth','real','killer','guilty','confession','proof','solved','answer','finally']) > 1, tip: 'The reveal should be surprising yet inevitable — the clues were there all along.' }
        ]
      },
      horror: {
        name: 'Horror/Paranormal',
        elements: [
          { name: 'Atmosphere & Dread', check: () => countHits(['dark','shadow','silence','cold','chill','creep','whisper','echo','empty','alone','watching','presence','something','beneath','behind']) > 4, tip: 'Build dread through atmosphere. The scariest moments happen BEFORE the monster appears.' },
          { name: 'The Unknown / Threat', check: () => countHits(['what was','something','creature','thing','it','shape','figure','form','sound','noise','movement','can\'t explain','impossible','shouldn\'t']) > 3, tip: 'What you don\'t show is scarier than what you do. Keep the threat partially hidden.' },
          { name: 'Isolation', check: () => countHits(['alone','isolated','trapped','no one','nowhere','cut off','no signal','no help','locked','stranded','abandoned']) > 2, tip: 'Isolation amplifies fear. Remove escape routes, allies, and communication.' },
          { name: 'Escalating Terror', check: () => countHits(['worse','more','again','louder','closer','faster','stronger','spread','growing','intensif']) > 2, tip: 'Each encounter should be more terrifying than the last. Build a crescendo of horror.' },
          { name: 'Sensory Horror', check: () => countHits(['smell','taste','touch','wet','slick','sticky','rot','decay','metallic','copper','bile','flesh','bone','cold','burning']) > 2, tip: 'Engage all five senses. Horror lives in the visceral, physical experience.' }
        ]
      },
      historical: {
        name: 'Historical Fiction',
        elements: [
          { name: 'Period Setting Detail', check: () => countHits(['century','era','year','period','age','ancient','medieval','victorian','colonial','war','reign','king','queen','lord','lady','manor','estate']) > 3, tip: 'Ground the reader in the specific time period through setting details that could only exist then.' },
          { name: 'Period-Appropriate Language', check: () => countHits(['sir','madam','thy','thou','pray tell','indeed','forthwith','honour','favour','carriage','horse','candle','servant','master','good sir','my lord','my lady']) > 2, tip: 'Language should feel authentic without being incomprehensible. Avoid modern slang.' },
          { name: 'Historical Events/Context', check: () => countHits(['war','battle','treaty','revolution','plague','famine','king','queen','emperor','decree','law','rebellion','independence','reform']) > 2, tip: 'Weave real historical events into your narrative to ground the fiction in reality.' },
          { name: 'Social Dynamics', check: () => countHits(['class','rank','station','proper','improper','scandal','reputation','duty','honor','marriage','dowry','arrangement','society','customs']) > 2, tip: 'Show how social class, gender, and race shaped daily life differently than today.' },
          { name: 'Sensory Period Detail', check: () => countHits(['candle','lamp','fire','horse','cobblestone','dust','smoke','ink','parchment','leather','wool','silk','bread','ale','wine']) > 2, tip: 'What did the era smell, taste, and sound like? Period-specific sensory details create immersion.' }
        ]
      },
      ya: {
        name: 'Young Adult',
        elements: [
          { name: 'Teen Protagonist', check: () => countHits(['school','sixteen','seventeen','eighteen','freshman','sophomore','junior','senior','teenager','teen','young']) > 1, tip: 'YA protagonists should be 12-18. Their voice and concerns must feel authentically teen.' },
          { name: 'Coming-of-Age Theme', check: () => countHits(['growing up','first time','learned','discovered','realized','changed','understand','identity','who I am','belong','fit in','different']) > 2, tip: 'YA is about becoming. What is your character learning about themselves and the world?' },
          { name: 'Accessible Readability', check: () => { const fk = Analyzer.fleschKincaid(text); return fk.grade < 10; }, tip: 'YA readability should target grade 6-9. Keep sentences clear and vocabulary accessible.' },
          { name: 'Peer Relationships', check: () => countHits(['friend','best friend','group','crew','squad','team','together','loyalty','betrayal','popular','outcast','belong','alone']) > 2, tip: 'Friendships and peer dynamics are as important as romance in YA.' },
          { name: 'Stakes That Feel World-Ending', check: () => countHits(['everything','never','forever','destroy','lose','end','impossible','can\'t','won\'t','refuse','fight']) > 2, tip: 'Teen emotions are intense. What feels like a small problem to adults should feel catastrophic to your character.' }
        ]
      },
      literary: {
        name: 'Literary Fiction',
        elements: [
          { name: 'Prose Quality', check: () => { const uniq = new Set((text.match(/\b[a-z]+\b/g)||[]).map(w=>w.toLowerCase())); return uniq.size / Math.max(text.split(/\s+/).length,1) > 0.5; }, tip: 'Literary fiction lives in the quality of each sentence. Every word should be precise and intentional.' },
          { name: 'Interiority', check: () => countAll(['thought','felt','wondered','remembered','realized','considered','reflected','mused','recalled','imagined']) > 5, tip: 'Literary fiction goes deep into character consciousness. Show us what they think and feel, not just what happens.' },
          { name: 'Thematic Depth', check: () => countHits(['meaning','truth','beauty','loss','time','memory','identity','belonging','freedom','death','love','silence','absence','weight','light','shadow']) > 4, tip: 'Literary fiction explores themes. What is your story really about, beneath the plot?' },
          { name: 'Subtext', check: () => countHits(['unsaid','between','beneath','silence','pause','glance','hint','implied','unspoken','hidden','surface','underneath']) > 2, tip: 'What\'s NOT said is as important as what is. Create moments where meaning lives between the lines.' },
          { name: 'Distinctive Voice', check: () => { const fk = Analyzer.fleschKincaid(text); return fk.grade > 8; }, tip: 'Literary fiction rewards a distinctive authorial voice. Don\'t flatten your style to be "accessible."' }
        ]
      }
    };

    const scanner = genreElements[primary];
    if (!scanner) return { applicable: false, genre: primary };

    const results = scanner.elements.map(el => ({
      name: el.name,
      present: el.check(),
      tip: el.tip
    }));

    const presentCount = results.filter(r => r.present).length;
    const score = Math.round(presentCount / results.length * 100);
    const missing = results.filter(r => !r.present);

    return {
      applicable: true,
      genre: primary,
      genreName: scanner.name,
      score,
      presentCount,
      totalElements: results.length,
      elements: results,
      guidance: missing.map(m => ({ element: m.name, tip: m.tip }))
    };
  },

  // ========================
  // SCI-FI WORLDBUILDING SCANNER
  // Checks for the 7 essential elements of sci-fi worldbuilding.
  // Only runs when genre is detected as Science Fiction.
  // ========================
  analyzeSciFiWorldbuilding(text, genre) {
    if (genre.primary !== 'scifi') {
      return { applicable: false };
    }

    const lower = text.toLowerCase();
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    // === 1. THE ONE BIG CHANGE ("What if...?") ===
    let bigChange = { score: 0, found: [], missing: [] };
    const whatIfSignals = [
      { pattern: /\b(what if|imagine a world|in this world|in a world where|on a planet where|in the future|years from now|after the collapse|since the event|after the war|the day everything changed)\b/gi, label: 'premise setup' },
      { pattern: /\b(different from|unlike earth|unlike anything|never before seen|first of its kind|new kind of|evolved to|mutated|transformed|altered)\b/gi, label: 'core difference' },
      { pattern: /\b(discovery|invention|breakthrough|experiment|anomaly|phenomenon|singularity|event|catalyst|awakening)\b/gi, label: 'catalyst event' }
    ];
    whatIfSignals.forEach(s => {
      const m = lower.match(s.pattern);
      if (m && m.length > 0) { bigChange.score += 25; bigChange.found.push(s.label + ' (' + m.length + ' signals)'); }
      else bigChange.missing.push(s.label);
    });
    // Check if the premise is consistent (referenced throughout, not just intro)
    const premiseWords = lower.match(/\b(world|planet|system|colony|station|ship|society|civilization|empire|federation|alliance|republic)\b/g) || [];
    if (premiseWords.length > 5) bigChange.score += 25;
    bigChange.score = Math.min(100, bigChange.score);

    // === 2. SYSTEMS OF POWER ===
    let power = { score: 0, found: [], missing: [] };
    const powerSignals = [
      { pattern: /\b(government|council|senate|emperor|president|chancellor|commander|director|authority|regime|republic|democracy|dictatorship|monarchy|oligarchy)\b/gi, label: 'governing body' },
      { pattern: /\b(corporation|company|conglomerate|syndicate|cartel|guild|faction|organization|institution)\b/gi, label: 'corporate/organizational power' },
      { pattern: /\b(rebel|resistance|underground|revolution|uprising|dissent|protest|overthrow|fight back|oppose|defy)\b/gi, label: 'resistance/opposition' },
      { pattern: /\b(law|rule|decree|mandate|banned|forbidden|illegal|criminal|enforce|punish|control|surveillance|monitored|restricted)\b/gi, label: 'rules and enforcement' },
      { pattern: /\b(class|caste|citizen|rank|status|privilege|elite|underclass|worker|servant|slave|oppressed|marginalized)\b/gi, label: 'social hierarchy' }
    ];
    powerSignals.forEach(s => {
      const m = lower.match(s.pattern);
      if (m && m.length > 0) { power.score += 20; power.found.push(s.label + ' (' + m.length + ')'); }
      else power.missing.push(s.label);
    });
    power.score = Math.min(100, power.score);

    // === 3. CULTURE, BELIEFS & THE ALIEN OTHER ===
    let culture = { score: 0, found: [], missing: [] };
    const cultureSignals = [
      { pattern: /\b(alien|species|race|being|creature|entity|non-human|humanoid|android|cyborg|synthetic|clone|hybrid)\b/gi, label: 'non-human entities' },
      { pattern: /\b(religion|belief|worship|faith|ritual|ceremony|tradition|custom|sacred|holy|temple|shrine|prayer|prophecy)\b/gi, label: 'belief systems' },
      { pattern: /\b(culture|society|tribe|clan|people|civilization|community|colony|settlement|homeland|heritage|ancestry)\b/gi, label: 'cultural identity' },
      { pattern: /\b(language|dialect|tongue|communicate|translation|misunderstand|interpret|signal|code)\b/gi, label: 'language/communication' },
      { pattern: /\b(prejudice|discrimination|fear|distrust|alliance|treaty|war|conflict|peace|negotiate|diplomacy)\b/gi, label: 'inter-group dynamics' }
    ];
    cultureSignals.forEach(s => {
      const m = lower.match(s.pattern);
      if (m && m.length > 0) { culture.score += 20; culture.found.push(s.label + ' (' + m.length + ')'); }
      else culture.missing.push(s.label);
    });
    culture.score = Math.min(100, culture.score);

    // === 4. TECH WITH CONSEQUENCES ===
    let tech = { score: 0, found: [], missing: [] };
    const techSignals = [
      { pattern: /\b(technology|device|machine|engine|reactor|computer|AI|artificial intelligence|neural|implant|augment|biotech|nanotech|quantum|hologram|drone|mech|robot)\b/gi, label: 'technology present' },
      { pattern: /\b(malfunction|failure|glitch|hack|breach|overload|shutdown|crash|broken|corrupted|unstable|dangerous|side effect|consequence|cost|price|risk)\b/gi, label: 'tech consequences' },
      { pattern: /\b(access|afford|privilege|rich|poor|gap|divide|haves|have-nots|restricted|classified|clearance|black market)\b/gi, label: 'tech inequality' },
      { pattern: /\b(adapt|depend|addicted|reliant|worship|fear|distrust|reject|luddite|resistance to)\b/gi, label: 'relationship with tech' }
    ];
    techSignals.forEach(s => {
      const m = lower.match(s.pattern);
      if (m && m.length > 0) { tech.score += 25; tech.found.push(s.label + ' (' + m.length + ')'); }
      else tech.missing.push(s.label);
    });
    tech.score = Math.min(100, tech.score);

    // === 5. LIVED EXPERIENCE (sensory, daily life) ===
    let lived = { score: 0, found: [], missing: [] };
    const livedSignals = [
      { pattern: /\b(smell|taste|touch|texture|sound|hear|felt|warm|cold|heat|freeze|humidity|dry|wet|gritty|smooth|rough|sharp|soft|bitter|sweet|metallic|acrid|stale)\b/gi, label: 'sensory detail' },
      { pattern: /\b(eat|drink|food|meal|ration|hunger|thirst|cook|brew|chew|swallow|sip|feast|starve)\b/gi, label: 'food/sustenance' },
      { pattern: /\b(travel|transport|vehicle|ship|shuttle|pod|train|walk|corridor|street|path|road|dock|port|station|gate)\b/gi, label: 'transportation/movement' },
      { pattern: /\b(sleep|rest|wake|dream|exhausted|tired|bed|bunk|quarters|home|shelter|dwelling)\b/gi, label: 'rest/dwelling' },
      { pattern: /\b(mourn|grieve|funeral|death|loss|celebrate|festival|wedding|birth|tradition|holiday)\b/gi, label: 'life events/rituals' }
    ];
    livedSignals.forEach(s => {
      const m = lower.match(s.pattern);
      if (m && m.length > 0) { lived.score += 20; lived.found.push(s.label + ' (' + m.length + ')'); }
      else lived.missing.push(s.label);
    });
    lived.score = Math.min(100, lived.score);

    // === 6. THE HISTORY THAT HAUNTS THEM ===
    let history = { score: 0, found: [], missing: [] };
    const historySignals = [
      { pattern: /\b(years ago|centuries ago|long ago|ancient|before the war|before the fall|the old world|the old ways|the before times|once upon|in the beginning|founding|origin)\b/gi, label: 'historical references' },
      { pattern: /\b(remember|memory|memorial|monument|ruin|artifact|relic|archive|record|history|legend|myth|story|tale)\b/gi, label: 'memory/records' },
      { pattern: /\b(war|collapse|catastrophe|plague|extinction|disaster|event|cataclysm|apocalypse|fall|revolution|uprising)\b/gi, label: 'past trauma' },
      { pattern: /\b(rebuild|recover|remnant|survivor|descendant|legacy|heritage|ancestor|generation|elder)\b/gi, label: 'legacy/aftermath' }
    ];
    historySignals.forEach(s => {
      const m = lower.match(s.pattern);
      if (m && m.length > 0) { history.score += 25; history.found.push(s.label + ' (' + m.length + ')'); }
      else history.missing.push(s.label);
    });
    history.score = Math.min(100, history.score);

    // === 7. EVERYDAY ECONOMICS ===
    let economics = { score: 0, found: [], missing: [] };
    const econSignals = [
      { pattern: /\b(money|credit|currency|coin|payment|pay|cost|price|afford|expensive|cheap|wealth|rich|poor|poverty)\b/gi, label: 'currency/money' },
      { pattern: /\b(trade|barter|exchange|market|shop|vendor|merchant|dealer|buy|sell|smuggle|cargo|goods|supply)\b/gi, label: 'trade/commerce' },
      { pattern: /\b(resource|scarcity|scarce|rare|precious|valuable|ration|shortage|abundance|surplus|mine|harvest|extract|fuel|energy|water|food|oxygen)\b/gi, label: 'resources/scarcity' },
      { pattern: /\b(work|job|labor|employ|occupation|profession|craft|skill|earn|wage|contract|hire|boss|worker)\b/gi, label: 'labor/employment' }
    ];
    econSignals.forEach(s => {
      const m = lower.match(s.pattern);
      if (m && m.length > 0) { economics.score += 25; economics.found.push(s.label + ' (' + m.length + ')'); }
      else economics.missing.push(s.label);
    });
    economics.score = Math.min(100, economics.score);

    // Overall worldbuilding score
    const elements = [bigChange, power, culture, tech, lived, history, economics];
    const overall = Math.round(elements.reduce((s, e) => s + e.score, 0) / 7);
    const strong = elements.filter(e => e.score >= 60).length;
    const weak = elements.filter(e => e.score < 30).length;

    // Build guidance for missing elements
    const guidance = [];
    const names = ['The One Big Change', 'Systems of Power', 'Culture & The Alien Other', 'Tech with Consequences', 'Lived Experience', 'History That Haunts', 'Everyday Economics'];
    const tips = [
      'What is your "What if...?" question? Every detail should trace back to this one big change.',
      'Who makes the rules? Who suffers under them? Who\'s trying to tear them down?',
      'What does it mean to be human in your world? Show us through beliefs, traditions, and the alien other.',
      'Technology should create problems, not just solve them. Who has access? What happens when it fails?',
      'How do people eat, travel, mourn, and love? Readers want to feel the world, not read a lecture about it.',
      'What past event shaped the current world? Even a few references to "before" add enormous depth.',
      'What is the most valuable resource? How do people earn a living? Scarcity creates conflict.'
    ];
    elements.forEach((e, i) => {
      if (e.score < 40) {
        guidance.push({ element: names[i], score: e.score, tip: tips[i], missing: e.missing });
      }
    });

    return {
      applicable: true,
      overall,
      strongElements: strong,
      weakElements: weak,
      elements: {
        bigChange: { name: 'The One Big Change', ...bigChange },
        power: { name: 'Systems of Power', ...power },
        culture: { name: 'Culture & The Alien Other', ...culture },
        tech: { name: 'Tech with Consequences', ...tech },
        lived: { name: 'Lived Experience', ...lived },
        history: { name: 'History That Haunts', ...history },
        economics: { name: 'Everyday Economics', ...economics }
      },
      guidance
    };
  },

  // ========================
  // BLURB ENGINE
  // ========================
  // Back-cover material. Fiction: the six-question framework, each answer carrying the
  // basis it was chosen on (which cue word, in which slice of the book), assembled into five
  // shapes whose missing beats are shown as gaps rather than filled with lines the author
  // never wrote. Nonfiction: no protagonist, no crisis; the sentences a back cover needs,
  // grouped by role and labelled with where they came from. Tone is a measured rate.
  generateBlurbs(text, characters, genre, mode) {
    if (mode !== 'book' && text.split(/\s+/).length < 5000) {
      return { available: false, reason: 'Blurbs are generated for full manuscripts (book mode or 5000+ words). Upload a complete manuscript to unlock blurb suggestions.' };
    }
    const cleanText = text.replace(/^(chapter\s+\d+|chapter\s+[a-z]+|part\s+\d+|part\s+[a-z]+)\s*$/gim, '').replace(/\n{3,}/g, '\n\n');
    const paragraphs = cleanText.split(/\n\s*\n/).filter(p => p.trim().length > 10);
    const lower = cleanText.toLowerCase();
    const totalWords = (cleanText.match(/\b\w+\b/g) || []).length;
    const perK = re => Math.round((lower.match(re) || []).length / Math.max(totalWords, 1) * 1000 * 10) / 10;
    const toneRates = {
      dark: perK(/\b(death|murder|blood|dark|shadow|kill|terror|horror|fear)\b/g),
      romantic: perK(/\b(love|heart|kiss|passion|desire|romance|attraction|beautiful)\b/g),
      comic: perK(/\b(laugh|smile|grin|joke|ridiculous|absurd|hilarious|funny)\b/g),
      action: perK(/\b(fight|battle|war|weapon|chase|escape|explosion|attack|run)\b/g)
    };
    const toneNames = { dark: 'dark / suspense', romantic: 'romantic', comic: 'light / comic', action: 'action' };
    const ranked = Object.entries(toneRates).sort((a, b) => b[1] - a[1]);
    // A leaning needs a rate, not a count: five "fear"s in seventy thousand words is nothing.
    const toneDetected = ranked[0][1] >= 1.5 ? 'leaning ' + toneNames[ranked[0][0]] : 'no dominant tone vocabulary';

    if (this.isNonfiction(genre)) return this._blurbMaterial(text, { totalWords, toneRates, toneDetected });

    const charNames = (characters && characters.applicable !== false && characters.list ? characters.list : []).map(c => c.name);
    const protagonist = charNames[0] || null;
    const antagonist = charNames.length > 1 ? charNames[1] : null;
    const genreLabel = genre.label || 'Fiction';
    const who = protagonist || '[the protagonist — no recurring name was found]';

    // Each answer states how it was chosen. The author can disagree with a stated basis; they
    // cannot disagree with "extracted from manuscript".
    const pick = (section, re, where, cueList) => {
      const m = section.match(re);
      if (m) return { text: this._extractSentenceAt(section, m.index), basis: 'first sentence in the ' + where + ' containing \u201C' + m[0] + '\u201D' };
      return { text: '', basis: 'no sentence in the ' + where + ' contains ' + cueList };
    };
    const slice = (a, b) => paragraphs.slice(Math.floor(paragraphs.length * a), Math.ceil(paragraphs.length * b)).join(' ');
    const opening = slice(0, 0.15);
    let statusQuo;
    const wantRe = protagonist ? new RegExp(protagonist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(wanted|needed|wished|hoped|dreamed|longed|craved|sought|was trying|had always|lived|worked|spent)', 'i') : null;
    const wantMatch = wantRe && opening.match(wantRe);
    if (wantMatch) statusQuo = { text: this._extractSentenceAt(opening, wantMatch.index), basis: 'first sentence in the opening 15% where ' + protagonist + ' wants, needs or hopes for something' };
    else statusQuo = { text: this._extractFirstMeaningfulSentence(opening, protagonist || ''), basis: protagonist ? 'the first sentence of the opening 15% that mentions ' + protagonist + ' (no wanting or hoping sentence was found)' : 'the first sentence of the manuscript (no recurring name to look for)' };
    const incitingIncident = pick(slice(0, 0.25), /\b(but then|until|one day|everything changed|suddenly|that's when|then came|arrived|discovered|found out|learned that|received|stumbled|appeared)\b/i, 'first quarter', 'a change cue (but then, until, one day, suddenly, discovered\u2026)');
    const conflict = pick(slice(0.3, 0.6), /\b(but|however|unfortunately|worse|problem|danger|threat|impossible|never|couldn't|wouldn't|refused|betrayed|lied|secret|truth|revealed)\b/i, 'middle (30\u201360%)', 'a conflict cue (but, worse, danger, refused, betrayed\u2026)');
    const attempt = pick(slice(0.5, 0.75), /\b(decided|plan|must|had to|needed to|determined|set out|tried|fought|risked|chose|vowed|promised)\b/i, 'second half (50\u201375%)', 'an attempt cue (decided, must, tried, vowed\u2026)');
    const crisis = pick(slice(0.7, 0.9), /\b(everything|nothing|lost|destroyed|shattered|broken|trapped|impossible|too late|no way|final|last chance|only hope)\b/i, 'last third (70\u201390%)', 'a crisis cue (lost, trapped, too late, last chance\u2026)');
    const stakes = pick(slice(0.7, 1), /\b(lose|death|life|love|freedom|everything|world|family|home|truth|soul|heart|future|hope|survive)\b/i, 'last 30%', 'a stakes cue (lose, life, freedom, family, survive\u2026)');

    const framework = { statusQuo, incitingIncident, conflict, attempt, crisis, stakes, protagonist, antagonist };
    const fw = { statusQuo: statusQuo.text, incitingIncident: incitingIncident.text, conflict: conflict.text, attempt: attempt.text, crisis: crisis.text, stakes: stakes.text, protagonist: who };
    const blurbs = [
      this._buildBlurb_hookFirst(fw, genreLabel),
      this._buildBlurb_questionStyle(fw, genreLabel),
      this._buildBlurb_stakesForward(fw, genreLabel),
      this._buildBlurb_characterFocused(fw, genreLabel),
      this._buildBlurb_cinematic(fw, genreLabel)
    ];
    return { available: true, kind: 'framework', framework, blurbs, wordCount: totalWords, protagonist, antagonist, toneRates, toneDetected };
  },

  // Nonfiction back-cover material: the author's own sentences, by role, each with the section
  // it came from. No connective prose is written; composing the blurb stays with the author.
  _blurbMaterial(text, meta) {
    const sections = this.detectSections(text);
    const sectionAt = index => { let label = 'Opening'; for (const s of sections) { if (s.index <= index) label = s.label; else break; } return label; };
    const roles = {
      promise: { label: 'The promise', re: /\b(this (book|chapter) (is|was) (for|about|written)|i wrote this|if that('s| is) you|you will (learn|discover|find|see|know|understand)|by the end of (this|the)|i (will|want to|am going to) (show|teach|help|give|hand) you|take a seat|this is for (you|anyone|the))\b/i },
      problem: { label: 'The problem it names', re: /\b(coming up short|invisible weight|performing fine while|you (feel|are|might be|may be) (tired|stuck|overlooked|exhausted|drowning|struggling|failing|afraid|worried)|one paycheck|still sinking|silently drowning|burnout|overwhelmed|told to just work harder)\b/i },
      audience: { label: 'Who it is for', re: /\b(for anyone (who|told)|for those who|whether you('re| are)|if you('re| are| have)|this message is for|anyone (who has|told to))\b/i },
      authorStake: { label: 'The author\u2019s stake', re: /\b(i (have|had|'ve) (lived|been|spent|learned|seen|lost|built|worked)|in my (experience|life|years|twenties)|when i (arrived|was|started|lost|left|came)|i climbed|i grew up|i offer no)\b/i }
    };
    const material = {};
    const sentenceRe = /[^.!?\n]+[.!?]+/g;
    for (const [key, role] of Object.entries(roles)) {
      const rows = [];
      let m;
      sentenceRe.lastIndex = 0;
      while ((m = sentenceRe.exec(text)) !== null && rows.length < 4) {
        const sentence = m[0].trim();
        // Short lines are often the best cover lines ("Take a seat."); only fragments are skipped.
        if (sentence.length < 12 || sentence.length > 320) continue;
        if (!role.re.test(sentence.replace(/[\u2018\u2019]/g, "'"))) continue;
        rows.push({ text: sentence, index: m.index, section: sectionAt(m.index) });
      }
      material[key] = { label: role.label, rows };
    }
    return { available: true, kind: 'material', material, wordCount: meta.totalWords, toneRates: meta.toneRates, toneDetected: meta.toneDetected,
      note: 'These are your sentences, grouped by the job a back cover needs them to do, with where each came from. No prose is written for you.' };
  },

  // Helper: clean chapter headings and noise from extracted text
  _cleanExtract(text) {
    return text
      .replace(/^(chapter\s+\d+|chapter\s+[a-z]+|part\s+\d+|part\s+[a-z]+)\s*/gi, '')
      .replace(/^\s*\d+\s*$/, '')
      .replace(/\n+/g, ' ')
      .trim();
  },

  // Helper: split text into proper sentences (handling abbreviations)
  _splitSentences(text) {
    // Don't split on periods after common abbreviations
    const safe = text.replace(/\b(Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Rev|Gen|Sgt|Capt|Lt|Col|Maj|Inc|Corp|Ltd|vs|etc|approx)\./gi, '$1\u2024');
    const raw = safe.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
    return raw.map(s => s.replace(/\u2024/g, '.'));
  },

  // Helper: extract the sentence containing a match index
  _extractSentenceAt(text, index) {
    const sentences = this._splitSentences(text);
    let pos = 0;
    for (const s of sentences) {
      const sIdx = text.indexOf(s, pos);
      if (sIdx <= index && sIdx + s.length >= index) {
        return this._cleanExtract(s);
      }
      pos = sIdx + s.length;
    }
    // Fallback: grab ~150 chars around the index
    const start = Math.max(0, text.lastIndexOf('.', index) + 1);
    const end = Math.min(text.length, text.indexOf('.', index + 10) + 1 || index + 150);
    return this._cleanExtract(text.substring(start, end));
  },

  // Helper: first sentence mentioning the protagonist
  _extractFirstMeaningfulSentence(text, charName) {
    const sentences = this._splitSentences(text);
    const match = sentences.find(s => s.includes(charName));
    return match ? this._cleanExtract(match) : sentences[0] ? this._cleanExtract(sentences[0]) : '';
  },

  // Clean blurb text: remove double conjunctions, fix capitalization
  _cleanBlurb(text) {
    return text
      .replace(/\.\s*\./g, '.')
      .replace(/\bBut but\b/gi, 'But')
      .replace(/\bThen but\b/gi, 'Then')
      .replace(/\bNow, but\b/gi, 'Now,')
      .replace(/\bAnd and\b/gi, 'And')
      .replace(/\s{2,}/g, ' ')
      .replace(/\.\s*,/g, '.')
      .trim();
  },

  // A missing beat is shown as a gap the author fills, never as a line the engine wrote.
  _gap(label) { return '[' + label + ']'; },
  _blurbResult(style, description, parts, sep) {
    const text = this._cleanBlurb(parts.filter(Boolean).join(sep || ' '));
    const gaps = (text.match(/\[[^\]]+\]/g) || []).length;
    const wordCount = text.replace(/\[[^\]]+\]/g, '').replace(/\n/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    return { style, description, text, wordCount, gaps };
  },
  // Blurb 1: Hook-first (lead with the most dramatic element)
  _buildBlurb_hookFirst(fw) {
    return this._blurbResult('Hook First', 'Opens with the crisis to grab attention, then rewinds to show how it got there.', [
      fw.crisis ? this._trimTo(fw.crisis, 40) : this._gap('the crisis \u2014 no sentence found in the last third'),
      fw.statusQuo ? this._trimTo(fw.statusQuo, 35) : this._gap('what ' + fw.protagonist + ' wants'),
      fw.incitingIncident ? this._trimTo(fw.incitingIncident, 30) : this._gap('what changes'),
      fw.conflict ? 'Now, ' + this._trimToLower(fw.conflict, 30) : '',
      fw.stakes ? this._trimTo(fw.stakes, 25) : this._gap('what is at stake')
    ]);
  },
  // Blurb 2: Question style (end with a provocative question)
  _buildBlurb_questionStyle(fw) {
    return this._blurbResult('Question Hook', 'Builds to a question that makes the reader need to know the answer.', [
      fw.statusQuo ? this._trimTo(fw.statusQuo, 35) : this._gap('what ' + fw.protagonist + ' wants'),
      fw.incitingIncident ? this._trimTo(fw.incitingIncident, 30) : this._gap('what changes'),
      fw.conflict ? this._trimTo(fw.conflict, 30) : this._gap('what goes wrong'),
      fw.crisis || fw.attempt ? 'When ' + this._trimToLower(fw.crisis || fw.attempt, 20) + ',' : this._gap('the crisis'),
      this._gap('your closing question \u2014 what must ' + fw.protagonist + ' choose?')
    ]);
  },
  // Blurb 3: Stakes forward (lead with what's at risk)
  _buildBlurb_stakesForward(fw) {
    return this._blurbResult('Stakes Forward', 'Opens with what the character stands to lose, creating immediate urgency.', [
      fw.stakes ? this._trimTo(fw.stakes, 25) : this._gap('what is at stake \u2014 no sentence found in the last 30%'),
      fw.statusQuo ? this._trimTo(fw.statusQuo, 30) : '',
      fw.incitingIncident ? 'Then ' + this._trimToLower(fw.incitingIncident, 25) : this._gap('what changes'),
      fw.conflict ? this._trimTo(fw.conflict, 25) : '',
      fw.attempt ? this._trimTo(fw.attempt, 25) : this._gap('what ' + fw.protagonist + ' tries'),
      this._gap('the turning point \u2014 your line')
    ]);
  },
  // Blurb 4: Character-focused (who is this person and why should we care?)
  _buildBlurb_characterFocused(fw) {
    return this._blurbResult('Character Portrait', 'Centers the character \u2014 who they are, what they want, and what threatens them.', [
      fw.statusQuo ? this._trimTo(fw.statusQuo, 35) : this._gap('who ' + fw.protagonist + ' is'),
      fw.incitingIncident ? this._trimTo(fw.incitingIncident, 30) : this._gap('what changes'),
      fw.conflict ? this._trimTo(fw.conflict, 25) : '',
      fw.stakes ? this._trimTo(fw.stakes, 20) : this._gap('what threatens them now')
    ]);
  },
  // Blurb 5: Cinematic (short, punchy, visual)
  _buildBlurb_cinematic(fw) {
    return this._blurbResult('Cinematic', 'Short, punchy lines with white space. Reads like a movie trailer.', [
      fw.statusQuo ? this._trimTo(fw.statusQuo, 18) : this._gap('one line: who'),
      fw.incitingIncident ? this._trimTo(fw.incitingIncident, 15) : this._gap('one line: what changes'),
      fw.conflict ? this._trimTo(fw.conflict, 15) : this._gap('one line: what goes wrong'),
      this._gap('your closing line')
    ], '\n\n');
  },

  // Helper: trim text to ~N words, ending at a sentence boundary
  _trimTo(text, maxWords) {
    if (!text) return '';
    const words = text.split(/\s+/);
    if (words.length <= maxWords) return text;
    const trimmed = words.slice(0, maxWords).join(' ');
    // Try to end at a natural break
    const lastPeriod = trimmed.lastIndexOf('.');
    const lastComma = trimmed.lastIndexOf(',');
    if (lastPeriod > trimmed.length * 0.5) return trimmed.substring(0, lastPeriod + 1);
    if (lastComma > trimmed.length * 0.6) return trimmed.substring(0, lastComma);
    return trimmed + '...';
  },

  _trimToLower(text, maxWords) {
    const t = this._trimTo(text, maxWords);
    return t ? t.charAt(0).toLowerCase() + t.slice(1) : '';
  },

  // ========================
  // DNF PREDICTION ENGINE
  // ========================
  analyzeDNF(text, manuscriptMode, genre) {
    const totalWords = (text.match(/\b\w+\b/g) || []).length;
    const mode = manuscriptMode.mode;

    // Determine evaluation mode (genre awareness flows in via the eval mode 'nonfiction')
    const evalMode = this.isNonfiction(genre) ? 'nonfiction' : this._detectEvalMode(text, mode);

    // Length-based analysis strategy
    if (totalWords > 8000) {
      return this._dnfChunked(text, evalMode, totalWords, true);
    } else if (totalWords >= 3000) {
      return this._dnfChunked(text, evalMode, totalWords, false);
    } else {
      return this._dnfDirect(text, evalMode, totalWords);
    }
  },

  _detectEvalMode(text, mode) {
    if (mode === 'excerpt') return 'excerpt';
    if (mode === 'book') return 'book';

    // For chapters, try to detect position
    const lower = text.toLowerCase();
    const firstPara = (text.split(/\n\s*\n/).filter(p => p.trim())[0] || '').toLowerCase();

    // Opening signals: chapter 1, prologue, starts with heavy worldbuilding/character intro
    const isOpening = /\b(chapter\s*(one|1)|prologue)\b/i.test(text.substring(0, 200)) ||
      (firstPara.match(/\b(name was|years old|lived in|born in|grew up|moved to|first time)\b/g) || []).length >= 2;

    // Closing signals: epilogue, resolution language, finality
    const isClosing = /\b(epilogue|chapter\s*(final|last)|the end)\b/i.test(text.substring(0, 200)) ||
      (lower.match(/\b(finally|at last|it was over|farewell|goodbye|new beginning|looked back|walked away|closed the door|the sun set|never looked back)\b/g) || []).length >= 3;

    if (isOpening) return 'opening';
    if (isClosing) return 'closing';
    return 'midbook';
  },

  _scoreSection(text, evalMode) {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const totalWords = words.length;
    if (totalWords < 10) return { hook_strength: 2, clarity: 2, forward_motion: 2, specificity: 2, redundancy: 5, payoff: 2 };

    const lower = text.toLowerCase();
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const avgSentLen = totalWords / Math.max(sentences.length, 1);

    // Nonfiction needs argument/reader-value signals, not fiction action/dialogue proxies.
    if (evalMode === 'nonfiction') {
      const first500 = lower.substring(0, Math.min(lower.length, 2500));
      const questionOpening = (text.substring(0, 2500).match(/\?/g) || []).length;
      const promiseOpening = (first500.match(/\b(this (book|chapter)|you|your|we|our|why|how|consider|imagine|the (problem|truth|question|point)|what if)\b/g) || []).length;
      const transitionWords = (lower.match(/\b(however|therefore|furthermore|because|although|first|second|third|finally|next|also|specifically|for example|in contrast|as a result)\b/g) || []).length;
      const evidenceWords = (lower.match(/\b(for example|for instance|research|study|studies|data|evidence|according to|statistics|percent|case in point|in fact|demonstrates|illustrates)\b/g) || []).length;
      const actionWords = (lower.match(/\b(action|exercise|reflect|ask yourself|write down|try this|next step|practice|apply|consider|choose|start|begin|plan|commit)\b/g) || []).length;
      const vagueWords = (lower.match(/\b(thing|stuff|something|somehow|somewhat|various|kind of|sort of|a lot|very|really|good|bad|great|important)\b/g) || []).length;
      const passiveCount = (text.match(/\b(was|were|is|are|been|being)\s+(being\s+)?\w+(ed|en)\b/gi) || []).length;
      const longSentences = sentences.filter(s => s.trim().split(/\s+/).length > 30).length;
      const sentTexts = sentences.map(s => s.trim().toLowerCase());
      let nearDupes = 0;
      for (let i=0;i<sentTexts.length-1;i++){const a=new Set(sentTexts[i].split(/\s+/).filter(w=>w.length>3)),b=new Set(sentTexts[i+1].split(/\s+/).filter(w=>w.length>3));if(a.size<3||b.size<3)continue;let overlap=0;a.forEach(w=>{if(b.has(w))overlap++;});if(overlap/Math.min(a.size,b.size)>0.5)nearDupes++;}
      const perK = n => n / Math.max(totalWords / 1000, 1);
      let hook_strength = 3 + Math.min(3, questionOpening * .6) + Math.min(4, promiseOpening * .35);
      let clarity = 6 - Math.min(2, passiveCount / Math.max(totalWords,1) * 250) - Math.min(2, longSentences / Math.max(sentences.length,1) * 8) + Math.min(3, perK(transitionWords) * .3);
      let forward_motion = 3 + Math.min(4, perK(transitionWords) * .35) + Math.min(3, perK(actionWords) * .25);
      let specificity = 4 + Math.min(4, perK(evidenceWords) * .35) - Math.min(3, perK(vagueWords) * .15);
      let redundancy = 9 - Math.min(8, nearDupes / Math.max(sentences.length,1) * 35);
      let payoff = 3 + Math.min(4, perK(actionWords) * .35) + Math.min(3, perK(evidenceWords) * .2);
      const clamp=v=>Math.max(1,Math.min(10,Math.round(v)));
      return {hook_strength:clamp(hook_strength),clarity:clamp(clarity),forward_motion:clamp(forward_motion),specificity:clamp(specificity),redundancy:clamp(redundancy),payoff:clamp(payoff)};
    }

    // === HOOK STRENGTH (1-10) ===
    const first500 = lower.substring(0, Math.min(lower.length, 2500));
    const tensionOpening = (first500.match(/\b(but|however|suddenly|until|except|never|wrong|strange|secret|dead|blood|lie|couldn't|shouldn't|danger|threat|impossible)\b/g) || []).length;
    const questionOpening = (text.substring(0, 2500).match(/\?/g) || []).length;
    const dialogueOpening = (text.substring(0, 2500).match(/["\u201C][^"\u201D]{3,}["\u201D]/g) || []).length;
    const actionOpening = (first500.match(/\b(ran|grabbed|turned|slammed|pushed|pulled|threw|shouted|whispered|raced|lunged|leaped|opened|shut|dropped|said)\b/g) || []).length;
    const setupWords = (first500.match(/\b(had been|used to|always had|for years|remembered when|was born in|grew up|the history of|it all began)\b/g) || []).length;

    let hook_strength = 2;
    hook_strength += Math.min(3, tensionOpening / 2);
    hook_strength += Math.min(2, questionOpening * 0.7);
    hook_strength += Math.min(2, dialogueOpening * 0.5);
    hook_strength += Math.min(2, actionOpening / 2);
    hook_strength -= Math.min(3, setupWords * 1.2);
    if (/^(it was|there was|there were|the sun|the rain|once upon)/i.test(text.trim())) hook_strength -= 1.5;

    // === CLARITY (1-10) ===
    const passiveCount = (text.match(/\b(was|were|is|are|been|being)\s+(being\s+)?\w+(ed|en)\b/gi) || []).length;
    const longSentences = sentences.filter(s => s.trim().split(/\s+/).length > 30).length;
    const transitionWords = (lower.match(/\b(however|therefore|meanwhile|furthermore|consequently|additionally|nevertheless|moreover|specifically|for example|in contrast|as a result|on the other hand)\b/g) || []).length;
    const jargon = (lower.match(/\b(aforementioned|notwithstanding|heretofore|wherein|thereof|pertaining|henceforth|inasmuch)\b/g) || []).length;

    let clarity = 2;
    clarity -= Math.min(2, passiveCount / Math.max(totalWords, 1) * 300);
    clarity -= Math.min(2, longSentences / Math.max(sentences.length, 1) * 10);
    clarity += Math.min(3, transitionWords / Math.max(paragraphs.length, 1) * 4);
    clarity -= jargon * 0.5;
    if (avgSentLen > 25) clarity -= 2;
    else if (avgSentLen >= 12 && avgSentLen <= 20) clarity += 2;
    if (longSentences === 0) clarity += 2;

    // === FORWARD MOTION (1-10) ===
    const actionVerbs = (lower.match(/\b(ran|grabbed|turned|opened|slammed|pushed|pulled|threw|caught|shouted|raced|charged|lunged|leaped|darted|decided|chose|moved|crossed|stepped|drove|walked|spoke|asked|demanded|refused)\b/g) || []).length;
    const stagnationWords = (lower.match(/\b(had been|used to|always had|for years|remembered when|thought about|considered|pondered|reflected|mused|wondered if|it seemed|there was a sense)\b/g) || []).length;
    const dialogueLines = (text.match(/["\u201C][^"\u201D]{3,}["\u201D]/g) || []).length;

    let paraHooks = 0;
    paragraphs.forEach(p => {
      const lastSent = (p.match(/[^.!?]*[.!?]\s*$/)||[''])[0].trim().toLowerCase();
      if (/[?!]$/.test(lastSent) || /\b(but|then|suddenly|until|never|everything|nothing|no one|and then|before)\b/.test(lastSent)) paraHooks++;
    });
    const hookRate = paragraphs.length > 1 ? paraHooks / (paragraphs.length - 1) : 0;

    let forward_motion = 2;
    forward_motion += Math.min(3, actionVerbs / Math.max(totalWords, 1) * 500);
    forward_motion += Math.min(2, hookRate * 3);
    forward_motion += Math.min(0.5, dialogueLines / Math.max(totalWords, 1) * 200);
    forward_motion -= Math.min(3, stagnationWords / Math.max(totalWords, 1) * 400);
    if (dialogueLines === 0 && totalWords > 800) forward_motion -= 1;
    let stalls = 0;
    paragraphs.forEach(p => {
      const pl = p.toLowerCase();
      if (!(/(said|asked|told|shouted|whispered|replied|ran|grabbed|turned|pushed|pulled|opened|decided|chose)/.test(pl)) && !(/["\u201C]/.test(p))) stalls++;
      else stalls = 0;
    });
    if (stalls >= 4) forward_motion -= 1.5;

    // === SPECIFICITY (1-10) ===
    const vagueWords = (lower.match(/\b(thing|stuff|something|somewhere|somehow|somewhat|various|certain|particular|kind of|sort of|a lot|many|very|really|quite|pretty much|fairly|rather|nice|good|bad|big|small|great|important)\b/g) || []).length;
    const concreteNouns = (lower.match(/\b(door|window|table|chair|wall|floor|hand|face|eyes|voice|knife|gun|bottle|car|road|rain|snow|blood|phone|key|letter|map|clock|mirror|shadow|stairs|bridge|river|mountain|garden|street)\b/g) || []).length;
    const sensoryWords = (lower.match(/\b(cold|warm|hot|sharp|soft|rough|smooth|bright|dark|loud|quiet|bitter|sweet|sour|metallic|damp|dry|heavy|light|tight|loose|burning|aching|stinging|throbbing|pounding|trembling)\b/g) || []).length;
    const bodyLanguage = (lower.match(/\b(smiled|frowned|sighed|shook|nodded|shrugged|trembled|flinched|winced|clenched|gritted)\b/g) || []).length;

    let specificity = 2;
    specificity -= Math.min(2.5, vagueWords / Math.max(totalWords, 1) * 200);
    specificity += Math.min(3, concreteNouns / Math.max(totalWords, 1) * 250);
    specificity += Math.min(2, sensoryWords / Math.max(totalWords, 1) * 300);
    specificity += Math.min(2, bodyLanguage / Math.max(totalWords, 1) * 500);
    const lexicalDiversity = [...new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g, '')).filter(w => w.length > 2))].length / Math.max(words.length, 1);
    specificity += Math.min(2, (lexicalDiversity - 0.3) * 8);

    // === REDUNDANCY (1-10, 10 = no redundancy) ===
    const sentTexts = sentences.map(s => s.trim().toLowerCase());
    let nearDupes = 0;
    for (let i = 0; i < sentTexts.length - 1; i++) {
      const w1 = new Set(sentTexts[i].split(/\s+/).filter(w => w.length > 3));
      const w2 = new Set(sentTexts[i+1].split(/\s+/).filter(w => w.length > 3));
      if (w1.size < 3 || w2.size < 3) continue;
      let overlap = 0;
      w1.forEach(w => { if (w2.has(w)) overlap++; });
      if (overlap / Math.min(w1.size, w2.size) > 0.5) nearDupes++;
    }
    const redundancyRate = sentences.length > 2 ? nearDupes / sentences.length : 0;

    let redundancy = 3;
    redundancy -= Math.min(5, redundancyRate * 30);
    const phraseMap = {};
    for (let i = 0; i < words.length - 2; i++) {
      const phrase = words.slice(i, i+3).join(' ').toLowerCase().replace(/[^a-z ]/g, '');
      if (phrase.length > 8) phraseMap[phrase] = (phraseMap[phrase] || 0) + 1;
    }
    const repeatedPhrases = Object.values(phraseMap).filter(c => c >= 3).length;
    redundancy -= Math.min(2, repeatedPhrases * 0.3);

    // === PAYOFF (1-10) ===
    const emotionWords = (lower.match(/\b(love|hate|fear|anger|joy|grief|terror|hope|despair|rage|jealousy|shame|guilt|pride|longing|anxiety|dread|relief|sorrow|panic|horror|happy|sad|scared|nervous|excited|worried|furious|heartbroken|elated|devastated)\b/g) || []).length;
    const revealWords = (lower.match(/\b(realized|discovered|understood|revealed|confessed|admitted|learned|recognized|saw that|knew then|truth|secret|finally|turned out|the answer|it hit|dawned on)\b/g) || []).length;
    const surpriseWords = (lower.match(/\b(suddenly|unexpected|shock|gasp|froze|couldn't believe|impossible|never thought|stunned|stared|what the|no way|oh god|wait)\b/g) || []).length;
    const internalThoughts = (lower.match(/\b(thought|felt|wondered|realized|knew|remembered|wished|hoped|feared|dreaded|wanted|needed)\b/g) || []).length;

    let payoff = 2;
    payoff += Math.min(3, emotionWords / Math.max(totalWords, 1) * 300);
    payoff += Math.min(2, revealWords / Math.max(totalWords, 1) * 500);
    payoff += Math.min(2, surpriseWords / Math.max(totalWords, 1) * 400);
    payoff += Math.min(1, internalThoughts / Math.max(totalWords, 1) * 200);
    const lastPara = (paragraphs[paragraphs.length - 1] || '').toLowerCase();
    if (/[?!]$/.test(lastPara.trim()) || /\b(but|then|suddenly|never|everything changed|nothing|and then)\b/.test(lastPara)) payoff += 1;

    // Clamp all 1-10
    hook_strength = Math.max(1, Math.min(10, Math.round(hook_strength)));
    clarity = Math.max(1, Math.min(10, Math.round(clarity)));
    forward_motion = Math.max(1, Math.min(10, Math.round(forward_motion)));
    specificity = Math.max(1, Math.min(10, Math.round(specificity)));
    redundancy = Math.max(1, Math.min(10, Math.round(redundancy)));
    payoff = Math.max(1, Math.min(10, Math.round(payoff)));

    return { hook_strength, clarity, forward_motion, specificity, redundancy, payoff };
  },

  _scoresToDNFRisk(scores, evalMode) {
    if (!scores) return 80;
    const wt = evalMode === 'opening'
      ? { hook_strength: 0.30, clarity: 0.20, forward_motion: 0.18, redundancy: 0.14, specificity: 0.12, payoff: 0.06 }
      : evalMode === 'closing'
      ? { hook_strength: 0.10, clarity: 0.18, forward_motion: 0.22, redundancy: 0.14, specificity: 0.12, payoff: 0.24 }
      : evalMode === 'nonfiction'
      // Nonfiction: clarity and specificity matter most; hook + payoff de-emphasized (no narrative arc)
      ? { hook_strength: 0.10, clarity: 0.32, forward_motion: 0.18, redundancy: 0.18, specificity: 0.18, payoff: 0.04 }
      : { hook_strength: 0.20, clarity: 0.20, forward_motion: 0.22, redundancy: 0.15, specificity: 0.13, payoff: 0.10 };

    const weighted = Object.entries(wt).reduce((sum, [dim, w]) => sum + (scores[dim] || 5) * w, 0);
    // Score 10 → risk 0, score 1 → risk 100
    return Math.max(0, Math.min(100, Math.round((10 - weighted) / 9 * 100)));
  },

  _buildReasons(scores, evalMode) {
    if (!scores) return ['Insufficient text for analysis'];
    const reasons = [];
    const labels = {
      hook_strength: 'Weak opening — no curiosity, tension, or promise to hook the reader',
      clarity: 'Hard to follow — reader has to re-read to understand',
      forward_motion: 'Stalling — paragraphs don\'t earn the next one',
      specificity: 'Vague prose — drifts into abstract fog instead of concrete detail',
      redundancy: 'Repetitive — same point restated too often',
      payoff: 'No reward — reader doesn\'t feel paid off for continuing'
    };
    const modeReasons = {
      nonfiction: {
        hook_strength: 'Opening promise is weak — the reader benefit or central question is unclear',
        clarity: 'Argument is hard to follow — ideas need clearer sequencing or transitions',
        forward_motion: 'Argument stalls — ideas repeat without enough progression or application',
        specificity: 'Support is too abstract — add concrete examples, evidence, or lived experience',
        redundancy: 'Ideas repeat without adding a new layer',
        payoff: 'Reader payoff is weak — insight needs a clearer takeaway, reflection, or action'
      },
      opening: {
        hook_strength: 'Opening lacks curiosity or tension — reader has no reason to continue',
        clarity: 'Opening is confusing — reader can\'t orient themselves',
        specificity: 'Opening is vague — no concrete image or character to latch onto'
      },
      midbook: {
        forward_motion: 'Chapter stalls — nothing pulls the reader forward',
        redundancy: 'Chapter repeats itself — same ideas cycling without progress',
        clarity: 'Chapter is hard to follow — reader loses the thread'
      },
      closing: {
        payoff: 'Closing doesn\'t deliver — reader doesn\'t feel the resolution',
        forward_motion: 'Ending loses energy instead of building to a finish',
        specificity: 'Ending is too abstract — lacks concrete emotional detail'
      },
      excerpt: {
        clarity: 'Section is hard to follow without surrounding context',
        forward_motion: 'Excerpt feels static — nothing pulls the reader forward'
      }
    };

    // Sort dimensions by score ascending (weakest first)
    const sorted = Object.entries(scores).sort((a, b) => a[1] - b[1]);
    for (const [dim, score] of sorted) {
      if (score <= 6 && reasons.length < 3) {
        const modeSpecific = (modeReasons[evalMode] || {})[dim];
        reasons.push(modeSpecific || labels[dim]);
      }
    }
    // If we don't have 3 yet, add generic observations
    if (reasons.length < 3 && sorted[0][1] <= 7) {
      const extras = evalMode === 'nonfiction' ? [
        'The argument could progress more clearly from idea to evidence to application',
        'Some sections may need more concrete support or examples',
        'Reader takeaway is not consistently explicit'
      ] : [
        'Exposition slows narrative flow',
        'Narrative direction is temporarily unclear',
        'Scenes lack a clear turning point'
      ];
      for (const e of extras) {
        if (reasons.length < 3 && !reasons.includes(e)) reasons.push(e);
      }
    }
    return reasons.slice(0, 3);
  },

  _dnfDirect(text, evalMode, totalWords) {
    const scores = this._scoreSection(text, evalMode);
    const dnfRisk = this._scoresToDNFRisk(scores, evalMode);
    const riskBand = dnfRisk <= 30 ? 'Low' : dnfRisk <= 60 ? 'Medium' : 'High';
    const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0];
    const reasons = this._buildReasons(scores, evalMode);

    const modeLabels = {
      opening: 'Opening DNF Risk',
      midbook: 'Chapter Retention Score',
      closing: 'Closing Chapter Score',
      excerpt: 'Excerpt Engagement Score',
      book: 'Manuscript DNF Risk'
    };

    const fixMap = {
      hook_strength: 'Open with tension, a question, or mid-action. Give the reader a reason to stay in the first paragraph.',
      clarity: 'Shorten sentences, add transitions between ideas, and cut jargon. The reader should never have to re-read.',
      forward_motion: 'Every paragraph should create a question or promise. Cut reflection that doesn\'t advance the scene.',
      specificity: 'Replace vague words (things, stuff, somehow) with concrete nouns and sensory detail.',
      redundancy: 'Cut repeated phrases and near-duplicate sentences. Say it once, say it well.',
      payoff: 'End sections with a reveal, decision, or emotional beat. Reward the reader for continuing.'
    };

    const result = {
      score_label: modeLabels[evalMode] || 'DNF Risk',
      dnf_risk: dnfRisk,
      risk_band: riskBand,
      scores,
      top_3_reasons: reasons,
      weakest_area: weakest,
      best_fix: fixMap[weakest] || 'Strengthen the weakest scoring dimension.',
      eval_mode: evalMode
    };

    if (evalMode === 'excerpt') {
      result.context_warning = 'This score is based on an isolated excerpt and may not reflect full manuscript quality.';
    } else if (evalMode === 'midbook' || evalMode === 'opening' || evalMode === 'closing') {
      result.context_warning = 'This score is based on a single chapter and may underrepresent broader manuscript context.';
    }

    return result;
  },

  _dnfChunked(text, evalMode, totalWords, forced) {
    // Split into roughly equal sections
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const numChunks = totalWords > 12000 ? 4 : 3;
    const chunkSize = Math.ceil(paragraphs.length / numChunks);
    const chunks = [];
    for (let i = 0; i < numChunks; i++) {
      const slice = paragraphs.slice(i * chunkSize, (i + 1) * chunkSize);
      if (slice.length > 0) chunks.push(slice.join('\n\n'));
    }

    const sectionScores = chunks.map((chunk, i) => {
      const scores = this._scoreSection(chunk, evalMode);
      const risk = this._scoresToDNFRisk(scores, evalMode);
      return {
        section: 'Part ' + (i + 1),
        score: 100 - risk,
        risk,
        scores
      };
    });

    // Overall scores: average across sections
    const avgScores = {};
    const dims = ['hook_strength', 'clarity', 'forward_motion', 'specificity', 'redundancy', 'payoff'];
    for (const d of dims) {
      avgScores[d] = Math.round(sectionScores.reduce((s, sec) => s + (sec.scores?.[d] || 2), 0) / sectionScores.length);
    }

    const overallRisk = this._scoresToDNFRisk(avgScores, evalMode);
    const riskBand = overallRisk <= 30 ? 'Low' : overallRisk <= 60 ? 'Medium' : 'High';
    const weakest = Object.entries(avgScores).sort((a, b) => a[1] - b[1])[0][0];
    const reasons = this._buildReasons(avgScores, evalMode);

    const strongest = [...sectionScores].sort((a, b) => b.score - a.score)[0];
    const weakestSec = [...sectionScores].sort((a, b) => a.score - b.score)[0];

    const modeLabels = {
      opening: 'Opening DNF Risk',
      midbook: 'Chapter Retention Score',
      closing: 'Closing Chapter Score',
      excerpt: 'Excerpt Engagement Score',
      book: 'Manuscript DNF Risk'
    };

    const fixMap = {
      hook_strength: 'Strengthen the opening of the weakest section — add tension or a compelling question.',
      clarity: 'Simplify the densest section — break long paragraphs, add transitions.',
      forward_motion: 'Cut stagnant passages in the weakest section — every paragraph should earn the next.',
      specificity: 'Add concrete detail to the vaguest section — sensory language, specific nouns.',
      redundancy: 'Cut repeated ideas in the weakest section — consolidate into one strong statement.',
      payoff: 'Add a stronger emotional or narrative payoff to the weakest section.'
    };

    const result = {
      score_label: modeLabels[evalMode] || 'DNF Risk',
      dnf_risk: overallRisk,
      risk_band: riskBand,
      scores: avgScores,
      top_3_reasons: reasons,
      weakest_area: weakest,
      best_fix: fixMap[weakest] || 'Strengthen the weakest scoring dimension.',
      eval_mode: evalMode,
      section_scores: sectionScores.map(s => ({ section: s.section, score: s.score })),
      strongest_section: strongest.section,
      weakest_section: weakestSec.section
    };

    if (evalMode === 'excerpt') {
      result.context_warning = 'This score is based on an isolated excerpt and may not reflect full manuscript quality.';
    } else if (evalMode !== 'book') {
      result.context_warning = 'This score is based on a single chapter and may underrepresent broader manuscript context.';
    }

    return result;
  },

  // ========================
  // COPY EDITING SCORE
  // ========================
  scoreCopyEditing(issues, totalWords) {
    // Grammar has its own dimension and is not counted here a second time; this set is
    // the same one the workbench lists under Copy Editing.
    const copyTypes=new Set(['passive','adverb','cliche','wordy','confused-word','repetition']);
    const copyIssues=issues.filter(i=>copyTypes.has(i.type));
    const perK=copyIssues.length/Math.max(totalWords,1)*1000;
    // A transparent density index: 0 validated findings = 100. The curve is monotonic
    // and length-normalized; no hidden floor or absolute-count penalty.
    return Math.max(0,Math.min(100,Math.round(100/(1+perK/25))));
  },

  // ========================
  // FULL ANALYSIS
  // ========================
  analyze(text, genreOverride) {
    if (!text || text.trim().length < 50) {
      return { error: 'Text too short for meaningful analysis. Please provide at least a few paragraphs.' };
    }

    // Detect manuscript mode and genre first — needed for genre-aware scoring.
    // genreOverride (string key from user dropdown) is sacred — bypasses detection AND fallback reclassification.
    // STAGE 1: segment the document. Literary analysis must read the STORY, not the
    // copyright page, disclaimers, dedication, or table of contents.
    const segmentation = this.segmentDocument(text);
    const aText = text.slice(segmentation.narrativeStart, segmentation.narrativeEnd);
    const aOffset = segmentation.narrativeStart;

    const manuscriptMode = this.detectMode(aText);
    const mode = manuscriptMode.mode;
    const detected = this.detectGenre(aText);
    const genre = (genreOverride && typeof genreOverride === 'string')
      ? { primary: genreOverride, label: this._genreLabelFor(genreOverride), secondary: null, userOverride: true }
      : detected;
    const isNF = this.isNonfiction(genre);

    // Language-quality detectors run on the FULL text so editor highlights cover
    // front/back matter too (a typo in the preface is still a typo)…
    const passiveIssues = this.findPassiveVoice(text, genre);
    const adverbIssues = this.findAdverbs(text, genre);
    const clicheIssues = this.findCliches(text);
    const weakVerbIssues = this.findWeakVerbs(text, genre);
    const wordyIssues = this.findWordyPhrases(text);
    const repetitionIssues = this.findRepetitions(text);
    const longSentenceIssues = this.findLongSentences(text);
    // …but show-vs-tell is a NARRATIVE craft dimension: run it on narrative text only,
    // then shift indexes back to full-document coordinates for highlighting.
    const showTellIssues = this.findShowVsTell(aText, genre);
    if (aOffset > 0) showTellIssues.forEach(i => { i.index += aOffset; });
    const confusedWordIssues = this.findConfusedWords(text);
    const grammarIssues = this.findGrammarIssues(text);

    const rawIssues = [
      ...passiveIssues, ...adverbIssues, ...clicheIssues,
      ...weakVerbIssues, ...wordyIssues, ...repetitionIssues,
      ...longSentenceIssues, ...showTellIssues, ...confusedWordIssues,
      ...grammarIssues
    ];

    // ========================================================
    // VALIDATION LAYER — verify every issue before accepting it
    // ========================================================
    const allIssues = rawIssues.filter(issue => {
      // 1. Confidence threshold: skip low-confidence detections
      if (issue.confidence !== undefined && issue.confidence < 0.6) return false;

      // 2. Bounds check: issue must be within text range
      if (issue.index < 0 || issue.index + issue.length > text.length) return false;

      // 3. Text verification: the text at issue.index must match issue.text
      const actualText = text.substring(issue.index, issue.index + issue.length);
      if (actualText !== issue.text) {
        // Try to find the correct position (text may have shifted)
        const correctedIdx = text.indexOf(issue.text, Math.max(0, issue.index - 50));
        if (correctedIdx !== -1 && Math.abs(correctedIdx - issue.index) < 100) {
          issue.index = correctedIdx; // fix the position
        } else {
          return false; // can't locate this text — skip it
        }
      }

      // 4. Word boundary check (for single-word issues like adverbs, repetitions, weak-verbs)
      if (['adverb', 'weak-verb', 'repetition'].includes(issue.type)) {
        const charBefore = issue.index > 0 ? text[issue.index - 1] : ' ';
        const charAfter = issue.index + issue.length < text.length ? text[issue.index + issue.length] : ' ';
        const isWordBoundary = ch => /[\s.,;:!?'"()\[\]{}\-—–\n\r\t]/.test(ch) || ch === undefined;
        if (!isWordBoundary(charBefore) || !isWordBoundary(charAfter)) {
          return false; // highlight would cut through a word — skip
        }
      }

      // 5. Suggestion must reference actual text (not a template for a different word)
      // For adverbs: verify the suggestion mentions the actual word
      if (issue.type === 'adverb' && issue.suggestion && !issue.suggestion.toLowerCase().includes(issue.text.toLowerCase())) {
        issue.suggestion = `Remove "${issue.text}" and strengthen the verb it modifies.`;
      }

      return true;
    }).sort((a, b) => a.index - b.index);

    // STAGE 1b: prose context. Identify what kind of passage each paragraph is, then judge
    // each finding against this manuscript's own norms for that kind of passage. A long
    // sentence in a reflective passage is measured against the author's other reflective
    // passages, not against a fixed number. Mode-appropriate findings are marked
    // contextSuppressed with a reason and excluded from scoring — never deleted.
    let proseContext = { passages: [], distribution: null, norms: {}, suppressed: 0, raised: 0, applicable: false };
    if (typeof ProseContext !== 'undefined' && typeof ProseNorms !== 'undefined') {
      try {
        const passages = ProseContext.classify(text);
        const adjusted = ProseNorms.apply(text, allIssues, passages);
        proseContext = {
          passages: passages.length,
          distribution: ProseContext.distribution(passages),
          norms: adjusted.norms,
          suppressed: adjusted.suppressed.length,
          raised: allIssues.filter(i => i.contextRaised).length,
          applicable: adjusted.applied > 0 || passages.length > 0
        };
      } catch (e) { /* context is an enhancement; never let it break an analysis */ }
    }

    // Issues inside the narrative span drive the SCORES; front/back-matter issues stay
    // visible as highlights but must not damage the manuscript's scores. Context-suppressed
    // findings are likewise visible but score-inert.
    const scoredIssues = allIssues.filter(i => !i.contextSuppressed);
    const narrativeIssues = aOffset > 0 || segmentation.narrativeEnd < text.length
      ? scoredIssues.filter(i => i.index >= segmentation.narrativeStart && i.index < segmentation.narrativeEnd)
      : scoredIssues;
    const narrativeWords = segmentation.narrativeWords;

    // STAGE 2: literary analysis — every narrative dimension reads narrative text only.
    const characters = this.analyzeCharacters(aText, genre);
    const plot = this.analyzePlot(aText, mode, genre, characters);
    const transitions = this.analyzeTransitions(aText);
    const dialogue = this.analyzeDialogue(aText, genre);
    const style = this.analyzeStyle(aText);
    const sentenceVariety = this.analyzeSentenceVariety(aText);
    const readability = this.fleschKincaid(aText);
    const readerPerspective = this.analyzeReaderPerspective(aText, mode, narrativeIssues, genre);
    const dnfAnalysis = this.analyzeDNF(aText, manuscriptMode, genre);
    // Backfill readerPerspective.dnfRisk from new engine for backward compat
    readerPerspective.dnfRisk = dnfAnalysis.dnf_risk;
    const pacing = this.analyzePacing(aText);
    const blurbs = this.generateBlurbs(aText, characters, genre, mode);
    const scifiWorld = this.analyzeSciFiWorldbuilding(aText, genre);
    const genreElements = this.analyzeGenreElements(aText, genre);
    const openingDiagnosis = this.diagnoseOpening(aText, genre);
    const sceneEmotions = this.detectSceneEmotions(aText);

    const totalWords = (text.match(/\b\w+\b/g) || []).length;
    const copyScore = this.scoreCopyEditing(narrativeIssues, narrativeWords);
    // Nonfiction handling (flow not judged on word overlap, POV not applicable) lives inside
    // analyzeLineEditing so the sub-scores and the composite always agree.
    const lineEditing = this.analyzeLineEditing(aText, genre);
    const lineScore = lineEditing.score;
    // Show/Tell: normalize per 1000 NARRATIVE words so long manuscripts aren't unfairly floored to 0.
    const showTellPerK=(showTellIssues.length/Math.max(narrativeWords,1))*1000;
    // These are deterministic "telling-pattern candidates", not proof that a passage
    // violates a universal show-don't-tell rule. Keep the index transparent and monotonic.
    const showTellScore=Math.max(0,Math.min(100,Math.round(100/(1+showTellPerK/12))));

    // Grammar score: penalize based on grammar issue density within the narrative.
    // Boilerplate (copyright blocks, ISBN lines) trips grammar heuristics constantly and
    // must not drag down the manuscript's grammar score.
    const grammarFiltered = narrativeIssues.filter(i => i.type === 'grammar');
    const grammarPerK = (grammarFiltered.length / Math.max(narrativeWords, 1)) * 1000;
    // Impact-weighted: floor at 100 - 35 - 20 - 10 = 35. Was 5; too punishing for
    // long manuscripts with normal proofreading-level errors.
    const grammarScore = Math.min(100, Math.max(0, Math.round(
      100 - Math.min(35, grammarPerK * 6) -
      Math.min(20, grammarFiltered.filter(i => i.severity === 'high').length * 3) -
      Math.min(10, grammarFiltered.filter(i => i.severity === 'medium').length * 1)
    )));

    // Deep writing quality engine — narrative text, narrative issues
    const writingQuality = this.analyzeWritingQuality(aText, narrativeIssues, sentenceVariety, readability, dialogue, style, genre);

    // Self-help: specialized 8-dimension scoring model (replaces fiction blend)
    const selfHelpScores = (genre.primary === 'selfHelp') ? this._analyzeSelfHelp(aText, mode) : null;

    // Overall: weighted average across APPLICABLE dimensions only. Non-applicable
    // dimensions (null dialogue, show-vs-tell for nonfiction) are skipped and the
    // remaining weights renormalized — never substituted with fake neutral values.
    const bundle = this._computeScoreBundle({
      plot: plot.score, transitions: transitions.score, copy: copyScore, line: lineScore,
      style: style.score, dialogue: isNF ? null : dialogue.score, showTell: isNF ? null : showTellScore,
      grammar: grammarScore,
      clarity: writingQuality.clarityScore, discipline: writingQuality.disciplineScore,
      efficiency: writingQuality.efficiencyScore, engagement: writingQuality.engagementScore,
      momentum: writingQuality.momentumScore
    });
    const overall = selfHelpScores ? selfHelpScores.overall : bundle.overall;
    const subScores = bundle.subScores;
    // Self-help: sub-scores must come from the SAME model as the overall, or the line
    // under the gauge contradicts it (e.g. "Narrative 40" under a 75 built from the
    // 8-dimension self-help scores).
    if (selfHelpScores) {
      const sh = selfHelpScores;
      subScores.narrativeHealth = Math.round(((sh.readerIdentification||0)+(sh.structureProgression||0)+(sh.insightQuality||0)+(sh.emotionalMomentum||0)+(sh.practicalApplication||0)+(sh.evidenceSupport||0))/6);
      subScores.languageQuality = Math.round((sh.clarityReadability||0)*0.4+(sh.voiceAuthority||0)*0.3+grammarScore*0.3);
    }

    // Issue density normalized per 1000 words, over the findings that actually scored.
    const issuesPerK = Math.round(scoredIssues.length / Math.max(totalWords, 1) * 1000 * 10) / 10;
    const countScored = t => scoredIssues.reduce((n, i) => n + (i.type === t ? 1 : 0), 0);

    return {
      overall, genre, totalWords, manuscriptMode, issuesPerK,
      scoreModel: selfHelpScores ? 'self-help-v1' : (isNF ? 'nonfiction-v1' : 'fiction-v1'),
      subScores,
      // Segmentation report: what was excluded from literary analysis and why scores
      // are trustworthy. narrativeStart/End are offsets into the full text.
      segmentation: {
        narrativeStart: segmentation.narrativeStart,
        narrativeEnd: segmentation.narrativeEnd,
        narrativeWords: segmentation.narrativeWords,
        frontMatterWords: segmentation.frontMatterWords,
        backMatterWords: segmentation.backMatterWords
      },
      // What kind of prose this book is made of, and how many findings were re-weighted
      // against its own norms rather than a fixed threshold.
      proseContext,
      selfHelpScores,
      scores: {
        plot: plot.score, transitions: transitions.score, copy: copyScore,
        line: lineScore, style: style.score, dialogue: isNF ? null : dialogue.score,
        showTell: isNF ? null : showTellScore, grammar: grammarScore
      },
      writingQuality, lineEditing, blurbs, scifiWorld, genreElements, openingDiagnosis, sceneEmotions,
      plot, transitions, dialogue, style, sentenceVariety, readability,
      readerPerspective, dnfAnalysis, pacing, characters,
      showTell: { score: showTellScore, issues: showTellIssues },
      issues: allIssues,
      rawIssues, // unfiltered concatenated detector outputs (telemetry / debugging only)
      // Counts are of findings that survived validation and were not set aside for their
      // passage, so the number beside a score is the number that produced it.
      issueCounts: {
        passive: countScored('passive'), adverb: countScored('adverb'),
        cliche: countScored('cliche'), 'weak-verb': countScored('weak-verb'),
        wordy: countScored('wordy'), repetition: countScored('repetition'),
        'sentence-length': countScored('sentence-length'), 'show-tell': countScored('show-tell'),
        'confused-word': countScored('confused-word'),
        grammar: countScored('grammar'),
        pov: lineEditing.findings ? lineEditing.findings.filter(f => f.type === 'pov').length : 0,
        dialogue: dialogue.findings ? dialogue.findings.length : 0
      }
    };
  },

  // ========================
  // GRADE HELPER
  // ========================
  getGrade(score) {
    if (score >= 93) return 'A';
    if (score >= 85) return 'A-';
    if (score >= 80) return 'B+';
    if (score >= 73) return 'B';
    if (score >= 68) return 'B-';
    if (score >= 63) return 'C+';
    if (score >= 55) return 'C';
    if (score >= 48) return 'C-';
    if (score >= 40) return 'D';
    return 'F';
  },

  recalcOverall(r) {
    // Self-help uses its own weighted model
    if (r.selfHelpScores) {
      const sh = r.selfHelpScores;
      // Keep sub-scores in the same model as the overall
      r.subScores = {
        narrativeHealth: Math.round(((sh.readerIdentification||0)+(sh.structureProgression||0)+(sh.insightQuality||0)+(sh.emotionalMomentum||0)+(sh.practicalApplication||0)+(sh.evidenceSupport||0))/6),
        languageQuality: Math.round((sh.clarityReadability||0)*0.4+(sh.voiceAuthority||0)*0.3+((r.scores&&r.scores.grammar)||0)*0.3)
      };
      return Math.round(
        (sh.clarityReadability   || 0) * 0.15 +
        (sh.readerIdentification || 0) * 0.15 +
        (sh.practicalApplication || 0) * 0.15 +
        (sh.structureProgression || 0) * 0.15 +
        (sh.insightQuality       || 0) * 0.15 +
        (sh.voiceAuthority       || 0) * 0.10 +
        (sh.emotionalMomentum    || 0) * 0.10 +
        (sh.evidenceSupport      || 0) * 0.05
      );
    }
    const s = r.scores || {};
    const wq = r.writingQuality || {};
    const isNF = this.isNonfiction(r.genre);
    const bundle = this._computeScoreBundle({
      plot: s.plot, transitions: s.transitions, copy: s.copy, line: s.line,
      style: s.style, dialogue: isNF ? null : s.dialogue, showTell: isNF ? null : s.showTell,
      grammar: s.grammar,
      clarity: wq.clarityScore, discipline: wq.disciplineScore,
      efficiency: wq.efficiencyScore, engagement: wq.engagementScore,
      momentum: wq.momentumScore
    });
    r.subScores = bundle.subScores; // keep sub-scores in sync on interactive recalc
    return bundle.overall;
  },

  // Weighted average across APPLICABLE dimensions only. A dimension that doesn't apply
  // (null/undefined score) is skipped and its weight redistributed — a manuscript is
  // never penalized with a fake 0 or padded with a fake 70 for a dimension that wasn't
  // measured. Also produces the Narrative Health / Language Quality sub-scores so one
  // giant number doesn't hide where the problems actually are.
  _NARRATIVE_DIMS: ['plot', 'transitions', 'dialogue', 'showTell', 'engagement', 'momentum'],
  _LANGUAGE_DIMS: ['copy', 'line', 'style', 'grammar', 'clarity', 'discipline', 'efficiency'],
  _computeScoreBundle(dimScores) {
    const W = _FICTION_WEIGHTS;
    const avg = keys => {
      let total = 0, weight = 0;
      for (const k of keys) {
        const v = dimScores[k];
        if (v == null || !Number.isFinite(v)) continue;
        const w = W[k] ?? 1;
        total += v * w; weight += w;
      }
      return weight ? Math.round(total / weight) : null;
    };
    return {
      overall: avg(Object.keys(W)) ?? 0,
      subScores: {
        narrativeHealth: avg(this._NARRATIVE_DIMS),
        languageQuality: avg(this._LANGUAGE_DIMS)
      }
    };
  },

  extractStyleFingerprint(text) {
    if (!text || text.length < 100) return null;
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avg = lengths.length ? Math.round(lengths.reduce((a,b)=>a+b,0)/lengths.length) : 15;
    const variance = lengths.length > 1
      ? Math.sqrt(lengths.reduce((a,b)=>a+(b-avg)**2,0)/lengths.length) : 0;
    const firstP = (text.match(/\b(I|me|my|mine|myself)\b/g)||[]).length;
    const thirdP = (text.match(/\b(he|she|they|him|her|them|his|hers|their)\b/gi)||[]).length;
    const pov = firstP > thirdP * 0.6 ? 'first-person' : 'third-person';
    const pastV = (text.match(/\b(was|were|had|said|felt|walked|ran|saw|knew|thought|looked|turned|moved|stood|sat|came|went|took|made|found)\b/gi)||[]).length;
    const presV = (text.match(/\b(is|are|has|says|feels|walks|runs|sees|knows|thinks|looks|turns|moves|stands|sits|comes|goes|takes|makes|finds)\b/gi)||[]).length;
    const tense = pastV >= presV ? 'past' : 'present';
    const sample = text.split(/\s+/).slice(0,600).map(w=>w.toLowerCase().replace(/[^a-z]/g,''));
    const vocabRichness = Math.round(new Set(sample).size / Math.max(sample.length,1) * 100);
    const emDashes = (text.match(/—/g)||[]).length;
    const ellipses = (text.match(/\.\.\./g)||[]).length;
    return {
      avgSentenceLen: avg,
      sentenceVariety: variance > 6 ? 'varied' : variance > 3 ? 'moderate' : 'uniform',
      pov, tense, vocabRichness,
      emDashes: emDashes > 3 ? 'frequent' : emDashes > 0 ? 'occasional' : 'rare',
      ellipses: ellipses > 2 ? 'uses' : 'avoids'
    };
  },

  fingerprintToPrompt(fp) {
    if (!fp) return '';
    return [
      fp.pov + ' narrator',
      fp.tense + ' tense',
      'avg ' + fp.avgSentenceLen + '-word sentences (' + fp.sentenceVariety + ' length)',
      fp.emDashes !== 'rare' ? fp.emDashes + ' em dashes' : null,
      fp.ellipses === 'uses' ? 'uses ellipses' : null,
      fp.vocabRichness > 65 ? 'rich vocabulary' : fp.vocabRichness > 45 ? 'moderate vocabulary' : 'plain vocabulary'
    ].filter(Boolean).join(', ');
  }
};
