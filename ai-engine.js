// AuthorScrolls AI Engine - Claude API with Caching
// Uses prompt caching to minimize API costs: the manuscript text is cached
// and reused across all 7 AI features in a single session.

const AIEngine = {
  _cache: new Map(),
  _versionHistory: null,

  // ========================
  // CACHE MANAGEMENT
  // ========================
  _getCacheKey(text, feature) {
    // Hash first 200 chars + length + feature for unique key
    const hash = text.substring(0, 200) + '|' + text.length + '|' + feature;
    return hash;
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
    // Also persist to sessionStorage for tab refreshes
    try {
      const stored = JSON.parse(sessionStorage.getItem('ml_cache') || '{}');
      stored[key] = { data, timestamp: Date.now() };
      sessionStorage.setItem('ml_cache', JSON.stringify(stored));
    } catch (e) { /* quota exceeded, ignore */ }
  },

  _loadSessionCache() {
    try {
      const stored = JSON.parse(sessionStorage.getItem('ml_cache') || '{}');
      for (const [key, val] of Object.entries(stored)) {
        if (Date.now() - val.timestamp < 30 * 60 * 1000) {
          this._cache.set(key, val);
        }
      }
    } catch (e) { /* ignore */ }
  },

  // ========================
  // CORE API CALL (with caching headers)
  // ========================
  // API endpoint - auto-detects environment:
  // Firebase Hosting: /api/claude (rewrite to Cloud Function)
  // Local dev: /api/claude (Express server)
  // Both work with the same path
  API_ENDPOINT: '/api/claude',

  async _callClaude(apiKey, systemPrompt, userPrompt, manuscriptText, feature) {
    // Check cache first
    const cached = this._getCached(manuscriptText, feature);
    if (cached) return cached;

    // In production: calls your server proxy (no API key in browser)
    // In dev mode: if apiKey passed, calls Anthropic directly
    const isDirect = !!apiKey;
    const endpoint = isDirect ? 'https://api.anthropic.com/v1/messages' : this.API_ENDPOINT;
    const headers = { 'content-type': 'application/json' };
    if (isDirect) {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
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
            text: 'MANUSCRIPT TEXT:\n\n' + manuscriptText.substring(0, 15000),
            cache_control: { type: 'ephemeral' }
          }
        ],
        messages: [
          {
            role: 'user',
            content: systemPrompt + '\n\n' + userPrompt
          }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
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

    this._setCache(manuscriptText, feature, parsed);
    return parsed;
  },

  // ========================
  // BATCH: Run all AI features in sequence (reusing cache)
  // ========================
  async runAllFeatures(apiKey, text, analysisResult, onProgress) {
    const results = {};
    const features = [
      { key: 'deepCritique', label: 'Deep narrative critique...', fn: () => this.deepCritique(apiKey, text, analysisResult) },
      { key: 'compTitles', label: 'Finding comparable titles...', fn: () => this.compTitles(apiKey, text, analysisResult) },
      { key: 'queryLetter', label: 'Drafting query letter...', fn: () => this.queryLetter(apiKey, text, analysisResult) },
      { key: 'betaReaders', label: 'Simulating beta readers...', fn: () => this.betaReaders(apiKey, text, analysisResult) },
      { key: 'marketReadiness', label: 'Assessing market readiness...', fn: () => this.marketReadiness(apiKey, text, analysisResult) },
      { key: 'chapterBreakdown', label: 'Breaking down chapters...', fn: () => this.chapterBreakdown(apiKey, text, analysisResult) }
    ];

    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      if (onProgress) onProgress(f.label, i, features.length);
      try {
        results[f.key] = await f.fn();
      } catch (err) {
        results[f.key] = { error: err.message };
      }
    }
    return results;
  },

  // ========================
  // 1. DEEP NARRATIVE CRITIQUE
  // ========================
  async deepCritique(apiKey, text, analysis) {
    return this._callClaude(apiKey,
      'Analyze this manuscript excerpt as a professional developmental editor.',
      `Give a deep narrative critique. Return JSON:
{
  "overallAssessment": "2-3 sentences on the manuscript's strengths and weaknesses",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "characterDepth": "assessment of character development",
  "worldBuilding": "assessment of setting/world",
  "narrativeVoice": "assessment of the author's voice",
  "emotionalImpact": "how effectively does it create emotional responses",
  "suggestions": ["specific actionable suggestion 1", "suggestion 2", "suggestion 3", "suggestion 4", "suggestion 5"],
  "priorityFix": "the single most important thing the author should fix first"
}`,
      text, 'deepCritique');
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
      text, 'compTitles');
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
      text, 'queryLetter');
  },

  // ========================
  // 4. BETA READER SIMULATION
  // ========================
  async betaReaders(apiKey, text, analysis) {
    return this._callClaude(apiKey,
      'Simulate 4 different beta readers with distinct perspectives reading this manuscript.',
      `Create 4 simulated beta reader responses. Return JSON:
{
  "readers": [
    {
      "name": "Reader name",
      "profile": "e.g. 'Avid thriller reader, 35, reads 50 books/year'",
      "rating": 4,
      "reaction": "Their overall gut reaction in 2-3 sentences",
      "favoritepart": "What they loved most",
      "confusion": "What confused them or they didn't like",
      "wouldRecommend": true,
      "emoticon": "one emoji representing their feeling"
    },
    {... reader 2 - a more critical reader},
    {... reader 3 - the target audience reader},
    {... reader 4 - a casual/non-genre reader}
  ],
  "consensusRating": 3.5,
  "commonPraise": "What most readers would agree is strong",
  "commonCriticism": "What most readers would agree needs work"
}`,
      text, 'betaReaders');
  },

  // ========================
  // 5. MARKET READINESS
  // ========================
  async marketReadiness(apiKey, text, analysis) {
    const genre = analysis?.genre?.label || 'Fiction';
    return this._callClaude(apiKey,
      'You are a publishing industry expert who evaluates manuscript market readiness.',
      `Evaluate this ${genre} manuscript for market readiness. Return JSON:
{
  "readinessScore": 72,
  "readinessGrade": "B-",
  "publishingPath": "recommended path: traditional, indie, or hybrid",
  "marketFit": "How well this fits current market trends",
  "strengths": ["market strength 1", "strength 2"],
  "gaps": ["what's missing for market readiness", "gap 2"],
  "developmentalStage": "first draft / revised draft / near-ready / polished",
  "nextSteps": ["step 1", "step 2", "step 3", "step 4"],
  "estimatedRevisions": "how many more revision rounds needed",
  "trendAlignment": "how this aligns with current genre trends"
}`,
      text, 'marketReadiness');
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
      text, 'chapterBreakdown');
  },

  // ========================
  // VERSION TRACKING
  // ========================
  loadVersionHistory() {
    try {
      this._versionHistory = JSON.parse(localStorage.getItem('ml_versions') || '[]');
    } catch (e) { this._versionHistory = []; }
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
    localStorage.setItem('ml_versions', JSON.stringify(this._versionHistory));
    return version;
  },

  getVersionHistory() {
    return this.loadVersionHistory();
  },

  clearVersionHistory() {
    this._versionHistory = [];
    localStorage.removeItem('ml_versions');
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
  }
};

// Load session cache on init
AIEngine._loadSessionCache();
