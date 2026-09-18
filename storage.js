// AuthorScrolls - Firestore Storage Engine
// Saves manuscripts, analysis results, and user preferences to the cloud

const Storage = {
  db: null,
  userId: null,
  _authReady: null,

  init() {
    this.db = firebase.firestore();
    this._authReady = new Promise(resolve => {
      firebase.auth().onAuthStateChanged(user => {
        this.userId = user ? user.uid : null;
        resolve(user);
      });
    });
  },

  // Wait for auth to be resolved before accessing Firestore
  whenReady() {
    if (!this._authReady && typeof firebase !== 'undefined') this.init();
    return this._authReady || Promise.resolve(null);
  },

  _userDoc() {
    if (!this.db || !this.userId) return null;
    return this.db.collection('users').doc(this.userId);
  },

  // ========================
  // MANUSCRIPTS
  // ========================
  _parseManuscript(text) {
    if (typeof ManuscriptParser !== 'undefined' && ManuscriptParser.parse) return ManuscriptParser.parse(text);
    return { version: 0, textLength: text.length, wordCount: (text.match(/\\b\\w+\\b/g) || []).length, chapterCount: 1, chapters: [{ id: 'chapter-001', index: 0, number: 1, title: 'Manuscript', heading: null, start: 0, end: text.length, wordCount: (text.match(/\\b\\w+\\b/g) || []).length, text, body: text }], warnings: ['PARSER_NOT_LOADED'] };
  },

  _buildBookIntelligence(parsed, analysisResult = null) {
    if (typeof BookIntelligence !== 'undefined' && BookIntelligence.build) {\n      const base = BookIntelligence.build(parsed, analysisResult);\n      const story = (typeof StoryIntelligence !== 'undefined' && StoryIntelligence.enrich) ? StoryIntelligence.enrich(parsed, base) : base;\n      const continuity = (typeof ContinuityIntelligence !== 'undefined' && ContinuityIntelligence.enrich) ? ContinuityIntelligence.enrich(parsed, story) : story;\n      const timeline = (typeof TimelineIntelligence !== 'undefined' && TimelineIntelligence.enrich) ? TimelineIntelligence.enrich(parsed, continuity) : continuity;\n      return (typeof NarrativeMomentum !== 'undefined' && NarrativeMomentum.enrich) ? NarrativeMomentum.enrich(timeline) : timeline;\n    }
    return null;
  },

  async _writeBookIntelligence(manuscriptRef, intelligence) {
    if (!intelligence) return;
    await manuscriptRef.collection('intelligence').doc('book').set({
      version: intelligence.version,
      chapterCount: intelligence.chapterCount,
      characters: intelligence.characters,
      pov: intelligence.pov,
      scoreEvidence: intelligence.scoreEvidence || {},
      scoreConflicts: intelligence.scoreConflicts || [],
      generatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async _writeChapters(manuscriptRef, parsed, intelligence = null) {
    // Firestore batches are capped, so commit in conservative groups.
    const chunks = parsed.chapters || [];
    for (let start = 0; start < chunks.length; start += 400) {
      const batch = this.db.batch();
      chunks.slice(start, start + 400).forEach(chapter => {
        const chapterIntel = intelligence?.chapters?.find(c => c.id === chapter.id);
        batch.set(manuscriptRef.collection('chapters').doc(chapter.id), {
          index: chapter.index, number: chapter.number, title: chapter.title,
          heading: chapter.heading || null, start: chapter.start, end: chapter.end,
          wordCount: chapter.wordCount, text: chapter.text,
          intelligenceVersion: chapterIntel ? intelligence.version : 0,
          ...(chapterIntel ? { pov: chapterIntel.pov, characterCandidates: chapterIntel.characterCandidates } : {}),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }
  },

  async _readChapterText(manuscriptRef) {
    const snap = await manuscriptRef.collection('chapters').orderBy('index', 'asc').get();
    return snap.docs.map(d => d.data().text || '').join('');
  },
  async saveManuscript(fileName, text, analysisResult) {
    const ref = this._userDoc();
    if (!ref) return null;
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const intelligence = this._buildBookIntelligence(parsed, analysisResult);
    const doc = {
      id,
      fileName,
      text: text.substring(0, 500000), // 500KB limit per doc
      wordCount: (text.match(/\b\w+\b/g) || []).length,
      genre: analysisResult?.genre?.label || 'Unknown',
      genrePrimary: analysisResult?.genre?.primary || '',
      overall: analysisResult?.overall || 0,
      scores: analysisResult?.scores || {},
      issueCount: analysisResult?.issues?.length || 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const manuscriptRef = ref.collection('manuscripts').doc(id);
    await manuscriptRef.set(doc);
    await this._writeChapters(manuscriptRef, parsed, intelligence);
    await this._writeBookIntelligence(manuscriptRef, intelligence);
    return id;
  },

  async updateManuscript(id, text, analysisResult) {
    const ref = this._userDoc();
    if (!ref) return;
    const update = {
      text: text.substring(0, 500000),
      wordCount: (text.match(/\b\w+\b/g) || []).length,
      overall: analysisResult?.overall || 0,
      scores: analysisResult?.scores || {},
      genre: analysisResult?.genre?.label || 'Unknown',
      genrePrimary: analysisResult?.genre?.primary || '',
      issueCount: analysisResult?.issues?.length || 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const manuscriptRef = ref.collection('manuscripts').doc(id);
    await manuscriptRef.update(update);
    await this._writeChapters(manuscriptRef, parsed, intelligence);
    await this._writeBookIntelligence(manuscriptRef, intelligence);
  },

  async getManuscripts() {
    const ref = this._userDoc();
    if (!ref) return [];
    const snap = await ref.collection('manuscripts')
      .orderBy('updatedAt', 'desc')
      .limit(20)
      .get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  },

  async getManuscript(id) {
    const ref = this._userDoc();
    if (!ref) return null;
    const manuscriptRef = ref.collection('manuscripts').doc(id);
    const doc = await manuscriptRef.get();
    if (!doc.exists) return null;
    const data = { ...doc.data(), id: doc.id };
    // Backward compatible: v1 documents still read their inline text; v2 long
    // manuscripts reconstruct exact text from ordered chapter documents.
    if (!data.text && data.schemaVersion >= 2) data.text = await this._readChapterText(manuscriptRef);
    return data;
  },

  async deleteManuscript(id) {
    const ref = this._userDoc();
    if (!ref) return;
    await ref.collection('manuscripts').doc(id).delete();
  },

  // ========================
  // VERSION HISTORY
  // ========================
  async saveVersion(manuscriptId, analysisResult) {
    const ref = this._userDoc();
    if (!ref) return;
    const version = {
      overall: analysisResult.overall,
      scores: analysisResult.scores,
      issueCount: analysisResult.issues?.length || 0,
      wordCount: analysisResult.totalWords,
      genre: analysisResult.genre?.label || '',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    await ref.collection('manuscripts').doc(manuscriptId)
      .collection('versions').add(version);
  },

  async getVersions(manuscriptId) {
    const ref = this._userDoc();
    if (!ref) return [];
    const snap = await ref.collection('manuscripts').doc(manuscriptId)
      .collection('versions')
      .orderBy('timestamp', 'desc')
      .limit(30)
      .get();
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  },

  // ========================
  // USER PREFERENCES
  // ========================
  async savePreferences(prefs) {
    const ref = this._userDoc();
    if (!ref) return;
    await ref.set({ preferences: prefs, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  },

  async getPreferences() {
    const ref = this._userDoc();
    if (!ref) return {};
    const doc = await ref.get();
    return doc.exists ? (doc.data().preferences || {}) : {};
  },

  // ========================
  // AUTO-SAVE (debounced cloud save)
  // ========================
  _autoSaveTimer: null,
  _currentManuscriptId: null,

  autoSave(text, analysisResult) {
    clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = setTimeout(async () => {
      if (!this.userId) return;
      try {
        if (this._currentManuscriptId) {
          await this.updateManuscript(this._currentManuscriptId, text, analysisResult);
        }
        // Also save to localStorage as fallback
        localStorage.setItem('ml_autosave', JSON.stringify({
          text, result: analysisResult,
          manuscriptId: this._currentManuscriptId,
          savedAt: new Date().toISOString()
        }));
      } catch (e) {
        console.warn('Auto-save failed:', e.message);
      }
    }, 5000); // 5 second debounce
  }
};

// Auto-initialize when loaded (Firebase must be initialized first)
if (typeof firebase !== 'undefined') {
  Storage.init();
}
