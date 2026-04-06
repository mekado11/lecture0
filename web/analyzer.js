// ManuscriptLens - Analysis Engine

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
    const exceptions = new Set(['only', 'family', 'early', 'daily', 'holy', 'lonely', 'friendly',
      'likely', 'ugly', 'supply', 'rally', 'belly', 'bully', 'fly', 'july', 'apply', 'reply',
      'multiply', 'ally', 'italy', 'lily', 'folly', 'jolly', 'tally', 'assembly', 'anomaly']);
    while ((match = regex.exec(text)) !== null) {
      if (!exceptions.has(match[1].toLowerCase())) {
        issues.push({
          type: 'adverb',
          text: match[1],
          index: match.index,
          length: match[1].length,
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
    'at the end of the day', 'few and far between', 'in the nick of time',
    'it was a dark and stormy night', 'all that glitters is not gold',
    'better late than never', 'beat around the bush', 'bite the bullet',
    'break the ice', 'burning the midnight oil', 'caught red-handed',
    'cold as ice', 'cool as a cucumber', 'cry over spilt milk',
    'dead as a doornail', 'diamond in the rough', 'easy as pie',
    'fit as a fiddle', 'go the extra mile', 'heart of gold',
    'hit the nail on the head', 'icing on the cake', 'in a nutshell',
    'kill two birds with one stone', 'last but not least', 'leave no stone unturned',
    'let the cat out of the bag', 'light at the end of the tunnel',
    'once in a blue moon', 'piece of cake', 'read between the lines',
    'right as rain', 'sharp as a tack', 'sick as a dog',
    'take it with a grain of salt', 'the apple of my eye', 'the calm before the storm',
    'the grass is always greener', 'the tip of the iceberg', 'think outside the box',
    'time heals all wounds', 'under the weather', 'when pigs fly',
    'a chip on your shoulder', 'add insult to injury', 'back to the drawing board',
    'barking up the wrong tree', 'blood is thicker than water',
    'butterflies in my stomach', 'caught between a rock and a hard place',
    'every cloud has a silver lining', 'head over heels', 'hit the ground running',
    'it takes two to tango', 'jump on the bandwagon', 'keep your chin up',
    'let sleeping dogs lie', 'method to the madness', 'needle in a haystack',
    'on thin ice', 'pull yourself together', 'raining cats and dogs',
    'see eye to eye', 'steal someone\'s thunder', 'take the bull by the horns',
    'the best of both worlds', 'the elephant in the room', 'the whole nine yards',
    'tip of the iceberg', 'turn a blind eye', 'two peas in a pod',
    'up in the air', 'water under the bridge', 'wear your heart on your sleeve'
  ],

  findCliches(text) {
    const issues = [];
    const lower = text.toLowerCase();
    for (const cliche of this.CLICHES) {
      let idx = lower.indexOf(cliche);
      while (idx !== -1) {
        issues.push({
          type: 'cliche',
          text: text.substring(idx, idx + cliche.length),
          index: idx,
          length: cliche.length,
          severity: 'medium',
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
    'walked': 'strode, ambled, trudged, sauntered',
    'said': 'whispered, declared, muttered, exclaimed',
    'looked': 'glanced, peered, gazed, scrutinized',
    'went': 'hurried, wandered, dashed, strolled',
    'got': 'obtained, acquired, seized, snatched',
    'put': 'placed, positioned, deposited, set',
    'made': 'crafted, fashioned, constructed, forged',
    'came': 'arrived, emerged, appeared, materialized',
    'thought': 'pondered, mused, considered, reflected',
    'saw': 'noticed, observed, spotted, witnessed',
    'ran': 'sprinted, dashed, bolted, jogged',
    'moved': 'shifted, glided, crept, lunged',
    'turned': 'pivoted, swiveled, whirled, rotated',
    'felt': 'sensed, experienced, detected, perceived',
    'seemed': 'appeared, suggested, indicated, implied',
    'started': 'began, commenced, initiated, launched',
    'began': 'commenced, initiated, embarked, undertook',
    'stood': 'towered, loomed, perched, positioned',
    'sat': 'perched, settled, reclined, lounged',
    'held': 'clutched, gripped, grasped, cradled'
  },

  findWeakVerbs(text) {
    const issues = [];
    for (const [verb, alternatives] of Object.entries(this.WEAK_VERBS)) {
      const regex = new RegExp(`\\b${verb}\\b`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        issues.push({
          type: 'weak-verb',
          text: match[0],
          index: match.index,
          length: match[0].length,
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
    'in order to': 'to',
    'due to the fact that': 'because',
    'in the event that': 'if',
    'at this point in time': 'now',
    'for the purpose of': 'to',
    'in spite of the fact that': 'although',
    'on account of': 'because',
    'in the process of': 'while',
    'has the ability to': 'can',
    'is able to': 'can',
    'it is important to note that': '(omit)',
    'the fact that': '(omit or rephrase)',
    'a large number of': 'many',
    'a majority of': 'most',
    'at the present time': 'now',
    'by means of': 'by',
    'each and every': 'each',
    'first and foremost': 'first',
    'give consideration to': 'consider',
    'in close proximity to': 'near',
    'in the near future': 'soon',
    'make a decision': 'decide',
    'on a daily basis': 'daily',
    'prior to': 'before',
    'subsequent to': 'after',
    'take into consideration': 'consider',
    'with regard to': 'about',
    'with the exception of': 'except'
  },

  findWordyPhrases(text) {
    const issues = [];
    const lower = text.toLowerCase();
    for (const [phrase, replacement] of Object.entries(this.WORDY_PHRASES)) {
      let idx = lower.indexOf(phrase);
      while (idx !== -1) {
        issues.push({
          type: 'wordy',
          text: text.substring(idx, idx + phrase.length),
          index: idx,
          length: phrase.length,
          severity: 'medium',
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
          type: 'passive',
          text: match[0],
          index: match.index,
          length: match[0].length,
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

    // Check nearby sentences for repeated significant words
    for (let i = 0; i < sentences.length - 1; i++) {
      const words1 = sentences[i].toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const words2 = sentences[i + 1].toLowerCase().match(/\b[a-z]{4,}\b/g) || [];

      const set1 = new Set(words1.filter(w => !stopWords.has(w)));
      for (const word of words2) {
        if (set1.has(word) && !stopWords.has(word)) {
          // Find the position in the original text
          const sentStart = text.indexOf(sentences[i + 1]);
          const wordIdx = text.toLowerCase().indexOf(word, sentStart);
          if (wordIdx !== -1) {
            issues.push({
              type: 'repetition',
              text: word,
              index: wordIdx,
              length: word.length,
              severity: 'low',
              message: `"${word}" repeated in consecutive sentences.`,
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
          index: match.index,
          length: sentence.length,
          severity: wordCount > 50 ? 'high' : 'medium',
          message: `Long sentence (${wordCount} words). Consider breaking it up.`,
          suggestion: 'Split into 2-3 shorter sentences for better readability.'
        });
      }
    }
    return issues;
  },

  // ========================
  // READABILITY SCORE (Flesch-Kincaid)
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

    // Check sentence starters
    const starters = sentences.map(s => s.trim().split(/\s+/)[0]?.toLowerCase());
    const starterCounts = {};
    starters.forEach(s => { if (s) starterCounts[s] = (starterCounts[s] || 0) + 1; });
    const maxStarterRepeat = Math.max(...Object.values(starterCounts));
    const starterVariety = Object.keys(starterCounts).length / starters.length;

    // Sentence type distribution
    const declarative = (text.match(/[^.!?]*\./g) || []).length;
    const interrogative = (text.match(/[^.!?]*\?/g) || []).length;
    const exclamatory = (text.match(/[^.!?]*!/g) || []).length;

    // Score: higher variety = better
    let score = 70;
    if (stdDev > 5) score += 10;
    if (stdDev > 8) score += 5;
    if (starterVariety > 0.6) score += 10;
    if (maxStarterRepeat > sentences.length * 0.2) score -= 15;
    if (interrogative > 0) score += 3;
    if (exclamatory > 0) score += 2;

    return {
      score: Math.min(100, Math.max(0, score)),
      avgLength: Math.round(avg),
      stdDev: Math.round(stdDev * 10) / 10,
      totalSentences: sentences.length,
      starterVariety: Math.round(starterVariety * 100),
      types: { declarative, interrogative, exclamatory }
    };
  },

  // ========================
  // GENRE DETECTION
  // ========================
  detectGenre(text) {
    const lower = text.toLowerCase();
    const scores = { fiction: 0, scifi: 0, nonfiction: 0, fantasy: 0, thriller: 0 };

    // Sci-fi indicators
    const scifiWords = ['spaceship', 'galaxy', 'planet', 'alien', 'robot', 'android', 'laser',
      'cybernetic', 'hologram', 'warp', 'hyperspace', 'terraforming', 'quantum', 'nanobots',
      'dystopia', 'utopia', 'cyborg', 'artificial intelligence', 'starship', 'colonize',
      'interstellar', 'dimension', 'futuristic', 'simulation', 'clone', 'mutation', 'spacecraft'];
    scifiWords.forEach(w => { if (lower.includes(w)) scores.scifi += 3; });

    // Fantasy indicators
    const fantasyWords = ['dragon', 'wizard', 'magic', 'sword', 'kingdom', 'castle', 'spell',
      'enchanted', 'elf', 'dwarf', 'quest', 'prophecy', 'sorcerer', 'mythical', 'realm',
      'throne', 'potion', 'wand', 'goblin', 'troll', 'knight', 'ancient'];
    fantasyWords.forEach(w => { if (lower.includes(w)) scores.fantasy += 3; });

    // Thriller indicators
    const thrillerWords = ['murder', 'detective', 'suspect', 'crime', 'investigate', 'weapon',
      'victim', 'witness', 'chase', 'escape', 'danger', 'threat', 'conspiracy', 'assassin'];
    thrillerWords.forEach(w => { if (lower.includes(w)) scores.thriller += 3; });

    // Fiction indicators (dialogue, character actions)
    const dialogueCount = (text.match(/[""][^""]*[""]/g) || []).length;
    if (dialogueCount > 5) scores.fiction += 10;
    if (dialogueCount > 20) scores.fiction += 10;

    // Nonfiction indicators
    const nonfictionWords = ['research', 'study', 'according to', 'evidence', 'data', 'analysis',
      'conclusion', 'hypothesis', 'methodology', 'statistics', 'furthermore', 'therefore',
      'consequently', 'in conclusion', 'chapter', 'argument', 'perspective'];
    nonfictionWords.forEach(w => { if (lower.includes(w)) scores.nonfiction += 3; });

    // Determine primary genre
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const primary = sorted[0][1] > 0 ? sorted[0][0] : 'fiction';
    const genreLabels = {
      fiction: 'Fiction', scifi: 'Science Fiction', nonfiction: 'Nonfiction',
      fantasy: 'Fantasy', thriller: 'Thriller/Mystery'
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
      return { score: 50, arc: 'too-short', details: 'Text too short for meaningful plot analysis.' };
    }

    // Tension/conflict word tracking across sections
    const tensionWords = ['but', 'however', 'suddenly', 'unfortunately', 'despite', 'conflict',
      'struggle', 'fight', 'danger', 'threat', 'problem', 'challenge', 'crisis', 'desperate',
      'fear', 'terror', 'shock', 'scream', 'panic', 'crash', 'explosion', 'death', 'kill',
      'attack', 'escape', 'chase', 'reveal', 'secret', 'betray', 'confront', 'demand'];

    const resolutionWords = ['finally', 'resolved', 'peace', 'understand', 'accept', 'together',
      'smile', 'hope', 'light', 'dawn', 'new', 'begin', 'realize', 'truth', 'answer',
      'embrace', 'forgive', 'heal', 'return', 'home', 'safe', 'calm'];

    // Divide text into quarters for arc analysis
    const quarterSize = Math.ceil(totalParagraphs / 4);
    const quarters = [];
    for (let i = 0; i < 4; i++) {
      const start = i * quarterSize;
      const end = Math.min(start + quarterSize, totalParagraphs);
      const section = paragraphs.slice(start, end).join(' ').toLowerCase();
      let tension = 0;
      let resolution = 0;
      tensionWords.forEach(w => { const matches = section.match(new RegExp(`\\b${w}\\b`, 'g')); if (matches) tension += matches.length; });
      resolutionWords.forEach(w => { const matches = section.match(new RegExp(`\\b${w}\\b`, 'g')); if (matches) resolution += matches.length; });
      quarters.push({ tension, resolution, wordCount: section.split(/\s+/).length });
    }

    // Evaluate arc shape
    let score = 60;
    const hasRisingAction = quarters[1].tension > quarters[0].tension;
    const hasClimax = quarters[2].tension >= quarters[1].tension || quarters[2].tension >= quarters[0].tension;
    const hasResolution = quarters[3].resolution > quarters[2].resolution || quarters[3].tension < quarters[2].tension;

    if (hasRisingAction) score += 12;
    if (hasClimax) score += 12;
    if (hasResolution) score += 12;

    // Check pacing (word distribution across quarters)
    const wordCounts = quarters.map(q => q.wordCount);
    const avgWords = wordCounts.reduce((a, b) => a + b, 0) / 4;
    const paceVariance = wordCounts.reduce((sum, w) => sum + Math.pow(w - avgWords, 2), 0) / 4;
    if (paceVariance < avgWords * avgWords * 0.25) score += 4;

    let arcType = 'flat';
    if (hasRisingAction && hasClimax && hasResolution) arcType = 'classic';
    else if (hasRisingAction && hasClimax) arcType = 'rising';
    else if (hasResolution) arcType = 'resolution-focused';

    return {
      score: Math.min(100, Math.max(0, score)),
      arc: arcType,
      quarters,
      hasRisingAction,
      hasClimax,
      hasResolution,
      paragraphCount: totalParagraphs
    };
  },

  // ========================
  // TRANSITION ANALYSIS
  // ========================
  analyzeTransitions(text) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    if (paragraphs.length < 2) return { score: 50, details: 'Not enough paragraphs to analyze.' };

    const transitionWords = new Set([
      'however', 'moreover', 'furthermore', 'meanwhile', 'consequently', 'therefore',
      'nevertheless', 'nonetheless', 'additionally', 'similarly', 'conversely',
      'in contrast', 'on the other hand', 'as a result', 'in addition', 'for example',
      'for instance', 'in other words', 'in fact', 'indeed', 'likewise', 'accordingly',
      'thus', 'hence', 'still', 'yet', 'also', 'then', 'next', 'finally', 'afterwards',
      'later', 'before', 'after', 'during', 'while', 'although', 'though', 'even though',
      'because', 'since', 'when', 'once', 'until', 'unless'
    ]);

    let transitionsUsed = 0;
    let smoothTransitions = 0;
    const transitionDetails = [];

    for (let i = 1; i < paragraphs.length; i++) {
      const prevEnd = paragraphs[i - 1].trim().split(/\s+/).slice(-5).join(' ').toLowerCase();
      const currStart = paragraphs[i].trim().split(/\s+/).slice(0, 8).join(' ').toLowerCase();

      let hasTransition = false;
      for (const tw of transitionWords) {
        if (currStart.includes(tw)) {
          hasTransition = true;
          transitionsUsed++;
          break;
        }
      }

      // Check thematic continuity (shared significant words)
      const prevWords = new Set(paragraphs[i - 1].toLowerCase().match(/\b[a-z]{4,}\b/g) || []);
      const currWords = paragraphs[i].toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const shared = currWords.filter(w => prevWords.has(w)).length;
      const continuity = shared / Math.max(currWords.length, 1);

      if (hasTransition || continuity > 0.15) smoothTransitions++;

      transitionDetails.push({
        paragraph: i + 1,
        hasTransitionWord: hasTransition,
        continuityScore: Math.round(continuity * 100),
        smooth: hasTransition || continuity > 0.15
      });
    }

    const transitionRate = transitionsUsed / (paragraphs.length - 1);
    const smoothRate = smoothTransitions / (paragraphs.length - 1);
    let score = Math.round(smoothRate * 80 + 20);
    if (transitionRate > 0.3 && transitionRate < 0.7) score = Math.min(score + 10, 100);

    return {
      score: Math.min(100, Math.max(0, score)),
      totalParagraphs: paragraphs.length,
      transitionsUsed,
      smoothTransitions,
      smoothRate: Math.round(smoothRate * 100),
      details: transitionDetails
    };
  },

  // ========================
  // DIALOGUE ANALYSIS
  // ========================
  analyzeDialogue(text) {
    const dialogueMatches = text.match(/[""\u201C][^""\u201D]*[""\u201D]/g) || [];
    const dialogueCount = dialogueMatches.length;
    const totalWords = text.split(/\s+/).length;

    if (dialogueCount === 0) {
      return { score: 50, count: 0, ratio: 0, details: 'No dialogue detected.' };
    }

    const dialogueWords = dialogueMatches.reduce((sum, d) => sum + d.split(/\s+/).length, 0);
    const ratio = dialogueWords / totalWords;

    // Check dialogue tag variety
    const tagPatterns = text.match(/[""\u201D]\s*(said|asked|whispered|shouted|muttered|replied|exclaimed|declared|murmured|yelled|cried|answered|stated|remarked|noted|suggested|demanded|insisted|pleaded|warned|admitted|announced|argued|claimed|complained|confirmed|denied|explained|observed|protested|responded|sighed|snapped|stammered)\b/gi) || [];
    const tags = {};
    tagPatterns.forEach(t => {
      const verb = t.replace(/[""\u201D]\s*/, '').toLowerCase();
      tags[verb] = (tags[verb] || 0) + 1;
    });

    const saidCount = tags['said'] || 0;
    const totalTags = tagPatterns.length;
    const saidRatio = totalTags > 0 ? saidCount / totalTags : 0;

    let score = 65;
    if (ratio > 0.1 && ratio < 0.5) score += 10;
    if (Object.keys(tags).length > 3) score += 10;
    if (saidRatio < 0.7) score += 10;
    if (saidRatio > 0.85) score -= 10;

    // Check dialogue length variety
    const lengths = dialogueMatches.map(d => d.split(/\s+/).length);
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const lenVariance = lengths.reduce((sum, l) => sum + Math.pow(l - avgLen, 2), 0) / lengths.length;
    if (Math.sqrt(lenVariance) > 3) score += 5;

    return {
      score: Math.min(100, Math.max(0, score)),
      count: dialogueCount,
      ratio: Math.round(ratio * 100),
      tags,
      saidRatio: Math.round(saidRatio * 100),
      avgLength: Math.round(avgLen)
    };
  },

  // ========================
  // STYLE ANALYSIS
  // ========================
  analyzeStyle(text) {
    const words = text.match(/\b[a-z']+\b/gi) || [];
    const totalWords = words.length;
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    const lexicalDiversity = uniqueWords.size / Math.max(totalWords, 1);

    // Average word length
    const avgWordLen = words.reduce((sum, w) => sum + w.length, 0) / Math.max(totalWords, 1);

    // Paragraph length consistency
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const paraLengths = paragraphs.map(p => p.split(/\s+/).length);
    const avgParaLen = paraLengths.reduce((a, b) => a + b, 0) / Math.max(paraLengths.length, 1);

    // Tone consistency check (first person vs third person)
    const firstPerson = (text.match(/\bI\b/g) || []).length;
    const thirdPerson = (text.match(/\b(he|she|they)\b/gi) || []).length;
    const povConsistency = Math.abs(firstPerson - thirdPerson) / Math.max(firstPerson + thirdPerson, 1);

    let score = 60;
    if (lexicalDiversity > 0.4) score += 10;
    if (lexicalDiversity > 0.55) score += 5;
    if (avgWordLen > 4 && avgWordLen < 6) score += 5;
    if (povConsistency > 0.5) score += 10;

    const pov = firstPerson > thirdPerson * 2 ? 'First Person' :
                thirdPerson > firstPerson * 2 ? 'Third Person' : 'Mixed';

    return {
      score: Math.min(100, Math.max(0, score)),
      totalWords,
      uniqueWords: uniqueWords.size,
      lexicalDiversity: Math.round(lexicalDiversity * 100),
      avgWordLength: Math.round(avgWordLen * 10) / 10,
      avgParagraphLength: Math.round(avgParaLen),
      pov,
      paragraphCount: paragraphs.length
    };
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

    // Collect all inline issues
    const passiveIssues = this.findPassiveVoice(text);
    const adverbIssues = this.findAdverbs(text);
    const clicheIssues = this.findCliches(text);
    const weakVerbIssues = this.findWeakVerbs(text);
    const wordyIssues = this.findWordyPhrases(text);
    const repetitionIssues = this.findRepetitions(text);
    const longSentenceIssues = this.findLongSentences(text);

    const allIssues = [
      ...passiveIssues, ...adverbIssues, ...clicheIssues,
      ...weakVerbIssues, ...wordyIssues, ...repetitionIssues, ...longSentenceIssues
    ].sort((a, b) => a.index - b.index);

    // Structural analysis
    const plot = this.analyzePlot(text);
    const transitions = this.analyzeTransitions(text);
    const dialogue = this.analyzeDialogue(text);
    const style = this.analyzeStyle(text);
    const sentenceVariety = this.analyzeSentenceVariety(text);
    const readability = this.fleschKincaid(text);
    const genre = this.detectGenre(text);

    const totalWords = (text.match(/\b\w+\b/g) || []).length;
    const copyScore = this.scoreCopyEditing(allIssues, totalWords);
    const lineScore = Math.round((sentenceVariety.score + Math.min(100, Math.max(0, readability.ease))) / 2);

    // Overall score (weighted average)
    const overall = Math.round(
      plot.score * 0.2 +
      transitions.score * 0.15 +
      copyScore * 0.25 +
      lineScore * 0.2 +
      style.score * 0.1 +
      dialogue.score * 0.1
    );

    return {
      overall,
      genre,
      totalWords,
      scores: {
        plot: plot.score,
        transitions: transitions.score,
        copy: copyScore,
        line: lineScore,
        style: style.score,
        dialogue: dialogue.score
      },
      plot,
      transitions,
      dialogue,
      style,
      sentenceVariety,
      readability,
      issues: allIssues,
      issueCounts: {
        passive: passiveIssues.length,
        adverb: adverbIssues.length,
        cliche: clicheIssues.length,
        'weak-verb': weakVerbIssues.length,
        wordy: wordyIssues.length,
        repetition: repetitionIssues.length,
        'sentence-length': longSentenceIssues.length
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
