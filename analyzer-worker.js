// Web Worker for Analyzer.analyze() — runs off main thread
// Posts back {type:'result', data: analysisResult} or {type:'error', message: string}

importScripts('analyzer.js');

let _currentVersion = 0;

self.onmessage = function(e) {
  if (e.data.type === 'analyze') {
    const version = e.data.version;
    _currentVersion = version;
    try {
      const result = Analyzer.analyze(e.data.text, e.data.genreKey || undefined);
      if (version < _currentVersion) return;
      self.postMessage({ type: 'result', data: result, version: version });
    } catch (err) {
      if (version < _currentVersion) return;
      self.postMessage({ type: 'error', message: err.message || String(err), version: version });
    }
  }
};
