// Book Intelligence worker — runs IntelligencePipeline.build() off the main thread.
// The intelligence modules declare top-level bindings and only attach to `window`,
// which does not exist here, so expose each one on the worker global explicitly
// before intelligence-pipeline.js resolves its dependencies from globalThis.
importScripts(
  'manuscript-parser.js?v=3',
  'book-intelligence.js?v=3',
  'document-intelligence.js',
  'story-intelligence.js?v=2',
  'continuity-intelligence.js?v=2',
  'timeline-intelligence.js?v=2',
  'narrative-momentum.js?v=2',
  'relationship-intelligence.js?v=2',
  'character-ledger.js?v=2'
);
self.ManuscriptParser = ManuscriptParser;
self.BookIntelligence = BookIntelligence;
self.DocumentIntelligence = DocumentIntelligence;
self.StoryIntelligence = StoryIntelligence;
self.ContinuityIntelligence = ContinuityIntelligence;
self.TimelineIntelligence = TimelineIntelligence;
self.NarrativeMomentum = NarrativeMomentum;
self.RelationshipIntelligence = RelationshipIntelligence;
self.CharacterLedger = CharacterLedger;
importScripts('intelligence-pipeline.js?v=2');

self.onmessage = e => {
  const { id, text, analysis } = e.data || {};
  try {
    const result = IntelligencePipeline.build(text, analysis || null);
    self.postMessage({ id, result: { parsed: result.parsed, intel: result.intel } });
  } catch (err) {
    self.postMessage({ id, error: (err && err.message) || String(err) });
  }
};
