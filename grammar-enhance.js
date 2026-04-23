// LanguageTool Grammar Enhancement
// Calls LanguageTool API (via server proxy, with direct fallback) to supplement
// the local regex grammar checker with 2000+ linguistic rules: comma splices,
// run-ons, dangling modifiers, pronoun agreement, parallel structure, etc.
//
// The local checker handles: double words, subject-verb agreement, its/it's,
// their/there, your/you're, tense shifts, capitalization, dialogue punctuation.
// LanguageTool fills the gaps our regex can't reach.

const GrammarEnhance = {
  PROXY_URL: '/api/grammar',
  DIRECT_URL: 'https://api.languagetool.org/v2/check',
  MAX_CHARS: 15000,
  _cache: new Map(),
  _useProxy: true,

  async check(text) {
    if (!text || text.length < 50) return [];

    const cacheKey = text.length + '|' + text.substring(0, 100);
    const cached = this._cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) return cached.issues;

    try {
      const chunks = this._chunk(text);
      const allMatches = [];

      for (const chunk of chunks) {
        const matches = await this._callAPI(chunk.text);
        matches.forEach(m => { m.offset += chunk.offset; });
        allMatches.push(...matches);
      }

      const issues = this._convert(allMatches, text);
      this._cache.set(cacheKey, { issues, ts: Date.now() });
      return issues;
    } catch (e) {
      console.warn('[GrammarEnhance] LanguageTool unavailable:', e.message);
      return [];
    }
  },

  _chunk(text) {
    if (text.length <= this.MAX_CHARS) {
      return [{ text, offset: 0 }];
    }
    const chunks = [];
    let pos = 0;
    while (pos < text.length) {
      let end = Math.min(pos + this.MAX_CHARS, text.length);
      if (end < text.length) {
        const para = text.lastIndexOf('\n', end);
        if (para > pos + 5000) end = para + 1;
        else {
          const sent = text.lastIndexOf('. ', end);
          if (sent > pos + 5000) end = sent + 2;
        }
      }
      chunks.push({ text: text.substring(pos, end), offset: pos });
      pos = end;
    }
    return chunks;
  },

  async _callAPI(text) {
    if (this._useProxy) {
      try {
        return await this._callProxy(text);
      } catch (e) {
        console.warn('[GrammarEnhance] Proxy failed, trying direct:', e.message);
        this._useProxy = false;
      }
    }
    return await this._callDirect(text);
  },

  async _callProxy(text) {
    const response = await fetch(this.PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, language: 'en-US' })
    });
    if (!response.ok) throw new Error('Proxy returned ' + response.status);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.matches || [];
  },

  async _callDirect(text) {
    const params = new URLSearchParams({
      text: text,
      language: 'en-US',
      disabledCategories: 'TYPOS,CASING,REDUNDANCY,STYLE',
      disabledRules: 'WHITESPACE_RULE,EN_QUOTES,DASH_RULE,WORD_CONTAINS_UNDERSCORE',
      level: 'picky'
    });

    const response = await fetch(this.DIRECT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    if (!response.ok) throw new Error('LanguageTool returned ' + response.status);
    const data = await response.json();
    return data.matches || [];
  },

  _convert(matches, fullText) {
    const issues = [];
    const seen = new Set();

    for (const m of matches) {
      const offset = m.offset;
      const length = m.length;
      const matchedText = fullText.substring(offset, offset + length);
      const dedupeKey = offset + ':' + length;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      if (this._isInsideQuotes(fullText, offset) && this._isDialogueSafe(m.rule?.id)) continue;

      const replacement = m.replacements?.[0]?.value;
      const severity = this._mapSeverity(m.rule?.category?.id);

      issues.push({
        type: 'grammar',
        text: matchedText,
        index: offset,
        length: length,
        severity: severity,
        confidence: 0.88,
        message: m.message || 'Grammar issue detected',
        suggestion: replacement
          ? 'Replace with: "' + replacement + '"'
          : m.shortMessage || m.message || 'Review this phrase',
        _source: 'languagetool',
        _ruleId: m.rule?.id || '',
        _category: m.rule?.category?.id || ''
      });
    }

    return issues;
  },

  _mapSeverity(categoryId) {
    const high = ['AGREEMENT', 'GRAMMAR', 'TYPOS', 'CONFUSED_WORDS'];
    const medium = ['PUNCTUATION', 'COMPOUNDING', 'MISC'];
    if (high.includes(categoryId)) return 'high';
    if (medium.includes(categoryId)) return 'medium';
    return 'low';
  },

  _isInsideQuotes(text, index) {
    let count = 0;
    for (let i = 0; i < index && i < text.length; i++) {
      if (text[i] === '"' || text[i] === '“' || text[i] === '”') count++;
    }
    return count % 2 === 1;
  },

  _isDialogueSafe(ruleId) {
    const dialogueSafe = new Set([
      'SENTENCE_FRAGMENT', 'COMMA_COMPOUND_SENTENCE', 'MISSING_COMMA_AFTER_INTRODUCTORY_PHRASE',
      'UPPERCASE_SENTENCE_START', 'I_LOWERCASE', 'SENT_START_CONJUNCTIVE_LINKING_ADVERB_COMMA'
    ]);
    return dialogueSafe.has(ruleId);
  }
};
