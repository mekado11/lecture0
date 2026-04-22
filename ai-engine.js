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

  // Model routing: cheap OpenAI for most, Claude for premium
  _routeModel(feature) {
    // Features that benefit from Claude's superior analysis
    const claudeFeatures = ['deepCritique', 'chapterBreakdown'];
    if (claudeFeatures.includes(feature)) return 'claude';
    // Everything else uses OpenAI (10-50x cheaper)
    return 'openai-fast';
  },

  async _callClaude(apiKey, systemPrompt, userPrompt, manuscriptText, feature) {
    // Check cache first
    const cached = this._getCached(manuscriptText, feature);
    if (cached) return cached;

    // In production: calls your server proxy (no API key in browser)
    // In dev mode: if apiKey passed, calls Anthropic directly
    // Always use server proxy — API keys never touch the browser
    const endpoint = this.API_ENDPOINT;
    const headers = { 'content-type': 'application/json' };
    const currentUser = typeof firebase !== 'undefined' && firebase.auth().currentUser ? firebase.auth().currentUser : null;
    headers['x-user-id'] = currentUser ? currentUser.uid : 'anon';
    if (currentUser) {
      try { headers['authorization'] = 'Bearer ' + await currentUser.getIdToken(); } catch (e) {}
    }
    headers['x-model'] = this._routeModel(feature);

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
    });

    let response = await fetch(endpoint, { method: 'POST', headers, body: bodyPayload });

    if (response.status === 401 && currentUser) {
      try {
        headers['authorization'] = 'Bearer ' + await currentUser.getIdToken(true);
        response = await fetch(endpoint, { method: 'POST', headers, body: bodyPayload });
      } catch (e) {}
    }

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
        results[f.key] = { error: err?.message || String(err) };
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
  // 7. AI WEAKNESS ANALYZER (for DNF + low-score areas)
  // Picks the weakest paragraphs and explains WHY with fix suggestions
  // Uses cheaper model (OpenAI) — available for paid users only
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

  // ========================
  // SMART SCAN — one-time Claude scan on upload (paid/admin only)
  // Sends the first ~12K words to Claude, gets back real per-issue suggestions.
  // Results cached in Firestore so it's only called once per manuscript.
  // ========================
  async smartScan(apiKey, text, issues) {
    // Check Firestore cache first
    const manuscriptId = Storage._currentManuscriptId;
    if (manuscriptId && Storage.userId) {
      try {
        const doc = await firebase.firestore()
          .collection('users').doc(Storage.userId)
          .collection('manuscripts').doc(manuscriptId)
          .collection('aiScans').doc('smartScan').get();
        if (doc.exists) {
          const data = doc.data();
          if (data.suggestions && Date.now() - (data.timestamp || 0) < 7 * 24 * 3600 * 1000) {
            return data.suggestions; // Use cached scan (7 day TTL)
          }
        }
      } catch (e) { console.warn('SmartScan cache read failed:', e.message); }
    }

    // Build a compact issue list for Claude to review
    const issueSlice = issues.slice(0, 40).map(i => ({
      type: i.type,
      text: i.text.substring(0, 80),
      index: i.index
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
- For repetitions: suggest a specific synonym that fits the sentence context
- For passive voice: rewrite in active voice
- For adverbs: suggest a stronger verb that eliminates the need for the adverb
- For weak verbs: suggest a more vivid/precise verb
- For cliches: suggest an original alternative
- For show-don't-tell: rewrite to show through action/sensory detail
- Keep replacements concise — prefer single words when replacing single words`,
      text, 'smartScan'
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

    // Cache to Firestore
    if (manuscriptId && Storage.userId && suggestions.length > 0) {
      try {
        await firebase.firestore()
          .collection('users').doc(Storage.userId)
          .collection('manuscripts').doc(manuscriptId)
          .collection('aiScans').doc('smartScan')
          .set({ suggestions, timestamp: Date.now(), issueCount: issues.length });
      } catch (e) { console.warn('SmartScan cache write failed:', e.message); }
    }

    return suggestions;
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
    const currentUser = typeof firebase !== 'undefined' && firebase.auth().currentUser ? firebase.auth().currentUser : null;
    headers['x-user-id'] = currentUser ? currentUser.uid : 'anon';
    if (currentUser) {
      try { headers['authorization'] = 'Bearer ' + await currentUser.getIdToken(); } catch(e) {}
    }
    headers['x-model'] = 'claude';
    const rewriteBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: [{ type: 'text', text: systemText }],
      messages: [{ role: 'user', content: userText }]
    });
    let response = await fetch(endpoint, { method: 'POST', headers, body: rewriteBody });
    if (response.status === 401 && currentUser) {
      try {
        headers['authorization'] = 'Bearer ' + await currentUser.getIdToken(true);
        response = await fetch(endpoint, { method: 'POST', headers, body: rewriteBody });
      } catch (e) {}
    }
    if (!response.ok) {
      const err = await response.json().catch(()=>({}));
      throw new Error(err.error?.message || 'Rewrite failed (' + response.status + ')');
    }
    const result = await response.json();
    const raw = result.content?.[0]?.text || '';
    try { return JSON.parse(raw); } catch(e) { return { rewrite: raw.trim() }; }
  },

  async rewriteSentence(sentence, issueType, context, fingerprint) {
    const fp = Analyzer.fingerprintToPrompt(fingerprint);
    const names = {
      passive: 'passive voice', adverb: 'adverb overuse', 'weak-verb': 'weak verb',
      'show-tell': 'telling instead of showing', wordy: 'wordiness', cliche: 'cliché'
    };
    const issueName = names[issueType] || issueType;
    const sys = 'You are a fiction editor. Fix the writing issue while preserving the author\'s exact voice and meaning. Return ONLY valid JSON: {"rewrite":"..."}. No explanation.'
      + (fp ? '\n\nAuthor voice profile: ' + fp + '.' : '');
    const usr = 'Fix ' + issueName + ' in:\n"' + sentence + '"'
      + (context && context !== sentence ? '\n\nContext (do not rewrite):\n"' + context + '"' : '');
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
    const cacheKey = 'fixes:' + this._shortHash(text) + ':v1';
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached && Date.now() - cached.created_at < 24 * 3600 * 1000) return cached;
    } catch (e) {}
    return null;
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
    const currentUser = typeof firebase !== 'undefined' && firebase.auth().currentUser ? firebase.auth().currentUser : null;
    if (currentUser) {
      headers['x-user-id'] = currentUser.uid;
      try { headers['authorization'] = 'Bearer ' + await currentUser.getIdToken(); } catch(e) {}
    }
    headers['x-model'] = 'openai-fast';

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
    if (response.status === 401 && currentUser) {
      try {
        headers['authorization'] = 'Bearer ' + await currentUser.getIdToken(true);
        response = await fetch(endpoint, { method: 'POST', headers, body: batchBody });
      } catch (e) {}
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

    try {
      localStorage.setItem('fixes:' + this._shortHash(text) + ':v1', JSON.stringify(cacheObj));
    } catch (e) {}

    return cacheObj;
  }

};

// Load session cache on init
AIEngine._loadSessionCache();
