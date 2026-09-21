// A small, independent shell. Preserve action IDs used by the editor.
(() => {
  'use strict';
  const header = document.querySelector('.topbar');
  if (!header) return;
  const ids = ['top-filename','top-status','genre-override','top-score','top-delta','top-wc',
    'intel-open','save-btn','new-btn','export-btn','optional-checks-btn','signout-btn'];
  const controls = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  header.classList.add('author-header');
  // One row: the manuscript's title leads; the reading context and the counts sit under it as
  // a meta line; the mark is the brand and Library is a quiet link beside it; one filled
  // action, one outlined, and the two menus as text. Depth comes from the header being a
  // plane over the page (one shadow), not from bevels.
  header.innerHTML = `
    <div class="author-brand"><a href="index.html" aria-label="AuthorScrolls home" title="AuthorScrolls"><img src="assets/mark.svg" alt="" width="30" height="30"></a><div data-slot="library"></div></div>
    <div class="author-document"><span class="document-eyebrow">YOUR MANUSCRIPT</span><div data-slot="title"></div>
      <div class="document-meta"><div class="manuscript-context"><label for="genre-override">Reading as</label><div data-slot="genre"></div><span class="metadata-dot">·</span><div data-slot="status"></div></div><span class="metadata-dot">·</span><div class="manuscript-metrics"><span><b data-slot="words"></b> words</span><span class="metadata-dot">·</span><span class="health-indicator" title="Deterministic editing signals, not a verdict on your voice. AI advice does not change this score.">Editing signals <b data-slot="score"></b><span data-slot="delta"></span></span></div></div>
    </div>
    <nav class="author-actions" aria-label="Manuscript actions">
      <span id="save-state" role="status" aria-live="polite">Cloud manuscript</span>
      <div data-slot="save"></div><div data-slot="intelligence"></div>
      <details class="header-menu"><summary>Tools <span aria-hidden="true">⌄</span></summary>
        <div class="header-menu-panel" id="document-actions"><span class="menu-label">MANUSCRIPT TOOLS</span></div>
      </details>
      <details class="header-menu"><summary aria-label="Account and help">Account <span aria-hidden="true">⌄</span></summary>
        <div class="header-menu-panel" id="account-actions"><span class="menu-label">YOUR WORKSPACE</span><a href="profile.html">Profile & preferences</a><a href="pricing.html">Plan & billing</a><a href="faq.html">Help & resources</a></div>
      </details>
    </nav>`;
  const place = (slot,id,label) => {
    const el=controls[id];if(!el)return;
    if(label)el.textContent=label;
    header.querySelector(`[data-slot="${slot}"]`).append(el);
  };
  place('library','new-btn','Library');
  place('title','top-filename');place('status','top-status');place('genre','genre-override');
  place('words','top-wc');place('score','top-score');place('delta','top-delta');
  place('save','save-btn','Save');place('intelligence','intel-open','✦ Intelligence');
  for (const [id,label] of [['export-btn','Export manuscript'],['optional-checks-btn','Optional AI & grammar checks']]) {
    if(controls[id]){controls[id].textContent=label;document.getElementById('document-actions').append(controls[id]);}
  }
  if(controls['signout-btn'])document.getElementById('account-actions').append(controls['signout-btn']);
  controls['genre-override']?.setAttribute('aria-label','Manuscript genre');
  const menus=[...header.querySelectorAll('details')];
  function closeMenus(except=null){menus.forEach(menu=>{if(menu!==except)menu.open=false;});}
  menus.forEach(menu=>{
    menu.addEventListener('toggle',()=>{if(menu.open)closeMenus(menu);});
    menu.addEventListener('click',event=>{if(event.target.closest('button,a'))menu.open=false;});
  });
  document.addEventListener('click',event=>{if(!event.target.closest('.header-menu'))closeMenus();});
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const open=menus.find(menu=>menu.open);
    if(open){closeMenus();open.querySelector('summary').focus();event.preventDefault();}
  });
  const filename=controls['top-filename'];
  new MutationObserver(()=>{filename.title=filename.textContent;}).observe(filename,{childList:true,subtree:true,characterData:true});
})();
