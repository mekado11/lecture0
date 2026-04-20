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
  whenReady() { return this._authReady || Promise.resolve(null); },

  _userDoc() {
    if (!this.db || !this.userId) return null;
    return this.db.collection('users').doc(this.userId);
  },

  // ========================
  // MANUSCRIPTS
  // ========================
  async saveManuscript(fileName, text, analysisResult) {
    const ref = this._userDoc();
    if (!ref) return null;
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const doc = {
      id,
      fileName,
      text: text.substring(0, 500000), // 500KB limit per doc
      wordCount: (text.match(/\b\w+\b/g) || []).length,
      genre: analysisResult?.genre?.label || 'Unknown',
      overall: analysisResult?.overall || 0,
      scores: analysisResult?.scores || {},
      issueCount: analysisResult?.issues?.length || 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await ref.collection('manuscripts').doc(id).set(doc);
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
      issueCount: analysisResult?.issues?.length || 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await ref.collection('manuscripts').doc(id).update(update);
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
    const doc = await ref.collection('manuscripts').doc(id).get();
    return doc.exists ? { ...doc.data(), id: doc.id } : null;
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
      } catch (e) {
        console.warn('Auto-save failed:', e.message);
      }
      // localStorage always runs — even if Firestore failed — as last-resort fallback
      try {
        localStorage.setItem('ml_autosave', JSON.stringify({
          text, result: analysisResult,
          manuscriptId: this._currentManuscriptId,
          savedAt: new Date().toISOString()
        }));
      } catch (e) { /* storage quota exceeded */ }
    }, 5000); // 5 second debounce
  }
};

// Auto-initialize when loaded (Firebase must be initialized first)
if (typeof firebase !== 'undefined') {
  Storage.init();
}
