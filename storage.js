// Cloud persistence. Manuscript generations are immutable until the root pointer
// is committed, so a failed multi-batch save never replaces the last readable draft.
const Storage = {
  db:null, userId:null, _authReady:null, _currentManuscriptId:null,
  _writes:new Map(), _revisions:new Map(), _autoSaveTimer:null,
  init() {
    this.db=firebase.firestore();
    this._authReady=new Promise(resolve=>firebase.auth().onAuthStateChanged(user=>{
      if(this.userId!==user?.uid)this._revisions.clear();
      this.userId=user?.uid||null;resolve(user);
    }));
  },
  whenReady() {if(!this._authReady&&typeof firebase!=='undefined')this.init();return this._authReady||Promise.resolve(null);},
  _userDoc() {return this.db&&this.userId?this.db.collection('users').doc(this.userId):null;},
  _parseManuscript(text) {return ManuscriptParser.parse(text);},
  _buildBookIntelligence(parsed, analysis=null) {return IntelligencePipeline.enrich(parsed,analysis);},
  _utf8Bytes(text) {return new TextEncoder().encode(String(text||'')).length;},
  _splitChapterText(text,maxBytes=700000) {
    text=String(text||'');
    if(maxBytes<4)throw new Error('Chunk budget must fit a Unicode character');
    const parts=[];let start=0;
    while(start<text.length) {
      let lo=start+1,hi=text.length,end=start;
      while(lo<=hi){const mid=Math.floor((lo+hi)/2);if(this._utf8Bytes(text.slice(start,mid))<=maxBytes){end=mid;lo=mid+1;}else hi=mid-1;}
      // Never split a UTF-16 surrogate pair, even when its UTF-8 byte size changes.
      if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;
      if(end<=start)throw new Error('Unable to split manuscript safely');
      parts.push(text.slice(start,end));start=end;
    }
    return parts.length?parts:[''];
  },
  _serialize(key, task) {
    const previous=this._writes.get(key)||Promise.resolve();
    const next=previous.catch(()=>{}).then(task);
    this._writes.set(key,next);
    next.finally(()=>{if(this._writes.get(key)===next)this._writes.delete(key);}).catch(()=>{});
    return next;
  },
  async flush() {await Promise.all([...this._writes.values()]);},
  async _writeParts(collection,parts,generation=null) {
    for(let start=0;start<parts.length;start+=400) {
      const batch=this.db.batch();
      parts.slice(start,start+400).forEach((text,i)=>{
        const index=start+i;
        batch.set(collection.doc((generation?generation+'-':'')+String(index).padStart(6,'0')),{index,text,...(generation?{generation}:{})});
      });
      await batch.commit();
    }
  },
  async _deleteCollection(collection) {
    const snap=await collection.get();
    for(let start=0;start<snap.docs.length;start+=400) {
      const batch=this.db.batch();snap.docs.slice(start,start+400).forEach(d=>batch.delete(d.ref));await batch.commit();
    }
  },
  _metadata(text,analysis) {
    const parsed=this._parseManuscript(text);
    return {schemaVersion:3,parserVersion:parsed.version||0,textLength:text.length,
      wordCount:parsed.wordCount,chapterCount:parsed.chapterCount,
      genre:analysis?.genre?.label||'Unknown',genrePrimary:analysis?.genre?.primary||'',
      overall:analysis?.overall??0,scores:analysis?.scores||{},issueCount:analysis?.issues?.length||0,
      saveState:'ready',updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
  },
  _revision(doc){
    if(!doc.exists)return null;
    const data=doc.data();
    return data.activeGeneration||('legacy:'+(data.updatedAt?.toMillis?.()||0)+':'+(data.textLength??data.text?.length??0));
  },
  async _commitText(ref,text,analysis,extra={}) {
    const previous=await ref.get();
    const oldGeneration=previous.exists?previous.data().activeGeneration:null;
    const expected=this._revisions.has(ref.path)?this._revisions.get(ref.path):null;
    if(this._revision(previous)!==expected)throw new Error('This manuscript changed on another device. Your local recovery is retained; export it before reloading the cloud draft.');
    const generation=ref.collection('chapters').doc().id;
    const parts=this._splitChapterText(text);
    // Store source once. All derived intelligence is rebuilt on demand rather
    // than deleting and rewriting five subcollections on every autosave.
    await this._writeParts(ref.collection('chapters'),parts,generation);
    await this.db.runTransaction(async tx=>{
      const current=await tx.get(ref);
      if(this._revision(current)!==expected)throw new Error('Another device saved this manuscript. Export your local recovery before reloading the cloud draft.');
      tx.set(ref,{...this._metadata(text,analysis),...extra,activeGeneration:generation,
        partCount:parts.length,text:firebase.firestore.FieldValue.delete()},{merge:true});
    });
    this._revisions.set(ref.path,generation);
    // Cleanup only the generation observed before this save. Never remove a
    // concurrent writer's new generation.
    if(oldGeneration&&oldGeneration!==generation) {
      await this._deleteCollection(ref.collection('chapters').where('generation','==',oldGeneration))
        .catch(error=>console.warn('Old draft cleanup deferred:',error.message));
    }
  },
  async saveManuscript(fileName,text,analysis) {
    const user=this._userDoc();if(!user)throw new Error('Sign in before saving to cloud');
    const ref=user.collection('manuscripts').doc();
    await this._serialize(ref.path,()=>this._commitText(ref,text,analysis,{
      id:ref.id,fileName,createdAt:firebase.firestore.FieldValue.serverTimestamp()
    }));
    return ref.id;
  },
  async updateManuscript(id,text,analysis) {
    const user=this._userDoc();if(!user)throw new Error('Sign in before saving to cloud');
    const ref=user.collection('manuscripts').doc(id);
    return this._serialize(ref.path,()=>this._commitText(ref,text,analysis));
  },
  async getManuscripts() {
    const user=this._userDoc();if(!user)return [];
    const snap=await user.collection('manuscripts').orderBy('updatedAt','desc').get();
    return snap.docs.map(d=>({...d.data(),id:d.id}));
  },
  async getManuscript(id,retry=0) {
    const user=this._userDoc();if(!user)return null;
    const ref=user.collection('manuscripts').doc(id),doc=await ref.get();
    if(!doc.exists)return null;
    const data={...doc.data(),id:doc.id};
    if(data.schemaVersion>=3) {
      const snap=await ref.collection('chapters').where('generation','==',data.activeGeneration).get();
      const parts=snap.docs.map(d=>d.data()).sort((a,b)=>a.index-b.index);
      if(parts.length!==data.partCount||parts.some((p,i)=>p.index!==i)){
        // A concurrent save may clean up the generation we started reading.
        // Retry only if the committed pointer actually changed; corruption is
        // still reported rather than hidden by empty/truncated text.
        if(retry<2&&this._revision(await ref.get())!==this._revision(doc))return this.getManuscript(id,retry+1);
        throw new Error('Draft is incomplete; refusing to load truncated text');
      }
      data.text=parts.map(p=>p.text).join('');
      if(data.text.length!==data.textLength)throw new Error('Draft length check failed');
    } else if(data.schemaVersion>=2&&data.text==null) {
      const snap=await ref.collection('chapters').get();
      data.text=snap.docs.map(d=>d.data()).filter(p=>!p.generation).sort((a,b)=>(a.index-b.index)||((a.partIndex||0)-(b.partIndex||0))).map(p=>p.text||'').join('');
      if(data.textLength!=null&&data.text.length!==data.textLength)throw new Error('Legacy draft is incomplete');
    }
    this._revisions.set(ref.path,this._revision(doc));
    return data;
  },
  async deleteManuscript(id) {
    const user=this._userDoc();if(!user)return;
    const ref=user.collection('manuscripts').doc(id);
    return this._serialize(ref.path,async()=>{
      const versions=await ref.collection('versions').get();
      for(const version of versions.docs){await this._deleteCollection(version.ref.collection('parts'));await version.ref.delete();}
      const legacy=ref.collection('intelligence').doc('book');
      for(const name of ['facts','relationships','timeline','threads','characters'])await this._deleteCollection(legacy.collection(name));
      await legacy.delete();
      for(const name of ['chapters','aiScans'])await this._deleteCollection(ref.collection(name));
      await ref.delete();
      this._revisions.delete(ref.path);
      if(this._currentManuscriptId===id)this._currentManuscriptId=null;
    });
  },
  async getVersions(id) {
    const user=this._userDoc();if(!user)return [];
    const snap=await user.collection('manuscripts').doc(id).collection('versions').orderBy('timestamp','desc').limit(30).get();
    return snap.docs.map(d=>({...d.data(),id:d.id})).filter(v=>v.saveState!=='writing');
  },
  async saveVersion(id,analysis,text=null,reason='manual') {
    const user=this._userDoc();if(!user)throw new Error('Sign in to create snapshots');
    if(text==null)text=(await this.getManuscript(id))?.text;
    if(typeof text!=='string')throw new Error('No manuscript text to snapshot');
    const ref=user.collection('manuscripts').doc(id).collection('versions').doc();
    const parsed=this._parseManuscript(text),parts=this._splitChapterText(text);
    // Publish snapshot metadata last. Incomplete snapshots never appear usable.
    await this._writeParts(ref.collection('parts'),parts);
    await ref.set({schemaVersion:3,saveState:'ready',reason,textLength:text.length,
      wordCount:parsed.wordCount,chapterCount:parsed.chapterCount,partCount:parts.length,
      overall:analysis?.overall??0,scores:analysis?.scores||{},issueCount:analysis?.issues?.length||0,
      genre:analysis?.genre?.label||'',timestamp:firebase.firestore.FieldValue.serverTimestamp()});
    return ref.id;
  },
  async getVersion(id,versionId) {
    const user=this._userDoc();if(!user)return null;
    const ref=user.collection('manuscripts').doc(id).collection('versions').doc(versionId),doc=await ref.get();
    if(!doc.exists)return null;
    const data={...doc.data(),id:doc.id};
    if(data.schemaVersion>=2) {
      const snap=await ref.collection('parts').get();
      const parts=snap.docs.map(d=>d.data()).sort((a,b)=>a.index-b.index);
      if(parts.length!==data.partCount||parts.some((p,i)=>p.index!==i))throw new Error('Snapshot is incomplete');
      data.text=parts.map(p=>p.text||'').join('');
      if(data.text.length!==data.textLength)throw new Error('Snapshot length check failed');
    }
    if(typeof data.text!=='string')throw new Error('This historical entry contains scores only, not restorable text');
    return data;
  },
  async restoreVersion(id,versionId,analysis=null,currentText=null) {
    const snapshot=await this.getVersion(id,versionId);
    if(!snapshot)throw new Error('Snapshot not found');
    const current=currentText??(await this.getManuscript(id))?.text;
    if(typeof current!=='string')throw new Error('Cannot create a safety snapshot');
    await this.saveVersion(id,analysis,current,'before_restore');
    // Recalculate scores for the restored text; never retain the replaced draft's scores.
    const restoredAnalysis=typeof Analyzer!=='undefined'?Analyzer.analyze(snapshot.text,analysis?.genre?.primary):null;
    await this.updateManuscript(id,snapshot.text,restoredAnalysis);
    return snapshot.text;
  },
  async savePreferences(preferences) {
    const ref=this._userDoc();if(ref)await ref.set({preferences,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
  },
  async getPreferences() {const ref=this._userDoc();if(!ref)return {};const doc=await ref.get();return doc.exists?doc.data().preferences||{}:{};}
};
if(typeof module!=='undefined'&&module.exports)module.exports=Storage;
