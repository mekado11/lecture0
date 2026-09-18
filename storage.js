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

  _utf8Bytes(text) {
    text=String(text||'');
    if(typeof TextEncoder!=='undefined')return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  },

  _splitChapterText(text, maxBytes = 700000) {
    text=String(text||''); if(this._utf8Bytes(text)<=maxBytes)return [text];
    const parts=[]; let start=0;
    while(start<text.length){
      let lo=start+1,hi=text.length,end=start+1;
      while(lo<=hi){const mid=Math.floor((lo+hi)/2);if(this._utf8Bytes(text.slice(start,mid))<=maxBytes){end=mid;lo=mid+1;}else hi=mid-1;}
      if(end<text.length){
        const floor=start+Math.floor((end-start)*.7);
        const para=text.lastIndexOf('\n\n',end);
        const sentence=Math.max(text.lastIndexOf('. ',end),text.lastIndexOf('? ',end),text.lastIndexOf('! ',end));
        const cut=para>=floor?para+2:(sentence>=floor?sentence+2:end);
        if(cut>start)end=cut;
      }
      parts.push(text.slice(start,end)); start=end;
    }
    return parts;
  },

  async _writeChapters(manuscriptRef, parsed, intelligence = null) {
    const rows=[];
    for(const chapter of parsed.chapters||[]){
      const chapterIntel=intelligence?.chapters?.find(c=>c.id===chapter.id);
      const parts=this._splitChapterText(chapter.text);
      parts.forEach((text,partIndex)=>rows.push({
        id:parts.length===1?chapter.id:(chapter.id+'-part-'+String(partIndex+1).padStart(3,'0')),
        chapterId:chapter.id, partIndex, partCount:parts.length, text,
        index:chapter.index, number:chapter.number, title:chapter.title, heading:chapter.heading||null,
        start:chapter.start, end:chapter.end, wordCount:chapter.wordCount,
        intelligenceVersion:chapterIntel?intelligence.version:0,
        ...(chapterIntel&&partIndex===0?{pov:chapterIntel.pov,characterCandidates:chapterIntel.characterCandidates}: {})
      }));
    }
    const collection=manuscriptRef.collection('chapters');
    const existing=await collection.get();
    for(let start=0;start<existing.docs.length;start+=400){const batch=this.db.batch();existing.docs.slice(start,start+400).forEach(d=>batch.delete(d.ref));await batch.commit();}
    for(let start=0;start<rows.length;start+=400){const batch=this.db.batch();rows.slice(start,start+400).forEach(row=>batch.set(collection.doc(row.id),{...row,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}));await batch.commit();}
  },

  async saveManuscript(fileName, text, analysisResult) {
    const ref=this._userDoc(); if(!ref)return null;
    const id=Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    const manuscriptRef=ref.collection('manuscripts').doc(id);
    const parsed=this._parseManuscript(text), intelligence=this._buildBookIntelligence(parsed,analysisResult);
    const meta={id,fileName,schemaVersion:2,parserVersion:parsed.version||0,textLength:text.length,wordCount:parsed.wordCount,chapterCount:parsed.chapterCount,genre:analysisResult?.genre?.label||'Unknown',genrePrimary:analysisResult?.genre?.primary||'',overall:analysisResult?.overall||0,scores:analysisResult?.scores||{},issueCount:analysisResult?.issues?.length||0,saveState:'writing',createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    if(this._utf8Bytes(text)<=700000)meta.text=text;
    await manuscriptRef.set(meta);
    try{await this._writeChapters(manuscriptRef,parsed,intelligence);await this._writeBookIntelligence(manuscriptRef,intelligence);await manuscriptRef.set({saveState:'ready',updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});return id;}
    catch(e){await manuscriptRef.set({saveState:'error',saveErrorAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}).catch(()=>{});throw e;}
  },

  async updateManuscript(id, text, analysisResult) {
    const ref=this._userDoc(); if(!ref)return;
    const manuscriptRef=ref.collection('manuscripts').doc(id);
    const parsed=this._parseManuscript(text), intelligence=this._buildBookIntelligence(parsed,analysisResult);
    const update={schemaVersion:2,parserVersion:parsed.version||0,textLength:text.length,wordCount:parsed.wordCount,chapterCount:parsed.chapterCount,genre:analysisResult?.genre?.label||'Unknown',genrePrimary:analysisResult?.genre?.primary||'',overall:analysisResult?.overall||0,scores:analysisResult?.scores||{},issueCount:analysisResult?.issues?.length||0,saveState:'writing',updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    if(this._utf8Bytes(text)<=700000)update.text=text;else update.text=firebase.firestore.FieldValue.delete();
    await manuscriptRef.set(update,{merge:true});
    try{await this._writeChapters(manuscriptRef,parsed,intelligence);await this._writeBookIntelligence(manuscriptRef,intelligence);await manuscriptRef.set({saveState:'ready',updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});}
    catch(e){await manuscriptRef.set({saveState:'error',saveErrorAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}).catch(()=>{});throw e;}
  },

  async _readChapterText(manuscriptRef) {
    const snap=await manuscriptRef.collection('chapters').get();
    return snap.docs.map(d=>d.data()).sort((a,b)=>(a.index-b.index)||((a.partIndex||0)-(b.partIndex||0))).map(x=>x.text||'').join('');
  },

  async getManuscripts() {
    const ref=this._userDoc(); if(!ref)return [];
    const snap=await ref.collection('manuscripts').orderBy('updatedAt','desc').limit(20).get();
    return snap.docs.map(d=>({...d.data(),id:d.id}));
  },

  async getManuscript(id) {
    const ref=this._userDoc(); if(!ref)return null;
    const manuscriptRef=ref.collection('manuscripts').doc(id),doc=await manuscriptRef.get();
    if(!doc.exists)return null;const data={...doc.data(),id:doc.id};
    if(data.schemaVersion>=2&&data.text==null)data.text=await this._readChapterText(manuscriptRef);
    return data;
  },

  async _deleteCollection(collectionRef) {
    const snap=await collectionRef.get();
    for(let start=0;start<snap.docs.length;start+=400){const batch=this.db.batch();snap.docs.slice(start,start+400).forEach(d=>batch.delete(d.ref));await batch.commit();}
  },

  async deleteManuscript(id) {
    const ref=this._userDoc(); if(!ref)return;
    const m=ref.collection('manuscripts').doc(id);
    const versions=await m.collection('versions').get();
    for(const v of versions.docs){await this._deleteCollection(v.ref.collection('parts'));await v.ref.delete();}
    const intel=m.collection('intelligence').doc('book');
    for(const name of ['facts','relationships','timeline','threads','characters'])await this._deleteCollection(intel.collection(name));
    await intel.delete().catch(()=>{});
    for(const name of ['chapters','aiScans'])await this._deleteCollection(m.collection(name));
    await m.delete();
    if(this._currentManuscriptId===id)this._currentManuscriptId=null;
  },

  async getVersions(manuscriptId) {
    const ref=this._userDoc(); if(!ref)return [];
    const snap=await ref.collection('manuscripts').doc(manuscriptId).collection('versions').orderBy('timestamp','desc').limit(30).get();
    return snap.docs.map(d=>({...d.data(),id:d.id}));
  },

  async saveVersion(manuscriptId, analysisResult, text = null, reason = 'manual') {
    const ref=this._userDoc(); if(!ref)return null;
    const manuscriptRef=ref.collection('manuscripts').doc(manuscriptId);
    if(text==null){const current=await this.getManuscript(manuscriptId);text=current?.text||'';}
    const parsed=this._parseManuscript(text);
    const snapshotRef=manuscriptRef.collection('versions').doc();
    const parts=this._splitChapterText(text);
    await snapshotRef.set({
      schemaVersion:2, reason, textLength:text.length, wordCount:parsed.wordCount,
      chapterCount:parsed.chapterCount, partCount:parts.length,
      overall:analysisResult?.overall||0, scores:analysisResult?.scores||{},
      issueCount:analysisResult?.issues?.length||0, genre:analysisResult?.genre?.label||'',
      manuscriptHash:(typeof AIEngine!=='undefined'&&AIEngine._shortHash)?AIEngine._shortHash(text):null,
      timestamp:firebase.firestore.FieldValue.serverTimestamp()
    });
    for(let start=0;start<parts.length;start+=400){
      const batch=this.db.batch();
      parts.slice(start,start+400).forEach((part,i)=>batch.set(snapshotRef.collection('parts').doc('part-'+String(start+i+1).padStart(4,'0')),{index:start+i,text:part}));
      await batch.commit();
    }
    return snapshotRef.id;
  },

  async getVersion(manuscriptId, versionId) {
    const ref=this._userDoc(); if(!ref)return null;
    const versionRef=ref.collection('manuscripts').doc(manuscriptId).collection('versions').doc(versionId);
    const doc=await versionRef.get(); if(!doc.exists)return null;
    const data={...doc.data(),id:doc.id};
    if(data.schemaVersion>=2){
      const parts=await versionRef.collection('parts').get();
      data.text=parts.docs.map(d=>d.data()).sort((a,b)=>a.index-b.index).map(p=>p.text||'').join('');
    }
    return data;
  },

  async restoreVersion(manuscriptId, versionId, analysisResult = null) {
    const snapshot=await this.getVersion(manuscriptId,versionId);
    if(!snapshot?.text)return false;
    const current=await this.getManuscript(manuscriptId);
    if(current?.text!=null)await this.saveVersion(manuscriptId,analysisResult,current.text,'before_restore');
    await this.updateManuscript(manuscriptId,snapshot.text,analysisResult);
    return snapshot.text;
  },
