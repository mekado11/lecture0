// ManuscriptLens - Analysis Engine v2

const Analyzer = {

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
    /\b(was|were|is|are|been|being|be)\s+(being\s+)?([\w]+ed|[\w]+en|built|caught|chosen|cut|done|drawn|driven|eaten|fallen|felt|found|forgotten|fought|given|gone|grown|heard|held|hidden|hit|hung|hurt|kept|known|laid|led|left|lent|let|lost|made|meant|met|paid|put|read|rid|run|said|sat|seen|sent|set|shot|shown|shut|sold|spent|spoken|stood|stuck|struck|sung|sworn|taken|taught|thought|thrown|told|torn|understood|woken|won|worn|written)\b/gi
  ],
  // Non-passive -ed words that look passive but aren't (adjectives)
  PASSIVE_EXCEPTIONS: new Set([
    'interested','excited','bored','tired','married','worried','surprised',
    'pleased','satisfied','determined','experienced','advanced','complicated',
    'dedicated','detailed','distinguished','educated','exhausted','fascinated',
    'frightened','frustrated','motivated','organized','overwhelmed','relaxed',
    'reserved','skilled','stressed','talented','thrilled','touched','troubled'
  ]),

  // ========================
  // ADVERB DETECTION
  // ========================
  findAdverbs(text) {
    const issues = [];
    const regex = /\b(\w+ly)\b/gi;
    let match;
    // Comprehensive exceptions: -ly words that are NOT adverbs (adjectives, nouns, verbs)
    const exceptions = new Set([
      // Adjectives ending in -ly
      'only','early','daily','holy','lonely','friendly','likely','ugly','costly',
      'deadly','elderly','ghostly','ghastly','goodly','heavenly','homely','jolly',
      'kindly','leisurely','lively','lonely','lovely','manly','measly','melancholy',
      'oily','orderly','scholarly','shapely','silly','sly','smelly','surly','timely',
      'unruly','woolly','worldly','comely','cowardly','curly','burly','grisly','hilly',
      'princely','seemly','sickly','stately','steely','wily','womanly','beastly',
      'bristly','bubbly','chilly','cleanly','clumsy','comely','costly','crinkly',
      'crumbly','cuddly','curly','dastardly','dimply','drizzly','fatherly','flimsy',
      'frilly','frizzly','gangly','gently','giggly','gnarly','godly','grisly','grizzly',
      'grumbly','homely','jangly','jiggly','kingly','knightly','knobby','lowly',
      'matronly','motherly','neighborly','northerly','paunchy','pearly','pebble',
      'pimply','portly','prickly','priestly','queenly','rascally','rumply','scaly',
      'sisterly','slovenly','southerly','sparkly','spindly','sprightly','squiggly',
      'stately','straggly','ungainly','unlikelyy','unmanly','unsightly','wiggly',
      'wrinkly',
      // Nouns ending in -ly
      'family','supply','rally','belly','bully','fly','july','apply','reply',
      'multiply','ally','italy','lily','folly','tally','assembly','anomaly',
      'jelly','bully','gully','holly','monopoly','poly','trolley'
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

      issues.push({
        type: 'adverb', text: match[1], index: match.index, length: match[1].length,
        severity: 'low', confidence,
        message: `Adverb "${match[1]}" — consider a stronger verb that doesn't need modification.`,
        suggestion: `Remove "${match[1]}" and strengthen the verb it modifies.`
      });
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
  WEAK_VERBS: {
    'walked':'strode, ambled, trudged, sauntered',
    'looked':'glanced, peered, gazed, scrutinized','went':'hurried, wandered, dashed, strolled',
    'got':'obtained, acquired, seized, snatched','put':'placed, positioned, deposited, set',
    'made':'crafted, fashioned, constructed, forged','came':'arrived, emerged, appeared, materialized',
    'thought':'pondered, mused, considered, reflected','saw':'noticed, observed, spotted, witnessed',
    'ran':'sprinted, dashed, bolted, jogged','moved':'shifted, glided, crept, lunged',
    'turned':'pivoted, swiveled, whirled, rotated',
    'seemed':'appeared, suggested, indicated, implied','started':'began, commenced, initiated, launched',
    'stood':'towered, loomed, perched, positioned',
    'sat':'perched, settled, reclined, lounged','held':'clutched, gripped, grasped, cradled'
  },

  findWeakVerbs(text) {
    const issues = [];
    const PER_VERB_LIMIT = 5; // cap flags per verb to avoid noise in long manuscripts
    for (const [verb, alternatives] of Object.entries(this.WEAK_VERBS)) {
      const regex = new RegExp(`\\b${verb}\\b`, 'gi');
      let match;
      let count = 0;
      while ((match = regex.exec(text)) !== null && count < PER_VERB_LIMIT) {
        count++;
        issues.push({
          type: 'weak-verb', text: match[0], index: match.index, length: match[0].length,
          severity: 'low', confidence: 0.9,
          message: `Weak verb "${match[0]}" — a more specific verb creates vivid imagery.`,
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
  findPassiveVoice(text) {
    const issues = [];
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
          suggestion = 'The subject is not doing the action. Flip it: “was opened by her” → “she opened.”';
        }

        issues.push({
          type: 'passive', text: issueText, index: match.index, length: issueLen,
          severity: 'medium', confidence: 0.85,
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
      'out','about','just','very','all','also','how','what','when','where','which','who']);
    const synMap={said:['stated','replied','remarked','noted','added'],looked:['glanced','gazed','peered','watched','studied'],walked:['strode','moved','paced','strolled','crossed'],made:['created','crafted','formed','produced','built'],came:['arrived','appeared','emerged','approached','entered'],went:['headed','moved','traveled','crossed','departed'],turned:['pivoted','shifted','swung','rotated','spun'],stood:['rose','remained','lingered','waited','stayed'],knew:['understood','recognized','realized','sensed','grasped'],thought:['considered','wondered','reflected','believed','imagined'],felt:['sensed','experienced','noticed','detected','perceived'],took:['grabbed','seized','claimed','accepted','retrieved'],gave:['offered','handed','presented','provided','delivered'],started:['began','initiated','launched','commenced','opened'],seemed:['appeared','looked','sounded','suggested','indicated'],told:['informed','explained','revealed','instructed','described'],asked:['questioned','inquired','wondered','requested','demanded'],eyes:['gaze','stare','glance','look','vision'],face:['expression','features','countenance','visage','look'],hand:['grip','palm','fingers','fist','grasp'],head:['mind','thoughts','skull','brow','temple'],voice:['tone','words','speech','whisper','sound'],door:['entrance','doorway','threshold','entry','gate'],room:['chamber','space','quarters','hall','area'],time:['moment','occasion','instance','period','while'],back:['spine','rear','return','retreat','behind'],long:['extended','prolonged','lengthy','enduring','sustained'],dark:['dim','shadowed','unlit','gloomy','murky'],small:['little','slight','tiny','compact','modest'],found:['discovered','located','uncovered','encountered','spotted'],called:['named','summoned','addressed','hailed','dubbed'],people:['individuals','figures','crowd','group','folk'],world:['realm','domain','land','sphere','landscape'],place:['location','spot','position','site','area'],still:['motionless','calm','quiet','unmoving','yet'],words:['speech','language','phrases','remarks','terms'],thing:['object','matter','item','element','detail'],woman:['figure','lady','person','character','she'],before:['earlier','previously','prior','ahead','formerly'],every:['each','all','entire','whole','total'],never:['rarely','seldom','hardly','not once','at no point'],always:['constantly','perpetually','inevitably','forever','endlessly'],around:['surrounding','about','nearby','encircling','throughout']};
    const seen = new Set();

    for (let i = 0; i < sentBounds.length - 1; i++) {
      const s1 = sentBounds[i], s2 = sentBounds[i + 1];
      const words1 = s1.raw.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const words2 = s2.raw.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const set1 = new Set(words1.filter(w => !stopWords.has(w)));
      for (const word of words2) {
        if (set1.has(word) && !stopWords.has(word)) {
          // Find the word position within the second sentence's known bounds
          const wordIdx = lower.indexOf(word, s2.start);
          if (wordIdx === -1 || wordIdx >= s2.end) continue;
          const key = word + ':' + wordIdx;
          if (seen.has(key)) continue;
          seen.add(key);
          const alts = synMap[word];
          const sugText = alts ? 'Try: ' + alts.slice(0, 3).join(', ') : 'Vary your word choice — try a synonym or restructure the sentence.';
          issues.push({
            type: 'repetition', text: word, index: wordIdx, length: word.length,
            severity: 'low', confidence: 0.85, message: `"${word}" repeated in consecutive sentences.`,
            suggestion: sugText
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
        issues.push({
          type: 'sentence-length',
          text: sentence,
          index: match.index, length: sentence.length, confidence: 0.95,
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
          severity: 'medium', confidence: 0.85, message: `${msg}: "${match[0]}"`,
          suggestion: 'Show through action, dialogue, or sensory detail instead.'
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

    // If nonfiction wins but fiction signals are strong, default to fiction
    if (['nonfiction','historyNF','biography'].includes(primary) && fictionBase >= nfBase * 0.6) {
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
  // PLOT STRUCTURE ANALYSIS
  // ========================
  analyzePlot(text, mode) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const totalParagraphs = paragraphs.length;
    if (totalParagraphs < 3) {
      return { score: 50, arc: 'too-short', details: 'Text too short for plot analysis.', hasRisingAction: false, hasClimax: false, hasResolution: false, hasCliffhanger: false, hasSceneGoal: false, paragraphCount: totalParagraphs, quarters: [] };
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
    const hasRisingAction = quarters[1].tension > quarters[0].tension;
    const hasClimax = quarters[2].tension >= quarters[1].tension || quarters[2].tension >= quarters[0].tension;
    const hasResolution = quarters[3].resolution > quarters[2].resolution || quarters[3].tension < quarters[2].tension;

    // Chapter-level: check for scene goal and cliffhanger ending
    const lastPara = paragraphs[paragraphs.length - 1].toLowerCase();
    const hasCliffhanger = /\?$/.test(lastPara.trim()) || /\b(but|however|suddenly|then|until|never|everything changed)\b/.test(lastPara);
    const firstPara = paragraphs[0].toLowerCase();
    const hasSceneGoal = /\b(need|must|had to|wanted|determined|searching|looking for|trying to)\b/.test(firstPara);

    let score = 60;
    if (mode === 'chapter' || mode === 'excerpt') {
      // Chapter mode: score micro-arc (scene goal, tension build, cliffhanger)
      // Do NOT penalize for missing resolution — chapters should leave things open
      if (hasSceneGoal) score += 10;
      if (hasRisingAction) score += 10;
      if (hasClimax) score += 8;
      if (hasCliffhanger) score += 12; // reward cliffhanger endings
      // Resolution is neutral in chapter mode (not penalized, small bonus if present)
      if (hasResolution) score += 3;
    } else {
      // Book mode: full arc expected
      if (hasRisingAction) score += 12;
      if (hasClimax) score += 12;
      if (hasResolution) score += 12;
    }
    const wordCounts = quarters.map(q => q.wordCount);
    const avgWords = wordCounts.reduce((a, b) => a + b, 0) / 4;
    const paceVariance = wordCounts.reduce((sum, w) => sum + Math.pow(w - avgWords, 2), 0) / 4;
    if (paceVariance < avgWords * avgWords * 0.25) score += 4;

    let arcType = 'flat';
    if (mode === 'chapter' || mode === 'excerpt') {
      if (hasSceneGoal && hasRisingAction && hasCliffhanger) arcType = 'strong-scene';
      else if (hasRisingAction && hasCliffhanger) arcType = 'building';
      else if (hasRisingAction) arcType = 'rising';
      else if (hasCliffhanger) arcType = 'hook-ending';
    } else {
      if (hasRisingAction && hasClimax && hasResolution) arcType = 'classic';
      else if (hasRisingAction && hasClimax) arcType = 'rising';
      else if (hasResolution) arcType = 'resolution-focused';
    }
    return { score: Math.min(100, Math.max(0, score)), arc: arcType, quarters, hasRisingAction, hasClimax, hasResolution, hasCliffhanger, hasSceneGoal, paragraphCount: totalParagraphs };
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
    const lower = text.toLowerCase();
    const findings = [];

    if (dialogueCount === 0) return {
      score: 50, count: 0, ratio: 0, tags: {}, saidRatio: 0, avgLength: 0,
      tagDiscipline: 0, conciseness: 0, showNotTell: 0, purposefulness: 0, naturalness: 0,
      findings: [{ type: 'dialogue', severity: 'medium', message: 'No dialogue detected. If this is fiction, dialogue is one of the fastest ways to pull readers into a moment. Even literary fiction benefits from dialogue to break up narration and reveal character.' }]
    };

    const dialogueWords = dialogueMatches.reduce((sum, d) => sum + d.split(/\s+/).length, 0);
    const ratio = dialogueWords / totalWords;

    // === TAG DISCIPLINE ===
    // Good dialogue uses "said"/"asked" (invisible tags) and beats (action) instead of exotic tags
    let tagDiscipline = 100;
    const tagPatterns = text.match(/[""\u201D]\s*(said|asked|whispered|shouted|muttered|replied|exclaimed|declared|murmured|yelled|cried|answered|stated|remarked|noted|suggested|demanded|insisted|pleaded|warned|admitted|announced|argued|claimed|complained|confirmed|denied|explained|observed|protested|responded|sighed|snapped|stammered)\b/gi) || [];
    const tags = {};
    tagPatterns.forEach(t => { const verb = t.replace(/[""\u201D]\s*/, '').toLowerCase(); tags[verb] = (tags[verb] || 0) + 1; });
    const saidAskedCount = (tags['said'] || 0) + (tags['asked'] || 0);
    const totalTags = tagPatterns.length;
    const saidRatio = totalTags > 0 ? saidAskedCount / totalTags : 0;
    // Exotic tags (not said/asked)
    const exoticTags = totalTags - saidAskedCount;
    const exoticRatio = totalTags > 0 ? exoticTags / totalTags : 0;
    if (exoticRatio > 0.5) {
      tagDiscipline -= 20;
      findings.push({ type: 'tags', severity: 'medium', message: 'Over-decorated dialogue tags: ' + exoticTags + '/' + totalTags + ' are exotic ("exclaimed", "murmured", etc). Use "said" — it\'s invisible to readers. Let the words carry emotion.' });
    }
    // Adverb-modified tags ("said angrily", "whispered softly")
    const adverbTags = (text.match(/[""\u201D]\s*\w+\s+(angrily|sadly|happily|nervously|excitedly|furiously|quietly|loudly|softly|tearfully|breathlessly|anxiously|impatiently|curiously|coldly|warmly|flatly|sharply|gently|bitterly|wearily|desperately|hopefully|hoarsely|fiercely|slowly|quickly)/gi) || []).length;
    if (adverbTags > 0) {
      tagDiscipline -= adverbTags * 5;
      findings.push({ type: 'tags', severity: 'medium', message: adverbTags + ' adverb-modified tag(s) ("said angrily", "whispered softly"). Cut the adverb — if the dialogue needs an adverb to convey emotion, the dialogue itself is too weak.' });
    }
    // Over-attribution: tagging every single line
    if (totalTags > 0 && totalTags / dialogueCount > 0.7) {
      tagDiscipline -= 10;
      findings.push({ type: 'tags', severity: 'low', message: 'Over-attributed: ' + totalTags + ' tags for ' + dialogueCount + ' lines. In back-and-forth dialogue, drop tags after establishing speakers. Use action beats instead.' });
    }
    // NO tags at all (also a problem — reader gets lost)
    if (dialogueCount > 4 && totalTags === 0) {
      tagDiscipline -= 10;
      findings.push({ type: 'tags', severity: 'low', message: 'No dialogue tags found. While minimal tags are good, zero tags across ' + dialogueCount + ' lines can confuse readers about who is speaking.' });
    }

    // === CONCISENESS ===
    // Dialogue should be tighter than narration. Long speeches = lecture, not conversation
    let conciseness = 100;
    const lengths = dialogueMatches.map(d => d.replace(/[""\u201C\u201D]/g, '').trim().split(/\s+/).length);
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const longSpeeches = lengths.filter(l => l > 40).length;
    const shortPunches = lengths.filter(l => l <= 5).length;
    if (longSpeeches > 0) {
      conciseness -= longSpeeches * 8;
      findings.push({ type: 'conciseness', severity: 'medium', message: longSpeeches + ' dialogue line(s) over 40 words. Characters shouldn\'t give speeches — break into exchange, use interruptions, or move info to narration.' });
    }
    if (avgLen > 20) {
      conciseness -= 10;
      findings.push({ type: 'conciseness', severity: 'low', message: 'Average dialogue line is ' + Math.round(avgLen) + ' words. Real conversation is shorter. Mix long and short — a one-word reply can be more powerful than a paragraph.' });
    }
    // Reward short, punchy exchanges
    if (shortPunches > dialogueCount * 0.3) conciseness += 5;

    // === SHOW NOT TELL IN DIALOGUE CONTEXT ===
    // Narration around dialogue shouldn't explain what the dialogue already shows
    let showNotTell = 100;
    // "he said angrily" when the dialogue is clearly angry
    // Emotion-explaining narration near dialogue
    const emotionExplainers = (text.match(/[""\u201D][^""\u201C]*\b(was angry|was upset|was nervous|was scared|was happy|was sad|felt angry|felt nervous|felt scared|felt happy|felt sad|with anger|with frustration|in frustration|in anger|with fear)\b/gi) || []).length;
    if (emotionExplainers > 0) {
      showNotTell -= emotionExplainers * 8;
      findings.push({ type: 'showing', severity: 'high', message: emotionExplainers + ' emotion explanation(s) near dialogue ("was angry", "felt nervous"). If the dialogue shows anger, don\'t explain it — trust the reader. Use action beats: "His jaw tightened" not "He was angry."' });
    }
    // Action beats that tell instead of show
    const tellingBeats = (text.match(/[""\u201D][^""\u201C]*(trying to calm|trying to hide|trying to sound|wanting to say|hoping to|meaning to)\b/gi) || []).length;
    if (tellingBeats > 0) {
      showNotTell -= tellingBeats * 5;
      findings.push({ type: 'showing', severity: 'medium', message: tellingBeats + ' telling beat(s) near dialogue ("trying to calm him down"). Show the attempt through action, not narration of intent.' });
    }

    // === PURPOSEFULNESS ===
    // Every line should: move plot, reveal character, or build tension
    // We can detect anti-patterns: small talk, greetings, empty exchanges
    let purposefulness = 100;
    const smallTalk = dialogueMatches.filter(d => {
      const dl = d.toLowerCase().replace(/[""\u201C\u201D]/g, '').trim();
      return /^(hi|hello|hey|how are you|good morning|good evening|nice to meet you|what's up|goodbye|bye|see you|take care|thanks|thank you|you're welcome|no problem|sure|okay|ok|yeah|yes|no|fine|right|well|hmm|huh|oh)\s*[.!?]*$/i.test(dl);
    }).length;
    if (smallTalk > 0) {
      purposefulness -= smallTalk * 6;
      findings.push({ type: 'purpose', severity: 'low', message: smallTalk + ' small-talk/filler line(s) ("Hi", "How are you", "Okay"). Every dialogue line should move the story, reveal character, or build tension. Cut pleasantries unless they serve a purpose.' });
    }
    // Repetitive dialogue (character repeating what was just said)
    for (let i = 1; i < dialogueMatches.length; i++) {
      const prev = dialogueMatches[i - 1].toLowerCase().replace(/[""\u201C\u201D]/g, '').trim();
      const curr = dialogueMatches[i].toLowerCase().replace(/[""\u201C\u201D]/g, '').trim();
      if (prev.length > 10 && curr.includes(prev.substring(0, Math.min(prev.length, 20)))) {
        purposefulness -= 5;
      }
    }

    // === NATURALNESS ===
    // Dialogue shouldn't sound like exposition dressed as speech
    let naturalness = 100;
    // "As you know" / exposition dumps in dialogue
    const asYouKnow = (text.match(/[""\u201C][^""\u201D]*(as you know|as we discussed|as I mentioned|let me explain|the thing is|you see|I should tell you|you need to understand|what you don't realize)\b/gi) || []).length;
    if (asYouKnow > 0) {
      naturalness -= asYouKnow * 8;
      findings.push({ type: 'naturalness', severity: 'high', message: asYouKnow + ' exposition-in-dialogue ("As you know...", "Let me explain..."). People don\'t explain things the other person already knows. Move backstory to narration or show it through conflict.' });
    }
    // Characters speaking in complete, formal sentences (real people fragment)
    const formalDialogue = dialogueMatches.filter(d => {
      const words = d.replace(/[""\u201C\u201D]/g, '').trim().split(/\s+/);
      return words.length > 15 && !/[—\-?!]/.test(d) && !/\.\.\.|\.{3}/.test(d);
    }).length;
    if (formalDialogue > dialogueCount * 0.6 && dialogueCount > 3) {
      naturalness -= 10;
      findings.push({ type: 'naturalness', severity: 'low', message: 'Most dialogue lines are long, complete sentences. Real people trail off, interrupt, fragment. Add "—" dashes, "..." ellipses, and sentence fragments for realism.' });
    }
    // Length variety (conversations have rhythm — long, short, long, short)
    const lenStdDev = Math.sqrt(lengths.reduce((s, l) => s + Math.pow(l - avgLen, 2), 0) / lengths.length);
    if (lenStdDev < 3 && dialogueCount > 4) {
      naturalness -= 8;
      findings.push({ type: 'naturalness', severity: 'low', message: 'Dialogue lines are all similar length (stddev: ' + lenStdDev.toFixed(1) + '). Real conversations have rhythm — a rapid-fire exchange, then a longer statement, then silence. Vary line lengths.' });
    }
    if (lenStdDev > 5) naturalness += 3; // good variety

    // Clamp all
    tagDiscipline = Math.min(100, Math.max(0, tagDiscipline));
    conciseness = Math.min(100, Math.max(0, conciseness));
    showNotTell = Math.min(100, Math.max(0, showNotTell));
    purposefulness = Math.min(100, Math.max(0, purposefulness));
    naturalness = Math.min(100, Math.max(0, naturalness));

    const score = Math.round(tagDiscipline * 0.2 + conciseness * 0.2 + showNotTell * 0.25 + purposefulness * 0.15 + naturalness * 0.2);

    return {
      score: Math.min(100, Math.max(0, score)),
      count: dialogueCount, ratio: Math.round(ratio * 100),
      tags, saidRatio: Math.round((totalTags > 0 ? saidAskedCount / totalTags : 0) * 100),
      avgLength: Math.round(avgLen),
      // Sub-scores
      tagDiscipline, conciseness, showNotTell, purposefulness, naturalness,
      // Details
      exoticTags, adverbTags, longSpeeches, shortPunches, smallTalk, asYouKnow,
      lengthVariety: Math.round(lenStdDev * 10) / 10,
      findings
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
    const avgWordLen = words.reduce((sum, w) => sum + w.length, 0) / Math.max(totalWords, 1);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const paraLengths = paragraphs.map(p => p.split(/\s+/).length);
    const avgParaLen = paraLengths.reduce((a, b) => a + b, 0) / Math.max(paraLengths.length, 1);
    const firstPerson = (text.match(/\bI\b/g) || []).length;
    const thirdPerson = (text.match(/\b(he|she|they)\b/gi) || []).length;
    const povConsistency = Math.abs(firstPerson - thirdPerson) / Math.max(firstPerson + thirdPerson, 1);
    let score = 50; // start neutral, earn or lose points
    // Lexical diversity scoring (biggest factor)
    if (lexicalDiversity > 0.55) score += 20;
    else if (lexicalDiversity > 0.45) score += 15;
    else if (lexicalDiversity > 0.35) score += 8;
    else if (lexicalDiversity > 0.25) score += 0; // neutral
    else score -= 15; // very low diversity = repetitive vocabulary
    // Word length (sophistication)
    if (avgWordLen > 4.5 && avgWordLen < 6) score += 8;
    else if (avgWordLen > 4) score += 4;
    // POV consistency
    if (povConsistency > 0.7) score += 12;
    else if (povConsistency > 0.4) score += 6;
    else score -= 5; // mixed POV without clear intention
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
  analyzeReaderPerspective(text, mode, allIssues = []) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const totalWords = text.split(/\s+/).length;
    const lower = text.toLowerCase();

    // Hook strength - analyze first paragraph + factor in issue density
    const firstPara = paragraphs[0] || '';
    let hookStrength = 40;
    if (firstPara.includes('?')) hookStrength += 10;
    if ((firstPara.match(/[""\u201C]/g) || []).length > 0) hookStrength += 10;
    if (firstPara.split(/\s+/).length < 50) hookStrength += 5;
    const tensionInOpening = (firstPara.toLowerCase().match(/\b(danger|fear|mystery|secret|death|blood|shadow|dark|strange|suddenly|never|always)\b/g) || []).length;
    if (tensionInOpening > 0) hookStrength += tensionInOpening * 5;
    // Penalize for high issue density — a manuscript with many issues has a weaker hook
    const issuesPerK_hook = allIssues.length / Math.max(totalWords / 1000, 1);
    if (issuesPerK_hook > 20) hookStrength -= 25;
    else if (issuesPerK_hook > 12) hookStrength -= 15;
    else if (issuesPerK_hook > 6) hookStrength -= 8;
    // Check first 3 paragraphs for passive voice and weak verbs (weakens hook)
    const openingText = paragraphs.slice(0, 3).join(' ').toLowerCase();
    const openingPassives = (openingText.match(/\b(was|were)\s+\w+ed\b/g) || []).length;
    const openingAdverbs = (openingText.match(/\w+ly\b/g) || []).length;
    if (openingPassives > 2) hookStrength -= 10;
    if (openingAdverbs > 3) hookStrength -= 5;
    hookStrength = Math.max(10, Math.min(100, hookStrength));

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

    // DNF Risk - now handled by dedicated analyzeDNF engine
    const dnfRisk = 0; // placeholder, replaced by dnfAnalysis in final output

    // Overall verdict
    let overallVerdict = 'Solid manuscript with good reader engagement.';
    if (engagementScore >= 80) overallVerdict = 'Highly engaging! Readers will have a hard time putting this down.';
    else if (engagementScore >= 60) overallVerdict = 'Good engagement overall. A few areas could be tightened to keep readers hooked.';
    else if (engagementScore >= 40) overallVerdict = 'Moderate engagement. Consider strengthening hooks, pacing, and emotional resonance.';
    else overallVerdict = 'Needs work on engagement. Focus on a stronger opening, clearer stakes, and emotional connection.';

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
      if (/^(had|that|is|do|was|in|so|no)$/i.test(dm[1])) continue;
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
      const before = text.substring(Math.max(0, cm.index - 10), cm.index + 1);
      if (/\b(Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc|e\.g|i\.e)\.$/i.test(before)) continue;
      if (/\.\.\.$/.test(before)) continue;
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
    const dtagRe = /([.!?]?)("|")\s+(he|she|they|I|we|it|[A-Z][a-z]+)\s+(said|asked|whispered|shouted|yelled|muttered|replied|murmured|growled|hissed|snapped|stammered|called|cried|exclaimed|answered|demanded|pleaded|begged|insisted|warned|suggested|offered|added|continued|began|started|interrupted|responded|acknowledged|admitted|agreed|announced|argued|barked|bellowed|blurted|boasted|breathed|chanted|chided|chimed|choked|clucked|coaxed|commanded|commented|complained|conceded|concluded|confessed|confided|confirmed|croaked|crooned|cursed|declared|denied|drawled|echoed|elaborated|emphasized|encouraged|estimated|explained|faltered|gasped|giggled|gloated|grumbled|grunted|guessed|gulped|huffed|hummed|implored|informed|interjected|joked|lamented|laughed|lectured|lied|lisped|maintained|marveled|mentioned|mimicked|moaned|mocked|mumbled|mused|nagged|narrated|noted|objected|observed|ordered|panted|parroted|persisted|persuaded|piped|pondered|pouted|praised|prayed|pressed|proclaimed|promised|prompted|pronounced|proposed|protested|provoked|purred|quavered|quipped|quoted|ranted|reasoned|recalled|reckoned|recounted|reflected|refused|reminded|repeated|reported|requested|resumed|retorted|revealed|roared|sang|scoffed|scolded|screamed|sighed|slurred|smiled|smirked|sneered|snickered|sniffed|snorted|sobbed|speculated|spluttered|squeaked|squealed|stammered|stated|stuttered|surmised|taunted|teased|threatened|thundered|urged|uttered|ventured|vowed|wailed|warned|wept|whimpered|whined|whispered|wondered|worried|yawned)\b/g;
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

    // --- 5. ITS vs IT'S ---
    const itsRe = /\bit's\s+(own|way|place|name|best|worst|color|colour|shape|size|tail|head|body|eyes|mouth|teeth|legs|arms|paws|fur|skin|surface|contents?|core|edge|purpose|meaning|origin|source|target|focus|base|peak|center|centre|end|start|beginning|finish|top|bottom|side|front|back|heart|soul|nature|essence|beauty|power|strength|weight|value|worth|role|effect|impact|limit|potential|history|future|past)\b/gi;
    let itsm;
    while ((itsm = itsRe.exec(text)) !== null) {
      issues.push({
        type: 'grammar', text: itsm[0], index: itsm.index, length: itsm[0].length,
        severity: 'high', confidence: 0.92,
        message: '"It\'s" means "it is." For possession, use "its" (no apostrophe).',
        suggestion: 'Replace with: "its ' + itsm[1] + '"'
      });
    }

    // --- 6. THEIR/THERE/THEY'RE ---
    const therePoss = /\b(there)\s+(car|house|home|dog|cat|kids?|children|family|parents?|mother|father|mom|dad|brother|sister|friend|friends|bag|phone|book|books?|stuff|things?|work|job|money|life|lives|team|group|class|school|idea|opinion|problem|fault|way|plan|goal|dream)\b/gi;
    let tpm;
    while ((tpm = therePoss.exec(text)) !== null) {
      issues.push({
        type: 'grammar', text: tpm[0], index: tpm.index, length: tpm[0].length,
        severity: 'high', confidence: 0.88,
        message: '"There" is a place. For possession, use "their."',
        suggestion: 'Replace with: "their ' + tpm[2] + '"'
      });
    }

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

    // --- 9. DANGLING COMMA BEFORE "AND" IN TWO-ITEM LIST (Oxford comma misuse) ---
    // Skip — too many false positives in fiction

    // --- 10. MISSING APOSTROPHE IN COMMON CONTRACTIONS ---
    const contractionRe = /\b(dont|wont|cant|didnt|doesnt|isnt|wasnt|arent|werent|wouldnt|couldnt|shouldnt|hasnt|havent|hadnt|aint|mustnt|neednt)\b/g;
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
        mustnt:"mustn't",neednt:"needn't"
      };
      issues.push({
        type: 'grammar', text: word, index: crm.index, length: word.length,
        severity: 'medium', confidence: 0.93,
        message: 'Missing apostrophe in contraction.',
        suggestion: 'Replace with: "' + fixMap[word] + '"'
      });
    }

    // --- 11. SENTENCE FRAGMENTS (very short "sentences" with no verb) ---
    const fragRe = /(?:^|\n|[.!?]\s+)([A-Z][a-z]{0,12}\.)\s/g;
    let frm;
    while ((frm = fragRe.exec(text)) !== null) {
      const frag = frm[1];
      if (/^(Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Gen|Gov|Rep|Sen|Sgt|Cpl|Pvt|Lt|Capt|Maj|Col|Rev|Hon)\./i.test(frag)) continue;
      if (frag.length <= 3) continue;
    }

    // --- 12. TENSE CONSISTENCY within paragraphs ---
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 100);
    for (const para of paragraphs) {
      if (this._isInsideQuotes(text, text.indexOf(para))) continue;
      const pastRe = /\b\w+(ed)\b/g;
      const presentRe = /\b(he|she|it)\s+(walks|runs|says|goes|comes|looks|takes|makes|gives|thinks|feels|sees|hears|knows|wants|needs|gets|puts|turns|moves|stands|sits|falls|holds|keeps|brings|finds|tells|shows|leaves|calls|reads|writes|speaks|plays|works|lives|loves|tries|seems|begins|starts|stops|opens|closes|pulls|pushes|reaches|catches|throws|drops|picks|cuts|hits|sets|lets|pays|wins|loses|leads|follows|meets|breaks|draws|grows|sends|builds|drives|flies|carries|lays|rises|wears|speaks|eats|drinks|sleeps|wakes|dies|cries|lies|hangs|shakes|strikes)\b/gi;
      const pastMatches = para.match(pastRe) || [];
      const presentMatches = para.match(presentRe) || [];
      if (pastMatches.length >= 4 && presentMatches.length >= 2) {
        const ratio = presentMatches.length / (pastMatches.length + presentMatches.length);
        if (ratio > 0.15 && ratio < 0.5) {
          const firstPresent = presentRe.exec(para);
          if (firstPresent) {
            const paraIdx = text.indexOf(para);
            const issueIdx = paraIdx + firstPresent.index;
            if (issueIdx >= 0 && issueIdx < text.length) {
              issues.push({
                type: 'grammar', text: firstPresent[0], index: issueIdx, length: firstPresent[0].length,
                severity: 'medium', confidence: 0.75,
                message: 'Possible tense shift. This paragraph mixes past and present tense.',
                suggestion: 'Check tense consistency — this paragraph appears mostly past tense.'
              });
            }
          }
        }
      }
    }

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
  analyzeWritingQuality(text, issues, sentenceVariety, readability, dialogue, style) {
    const words = text.match(/\b\w+\b/g) || [];
    const totalWords = words.length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const lower = text.toLowerCase();

    // === CLARITY (is the writing direct and easy to follow?) ===
    let clarityScore = 100;
    // Penalize excessive modifiers (adjective/adverb stacking)
    const modifierStacks = (text.match(/\b\w+ly\s+\w+ly\b/gi) || []).length;
    clarityScore -= modifierStacks * 8;
    // Penalize unclear pronoun density
    const pronouns = (lower.match(/\b(he|she|it|they|them|this|that)\b/g) || []).length;
    const pronounRatio = pronouns / Math.max(totalWords, 1);
    if (pronounRatio > 0.08) clarityScore -= 10;
    if (pronounRatio > 0.12) clarityScore -= 10;
    // Penalize sentences starting with "It was" / "There was" (weak openings)
    const weakOpenings = (text.match(/(?:^|\.\s+)(It was|There was|There were|It is|There is)\b/gi) || []).length;
    clarityScore -= weakOpenings * 4;
    // Penalize nested clauses (multiple commas in one sentence)
    const overComma = sentences.filter(s => (s.match(/,/g) || []).length >= 4).length;
    clarityScore -= overComma * 3;
    // Reward short, punchy sentences mixed in
    const punchySentences = sentences.filter(s => s.trim().split(/\s+/).length <= 6).length;
    if (punchySentences > sentences.length * 0.1) clarityScore += 5;

    // === DISCIPLINE (is the writing tight, no filler?) ===
    let disciplineScore = 100;
    // Penalize filler words
    const fillers = (lower.match(/\b(very|really|quite|rather|somewhat|basically|actually|literally|just|simply|perhaps|maybe|slightly|a bit|sort of|kind of|a little|in fact|of course|to be honest|needless to say)\b/g) || []).length;
    const fillerRate = fillers / Math.max(totalWords, 1) * 1000;
    disciplineScore -= Math.min(30, fillerRate * 3);
    // Penalize redundant pairs
    const redundants = (lower.match(/\b(each and every|first and foremost|full and complete|true and accurate|null and void|various and sundry|cease and desist|aid and abet|ways and means)\b/g) || []).length;
    disciplineScore -= redundants * 5;
    // Penalize hedge words
    const hedges = (lower.match(/\b(seemed to|appeared to|began to|started to|tried to|managed to|proceeded to|happened to|continued to)\b/g) || []).length;
    disciplineScore -= hedges * 3;
    // Reward: high ratio of strong verbs (not be/have/do/get)
    const allVerbs = (lower.match(/\b(was|were|is|are|had|has|have|did|does|do|got|get|went|go|came|come|made|make|said|took|take)\b/g) || []).length;
    const strongVerbRatio = 1 - (allVerbs / Math.max(totalWords, 1));
    if (strongVerbRatio > 0.95) disciplineScore += 5;

    // === EFFICIENCY (ratio of meaning to word count) ===
    let efficiencyScore = 100;
    // Penalize wordy issues already found
    const wordyCount = issues.filter(i => i.type === 'wordy').length;
    efficiencyScore -= wordyCount * 4;
    // Penalize over-explanation markers
    const overExplain = (lower.match(/\b(in other words|that is to say|what this means is|to put it simply|as mentioned before|as we have seen|it should be noted that|it is worth noting)\b/g) || []).length;
    efficiencyScore -= overExplain * 6;
    // Penalize "stage direction" (unnecessary physical action narration)
    const stageDir = (lower.match(/\b(he turned and|she turned and|he looked at|she looked at|he walked to|she walked to|he sat down|she sat down|he stood up|she stood up|he reached for|she reached for)\b/g) || []).length;
    efficiencyScore -= Math.min(20, stageDir * 2);
    // Reward concise paragraphs (avg < 100 words)
    const avgParaWords = totalWords / Math.max(paragraphs.length, 1);
    if (avgParaWords < 80) efficiencyScore += 5;
    if (avgParaWords > 150) efficiencyScore -= 10;

    // === ENGAGEMENT (does it maintain curiosity, avoid boredom?) ===
    let engagementScore = 100;
    // Penalize info dumps (paragraphs > 200 words with no dialogue)
    const infoDumps = paragraphs.filter(p => p.split(/\s+/).length > 200 && !/[""\u201C]/.test(p)).length;
    engagementScore -= infoDumps * 8;
    // Penalize consecutive paragraphs without dialogue (3+ in a row)
    let noDialogueStreak = 0, maxStreak = 0;
    paragraphs.forEach(p => { if (!/[""\u201C]/.test(p)) { noDialogueStreak++; maxStreak = Math.max(maxStreak, noDialogueStreak) } else { noDialogueStreak = 0 } });
    if (maxStreak > 5) engagementScore -= (maxStreak - 5) * 3;
    // Reward question hooks (sentences ending with ?)
    const questions = (text.match(/\?/g) || []).length;
    if (questions > 0) engagementScore += Math.min(8, questions * 2);
    // Reward sensory language
    const sensory = (lower.match(/\b(smell|taste|touch|sound|sight|heard|felt|warm|cold|rough|smooth|bitter|sweet|sharp|soft|bright|dim|loud|quiet|whisper|roar|glimmer|shadow|echo)\b/g) || []).length;
    const sensoryRate = sensory / Math.max(totalWords, 1) * 1000;
    if (sensoryRate > 3) engagementScore += 5;
    // Penalize over-attribution in dialogue ("he said angrily", "she replied sadly")
    const emotionTags = (text.match(/[""\u201D]\s*\w+\s+(angrily|sadly|happily|nervously|excitedly|furiously|quietly|loudly|softly|tearfully|breathlessly)/gi) || []).length;
    engagementScore -= emotionTags * 3;

    // === DIALOGUE QUALITY (minimal intrusion, realistic) ===
    let dialogueQuality = dialogue.score;
    // Reward "said" being dominant (invisible tag)
    if (dialogue.count > 0 && dialogue.saidRatio > 60 && dialogue.saidRatio < 90) dialogueQuality += 5;
    // Penalize exotic tags overuse
    if (dialogue.count > 0 && dialogue.saidRatio < 30) dialogueQuality -= 10;
    dialogueQuality = Math.min(100, Math.max(0, dialogueQuality));

    // === FORWARD MOMENTUM (does text keep moving?) ===
    let momentumScore = 100;
    // Penalize flashback/backstory markers
    const backstory = (lower.match(/\b(he remembered|she remembered|years ago|back when|it had been|there had been|used to be|once upon a time|long ago|in those days)\b/g) || []).length;
    momentumScore -= Math.min(20, backstory * 4);
    // Reward scene breaks / chapter structure
    const sceneBreaks = (text.match(/\n\s*\*\s*\*\s*\*|\n\s*#|\n\s*---/g) || []).length;
    if (sceneBreaks > 0) momentumScore += 3;

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
        fillerWords: fillers, hedgeWords: hedges, weakOpenings, infoDumps,
        modifierStacks, overExplain, backstoryMarkers: backstory,
        sensoryWords: sensory, punchySentences, emotionTags,
        avgParagraphLength: Math.round(avgParaWords),
        pronounDensity: Math.round(pronounRatio * 100),
        fillerRate: Math.round(fillerRate * 10) / 10
      }
    };
  },

  // ========================
  // TRUE LINE EDITING ENGINE
  // Evaluates: tone consistency, sentence flow, word precision,
  // pacing rhythm, POV discipline, extraneous language, paragraph
  // transitions at the sentence level
  // ========================
  analyzeLineEditing(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const words = text.match(/\b\w+\b/g) || [];
    const totalWords = words.length;
    const lower = text.toLowerCase();
    if (sentences.length < 3) return { score: 50, tone: {}, flow: {}, precision: {}, pacing: {}, pov: {}, findings: [] };
    const findings = [];

    // === 1. TONE CONSISTENCY ===
    // Are the word choices serving a consistent emotional register?
    let toneScore = 100;
    // Detect tonal clashes: formal words near casual words
    const formalWords = (lower.match(/\b(nevertheless|furthermore|notwithstanding|henceforth|whereby|therein|aforementioned|commenced|endeavored|subsequently|utilized|ascertained|pursuant|heretofore)\b/g) || []).length;
    const casualWords = (lower.match(/\b(gonna|wanna|gotta|kinda|sorta|stuff|things|cool|awesome|totally|basically|literally|super|pretty much|you know|like)\b/g) || []).length;
    if (formalWords > 0 && casualWords > 0) {
      toneScore -= Math.min(20, (formalWords + casualWords) * 4);
      findings.push({ type: 'tone', severity: 'medium', message: 'Tonal clash: ' + formalWords + ' formal words mixed with ' + casualWords + ' casual words. Pick a register and stay consistent.' });
    }
    // Detect emotional whiplash (rapid mood shifts without transition)
    const moodWords = { dark: /\b(dark|death|blood|fear|terror|grief|mourn|scream|agony)\b/gi, light: /\b(laugh|smile|joy|delight|warm|bright|hope|cheer|happy)\b/gi };
    let prevMood = null;
    let moodShifts = 0;
    sentences.forEach(s => {
      const sl = s.toLowerCase();
      const darkCount = (sl.match(moodWords.dark) || []).length;
      const lightCount = (sl.match(moodWords.light) || []).length;
      const mood = darkCount > lightCount ? 'dark' : lightCount > darkCount ? 'light' : null;
      if (mood && prevMood && mood !== prevMood) moodShifts++;
      if (mood) prevMood = mood;
    });
    if (moodShifts > sentences.length * 0.15) {
      toneScore -= 10;
      findings.push({ type: 'tone', severity: 'low', message: 'Frequent mood shifts (' + moodShifts + ') without transition. Readers may feel disoriented.' });
    }

    // === 2. SENTENCE FLOW (do sentences connect naturally?) ===
    let flowScore = 100;
    // Check for abrupt topic shifts between consecutive sentences
    let abruptShifts = 0;
    for (let i = 1; i < sentences.length; i++) {
      const prev = sentences[i - 1].toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const curr = sentences[i].toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      const prevSet = new Set(prev);
      const shared = curr.filter(w => prevSet.has(w)).length;
      // If zero overlap and no transition word, it's abrupt
      if (shared === 0 && !/^(but|and|so|then|yet|still|however|meanwhile|instead|also|furthermore|besides|next|after|before|later|now|finally)\b/i.test(sentences[i].trim())) {
        abruptShifts++;
      }
    }
    const abruptRate = abruptShifts / Math.max(sentences.length - 1, 1);
    if (abruptRate > 0.3) {
      flowScore -= Math.round(abruptRate * 30);
      findings.push({ type: 'flow', severity: 'medium', message: Math.round(abruptRate * 100) + '% of sentence transitions are abrupt — no shared context or transition word. Sentences feel disconnected.' });
    }
    // Check sentence rhythm variety (consecutive same-length sentences)
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    let monotoneRuns = 0;
    for (let i = 2; i < lengths.length; i++) {
      const diff1 = Math.abs(lengths[i] - lengths[i - 1]);
      const diff2 = Math.abs(lengths[i - 1] - lengths[i - 2]);
      if (diff1 < 3 && diff2 < 3) monotoneRuns++;
    }
    if (monotoneRuns > sentences.length * 0.3) {
      flowScore -= 10;
      findings.push({ type: 'flow', severity: 'low', message: 'Sentence lengths are too uniform — creates a monotone rhythm. Vary between short punches and longer flowing sentences.' });
    }

    // === 3. WORD PRECISION (are words earning their place?) ===
    let precisionScore = 100;
    // Vague/imprecise words
    const vagueWords = (lower.match(/\b(thing|things|stuff|something|somehow|somewhat|somewhere|nice|good|bad|big|small|very|really|quite|rather|pretty|a lot|a bit|kind of|sort of|got|get|went|came|made|did)\b/g) || []).length;
    const vagueRate = vagueWords / Math.max(totalWords, 1) * 100;
    if (vagueRate > 3) {
      precisionScore -= Math.min(25, Math.round(vagueRate * 4));
      findings.push({ type: 'precision', severity: 'medium', message: vagueWords + ' vague/imprecise words (' + vagueRate.toFixed(1) + '%). Replace "thing", "stuff", "nice", "got" with specific language.' });
    }
    // Redundant modifiers (e.g. "completely destroyed", "very unique")
    const redundantMods = (lower.match(/\b(completely destroyed|totally ruined|very unique|absolutely perfect|completely finished|totally dead|very essential|extremely crucial|quite obvious|rather interesting|pretty good|really nice|very important|absolutely necessary)\b/g) || []).length;
    if (redundantMods > 0) {
      precisionScore -= redundantMods * 4;
      findings.push({ type: 'precision', severity: 'low', message: redundantMods + ' redundant modifier(s) found ("very unique", "completely destroyed"). The modifier adds nothing.' });
    }

    // === 4. PACING RHYTHM (at sentence level) ===
    let pacingScore = 100;
    // Action scenes should have shorter sentences
    // Description scenes can be longer
    // But overall, variety is key
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const stdDev = Math.sqrt(lengths.reduce((s, l) => s + Math.pow(l - avgLen, 2), 0) / lengths.length);
    if (stdDev < 3) {
      pacingScore -= 15;
      findings.push({ type: 'pacing', severity: 'medium', message: 'Very low sentence length variation (stddev: ' + stdDev.toFixed(1) + '). Writing feels mechanical. Mix short and long.' });
    } else if (stdDev > 4 && stdDev < 12) {
      pacingScore += 5; // good variety
    }
    // Check for dialogue pacing: dialogue paragraphs should be snappy
    const dialogueParagraphs = paragraphs.filter(p => /[""\u201C]/.test(p));
    const longDialogueParagraphs = dialogueParagraphs.filter(p => p.split(/\s+/).length > 80);
    if (longDialogueParagraphs.length > 0) {
      pacingScore -= longDialogueParagraphs.length * 5;
      findings.push({ type: 'pacing', severity: 'low', message: longDialogueParagraphs.length + ' dialogue paragraph(s) over 80 words. Dialogue should feel snappy — break into shorter exchanges.' });
    }

    // === 5. POV DISCIPLINE ===
    let povScore = 100;
    const firstPerson = (text.match(/\bI\b/g) || []).length;
    const thirdHeShe = (text.match(/\b(he|she)\b/gi) || []).length;
    const secondYou = (text.match(/\byou\b/gi) || []).length;
    const dominant = firstPerson > thirdHeShe ? 'first' : thirdHeShe > firstPerson ? 'third' : 'mixed';
    // Check for POV slips
    if (dominant === 'third' && firstPerson > 2) {
      const slipRate = firstPerson / (firstPerson + thirdHeShe);
      if (slipRate > 0.05) {
        povScore -= 15;
        findings.push({ type: 'pov', severity: 'high', message: 'POV slip: ' + firstPerson + ' first-person ("I") occurrences in third-person narrative. Unless intentional, stay consistent.' });
      }
    }
    if (dominant === 'first' && thirdHeShe > 5) {
      povScore -= 10;
      findings.push({ type: 'pov', severity: 'medium', message: 'POV inconsistency: heavy third-person pronouns in first-person narrative.' });
    }
    // Head-hopping: in third person limited, check if we see multiple characters\' thoughts
    if (dominant === 'third') {
      const thoughtVerbs = text.match(/\b(he thought|she thought|he wondered|she wondered|he knew|she knew|he felt|she felt|he realized|she realized)\b/gi) || [];
      const heThoughts = thoughtVerbs.filter(t => /^he/i.test(t)).length;
      const sheThoughts = thoughtVerbs.filter(t => /^she/i.test(t)).length;
      if (heThoughts > 0 && sheThoughts > 0) {
        povScore -= 10;
        findings.push({ type: 'pov', severity: 'medium', message: 'Possible head-hopping: both "he thought/felt/knew" (' + heThoughts + ') and "she thought/felt/knew" (' + sheThoughts + '). In limited third person, only one character\'s thoughts should be accessible per scene.' });
      }
    }

    // === 6. EXTRANEOUS LANGUAGE ===
    let extraneousScore = 100;
    // "began to", "started to" — just do the action
    const beganTo = (lower.match(/\b(began to|started to|proceeded to|continued to|attempted to|happened to|managed to)\b/g) || []).length;
    if (beganTo > 0) {
      extraneousScore -= beganTo * 3;
      findings.push({ type: 'extraneous', severity: 'low', message: beganTo + ' filter phrase(s): "began to", "started to", etc. Cut the filter — just do the action. "She began to run" → "She ran."' });
    }
    // "that" overuse
    const thatCount = (lower.match(/\bthat\b/g) || []).length;
    const thatRate = thatCount / Math.max(totalWords, 1) * 100;
    if (thatRate > 2.5) {
      extraneousScore -= 8;
      findings.push({ type: 'extraneous', severity: 'low', message: '"That" appears ' + thatCount + ' times (' + thatRate.toFixed(1) + '%). Many can be removed: "She knew that he was" → "She knew he was."' });
    }
    // "in order to" / "the fact that" already caught by wordy, but reinforce
    // Dialogue attribution overload
    const attributions = (text.match(/[""\u201D]\s*(he|she|they|I)\s+(said|asked|replied|answered|whispered|shouted|muttered|exclaimed|declared|responded|cried|yelled|stated|remarked|noted)\b/gi) || []).length;
    const dialogueLines = (text.match(/[""\u201C][^""\u201D]*[""\u201D]/g) || []).length;
    if (dialogueLines > 0 && attributions / dialogueLines > 0.8) {
      extraneousScore -= 8;
      findings.push({ type: 'extraneous', severity: 'low', message: 'Dialogue is over-attributed (' + attributions + '/' + dialogueLines + ' lines tagged). In two-person dialogue, you can drop most tags after establishing who\'s speaking.' });
    }

    // Clamp scores
    toneScore = Math.min(100, Math.max(0, toneScore));
    flowScore = Math.min(100, Math.max(0, flowScore));
    precisionScore = Math.min(100, Math.max(0, precisionScore));
    pacingScore = Math.min(100, Math.max(0, pacingScore));
    povScore = Math.min(100, Math.max(0, povScore));
    extraneousScore = Math.min(100, Math.max(0, extraneousScore));

    const score = Math.round(toneScore * 0.15 + flowScore * 0.2 + precisionScore * 0.2 + pacingScore * 0.15 + povScore * 0.15 + extraneousScore * 0.15);

    return {
      score,
      tone: { score: toneScore, formalWords, casualWords, moodShifts },
      flow: { score: flowScore, abruptShifts, abruptRate: Math.round(abruptRate * 100), monotoneRuns },
      precision: { score: precisionScore, vagueWords, vagueRate: Math.round(vagueRate * 10) / 10, redundantMods },
      pacing: { score: pacingScore, avgSentenceLength: Math.round(avgLen), stdDev: Math.round(stdDev * 10) / 10, longDialogueParagraphs: longDialogueParagraphs.length },
      pov: { score: povScore, dominant, firstPerson, thirdPerson: thirdHeShe, slips: findings.filter(f => f.type === 'pov').length },
      extraneous: { score: extraneousScore, beganTo, thatCount, thatRate: Math.round(thatRate * 10) / 10, overAttributed: dialogueLines > 0 && attributions / dialogueLines > 0.8 },
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
    const g = genre.primary;

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
  generateBlurbs(text, characters, genre, mode) {
    if (mode !== 'book' && text.split(/\s+/).length < 5000) {
      return { available: false, reason: 'Blurbs are generated for full manuscripts (book mode or 5000+ words). Upload a complete manuscript to unlock blurb suggestions.' };
    }

    // Strip chapter headings from the text for clean extraction
    const cleanText = text.replace(/^(chapter\s+\d+|chapter\s+[a-z]+|part\s+\d+|part\s+[a-z]+)\s*$/gim, '').replace(/\n{3,}/g, '\n\n');
    const paragraphs = cleanText.split(/\n\s*\n/).filter(p => p.trim().length > 10);
    const lower = cleanText.toLowerCase();
    const totalWords = cleanText.split(/\s+/).length;
    const charNames = characters.list.map(c => c.name);
    const protagonist = charNames[0] || 'the protagonist';
    const antagonist = charNames.length > 1 ? charNames[1] : null;
    const genreLabel = genre.label || 'Fiction';

    // === EXTRACT THE 6-QUESTION FRAMEWORK ===

    // Q1: What does the main character want / status quo?
    // Look in first 15% of text for character goals and normal life
    const openingSection = paragraphs.slice(0, Math.ceil(paragraphs.length * 0.15)).join(' ');
    const openingLower = openingSection.toLowerCase();
    const wantPatterns = openingSection.match(new RegExp(protagonist + '\\s+(wanted|needed|wished|hoped|dreamed|longed|craved|sought|was trying|had always|lived|worked|spent)', 'i'));
    const statusQuo = wantPatterns ? this._extractSentenceAt(openingSection, wantPatterns.index) : this._extractFirstMeaningfulSentence(openingSection, protagonist);

    // Q2: How does it change? (inciting incident - first 25%)
    const earlySection = paragraphs.slice(0, Math.ceil(paragraphs.length * 0.25)).join(' ');
    const changePatterns = earlySection.match(/\b(but then|until|one day|everything changed|suddenly|that's when|then came|arrived|discovered|found out|learned that|received|stumbled|appeared)\b/i);
    const incitingIncident = changePatterns ? this._extractSentenceAt(earlySection, changePatterns.index) : '';

    // Q3: How does it get worse? (conflict - middle 30-60%)
    const midStart = Math.floor(paragraphs.length * 0.3);
    const midEnd = Math.floor(paragraphs.length * 0.6);
    const middleSection = paragraphs.slice(midStart, midEnd).join(' ');
    const conflictPatterns = middleSection.match(/\b(but|however|unfortunately|worse|problem|danger|threat|impossible|never|couldn't|wouldn't|refused|betrayed|lied|secret|truth|revealed)\b/i);
    const conflict = conflictPatterns ? this._extractSentenceAt(middleSection, conflictPatterns.index) : '';

    // Q4: How does character try to fix it? (attempts - middle 50-75%)
    const attemptStart = Math.floor(paragraphs.length * 0.5);
    const attemptEnd = Math.floor(paragraphs.length * 0.75);
    const attemptSection = paragraphs.slice(attemptStart, attemptEnd).join(' ');
    const attemptPatterns = attemptSection.match(/\b(decided|plan|must|had to|needed to|determined|set out|tried|fought|risked|chose|vowed|promised)\b/i);
    const attempt = attemptPatterns ? this._extractSentenceAt(attemptSection, attemptPatterns.index) : '';

    // Q5: How does it make things worse? (crisis - 70-90%)
    const crisisStart = Math.floor(paragraphs.length * 0.7);
    const crisisEnd = Math.floor(paragraphs.length * 0.9);
    const crisisSection = paragraphs.slice(crisisStart, crisisEnd).join(' ');
    const crisisPatterns = crisisSection.match(/\b(everything|nothing|lost|destroyed|shattered|broken|trapped|impossible|too late|no way|final|last chance|only hope)\b/i);
    const crisis = crisisPatterns ? this._extractSentenceAt(crisisSection, crisisPatterns.index) : '';

    // Q6: What is at stake? (stakes - throughout but especially last 30%)
    const lateSection = paragraphs.slice(Math.floor(paragraphs.length * 0.7)).join(' ');
    const stakesPatterns = lateSection.match(/\b(lose|death|life|love|freedom|everything|world|family|home|truth|soul|heart|future|hope|survive)\b/i);
    const stakes = stakesPatterns ? this._extractSentenceAt(lateSection, stakesPatterns.index) : '';

    // Detect tone markers for the blurbs
    const isDark = (lower.match(/\b(death|murder|blood|dark|shadow|kill|terror|horror|fear)\b/g) || []).length > 5;
    const isRomantic = (lower.match(/\b(love|heart|kiss|passion|desire|romance|attraction|beautiful)\b/g) || []).length > 5;
    const isFunny = (lower.match(/\b(laugh|smile|grin|joke|ridiculous|absurd|hilarious|funny)\b/g) || []).length > 3;
    const isAction = (lower.match(/\b(fight|battle|war|weapon|chase|escape|explosion|attack|run)\b/g) || []).length > 5;

    // === BUILD 5 BLURB VARIATIONS ===
    const framework = { statusQuo, incitingIncident, conflict, attempt, crisis, stakes, protagonist, antagonist };

    const blurbs = [
      this._buildBlurb_hookFirst(framework, genreLabel, isDark, isRomantic, isFunny),
      this._buildBlurb_questionStyle(framework, genreLabel),
      this._buildBlurb_stakesForward(framework, genreLabel, isDark),
      this._buildBlurb_characterFocused(framework, genreLabel, isRomantic),
      this._buildBlurb_cinematic(framework, genreLabel, isAction, isDark)
    ];

    return {
      available: true,
      framework,
      blurbs,
      wordCount: totalWords,
      protagonist,
      antagonist,
      toneDetected: isDark ? 'Dark/Suspense' : isRomantic ? 'Romantic' : isFunny ? 'Light/Comedy' : isAction ? 'Action/Thriller' : 'Literary'
    };
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

  // Blurb 1: Hook-first (lead with the most dramatic element)
  _buildBlurb_hookFirst(fw, genre, isDark, isRomantic, isFunny) {
    let parts = [];
    if (fw.crisis) parts.push(this._trimTo(fw.crisis, 40));
    parts.push('But it wasn\'t always this way.');
    if (fw.statusQuo) parts.push(this._trimTo(fw.statusQuo, 35));
    if (fw.incitingIncident) parts.push(this._trimTo(fw.incitingIncident, 30));
    if (fw.conflict) parts.push('Now, ' + this._trimToLower(fw.conflict, 30));
    parts.push('With everything on the line, ' + fw.protagonist + ' must face a choice that will change everything.');
    const blurb = this._cleanBlurb(parts.join(' '));
    return { style: 'Hook First', description: 'Opens with the crisis to grab attention, then rewinds to show how it got there.', text: blurb || 'Could not extract enough story elements.', wordCount: blurb.split(/\s+/).length };
  },

  // Blurb 2: Question style (end with a provocative question)
  _buildBlurb_questionStyle(fw, genre) {
    let parts = [];
    if (fw.statusQuo) parts.push(this._trimTo(fw.statusQuo, 35));
    if (fw.incitingIncident) parts.push(this._trimTo(fw.incitingIncident, 30));
    if (fw.conflict) parts.push(this._trimTo(fw.conflict, 30));
    const crisisText = this._trimToLower(fw.crisis || fw.attempt || 'the truth comes out', 20);
    parts.push('When ' + crisisText + ', will ' + fw.protagonist + ' lose everything — or find a way to survive?');
    const blurb = this._cleanBlurb(parts.join(' '));
    return { style: 'Question Hook', description: 'Builds to a question that makes the reader need to know the answer.', text: blurb, wordCount: blurb.split(/\s+/).length };
  },

  // Blurb 3: Stakes forward (lead with what's at risk)
  _buildBlurb_stakesForward(fw, genre, isDark) {
    const stakeWord = isDark ? 'survive' : 'hold onto what matters most';
    let parts = [fw.protagonist + ' has one chance to ' + stakeWord + '.'];
    if (fw.statusQuo) parts.push(this._trimTo(fw.statusQuo, 30));
    if (fw.incitingIncident) parts.push('Then ' + this._trimToLower(fw.incitingIncident, 25));
    if (fw.conflict) parts.push(this._trimTo(fw.conflict, 25));
    if (fw.attempt) parts.push(this._trimTo(fw.attempt, 25));
    const stakesText = this._trimToLower(fw.stakes || 'everything at stake', 20);
    parts.push('Now, with ' + stakesText + ', there\'s no turning back.');
    const blurb = this._cleanBlurb(parts.join(' '));
    return { style: 'Stakes Forward', description: 'Opens with what the character stands to lose, creating immediate urgency.', text: blurb, wordCount: blurb.split(/\s+/).length };
  },

  // Blurb 4: Character-focused (who is this person and why should we care?)
  _buildBlurb_characterFocused(fw, genre, isRomantic) {
    let parts = [];
    if (fw.statusQuo) parts.push(this._trimTo(fw.statusQuo, 35));
    if (isRomantic && fw.incitingIncident) parts.push('Everything changes when ' + this._trimToLower(fw.incitingIncident, 30));
    else if (fw.incitingIncident) parts.push(this._trimTo(fw.incitingIncident, 30));
    if (fw.conflict) parts.push(this._trimTo(fw.conflict, 25));
    const startText = this._trimToLower(fw.statusQuo || 'an ordinary life', 12);
    const stakeText = this._trimToLower(fw.stakes || 'everything', 15);
    parts.push('What started as ' + startText + ' has become a fight for ' + stakeText + '.');
    const blurb = this._cleanBlurb(parts.join(' '));
    return { style: 'Character Portrait', description: 'Centers the character — who they are, what they want, and what threatens them.', text: blurb, wordCount: blurb.split(/\s+/).length };
  },

  // Blurb 5: Cinematic (short, punchy, visual)
  _buildBlurb_cinematic(fw, genre, isAction, isDark) {
    let lines = [];
    if (fw.statusQuo) lines.push(this._trimTo(fw.statusQuo, 18));
    if (fw.incitingIncident) lines.push(this._trimTo(fw.incitingIncident, 15));
    if (fw.conflict) lines.push(this._trimTo(fw.conflict, 15));
    const closer = isDark ? 'Some doors, once opened, can never be closed.' : isAction ? 'The countdown has begun.' : 'Nothing will ever be the same.';
    lines.push(closer);
    const blurb = this._cleanBlurb(lines.join('\n\n'));
    return { style: 'Cinematic', description: 'Short, punchy lines with white space. Reads like a movie trailer.', text: blurb, wordCount: blurb.replace(/\n/g,' ').split(/\s+/).length };
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
  analyzeDNF(text, manuscriptMode) {
    const totalWords = (text.match(/\b\w+\b/g) || []).length;
    const mode = manuscriptMode.mode;

    // Determine evaluation mode
    const evalMode = this._detectEvalMode(text, mode);

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
    if (totalWords < 10) return null;

    const lower = text.toLowerCase();
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const avgSentLen = totalWords / Math.max(sentences.length, 1);

    // === HOOK STRENGTH (1-10) ===
    const first500 = lower.substring(0, Math.min(lower.length, 2500));
    const tensionOpening = (first500.match(/\b(but|however|suddenly|until|except|never|wrong|strange|secret|dead|blood|lie|couldn't|shouldn't|danger|threat|impossible)\b/g) || []).length;
    const questionOpening = (text.substring(0, 2500).match(/\?/g) || []).length;
    const dialogueOpening = (text.substring(0, 2500).match(/["\u201C][^"\u201D]{3,}["\u201D]/g) || []).length;
    const actionOpening = (first500.match(/\b(ran|grabbed|turned|slammed|pushed|pulled|threw|shouted|whispered|raced|lunged|leaped|opened|shut|dropped|said)\b/g) || []).length;
    const setupWords = (first500.match(/\b(had been|used to|always had|for years|remembered when|was born in|grew up|the history of|it all began)\b/g) || []).length;

    let hook_strength = 5;
    hook_strength += Math.min(2, tensionOpening / 3);
    hook_strength += Math.min(1, questionOpening * 0.5);
    hook_strength += Math.min(1, dialogueOpening * 0.4);
    hook_strength += Math.min(1, actionOpening / 3);
    hook_strength -= Math.min(3, setupWords * 1.2);
    if (/^(it was|there was|there were|the sun|the rain|once upon)/i.test(text.trim())) hook_strength -= 1.5;

    // === CLARITY (1-10) ===
    const passiveCount = (text.match(/\b(was|were|is|are|been|being)\s+(being\s+)?\w+(ed|en)\b/gi) || []).length;
    const longSentences = sentences.filter(s => s.trim().split(/\s+/).length > 30).length;
    const transitionWords = (lower.match(/\b(however|therefore|meanwhile|furthermore|consequently|additionally|nevertheless|moreover|specifically|for example|in contrast|as a result|on the other hand)\b/g) || []).length;
    const jargon = (lower.match(/\b(aforementioned|notwithstanding|heretofore|wherein|thereof|pertaining|henceforth|inasmuch)\b/g) || []).length;

    let clarity = 7;
    clarity -= Math.min(2, passiveCount / Math.max(totalWords, 1) * 300);
    clarity -= Math.min(2, longSentences / Math.max(sentences.length, 1) * 10);
    clarity += Math.min(1.5, transitionWords / Math.max(paragraphs.length, 1) * 3);
    clarity -= jargon * 0.5;
    if (avgSentLen > 25) clarity -= 1.5;
    else if (avgSentLen >= 12 && avgSentLen <= 20) clarity += 1;

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

    let forward_motion = 5;
    forward_motion += Math.min(2, actionVerbs / Math.max(totalWords, 1) * 500);
    forward_motion += Math.min(1, hookRate * 2.5);
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

    let specificity = 5;
    specificity -= Math.min(2.5, vagueWords / Math.max(totalWords, 1) * 200);
    specificity += Math.min(1.5, concreteNouns / Math.max(totalWords, 1) * 200);
    specificity += Math.min(1, sensoryWords / Math.max(totalWords, 1) * 300);
    specificity += Math.min(1, bodyLanguage / Math.max(totalWords, 1) * 500);
    const lexicalDiversity = [...new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g, '')).filter(w => w.length > 2))].length / Math.max(words.length, 1);
    specificity += Math.min(1.5, (lexicalDiversity - 0.3) * 8);

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

    let redundancy = 8;
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

    let payoff = 5;
    payoff += Math.min(1.5, emotionWords / Math.max(totalWords, 1) * 300);
    payoff += Math.min(1.5, revealWords / Math.max(totalWords, 1) * 500);
    payoff += Math.min(1, surpriseWords / Math.max(totalWords, 1) * 400);
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
    // Weighted average of dimensions → convert to risk on 0-100 scale.
    // Calibration: all-5s ≈ 56 (Medium), all-8s ≈ 22 (Low), all-3s ≈ 78 (High).
    const wt = evalMode === 'opening'
      ? { hook_strength: 0.30, clarity: 0.20, forward_motion: 0.18, redundancy: 0.14, specificity: 0.12, payoff: 0.06 }
      : evalMode === 'closing'
      ? { hook_strength: 0.10, clarity: 0.18, forward_motion: 0.22, redundancy: 0.14, specificity: 0.12, payoff: 0.24 }
      : { hook_strength: 0.20, clarity: 0.20, forward_motion: 0.22, redundancy: 0.15, specificity: 0.13, payoff: 0.10 };

    const weighted = Object.entries(wt).reduce((sum, [dim, w]) => sum + (scores[dim] || 5) * w, 0);
    // Score 10 → risk 0, score 1 → risk 100
    return Math.max(0, Math.min(100, Math.round((10 - weighted) / 9 * 100)));
  },

  _buildReasons(scores, evalMode) {
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
      const extras = [
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
      avgScores[d] = Math.round(sectionScores.reduce((s, sec) => s + sec.scores[d], 0) / sectionScores.length);
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
    // Only score copy-editing issue types, not style/structure issues
    const copyTypes = new Set(['passive', 'adverb', 'cliche', 'wordy', 'confused-word', 'repetition', 'grammar']);
    const copyIssues = issues.filter(i => copyTypes.has(i.type));
    const issuesPerThousand = (copyIssues.length / Math.max(totalWords, 1)) * 1000;
    let score = 100;
    score -= Math.min(40, issuesPerThousand * 3);
    const highSev = copyIssues.filter(i => i.severity === 'high').length;
    const medSev = copyIssues.filter(i => i.severity === 'medium').length;
    score -= Math.min(20, highSev * 2);
    score -= Math.min(10, medSev * 0.5);
    return Math.min(100, Math.max(0, Math.round(score)));
  },

  // ========================
  // FULL ANALYSIS
  // ========================
  analyze(text) {
    if (!text || text.trim().length < 50) {
      return { error: 'Text too short for meaningful analysis. Please provide at least a few paragraphs.' };
    }

    // Detect manuscript mode first
    const manuscriptMode = this.detectMode(text);
    const mode = manuscriptMode.mode;

    const passiveIssues = this.findPassiveVoice(text);
    const adverbIssues = this.findAdverbs(text);
    const clicheIssues = this.findCliches(text);
    const weakVerbIssues = this.findWeakVerbs(text);
    const wordyIssues = this.findWordyPhrases(text);
    const repetitionIssues = this.findRepetitions(text);
    const longSentenceIssues = this.findLongSentences(text);
    const showTellIssues = this.findShowVsTell(text);
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

    // Pass mode to mode-aware analyzers
    const plot = this.analyzePlot(text, mode);
    const transitions = this.analyzeTransitions(text);
    const dialogue = this.analyzeDialogue(text);
    const style = this.analyzeStyle(text);
    const sentenceVariety = this.analyzeSentenceVariety(text);
    const readability = this.fleschKincaid(text);
    const genre = this.detectGenre(text);
    const readerPerspective = this.analyzeReaderPerspective(text, mode, allIssues);
    const dnfAnalysis = this.analyzeDNF(text, manuscriptMode);
    // Backfill readerPerspective.dnfRisk from new engine for backward compat
    readerPerspective.dnfRisk = dnfAnalysis.dnf_risk;
    const pacing = this.analyzePacing(text);
    const characters = this.analyzeCharacters(text);
    const blurbs = this.generateBlurbs(text, characters, genre, mode);
    const scifiWorld = this.analyzeSciFiWorldbuilding(text, genre);
    const genreElements = this.analyzeGenreElements(text, genre);
    const openingDiagnosis = this.diagnoseOpening(text, genre);
    const sceneEmotions = this.detectSceneEmotions(text);

    const totalWords = (text.match(/\b\w+\b/g) || []).length;
    const copyScore = this.scoreCopyEditing(allIssues, totalWords);
    const lineEditing = this.analyzeLineEditing(text);
    const lineScore = lineEditing.score;
    const showTellScore = Math.max(0, 100 - showTellIssues.length * 5);

    // Grammar score: penalize based on grammar issue density
    const grammarFiltered = allIssues.filter(i => i.type === 'grammar');
    const grammarPerK = (grammarFiltered.length / Math.max(totalWords, 1)) * 1000;
    const grammarScore = Math.min(100, Math.max(0, Math.round(
      100 - Math.min(50, grammarPerK * 8) -
      Math.min(30, grammarFiltered.filter(i => i.severity === 'high').length * 4) -
      Math.min(15, grammarFiltered.filter(i => i.severity === 'medium').length * 1.5)
    )));

    // Deep writing quality engine
    const writingQuality = this.analyzeWritingQuality(text, allIssues, sentenceVariety, readability, dialogue, style);

    // Overall: blend structural + writing quality + engagement + grammar
    const overall = Math.round(
      plot.score * 0.09 +
      transitions.score * 0.07 +
      copyScore * 0.10 +
      lineScore * 0.09 +
      style.score * 0.07 +
      dialogue.score * 0.06 +
      showTellScore * 0.07 +
      grammarScore * 0.10 +
      writingQuality.clarityScore * 0.09 +
      writingQuality.disciplineScore * 0.07 +
      writingQuality.efficiencyScore * 0.06 +
      writingQuality.engagementScore * 0.07 +
      writingQuality.momentumScore * 0.06
    );

    // Issue density normalized per 1000 words
    const issuesPerK = Math.round(allIssues.length / Math.max(totalWords, 1) * 1000 * 10) / 10;

    return {
      overall, genre, totalWords, manuscriptMode, issuesPerK,
      scores: {
        plot: plot.score, transitions: transitions.score, copy: copyScore,
        line: lineScore, style: style.score, dialogue: dialogue.score,
        showTell: showTellScore, grammar: grammarScore
      },
      writingQuality, lineEditing, blurbs, scifiWorld, genreElements, openingDiagnosis, sceneEmotions,
      plot, transitions, dialogue, style, sentenceVariety, readability,
      readerPerspective, dnfAnalysis, pacing, characters,
      showTell: { score: showTellScore, issues: showTellIssues },
      issues: allIssues,
      issueCounts: {
        passive: passiveIssues.length, adverb: adverbIssues.length,
        cliche: clicheIssues.length, 'weak-verb': weakVerbIssues.length,
        wordy: wordyIssues.length, repetition: repetitionIssues.length,
        'sentence-length': longSentenceIssues.length, 'show-tell': showTellIssues.length,
        'confused-word': confusedWordIssues.length,
        grammar: grammarIssues.length,
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
