// AuthorScrolls Intelligence Window v2
// Renders evidence-backed intelligence according to manuscript type.
const IntelligenceWindow = (() => {
  let latest = null;
  let rebuildTimer = null;

  function esc(value) {
    const d = document.createElement('div');
    d.textContent = String(value ?? '');
    return d.innerHTML;
  }

  function currentText() {
    return (window.extractedText || document.getElementById('ed-annotated')?.innerText || '').trim();
  }

  function build() {
    const text = currentText();
    if (!text || typeof ManuscriptParser === 'undefined' || typeof BookIntelligence === 'undefined') return null;
    const parsed = ManuscriptParser.parse(text);
    let intel = BookIntelligence.build(parsed, typeof analysisResult !== 'undefined' ? analysisResult : null);
    if (typeof DocumentIntelligence !== 'undefined') intel = DocumentIntelligence.enrich(parsed, intel);
    const isNonfiction = intel.documentType?.type === 'nonfiction';
    if (!isNonfiction && typeof StoryIntelligence !== 'undefined') intel = StoryIntelligence.enrich(parsed, intel);
    if (!isNonfiction && typeof ContinuityIntelligence !== 'undefined') intel = ContinuityIntelligence.enrich(parsed, intel);
    if (!isNonfiction && typeof TimelineIntelligence !== 'undefined') intel = TimelineIntelligence.enrich(parsed, intel);
    if (!isNonfiction && typeof NarrativeMomentum !== 'undefined') intel = NarrativeMomentum.enrich(intel);
    if (!isNonfiction && typeof RelationshipIntelligence !== 'undefined') intel = RelationshipIntelligence.enrich(parsed, intel);
    if (!isNonfiction && typeof CharacterLedger !== 'undefined') intel = CharacterLedger.enrich(intel);
    latest = { text, parsed, intel };
    return latest;
  }

  function nonfictionHtml(i) {
    const n = i.nonfiction || {};
    return `
      <div class="intel-summary">
        <div><b>${n.concepts?.length || 0}</b><span>Concepts</span></div>
        <div><b>${n.claims?.length || 0}</b><span>Claims</span></div>
        <div><b>${n.actions?.length || 0}</b><span>Actions</span></div>
        <div><b>${n.reflectionQuestions?.length || 0}</b><span>Questions</span></div>
      </div>
      <section><h4>Author-defined concepts</h4>${(n.concepts || []).slice(0,10).map(x => `<article><b>${esc(x.name)}</b><small>${esc(x.chapterId)} · “${esc(x.evidence)}”</small></article>`).join('') || '<p class="intel-empty">No explicitly named concepts found yet.</p>'}</section>
      <section><h4>Claims to verify</h4><p class="intel-note">Statements with research or source language. AuthorScrolls surfaces them for review; it does not assume they are correct.</p>${(n.claims || []).slice(0,10).map(x => `<article><small>${esc(x.chapterId)}</small><p>${esc(x.evidence)}</p></article>`).join('') || '<p class="intel-empty">No attributed claims detected yet.</p>'}</section>
      <section><h4>Personal evidence</h4>${(n.personalEvidence || []).slice(0,8).map(x => `<article><small>${esc(x.chapterId)}</small><p>${esc(x.evidence)}</p></article>`).join('') || '<p class="intel-empty">No personal-experience evidence detected yet.</p>'}</section>
      <section><h4>Reader work</h4>${(n.actions || []).slice(0,6).map(x => `<article><b>Action</b><small>${esc(x.chapterId)}</small><p>${esc(x.text)}</p></article>`).join('')}${(n.reflectionQuestions || []).slice(0,8).map(x => `<article><b>Reflection</b><small>${esc(x.chapterId)}</small><p>${esc(x.text)}</p></article>`).join('') || '<p class="intel-empty">No explicit reader exercises detected yet.</p>'}</section>
    `;
  }

  function fictionHtml(i) {
    return `
      <div class="intel-summary"><div><b>${i.characters?.length||0}</b><span>Characters</span></div><div><b>${i.facts?.length||0}</b><span>Facts</span></div><div><b>${i.narrativeMomentum?.arcs?.length||0}</b><span>Threads</span></div><div><b>${i.timeline?.eventCount||0}</b><span>Time cues</span></div></div>
      <section><h4>Characters</h4>${(i.characterLedger?.characters||[]).slice(0,10).map(x=>`<article><b>${esc(x.name)}</b><small>${x.chapterIds.length} chapter${x.chapterIds.length===1?'':'s'} · ${x.mentions} mentions</small></article>`).join('')||'<p class="intel-empty">No recurring characters identified yet.</p>'}</section>
      <section><h4>Relationships</h4>${(i.relationshipIntelligence?.relationships||[]).slice(0,8).map(r=>`<article><b>${esc(r.characters.join(' ↔ '))}</b><span class="intel-pressure">${esc(r.types.join(', '))}</span>${(r.evidence||[]).slice(-1).map(e=>`<small>${esc(e.chapterId)} · “${esc(e.text)}”</small>`).join('')}</article>`).join('')||'<p class="intel-empty">No explicit relationships established yet.</p>'}</section>
      <section><h4>Story facts</h4>${(i.facts||[]).slice(0,8).map(f=>`<article><b>${esc(f.subject)}</b> ${esc(f.predicate)} ${esc(f.object)}<small>${esc(f.chapterId)} · “${esc(f.evidence)}”</small></article>`).join('')||'<p class="intel-empty">No stable facts extracted yet.</p>'}</section>
      <section><h4>Narrative momentum</h4><p class="intel-note">Open commitments and signals, not predictions about what you must write.</p>${(i.narrativeMomentum?.arcs||[]).slice(0,8).map(x=>`<article><b>${esc(x.label)}</b><span class="intel-pressure">${esc(x.pressure)}</span><small>${esc(x.firstChapterId)} → ${esc(x.lastChapterId)} · ${esc(x.status)}</small></article>`).join('')||'<p class="intel-empty">No narrative commitments detected yet.</p>'}</section>
      <section><h4>Continuity watch</h4>${(i.continuity||[]).slice(0,6).map(x=>`<article><b>${esc(x.subject)}</b> · ${esc(x.reason)}<small>${esc(x.first?.chapterId)} ↔ ${esc(x.second?.chapterId)}</small></article>`).join('')||'<p class="intel-empty">No continuity candidates found.</p>'}</section>
    `;
  }

  function updateLabels(i) {
    const nf = i.documentType?.type === 'nonfiction';
    const charTab = document.querySelector('.ws-nav[data-wsnav="characters"]');
    const threadTab = document.querySelector('.ws-nav[data-wsnav="threads"]');
    if (charTab) charTab.textContent = nf ? 'Concepts' : 'Characters';
    if (threadTab) threadTab.textContent = nf ? 'Evidence' : 'Threads';
    const title = document.querySelector('#intel-window .intel-head h3');
    const sub = document.querySelector('#intel-window .intel-sub');
    if (title) title.textContent = nf ? 'Your argument, understood.' : 'Your story, understood.';
    if (sub) sub.textContent = nf ? 'A living map of concepts, claims, personal evidence, and reader actions established by this manuscript.' : 'A living map of what your manuscript has established, what it is setting up, and what may need your attention.';
  }

  function render() {
    const data = build(), body = document.getElementById('intel-body');
    if (!body) return;
    if (!data) { body.innerHTML = '<p class="intel-empty">Open a manuscript to build its intelligence.</p>'; return; }
    updateLabels(data.intel);
    body.innerHTML = data.intel.documentType?.type === 'nonfiction' ? nonfictionHtml(data.intel) : fictionHtml(data.intel);
  }

  function focusChapter(id) {
    const data = latest || build();
    const ch = data?.parsed?.chapters?.find(x => x.id === id);
    if (!ch) return;
    const page = document.getElementById('ed-annotated');
    if (page) {
      const heading = [...page.querySelectorAll('h1,h2,h3,p,div')].find(x => (x.textContent||'').trim() === (ch.heading||ch.title||'').trim());
      heading?.scrollIntoView({ behavior:'smooth', block:'start' });
    }
    renderContext('chapter', id);
  }

  function renderContext(kind, id) {
    const data = latest || build(), host = document.getElementById('workspace-context');
    if (!data || !host) return;
    if (kind === 'chapter') {
      const ch = data.parsed.chapters.find(x => x.id === id);
      host.innerHTML = ch ? `<h4>${esc(ch.title||ch.heading||'Chapter')}</h4><p>${ch.wordCount||0} words</p><small>Chapter evidence is used when answering grounded questions.</small>` : '';
      return;
    }
    if (kind === 'concept') {
      const x = (data.intel.nonfiction?.concepts||[]).find(v => v.name === id);
      host.innerHTML = x ? `<h4>${esc(x.name)}</h4><p>${esc(x.evidence)}</p><small>${esc(x.chapterId)}</small>` : '';
      return;
    }
    if (kind === 'character') {
      const x = (data.intel.characterLedger?.characters||[]).find(v => v.id === id);
      host.innerHTML = x ? `<h4>${esc(x.name)}</h4><p>${x.mentions} mentions across ${x.chapterIds.length} chapters.</p>` : '';
    }
  }

  function renderNavigator(mode='chapters') {
    const host = document.getElementById('workspace-nav-content'), data = latest || build();
    if (!host) return;
    if (!data) { host.innerHTML='<p class="workspace-nav-hint">Open a manuscript to build its navigator.</p>'; return; }
    const i=data.intel, nf=i.documentType?.type==='nonfiction';
    updateLabels(i);
    if (mode==='characters') {
      host.innerHTML = nf ? (i.nonfiction?.concepts||[]).slice(0,30).map(x=>`<button class="ws-item" data-concept="${esc(x.name)}"><b>${esc(x.name)}</b><small>${esc(x.chapterId)}</small></button>`).join('') || '<p class="workspace-nav-hint">No author-defined concepts detected yet.</p>' : (i.characterLedger?.characters||[]).slice(0,30).map(x=>`<button class="ws-item" data-character="${esc(x.id)}"><b>${esc(x.name)}</b><small>${x.chapterIds.length} chapters</small></button>`).join('') || '<p class="workspace-nav-hint">No recurring characters yet.</p>';
    } else if (mode==='threads') {
      host.innerHTML = nf ? (i.nonfiction?.claims||[]).slice(0,25).map(x=>`<button class="ws-item" data-chapter="${esc(x.chapterId)}"><b>Claim to verify</b><small>${esc(x.evidence.slice(0,120))}</small></button>`).join('') || '<p class="workspace-nav-hint">No attributed claims detected yet.</p>' : (i.narrativeMomentum?.arcs||[]).slice(0,25).map(x=>`<button class="ws-item"><b>${esc(x.label)}</b><small>${esc(x.pressure)} · ${x.recurrence} signals</small></button>`).join('') || '<p class="workspace-nav-hint">No active threads yet.</p>';
    } else if (mode==='review') {
      host.innerHTML='<button class="ws-item" data-open-review="1"><b>Manuscript Health</b><small>Scores, diagnostics, and editorial review</small></button>';
    } else if (mode==='versions') {
      host.innerHTML='<p class="workspace-nav-hint">Version history is available from the Versions workspace tab.</p>';
    } else {
      host.innerHTML=(data.parsed.chapters||[]).map(x=>`<button class="ws-item" data-chapter="${esc(x.id)}"><b>${esc(x.title||x.heading||x.id)}</b><small>${x.wordCount||0} words</small></button>`).join('');
    }
    host.querySelectorAll('[data-chapter]').forEach(b=>b.addEventListener('click',()=>focusChapter(b.dataset.chapter)));
    host.querySelectorAll('[data-concept]').forEach(b=>b.addEventListener('click',()=>renderContext('concept',b.dataset.concept)));
    host.querySelectorAll('[data-character]').forEach(b=>b.addEventListener('click',()=>renderContext('character',b.dataset.character)));
    host.querySelector('[data-open-review]')?.addEventListener('click',()=>document.querySelector('.btab[data-p="ai"]')?.click());
  }

  async function ask() {
    const input=document.getElementById('intel-question'), out=document.getElementById('intel-answer'), q=input?.value.trim();
    if (!q || !out) return;
    const data=latest||build();
    if (!data || typeof AIEngine==='undefined') return;
    out.innerHTML='<p class="intel-empty">Reading across your manuscript…</p>';
    try {
      const r=await AIEngine.askManuscript(null,q,data.text,typeof analysisResult!=='undefined'?analysisResult:null);
      out.innerHTML=`<article class="intel-answer"><b>Writer’s Room</b><p>${esc(r.answer||r.raw||'No answer returned.')}</p>${(r.evidence||[]).map(e=>`<small>${esc(e.chapterId)} · “${esc(e.quote)}”</small>`).join('')}</article>`;
    } catch(e) { out.innerHTML=`<p class="intel-empty">${esc(e.message||'Unable to answer right now.')}</p>`; }
  }

  function open(){document.getElementById('intel-window')?.classList.add('open');render();}
  function close(){document.getElementById('intel-window')?.classList.remove('open');}

  function init() {
    document.getElementById('intel-open')?.addEventListener('click',open);
    document.getElementById('workspace-intel-open')?.addEventListener('click',open);
    document.getElementById('intel-close')?.addEventListener('click',close);
    document.getElementById('intel-ask')?.addEventListener('click',ask);
    document.getElementById('intel-question')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask();}});
    document.querySelectorAll('.ws-nav').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.ws-nav').forEach(x=>x.classList.toggle('active',x===b));renderNavigator(b.dataset.wsnav);}));
    const page=document.getElementById('ed-annotated');
    page?.addEventListener('input',()=>{clearTimeout(rebuildTimer);rebuildTimer=setTimeout(()=>{latest=null;renderNavigator(document.querySelector('.ws-nav.active')?.dataset.wsnav||'chapters');},750);});
    renderNavigator('chapters');
  }

  return { init, open, close, render, build, renderNavigator };
})();
document.addEventListener('DOMContentLoaded', IntelligenceWindow.init);
