// Web Worker for Analyzer.analyze() — runs off main thread
// Posts back {type:'result', data: analysisResult} or {type:'error', message: string}

// Prose context must load BEFORE analyzer.js runs an analysis: analyze() feature-detects
// these globals, so without them the worker would silently produce context-free scores while
// the main-thread fallback produced context-aware ones.
// Keep these versions in step with app.html: a stale analyzer here means the worker scores
// with old detectors while the page believes it is running the new ones.
importScripts('prose-context.js?v=1', 'prose-norms.js?v=4', 'analyzer.js?v=32');

// Note: _currentVersion tracking here is structurally inert — the Worker JS runtime
// is single-threaded, so _currentVersion cannot change while Analyzer.analyze() runs
// synchronously. The real stale-result guard lives on the main thread, which discards
// any postMessage whose e.data.version doesn't match the current request version.
let _currentVersion = 0;

self.onmessage = function(e) {
  if (e.data.type === 'analyze') {
    const version = e.data.version;
    _currentVersion = version;
    try {
      const result = Analyzer.analyze(e.data.text, e.data.genreKey || undefined);
      self.postMessage({ type: 'result', data: result, version: version });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message || String(err), version: version });
    }
  }
};
