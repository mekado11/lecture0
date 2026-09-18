// One deterministic pipeline, shared by the editor, storage and grounded retrieval.
(function (root) {
  'use strict';
  const names = ['ManuscriptParser', 'BookIntelligence', 'StoryIntelligence',
    'ContinuityIntelligence', 'TimelineIntelligence', 'NarrativeMomentum',
    'RelationshipIntelligence', 'CharacterLedger'];
  const files = ['manuscript-parser', 'book-intelligence', 'story-intelligence',
    'continuity-intelligence', 'timeline-intelligence', 'narrative-momentum',
    'relationship-intelligence', 'character-ledger'];
  const deps = names.map((name, i) => typeof module !== 'undefined' && module.exports
    ? require('./' + files[i]) : root[name]);
  const documentIntel = typeof module !== 'undefined' && module.exports
    ? require('./document-intelligence') : root.DocumentIntelligence;
  function enrich(parsed, analysis = null) {
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
  const pipeline = {
    enrich,
    build(text, analysis = null) {
      const parsed = deps[0].parse(String(text || ''));
      return { text, parsed, intel: enrich(parsed, analysis) };
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = pipeline;
  else root.IntelligencePipeline = pipeline;
})(typeof window !== 'undefined' ? window : globalThis);
