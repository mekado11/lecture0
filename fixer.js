// AuthorScrolls — Fix computation engine
// Pure logic: no DOM access, no side effects. Takes issue data, returns replacements.

const Fixer = {

  PAST_FORM_MAP: {
    glance:'glanced',gaze:'gazed',peer:'peered',watch:'watched',study:'studied',
    stride:'strode',move:'moved',pace:'paced',stroll:'strolled',cross:'crossed',
    create:'created',craft:'crafted',form:'formed',produce:'produced',build:'built',
    arrive:'arrived',appear:'appeared',emerge:'emerged',approach:'approached',enter:'entered',
    head:'headed',travel:'traveled',depart:'departed',
    pivot:'pivoted',shift:'shifted',swing:'swung',rotate:'rotated',spin:'spun',
    rise:'rose',remain:'remained',linger:'lingered',wait:'waited',stay:'stayed',
    understand:'understood',recognize:'recognized',realize:'realized',sense:'sensed',grasp:'grasped',
    consider:'considered',wonder:'wondered',reflect:'reflected',believe:'believed',imagine:'imagined',
    experience:'experienced',notice:'noticed',detect:'detected',perceive:'perceived',
    grab:'grabbed',seize:'seized',claim:'claimed',accept:'accepted',retrieve:'retrieved',
    offer:'offered',hand:'handed',present:'presented',provide:'provided',deliver:'delivered',
    begin:'began',initiate:'initiated',launch:'launched',commence:'commenced',open:'opened',
    sound:'sounded',suggest:'suggested',indicate:'indicated',
    inform:'informed',explain:'explained',reveal:'revealed',instruct:'instructed',describe:'described',
    question:'questioned',inquire:'inquired',request:'requested',demand:'demanded',
    state:'stated',reply:'replied',remark:'remarked',note:'noted',add:'added',
    discover:'discovered',locate:'located',uncover:'uncovered',encounter:'encountered',spot:'spotted',
    name:'named',summon:'summoned',address:'addressed',hail:'hailed',dub:'dubbed'
  },

  CLICHE_FIXES: {
    'the calm before the storm':'the tense quiet before everything changed',
    'crystal clear':'completely obvious','like a punch to the gut':'a sudden shock',
    'hit her like':'struck her as','hit him like':'struck him as',
    'at the end of the day':'ultimately','few and far between':'rare',
    'in the nick of time':'just barely in time','beat around the bush':'avoid the point',
    'bite the bullet':'face it directly','break the ice':'ease the tension',
    'cold as ice':'frigid','cool as a cucumber':'completely calm',
    'dead as a doornail':'lifeless','easy as pie':'effortless',
    'heart of gold':'genuinely kind','piece of cake':'simple',
    'once in a blue moon':'very rarely','under the weather':'feeling ill',
    'tip of the iceberg':'only the surface','needle in a haystack':'nearly impossible to find',
    'on thin ice':'in a precarious position','raining cats and dogs':'pouring rain',
    'the elephant in the room':'the obvious unspoken issue',
    'water under the bridge':'already past','head over heels':'completely captivated',
    'every cloud has a silver lining':'there is an upside',
    'butterflies in my stomach':'a nervous flutter',
    'light at the end of the tunnel':'a sign of hope ahead',
    'back to the drawing board':'starting over','add insult to injury':'making it worse',
    'caught between a rock and a hard place':'trapped with no good option'
  },

  SYNONYM_MAP: {
    said:['stated','replied','remarked','noted','added'],looked:['glanced','gazed','peered','watched','studied'],walked:['strode','moved','paced','strolled','crossed'],made:['created','crafted','formed','produced','built'],came:['arrived','appeared','emerged','approached','entered'],went:['headed','moved','traveled','crossed','departed'],turned:['pivoted','shifted','swung','rotated','spun'],stood:['rose','remained','lingered','waited','stayed'],knew:['understood','recognized','realized','sensed','grasped'],thought:['considered','wondered','reflected','believed','imagined'],felt:['sensed','experienced','noticed','detected','perceived'],took:['grabbed','seized','claimed','accepted','retrieved'],gave:['offered','handed','presented','provided','delivered'],started:['began','initiated','launched','commenced','opened'],seemed:['appeared','looked','sounded','suggested','indicated'],told:['informed','explained','revealed','instructed','described'],asked:['questioned','inquired','wondered','requested','demanded'],eyes:['gaze','stare','glance','look','vision'],face:['expression','features','countenance','visage','look'],hand:['grip','palm','fingers','fist','grasp'],head:['mind','thoughts','skull','brow','temple'],voice:['tone','words','speech','whisper','sound'],door:['entrance','doorway','threshold','entry','gate'],room:['chamber','space','quarters','hall','area'],time:['moment','occasion','instance','period','while'],back:['spine','rear','return','retreat','behind'],long:['extended','prolonged','lengthy','enduring','sustained'],dark:['dim','shadowed','unlit','gloomy','murky'],small:['little','slight','tiny','compact','modest'],found:['discovered','located','uncovered','encountered','spotted'],called:['named','summoned','addressed','hailed','dubbed'],people:['individuals','figures','crowd','group','folk'],world:['realm','domain','land','sphere','landscape'],place:['location','spot','position','site','area'],still:['motionless','calm','quiet','unmoving','yet'],words:['speech','language','phrases','remarks','terms'],woman:['figure','lady','person','character','she'],never:['rarely','seldom','hardly','not once','at no point'],always:['constantly','perpetually','inevitably','forever','endlessly'],around:['surrounding','about','nearby','encircling','throughout'],before:['earlier','previously','prior','ahead','formerly'],every:['each','all','entire','whole','total'],mother:['parent','matriarch','her mother','mama','the woman'],taught:['instructed','showed','trained','guided','schooled']
  },

  pickSynonym(original, candidates, sentenceContext) {
    if (!candidates || candidates.length === 0) return null;
    const origLower = original.toLowerCase();
    const isPastContext = /\b(was|were|had|did)\b/i.test(sentenceContext) ||
      origLower.endsWith('ed') ||
      /\b(said|looked|walked|made|came|went|turned|stood|knew|thought|felt|took|gave|started|seemed|told|asked|found|called)\b/.test(origLower);

    let picked = candidates;
    if (isPastContext) {
      picked = candidates.map(c => {
        const cl = c.toLowerCase().trim();
        if (this.PAST_FORM_MAP[cl]) return this.PAST_FORM_MAP[cl];
        if (cl.endsWith('ed') || cl.endsWith('oke') || cl.endsWith('ode') || cl.endsWith('ung') || cl.endsWith('ew')) return c;
        if (cl.endsWith('e')) return cl + 'd';
        return cl + 'ed';
      });
    }

    const choice = picked[Math.floor(Math.random() * picked.length)];
    if (!choice) return candidates[0];
    if (original[0] === original[0].toUpperCase()) {
      return choice.charAt(0).toUpperCase() + choice.slice(1);
    }
    return choice;
  },

  splitSentence(text) {
    const midpoint = text.length / 2;
    const phase1 = [/, and\s/i, /, but\s/i, /, or\s/i, /;\s/, / — /, / -- /];
    const phase2 = [/\s+and\s+/i, /\s+but\s+/i, /\s+or\s+/i];
    const phase3 = [/\s+who\s+/i, /\s+which\s+/i, /\s+where\s+/i, /\s+when\s+/i, /\s+that\s+/i, /\s+while\s+/i, /\s+although\s+/i, /\s+because\s+/i];
    const phase4 = [/,\s+/];

    function findBestSplit(patterns, minPos) {
      let best = -1, bestPat = null;
      for (const pat of patterns) {
        const r = new RegExp(pat.source, 'gi');
        let m;
        while ((m = r.exec(text)) !== null) {
          const pos = m.index;
          if (pos < (minPos || 15) || pos > text.length - 15) continue;
          if (best === -1 || Math.abs(pos - midpoint) < Math.abs(best - midpoint)) { best = pos; bestPat = m[0]; }
        }
      }
      return { pos: best, pat: bestPat };
    }

    let split = findBestSplit(phase1, 15);
    if (split.pos === -1) split = findBestSplit(phase2, 20);
    if (split.pos === -1) split = findBestSplit(phase3, 20);
    if (split.pos === -1) split = findBestSplit(phase4, 15);

    if (split.pos > 10) {
      const part1 = text.substring(0, split.pos).trim();
      let part2 = text.substring(split.pos + split.pat.length).trim();
      if (part2.length > 0) part2 = part2.charAt(0).toUpperCase() + part2.slice(1);
      const p1end = /[.!?]$/.test(part1) ? '' : '.';
      return part1 + p1end + ' ' + part2;
    }
    const words = text.split(/\s+/);
    const halfIdx = Math.floor(words.length / 2);
    const p1 = words.slice(0, halfIdx).join(' ').trim() + '.';
    let p2 = words.slice(halfIdx).join(' ').trim();
    if (p2.length > 0) p2 = p2.charAt(0).toUpperCase() + p2.slice(1);
    return p1 + ' ' + p2;
  },

  computeReplacement(type, original, suggestion, sentenceContext) {
    let replacement = '';
    let mode = 'replace';

    const aiMatch = suggestion.match(/Replace with:\s*"(.+?)"/);
    if (aiMatch && aiMatch[1] && aiMatch[1] !== original) {
      replacement = aiMatch[1];
    } else if (type === 'weak-verb') {
      const m = suggestion.match(/Try:\s*(.+)/i);
      if (m) {
        const alts = m[1].split(',').map(s => s.trim()).filter(Boolean);
        replacement = this.pickSynonym(original, alts, sentenceContext) || alts[0] || original;
      } else { replacement = original; }
    } else if (type === 'wordy') {
      const m = suggestion.match(/Replace with:\s*"(.+?)"/i);
      replacement = m ? m[1] : '';
      if (replacement === '(omit)' || replacement === '(omit or rephrase)') { replacement = ''; mode = 'remove'; }
      else if (!replacement) { mode = 'remove'; replacement = ''; }
    } else if (type === 'adverb') {
      replacement = ''; mode = 'remove';
    } else if (type === 'cliche') {
      const lo = original.toLowerCase().trim();
      replacement = this.CLICHE_FIXES[lo] || Object.entries(this.CLICHE_FIXES).find(([k]) => lo.includes(k))?.[1] || '';
      if (!replacement) {
        replacement = original.replace(/\b(like|as)\s+a\s+/gi, '').trim();
        if (replacement === original) replacement = original + ' [replace with original phrasing]';
      }
    } else if (type === 'repetition') {
      const tryMatch = suggestion.match(/Try:\s*(.+)/i);
      if (tryMatch) {
        const alts = tryMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        replacement = this.pickSynonym(original, alts, sentenceContext) || alts[0] || original;
      } else {
        const lo = original.toLowerCase().trim();
        const syns = this.SYNONYM_MAP[lo];
        if (syns) { replacement = this.pickSynonym(original, syns, sentenceContext) || syns[0]; }
        else { replacement = original; }
      }
    } else if (type === 'sentence-length') {
      mode = 'split';
      replacement = this.splitSentence(original);
    } else {
      replacement = original;
    }

    return { replacement, mode };
  }
};
