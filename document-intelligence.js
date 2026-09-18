// AuthorScrolls — Document Intelligence v1
// Deterministic manuscript-type routing and nonfiction evidence extraction.
const DocumentIntelligence = (() => {
  const norm = s => String(s || '').replace(/\r\n?/g, '\n');

  function classify(parsed) {
    const text = norm((parsed?.chapters || []).map(c => c.text || c.body || '').join('\n'));
    const lower = text.toLowerCase();
    const signals = {
      reflectionQuestions: (lower.match(/\breflection questions?\s*:/g) || []).length,
      actions: (lower.match(/(?:^|\n)\s*action\s*:/g) || []).length,
      recommendations: (lower.match(/(?:^|\n)\s*recommendations?\s*$/gm) || []).length,
      researchAttribution: (lower.match(/\b(according to|a study|research (?:shows|found|suggests)|estimates that)\b/g) || []).length,
      instructionalAddress: (lower.match(/\b(ask yourself|write down|calculate the|consider what|i want you to)\b/g) || []).length
    };
    const nonfictionScore = Math.min(1,
      Math.min(signals.reflectionQuestions, 3) * .12 +
      Math.min(signals.actions, 3) * .12 +
      Math.min(signals.recommendations, 3) * .08 +
      Math.min(signals.researchAttribution, 5) * .06 +
      Math.min(signals.instructionalAddress, 8) * .025
    );
    const type = nonfictionScore >= .35 ? 'nonfiction' : 'fiction_or_unclassified';
    return { type, confidence: type === 'nonfiction' ? Math.min(.95, .55 + nonfictionScore * .4) : Math.max(.2, 1 - nonfictionScore), signals };
  }

  function sentenceEvidence(text, chapterId, regex, kind, max = 20) {
    const out = [];
    const sentences = norm(text).match(/[^.!?\n]+[.!?]+|[^.!?\n]+$/g) || [];
    for (const raw of sentences) {
      const sentence = raw.trim();
      regex.lastIndex = 0;
      if (!sentence || !regex.test(sentence)) continue;
      out.push({ kind, chapterId, evidence: sentence.slice(0, 500), confidence: .9, source: 'deterministic' });
      if (out.length >= max) break;
    }
    return out;
  }

  function extractQuestions(text, chapterId) {
    const out = [], lines = norm(text).split('\n');
    let inReflection = false;
    for (const raw of lines) {
      const line = raw.trim().replace(/^[•\-*]\s*/, '');
      if (/^reflection questions?\s*:/i.test(line)) { inReflection = true; continue; }
      if (inReflection && /^(action|recommendations?)\s*:/i.test(line)) inReflection = false;
      if (inReflection && line.endsWith('?') && line.length > 12) out.push({ chapterId, text: line, evidence: raw.trim(), source: 'explicit_reflection_question' });
    }
    return out.slice(0, 20);
  }

  function extractActions(text, chapterId) {
    const lines = norm(text).split('\n'), out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!/^action\s*:/i.test(line)) continue;
      let value = line.replace(/^action\s*:\s*/i, '').trim();
      for (let j = i + 1; j < lines.length && value.length < 900; j++) {
        const next = lines[j].trim();
        if (!next || /^(chapter\b|reflection questions?\s*:|recommendations?\s*$)/i.test(next)) break;
        value += ' ' + next;
      }
      if (value) out.push({ chapterId, text: value.slice(0, 1000), evidence: line.slice(0, 500), source: 'explicit_action' });
    }
    return out.slice(0, 10);
  }

  function extractRecommendations(text, chapterId) {
    const lines = norm(text).split('\n'), out = [];
    for (let i = 0; i < lines.length; i++) {
      if (!/^recommendations?\s*$/i.test(lines[i].trim())) continue;
      const body = [];
      for (let j = i + 1; j < lines.length && body.join(' ').length < 1800; j++) {
        const next = lines[j].trim();
        if (!next || /^chapter\b/i.test(next)) break;
        body.push(next);
      }
      if (body.length) out.push({ chapterId, text: body.join(' ').slice(0, 1800), source: 'explicit_recommendations' });
    }
    return out.slice(0, 5);
  }

  function extractClaims(text, chapterId) {
    return sentenceEvidence(text, chapterId, /\b(according to|a study|research (?:shows|found|suggests)|estimates that|statistics? (?:show|suggest|indicate))\b/i, 'attributed_claim', 25);
  }

  function extractPersonalEvidence(text, chapterId) {
    return sentenceEvidence(text, chapterId, /\b(I (?:was|am|had|have|grew|arrived|worked|lived|remember|learned|saw|watched|carried|woke|moved)|my (?:mother|father|parents?|family|sister|brother|child|children))\b/i, 'personal_experience', 20);
  }

  function extractConcepts(text, chapterId) {
    const out = [], patterns = [
      /\bI call (?:it|this) (?:the )?["“]?([A-Za-z][A-Za-z -]{2,60})["”]?/gi,
      /\bwhat I call (?:the )?["“]?([A-Za-z][A-Za-z -]{2,60})["”]?/gi
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(text)) && out.length < 20) out.push({ chapterId, name: m[1].trim().replace(/[.,;:]+$/, ''), evidence: m[0].trim(), source: 'author_named_concept' });
    }
    return out;
  }

  function build(parsed) {
    const reflectionQuestions=[], actions=[], recommendations=[], claims=[], personalEvidence=[], concepts=[];
    for (const chapter of parsed?.chapters || []) {
      const text = chapter.body || chapter.text || '';
      reflectionQuestions.push(...extractQuestions(text, chapter.id));
      actions.push(...extractActions(text, chapter.id));
      recommendations.push(...extractRecommendations(text, chapter.id));
      claims.push(...extractClaims(text, chapter.id));
      personalEvidence.push(...extractPersonalEvidence(text, chapter.id));
      concepts.push(...extractConcepts(text, chapter.id));
    }
    const seen = new Set();
    const uniqueConcepts = concepts.filter(x => { const key=x.name.toLowerCase(); if(seen.has(key)) return false; seen.add(key); return true; });
    return { reflectionQuestions:reflectionQuestions.slice(0,200), actions:actions.slice(0,100), recommendations:recommendations.slice(0,50), claims:claims.slice(0,200), personalEvidence:personalEvidence.slice(0,200), concepts:uniqueConcepts.slice(0,100) };
  }

  function enrich(parsed, intelligence) {
    const documentType = classify(parsed);
    return { ...intelligence, documentType, nonfiction: documentType.type === 'nonfiction' ? build(parsed) : null };
  }

  return { classify, build, enrich, extractQuestions, extractActions, extractClaims, extractPersonalEvidence, extractConcepts };
})();
if (typeof window !== 'undefined') window.DocumentIntelligence = DocumentIntelligence;
if (typeof module !== 'undefined' && module.exports) module.exports = DocumentIntelligence;
