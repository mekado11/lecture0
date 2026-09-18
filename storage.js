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
    if (typeof BookIntelligence !== 'undefined' && BookIntelligence.build) {\n      const base = BookIntelligence.build(parsed, analysisResult);\n      const story = (typeof StoryIntelligence !== 'undefined' && StoryIntelligence.enrich) ? StoryIntelligence.enrich(parsed, base) : base;\n      const continuity = (typeof ContinuityIntelligence !== 'undefined' && ContinuityIntelligence.enrich) ? ContinuityIntelligence.enrich(parsed, story) : story;\n      const timeline = (typeof TimelineIntelligence !== 'undefined' && TimelineIntelligence.enrich) ? TimelineIntelligence.enrich(parsed, continuity) : continuity;\n      const momentum = (typeof NarrativeMomentum !== 'undefined' && NarrativeMomentum.enrich) ? NarrativeMomentum.enrich(timeline) : timeline;\n      const relationships = (typeof RelationshipIntelligence !== 'undefined' && RelationshipIntelligence.enrich) ? RelationshipIntelligence.enrich(parsed, momentum) : momentum;\n      return (typeof CharacterLedger !== 'undefined' && CharacterLedger.enrich) ? CharacterLedger.enrich(relationships) : relationships;\n    }
    return null;
  },

  async _replaceCollection(collectionRef, rows, idFor) {
    const existing = await collectionRef.get();
    for (let start=0; start<existing.docs.length; start+=400) {
      const batch=this.db.batch();
      existing.docs.slice(start,start+400).forEach(d=>batch.delete(d.ref));
      await batch.commit();
    }
    for (let start=0; start<rows.length; start+=400) {
      const batch=this.db.batch();
      rows.slice(start,start+400).forEach((row,i)=>batch.set(collectionRef.doc(idFor(row,start+i)), row));
      await batch.commit();
    }
  },

  async _writeBookIntelligence(manuscriptRef, intelligence) {
    if (!intelligence) return;
    const root=manuscriptRef.collection('intelligence').doc('book');
    await root.set({
      version: intelligence.version, chapterCount: intelligence.chapterCount,
      characterCount: (intelligence.characters||[]).length,
      factCount: (intelligence.facts||[]).length,
      relationshipCount: (intelligence.relationshipIntelligence?.relationships||[]).length,
      timelineEventCount: (intelligence.timeline?.events||[]).length,
      threadCount: (intelligence.narrativeMomentum?.arcs||[]).length,
      continuityCount: (intelligence.continuity||[]).length,
      pov: intelligence.pov, scoreEvidence: intelligence.scoreEvidence || {},
      scoreConflicts: (intelligence.scoreConflicts || []).slice(0,20),
      generatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await this._replaceCollection(root.collection('facts'), intelligence.facts||[], (x,i)=>x.id||('fact-'+String(i+1).padStart(5,'0')));
    await this._replaceCollection(root.collection('relationships'), intelligence.relationshipIntelligence?.relationships||[], (x,i)=>x.id||('relationship-'+String(i+1).padStart(4,'0')));
    await this._replaceCollection(root.collection('timeline'), intelligence.timeline?.events||[], (x,i)=>x.id||('event-'+String(i+1).padStart(5,'0')));
    await this._replaceCollection(root.collection('threads'), intelligence.narrativeMomentum?.arcs||[], (x,i)=>x.id||('thread-'+String(i+1).padStart(4,'0')));
    await this._replaceCollection(root.collection('characters'), intelligence.characterLedger?.characters||[], (x,i)=>x.id||('character-'+String(i+1).padStart(4,'0')));
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
    const parsed = this._parseManuscript(text);
    const intelligence = this._buildBookIntelligence(parsed, analysisResult);
    const inlineText = text.length <= 450000 ? text : null;
    const doc = {
      id, fileName, schemaVersion: 2, parserVersion: parsed.version || 1,
      textLength: text.length, chapterCount: parsed.chapterCount, wordCount: parsed.wordCount,
      ...(inlineText !== null ? { text: inlineText } : {}),
      genre: analysisResult?.genre?.label || 'Unknown',
      genrePrimary: analysisResult?.genre?.primary || '', overall: analysisResult?.overall || 0,
      scores: analysisResult?.scores || {}, issueCount: analysisResult?.issues?.length || 0,
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
    const parsed = this._parseManuscript(text);
    const intelligence = this._buildBookIntelligence(parsed, analysisResult);
    const inlineText = text.length <= 450000 ? text : null;
    const update = {
      schemaVersion: 2, parserVersion: parsed.version || 1, textLength: text.length,
      chapterCount: parsed.chapterCount, wordCount: parsed.wordCount,
      text: inlineText === null ? firebase.firestore.FieldValue.delete() : inlineText,
      overall: analysisResult?.overall || 0, scores: analysisResult?.scores || {},
      genre: analysisResult?.genre?.label || 'Unknown', genrePrimary: analysisResult?.genre?.primary || '',
      issueCount: analysisResult?.issues?.length || 0, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const manuscriptRef = ref.collection('manuscripts').doc(id);
    await manuscriptRef.update(update);
    await this._writeChapters(manuscriptRef, parsed, intelligence);
    await this._writeBookIntelligence(manuscriptRef, intelligence);
  },

