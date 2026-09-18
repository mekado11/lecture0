// One deterministic pipeline, shared by the editor, storage and grounded retrieval.
(function (root) {
  'use strict';
  const names = ['ManuscriptParser', 'BookIntelligence', 'StoryIntelligence',
    'ContinuityIntelligence', 'TimelineIntelligence', 'NarrativeMomentum',
    'RelationshipIntelligence', 'CharacterLedger'];
  const files = ['manuscript-parser', 'book-intelligence', 'story-intelligence',
    'continuity-intelligence', 'timeline-intelligence', 'narrative-momentum',
    'relationship-intelligence', 'character-ledger'];
  const isNode = typeof module !== 'undefined' && module.exports;
  const deps = names.map((name, i) => isNode ? require('./' + files[i]) : root[name]);
  const documentIntel = isNode ? require('./document-intelligence') : root.DocumentIntelligence;

  // ---- Shared memo ---------------------------------------------------------
  // Three callers build this pipeline independently (the Intelligence window, the
  // AI grounded-context builder, and storage on every cloud save). Without a shared
  // cache each one re-ran the full chapter parse + POV/character/evidence sweep on
  // the main thread — three times per manuscript, on every autosave. Keyed by a
  // content fingerprint, never by object identity.
  const MAX_ENTRIES = 4;
  const cache = new Map();
  function hashText(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function analysisSig(analysis) {
    if (!analysis) return 'none';
    return [analysis.overall ?? '', analysis.genre?.primary ?? '', analysis.totalWords ?? '',
      analysis.scores?.grammar ?? '', analysis.readerPerspective?.hookStrength ?? ''].join('|');
  }
  function textKey(text, analysis) { return text.length + '|' + hashText(text) + '|' + analysisSig(analysis); }
  function parsedKey(parsed, analysis) {
    const first = parsed?.chapters?.[0], last = parsed?.chapters?.[parsed.chapters.length - 1];
    return 'p|' + (parsed?.textLength ?? 0) + '|' + (parsed?.wordCount ?? 0) + '|' + (parsed?.unitCount ?? 0) + '|'
      + hashText((first?.text || '').slice(0, 400) + (last?.text || '').slice(-400)) + '|' + analysisSig(analysis);
  }
  function remember(key, value) {
    cache.set(key, value);
    while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
    return value;
  }

  // Only the fields the pipeline actually reads. Keeps the worker message small and
  // guarantees it is structured-cloneable (analysisResult carries megabytes of issues).
  function slimAnalysis(analysis) {
    if (!analysis) return null;
    return {
      overall: analysis.overall, totalWords: analysis.totalWords, genre: analysis.genre || null,
      scores: analysis.scores || null, readerPerspective: analysis.readerPerspective || null,
      issues: (analysis.issues || []).map(i => ({ type: i.type, category: i.category }))
    };
  }

  function enrichUncached(parsed, analysis = null) {
    let intel = documentIntel.enrich(parsed, deps[1].build(parsed, analysis), analysis);
    if (intel.documentType.type === 'nonfiction') return {
      ...intel, characters:[], facts:[], relationships:[], continuity:[],
      characterLedger:{characters:[]}, relationshipIntelligence:{relationships:[]},
      narrativeMomentum:{arcs:[]}, timeline:{events:[]}
    };
    intel = deps[2].enrich(parsed, intel);
    intel = deps[3].enrich(parsed, intel);
    intel = deps[4].enrich(parsed, intel);
    intel = deps[5].enrich(intel);
    intel = deps[6].enrich(parsed, intel);
    return deps[7].enrich(intel);
  }
  function enrich(parsed, analysis = null) {
    const key = parsedKey(parsed, analysis);
    const hit = cache.get(key);
    if (hit && hit.intel) return hit.intel;
    const intel = enrichUncached(parsed, analysis);
    remember(key, { parsed, intel });
    return intel;
  }
  function build(text, analysis = null) {
    const src = String(text || '');
    const key = textKey(src, analysis);
    const hit = cache.get(key);
    if (hit && hit.parsed && hit.intel) return { text: src, parsed: hit.parsed, intel: hit.intel };
    const parsed = deps[0].parse(src);
    const intel = enrichUncached(parsed, analysis);
    remember(key, { parsed, intel });
    remember(parsedKey(parsed, analysis), { parsed, intel });
    return { text: src, parsed, intel };
  }

  // ---- Worker-backed async build (browser only) ----------------------------
  // The UI must never run this synchronously inside a click or input handler on a
  // long manuscript. Falls back to the synchronous build if workers are unavailable
  // or the worker fails, so callers always get a result.
  let worker = null, seq = 0;
  const pending = new Map();
  function failAll(message) {
    for (const p of pending.values()) p.reject(new Error(message));
    pending.clear();
  }
  function getWorker() {
    if (worker === false) return null;
    if (worker) return worker;
    if (typeof Worker === 'undefined') { worker = false; return null; }
    try {
      worker = new Worker(pipeline.workerUrl);
      worker.onmessage = e => {
        const p = pending.get(e.data?.id);
        if (!p) return;
        pending.delete(e.data.id);
        e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data.result);
      };
      worker.onerror = () => { failAll('Intelligence worker failed'); try { worker.terminate(); } catch (_) {} worker = false; };
      return worker;
    } catch (_) { worker = false; return null; }
  }
  function buildAsync(text, analysis = null) {
    const src = String(text || '');
    const key = textKey(src, analysis);
    const hit = cache.get(key);
    if (hit && hit.parsed && hit.intel) return Promise.resolve({ text: src, parsed: hit.parsed, intel: hit.intel });
    const w = getWorker();
    if (!w) return Promise.resolve(build(src, analysis));
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try { w.postMessage({ id, text: src, analysis: slimAnalysis(analysis) }); }
      catch (err) { pending.delete(id); reject(err); }
    }).then(result => {
      remember(key, { parsed: result.parsed, intel: result.intel });
      remember(parsedKey(result.parsed, analysis), { parsed: result.parsed, intel: result.intel });
      return { text: src, parsed: result.parsed, intel: result.intel };
    }).catch(() => build(src, analysis));
  }

  const pipeline = { enrich, build, buildAsync, workerUrl: 'intelligence-worker.js?v=1' };
  if (isNode) module.exports = pipeline;
  else root.IntelligencePipeline = pipeline;
})(typeof window !== 'undefined' ? window : globalThis);
