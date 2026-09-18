// Story navigator and Writer's Room. No access to app.js's private variables.
const IntelligenceWindow = (() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let latest = null, mode = 'chapters', renderId = 0, answerId = 0, previousFocus = null;
  function invalidateContext() {
    answerId++;
    if($('workspace-context'))$('workspace-context').innerHTML='';
    if($('intel-answer'))$('intel-answer').textContent='';
    if($('intel-ask'))$('intel-ask').disabled=false;
  }
  function currentText() { return window.AuthorScrollsEditor?.getText() || ''; }
  function build() {
    const text = currentText();
    if (!text.trim()) return null;
    const analysis = window.AuthorScrollsEditor?.getAnalysis();
    if (!latest || latest.text !== text || latest.analysis !== analysis) {
      latest = { ...IntelligencePipeline.build(text, analysis), analysis };
    }
    return latest;
  }
  const empty = text => `<p class="workspace-nav-hint">${esc(text)}</p>`;
  const evidence = rows => rows.map(row => `<small>${esc(row.chapterId || '')} · ${esc(row.text || row.evidence || '')}</small>`).join('');
  function render() {
    const data = build(), host = $('intel-body');
    if (!host) return;
    if (!data) { host.innerHTML = empty('Open a manuscript to explore its story intelligence.'); return; }
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
  async function renderNavigator(nextMode = mode) {
    mode=nextMode;
    const token=++renderId, host=$('workspace-nav-content'),data=build();
    if (!host) return;
    document.querySelectorAll('.ws-nav').forEach(b=>b.classList.toggle('active',b.dataset.wsnav===mode));
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
    else if(mode==='review')host.innerHTML='<button class="ws-item" data-open-review><b>Manuscript health</b><small>Review the evidence and editorial suggestions</small></button>';
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
  function open() {previousFocus=document.activeElement;$('intel-window')?.classList.add('open');$('intel-window')?.removeAttribute('inert');render();$('intel-close')?.focus();}
  function close() {$('intel-window')?.classList.remove('open');$('intel-window')?.setAttribute('inert','');previousFocus?.focus();}
  function init() {
    $('intel-window')?.setAttribute('inert','');
    ['intel-open','workspace-intel-open'].forEach(id=>$(id)?.addEventListener('click',open));
    $('intel-close')?.addEventListener('click',close);
    $('intel-ask')?.addEventListener('click',ask);
    $('intel-question')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();ask();}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('intel-window')?.classList.contains('open'))close();});
    document.querySelectorAll('.ws-nav').forEach(b=>b.addEventListener('click',()=>renderNavigator(b.dataset.wsnav)));
    let timer;
    $('ed-annotated')?.addEventListener('input',()=>{invalidateContext();clearTimeout(timer);timer=setTimeout(()=>{latest=null;renderNavigator();},800);});
    window.addEventListener('manuscript:changed',()=>{invalidateContext();latest=null;renderNavigator();if($('intel-window')?.classList.contains('open'))render();});
    renderNavigator();
  }
  return {init,open,close,render,renderNavigator};
})();
document.addEventListener('DOMContentLoaded',IntelligenceWindow.init);
