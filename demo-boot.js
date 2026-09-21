// Workspace demo: app.html?demo=selfhelp | ?demo=novel
// A visitor tries the real workspace on a public-domain sample without an account. The demo
// swaps the Firebase SDK for the in-memory double (demo-firebase.js), keeps every save in a
// throwaway in-memory storage so nothing is left in the browser, and refuses every /api call
// (AI and grammar need an account, and the server would reject a demo token anyway). Nothing
// here grants a privilege: the double's user has no tier, and the real API never sees it.
(() => {
  'use strict';
  const which = new URLSearchParams(location.search).get('demo');
  if (!which) return;
  const SAMPLES = {
    selfhelp: { file: 'assets/samples/as-a-man-thinketh.txt', name: 'As a Man Thinketh (James Allen, 1903).txt', genre: 'selfHelp', label: 'a public-domain self-help classic', other: 'novel', otherLabel: 'Try the novel sample' },
    novel: { file: 'assets/samples/the-secret-garden.txt', name: 'The Secret Garden, chapters 1–8 (Frances Hodgson Burnett, 1911).txt', genre: 'literary', label: 'the opening chapters of a public-domain novel', other: 'selfhelp', otherLabel: 'Try the self-help sample' }
  };
  const sample = SAMPLES[which] || SAMPLES.selfhelp;
  window.__demo = true;

  // Throwaway storage: the demo must leave nothing behind and must not touch a signed-in
  // author's own keys on the same browser.
  function memoryStorage() {
    const store = {};
    return Object.defineProperties({}, {
      getItem: { value: key => Object.hasOwn(store, key) ? String(store[key]) : null },
      setItem: { value: (key, value) => { store[key] = String(value); } },
      removeItem: { value: key => { delete store[key]; } },
      clear: { value: () => Object.keys(store).forEach(key => delete store[key]) },
      key: { value: index => Object.keys(store)[index] || null },
      length: { get: () => Object.keys(store).length }
    });
  }
  try {
    Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: memoryStorage(), configurable: true });
  } catch (_) { /* a locked-down browser: the demo still runs, only the throwaway store is lost */ }

  const fixture = createFirebaseFixture();
  Object.assign(fixture.user, { uid: 'demo-reader', email: 'demo@example.invalid', displayName: 'Demo reader' });
  window.firebase = fixture.firebase;
  localStorage.setItem('ml_storage_owner', 'demo-reader');
  localStorage.setItem('wizard_done', '1');
  localStorage.setItem('cookie_consent', 'essential');
  localStorage.setItem('ml_push_dismissed', '1');

  const realFetch = window.fetch.bind(window);
  window.fetch = (url, options) => String(url).includes('/api/')
    ? Promise.reject(new Error('The demo runs without live services. Create a free account to use AI and grammar checks.'))
    : realFetch(url, options);

  window.addEventListener('DOMContentLoaded', async () => {
    document.title = 'AuthorScrolls · Workspace demo';
    const banner = document.createElement('aside');
    banner.id = 'demo-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = '<span><b>Workspace demo</b> · ' + sample.label + ' · nothing you do here is saved</span>'
      + '<span class="demo-banner-links"><a href="app.html?demo=' + sample.other + '">' + sample.otherLabel + '</a>'
      + '<a class="demo-banner-cta" href="index.html#signup">Create a free account →</a></span>';
    document.body.appendChild(banner);
    document.body.classList.add('demo-mode');

    // Cloud actions are meaningless here; hide them rather than let them pretend.
    const saveBtn = document.getElementById('save-btn'); if (saveBtn) saveBtn.hidden = true;
    const account = document.querySelector('.header-menu summary[aria-label="Account and help"]');
    if (account && account.parentElement) account.parentElement.hidden = true;
    const state = document.getElementById('save-state');
    if (state) new MutationObserver(() => { if (state.textContent !== 'Demo · not saved') state.textContent = 'Demo · not saved'; }).observe(state, { childList: true, subtree: true, characterData: true });

    // Load the sample through the app's own upload path, so the demo is the real product.
    let text = '';
    try {
      const res = await realFetch(sample.file);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      text = await res.text();
      if (text.trim().length < 1000) throw new Error('sample too short');
    } catch (_) { banner.firstChild.textContent = 'The demo sample could not be loaded. Please try again.'; return; }
    for (let i = 0; i < 100 && !document.getElementById('lib-add-btn'); i++) await new Promise(r => setTimeout(r, 50));
    const add = document.getElementById('lib-add-btn'); if (!add) return;
    add.click();
    const input = document.getElementById('file-input');
    const files = new DataTransfer();
    files.items.add(new File([text], sample.name, { type: 'text/plain' }));
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const genre = document.getElementById('genre-select');
    if (genre) { genre.value = sample.genre; genre.dispatchEvent(new Event('change', { bubbles: true })); }
    document.getElementById('analyze-btn')?.click();
  });
})();
