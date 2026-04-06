// ManuscriptLens - Analysis Engine v2

const Analyzer = {

  // ========================
  // PASSIVE VOICE DETECTION
  // ========================
  PASSIVE_PATTERNS: [
    /\b(was|were|is|are|been|being|be)\s+(being\s+)?([\w]+ed|[\w]+en|built|caught|chosen|cut|done|drawn|driven|eaten|fallen|felt|found|forgotten|fought|given|gone|grown|heard|held|hidden|hit|hung|hurt|kept|known|laid|led|left|lent|let|lost|made|meant|met|paid|put|read|rid|run|said|sat|seen|sent|set|shot|shown|shut|sold|spent|spoken|stood|stuck|struck|sung|sworn|taken|taught|thought|thrown|told|torn|understood|woken|won|worn|written)\b/gi
  ],

  // ========================
  // ADVERB DETECTION
  // ========================
  findAdverbs(text) {
    const issues = [];
    const regex = /\b(\w+ly)\b/gi;
    let match;
    const exceptions = new Set(['only','family','early','daily','holy','lonely','friendly',
      'likely','ugly','supply','rally','belly','bully','fly','july','apply','reply',
      'multiply','ally','italy','lily','folly','jolly','tally','assembly','anomaly']);
    while ((match = regex.exec(text)) !== null) {
      if (!exceptions.has(match[1].toLowerCase())) {
        issues.push({
          type: 'adverb', text: match[1], index: match.index, length: match[1].length,
          severity: 'low',
          message: `Adverb "${match[1]}" - consider using a stronger verb instead.`,
          suggestion: `Replace "${match[1]} + verb" with a more vivid single verb.`
        });
      }
    }
    return issues;
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
          index: idx, length: cliche.length, severity: 'medium',
          message: `Cliche: "${cliche}" - this expression is overused.`,
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
  WEAK_VERBS: {
    'walked':'strode, ambled, trudged, sauntered','said':'whispered, declared, muttered, exclaimed',
    'looked':'glanced, peered, gazed, scrutinized','went':'hurried, wandered, dashed, strolled',
    'got':'obtained, acquired, seized, snatched','put':'placed, positioned, deposited, set',
    'made':'crafted, fashioned, constructed, forged','came':'arrived, emerged, appeared, materialized',
    'thought':'pondered, mused, considered, reflected','saw':'noticed, observed, spotted, witnessed',
    'ran':'sprinted, dashed, bolted, jogged','moved':'shifted, glided, crept, lunged',
    'turned':'pivoted, swiveled, whirled, rotated','felt':'sensed, experienced, detected, perceived',
    'seemed':'appeared, suggested, indicated, implied','started':'began, commenced, initiated, launched',
    'began':'commenced, initiated, embarked, undertook','stood':'towered, loomed, perched, positioned',
    'sat':'perched, settled, reclined, lounged','held':'clutched, gripped, grasped, cradled'
  },

  findWeakVerbs(text) {
    const issues = [];
    for (const [verb, alternatives] of Object.entries(this.WEAK_VERBS)) {
      const regex = new RegExp(`\\b${verb}\\b`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        issues.push({
          type: 'weak-verb', text: match[0], index: match.index, length: match[0].length,
          severity: 'low',
          message: `Weak verb "${match[0]}" - consider a more vivid alternative.`,
          suggestion: `Try: ${alternatives}`
        });
      }
    }
    return issues;
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
          index: idx, length: phrase.length, severity: 'medium',
          message: `Wordy phrase: "${phrase}"`,
          suggestion: `Replace with: "${replacement}"`
        });
        idx = lower.indexOf(phrase, idx + 1);
      }
    }
    return issues;
  },

  // ========================
  // PASSIVE VOICE
  // ========================
  findPassiveVoice(text) {
    const issues = [];
    for (const pattern of this.PASSIVE_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        issues.push({
          type: 'passive', text: match[0], index: match.index, length: match[0].length,
          severity: 'medium',
          message: `Passive voice: "${match[0]}"`,
          suggestion: 'Rewrite in active voice for stronger prose.'
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
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with',
      'by','from','is','it','its','was','were','are','be','been','being','have','has','had',
      'do','does','did','will','would','could','should','may','might','shall','can','that',
      'this','these','those','i','you','he','she','we','they','me','him','her','us','them',
      'my','your','his','our','their','not','no','so','as','if','then','than','into','up',
      'out','about','just','very','all','also','how','what','when','where','which','who']);
    for (let i = 0; i < sentences.length - 1; i++) {
      const words1 = sentences[i].toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const words2 = sentences[i + 1].toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const set1 = new Set(words1.filter(w => !stopWords.has(w)));
      for (const word of words2) {
        if (set1.has(word) && !stopWords.has(word)) {
          const sentStart = text.indexOf(sentences[i + 1]);
          const wordIdx = text.toLowerCase().indexOf(word, sentStart);
          if (wordIdx !== -1) {
            issues.push({
              type: 'repetition', text: word, index: wordIdx, length: word.length,
              severity: 'low', message: `"${word}" repeated in consecutive sentences.`,
              suggestion: 'Vary your word choice to avoid repetition.'
            });
          }
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
        issues.push({
          type: 'sentence-length',
          text: sentence.substring(0, 60) + (sentence.length > 60 ? '...' : ''),
          index: match.index, length: sentence.length,
          severity: wordCount > 50 ? 'high' : 'medium',
          message: `Long sentence (${wordCount} words). Consider breaking it up.`,
          suggestion: 'Split into 2-3 shorter sentences for better readability.'
        });
      }
    }
    return issues;
  },

  // ========================
  // SHOW VS TELL DETECTION
  // ========================
  findShowVsTell(text) {
    const issues = [];
    const tellingPatterns = [
      { regex: /\b(felt|feeling)\s+(angry|happy|sad|scared|afraid|nervous|anxious|excited|lonely|jealous|proud|guilty|ashamed|confused|frustrated|disappointed|relieved|grateful|hopeful|desperate)\b/gi, msg: 'Telling emotion instead of showing' },
      { regex: /\b(was|were|seemed|looked)\s+(beautiful|ugly|tired|angry|happy|sad|scared|afraid|nervous|excited|bored|confused|annoyed|furious|delighted|miserable|exhausted|terrified|gorgeous|handsome|attractive|hideous)\b/gi, msg: 'Telling state instead of showing' },
      { regex: /\b(obviously|clearly|evidently|apparently)\b/gi, msg: 'Telling the reader what is obvious rather than showing' },
      { regex: /\bshe knew\b|\bhe knew\b|\bthey knew\b|\bshe realized\b|\bhe realized\b/gi, msg: 'Telling internal state - show through action or dialogue' },
      { regex: /\bcould feel\b|\bcould sense\b|\bcould tell\b|\bcould see\b/gi, msg: 'Filter word - remove for more direct prose' }
    ];
    for (const { regex, msg } of tellingPatterns) {
      let match;
      const r = new RegExp(regex.source, regex.flags);
      while ((match = r.exec(text)) !== null) {
        issues.push({
          type: 'show-tell', text: match[0], index: match.index, length: match[0].length,
          severity: 'medium', message: `${msg}: "${match[0]}"`,
          suggestion: 'Show through action, dialogue, or sensory detail instead.'
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
    const maxStarterRepeat = Math.max(...Object.values(starterCounts));
    const starterVariety = Object.keys(starterCounts).length / starters.length;
    const declarative = (text.match(/[^.!?]*\./g) || []).length;
    const interrogative = (text.match(/[^.!?]*\?/g) || []).length;
    const exclamatory = (text.match(/[^.!?]*!/g) || []).length;
    let score = 70;
    if (stdDev > 5) score += 10;
    if (stdDev > 8) score += 5;
    if (starterVariety > 0.6) score += 10;
    if (maxStarterRepeat > sentences.length * 0.2) score -= 15;
    if (interrogative > 0) score += 3;
    if (exclamatory > 0) score += 2;
    return {
      score: Math.min(100, Math.max(0, score)),
      avgLength: Math.round(avg), stdDev: Math.round(stdDev * 10) / 10,
      totalSentences: sentences.length,
      starterVariety: Math.round(starterVariety * 100),
      types: { declarative, interrogative, exclamatory }
    };
  },

  // ========================
  // GENRE DETECTION (FIXED)
  // ========================
  detectGenre(text) {
    const lower = text.toLowerCase();
    const scores = { fiction: 0, scifi: 0, nonfiction: 0, fantasy: 0, thriller: 0 };

    // Sci-fi indicators
    const scifiWords = ['spaceship','galaxy','planet','alien','robot','android','laser',
      'cybernetic','hologram','warp','hyperspace','terraforming','quantum','nanobots',
      'dystopia','utopia','cyborg','artificial intelligence','starship','colonize',
      'interstellar','dimension','futuristic','simulation','clone','mutation','spacecraft'];
    scifiWords.forEach(w => { if (lower.includes(w)) scores.scifi += 3; });

    // Fantasy indicators
    const fantasyWords = ['dragon','wizard','magic','sword','kingdom','castle','spell',
      'enchanted','elf','dwarf','quest','prophecy','sorcerer','mythical','realm',
      'throne','potion','wand','goblin','troll','knight','ancient'];
    fantasyWords.forEach(w => { if (lower.includes(w)) scores.fantasy += 3; });

    // Thriller indicators
    const thrillerWords = ['murder','detective','suspect','crime','investigate','weapon',
      'victim','witness','chase','escape','danger','threat','conspiracy','assassin',
      'knife','gun','blood','shadow','followed','stalked'];
    thrillerWords.forEach(w => { if (lower.includes(w)) scores.thriller += 3; });

    // Fiction indicators - IMPROVED
    const dialogueCount = (text.match(/[""\u201C][^""\u201D]*[""\u201D]/g) || []).length;
    if (dialogueCount > 3) scores.fiction += 15;
    if (dialogueCount > 10) scores.fiction += 10;
    if (dialogueCount > 20) scores.fiction += 10;

    // Narrative past tense patterns (strong fiction signal)
    const narrativePatterns = (text.match(/\b(he|she|they|it)\s+(said|walked|looked|turned|stood|sat|ran|felt|knew|thought|asked|whispered|replied|nodded|shook|grabbed|pulled|pushed|stepped|moved|watched|stared|smiled|laughed|cried|screamed|shouted|muttered|sighed|gasped|frowned)\b/gi) || []).length;
    if (narrativePatterns > 3) scores.fiction += 15;
    if (narrativePatterns > 10) scores.fiction += 10;

    // Sensory/emotional language (fiction signal)
    const sensoryWords = ['heart pounding','eyes narrowing','hands trembling','voice steady',
      'breath caught','stomach churned','skin crawled','blood ran cold','pulse racing',
      'tears','sobbed','grinned','smirked','scowled','grimaced','shuddered','flinched'];
    sensoryWords.forEach(w => { if (lower.includes(w)) scores.fiction += 2; });

    // Character names (proper nouns appearing multiple times)
    const properNouns = text.match(/\b[A-Z][a-z]{2,}\b/g) || [];
    const nameFreq = {};
    properNouns.forEach(n => { nameFreq[n] = (nameFreq[n] || 0) + 1; });
    const recurringNames = Object.values(nameFreq).filter(c => c >= 3).length;
    if (recurringNames >= 2) scores.fiction += 10;

    // Nonfiction indicators (FIXED - removed ambiguous words)
    const nonfictionWords = ['research','study','according to','evidence','data','analysis',
      'conclusion','hypothesis','methodology','statistics','furthermore','therefore',
      'consequently','in conclusion'];
    nonfictionWords.forEach(w => { if (lower.includes(w)) scores.nonfiction += 3; });

    // Academic/formal structure
    const hasNumberedSections = (text.match(/^\d+\.\s/gm) || []).length > 3;
    const hasCitations = (text.match(/\(\d{4}\)/g) || []).length > 2;
    if (hasNumberedSections) scores.nonfiction += 8;
    if (hasCitations) scores.nonfiction += 10;

    // Determine primary genre - default to fiction when ambiguous
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    let primary = sorted[0][1] > 0 ? sorted[0][0] : 'fiction';

    // If fiction-family genres win, check sub-genre
    if (['scifi','fantasy','thriller'].includes(primary)) {
      // These are sub-genres of fiction, keep them
    } else if (primary === 'nonfiction' && scores.fiction >= scores.nonfiction * 0.6) {
      primary = 'fiction'; // Fiction signals close enough, default to fiction
    }

    const genreLabels = {
      fiction:'Fiction', scifi:'Science Fiction', nonfiction:'Nonfiction',
      fantasy:'Fantasy', thriller:'Thriller/Mystery'
    };
    return { primary, label: genreLabels[primary], scores };
  },

  // ========================
  // PLOT STRUCTURE ANALYSIS
  // ========================
  analyzePlot(text) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const totalParagraphs = paragraphs.length;
    if (totalParagraphs < 3) {
      return { score: 50, arc: 'too-short', details: 'Text too short for meaningful plot analysis.', hasRisingAction: false, hasClimax: false, hasResolution: false, paragraphCount: totalParagraphs, quarters: [] };
    }
    const tensionWords = ['but','however','suddenly','unfortunately','despite','conflict',
      'struggle','fight','danger','threat','problem','challenge','crisis','desperate',
      'fear','terror','shock','scream','panic','crash','explosion','death','kill',
      'attack','escape','chase','reveal','secret','betray','confront','demand'];
    const resolutionWords = ['finally','resolved','peace','understand','accept','together',
      'smile','hope','light','dawn','new','begin','realize','truth','answer',
      'embrace','forgive','heal','return','home','safe','calm'];
    const quarterSize = Math.ceil(totalParagraphs / 4);
    const quarters = [];
    for (let i = 0; i < 4; i++) {
      const start = i * quarterSize;
      const end = Math.min(start + quarterSize, totalParagraphs);
      const section = paragraphs.slice(start, end).join(' ').toLowerCase();
      let tension = 0, resolution = 0;
      tensionWords.forEach(w => { const m = section.match(new RegExp(`\\b${w}\\b`, 'g')); if (m) tension += m.length; });
      resolutionWords.forEach(w => { const m = section.match(new RegExp(`\\b${w}\\b`, 'g')); if (m) resolution += m.length; });
      quarters.push({ tension, resolution, wordCount: section.split(/\s+/).length });
    }
    let score = 60;
    const hasRisingAction = quarters[1].tension > quarters[0].tension;
    const hasClimax = quarters[2].tension >= quarters[1].tension || quarters[2].tension >= quarters[0].tension;
    const hasResolution = quarters[3].resolution > quarters[2].resolution || quarters[3].tension < quarters[2].tension;
    if (hasRisingAction) score += 12;
    if (hasClimax) score += 12;
    if (hasResolution) score += 12;
    const wordCounts = quarters.map(q => q.wordCount);
    const avgWords = wordCounts.reduce((a, b) => a + b, 0) / 4;
    const paceVariance = wordCounts.reduce((sum, w) => sum + Math.pow(w - avgWords, 2), 0) / 4;
    if (paceVariance < avgWords * avgWords * 0.25) score += 4;
    let arcType = 'flat';
    if (hasRisingAction && hasClimax && hasResolution) arcType = 'classic';
    else if (hasRisingAction && hasClimax) arcType = 'rising';
    else if (hasResolution) arcType = 'resolution-focused';
    return { score: Math.min(100, Math.max(0, score)), arc: arcType, quarters, hasRisingAction, hasClimax, hasResolution, paragraphCount: totalParagraphs };
  },

  // ========================
  // TRANSITION ANALYSIS
  // ========================
  analyzeTransitions(text) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    if (paragraphs.length < 2) return { score: 50, totalParagraphs: paragraphs.length, transitionsUsed: 0, smoothTransitions: 0, smoothRate: 0, details: [] };
    const transitionWords = new Set([
      'however','moreover','furthermore','meanwhile','consequently','therefore',
      'nevertheless','nonetheless','additionally','similarly','conversely',
      'in contrast','on the other hand','as a result','in addition','for example',
      'for instance','in other words','in fact','indeed','likewise','accordingly',
      'thus','hence','still','yet','also','then','next','finally','afterwards',
      'later','before','after','during','while','although','though','even though',
      'because','since','when','once','until','unless']);
    let transitionsUsed = 0, smoothTransitions = 0;
    const transitionDetails = [];
    for (let i = 1; i < paragraphs.length; i++) {
      const currStart = paragraphs[i].trim().split(/\s+/).slice(0, 8).join(' ').toLowerCase();
      let hasTransition = false;
      for (const tw of transitionWords) {
        if (currStart.includes(tw)) { hasTransition = true; transitionsUsed++; break; }
      }
      const prevWords = new Set(paragraphs[i-1].toLowerCase().match(/\b[a-z]{4,}\b/g) || []);
      const currWords = paragraphs[i].toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const shared = currWords.filter(w => prevWords.has(w)).length;
      const continuity = shared / Math.max(currWords.length, 1);
      if (hasTransition || continuity > 0.15) smoothTransitions++;
      transitionDetails.push({ paragraph: i+1, hasTransitionWord: hasTransition, continuityScore: Math.round(continuity*100), smooth: hasTransition || continuity > 0.15 });
    }
    const smoothRate = smoothTransitions / (paragraphs.length - 1);
    let score = Math.round(smoothRate * 80 + 20);
    const transitionRate = transitionsUsed / (paragraphs.length - 1);
    if (transitionRate > 0.3 && transitionRate < 0.7) score = Math.min(score + 10, 100);
    return { score: Math.min(100, Math.max(0, score)), totalParagraphs: paragraphs.length, transitionsUsed, smoothTransitions, smoothRate: Math.round(smoothRate * 100), details: transitionDetails };
  },

  // ========================
  // DIALOGUE ANALYSIS
  // ========================
  analyzeDialogue(text) {
    const dialogueMatches = text.match(/[""\u201C][^""\u201D]*[""\u201D]/g) || [];
    const dialogueCount = dialogueMatches.length;
    const totalWords = text.split(/\s+/).length;
    if (dialogueCount === 0) return { score: 50, count: 0, ratio: 0, tags: {}, saidRatio: 0, avgLength: 0 };
    const dialogueWords = dialogueMatches.reduce((sum, d) => sum + d.split(/\s+/).length, 0);
    const ratio = dialogueWords / totalWords;
    const tagPatterns = text.match(/[""\u201D]\s*(said|asked|whispered|shouted|muttered|replied|exclaimed|declared|murmured|yelled|cried|answered|stated|remarked|noted|suggested|demanded|insisted|pleaded|warned|admitted|announced|argued|claimed|complained|confirmed|denied|explained|observed|protested|responded|sighed|snapped|stammered)\b/gi) || [];
    const tags = {};
    tagPatterns.forEach(t => { const verb = t.replace(/[""\u201D]\s*/, '').toLowerCase(); tags[verb] = (tags[verb] || 0) + 1; });
    const saidCount = tags['said'] || 0;
    const totalTags = tagPatterns.length;
    const saidRatio = totalTags > 0 ? saidCount / totalTags : 0;
    let score = 65;
    if (ratio > 0.1 && ratio < 0.5) score += 10;
    if (Object.keys(tags).length > 3) score += 10;
    if (saidRatio < 0.7) score += 10;
    if (saidRatio > 0.85) score -= 10;
    const lengths = dialogueMatches.map(d => d.split(/\s+/).length);
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const lenVariance = lengths.reduce((sum, l) => sum + Math.pow(l - avgLen, 2), 0) / lengths.length;
    if (Math.sqrt(lenVariance) > 3) score += 5;
    return { score: Math.min(100, Math.max(0, score)), count: dialogueCount, ratio: Math.round(ratio * 100), tags, saidRatio: Math.round(saidRatio * 100), avgLength: Math.round(avgLen) };
  },

  // ========================
  // STYLE ANALYSIS
  // ========================
  analyzeStyle(text) {
    const words = text.match(/\b[a-z']+\b/gi) || [];
    const totalWords = words.length;
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    const lexicalDiversity = uniqueWords.size / Math.max(totalWords, 1);
    const avgWordLen = words.reduce((sum, w) => sum + w.length, 0) / Math.max(totalWords, 1);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const paraLengths = paragraphs.map(p => p.split(/\s+/).length);
    const avgParaLen = paraLengths.reduce((a, b) => a + b, 0) / Math.max(paraLengths.length, 1);
    const firstPerson = (text.match(/\bI\b/g) || []).length;
    const thirdPerson = (text.match(/\b(he|she|they)\b/gi) || []).length;
    const povConsistency = Math.abs(firstPerson - thirdPerson) / Math.max(firstPerson + thirdPerson, 1);
    let score = 60;
    if (lexicalDiversity > 0.4) score += 10;
    if (lexicalDiversity > 0.55) score += 5;
    if (avgWordLen > 4 && avgWordLen < 6) score += 5;
    if (povConsistency > 0.5) score += 10;
    const pov = firstPerson > thirdPerson * 2 ? 'First Person' : thirdPerson > firstPerson * 2 ? 'Third Person' : 'Mixed';
    return { score: Math.min(100, Math.max(0, score)), totalWords, uniqueWords: uniqueWords.size, lexicalDiversity: Math.round(lexicalDiversity * 100), avgWordLength: Math.round(avgWordLen * 10) / 10, avgParagraphLength: Math.round(avgParaLen), pov, paragraphCount: paragraphs.length };
  },

  // ========================
  // PACING ANALYSIS
  // ========================
  analyzePacing(text) {
    const words = text.split(/\s+/);
    const segmentSize = 200;
    const segments = [];
    for (let i = 0; i < words.length; i += segmentSize) {
      const chunk = words.slice(i, i + segmentSize).join(' ');
      const chunkLower = chunk.toLowerCase();
      const wordCount = Math.min(segmentSize, words.length - i);
      // Action density
      const actionWords = (chunkLower.match(/\b(ran|jumped|fought|grabbed|threw|slammed|crashed|bolted|sprinted|dodged|punched|kicked|fired|chased|escaped|attacked|blocked|dove|lunged|swung|struck|smashed|raced|rushed|burst|charged|leaped|dashed)\b/g) || []).length;
      // Dialogue density
      const dialogueLines = (chunk.match(/[""\u201C][^""\u201D]*[""\u201D]/g) || []).length;
      // Description density
      const descWords = (chunkLower.match(/\b(beautiful|vast|dark|bright|ancient|massive|tiny|enormous|gleaming|shadowy|crimson|golden|silver|towering|sprawling|weathered|ornate|rustic|pristine|desolate)\b/g) || []).length;
      const actionDensity = actionWords / wordCount * 100;
      const dialogueDensity = dialogueLines * 10 / wordCount * 100;
      const descriptionDensity = descWords / wordCount * 100;
      let type = 'exposition';
      if (actionDensity > 2) type = 'action';
      else if (dialogueDensity > 3) type = 'dialogue';
      else if (descriptionDensity > 2) type = 'description';
      else if ((chunkLower.match(/\b(thought|felt|wondered|realized|remembered|considered|reflected|pondered|mused)\b/g) || []).length > 2) type = 'reflection';
      segments.push({ type, actionDensity: Math.round(actionDensity * 10) / 10, dialogueDensity: Math.round(dialogueDensity * 10) / 10, descriptionDensity: Math.round(descriptionDensity * 10) / 10, wordCount });
    }
    return { segments };
  },

  // ========================
  // CHARACTER TRACKING
  // ========================
  analyzeCharacters(text) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    // Find proper nouns (capitalized words not at sentence start)
    const candidates = {};
    const sentenceStartWords = new Set();
    text.split(/[.!?]+/).forEach(s => {
      const first = s.trim().split(/\s+/)[0];
      if (first) sentenceStartWords.add(first);
    });
    // Common non-name capitalized words
    const skipWords = new Set(['The','A','An','In','On','At','To','For','It','He','She','They','We','You','I','My','His','Her','Our','Their','This','That','These','Those','But','And','Or','If','So','Yet','Not','Was','Were','Is','Are','Has','Had','Have','Do','Does','Did','Will','Would','Could','Should','May','Might','Can','Just','Now','Then','Here','There','When','Where','How','What','Who','Why','Which','After','Before','During','While','Although','Because','Since','Until','Unless','Chapter','Part','Section','One','Two','Three','Four','Five']);
    const nameRegex = /\b([A-Z][a-z]{2,})\b/g;
    let match;
    while ((match = nameRegex.exec(text)) !== null) {
      const name = match[0];
      if (!skipWords.has(name)) {
        if (!candidates[name]) candidates[name] = { mentions: 0, paragraphs: new Set(), dialogueCount: 0 };
        candidates[name].mentions++;
        // Find which paragraph
        let charCount = 0;
        for (let p = 0; p < paragraphs.length; p++) {
          charCount += paragraphs[p].length + 2;
          if (match.index < charCount) { candidates[name].paragraphs.add(p); break; }
        }
      }
    }
    // Check dialogue attribution
    const dialogueAttr = text.match(/[""\u201D]\s*([A-Z][a-z]+)\s+(said|asked|whispered|replied|muttered|exclaimed|shouted|cried)/g) || [];
    dialogueAttr.forEach(d => {
      const nameMatch = d.match(/[""\u201D]\s*([A-Z][a-z]+)/);
      if (nameMatch && candidates[nameMatch[1]]) candidates[nameMatch[1]].dialogueCount++;
    });
    // Filter to recurring characters (3+ mentions)
    const list = Object.entries(candidates)
      .filter(([_, data]) => data.mentions >= 3)
      .sort((a, b) => b[1].mentions - a[1].mentions)
      .map(([name, data]) => ({
        name, mentions: data.mentions,
        paragraphs: Array.from(data.paragraphs).sort((a,b) => a-b),
        dialogueCount: data.dialogueCount
      }));
    return { list };
  },

  // ========================
  // READER'S PERSPECTIVE
  // ========================
  analyzeReaderPerspective(text) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const totalWords = text.split(/\s+/).length;
    const lower = text.toLowerCase();

    // Hook strength - analyze first paragraph
    const firstPara = paragraphs[0] || '';
    let hookStrength = 40;
    if (firstPara.includes('?')) hookStrength += 10; // Question hook
    if ((firstPara.match(/[""\u201C]/g) || []).length > 0) hookStrength += 10; // Opens with dialogue
    if (firstPara.split(/\s+/).length < 50) hookStrength += 5; // Concise opening
    const tensionInOpening = (firstPara.toLowerCase().match(/\b(danger|fear|mystery|secret|death|blood|shadow|dark|strange|suddenly|never|always)\b/g) || []).length;
    if (tensionInOpening > 0) hookStrength += tensionInOpening * 5;
    hookStrength = Math.min(100, hookStrength);

    // Emotional word density
    const emotionWords = (lower.match(/\b(love|hate|fear|anger|joy|sadness|grief|terror|hope|despair|rage|jealousy|shame|guilt|pride|longing|anxiety|excitement|dread|relief|sorrow|anguish|fury|bliss|agony|ecstasy|panic|horror)\b/g) || []).length;
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

    // Clarity score
    let clarityScore = 80;
    // Check for unclear pronoun references
    const pronounDensity = (lower.match(/\b(he|she|they|it|him|her|them)\b/g) || []).length / totalWords;
    if (pronounDensity > 0.06) clarityScore -= 15;
    // Too many characters introduced early
    const firstQuarterNames = {};
    const firstQuarter = paragraphs.slice(0, Math.ceil(paragraphs.length / 4)).join(' ');
    (firstQuarter.match(/\b[A-Z][a-z]{2,}\b/g) || []).forEach(n => { firstQuarterNames[n] = true; });
    if (Object.keys(firstQuarterNames).length > 6) clarityScore -= 10;
    clarityScore = Math.max(30, Math.min(100, clarityScore));

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

    // DNF Risk
    let dnfRisk = 30; // base
    if (hookStrength < 50) dnfRisk += 20;
    if (avgParaLen > 120) dnfRisk += 15;
    if (clarityScore < 60) dnfRisk += 15;
    if (emotionalConnection < 20) dnfRisk += 10;
    dnfRisk = Math.min(100, Math.max(5, dnfRisk));

    // Overall verdict
    let overallVerdict = 'Solid manuscript with good reader engagement.';
    if (engagementScore >= 80) overallVerdict = 'Highly engaging! Readers will have a hard time putting this down.';
    else if (engagementScore >= 60) overallVerdict = 'Good engagement overall. A few areas could be tightened to keep readers hooked.';
    else if (engagementScore >= 40) overallVerdict = 'Moderate engagement. Consider strengthening hooks, pacing, and emotional resonance.';
    else overallVerdict = 'Needs work on engagement. Focus on a stronger opening, clearer stakes, and emotional connection.';

    return { engagementScore, hookStrength, pageturnerScore, emotionalConnection, pacingFeel, clarityScore, immersionBreakers, emotionalJourney, dnfRisk, overallVerdict };
  },

  // ========================
  // GRAMMAR API
  // ========================
  async checkGrammarAPI(text, apiKey) {
    try {
      const response = await fetch('https://spelling-and-grammar-check-summarize-tool-compare-text.p.rapidapi.com/check', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'spelling-and-grammar-check-summarize-tool-compare-text.p.rapidapi.com'
        },
        body: JSON.stringify({ text: text.substring(0, 5000) }) // API limit
      });
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Grammar API error:', err);
      return { error: err.message };
    }
  },

  // ========================
  // COPY EDITING SCORE
  // ========================
  scoreCopyEditing(issues, totalWords) {
    const issuesPerThousand = (issues.length / Math.max(totalWords, 1)) * 1000;
    let score = 100;
    score -= Math.min(40, issuesPerThousand * 3);
    const highSev = issues.filter(i => i.severity === 'high').length;
    const medSev = issues.filter(i => i.severity === 'medium').length;
    score -= highSev * 3;
    score -= medSev * 1;
    return Math.min(100, Math.max(0, Math.round(score)));
  },

  // ========================
  // FULL ANALYSIS
  // ========================
  analyze(text) {
    if (!text || text.trim().length < 50) {
      return { error: 'Text too short for meaningful analysis. Please provide at least a few paragraphs.' };
    }

    const passiveIssues = this.findPassiveVoice(text);
    const adverbIssues = this.findAdverbs(text);
    const clicheIssues = this.findCliches(text);
    const weakVerbIssues = this.findWeakVerbs(text);
    const wordyIssues = this.findWordyPhrases(text);
    const repetitionIssues = this.findRepetitions(text);
    const longSentenceIssues = this.findLongSentences(text);
    const showTellIssues = this.findShowVsTell(text);

    const allIssues = [
      ...passiveIssues, ...adverbIssues, ...clicheIssues,
      ...weakVerbIssues, ...wordyIssues, ...repetitionIssues,
      ...longSentenceIssues, ...showTellIssues
    ].sort((a, b) => a.index - b.index);

    const plot = this.analyzePlot(text);
    const transitions = this.analyzeTransitions(text);
    const dialogue = this.analyzeDialogue(text);
    const style = this.analyzeStyle(text);
    const sentenceVariety = this.analyzeSentenceVariety(text);
    const readability = this.fleschKincaid(text);
    const genre = this.detectGenre(text);
    const readerPerspective = this.analyzeReaderPerspective(text);
    const pacing = this.analyzePacing(text);
    const characters = this.analyzeCharacters(text);

    const totalWords = (text.match(/\b\w+\b/g) || []).length;
    const copyScore = this.scoreCopyEditing(allIssues, totalWords);
    const lineScore = Math.round((sentenceVariety.score + Math.min(100, Math.max(0, readability.ease))) / 2);
    const showTellScore = Math.max(0, 100 - showTellIssues.length * 5);

    const overall = Math.round(
      plot.score * 0.15 +
      transitions.score * 0.1 +
      copyScore * 0.2 +
      lineScore * 0.15 +
      style.score * 0.1 +
      dialogue.score * 0.1 +
      readerPerspective.engagementScore * 0.1 +
      showTellScore * 0.1
    );

    return {
      overall, genre, totalWords,
      scores: {
        plot: plot.score, transitions: transitions.score, copy: copyScore,
        line: lineScore, style: style.score, dialogue: dialogue.score,
        showTell: showTellScore, grammar: 0
      },
      plot, transitions, dialogue, style, sentenceVariety, readability,
      readerPerspective, pacing, characters,
      showTell: { score: showTellScore, issues: showTellIssues },
      issues: allIssues,
      issueCounts: {
        passive: passiveIssues.length, adverb: adverbIssues.length,
        cliche: clicheIssues.length, 'weak-verb': weakVerbIssues.length,
        wordy: wordyIssues.length, repetition: repetitionIssues.length,
        'sentence-length': longSentenceIssues.length, 'show-tell': showTellIssues.length
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
  }
};
