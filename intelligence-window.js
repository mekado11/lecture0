// Story navigator and Writer's Room. No access to app.js's private variables.
const IntelligenceWindow = (() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let latest = null, mode = 'chapters', renderId = 0, answerId = 0, previousFocus = null, buildToken = 0;
  function invalidateContext() {
    answerId++;
    if($('workspace-context'))$('workspace-context').innerHTML='';
    if($('intel-answer'))$('intel-answer').textContent='';
    if($('intel-ask'))$('intel-ask').disabled=false;
  }
  function currentText() { return window.AuthorScrollsEditor?.getText() || ''; }
  // A coarse content signature, not object identity. analysisResult in app.js is
  // reassigned to a NEW OBJECT on nearly every reanalysis pass (every ~2s while
  // typing), so comparing `latest.analysis !== analysis` by reference almost never
  // hit the cache — the full pipeline (chapter parse + POV/character scan +
  // nonfiction evidence extraction) re-ran on every render even when nothing
  // the pipeline cares about had actually changed.
  function analysisSignature(analysis) {
    if (!analysis) return 'none';
    return (analysis.overall ?? '') + '|' + (analysis.genre?.primary ?? '') + '|' + (analysis.totalWords ?? '');
  }
  // Synchronous, cheap: returns the cached result or null. Never runs the pipeline.
  function cachedBuild() {
    const text = currentText();
    if (!text.trim()) return null;
    const analysis = window.AuthorScrollsEditor?.getAnalysis();
    const sig = analysisSignature(analysis);
    return (latest && latest.text === text && latest.sig === sig) ? latest : null;
  }
  function build() {
    const cached = cachedBuild();
    if (cached) return cached;
    const text = currentText();
    if (!text.trim()) return null;
    const analysis = window.AuthorScrollsEditor?.getAnalysis();
    latest = { ...IntelligencePipeline.build(text, analysis), analysis, sig: analysisSignature(analysis) };
    return latest;
  }
  // Building the pipeline on a large manuscript (chapter parsing + a POV/character
  // regex sweep per chapter + nonfiction evidence extraction per chapter) is
  // expensive enough to visibly freeze the tab if run synchronously inside a click
  // handler. Toggling the panel's `.open` class and then blocking the main thread
  // in the same tick means the browser can't paint the slide-in transition OR any
  // "Loading…" text until the computation finishes — from the outside that reads
  // as a hard hang, not a slow load. Deferring past a paint (rAF + setTimeout 0)
  // guarantees the loading state is on screen before the heavy work starts.
  function buildDeferred(onReady) {
    const cached = cachedBuild();
    if (cached) { onReady(cached); return; }
    const token = ++buildToken;
    const text = currentText();
    if (!text.trim()) { onReady(null); return; }
    const analysis = window.AuthorScrollsEditor?.getAnalysis();
    // Off the main thread when a worker is available (IntelligencePipeline.buildAsync
    // falls back to the synchronous build otherwise), so typing, scrolling and the
    // close button keep responding while a large manuscript is being read.
    IntelligencePipeline.buildAsync(text, analysis).then(result => {
      if (token !== buildToken) return; // superseded by a newer request — discard
      latest = { ...result, analysis, sig: analysisSignature(analysis) };
      onReady(latest);
    }).catch(() => { if (token === buildToken) onReady(build()); });
  }
  const empty = text => `<p class="workspace-nav-hint">${esc(text)}</p>`;
  const evidence = rows => rows.map(row => `<small>${esc(row.chapterId || '')} · ${esc(row.text || row.evidence || '')}</small>`).join('');
  let renderToken = 0;
  function render() {
    const host = $('intel-body');
    if (!host) return;
    const cached = cachedBuild();
    if (cached) { renderBody(cached, host); return; }
    host.innerHTML = empty('Reading your manuscript…');
    const token = ++renderToken;
    buildDeferred(data => {
      if (token !== renderToken) return; // a newer render request superseded this one
      if (!$('intel-window')?.classList.contains('open')) return; // panel closed while building
      if (!data) { host.innerHTML = empty('Open a manuscript to explore its story intelligence.'); return; }
      renderBody(data, host);
    });
  }
  function renderBody(data, host) {
    const i = data.intel;
    const nf=i.nonfiction;
    if(nf){
      const groups=[['Concepts',nf.concepts],['Attributed claims',nf.claims],['Personal evidence',nf.personalEvidence],['Reflection questions',nf.reflectionQuestions],['Actions',nf.actions],['Recommendations',nf.recommendations]];
      host.innerHTML='<p class="workspace-nav-hint">Nonfiction intelligence · Source-linked signals for your review, not fact-checking or a judgment of your voice.</p>'+
        groups.map(([label,rows])=>`<section><h4>${label} <small>${rows.length}</small></h4>${rows.slice(0,12).map(row=>`<article><b>${esc(row.name||row.text||row.evidence)}</b><small>${esc(row.chapterId)} · ${esc(row.source)}</small></article>`).join('')||empty('No explicit signals detected. This does not mean your book lacks them.')}</section>`).join('');
    }else{
    const sections = [
      ['Characters', i.characterLedger.characters.slice(0,12).map(c => `<article><b>${esc(c.name)}</b><small>${c.mentions} mentions · ${c.chapterIds.length} chapters</small>${c.facts.slice(0,2).map(f=>`<small>${esc(f.predicate)} ${esc(f.object)}</small>`).join('')}</article>`).join('')],
      ['Relationships', i.relationshipIntelligence.relationships.slice(0,10).map(r => `<article><b>${esc(r.characters.join(' ↔ '))}</b><small>${esc(r.types.join(', '))} · candidate for review</small>${evidence(r.evidence.slice(-2))}</article>`).join('')],
      ['Story facts', i.facts.slice(0,12).map(f=>`<article><b>${esc(f.subject)}</b> ${esc(f.predicate)} ${esc(f.object)}${evidence([f])}</article>`).join('')],
      ['Narrative threads', i.narrativeMomentum.arcs.slice(0,12).map(a=>`<article><b>${esc(a.label)}</b><small>${esc(a.pressure)} · ${a.recurrence} signals, not a prediction</small>${evidence(a.evidence.slice(-2))}</article>`).join('')],
      ['Timeline signals', i.timeline.events.slice(0,12).map(e=>`<article><b>${esc(e.cue)}</b><small>${esc(e.transition)}</small>${evidence([e])}</article>`).join('')],
      ['Continuity review', i.continuity.slice(0,10).map(c=>`<article><b>${esc(c.subject)}</b><small>${esc(c.reason)}. Review in context; not a confirmed error.</small>${evidence([c.first,c.second])}</article>`).join('')]
    ];
    host.innerHTML = `<div class="intel-summary">${[[i.characters.length,'Characters'],[i.facts.length,'Facts'],[i.narrativeMomentum.arcs.length,'Threads'],[i.timeline.events.length,'Time cues']].map(([n,l])=>`<div><b>${n}</b><span>${l}</span></div>`).join('')}</div>` +
      sections.map(([title,html])=>`<section><h4>${title}</h4>${html || empty('No evidence detected yet. This is not proof that your manuscript has none.')}</section>`).join('');
    }
    const grammar=data.analysis?.advisory?.grammar;
    if(grammar)host.innerHTML+=`<section><h4>Optional grammar advice</h4><p class="workspace-nav-hint">External suggestions. Deterministic scores are unchanged. Apply edits only when they serve your voice.</p>${grammar.slice(0,60).map(row=>`<article><b>${esc(row.text)}</b><small>${esc(row.message)}</small><small>${esc(row.suggestion)}</small></article>`).join('')||empty('No additional grammar suggestions returned.')}</section>`;
  }
  function renderContext(kind, id) {
    const data = build(), host = $('workspace-context');
    if (!data || !host) return;
    if (kind === 'chapter') {
      const c = data.parsed.chapters.find(c=>c.id===id);
      if (c) host.innerHTML = `<h4>${esc(c.title)}</h4><p>${c.wordCount} words</p><p>${esc((c.body||c.text).slice(0,420))}</p>`;
    } else if (kind === 'character') {
      const c = data.intel.characterLedger.characters.find(c=>c.id===id);
      if (c) host.innerHTML = `<h4>${esc(c.name)}</h4><p>${c.mentions} mentions · ${c.chapterIds.length} chapters</p>${evidence(c.facts.slice(0,8))}${c.relationships.map(r=>`<small>${esc(r.characters.join(' ↔ '))}: ${esc(r.types.join(', '))}</small>`).join('')}`;
    } else {
      const t = data.intel.narrativeMomentum.arcs.find(t=>t.id===id);
      if (t) host.innerHTML = `<h4>${esc(t.label)}</h4><p>${esc(t.pressure)} · ${t.recurrence} signals</p>${evidence(t.evidence)}`;
    }
  }
  function focusChapter(id) {
    const data = build(), chapter = data?.parsed.chapters.find(c=>c.id===id);
    if (!chapter) return;
    document.querySelector('.btab[data-p="annotated"]')?.click();
    const heading = [...$('ed-annotated').querySelectorAll('h1,h2,h3,p')].find(el=>(el.textContent||'').trim()===(chapter.heading||chapter.title).trim());
    heading?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    document.querySelectorAll('[data-chapter]').forEach(b=>b.classList.toggle('current',b.dataset.chapter===id));
    renderContext('chapter', id);
  }
  function compareVersion(version) {
    const older = ManuscriptParser.parse(version.text || ''), current = build()?.parsed;
    if (!current) return [];
    // Index comparisons are explicitly labelled, not semantic chapter matching.
    return Array.from({length:Math.max(older.chapters.length,current.chapters.length)},(_,index)=>{
      const a=older.chapters[index],b=current.chapters[index];
      return {title:b?.title||a?.title,status:!a?'added':!b?'removed':a.text===b.text?'unchanged':'changed',words:(b?.wordCount||0)-(a?.wordCount||0)};
    });
  }
  function showVersionPreview(manuscriptId, version) {
    const host = $('workspace-context');
    const changes = compareVersion(version).filter(c=>c.status!=='unchanged');
    host.innerHTML = `<h4>Revision snapshot</h4><p>${esc(version.reason||'Snapshot')} · ${version.wordCount||0} words</p><div class="version-diff"><b>${changes.length} chapter positions changed</b>${changes.slice(0,15).map(c=>`<div><span>${esc(c.title)}</span><small>${c.status} · ${c.words>0?'+':''}${c.words} words</small></div>`).join('')}</div><details><summary>Preview snapshot text</summary><div class="version-preview">${esc(version.text.slice(0,4000))}</div></details><button class="ws-restore">Restore this version</button><p class="version-status" role="status"></p>`;
    host.querySelector('.ws-restore').addEventListener('click', async e => {
      if (!confirm('Restore this version? Your current working text, including unsaved edits, will be saved as a safety snapshot first.')) return;
      const button=e.currentTarget; button.disabled=true;
      try {
        await window.AuthorScrollsEditor.restoreVersion(manuscriptId, version.id);
        latest=null; await renderNavigator('versions');
        host.innerHTML=empty('Version restored. Your previous working text is available in the safety snapshot.');
      } catch(error) {
        button.disabled=false;
        const status=host.querySelector('.version-status');
        if(status)status.textContent='Restore failed: '+error.message;
        else host.innerHTML=empty('Restore could not be completed: '+error.message);
      }
    });
  }
  // Review tab: where this manuscript is unlike ITSELF. Every figure is a comparison against
  // the author's own other chapters, so nothing here implies a standard we have not measured.
  function renderReview(data) {
    let report = null;
    try { report = typeof ChapterMetrics !== 'undefined' ? ChapterMetrics.analyze(data.parsed, data.analysis) : null; }
    catch (_) { report = null; }
    const footer = '<button class="ws-item" data-open-review><b>Manuscript health</b><small>Full scores and editorial detail</small></button>';
    // Context adjustments are book-wide, so they are reported whether or not any individual
    // chapter stands out.
    const context = renderGenreExpectations(data) + renderContextAdjustments(data);
    if (!report) return context + footer;
    if (!report.applicable) return empty(report.reason) + context + footer;
    if (!report.outliers.length && !report.lengthNotes.length) {
      return empty('No chapter stands out from the rest of your book on the measures we track. That is a good sign for consistency, not a verdict on quality.') + context + footer;
    }
    const rows = report.outliers.map(o => {
      const comparison = o.uniqueToChapter
        ? o.count + ' in this chapter, none anywhere else'
        : o.ratio + '× the rest of your book (' + o.value + ' vs ' + o.median + ' per 1,000 words)';
      return '<button class="ws-item" data-chapter="' + esc(o.chapterId) + '" data-severity="' + esc(o.severity) + '">'
        + '<b>' + esc(o.title) + '</b><small>' + esc(o.label) + ' · ' + esc(comparison) + '</small></button>';
    }).join('');
    const lengths = report.lengthNotes.map(n =>
      '<button class="ws-item" data-chapter="' + esc(n.chapterId) + '">'
      + '<b>' + esc(n.title) + '</b><small>Much ' + esc(n.direction) + ' than your other chapters ('
      + n.wordCount.toLocaleString() + ' vs ' + Math.round(n.median).toLocaleString() + ' words)</small></button>').join('');
    return '<p class="workspace-nav-hint">Compared across all ' + report.chapterCount
      + ' chapters of this book — not against any outside standard. Click a chapter to open it.</p>'
      + rows + lengths + context + footer;
  }

  // What a reader of this genre comes for, and what this manuscript actually does about it.
  // Each row carries how it was evidenced, because "measured from your chapters" and
  // "a machine guessed from word choice" deserve different amounts of the author's trust.
  const EVIDENCE_NOTE = { structural:'measured from your text', proxy:'word-choice signal only',
    ai:'needs the AI reader', author:'only you can answer' };
  function renderGenreExpectations(data) {
    const analysis = data.analysis;
    const primary = analysis && analysis.genre && analysis.genre.primary;
    if (!primary || typeof GenreExpectations === 'undefined') return '';
    let report;
    try {
      report = GenreExpectations.evaluate(primary, { parsed: data.parsed, intel: data.intel, analysis });
    } catch (_) { return ''; }
    if (!report || !report.applicable) return '';
    const rows = report.expectations.map(item =>
      '<div class="ws-note" data-status="' + esc(item.status) + '">'
      + '<b>' + esc(item.expectation) + '</b>'
      + '<small>' + esc(item.observation || item.why) + '</small>'
      + '<small class="ws-evidence">' + esc(EVIDENCE_NOTE[item.evidence] || item.evidence) + '</small>'
      + '</div>').join('');
    return '<p class="workspace-nav-hint ws-context-head"><b>' + esc(report.label) + ' — what readers come for</b><br>'
      + esc(report.promise) + '</p>' + rows;
  }

  // What the engine reweighted because of the kind of passage a finding sat in, and why.
  // A bare count would be an unfalsifiable claim, so this always shows the grouping and the
  // reason behind each adjustment.
  const MODE_WORDS = { dialogue:'dialogue', action:'action', reflection:'reflective',
    description:'descriptive', exposition:'explanatory', parallel:'parallel-structure',
    stance:'claim-qualifying', 'speech-tag':'speech-tag' };
  function renderContextAdjustments(data) {
    const context = data.analysis && data.analysis.proseContext;
    const issues = (data.analysis && data.analysis.issues) || [];
    if (!context || !context.applicable) return '';
    const adjusted = issues.filter(i => i && i._context);
    const mix = context.distribution || {};
    const mixText = Object.keys(mix)
      .filter(mode => mode !== 'mixed' && mix[mode] >= 5)
      .sort((a, b) => mix[b] - mix[a])
      .map(mode => mix[mode] + '% ' + (MODE_WORDS[mode] || mode))
      .join(' · ');

    if (!adjusted.length) {
      return !mixText ? '' : '<p class="workspace-nav-hint ws-context-head">Prose mix — ' + esc(mixText)
        + '. No finding needed reweighting for the kind of passage it was in.</p>';
    }
    // Group by what was done, to what, where — one row per distinct judgement.
    const groups = new Map();
    for (const issue of adjusted) {
      const key = issue._context.action + '|' + issue.type + '|' + issue._context.mode;
      const group = groups.get(key) || { count: 0, action: issue._context.action,
        type: issue.type, mode: issue._context.mode, reason: issue._context.reason };
      group.count++;
      groups.set(key, group);
    }
    const label = { 'sentence-length':'Long sentences', passive:'Passive voice', repetition:'Repetition',
      'show-tell':'Telling, not showing', adverb:'Adverbs', wordy:'Wordy phrases', cliche:'Clichés' };
    const rows = [...groups.values()].sort((a, b) => b.count - a.count).map(group =>
      '<div class="ws-note" data-action="' + esc(group.action) + '">'
      + '<b>' + esc(label[group.type] || group.type) + ' in ' + esc(MODE_WORDS[group.mode] || group.mode) + ' passages</b>'
      + '<small>' + group.count + (group.action === 'suppress' ? ' set aside · ' : ' raised · ')
      + esc(group.reason) + '</small></div>').join('');

    const setAside = adjusted.filter(i => i._context.action === 'suppress').length;
    const raised = adjusted.length - setAside;
    const summary = [setAside ? setAside + ' set aside as your register' : '',
      raised ? raised + ' raised as out of register' : ''].filter(Boolean).join(' · ');
    return '<p class="workspace-nav-hint ws-context-head">Prose mix' + (mixText ? ' — ' + esc(mixText) : '')
      + '.<br>' + esc(summary) + '. Set-aside findings stay visible in the editor but do not affect your scores.</p>'
      + rows;
  }

  async function renderNavigator(nextMode = mode) {
    mode=nextMode;
    const token=++renderId, host=$('workspace-nav-content');
    if (!host) return;
    document.querySelectorAll('.ws-nav').forEach(b=>b.classList.toggle('active',b.dataset.wsnav===mode));
    let data = cachedBuild();
    if (!data) {
      // Same freeze risk as render(): this fires on every edit-pause debounce, so
      // it must not block the main thread on a large manuscript either.
      host.innerHTML = empty('Reading your manuscript…');
      data = await new Promise(resolve => buildDeferred(resolve));
      if (token !== renderId) return; // a newer navigator request superseded this one
    }
    if (!data) { host.innerHTML=empty('Open a manuscript to build its navigator.'); return; }
    const nf=data.intel.nonfiction;
    document.querySelector('[data-wsnav="characters"]').textContent=nf?'Concepts':'Characters';
    document.querySelector('[data-wsnav="threads"]').textContent=nf?'Evidence':'Threads';
    const item=(attr,id,title,sub)=>`<button class="ws-item" ${attr}="${esc(id)}"><b>${esc(title)}</b><small>${esc(sub)}</small></button>`;
    if (mode==='versions') {
      const id=Storage._currentManuscriptId;
      if (!id) {host.innerHTML=empty('Save this manuscript to the cloud to enable revision snapshots.');return;}
      host.innerHTML=empty('Loading revision snapshots…');
      try {
        const versions=await Storage.getVersions(id);
        if(token!==renderId)return;
        host.innerHTML='<button class="ws-snapshot">Create snapshot</button>'+ (versions.map(v=>item('data-version',v.id,v.reason||'Snapshot',`${v.wordCount||0} words`)).join('')||empty('No snapshots yet.'));
        host.querySelector('.ws-snapshot').addEventListener('click',async e=>{
          e.currentTarget.disabled=true;
          try {await Storage.saveVersion(id,window.AuthorScrollsEditor.getAnalysis(),currentText(),'manual');await renderNavigator('versions');}
          catch(error){host.innerHTML=empty('Snapshot failed. Your working text is unchanged.');}
        });
        host.querySelectorAll('[data-version]').forEach(b=>b.addEventListener('click',async()=>{
          try {const version=await Storage.getVersion(id,b.dataset.version);if(version && token===renderId)showVersionPreview(id,version);}
          catch(error){if(token===renderId)$('workspace-context').innerHTML=empty('This snapshot could not be read completely. It has not been restored.');}
        }));
      } catch(error){if(token===renderId)host.innerHTML=empty('Snapshots could not be loaded. Check your connection.');}
      return;
    }
    if(nf&&(mode==='characters'||mode==='threads')){
      const rows=mode==='characters'?nf.concepts:[...nf.claims,...nf.personalEvidence];
      host.innerHTML=rows.map(c=>item('data-chapter',c.chapterId,c.name||c.evidence,c.chapterId+' · '+c.source)).join('')||empty('No explicit evidence detected. Review the source text.');
    }
    else if(mode==='characters')host.innerHTML=data.intel.characterLedger.characters.map(c=>item('data-character',c.id,c.name,`${c.chapterIds.length} chapters · ${c.threads.length} threads`)).join('')||empty('No recurring characters detected.');
    else if(mode==='threads')host.innerHTML=data.intel.narrativeMomentum.arcs.map(t=>item('data-thread',t.id,t.label,`${t.pressure} · ${t.recurrence} signals`)).join('')||empty('No narrative threads detected.');
    else if(mode==='review')host.innerHTML=renderReview(data);
    else host.innerHTML=data.parsed.chapters.map(c=>item('data-chapter',c.id,c.title,`${c.wordCount} words`)).join('');
    host.querySelectorAll('[data-chapter]').forEach(b=>b.addEventListener('click',()=>focusChapter(b.dataset.chapter)));
    host.querySelectorAll('[data-character]').forEach(b=>b.addEventListener('click',()=>renderContext('character',b.dataset.character)));
    host.querySelectorAll('[data-thread]').forEach(b=>b.addEventListener('click',()=>renderContext('thread',b.dataset.thread)));
    host.querySelector('[data-open-review]')?.addEventListener('click',()=>document.querySelector('.btab[data-p="detailed"]')?.click());
  }
  async function ask() {
    const question=$('intel-question')?.value.trim(),data=build(),button=$('intel-ask'),out=$('intel-answer');
    if (!question || !data || button.disabled) return;
    if (!confirm('Send relevant passages from this manuscript to our AI provider to answer this question?')) return;
    const token=++answerId;
    button.disabled=true;out.textContent='Reading relevant passages…';
    try {
      const result=await AIEngine.askManuscript(null,question,data.text,data.analysis);
      if(token!==answerId)return;
      if (currentText()!==data.text) {out.textContent='Your manuscript changed while answering. Ask again using the updated draft.';return;}
      // Display only quotations that can be located verbatim in the claimed chapter.
      const supported=(result.evidence||[]).filter(e=>e.quote&&data.parsed.chapters.some(c=>c.id===e.chapterId&&(c.body||c.text).includes(e.quote)));
      out.innerHTML=`<article class="intel-answer"><b>Writer’s Room</b><p>${esc(result.answer||result.raw||'No answer returned.')}</p>${supported.map(e=>`<small>${esc(e.chapterId)} · “${esc(e.quote)}”</small>`).join('')}<small>Interpretation, not a verdict. Verify against your manuscript.</small></article>`;
    } catch(error){if(token===answerId)out.textContent=error.message||'The answer could not be loaded.';}
    finally{if(token===answerId)button.disabled=false;}
  }
  // The panel is a floating card: closed = `hidden` attribute (so it cannot render
  // even if the stylesheet fails to load — the failure mode that produced a full-width
  // strip that could not be dismissed), open = `.open` for the scale/fade transition.
  let closeTimer = null;
  const isOpen = () => !!$('intel-window')?.classList.contains('open');
  const TRIGGERS = ['intel-open','workspace-intel-open'];
  function open() {
    const win = $('intel-window'); if (!win) return;
    if (isOpen()) { close(); return; } // the Intelligence button toggles
    clearTimeout(closeTimer);
    previousFocus = document.activeElement;
    win.hidden = false; win.removeAttribute('inert');
    void win.offsetWidth; // commit the un-hidden state before animating
    win.classList.add('open');
    render();
    $('intel-close')?.focus();
  }
  function close() {
    const win = $('intel-window'); if (!win || !isOpen()) return;
    win.classList.remove('open');
    win.setAttribute('inert', '');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (!isOpen()) win.hidden = true; }, 320);
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }
  // Popover behaviour, not a modal: no page-dimming scrim (it would also sit over the
  // header and swallow the Intelligence button's own toggle click). Any pointer press
  // outside the card or its trigger buttons closes it.
  function onOutsidePress(e) {
    if (!isOpen()) return;
    const t = e.target;
    if ($('intel-window')?.contains(t)) return;
    if (TRIGGERS.some(id => $(id)?.contains(t))) return;
    close();
  }
  function init() {
    const win = $('intel-window');
    if (win) { win.setAttribute('inert', ''); win.hidden = true; }
    document.addEventListener('pointerdown', onOutsidePress, true);
    TRIGGERS.forEach(id=>$(id)?.addEventListener('click',open));
    $('intel-close')?.addEventListener('click',close);
    $('intel-ask')?.addEventListener('click',ask);
    $('intel-question')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();ask();}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&isOpen())close();});
    document.querySelectorAll('.ws-nav').forEach(b=>b.addEventListener('click',()=>renderNavigator(b.dataset.wsnav)));
    let timer;
    // Refresh the navigator after typing settles. 2s (was 800ms): the chapter outline
    // rarely changes mid-sentence, and each refresh is a full pipeline pass.
    $('ed-annotated')?.addEventListener('input',()=>{invalidateContext();clearTimeout(timer);timer=setTimeout(()=>{latest=null;renderNavigator();},2000);});
    window.addEventListener('manuscript:changed',()=>{invalidateContext();latest=null;renderNavigator();if($('intel-window')?.classList.contains('open'))render();});
    renderNavigator();
  }
  // Shared access to the memoised book-level intelligence for other surfaces (the left-rail
  // genre contract). Synchronous when cached, otherwise built off-thread like the panel.
  // Callers that render before the editor DOM is populated (the left rail renders ahead of
  // the annotated page) pass their text and analysis explicitly rather than having them
  // read back from an editor that is still empty.
  function data(onReady, text, analysis) {
    if (text == null) {
      const cached = cachedBuild();
      if (cached) { onReady(cached); return; }
      buildDeferred(onReady);
      return;
    }
    const sig = analysisSignature(analysis);
    if (latest && latest.text === text && latest.sig === sig) { onReady(latest); return; }
    IntelligencePipeline.buildAsync(text, analysis).then(result => {
      latest = { ...result, analysis, sig };
      onReady(latest);
    }).catch(() => {
      try { latest = { ...IntelligencePipeline.build(text, analysis), analysis, sig }; onReady(latest); }
      catch (_) { onReady(null); }
    });
  }
  return {init,open,close,render,renderNavigator,data};
})();
document.addEventListener('DOMContentLoaded',IntelligenceWindow.init);
