// Native shell bridge. Active only inside the AuthorScrolls iOS app, which registers a WebKit
// message handler named "authorscrolls" before any page script runs. In a browser this file
// installs an inert object and does nothing else, so the web app stays the single source of
// truth and the shell is a thin window onto it.
//
// What the shell takes over, because WKWebView cannot do it itself:
//   saveFile     a blob: download does not save in WKWebView; the shell writes the file and
//                presents the share sheet
//   openExternal links off the app's own origin open in Safari's in-app view, so checkout,
//                help articles and sign-in providers do not take over the window
//   theme        the page reports its background colour so the status bar and the area
//                behind the hinge or notch match it in both themes
(() => {
  'use strict';
  const handler = (typeof window !== 'undefined' && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.authorscrolls) || null;
  const bridge = {
    platform: handler ? 'ios' : null,
    post(type, payload) {
      if (!handler) return false;
      try { handler.postMessage(Object.assign({ type }, payload || {})); return true; } catch (_) { return false; }
    },
    // Text content only (the app's exports are HTML and plain text). Returns true when the
    // shell took the file; the caller falls back to a browser download otherwise.
    saveFile(filename, mime, text) {
      if (!handler) return false;
      let base64;
      try { base64 = btoa(unescape(encodeURIComponent(String(text)))); } catch (_) { return false; }
      return this.post('saveFile', { filename: String(filename || 'export.txt'), mime: String(mime || 'text/plain'), base64 });
    },
    openExternal(url) { return !!handler && this.post('openExternal', { url: String(url) }); },
    reportTheme() {
      if (!handler) return false;
      const bg = getComputedStyle(document.body).backgroundColor || '';
      const m = bg.match(/\d+(\.\d+)?/g) || [];
      const dark = m.length >= 3 ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 128 : true;
      return this.post('theme', { background: bg, dark });
    }
  };
  window.AuthorScrollsNative = bridge;
  if (!handler) return;

  document.documentElement.dataset.native = 'ios';
  // Off-origin links leave the web view; the shell opens them in an in-app Safari view.
  document.addEventListener('click', e => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_self' && a.dataset.native === 'inline') return;
    let url; try { url = new URL(a.getAttribute('href'), location.href); } catch (_) { return; }
    if (!/^https?:$/.test(url.protocol) || url.origin === location.origin) return;
    e.preventDefault();
    bridge.openExternal(url.href);
  }, true);
  const report = () => bridge.reportTheme();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', report); else report();
  new MutationObserver(report).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-editor-theme'] });
})();
