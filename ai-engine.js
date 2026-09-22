// AuthorScrolls AI Engine - Claude API with Caching
// Uses prompt caching to minimize API costs: the manuscript text is cached
// and reused across all 7 AI features in a single session.

const AIEngine = {
  _cache: new Map(),
  _versionHistory: null,
  _bookContextCache: new Map(),

  // ========================
  // CACHE MANAGEMENT
  // ========================
  _getCacheKey(text, feature) {
    return this._shortHash(text) + '|' + text.length + '|' + feature;
  },

  _getCached(text, feature) {
    const key = this._getCacheKey(text, feature);
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) { // 30 min TTL
      return cached.data;
    }
    return null;
  },

  _setCache(text, feature, data) {
    const key = this._getCacheKey(text, feature);
    this._cache.set(key, { data, timestamp: Date.now() });
    // Manuscript-derived responses are memory-only, bounded to this tab.
    if(this._cache.size>30)this._cache.delete(this._cache.keys().next().value);
  },

  _loadSessionCache() {
    try{sessionStorage.removeItem('ml_cache');}catch(_){}
  },

  // ========================
  // CORE API CALL (with caching headers)
  // ========================
  // API endpoint - auto-detects environment:
  // Firebase Hosting: /api/claude (rewrite to Cloud Function)
  // Local dev: /api/claude (Express server)
  // Both work with the same path
  API_ENDPOINT: '/api/claude',
  // Whole-manuscript analysis features run once per 24 hours; the server enforces it and this
  // browser remembers the next run time it was told, so the author sees the time, not a spent request.
  ANALYSIS_FEATURES: new Set(['deepCritique','chapterBreakdown','openingAnalysis','weaknessAnalysis','compTitles','queryLetter','betaReaders','marketReadiness','editingRoadmap','readerSimulation','smartScan','calibrateIssues']),
  nextAnalysisRun() {
    try { const next = Number(localStorage.getItem('ml_ai_next_run')); if (next && next > Date.now()) return next; if (next) localStorage.removeItem('ml_ai_next_run'); } catch (_) {}
    return null;
  },
  cooldownMessage(nextAt) {
    const when = new Date(nextAt);
    const sameDay = when.toDateString() === new Date().toDateString();
    return 'AI analysis runs once every 24 hours. The next run is available ' + (sameDay ? 'today at ' + when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : when.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })) + '.';
  },

  // Model routing: cheap OpenAI for most, Claude for premium
  _routeModel(feature) {
    // Features that benefit from Claude's superior analysis
    const claudeFeatures = ['deepCritique', 'chapterBreakdown', 'openingAnalysis'];
    if (claudeFeatures.includes(feature) && (window.__isAdmin || ['premium','beta'].includes(window.__userPlan))) return 'claude';
    // Everything else uses OpenAI (10-50x cheaper)
    return 'openai-fast';
  },

  _serializeContextPacket(packet) {
    if (!packet) return '';
    const compact = {
      query: packet.query,
      documentType: packet.documentType, overview:packet.overview, nonfiction:packet.nonfiction,
      chapters: (packet.chapters || []).map(c => ({ id:c.chapterId, title:c.title, text:c.text })),
      characters: packet.characters || [], facts: packet.facts || [], relationships: packet.relationships || [],
      timeline: packet.timeline || [], stateChanges: packet.stateChanges || [], continuity: packet.continuity || [], plotThreads: packet.plotThreads || []
    };
    return JSON.stringify(compact);
  },

  buildGroundedContext(query, manuscriptText, analysis = null) {
    if (typeof ManuscriptParser === 'undefined' || typeof BookIntelligence === 'undefined' || typeof ManuscriptRetrieval === 'undefined') return null;
    const analysisSig = analysis ? this._shortHash(JSON.stringify({overall:analysis.overall||0,scores:analysis.scores||{},genre:analysis.genre||{}})) : 'none';
    const key = this._shortHash(manuscriptText) + '|' + manuscriptText.length + '|' + analysisSig;
    let built = this._bookContextCache.get(key);
    if (!built) {
      built = IntelligencePipeline.build(manuscriptText, analysis);
      this._bookContextCache.clear();
      this._bookContextCache.set(key, built);
    }
    return ManuscriptRetrieval.contextPacket(query, built.parsed, built.intel, 5);
  },

  async askManuscript(apiKey, question, manuscriptText, analysis = null) {
    const packet = this.buildGroundedContext(question, manuscriptText, analysis);
    if (!packet || !packet.chapters.length) return {
      answer: 'I could not find supporting passages for that question. Try naming a character, event, or phrase from your manuscript.',
      evidence: [], confidence: 'low', insufficientEvidence: true
    };
    const context = this._serializeContextPacket(packet);
    return this._callClaude(apiKey,
      "You are AuthorScrolls Writer's Room. Answer the author's question using only the supplied manuscript context. Distinguish manuscript evidence from interpretation. If the retrieved evidence is insufficient, say so instead of inventing details.",
      'AUTHOR QUESTION:\n' + question + '\n\nReturn JSON: {"answer":"...","evidence":[{"chapterId":"...","quote":"short supporting excerpt"}],"confidence":"high|medium|low","insufficientEvidence":false}',
      '', 'writersRoom:' + this._shortHash(question + context), {
        contextOverride: 'RETRIEVED BOOK CONTEXT:\n' + context
      }
    );
  },

  async _callClaude(apiKey, systemPrompt, userPrompt, manuscriptText, feature, options = {}) {
    const wholeBookFeatures=new Set(['deepCritique','compTitles','queryLetter','betaReaders','marketReadiness','chapterBreakdown','editingRoadmap','readerSimulation']);
    if(wholeBookFeatures.has(feature)&&manuscriptText&&!options.contextOverride){
      const packet=this.buildGroundedContext('Whole manuscript structure themes arguments evidence progression ending '+feature,manuscriptText,options.analysis||null);
      if(!packet)throw new Error('Book context is unavailable. Reopen the manuscript before running whole-book advice.');
      options={...options,contextOverride:'GROUNDED WHOLE-BOOK CONTEXT (sampled, not exhaustive):\n'+this._serializeContextPacket(packet)};
      systemPrompt+=' Preserve the author’s voice. Distinguish evidence from interpretation. Coverage is sampled: disclose gaps and never claim every word or chapter was reviewed. For nonfiction focus on claims, evidence and reader application rather than fictional plot requirements.';
    }
    // Check cache first
    const cacheInput = manuscriptText + JSON.stringify([systemPrompt,userPrompt,options.contextOverride||'']);
    const cached = this._getCached(cacheInput, feature);
    if (cached) return cached;

    // In production: calls your server proxy (no API key in browser)
    // In dev mode: if apiKey passed, calls Anthropic directly
    // Always use server proxy — API keys never touch the browser
    const endpoint = this.API_ENDPOINT;
    const headers = { 'content-type': 'application/json' };
    let currentUser = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
    if (!currentUser && typeof firebase !== 'undefined') {
      await new Promise(r => { const u = firebase.auth().onAuthStateChanged(user => { u(); r(user); }); });
      currentUser = firebase.auth().currentUser;
    }
    headers['x-user-id'] = currentUser ? currentUser.uid : 'anon';
    if (currentUser) {
      try { headers['authorization'] = 'Bearer ' + await currentUser.getIdToken(); } catch (e) {}
    }
    headers['x-model'] = this._routeModel(feature);
    headers['x-feature'] = String(feature || 'unknown').split(':')[0].substring(0, 40);

    const bodyPayload = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: 'You are AuthorScrolls, a professional manuscript analysis tool for authors. Respond ONLY with valid JSON. No markdown, no explanation, just the JSON object.',
          cache_control: { type: 'ephemeral' }
        },
        {
          type: 'text',
          text: options.contextOverride || ('MANUSCRIPT TEXT:\n\n' + manuscriptText.substring(0, 15000)),
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [
        {
          role: 'user',
          content: systemPrompt + '\n\n' + userPrompt
        }
      ]
    });

    // AI analysis runs once per 24 hours (server-enforced). When the server has told this browser
    // the next run time, say so without spending a request; cached results above still show.
    if (AIEngine.ANALYSIS_FEATURES.has(headers['x-feature'])) {
      const next = AIEngine.nextAnalysisRun();
      if (next) throw new Error(AIEngine.cooldownMessage(next));
    }

    let response = await fetch(endpoint, { method: 'POST', headers, body: bodyPayload });

    if (response.status === 401) {
      const freshUser = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
      if (freshUser) {
        try {
          headers['authorization'] = 'Bearer ' + await freshUser.getIdToken(true);
          response = await fetch(endpoint, { method: 'POST', headers, body: bodyPayload });
        } catch (e) {}
      }
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[AI API error]', response.status, err, 'User:', currentUser?.email || 'none', 'Had token:', !!headers['authorization']);
      if (err.error?.code === 'ANALYSIS_COOLDOWN' && Number.isFinite(Number(err.error.nextAt))) {
        try { localStorage.setItem('ml_ai_next_run', String(Number(err.error.nextAt))); } catch (_) {}
        throw new Error(AIEngine.cooldownMessage(Number(err.error.nextAt)));
      }
      if (err.error?.code === 'UNAUTHENTICATED') {
        const reason = err.error?.reason || 'unknown';
        const diag = err.error?.diagnostic || '';
        console.error('[AUTH DIAGNOSTIC] reason:', reason, '|', diag);
        throw new Error('SERVER_AUTH_ERROR:' + reason + ':' + diag);
      }
      throw new Error(err.error?.message || 'API call failed: ' + response.status);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || '';

    // Parse JSON from response
    let parsed;
    try {
      // Try to extract JSON if wrapped in markdown
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (e) {
      parsed = { raw: content, parseError: true };
    }

    // Add cache usage info
    parsed._cacheInfo = {
      input_tokens: result.usage?.input_tokens,
      output_tokens: result.usage?.output_tokens,
      cache_read: result.usage?.cache_read_input_tokens || 0,
      cache_creation: result.usage?.cache_creation_input_tokens || 0
    };

    this._setCache(cacheInput, feature, parsed);
    return parsed;
  },

  // ========================
  // ANALYSIS CONTEXT BUILDER
  // Produces a compact, structured summary of analyzer findings to ground AI prompts.
  // Appended to user messages — not system blocks — so prompt caching stays intact.
  // ========================
  // Scores are deterministic indicators. AI may interpret them, never blend them.
  _buildAnalysisContext(analysis) {
    if (!analysis) return '';
    const s = analysis.scores || {};
    const ic = analysis.issueCounts || {};
    const dnf = analysis.dnfAnalysis || {};
    const rp = analysis.readerPerspective || {};
    const lines = [
      '\n\n--- AUTOMATED ANALYSIS DATA ---',
      `Overall score: ${analysis.overall || 'N/A'}/100 | Grade: ${typeof Analyzer !== 'undefined' ? Analyzer.getGrade(analysis.overall || 0) : '?'}`,
      `Genre: ${analysis.genre?.label || 'Unknown'} | Word count: ${(analysis.totalWords || 0).toLocaleString()}`,
      `Dimension scores (0-100): Plot/Structure ${s.plot||'?'} | Copy ${s.copy||'?'} | Style ${s.style||'?'} | Grammar ${s.grammar||'?'} | Dialogue ${s.dialogue!=null?s.dialogue:'N/A'} | Show/Tell ${s.showTell||'?'}`,
    ];
    const icEntries = Object.entries(ic).filter(([,v]) => v > 0).map(([k,v]) => `${k}:${v}`);
    if (icEntries.length > 0) lines.push(`Issue counts: ${icEntries.join(' | ')}`);
    if (dnf.dnf_risk !== undefined) lines.push(`DNF risk: ${dnf.dnf_risk}% (${dnf.risk_band || ''})`);
    if (dnf.top_3_reasons?.length) lines.push(`Top reader drop-off reasons: ${dnf.top_3_reasons.join('; ')}`);
    if (dnf.weakest_area) lines.push(`Weakest dimension: ${dnf.weakest_area} | Best fix: ${dnf.best_fix || ''}`);
    if (rp.engagementScore !== undefined) lines.push(`Reader engagement: ${rp.engagementScore}/100`);
    // Top flagged issue examples — concrete text the AI can reference in its feedback
    const issues = analysis.issues || [];
    if (issues.length > 0) {
      // Sample across the manuscript: beginning, middle, end
      const stride = Math.max(1, Math.floor(issues.length / 12));
      const sampled = issues.filter((_, i) => i % stride === 0).slice(0, 12);
      const issueLines = sampled.map(iss => {
        const snippet = (iss.text || '').substring(0, 70).replace(/\n/g, ' ');
        const fix = iss.suggestion ? (' → ' + iss.suggestion.substring(0, 50)) : '';
        return `  [${iss.type}] "${snippet}"${fix}`;
      });
      lines.push(`Sample flagged passages (${issues.length} total):\n${issueLines.join('\n')}`);
    }
    // Weakest paragraphs from DNF section analysis, if available
    if (dnf.section_scores?.length) {
      const worst = [...dnf.section_scores].sort((a,b) => a.score - b.score)[0];
      if (worst) lines.push(`Weakest manuscript section: ${worst.section} (score ${worst.score})`);
    }
    lines.push('--- END ANALYSIS DATA ---');
    const full = lines.join('\n');
    // Cap context to ~4000 chars so it doesn't consume a disproportionate share of the token budget
    return full.length > 4000 ? full.substring(0, 4000) + '\n...[context truncated]' : full;
  },

  // ========================
  // BATCH: Run all AI features in sequence (reusing cache)
  // ========================
  async runAllFeatures(apiKey, text, analysisResult, onProgress) {
    const results = {};
    const features = [
      { key: 'deepCritique', label: 'Deep narrative critique...', fn: () => this.deepCritique(apiKey, text, analysisResult) },
      { key: 'openingAnalysis', label: 'Evaluating opening hook...', fn: () => this.openingAnalysis(apiKey, text, analysisResult) },
      { key: 'weaknessAnalysis', label: 'Diagnosing weak passages...', fn: () => this.analyzeWeaknesses(apiKey, text, analysisResult) },
      { key: 'editingRoadmap', label: 'Building editing roadmap...', fn: () => this.editingRoadmap(apiKey, text, analysisResult) },
      { key: 'compTitles', label: 'Finding comparable titles...', fn: () => this.compTitles(apiKey, text, analysisResult) },
      { key: 'queryLetter', label: 'Drafting query letter...', fn: () => this.queryLetter(apiKey, text, analysisResult) },
      { key: 'betaReaders', label: 'Simulating beta readers...', fn: () => this.betaReaders(apiKey, text, analysisResult) },
      { key: 'marketReadiness', label: 'Assessing market readiness...', fn: () => this.marketReadiness(apiKey, text, analysisResult) },
      { key: 'chapterBreakdown', label: 'Breaking down chapters...', fn: () => this.chapterBreakdown(apiKey, text, analysisResult) },
      { key: 'readerSimulation', label: 'Simulating reading experience...', fn: () => this.readerSimulation(apiKey, text, analysisResult) }
    ];

    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      if (onProgress) onProgress(f.label, i, features.length);
      try {
        results[f.key] = await f.fn();
      } catch (err) {
        const msg = err?.message || String(err);
        // Circuit breaker: auth failures and rate limits are batch-fatal — every
        // remaining feature is guaranteed to fail the same way. Rethrow immediately
        // instead of hammering the dead endpoint ten times in a row.
        if (msg.startsWith('SERVER_AUTH_ERROR:') || msg.includes('limit reached') || msg.includes('RATE_LIMITED')) {
          throw err;
        }
        results[f.key] = { error: msg };
      }
    }
    return results;
  },

  // ========================
  // 1. DEEP NARRATIVE CRITIQUE
  // ========================
  async deepCritique(apiKey, text, analysis) {
    const ctx = this._buildAnalysisContext(analysis);
    const genre = analysis?.genre?.label || 'Fiction';
    const isNF = analysis?.genre?.primary && ['memoir','selfHelp','biography','historyNF','trueCrime','philosophy','nonfiction'].includes(analysis.genre.primary);
    const isSH = analysis?.genre?.primary === 'selfHelp';
    const voiceLabel = isNF ? 'authoritative voice / tone' : 'narrative voice';
    const structureLabel = isNF ? 'argument structure / thesis clarity' : 'plot structure / story arc';
    const depthLabel = isNF ? 'idea depth and evidence quality' : 'character development';
    const worldLabel = isNF ? 'how well it contextualizes its subject / world the ideas inhabit' : 'setting and world-building';
    const dimensionScoresPrompt = isSH ? `
  "dimensionScores": {
    "insightQuality": <0-100 — how original, substantive, and well-evidenced the ideas are>,
    "voiceAuthority": <0-100 — how credible and distinctive the author's voice is>,
    "evidenceSupport": <0-100 — quality of examples, stories, data used to support claims>,
    "practicalApplication": <0-100 — how actionable and concrete the advice is>,
    "readerMomentum": <0-100 — how well the book sustains reader engagement chapter to chapter>
  },` : isNF ? `
  "dimensionScores": {
    "argumentStructure": <0-100 — logical flow and clarity of the central argument>,
    "voiceAuthority": <0-100 — credibility and distinctiveness of author voice>,
    "ideaDepth": <0-100 — originality and substance of the ideas>,
    "evidenceSupport": <0-100 — quality of examples, research, and sources>
  },` : `
  "dimensionScores": {
    "plot": <0-100 — story structure, cause-and-effect, stakes clarity — your independent assessment>,
    "dialogue": <0-100 — authenticity, subtext, character differentiation — null if minimal dialogue>,
    "style": <0-100 — prose style, voice distinctiveness, sentence-level craft>,
    "showTell": <0-100 — how effectively the author shows rather than tells emotion and action>,
    "pacing": <0-100 — narrative momentum, scene transitions, tension management>
  },`;
    return this._callClaude(apiKey,
      `You are a professional developmental editor specializing in ${genre}. You have structured analysis data AND flagged passages from the manuscript. Ground your critique in SPECIFIC examples from the flagged passages provided — do not be generic. Name exact phrases, patterns, and locations. Interpret what the scores mean for the reading experience, not just the numbers.`,
      `Give a deep critique of this ${genre} manuscript, grounded in the analysis data and flagged passages below.${ctx}

Return JSON:
{
  "overallAssessment": "2-3 sentences — what development stage this manuscript is at, referencing specific score patterns from the data",
  "weaknesses": [
    {"issue": "specific issue name (not generic)", "explanation": "what this costs the reader — reference a specific flagged phrase or passage", "example": "direct quote or paraphrase from the flagged passages above"},
    {"issue": "...", "explanation": "...", "example": "..."},
    {"issue": "...", "explanation": "...", "example": "..."}
  ],
  "strengths": [
    {"observation": "specific strength with evidence from the text", "evidence": "direct quote or paraphrase"},
    {"observation": "...", "evidence": "..."}
  ],
  "voiceAssessment": "assessment of the author's ${voiceLabel} — cite specific examples",
  "structureAssessment": "assessment of ${structureLabel}",
  "depthAssessment": "assessment of ${depthLabel}",
  "worldAssessment": "assessment of ${worldLabel}",
  "improvementStrategy": [
    {"step": 1, "action": "concrete first fix — name the specific problem from the flagged data", "reason": "why this first — what it unlocks"},
    {"step": 2, "action": "...", "reason": "..."},
    {"step": 3, "action": "...", "reason": "..."}
  ],
  "priorityFix": "the single most impactful change, citing the specific pattern the analysis found",${dimensionScoresPrompt}
}`,
      text, 'deepCritique', {analysis});
  },

  // ========================
  // 2. COMPARABLE TITLES
  // ========================
  async compTitles(apiKey, text, analysis) {
    const genre = analysis?.genre?.label || 'Fiction';
    return this._callClaude(apiKey,
      'You are a literary agent who knows the book market extensively.',
      `Based on this ${genre} manuscript's style, themes, and voice, suggest comparable titles. Return JSON:
{
  "compTitles": [
    {"title": "Book Title", "author": "Author Name", "reason": "why it's comparable in 1 sentence"},
    {"title": "Book Title 2", "author": "Author Name", "reason": "why"},
    {"title": "Book Title 3", "author": "Author Name", "reason": "why"},
    {"title": "Book Title 4", "author": "Author Name", "reason": "why"},
    {"title": "Book Title 5", "author": "Author Name", "reason": "why"}
  ],
  "pitchLine": "This manuscript reads like [Author A] meets [Author B] - a one-line comp pitch",
  "targetAudience": "description of the ideal reader",
  "shelfPlacement": "where this would sit in a bookstore"
}`,
      text, 'compTitles', {analysis});
  },

  // ========================
  // 3. QUERY LETTER GENERATOR
  // ========================
  async queryLetter(apiKey, text, analysis) {
    const genre = analysis?.genre?.label || 'Fiction';
    const wordCount = analysis?.totalWords || 0;
    return this._callClaude(apiKey,
      'You are an expert query letter writer who has helped authors land agents.',
      `Write a professional query letter for this ${genre} manuscript (~${wordCount} words). Return JSON:
{
  "queryLetter": "The full query letter text (3-4 paragraphs: hook, synopsis, bio placeholder, closing)",
  "hookLine": "A punchy one-line hook",
  "synopsis": "A 150-word synopsis suitable for a query",
  "genreCategory": "the specific genre/subgenre for querying",
  "wordCountNote": "whether the word count is appropriate for this genre",
  "tips": ["tip for improving the query", "tip 2", "tip 3"]
}`,
      text, 'queryLetter', {analysis});
  },

  // ========================
  // 4. BETA READER SIMULATION
  // ========================
  async betaReaders(apiKey, text, analysis) {
    const ctx = this._buildAnalysisContext(analysis);
    return this._callClaude(apiKey,
      'Simulate 4 different beta readers with distinct perspectives reading this manuscript. Ground their reactions in real analysis findings — readers should articulate the specific issues the analysis uncovered, not generic feedback.',
      `Create 4 simulated beta reader responses. Use the analysis data below to make their feedback authentic and specific.${ctx}

Return JSON:
{
  "readers": [
    {
      "name": "Reader name",
      "profile": "e.g. 'Avid thriller reader, 35, reads 50 books/year'",
      "rating": 4,
      "reaction": "Their gut reaction in 2-3 sentences — should reflect what the scores and issues reveal",
      "favoritepart": "What they loved most",
      "confusion": "What confused them — tie to actual drop-off reasons or low-scoring dimensions",
      "wouldRecommend": true,
      "emoticon": "one emoji representing their feeling"
    },
    {"...": "reader 2 - a more critical reader who notices the mechanical issues"},
    {"...": "reader 3 - the target audience reader"},
    {"...": "reader 4 - a casual/non-genre reader"}
  ],
  "consensusRating": 3.5,
  "commonPraise": "What most readers agree is strong",
  "commonCriticism": "What most readers agree needs work — reference the analysis findings"
}`,
      text, 'betaReaders', {analysis});
  },

  // ========================
  // 5. MARKET READINESS
  // ========================
  async marketReadiness(apiKey, text, analysis) {
    const genre = analysis?.genre?.label || 'Fiction';
    const ctx = this._buildAnalysisContext(analysis);
    return this._callClaude(apiKey,
      'You are a publishing industry expert who evaluates manuscript market readiness. Use the automated analysis scores as objective evidence — they reflect real mechanical and narrative quality signals.',
      `Evaluate this ${genre} manuscript for market readiness. The analysis data below provides objective quality signals — factor them into your assessment.${ctx}

Return JSON:
{
  "readinessScore": <number 0-100, informed by the overall score above>,
  "readinessGrade": "letter grade",
  "publishingPath": "recommended path: traditional, indie, or hybrid",
  "marketFit": "How well this fits current market trends",
  "strengths": ["market strength grounded in a high score or strong area", "strength 2"],
  "gaps": ["gap tied to a specific low score or issue count", "gap 2"],
  "developmentalStage": "first draft / revised draft / near-ready / polished",
  "nextSteps": ["concrete step addressing the biggest gap", "step 2", "step 3", "step 4"],
  "estimatedRevisions": "how many more revision rounds needed based on current scores",
  "trendAlignment": "how this aligns with current genre trends"
}`,
      text, 'marketReadiness', {analysis});
  },

  // ========================
  // 6. CHAPTER-BY-CHAPTER BREAKDOWN
  // ========================
  async chapterBreakdown(apiKey, text, analysis) {
    return this._callClaude(apiKey,
      'Analyze the structure of this manuscript, identifying chapters or major sections.',
      `Break down this text by chapters or major sections. Return JSON:
{
  "chapters": [
    {
      "number": 1,
      "title": "detected or inferred chapter title",
      "summary": "1-2 sentence summary of what happens",
      "purpose": "what this chapter accomplishes narratively",
      "pacingGrade": "A/B/C/D/F",
      "tensionLevel": "low/medium/high",
      "keyEvent": "the most important thing that happens",
      "issue": "main issue with this chapter, if any"
    }
  ],
  "structureAssessment": "overall assessment of chapter structure",
  "paceFlow": "does the pacing work across chapters",
  "recommendation": "structural recommendation"
}
If the text is a single chapter or doesn't have clear chapter breaks, treat major scene breaks as sections.`,
      text, 'chapterBreakdown', {analysis});
  },

  // ========================
  // 7. EDITING ROADMAP — prioritized fix plan
  // ========================
  async editingRoadmap(apiKey, text, analysis) {
    const ctx = this._buildAnalysisContext(analysis);
    const genre = analysis?.genre?.label || 'Fiction';
    return this._callClaude(apiKey,
      `You are a writing coach building an editing plan for a ${genre} manuscript. Prioritize by reader impact, not frequency. Each priority must be grounded in a specific pattern from the flagged passages or scores above — no generic advice. Name the actual problem you see.`,
      `Build a prioritized editing roadmap. Use the analysis data AND the flagged passages below to name specific problems — do not write generic editing advice.${ctx}

Return JSON:
{
  "priorities": [
    {
      "rank": 1,
      "issue": "specific issue name — cite the pattern from the flagged data (e.g. 'passive voice in 80% of action sequences')",
      "whyFirst": "what makes this the highest-leverage fix — what other problems it masks or causes",
      "readerImpact": "concrete before/after for the reader experience",
      "effort": "light / moderate / heavy",
      "exampleFix": "one specific sentence from the flagged passages and how to rewrite it"
    },
    {"rank": 2, "issue": "...", "whyFirst": "...", "readerImpact": "...", "effort": "...", "exampleFix": "..."},
    {"rank": 3, "issue": "...", "whyFirst": "...", "readerImpact": "...", "effort": "...", "exampleFix": "..."},
    {"rank": 4, "issue": "...", "whyFirst": "...", "readerImpact": "...", "effort": "...", "exampleFix": "..."},
    {"rank": 5, "issue": "...", "whyFirst": "...", "readerImpact": "...", "effort": "...", "exampleFix": "..."}
  ],
  "overallOutlook": "honest 1-2 sentence assessment of revision scope, grounded in the overall score",
  "quickWin": "one small fix (named specifically) that would show immediate improvement in a single pass"
}`,
      text, 'editingRoadmap', {analysis});
  },

  // ========================
  // 8. OPENING ANALYSIS — first-page hook evaluation
  // ========================
  async openingAnalysis(apiKey, text, analysis) {
    const genre = analysis?.genre?.label || 'Fiction';
    const opening = text.substring(0, 5000);
    return this._callClaude(apiKey,
      'You are a literary agent reading the first page of a submission. You are deciding whether to read on. Evaluate against what hooks work in this genre. Be direct — if it fails, say so.',
      `Evaluate this ${genre} manuscript opening.

OPENING TEXT (first ~1000 words):
${opening}

Return JSON:
{
  "hookStrength": <1-10>,
  "verdict": "would / would not read on — one sentence",
  "whatWorks": ["specific observation with quote", "..."],
  "whatFails": ["specific observation with quote", "..."],
  "genreExpectation": "what readers of ${genre} expect from the opening",
  "rewrites": [
    {
      "original": "the weak line or passage",
      "suggested": "a concrete alternative",
      "reason": "why this version works better"
    }
  ],
  "openingType": "in medias res / scene-setting / character intro / backstory / other"
}`,
      opening, 'openingAnalysis');
  },

  // ========================
  // 9. AI WEAKNESS ANALYZER (for DNF + low-score areas)
  // Picks the weakest paragraphs and explains WHY with fix suggestions
  // ========================
  async analyzeWeaknesses(apiKey, text, analysis) {
    // Find the weakest paragraphs based on analysis data
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);
    const dnf = analysis.dnfAnalysis || {};
    const weakAreas = [];

    // Collect weak dimensions from DNF
    if (dnf.scores) {
      Object.entries(dnf.scores).forEach(([k, v]) => {
        if (v <= 5) weakAreas.push(k);
      });
    }

    // Pick sample paragraphs from different parts of the text
    const samples = [];
    const pickIndices = [0, Math.floor(paragraphs.length * 0.25), Math.floor(paragraphs.length * 0.5), Math.floor(paragraphs.length * 0.75), paragraphs.length - 1];
    for (const idx of pickIndices) {
      if (paragraphs[idx] && paragraphs[idx].length > 30) {
        samples.push({ index: idx + 1, text: paragraphs[idx].substring(0, 500) });
      }
    }

    const weakAreaList = weakAreas.length > 0 ? weakAreas.join(', ') : 'momentum, writing quality';
    const sampleText = samples.map(s => `[Paragraph ${s.index}]\n${s.text}`).join('\n\n---\n\n');

    return this._callClaude(apiKey,
      'You are a manuscript diagnostic tool. Your job is to identify specific weak passages and explain exactly what is wrong, with a concrete rewrite suggestion. Be direct and specific. No praise.',
      `The manuscript scored poorly in these areas: ${weakAreaList}.
DNF risk: ${dnf.dnf_risk || 'unknown'}%.
Top reasons readers may stop: ${(dnf.top_3_reasons || []).join('; ')}

Here are sample paragraphs from different sections. For each one, identify what makes it weak and provide a concrete rewrite.

${sampleText}

Return JSON:
{
  "paragraphs": [
    {
      "paragraph_number": 1,
      "problem": "What specifically is wrong with this paragraph (1-2 sentences)",
      "category": "momentum|character|exposition|clarity|prose|pacing",
      "severity": "high|medium|low",
      "original_snippet": "The first 80 chars of the problem text",
      "suggested_rewrite": "A concrete rewrite of the weak portion showing how to fix it",
      "principle": "The writing principle being violated (1 sentence)"
    }
  ],
  "overall_pattern": "What recurring weakness pattern you see across these samples (1-2 sentences)",
  "priority_fix": "The single most impactful change the author should make (1 sentence)"
}`,
      text, 'weaknessAnalysis');
  },

  // ========================
  // 10. READER SIMULATION
  // Simulates how a reader of this genre experiences the manuscript at three points.
  // Uses opening, a mid-point sample, and closing — gives grounded per-section verdict.
  // ========================
  async readerSimulation(apiKey, text, analysis) {
    const genre = analysis?.genre?.label || 'Fiction';
    const words = text.match(/\b\w+\b/g) || [];
    const totalWords = words.length;

    // Sample three representative sections
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 30);
    const thirds = Math.max(1, Math.floor(paragraphs.length / 3));
    const opening = paragraphs.slice(0, Math.min(8, thirds)).join('\n\n').substring(0, 2000);
    const middle  = paragraphs.slice(thirds, thirds + Math.min(8, thirds)).join('\n\n').substring(0, 2000);
    const closing = paragraphs.slice(-Math.min(8, thirds)).join('\n\n').substring(0, 2000);

    const ctx = this._buildAnalysisContext(analysis);

    return this._callClaude(apiKey,
      `You are an experienced reader of ${genre}. You are reading this manuscript as a real reader would — not as an editor, not as a critic. Report honestly: where you were engaged, where you drifted, what made you want to continue, and what tested your patience. Be direct. Do not be encouraging for its own sake.`,
      `Read these three sections of a ${genre} manuscript (~${totalWords.toLocaleString()} words total) and simulate the reading experience.${ctx}

--- OPENING ---
${opening}

--- MIDDLE SECTION ---
${middle}

--- CLOSING ---
${closing}

Return JSON:
{
  "sections": [
    {
      "label": "Opening",
      "engagement": <1-10>,
      "verdict": "one honest sentence on the reading experience at this point",
      "what_works": "the single strongest element",
      "what_stalls": "the single biggest friction point — be specific, name a pattern or phrase if possible"
    },
    {
      "label": "Middle",
      "engagement": <1-10>,
      "verdict": "...",
      "what_works": "...",
      "what_stalls": "..."
    },
    {
      "label": "Closing",
      "engagement": <1-10>,
      "verdict": "...",
      "what_works": "...",
      "what_stalls": "..."
    }
  ],
  "overall_engagement": <1-10>,
  "reader_verdict": "one honest sentence — would this reader finish the book and why",
  "what_keeps_readers": "the strongest hook that would make readers persist",
  "what_loses_readers": "the most likely reason a reader stops — be specific",
  "recommendation": "one concrete change that would most improve the reading experience"
}`,
      text, 'readerSimulation', {analysis});
  },

  // ========================
  // VERSION TRACKING
  // ========================
  loadVersionHistory() {
    if(!this._versionHistory)this._versionHistory=[];
    return this._versionHistory;
  },

  saveVersion(fileName, analysisResult, aiResults) {
    this.loadVersionHistory();
    const version = {
      id: Date.now(),
      fileName,
      date: new Date().toISOString(),
      overall: analysisResult.overall,
      grade: Analyzer.getGrade(analysisResult.overall),
      wordCount: analysisResult.totalWords,
      genre: analysisResult.genre.label,
      scores: { ...analysisResult.scores },
      issueCounts: { ...analysisResult.issueCounts },
      totalIssues: analysisResult.issues.length,
      readerEngagement: analysisResult.readerPerspective?.engagementScore || 0,
      marketReadiness: aiResults?.marketReadiness?.readinessScore || null
    };
    this._versionHistory.push(version);
    // Keep last 20 versions
    if (this._versionHistory.length > 20) this._versionHistory = this._versionHistory.slice(-20);
    return version;
  },

  getVersionHistory() {
    return this.loadVersionHistory();
  },

  clearVersionHistory() {
    this._versionHistory = [];
    localStorage.removeItem('ml_versions');
  },

  // ========================
  // SMART SCAN — explicit, advisory per-issue review.
  // Only the shared text/context-keyed in-memory cache is used.
  // ========================
  async smartScan(apiKey, text, issues, analysis=null) {
    // Build a compact issue list for Claude to review
    const issueSlice = issues.slice(0, 40).map(i => ({
      type: i.type,
      text: i.text.substring(0, 80),
      index: i.index,
      context: text.slice(Math.max(0,i.index-200),i.index+Math.min(i.length||i.text.length,500)+200)
    }));

    const result = await this._callClaude(apiKey,
      'You are a professional manuscript editor. For each flagged issue below, provide a specific, context-aware replacement or improvement.',
      `Here are ${issueSlice.length} writing issues found in this manuscript. For EACH one, provide a specific replacement word or phrase that improves the writing while preserving the author's voice and meaning.

Issues:
${JSON.stringify(issueSlice, null, 1)}

Return JSON array:
[
  {"index": <original_index>, "replacement": "<specific replacement text>", "reason": "<brief explanation>"},
  ...
]

Rules:
- Treat each flag as a candidate, not a proven error. Omit intentional or genre-appropriate choices.
- Preserve deliberate repetition, plain diction, passive voice and explanatory nonfiction when they serve the author's meaning.
- Suggest an alternative only when the supplied context supports an improvement.
- Keep replacements concise — prefer single words when replacing single words`,
      text, 'smartScan', {contextOverride:JSON.stringify({genre:analysis?.genre||null,issues:issueSlice})}
    );

    // Parse and normalize results
    let suggestions = [];
    if (Array.isArray(result)) {
      suggestions = result;
    } else if (result.suggestions) {
      suggestions = result.suggestions;
    } else if (result.raw) {
      try { suggestions = JSON.parse(result.raw); } catch (e) {}
    }

    return Array.isArray(suggestions)?suggestions.filter(s=>s&&Number.isInteger(s.index)&&typeof s.replacement==='string'):[];
  },

  // ========================
  // CALIBRATE ISSUES — AI false-positive filter for analyzer findings
  // Reviews regex-based issues in context, returns keep/dismiss/downgrade verdicts.
  // Cheap model (openai-fast). Cached per (text, feature). Genre-aware reasoning.
  // ========================
  async calibrateIssues(text, issues, genre) {
    if (!Array.isArray(issues) || issues.length === 0) return [];

    // Review issue types where regex has highest false-positive rates.
    // Grammar excluded — LanguageTool already validated. Wordy/repetition included
    // because long manuscripts pile up thousands of these and need calibration most.
    const reviewTypes = new Set(['passive', 'adverb', 'weak-verb', 'show-tell', 'cliche', 'wordy', 'repetition']);
    const candidates = issues
      .map((iss, idx) => ({ iss, idx }))
      .filter(({ iss }) => {
        if (!reviewTypes.has(iss.type)) return false;
        const c = (iss.confidence == null) ? 1 : iss.confidence;
        return c >= 0.3 && c <= 0.95;
      })
      // Prioritize high-severity first; bumped budget from 50 to 150 so big manuscripts
      // (~2000+ issues) get meaningful coverage instead of leaving 95% untouched.
      .sort((a, b) => {
        const sevRank = { high: 0, medium: 1, low: 2 };
        return (sevRank[a.iss.severity] || 2) - (sevRank[b.iss.severity] || 2);
      })
      .slice(0, 150);

    if (candidates.length === 0) return [];

    // Build compact payload — give AI 80 chars of context per issue
    const payload = candidates.map(({ iss, idx }) => {
      const ctxStart = Math.max(0, (iss.index || 0) - 60);
      const ctxEnd = Math.min(text.length, (iss.index || 0) + (iss.length || iss.text.length) + 60);
      const context = text.substring(ctxStart, ctxEnd).replace(/\s+/g, ' ').trim();
      return {
        id: idx,
        type: iss.type,
        text: (iss.text || '').substring(0, 80),
        context: context.substring(0, 200),
        severity: iss.severity || 'medium'
      };
    });

    const genreLabel = genre?.label || (typeof genre === 'string' ? genre : 'Unknown');
    const isNF = (typeof Analyzer !== 'undefined') ? Analyzer.isNonfiction(genre) : false;
    const family = isNF ? 'nonfiction' : 'fiction';

    const sys = 'You are an editorial calibration engine. You review writing issues flagged by an automated regex analyzer and decide which are real problems vs false positives. You understand that rules vary by genre — academic passive voice, rhetorical adverbs in self-help, and intentional repetition for emphasis are all legitimate. Return ONLY a valid JSON array. No explanation, no markdown.';

    const usr = 'Genre: ' + genreLabel + ' (' + family + ')\n\n'
      + 'For each issue below, return one of three verdicts:\n'
      + '- "keep": this is a real problem worth flagging\n'
      + '- "dismiss": false positive — the text is correct or the usage is intentional/appropriate for this genre/context\n'
      + '- "downgrade": minor issue — reduce severity by one level\n\n'
      + 'Be especially skeptical of: participial adjectives flagged as passive ("are terrified"), rhetorical adverbs in self-help/memoir, deliberate anaphora flagged as repetition, and "weak verbs" that fit a plain narration register.\n\n'
      + 'Issues:\n' + JSON.stringify(payload, null, 1) + '\n\n'
      + 'Return JSON array, one entry per issue:\n'
      + '[{"id":0,"verdict":"dismiss","reason":"brief reason"},{"id":1,"verdict":"keep","reason":"..."},...]';

    // Cache key includes the genre key so changing the dropdown busts the cache and re-runs calibration
    // with the new register/style expectations.
    const genreKey = (typeof genre === 'string' ? genre : (genre?.primary || 'auto'));
    const result = await this._callClaude(null, sys, usr, text, 'calibrateIssues:' + genreKey);

    // Parse the response — could be array directly, or wrapped
    let verdicts = [];
    if (Array.isArray(result)) verdicts = result;
    else if (Array.isArray(result.verdicts)) verdicts = result.verdicts;
    else if (Array.isArray(result.issues)) verdicts = result.issues;
    else if (result.raw) {
      try {
        const m = result.raw.match(/\[[\s\S]*\]/);
        if (m) verdicts = JSON.parse(m[0]);
      } catch (e) {}
    }
    return verdicts.filter(v => v && typeof v.id === 'number' && ['keep','dismiss','downgrade'].includes(v.verdict));
  },

  getVersionComparison(v1, v2) {
    if (!v1 || !v2) return null;
    const diff = (a, b) => ({ from: a, to: b, delta: b - a, improved: b > a });
    return {
      overall: diff(v1.overall, v2.overall),
      totalIssues: diff(v1.totalIssues, v2.totalIssues),
      wordCount: diff(v1.wordCount, v2.wordCount),
      scores: Object.fromEntries(
        Object.keys(v2.scores).map(k => [k, diff(v1.scores[k] || 0, v2.scores[k] || 0)])
      )
    };
  },

  async _callClaudeRewrite(systemText, userText) {
    const endpoint = this.API_ENDPOINT;
    const headers = { 'content-type': 'application/json' };
    let currentUser = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
    if (!currentUser && typeof firebase !== 'undefined') {
      await new Promise(r => { const u = firebase.auth().onAuthStateChanged(user => { u(); r(user); }); });
      currentUser = firebase.auth().currentUser;
    }
    headers['x-user-id'] = currentUser ? currentUser.uid : 'anon';
    if (currentUser) {
      try { headers['authorization'] = 'Bearer ' + await currentUser.getIdToken(); } catch(e) {}
    }
    headers['x-model'] = 'openai-fast';
    headers['x-feature'] = 'rewrite';
    const rewriteBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: [{ type: 'text', text: systemText }],
      messages: [{ role: 'user', content: userText }]
    });
    let response = await fetch(endpoint, { method: 'POST', headers, body: rewriteBody });
    if (response.status === 401) {
      const freshUser = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
      if (freshUser) {
        try {
          headers['authorization'] = 'Bearer ' + await freshUser.getIdToken(true);
          response = await fetch(endpoint, { method: 'POST', headers, body: rewriteBody });
        } catch (e) {}
      }
    }
    if (!response.ok) {
      const err = await response.json().catch(()=>({}));
      throw new Error(err.error?.message || 'Rewrite failed (' + response.status + ')');
    }
    const result = await response.json();
    const raw = result.content?.[0]?.text || '';
    try { return JSON.parse(raw); } catch(e) { return { rewrite: raw.trim() }; }
  },

  async rewriteSentence(sentence, issueType, context, fingerprint, allIssues) {
    const fp = fingerprint || {};
    const fpPrompt = Analyzer.fingerprintToPrompt(fingerprint);
    const names = {
      passive: 'passive voice', adverb: 'adverb overuse', 'weak-verb': 'weak verb',
      'show-tell': 'telling instead of showing', wordy: 'wordiness', cliche: 'cliché',
      repetition: 'repetition', 'sentence-length': 'overly long sentence', grammar: 'grammar issue'
    };
    const primaryIssue = names[issueType] || issueType;
    let issueList = primaryIssue;
    if (allIssues && allIssues.length > 1) {
      issueList = allIssues.map(i => names[i.type] || i.type).join(', ');
    }
    const voiceBlock = fpPrompt
      ? '\n\nWRITING FINGERPRINT:\n- ' + fp.pov + ' narrator, ' + fp.tense + ' tense'
        + '\n- Avg sentence length: ' + fp.avgSentenceLen + ' words (' + fp.sentenceVariety + ')'
        + '\n- Vocabulary: ' + (fp.vocabRichness > 65 ? 'rich' : fp.vocabRichness > 45 ? 'moderate' : 'plain')
        + (fp.emDashes !== 'rare' ? '\n- Uses em dashes (' + fp.emDashes + ')' : '')
      : '';
    const sys = 'You are a line editor. The author must not be able to tell this was AI-edited. Fix ONLY the flagged issues. Do not improve unflagged text. Do not change sentence length pattern, vocabulary register, or tone. Return ONLY valid JSON: {"rewrite":"...","changes":[{"original":"...","revised":"...","reason":"..."}]}.'
      + voiceBlock;
    const usr = 'Fix: ' + issueList + '\n\nText:\n"' + sentence + '"'
      + (context && context !== sentence ? '\n\nSurrounding context (do not rewrite):\n"' + context + '"' : '');
    return this._callClaudeRewrite(sys, usr);
  },

  // ========================
  // BATCH FIX SUGGESTIONS (one call, all issues, cached 24h)
  // ========================
  _shortHash(s) {
    let a = 0, b = 0, c = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      a = ((a << 5) - a + ch) | 0;
      b = ((b << 7) ^ (b >>> 3) ^ ch) | 0;
      c = ((c * 31) + ch + (i & 0xff)) | 0;
    }
    return (Math.abs(a).toString(36) + Math.abs(b).toString(36) + Math.abs(c).toString(36)).substring(0, 16);
  },

  getCachedFixes(text) {
    return this._getCached(text,'fixes');
  },

  async batchFixSuggestions(text, issues, fingerprint) {
    const cached = this.getCachedFixes(text);
    if (cached) return cached;

    const aiTypes = new Set(['passive', 'show-tell', 'weak-verb']);
    const batch = issues
      .filter(i => aiTypes.has(i.type) && !/Replace with:\s*".+?"/.test(i.suggestion))
      .slice(0, 30);

    if (batch.length === 0) {
      return { manuscript_hash: this._shortHash(text), prompt_version: 'v1', created_at: Date.now(), suggestions: {} };
    }

    const payload = batch.map(i => {
      const idx = i.index || 0;
      const before = text.substring(Math.max(0, idx - 120), idx);
      const after = text.substring(idx + (i.length || i.text.length), Math.min(text.length, idx + (i.length || i.text.length) + 120));
      const ctxB = before.substring(Math.max(0, before.lastIndexOf('.') + 1)).trim() || before.substring(Math.max(0, before.length - 80)).trim();
      const ctxA = (after.indexOf('.') > 0 ? after.substring(0, after.indexOf('.') + 1) : after.substring(0, 80)).trim();
      return {
        issue_id: i.type + ':' + idx + ':' + this._shortHash(i.text),
        issue_type: i.type,
        original_text: i.text,
        context_before: ctxB,
        context_after: ctxA
      };
    });

    const fp = fingerprint ? Analyzer.fingerprintToPrompt(fingerprint) : '';
    const endpoint = this.API_ENDPOINT;
    const headers = { 'content-type': 'application/json' };
    let currentUser = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
    if (!currentUser && typeof firebase !== 'undefined') {
      await new Promise(r => { const u = firebase.auth().onAuthStateChanged(user => { u(); r(user); }); });
      currentUser = firebase.auth().currentUser;
    }
    if (currentUser) {
      headers['x-user-id'] = currentUser.uid;
      try { headers['authorization'] = 'Bearer ' + await currentUser.getIdToken(); } catch(e) {}
    }
    headers['x-model'] = 'openai-fast';
    headers['x-feature'] = 'rewrite';

    const batchBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: [{
        type: 'text',
        text: 'You are a fiction editor. For each flagged issue, provide a specific rewrite that preserves the author\'s voice. Return ONLY a valid JSON array — no markdown, no explanation.'
          + (fp ? '\n\nAuthor voice profile: ' + fp + '.' : '')
      }],
      messages: [{ role: 'user', content:
        'Fix each issue. Return JSON array:\n[{"issue_id":"...","suggestion":"<rewritten text>","explanation":"<1 sentence>"}]\n\n'
        + 'Issues:\n' + JSON.stringify(payload, null, 1)
        + '\n\nRules:\n- Passive voice: rewrite in active voice\n- Show-tell: show through action or sensory detail\n- Weak verbs: use a vivid, precise verb\n- Keep the author\'s style\n- One tight rewrite per issue'
      }]
    });

    let response = await fetch(endpoint, { method: 'POST', headers, body: batchBody });
    if (response.status === 401) {
      const freshUser = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
      if (freshUser) {
        try {
          headers['authorization'] = 'Bearer ' + await freshUser.getIdToken(true);
          response = await fetch(endpoint, { method: 'POST', headers, body: batchBody });
        } catch (e) {}
      }
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Batch fix failed (' + response.status + ')');
    }

    const result = await response.json();
    const raw = result.content?.[0]?.text || '';
    let arr;
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      arr = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch (e) { arr = []; }

    const suggestions = {};
    if (Array.isArray(arr)) {
      for (const s of arr) {
        if (s.issue_id && s.suggestion) {
          suggestions[s.issue_id] = {
            issue_id: s.issue_id,
            issue_type: s.issue_type || s.issue_id.split(':')[0],
            original_text: s.original_text || '',
            suggestion: s.suggestion,
            explanation: s.explanation || '',
            confidence: s.confidence || 0.85,
            text_hash: this._shortHash(s.suggestion + s.issue_id)
          };
        }
      }
    }

    const cacheObj = {
      manuscript_hash: this._shortHash(text),
      prompt_version: 'v1',
      created_at: Date.now(),
      suggestions
    };

    this._setCache(text,'fixes',cacheObj);

    return cacheObj;
  }

};

// Load session cache on init
AIEngine._loadSessionCache();
