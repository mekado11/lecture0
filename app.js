(function(){
let uploadedFile=null,extractedText='',analysisResult=null;
const $=id=>document.getElementById(id);
document.body.classList.add('lib-mode'); // Library is first view — allow scroll

// Web Worker for off-main-thread analysis
let _analyzerWorker=null;
let _analyzeVersion=0;
try{_analyzerWorker=new Worker('analyzer-worker.js')}catch(e){console.warn('Worker init failed, using main thread:',e.message)}
if(_analyzerWorker){
  _analyzerWorker.onmessage=function(e){
    if(e.data.type==='result'&&e.data.version===_analyzeVersion){
      _onAnalysisComplete(e.data.data);
    }
  };
}

// UPLOAD
const dz=$('drop-zone'),fi=$('file-input');
dz.addEventListener('click',()=>fi.click());
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag-over')});
dz.addEventListener('dragleave',()=>dz.classList.remove('drag-over'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag-over');if(e.dataTransfer.files.length)hf(e.dataTransfer.files[0])});
fi.addEventListener('change',e=>{if(e.target.files.length)hf(e.target.files[0])});
$('clear-file').addEventListener('click',()=>{uploadedFile=null;$('file-info').classList.add('hidden');$('analyze-btn').classList.add('hidden');fi.value=''});
function hf(f){const x=f.name.split('.').pop().toLowerCase();if(!['docx','pdf','txt'].includes(x)){alert('Upload .docx, .pdf, or .txt');return}if(f.size>10*1024*1024){alert('File too large (max 10MB)');return}uploadedFile=f;$('file-name').textContent=f.name+' ('+(f.size/1024).toFixed(1)+' KB)';$('file-info').classList.remove('hidden');$('analyze-btn').classList.remove('hidden');const gw=$('genre-select-wrap');if(gw)gw.classList.remove('hidden')}
async function ext(f){const x=f.name.split('.').pop().toLowerCase();if(x==='txt')return await f.text();if(x==='docx'){$('loader-text').textContent='Extracting Word...';return(await mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()})).value}if(x==='pdf'){$('loader-text').textContent='Extracting PDF...';pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';const p=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;let t='';for(let i=1;i<=p.numPages;i++){const c=await(await p.getPage(i)).getTextContent();t+=c.items.map(x=>x.str).join(' ')+'\n\n'}return t}}
$('analyze-btn').addEventListener('click',async()=>{
  if(!uploadedFile)return;
  $('analyze-btn').classList.add('hidden');
  $('upload-loading').classList.remove('hidden');
  try{
    $('loader-text').textContent='Extracting...';
    extractedText=await ext(uploadedFile);
    _smartScanDone=false;_batchFixDone=false;
    $('loader-text').textContent='Analyzing...';
    if(_analyzerWorker){
      _analyzeVersion++;
      const v=_analyzeVersion;
      analysisResult=await new Promise((resolve,reject)=>{
        const handler=function(e){
          if(e.data.version===v){
            _analyzerWorker.removeEventListener('message',handler);
            if(e.data.type==='result')resolve(e.data.data);
            else reject(new Error(e.data.message||'Analysis failed'));
          }
        };
        _analyzerWorker.addEventListener('message',handler);
        _analyzerWorker.postMessage({type:'analyze',text:extractedText,version:v});
      });
    }else{
      await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,50)));
      analysisResult=Analyzer.analyze(extractedText);
    }
    if(analysisResult.error){alert(analysisResult.error);$('upload-loading').classList.add('hidden');$('analyze-btn').classList.remove('hidden');return}
    // Save immediately to Firestore/localStorage so it appears in library
    trackSession('analyzing');
    // Direct save (don't wait for debounced autoSave)
    if(Storage.userId){
      try{
        const existing=await Storage.getManuscripts();
        const match=existing.find(m=>(m.fileName||'').toLowerCase()===uploadedFile.name.toLowerCase());
        if(match){
          Storage._currentManuscriptId=match.id;
          await Storage.updateManuscript(match.id,extractedText,analysisResult);
        }else{
          Storage._currentManuscriptId=await Storage.saveManuscript(uploadedFile.name,extractedText,analysisResult);
        }
      }catch(e){console.warn('Save error:',e.message)}
    }
    localStorage.setItem('ml_autosave',JSON.stringify({fileName:uploadedFile.name,text:extractedText,result:analysisResult,manuscriptId:Storage._currentManuscriptId,savedAt:new Date().toISOString()}));
    // Close modal, reset state, show library
    $('upload-modal')?.classList.add('hidden');
    $('upload-loading').classList.add('hidden');
    $('analyze-btn').classList.remove('hidden');
    fi.value='';$('file-info')?.classList.add('hidden');$('genre-select-wrap')?.classList.add('hidden');
    uploadedFile=null;extractedText='';analysisResult=null;
    renderLibrary();
  }catch(e){alert('Error: '+e.message);$('upload-loading').classList.add('hidden');$('analyze-btn').classList.remove('hidden')}
});

function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function escA(s){return(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function pn(t,i){return(t.substring(0,i).match(/\n\s*\n/g)||[]).length+1}
function sc(v){return v>=70?'var(--green)':v>=45?'var(--yellow)':'var(--red)'}
function scHex(v){return v>=70?'#5dba7d':v>=45?'#d4a855':'#c45c4a'}

// SEMI-CIRCLE GAUGE
function drawGauge(score){
  const c=$('gauge-canvas'),ctx=c.getContext('2d');
  const w=c.width,h=c.height,cx=w/2,cy=h-10,r=90;
  ctx.clearRect(0,0,w,h);
  // Background arc
  ctx.beginPath();ctx.arc(cx,cy,r,Math.PI,0);ctx.lineWidth=14;ctx.strokeStyle='#252220';ctx.lineCap='round';ctx.stroke();
  // Gradient arc
  const grad=ctx.createLinearGradient(cx-r,cy,cx+r,cy);
  grad.addColorStop(0,'#c45c4a');grad.addColorStop(.3,'#d4a855');grad.addColorStop(.6,'#5dba7d');grad.addColorStop(1,'#3bb8a0');
  ctx.beginPath();ctx.arc(cx,cy,r,Math.PI,Math.PI+(score/100)*Math.PI);ctx.lineWidth=14;ctx.strokeStyle=grad;ctx.lineCap='round';ctx.stroke();
  // Notches
  for(let i=0;i<=10;i++){const a=Math.PI+i/10*Math.PI;const x1=cx+Math.cos(a)*(r+10),y1=cy+Math.sin(a)*(r+10);const x2=cx+Math.cos(a)*(r+16),y2=cy+Math.sin(a)*(r+16);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineWidth=1.5;ctx.strokeStyle='#3a3330';ctx.stroke()}
  $('gauge-num').textContent=score;
}

// RING helper
function drawRing(canvas,score,size){
  const ctx=canvas.getContext('2d');const s=size||canvas.width;
  canvas.width=s*2;canvas.height=s*2;canvas.style.width=s+'px';canvas.style.height=s+'px';
  ctx.scale(2,2);const cx=s/2,cy=s/2,r=s/2-3;
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.lineWidth=3;ctx.strokeStyle='#252220';ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+(score/100)*Math.PI*2);ctx.lineWidth=3;ctx.strokeStyle=scHex(score);ctx.lineCap='round';ctx.stroke();
}

// Track state
let ignoredIssues=new Set();
let previousScore=null;
let autoSaveTimer=null;

// Undo/Redo stack for Replace & Fix operations
const _undoStack=[];
const _redoStack=[];
const MAX_UNDO=30;
function pushUndo(){
  const page=$('ed-annotated');
  if(!page)return;
  _undoStack.push({html:page.innerHTML,text:extractedText});
  if(_undoStack.length>MAX_UNDO)_undoStack.shift();
  _redoStack.length=0; // clear redo on new action
  _updateUndoBtn();
}
function undoLastFix(){
  if(_undoStack.length===0)return;
  const page=$('ed-annotated');
  if(!page)return;
  // Save current state to redo stack
  _redoStack.push({html:page.innerHTML,text:extractedText});
  const state=_undoStack.pop();
  page.innerHTML=state.html;
  extractedText=state.text;
  syncPreview();scheduleReanalyze();
  _updateUndoBtn();
}
function redoLastFix(){
  if(_redoStack.length===0)return;
  const page=$('ed-annotated');
  if(!page)return;
  // Save current state to undo stack
  _undoStack.push({html:page.innerHTML,text:extractedText});
  const state=_redoStack.pop();
  page.innerHTML=state.html;
  extractedText=state.text;
  syncPreview();scheduleReanalyze();
  _updateUndoBtn();
}
function _updateUndoBtn(){
  const btn=$('undo-fix-btn');
  if(btn)btn.style.display=_undoStack.length>0?'':'none';
}
// Keyboard shortcuts: Ctrl+Z=undo, Ctrl+R=redo, Ctrl+S=save
// Ctrl+X/C/V (cut/copy/paste) handled natively by contenteditable
// Use capture:true so we intercept before browser default actions
window.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&k==='z'&&!e.shiftKey){
    if(_undoStack.length>0){e.preventDefault();e.stopPropagation();undoLastFix()}
  }else if((e.ctrlKey||e.metaKey)&&k==='r'){
    e.preventDefault();e.stopImmediatePropagation(); // block reload
    if(_redoStack.length>0){redoLastFix()}
  }else if((e.ctrlKey||e.metaKey)&&k==='s'){
    e.preventDefault();e.stopPropagation();
    saveAnalysis();
  }
},true);

function renderAll(){
  const r=analysisResult;
  $('top-filename').textContent=uploadedFile.name.replace(/\.\w+$/,'');
  $('top-wc').textContent=r.totalWords.toLocaleString();
  $('top-status').textContent=r.genre.label+(r.genre.secondary?' / '+r.genre.secondary:'')+' \u00B7 '+r.manuscriptMode.label;
  drawGauge(r.overall);

  // Live score + delta tracking
  $('top-score').textContent=r.overall;
  const deltaEl=$('top-delta');
  if(previousScore!==null){
    const delta=r.overall-previousScore;
    if(delta>0){deltaEl.textContent='\u2191 +'+delta;deltaEl.className='delta up'}
    else if(delta<0){deltaEl.textContent='\u2193 '+delta;deltaEl.className='delta down'}
    else{deltaEl.textContent='\u2194 0';deltaEl.className='delta same'}
  }else{deltaEl.textContent='';deltaEl.className='delta'}
  previousScore=r.overall;

  // Apply manual genre override if selected (from upload or editor topbar)
  const genreLabels={scifi:'Science Fiction',fantasy:'Fantasy',romance:'Romance',thriller:'Thriller/Suspense',mystery:'Mystery/Crime',horror:'Horror/Paranormal',historical:'Historical Fiction',dystopian:'Dystopian',ya:'Young Adult',literary:'Literary Fiction',romantasy:'Romantasy',cozyMystery:'Cozy Mystery',adventure:'Adventure',western:'Western',memoir:'Memoir/Autobiography',selfHelp:'Self-Help',biography:'Biography',historyNF:'History',trueCrime:'True Crime',philosophy:'Philosophy/Religion'};
  const genreSelect=$('genre-select');
  const genreOverride=$('genre-override');
  const activeGenre=(genreOverride&&genreOverride.value)?genreOverride.value:(genreSelect&&genreSelect.value)?genreSelect.value:'';
  if(activeGenre){
    r.genre.primary=activeGenre;
    r.genre.label=genreLabels[activeGenre]||activeGenre;
  }
  // Sync the editor genre dropdown to current genre
  if(genreOverride){
    if(!genreOverride.value&&r.genre.primary){genreOverride.value=r.genre.primary}
  }

  renderSceneIntel(r);
  renderBookPreview(r);
  renderLeft(r);renderRight(r);renderAnnotated(extractedText,r.issues);renderDetailed(r);renderReader(r);renderBlurbs(r);renderVersions();
  // Auto-save
  autoSave();
  // Re-engagement tracking
  setTimeout(()=>{
    trackSession('analyzing');
    _resetReminderTier();
    setTimeout(maybePromptPush,8000);
  },1000);
  // Smart Scan — one-time AI scan for paid/admin users
  maybeRunSmartScan(r);
  // Batch Fix — one call per manuscript, cached 24h
  maybeBatchFix(r);
}

// AI-powered smart scan: runs once per manuscript for paid/admin users
// Overlays Claude's context-aware suggestions onto the regex-based issues
let _smartScanDone=false;
async function maybeRunSmartScan(r){
  if(_smartScanDone)return;
  // Only for admin or paid users
  const isPaid=window.__isAdmin||window.__userPlan==='starter'||window.__userPlan==='premium';
  if(!isPaid)return;
  if(!r.issues||r.issues.length===0)return;

  try{
    const suggestions=await AIEngine.smartScan(null,extractedText,r.issues);
    if(!suggestions||!suggestions.length)return;
    _smartScanDone=true;

    // Overlay AI suggestions onto existing issues
    const byIndex=new Map();
    suggestions.forEach(s=>{if(s.index!==undefined)byIndex.set(s.index,s)});

    r.issues.forEach(issue=>{
      const ai=byIndex.get(issue.index);
      if(ai&&ai.replacement){
        issue._aiSuggestion=ai.replacement;
        issue._aiReason=ai.reason||'';
        // Update the suggestion text to show the AI replacement
        issue.suggestion='Replace with: "'+ai.replacement+'"'+(ai.reason?' — '+ai.reason:'');
      }
    });

    // Re-render right panel only — do NOT call renderAnnotated here
    // because it replaces the entire editor DOM, destroying cursor/selection/undo
    renderRight(r);

    // Show a subtle toast
    const toast=document.createElement('div');
    toast.style.cssText='position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);background:#1e3320;border:1px solid #5dba7d;border-radius:8px;padding:.5rem 1rem;color:#5dba7d;font-size:.78rem;z-index:1001;font-family:Inter,sans-serif';
    toast.textContent='AI scan complete — suggestions enhanced';
    document.body.appendChild(toast);
    setTimeout(()=>toast.remove(),4000);
  }catch(e){console.warn('SmartScan failed:',e.message)}
}

// BATCH FIX — one API call per manuscript, cached 24h in localStorage
// Generates AI fix suggestions for all issues that lack local auto-fixes.
// Cache hit = instant (all tiers). Cache miss = one API call (paid only).
let _batchFixDone=false;
async function maybeBatchFix(r){
  if(_batchFixDone)return;
  if(!r.issues||r.issues.length===0)return;

  const _sh=AIEngine._shortHash.bind(AIEngine);

  // Fast path: hydrate from cache (works for ALL tiers, no API call)
  const cached=AIEngine.getCachedFixes(extractedText);
  if(cached&&Object.keys(cached.suggestions).length>0){
    _hydrateFromBatchCache(r,cached);
    _batchFixDone=true;
    return;
  }

  // Cache miss — only call API for paid users
  if(!_isPaid())return;

  try{
    const fp=Analyzer.extractStyleFingerprint(extractedText);
    const result=await AIEngine.batchFixSuggestions(extractedText,r.issues,fp);
    if(result&&Object.keys(result.suggestions).length>0){
      _hydrateFromBatchCache(r,result);
      _batchFixDone=true;
    }
  }catch(e){console.warn('Batch fix failed:',e.message)}
}

function _hydrateFromBatchCache(r,cached){
  const _sh=AIEngine._shortHash.bind(AIEngine);
  let hydrated=0;
  r.issues.forEach(issue=>{
    if(/Replace with:\s*".+?"/.test(issue.suggestion))return;
    const issueId=issue.type+':'+(issue.index||0)+':'+_sh(issue.text);
    const fix=cached.suggestions[issueId];
    if(fix&&fix.suggestion){
      issue.suggestion='Replace with: "'+fix.suggestion+'"'+(fix.explanation?' — '+fix.explanation:'');
      issue._batchFix=true;
      hydrated++;
    }
  });
  if(hydrated>0){
    renderRight(r);
  }
}

// AUTO-SAVE (Firestore + localStorage fallback)
function autoSave(){
  if(!analysisResult||!uploadedFile)return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer=setTimeout(async()=>{
    if(Storage.userId){
      try{
        if(!Storage._currentManuscriptId){
          // Before creating a new doc, check if one already exists for this filename
          const existing=await Storage.getManuscripts();
          const match=existing.find(m=>(m.fileName||'').toLowerCase()===uploadedFile.name.toLowerCase());
          if(match){
            Storage._currentManuscriptId=match.id;
            await Storage.updateManuscript(match.id,extractedText,analysisResult);
          }else{
            Storage._currentManuscriptId=await Storage.saveManuscript(uploadedFile.name,extractedText,analysisResult);
          }
          await Storage.saveVersion(Storage._currentManuscriptId,analysisResult);
        }else{
          await Storage.updateManuscript(Storage._currentManuscriptId,extractedText,analysisResult);
          await Storage.saveVersion(Storage._currentManuscriptId,analysisResult);
        }
      }catch(e){console.warn('Cloud save error:',e.message)}
    }
    localStorage.setItem('ml_autosave',JSON.stringify({fileName:uploadedFile.name,text:extractedText,result:analysisResult,manuscriptId:Storage._currentManuscriptId,savedAt:new Date().toISOString()}));
  },5000);
}
// Load autosave on startup (legacy — now integrated into library)
function loadAutoSave(){ return false; }

// GOAL PILLS BAR
function renderGoalBar(r){
  const bar=$('goal-bar');if(!bar)return;
  const rp=r.readerPerspective;
  const goals=[
    {id:'opening',icon:'\uD83D\uDEAB',label:'Improve Opening',score:rp.hookStrength,action:()=>showOpeningCoach()},
    {id:'clarity',icon:'\u2705',label:'Fix Clarity',score:rp.clarityScore,action:()=>{showDetail('clarity')}},
    {id:'dialogue',icon:'\uD83D\uDCAC',label:'Boost Dialogue',score:r.scores.dialogue,action:()=>{showDetail('dialogue')}},
    {id:'hook',icon:'\u26A1',label:'Strengthen Hook',score:rp.hookStrength,action:()=>showOpeningCoach()},
    {id:'pacing',icon:'\uD83C\uDFC3',label:'Fix Pacing',score:Math.round((r.scores.plot+r.scores.transitions)/2),action:()=>{showDetail('pacing')}},
    {id:'showTell',icon:'\uD83D\uDC41',label:'Show Don\'t Tell',score:r.scores.showTell,action:()=>{showDetail('showTell')}}
  ];
  // Only show goals where score < 70 (things that need work)
  const needsWork=goals.filter(g=>g.score<70).sort((a,b)=>a.score-b.score).slice(0,4);
  bar.innerHTML=needsWork.map(g=>'<button class="goal-pill" data-goal="'+g.id+'"><span class="gp-icon">'+g.icon+'</span> '+esc(g.label)+'</button>').join('');
  bar.querySelectorAll('.goal-pill').forEach((pill,i)=>{pill.addEventListener('click',()=>{needsWork[i].action();pill.classList.add('active')})});
}

// SCENE INTELLIGENCE
function renderSceneIntel(r){
  const el=$('scene-intel');if(!el)return;
  const rp=r.readerPerspective;
  // Detect scene type
  const dialogueRatio=r.dialogue.ratio;
  const actionDensity=r.pacing.segments.filter(s=>s.type==='action').length/Math.max(r.pacing.segments.length,1)*100;
  let sceneType='Exposition Heavy';
  if(dialogueRatio>30)sceneType='Dialogue Heavy';
  else if(actionDensity>40)sceneType='Action Sequence';
  else if(dialogueRatio>15&&actionDensity>20)sceneType='Balanced';
  else if(r.pacing.segments.filter(s=>s.type==='description').length>r.pacing.segments.length*0.5)sceneType='Descriptive';
  // Energy level
  const energy=r.writingQuality.engagementScore>70?'High':r.writingQuality.engagementScore>40?'Medium':'Low';
  // Tension
  const tensionQuarters=r.plot.quarters||[];
  const lastTension=tensionQuarters.length>0?tensionQuarters[tensionQuarters.length-1].tension:0;
  const prevTension=tensionQuarters.length>1?tensionQuarters[tensionQuarters.length-2].tension:0;
  const tensionDir=lastTension>prevTension?'Rising \uD83D\uDD3A':lastTension<prevTension?'Falling \uD83D\uDD3B':'Steady \u27A1';
  // Goals checklist
  const goalChecks=[
    {label:'Hook reader fast',done:rp.hookStrength>50},
    {label:'Build tension',done:r.plot.hasRisingAction},
    {label:'Emotional depth',done:rp.emotionalConnection>30},
    {label:'Fast pacing',done:!rp.pacingFeel.includes('Slow')},
    {label:'Strong dialogue',done:r.dialogue.count>0&&r.scores.dialogue>50}
  ];
  let h='';
  // Goals
  h+='<div class="si-section"><h4>\u2728 Goal</h4>';
  goalChecks.forEach(g=>{h+='<div class="si-check '+(g.done?'done':'todo')+'">'+esc(g.label)+'</div>'});
  h+='</div>';
  // Scene Intelligence
  h+='<div class="si-section"><h4>Scene Intelligence</h4>';
  h+='<div class="si-row"><span class="si-label">Scene Type:</span><span class="si-val">'+sceneType+'</span></div>';
  h+='<div class="si-row"><span class="si-label">Energy:</span><span class="si-val">'+energy+'</span></div>';
  h+='<div class="si-row"><span class="si-label">Tension:</span><span class="si-val">'+tensionDir+'</span></div>';
  h+='</div>';
  // Focus Mode + Simulate Reader
  h+='<div class="focus-toggle" id="focus-toggle">Focus Mode <span class="focus-badge off">OFF</span></div>';
  h+='<button class="sim-btn" id="sim-reader-btn">\uD83D\uDC41 Simulate Reader Experience</button>';
  el.innerHTML=h;
  // Focus mode: hides sidebars
  $('focus-toggle')?.addEventListener('click',()=>{
    const lp=$('left-panel'),rp2=$('right-panel'),pp=$('preview-panel'),gb=$('goal-bar'),badge=document.querySelector('.focus-badge');
    const isOn=badge.textContent==='ON';
    if(isOn){
      if(lp)lp.style.display='';if(rp2)rp2.style.display='';if(pp)pp.style.display='';if(gb)gb.style.display='';
      badge.textContent='OFF';badge.className='focus-badge off';
      document.getElementById('focus-exit-pill')?.remove();
    }else{
      if(lp)lp.style.display='none';if(rp2)rp2.style.display='none';if(pp)pp.style.display='none';if(gb)gb.style.display='none';
      badge.textContent='ON';badge.className='focus-badge';
      // Show a floating "Exit Focus Mode" pill
      let pill=document.getElementById('focus-exit-pill');
      if(!pill){pill=document.createElement('button');pill.id='focus-exit-pill';pill.textContent='Exit Focus';pill.style.cssText='position:fixed;bottom:.7rem;right:1rem;z-index:500;padding:.25rem .6rem;background:rgba(30,24,18,.85);border:1px solid rgba(200,149,108,.25);color:var(--gold);border-radius:5px;font-size:.65rem;cursor:pointer;font-family:Inter,sans-serif;opacity:.5;transition:opacity .2s';pill.title='Click to restore all panels';pill.onmouseenter=()=>pill.style.opacity='1';pill.onmouseleave=()=>pill.style.opacity='.5';document.body.appendChild(pill);pill.addEventListener('click',()=>$('focus-toggle')?.click())}
    }
  });
  // Simulate reader: switch to reader view
  $('sim-reader-btn')?.addEventListener('click',()=>{
    document.querySelectorAll('.btab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.ms-page').forEach(p=>p.classList.remove('active'));
    const readerBtn=document.querySelector('.btab[data-p="reader"]');
    if(readerBtn)readerBtn.classList.add('active');
    $('ed-reader')?.classList.add('active');
  });
}

// REPLACE & FIX: select the highlight text and use execCommand to replace
// This works with native undo (Ctrl+Z) and properly updates the DOM
function replaceAndFix(hlElement){
  const type=hlElement.dataset.t;
  const suggestion=hlElement.dataset.s||'';
  const original=hlElement.textContent;
  const sentContext=hlElement.parentNode?.textContent||'';
  const result=Fixer.computeReplacement(type,original,suggestion,sentContext);
  let replacement=result.replacement;
  let mode=result.mode;

  // Apply: select the highlight's text range, then use insertText to replace
  // This works with native undo and properly updates contenteditable
  if(replacement===original){
    // Can't auto-fix — select text for user to edit manually
    $('tip').classList.remove('on');
    const sel=window.getSelection();
    const range=document.createRange();
    range.selectNodeContents(hlElement);
    sel.removeAllRanges();sel.addRange(range);
    hlElement.focus();
    return;
  }

  // Save undo state after computing replacement, before applying
  pushUndo();

  // Select the highlight span's content
  const sel=window.getSelection();
  const range=document.createRange();
  range.selectNodeContents(hlElement);
  sel.removeAllRanges();sel.addRange(range);

  // Use insertText — integrates with native undo, updates DOM cleanly
  const newText=(mode==='remove')?'':replacement;
  document.execCommand('insertText',false,newText);

  $('tip').classList.remove('on');
  // Auto-reanalyze will pick up the change and update scores/highlights
  scheduleReanalyze();
  syncPreview();
}

// AUTO RE-ANALYZE: debounced — runs automatically after any edit
// CRITICAL: only updates scores/sidebar/issue panel — NEVER re-renders the editor content
// This prevents cursor loss, selection wipe, and DOM corruption during editing
let _reanalyzeTimer=null;
let _issuesResolved=0;
let _initialIssueCount=null;

// Extract text from contenteditable preserving paragraph/heading structure as \n\n
function extractTextFromEditor(){
  const page=$('ed-annotated');
  if(!page)return extractedText||'';
  const parts=[];
  for(const child of page.children){
    const tag=child.tagName;
    const txt=(child.textContent||'').trim();
    if(!txt)continue;
    parts.push(txt);
  }
  return parts.join('\n\n');
}

function _onAnalysisComplete(newResult){
    if(newResult.error)return;
    if(_initialIssueCount===null)_initialIssueCount=newResult.issues.length;
    const prevCount=analysisResult?analysisResult.issues.length:_initialIssueCount;
    const newCount=newResult.issues.length;
    if(newCount<prevCount)_issuesResolved+=(prevCount-newCount);
    analysisResult=newResult;
    _batchFixDone=false;_smartScanDone=false;
    diffHighlights(newResult.issues);
    updateScoresOnly(newResult);
    document.querySelectorAll('.rsc,.rp-detail,.gauge-wrap').forEach(el=>el.classList.remove('scores-pending'));
}

function scheduleReanalyze(){
  clearTimeout(_reanalyzeTimer);
  _reanalyzeTimer=setTimeout(()=>{
    const page=$('ed-annotated');
    if(!page)return;
    extractedText=extractTextFromEditor();
    document.querySelectorAll('.rsc,.gauge-wrap').forEach(el=>el.classList.add('scores-pending'));
    if(_analyzerWorker){
      _analyzeVersion++;
      _analyzerWorker.postMessage({type:'analyze',text:extractedText,version:_analyzeVersion});
    }else{
      _onAnalysisComplete(Analyzer.analyze(extractedText));
    }
  },2000);
}

// Surgical highlight diff: remove highlights for resolved issues without touching editor content
// Only REMOVES resolved highlights (safe: unwrap span → text node). Never ADDS new ones mid-edit.
function diffHighlights(newIssues){
  const page=$('ed-annotated');
  if(!page)return;

  // Build lookup of current issues by key (type + first 60 chars of text)
  const activeKeys=new Set();
  for(const iss of newIssues){
    activeKeys.add(iss.type+'|'+iss.text.substring(0,60));
  }

  // Walk all highlight spans in the editor
  const highlights=page.querySelectorAll('.hl:not(.off)');
  for(const hl of highlights){
    const key=hl.dataset.t+'|'+(hl.dataset.q||'');
    // Also check if user edited the text inside the highlight (content no longer matches data-q)
    const currentText=hl.textContent.substring(0,60);
    const originalQ=hl.dataset.q||'';
    const wasEdited=currentText!==originalQ&&originalQ.length>0;
    if(!activeKeys.has(key)||wasEdited){
      // This issue was resolved — unwrap the span to a plain text node
      // Save cursor position
      const sel=window.getSelection();
      const hadFocus=document.activeElement===page;
      let savedRange=null;
      if(hadFocus&&sel.rangeCount>0){
        savedRange=sel.getRangeAt(0).cloneRange();
      }

      // Unwrap: replace span with its text content
      const text=document.createTextNode(hl.textContent);
      hl.parentNode.replaceChild(text,hl);
      // Merge adjacent text nodes to keep DOM clean
      text.parentNode.normalize();

      // Restore cursor if we had focus
      if(hadFocus&&savedRange){
        try{sel.removeAllRanges();sel.addRange(savedRange)}catch(e){}
      }
    }
  }
}

// Lightweight update: refresh scores, sidebar, issue panel without touching the editor
function updateScoresOnly(r){
  // Topbar
  $('top-wc').textContent=r.totalWords.toLocaleString();
  $('top-status').textContent=r.genre.label+(r.genre.secondary?' / '+r.genre.secondary:'')+' \u00B7 '+r.manuscriptMode.label;
  drawGauge(r.overall);
  $('top-score').textContent=r.overall;

  // Score delta
  const deltaEl=$('top-delta');
  if(previousScore!==null){
    const delta=r.overall-previousScore;
    if(delta>0){deltaEl.textContent='\u2191 +'+delta;deltaEl.className='delta up'}
    else if(delta<0){deltaEl.textContent='\u2193 '+delta;deltaEl.className='delta down'}
    else{deltaEl.textContent='';deltaEl.className='delta'}
  }
  previousScore=r.overall;

  // Sidebar scores + issue panel
  renderLeft(r);
  renderRight(r);
  // Chapter nav rebuild
  buildChapterNav();
  // Preview sync
  syncPreview();
  // Auto-save
  autoSave();
}

// LEFT SIDEBAR
function renderLeft(r){
  const rp=r.readerPerspective;
  const cards=[
    {name:'Engagement Score',score:rp.engagementScore,sub:'How hooked will readers be?',action:'+ Improve Opening',bar:true},
    {name:'Hook Strength',score:rp.hookStrength,sub:(r.issueCounts.passive+r.issueCounts.adverb)+' Issues',action:'+ Improve Opening',bar:false},
    {name:'Clarity',score:rp.clarityScore,sub:'Weak transitions',bar:true},
    {name:'Pacing',score:Math.round((r.scores.plot+r.scores.transitions)/2),sub:rp.pacingFeel.split(' - ')[0],badge:rp.pacingFeel.includes('Rushed')?'Rushed':rp.pacingFeel.includes('Slow')?'Slow':'Good'},
    {name:'DNF Risk',score:r.dnfAnalysis?r.dnfAnalysis.dnf_risk:rp.dnfRisk,sub:r.dnfAnalysis?r.dnfAnalysis.risk_band:rp.dnfRisk>60?'At Risk':rp.dnfRisk>30?'Moderate':'Safe',inv:true}
  ];
  $('lp-cards').innerHTML=cards.map(c=>{
    const col=c.inv?scHex(100-c.score):scHex(c.score);
    const id='lpc-'+Math.random().toString(36).substr(2,5);
    return '<div class="lp-card"><div class="lp-card-head"><div class="lpc-ring"><canvas id="'+id+'" width="40" height="40"></canvas><span class="lpc-num" style="color:'+col+'">'+c.score+'</span></div><div class="lpc-info"><div class="lpc-name">'+c.name+'</div><div class="lpc-sub">'+esc(c.sub)+'</div></div>'+(c.badge?'<span class="rsc-badge" style="background:var(--surface2);color:'+col+'">'+c.badge+'</span>':'<span class="lpc-score" style="color:'+col+'">'+c.score+'</span>')+'</div>'+(c.bar?'<div class="lpc-bar"><div class="lpc-bar-fill" style="width:'+c.score+'%;background:'+col+'"></div></div>':'')+(c.action?'<span class="lpc-action">'+c.action+'</span>':'')+'</div>';
  }).join('');
  // Draw rings
  cards.forEach((c,i)=>{const cvs=document.querySelectorAll('.lpc-ring canvas')[i];if(cvs)drawRing(cvs,c.inv?100-c.score:c.score,40)});
  // Improve Opening buttons - open coaching panel
  document.querySelectorAll('.lpc-action').forEach(btn=>{btn.addEventListener('click',()=>{
    showOpeningCoach();
  })});
}

// RIGHT SIDEBAR
function renderRight(r){
  const stIssues=r.showTell&&r.showTell.issues?r.showTell.issues.length:(r.issueCounts?r.issueCounts['show-tell']:0)||0;
  const cpIssues=r.issues?r.issues.length:0;
  // Count high-severity issues per type for honest issue display
  const highSev=type=>r.issues.filter(i=>i.type===type&&i.severity==='high').length;
  const countType=type=>r.issueCounts?r.issueCounts[type]||0:0;
  const cats=[
    {k:'plot',name:'Plot Structure',score:r.scores.plot,issues:countType('pov'),weight:'10%'},
    {k:'clarity',name:'Clarity',score:r.readerPerspective.clarityScore,issues:countType('passive'),weight:'10%'},
    {k:'pacing',name:'Pacing',score:Math.round((r.scores.plot+r.scores.transitions)/2),issues:countType('sentence-length'),badge:r.readerPerspective.pacingFeel.includes('Rushed')?'Rushed':null,weight:'8%'},
    {k:'hook',name:'Hook Strength',score:r.readerPerspective.hookStrength,issues:countType('adverb'),weight:'7%'},
    {k:'style',name:'Style & Voice',score:r.scores.style,issues:countType('weak-verb'),weight:'8%'},
    {k:'dialogue',name:'Dialogue',score:r.scores.dialogue,issues:countType('dialogue'),weight:'7%'},
    {k:'showTell',name:'Show vs Tell',score:r.scores.showTell,issues:stIssues,weight:'8%'},
    {k:'copy',name:'Copy Editing',score:r.scores.copy,issues:cpIssues,weight:'12%'}
  ];
  const container=$('rp-scores');
  container.innerHTML=cats.map(c=>{
    const col=scHex(c.score);const id='rsc-'+Math.random().toString(36).substr(2,5);
    const issueLabel=c.issues>0?c.issues+' issue'+(c.issues===1?'':'s'):c.score>=80?'Clean':'—';
    const issueColor=c.issues>10?'var(--red)':c.issues>3?'var(--yellow)':'var(--green)';
    return '<div class="rsc" data-cat="'+c.k+'"><div class="rsc-ring"><canvas id="'+id+'" width="34" height="34"></canvas><span class="rsc-n" style="color:'+col+'">'+c.score+'</span></div><div class="rsc-info"><div class="rsc-name">'+c.name+'<span style="font-size:.55rem;color:var(--dim);margin-left:4px">'+c.weight+'</span></div><div class="rsc-sub" style="color:'+issueColor+'">'+issueLabel+'</div></div>'+(c.badge?'<span class="rsc-badge" style="background:var(--surface2);color:'+col+'">'+c.badge+'</span>':'<span class="rsc-val" style="color:'+col+'">'+c.score+'</span>')+'</div>';
  }).join('');
  // Draw rings
  cats.forEach((c,i)=>{const cvs=container.querySelectorAll('.rsc-ring canvas')[i];if(cvs)drawRing(cvs,c.score,34)});
  // Click handlers
  container.querySelectorAll('.rsc').forEach(el=>{el.addEventListener('click',()=>{container.querySelectorAll('.rsc').forEach(e=>e.classList.remove('active'));el.classList.add('active');showDetail(el.dataset.cat)})});
  // Show first by default
  if(cats.length)showDetail(cats[0].k);
}

// WHY explanations per issue type — helps writers understand the impact, not just the rule
const _issueWhy={
  passive:'Passive voice distances the reader. Active voice creates immediacy and clarity.',
  adverb:'Adverbs often signal a weak verb. A stronger verb eliminates the need for modification.',
  cliche:'Cliches signal unoriginal writing to agents and editors. They pull readers out of your unique voice.',
  'weak-verb':'Generic verbs ("made", "went", "got") miss an opportunity to create vivid, specific imagery.',
  'show-tell':'Telling emotions ("she felt sad") keeps readers at arm\'s length. Showing through action and sensory detail creates empathy.',
  wordy:'Extra words slow pacing and dilute impact. Tight prose holds attention.',
  repetition:'Repeated words in close proximity suggest limited vocabulary and can feel monotonous to readers.',
  'sentence-length':'Long sentences tax working memory. Varying length creates rhythm and controls pacing.',
  'confused-word':'Wrong word — sounds right but means something different. These slip past spell-check.'
};

const _REWRITE_TYPES = new Set(['passive','adverb','weak-verb','show-tell','wordy','cliche']);

function _isPaid() {
  return window.__isAdmin || window.__userPlan === 'starter' || window.__userPlan === 'premium';
}

function _cardBtnsHtml(card) {
  const hasFix = card.dataset.hasFix === '1';
  const type = card.dataset.issueType || '';
  const canAIFix = _REWRITE_TYPES.has(type) && _isPaid();
  const fixHtml = hasFix
    ? '<button class="tip-fix rpd-fix-btn">Apply Fix</button>'
    : canAIFix
      ? '<button class="rpd-fix-btn rpd-ai-fix-btn">Fix</button>'
      : '<button class="tip-fix rpd-fix-btn" style="background:var(--surface2);color:var(--text)">Go to Text</button>';
  const rwHtml = (hasFix && canAIFix) ? '<button class="rpd-rewrite-btn">✶ Rewrite</button>' : '';
  return fixHtml + '<button class="tip-ign rpd-ign-btn">Dismiss</button>' + rwHtml;
}

function wireCardBtns(card, btns) {
  btns.querySelector('.rpd-fix-btn')?.addEventListener('click', () => {
    const page = $('ed-annotated');
    const q = card.dataset.issueText.substring(0,60).replace(/"/g,'&quot;');
    const hl = page?.querySelector('.hl[data-q="'+q+'"]');
    if (!hl) return;
    document.querySelectorAll('.btab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.ms-page').forEach(p=>p.classList.remove('active'));
    document.querySelector('.btab[data-p="annotated"]')?.classList.add('active');
    $('ed-annotated')?.classList.add('active');
    if (card.dataset.hasFix === '1') {
      replaceAndFix(hl);
      card.style.opacity = '.3'; card.style.pointerEvents = 'none';
    } else {
      hl.scrollIntoView({behavior:'smooth',block:'center'});
      setTimeout(()=>{const sel=window.getSelection();const r=document.createRange();r.selectNodeContents(hl);sel.removeAllRanges();sel.addRange(r)},400);
    }
  });
  btns.querySelector('.tip-ign')?.addEventListener('click', () => {
    const page = $('ed-annotated');
    const q = card.dataset.issueText.substring(0,60).replace(/"/g,'&quot;');
    const hl = page?.querySelector('.hl[data-q="'+q+'"]');
    if (hl) hl.classList.add('off');
    card.remove();
  });
  btns.querySelector('.rpd-rewrite-btn')?.addEventListener('click', () => doRewrite(card));
  btns.querySelector('.rpd-ai-fix-btn')?.addEventListener('click', () => doRewrite(card));
}

async function doRewrite(card) {
  const issueText = card.dataset.issueText;
  const issueType = card.dataset.issueType;
  const issueIndex = parseInt(card.dataset.issueIndex || '0', 10);
  const btns = card.querySelector('.rpd-btns');

  let sentence = issueText, context = '';
  if (extractedText) {
    const sentStart = Math.max(0, extractedText.lastIndexOf('.', issueIndex - 1) + 1);
    const sentEnd = extractedText.indexOf('.', issueIndex + issueText.length);
    if (sentEnd > sentStart) sentence = extractedText.slice(sentStart, sentEnd + 1).trim();
    const lo = Math.max(0, issueIndex - 150);
    const hi = Math.min(extractedText.length, issueIndex + issueText.length + 150);
    context = extractedText.slice(lo, hi);
  }

  btns.innerHTML = '<span class="rpd-rewrite-loading"><span class="rpd-spin"></span>Rewriting…</span>';

  try {
    const fp = Analyzer.extractStyleFingerprint(extractedText);
    const res = await AIEngine.rewriteSentence(sentence, issueType, context, fp);
    const rewrite = res?.rewrite?.trim() || '';
    if (!rewrite) throw new Error('Empty response — try again');

    btns.innerHTML =
      '<div class="rpd-rewrite-result">' +
        '<div class="rpd-rewrite-label">✦ Suggested fix</div>' +
        '<div class="rpd-rewrite-text">' + esc(rewrite) + '</div>' +
        '<div class="rpd-rewrite-actions">' +
          '<button class="rpd-use-btn">Apply</button>' +
          '<button class="rpd-retry-btn">Try Again</button>' +
          '<button class="rpd-skip-btn">Skip</button>' +
        '</div>' +
      '</div>';

    btns.querySelector('.rpd-use-btn').addEventListener('click', () => {
      const page = $('ed-annotated');
      const q = issueText.substring(0,60).replace(/"/g,'&quot;');
      const hl = page?.querySelector('.hl[data-q="'+q+'"]');
      document.querySelectorAll('.btab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.ms-page').forEach(p=>p.classList.remove('active'));
      document.querySelector('.btab[data-p="annotated"]')?.classList.add('active');
      $('ed-annotated')?.classList.add('active');
      if (hl) {
        pushUndo();
        const sel = window.getSelection(); const range = document.createRange();
        range.selectNodeContents(hl); sel.removeAllRanges(); sel.addRange(range);
        document.execCommand('insertText', false, rewrite);
        extractedText = extractTextFromEditor();
        scheduleReanalyze();
      }
      card.style.opacity = '.3'; card.style.pointerEvents = 'none';
    });

    btns.querySelector('.rpd-retry-btn').addEventListener('click', () => doRewrite(card));

    btns.querySelector('.rpd-skip-btn').addEventListener('click', () => {
      btns.innerHTML = _cardBtnsHtml(card);
      wireCardBtns(card, btns);
    });

  } catch(err) {
    btns.innerHTML =
      '<div class="rpd-rewrite-error">⚠ ' + esc(err.message) + '</div>' +
      '<div class="rpd-rewrite-actions">' +
        '<button class="rpd-retry-btn">Try Again</button>' +
        '<button class="rpd-skip-btn">Skip</button>' +
      '</div>';
    btns.querySelector('.rpd-retry-btn').addEventListener('click', () => doRewrite(card));
    btns.querySelector('.rpd-skip-btn').addEventListener('click', () => {
      btns.innerHTML = _cardBtnsHtml(card);
      wireCardBtns(card, btns);
    });
  }
}

function showDetail(cat){
  const r=analysisResult;const d=$('rp-detail');
  const typeMap={plot:'pov',clarity:'passive',pacing:'sentence-length',hook:'adverb',style:'weak-verb',dialogue:'dialogue',showTell:'show-tell',copy:null};
  const titles={plot:'Plot Structure',clarity:'Clarity',pacing:'Pacing',hook:'Hook Strength',style:'Style & Voice',dialogue:'Dialogue',showTell:'Show vs Tell',copy:'Copy Editing'};
  const typeLabels={passive:'Passive Voice',adverb:'Adverb Overuse',cliche:'Cliche','weak-verb':'Weak Verb','show-tell':'Show vs Tell',wordy:'Wordy Phrase',repetition:'Repetition','sentence-length':'Long Sentence','confused-word':'Confused Word'};
  const t=typeMap[cat];

  // Sort by severity: high first, then medium, then low
  const sevOrder={high:0,medium:1,low:2};
  let issues=t?r.issues.filter(i=>i.type===t):r.issues.slice();
  issues.sort((a,b)=>(sevOrder[a.severity]||2)-(sevOrder[b.severity]||2));
  const totalForCat=issues.length;
  const shown=issues.slice(0,8);

  // Determine if suggestion has a concrete replacement
  function hasConcreteFix(iss){
    return !!iss.suggestion.match(/Replace with:\s*".+?"/)||!!iss.suggestion.match(/Try:\s*.+/i)||iss.type==='adverb'||iss.type==='wordy'||iss.type==='cliche';
  }

  // Progress indicator
  const progressHtml=_issuesResolved>0?'<div style="padding:.3rem .7rem;font-size:.7rem;color:var(--green);background:rgba(93,186,125,.08);border-radius:4px;margin-bottom:.5rem">'+_issuesResolved+' issue'+ (_issuesResolved===1?'':'s')+' resolved this session</div>':'';

  d.innerHTML=progressHtml+
    '<div class="rpd-title"><span style="font-size:1.1rem">'+titles[cat]+'</span><span style="font-size:.7rem;color:var(--muted)">'+totalForCat+' issue'+(totalForCat===1?'':'s')+'</span></div>'+
    (_issueWhy[t]?'<div style="padding:.3rem .5rem;font-size:.7rem;color:var(--muted);line-height:1.5;margin-bottom:.4rem;border-left:2px solid var(--gold-d)">'+_issueWhy[t]+'</div>':'')+
    (shown.length===0?(cat==='plot'&&r.scores.plot<80?'<div style="padding:.5rem;font-size:.78rem;color:var(--muted);line-height:1.6"><p>No individual issues flagged, but the plot structure score is <strong style="color:var(--yellow)">'+r.scores.plot+'/100</strong>.</p><p style="margin-top:.3rem">The engine evaluates arc progression, conflict setup, and tension distribution. Consider whether your opening establishes clear stakes and whether tension builds through the middle.</p></div>':cat==='dialogue'&&r.scores.dialogue<80?'<div style="padding:.5rem;font-size:.78rem;color:var(--muted);line-height:1.6"><p>No individual issues flagged, but the dialogue score is <strong style="color:var(--yellow)">'+r.scores.dialogue+'/100</strong>.</p><p style="margin-top:.3rem">Review dialogue for natural rhythm, distinct character voices, and balance between dialogue and narration.</p></div>':'<p style="color:var(--muted);font-size:.78rem;padding:.5rem">No issues in this category. Nice work!</p>'):
    shown.map((iss,idx)=>{
      const canAIFix=_REWRITE_TYPES.has(iss.type)&&_isPaid();
      const fixBtn=hasConcreteFix(iss)?'<button class="tip-fix rpd-fix-btn">Apply Fix</button>':canAIFix?'<button class="rpd-fix-btn rpd-ai-fix-btn">Fix</button>':'<button class="tip-fix rpd-fix-btn" style="background:var(--surface2);color:var(--text)">Go to Text</button>';
      const rwBtn=(hasConcreteFix(iss)&&canAIFix)?'<button class="rpd-rewrite-btn">✶ Rewrite</button>':'';
      const sevColor=iss.severity==='high'?'var(--red)':iss.severity==='medium'?'var(--yellow)':'var(--muted)';
      return '<div class="rpd-issue" data-issue-text="'+escA(iss.text)+'" data-issue-sug="'+escA(iss.suggestion)+'" data-has-fix="'+(hasConcreteFix(iss)?'1':'0')+'" data-issue-type="'+escA(iss.type)+'" data-issue-index="'+(iss.index||0)+'">'+
        '<div class="rpd-issue-head"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:'+sevColor+';margin-right:5px"></span>'+(typeLabels[iss.type]||iss.type)+'</div>'+
        '<div class="rpd-desc">'+esc(iss.suggestion)+'</div>'+
        '<div class="rpd-quote rpd-navigate" style="cursor:pointer" title="Click to jump to this text">\u2018'+esc(iss.text.substring(0,60))+'\u2019</div>'+
        '<div class="rpd-btns">'+fixBtn+'<button class="tip-ign rpd-ign-btn">Dismiss</button>'+rwBtn+'</div></div>';
    }).join(''))+
    (totalForCat>8?'<div style="padding:.4rem .7rem;font-size:.7rem;color:var(--muted);text-align:center">Showing top 8 of '+totalForCat+' — fix these first for the biggest impact</div>':'');

  // Wire events
  d.querySelectorAll('.rpd-navigate').forEach(q=>{q.addEventListener('click',()=>{
    const card=q.closest('.rpd-issue');const issueText=card.dataset.issueText;
    document.querySelectorAll('.btab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.ms-page').forEach(p=>p.classList.remove('active'));
    const annotatedBtn=document.querySelector('.btab[data-p="annotated"]');
    if(annotatedBtn)annotatedBtn.classList.add('active');
    $('ed-annotated')?.classList.add('active');
    const page=$('ed-annotated');
    const searchQ=issueText.substring(0,60).replace(/"/g,'&quot;');
    const hl=page.querySelector('.hl[data-q="'+searchQ+'"]');
    if(hl){hl.scrollIntoView({behavior:'smooth',block:'center'});hl.style.outline='3px solid var(--gold)';hl.style.outlineOffset='3px';setTimeout(()=>{hl.style.outline=''},3000)}
  })});
  d.querySelectorAll('.rpd-fix-btn').forEach(btn=>{btn.addEventListener('click',()=>{
    const card=btn.closest('.rpd-issue');const issueText=card.dataset.issueText;
    const page=$('ed-annotated');
    const hl=page.querySelector('.hl[data-q="'+issueText.substring(0,60).replace(/"/g,'&quot;')+'"]');
    if(!hl)return;
    // Switch to annotated view
    document.querySelectorAll('.btab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.ms-page').forEach(p=>p.classList.remove('active'));
    document.querySelector('.btab[data-p="annotated"]')?.classList.add('active');
    $('ed-annotated')?.classList.add('active');
    if(card.dataset.hasFix==='1'){
      replaceAndFix(hl);
      card.style.opacity='.3';card.style.pointerEvents='none';
    }else{
      // No auto-fix — scroll to it and select for editing
      hl.scrollIntoView({behavior:'smooth',block:'center'});
      setTimeout(()=>{
        const sel=window.getSelection();const range=document.createRange();
        range.selectNodeContents(hl);sel.removeAllRanges();sel.addRange(range);
      },400);
    }
  })});
  d.querySelectorAll('.rpd-ign-btn').forEach(btn=>{btn.addEventListener('click',()=>{
    const card=btn.closest('.rpd-issue');const issueText=card.dataset.issueText;
    const page=$('ed-annotated');
    const hl=page.querySelector('.hl[data-q="'+issueText.substring(0,60).replace(/"/g,'&quot;')+'"]');
    if(hl)hl.classList.add('off');
    card.remove();
  })});
  d.querySelectorAll('.rpd-rewrite-btn').forEach(btn=>{btn.addEventListener('click',()=>{
    doRewrite(btn.closest('.rpd-issue'));
  })});
  d.querySelectorAll('.rpd-ai-fix-btn').forEach(btn=>{btn.addEventListener('click',()=>{
    doRewrite(btn.closest('.rpd-issue'));
  })});
}

// ANNOTATED TEXT — now uses structured page-based rendering
function renderAnnotated(text,issues){
  renderAnnotatedAsPages(text,issues);
  document.addEventListener('click',e=>{if(!e.target.closest('.hl')&&!e.target.closest('.tip'))$('tip')?.classList.remove('on')});
}

// DETAILED
function renderDetailed(r){
  const d=$('ed-detailed');d.className='ms-page dark-page';
  const isChapter=r.manuscriptMode.mode==='chapter'||r.manuscriptMode.mode==='excerpt';
  const pl={
    classic:'Classic arc (rising action, climax, resolution)',rising:'Rising tension, resolution needs work',
    'resolution-focused':'Strong resolution, rising action weak',flat:isChapter?'Flat scene — add a clearer scene goal or tension build':'Flat tension curve — add more conflict',
    'too-short':'Too short for plot analysis',
    'strong-scene':'Strong scene arc (goal, tension, cliffhanger)',
    'building':'Tension builds well through the chapter',
    'hook-ending':'Effective cliffhanger ending — pulls reader forward'
  };
  let h='';
  const plotLabel=isChapter?'Scene Structure':'Plot Structure';
  const plotRows=[pl[r.plot.arc]||'',sr('Rising Action',r.plot.hasRisingAction?'Yes':'Weak')];
  if(isChapter){plotRows.push(sr('Scene Goal',r.plot.hasSceneGoal?'Detected':'Missing'));plotRows.push(sr('Cliffhanger',r.plot.hasCliffhanger?'Yes — strong chapter ending':'No — consider a hook'))}
  else{plotRows.push(sr('Climax',r.plot.hasClimax?'Yes':'Weak'));plotRows.push(sr('Resolution',r.plot.hasResolution?'Yes':'Weak'))}
  plotRows.push(sr('Mode',r.manuscriptMode.label+' (~'+r.manuscriptMode.estPages+' pages)'));
  plotRows.push(sr('Issues/1K words',r.issuesPerK));
  h+=secWithTip(plotLabel,r.scores.plot,plotRows,'plot');
  h+=secWithTip('Transitions',r.scores.transitions,[r.transitions.smoothRate+'% smooth',sr('Transition Words',r.transitions.transitionsUsed),sr('Smooth',r.transitions.smoothTransitions+'/'+(r.transitions.totalParagraphs-1))],'transitions');
  h+=secWithTip('Copy Editing',r.scores.copy,[r.issues.length+' issues in '+r.totalWords.toLocaleString()+' words',sr('Passive',r.issueCounts.passive),sr('Adverbs',r.issueCounts.adverb),sr('Cliches',r.issueCounts.cliche),sr('Weak Verbs',r.issueCounts['weak-verb']),sr('Show/Tell',r.issueCounts['show-tell'])],'copy');
  // Line Editing (true stylistic editing, not just readability)
  const le=r.lineEditing;
  const lineRows=['Stylistic editing: tone, flow, precision, pacing, POV, extraneous language'];
  lineRows.push(sr('Tone Consistency',le.tone.score+'/100'));
  lineRows.push(sr('Sentence Flow',le.flow.score+'/100'));
  lineRows.push(sr('Word Precision',le.precision.score+'/100'));
  lineRows.push(sr('Pacing Rhythm',le.pacing.score+'/100'));
  lineRows.push(sr('POV Discipline',le.pov.score+'/100'));
  lineRows.push(sr('Extraneous Language',le.extraneous.score+'/100'));
  // Show findings
  if(le.findings.length>0){
    lineRows.push('<div style="margin-top:.4rem;border-top:1px solid var(--border);padding-top:.4rem">');
    le.findings.forEach(f=>{
      const col=f.severity==='high'?'var(--red)':f.severity==='medium'?'var(--yellow)':'var(--muted)';
      lineRows.push('<div style="font-size:.72rem;color:'+col+';padding:.2rem 0;border-bottom:1px solid var(--border)">'+esc(f.message)+'</div>');
    });
    lineRows.push('</div>');
  }
  lineRows.push(sr('Readability Grade',r.readability.grade));
  lineRows.push(sr('Flesch Ease',r.readability.ease+'/100'));
  h+=secWithTip('Line Editing',r.scores.line,lineRows,'line');
  h+=sec('Style & Voice',r.scores.style,[sr('POV',r.style.pov),sr('Lexical Diversity',r.style.lexicalDiversity+'/100'),sr('Unique Words',r.style.uniqueWords.toLocaleString())]);
  // Dialogue (deep analysis)
  const dl=r.dialogue;
  const dlRows=[dl.count===0?'No dialogue detected.':''];
  dlRows.push(sr('Lines',dl.count));dlRows.push(sr('Ratio',dl.ratio+'% of text'));
  if(dl.count>0){
    dlRows.push(sr('Tag Discipline',dl.tagDiscipline+'/100'));
    dlRows.push(sr('Conciseness',dl.conciseness+'/100'));
    dlRows.push(sr('Show Not Tell',dl.showNotTell+'/100'));
    dlRows.push(sr('Purposefulness',dl.purposefulness+'/100'));
    dlRows.push(sr('Naturalness',dl.naturalness+'/100'));
    dlRows.push(sr('Avg Line Length',dl.avgLength+' words'));
    dlRows.push(sr('Length Variety',dl.lengthVariety||0));
    dlRows.push(sr('"Said/Asked" Rate',dl.saidRatio+'%'));
    if(dl.exoticTags>0)dlRows.push(sr('Exotic Tags',dl.exoticTags));
    if(dl.adverbTags>0)dlRows.push(sr('Adverb Tags',dl.adverbTags));
    if(dl.smallTalk>0)dlRows.push(sr('Small Talk Lines',dl.smallTalk));
    // Findings
    if(dl.findings&&dl.findings.length>0){
      dlRows.push('<div style="margin-top:.4rem;border-top:1px solid var(--border);padding-top:.4rem">');
      dl.findings.forEach(f=>{
        const col=f.severity==='high'?'var(--red)':f.severity==='medium'?'var(--yellow)':'var(--muted)';
        dlRows.push('<div style="font-size:.72rem;color:'+col+';padding:.2rem 0;border-bottom:1px solid var(--border)">'+esc(f.message)+'</div>');
      });
      dlRows.push('</div>');
    }
  }
  h+=sec('Dialogue',r.scores.dialogue,dlRows);
  // Pacing heatmap
  if(r.pacing){const cols={action:'#c0392b',dialogue:'#2980b9',description:'#27ae60',exposition:'#f39c12',reflection:'#8e44ad'};
  h+='<div class="a-sec"><h3>Pacing Heatmap</h3><div class="hm-wrap">'+r.pacing.segments.map((s,i)=>'<div class="hm-blk" style="background:'+cols[s.type]+'" title="Seg '+(i+1)+': '+s.type+'"></div>').join('')+'</div><div class="hm-leg"><span><span class="hm-dot" style="background:#c0392b"></span>Action</span><span><span class="hm-dot" style="background:#2980b9"></span>Dialogue</span><span><span class="hm-dot" style="background:#27ae60"></span>Description</span><span><span class="hm-dot" style="background:#f39c12"></span>Exposition</span><span><span class="hm-dot" style="background:#8e44ad"></span>Reflection</span></div></div>'}
  // Characters
  if(r.characters.list.length>0){const mx=Math.max(...r.characters.list.map(c=>c.mentions));h+='<div class="a-sec"><h3>Characters</h3><div class="ch-grid">'+r.characters.list.map(c=>'<div class="ch-card"><div class="ch-name">'+esc(c.name)+'</div><div class="ch-cnt">'+c.mentions+' mentions</div><div class="ch-bar"><div class="ch-fill" style="width:'+Math.round(c.mentions/mx*100)+'%"></div></div></div>').join('')+'</div></div>'}
  // Genre-Specific Elements Scanner
  if(r.genreElements&&r.genreElements.applicable){
    const ge=r.genreElements;
    h+='<div class="a-sec" style="border-left:3px solid var(--gold)"><h3>'+esc(ge.genreName)+' Elements <span style="color:'+sc(ge.score)+'">'+ge.score+'/100</span></h3>';
    h+='<p style="font-size:.72rem;color:var(--muted);margin-bottom:.5rem">'+ge.presentCount+'/'+ge.totalElements+' essential elements detected in your manuscript.</p>';
    ge.elements.forEach(el=>{
      const col=el.present?'var(--green)':'var(--red)';
      const icon=el.present?'\u2713':'\u2717';
      h+='<div style="display:flex;align-items:flex-start;gap:.5rem;padding:.35rem 0;border-bottom:1px solid var(--border)">';
      h+='<span style="color:'+col+';font-weight:700;font-size:.85rem;min-width:16px">'+icon+'</span>';
      h+='<div style="flex:1"><div style="font-size:.78rem;font-weight:600;color:'+(el.present?'var(--text)':'var(--muted)')+'">'+esc(el.name)+'</div>';
      if(!el.present)h+='<div style="font-size:.68rem;color:var(--yellow);margin-top:.1rem;line-height:1.4">'+esc(el.tip)+'</div>';
      h+='</div></div>';
    });
    if(ge.guidance.length>0){
      h+='<div style="margin-top:.5rem;padding:.4rem .5rem;background:var(--surface2);border-radius:var(--rs);font-size:.7rem;color:var(--muted)"><strong style="color:var(--gold-l)">Focus areas:</strong> '+ge.guidance.map(g=>g.element).join(', ')+'</div>';
    }
    h+='</div>';
  }
  // Sci-Fi Worldbuilding Scanner
  if(r.scifiWorld&&r.scifiWorld.applicable){
    const sw=r.scifiWorld;
    h+='<div class="a-sec" style="border-left:3px solid #3bb8a0"><h3>Sci-Fi Worldbuilding Scanner <span style="color:'+sc(sw.overall)+'">'+sw.overall+'/100</span></h3>';
    h+='<p style="font-size:.75rem;color:var(--muted);margin-bottom:.5rem">'+sw.strongElements+' strong elements, '+sw.weakElements+' need work. Every sci-fi world needs these 7 pillars.</p>';
    // Element bars
    const elOrder=['bigChange','power','culture','tech','lived','history','economics'];
    const elIcons=['?','???','????','????','????','????','????'];
    elOrder.forEach((k,idx)=>{
      const el=sw.elements[k];
      const col=sc(el.score);
      h+='<div style="margin-bottom:.5rem"><div style="display:flex;justify-content:space-between;align-items:center;font-size:.78rem;margin-bottom:.15rem"><span><strong>'+el.name+'</strong></span><span style="color:'+col+';font-weight:700">'+el.score+'/100</span></div>';
      h+='<div class="rdr-bar"><div class="rdr-fill" style="width:'+el.score+'%;background:'+col+'"></div></div>';
      if(el.found.length>0)h+='<div style="font-size:.65rem;color:var(--green);margin-top:.1rem">Found: '+el.found.join(', ')+'</div>';
      if(el.missing.length>0)h+='<div style="font-size:.65rem;color:var(--muted);margin-top:.05rem">Missing: '+el.missing.join(', ')+'</div>';
      h+='</div>';
    });
    // Guidance for weak elements
    if(sw.guidance.length>0){
      h+='<div style="margin-top:.6rem;border-top:1px solid var(--border);padding-top:.5rem"><h4 style="font-size:.8rem;color:var(--gold-l);margin-bottom:.4rem">Worldbuilding Guidance</h4>';
      sw.guidance.forEach(g=>{
        h+='<div style="background:var(--surface2);border-radius:var(--rs);padding:.5rem .65rem;margin-bottom:.35rem;border-left:3px solid var(--yellow)"><div style="font-size:.78rem;font-weight:600;color:var(--text)">'+esc(g.element)+' <span style="color:var(--red);font-weight:400">('+g.score+'/100)</span></div><div style="font-size:.72rem;color:var(--muted);margin-top:.2rem;line-height:1.5">'+esc(g.tip)+'</div></div>';
      });
      h+='</div>';
    }
    h+='</div>';
  }
  d.innerHTML=h;
}
function sec(t,s,items){return '<div class="a-sec"><h3>'+t+' <span style="color:'+sc(s)+'">'+s+'/100</span></h3>'+items.filter(Boolean).map(i=>typeof i==='string'?(i?'<p>'+i+'</p>':''):i).join('')+'</div>'}
function sr(l,v){return '<div class="sr"><span class="sr-l">'+l+'</span><span class="sr-v">'+v+'</span></div>'}

// Improvement suggestions for low-scoring areas
const improveTips={
  plot:{
    low:'Your plot feels flat. Add a clear inciting incident early, raise the stakes in the middle, and build to a decisive climax. Every scene should either advance the plot or reveal character — cut anything that does neither.',
    mid:'Your plot has structure but needs sharpening. Ensure each act has a clear turning point. Check if your climax delivers on the promises made in the setup.'
  },
  transitions:{
    low:'Transitions between paragraphs feel abrupt. Use bridging phrases ("Meanwhile", "Later that day"), echo the last image of one paragraph in the first line of the next, or connect scenes through a character\'s emotional state.',
    mid:'Some transitions work, but others jar the reader. Read each paragraph break aloud — if the shift feels sudden, add a beat or re-order the paragraphs.'
  },
  copy:{
    low:'Heavy copy editing issues. Focus on: (1) Convert passive voice to active ("was opened" → "opened"), (2) Cut adverbs after strong verbs ("ran quickly" → "sprinted"), (3) Replace cliches with original imagery, (4) Split sentences over 30 words.',
    mid:'Good foundation, but tighten further. Search for "was/were" + past participle and rewrite. Audit every -ly adverb — keep only those that change meaning.'
  },
  line:{
    low:'Line editing needs work. Focus on: varying sentence length (mix 5-word punches with 20-word flowing sentences), cutting filter words ("she felt", "he noticed"), and ensuring each paragraph has a clear energy direction.',
    mid:'Prose is functional but could be more musical. Try reading difficult sections aloud. Where you stumble, rewrite. Where you rush, slow down with sensory detail.'
  },
  style:{
    low:'Style feels generic. Develop a distinctive voice by: (1) choosing unusual but precise words, (2) developing a consistent rhythm, (3) finding metaphors unique to your world/character. Read authors with strong voice (Chandler, Morrison, Pratchett) and notice HOW they sound different.',
    mid:'Voice is emerging but inconsistent. Identify your 5 strongest paragraphs and analyze what makes them work — then apply those patterns to the weaker sections.'
  },
  dialogue:{
    low:'Dialogue needs significant work. Rules: (1) Every line should either advance plot or reveal character, (2) Cut small talk, (3) Each character should sound different, (4) "Said" is invisible — don\'t replace it with fancy tags, (5) Show subtext — what characters DON\'T say matters more.',
    mid:'Dialogue is serviceable but could be sharper. Read each exchange and ask: "Would a real person actually say this?" Cut any line that\'s just delivering information the reader already knows.'
  },
  showTell:{
    low:'Heavy telling instead of showing. Replace "She felt angry" with physical cues: "Her jaw clenched. She set down the glass too hard." Let readers INFER emotions from behavior, body language, and dialogue — don\'t name the emotion directly.',
    mid:'Some telling remains. Search for "felt", "was [emotion]", "seemed", "obviously" — each one is an opportunity to show through action instead.'
  }
};
function secWithTip(t,s,items,key){
  let tip='';
  if(s<50&&improveTips[key]){tip='<div style="background:var(--surface2);border-left:3px solid var(--gold);border-radius:0 var(--rs) var(--rs) 0;padding:.5rem .65rem;margin-top:.4rem"><div style="font-size:.68rem;font-weight:600;color:var(--gold-l);margin-bottom:.2rem">How to Improve</div><div style="font-size:.72rem;color:var(--text);line-height:1.5">'+improveTips[key].low+'</div></div>'}
  else if(s<70&&improveTips[key]){tip='<div style="background:var(--surface2);border-left:3px solid var(--gold);border-radius:0 var(--rs) var(--rs) 0;padding:.5rem .65rem;margin-top:.4rem"><div style="font-size:.68rem;font-weight:600;color:var(--gold-l);margin-bottom:.2rem">How to Improve</div><div style="font-size:.72rem;color:var(--text);line-height:1.5">'+improveTips[key].mid+'</div></div>'}
  return '<div class="a-sec"><h3>'+t+' <span style="color:'+sc(s)+'">'+s+'/100</span></h3>'+items.filter(Boolean).map(i=>typeof i==='string'?(i?'<p>'+i+'</p>':''):i).join('')+tip+'</div>';
}

// READER VIEW
function renderReader(r){
  const d=$('ed-reader');d.className='ms-page dark-page';const rp=r.readerPerspective;
  const mc=(s,inv)=>{const v=inv?100-s:s;return v>=70?'var(--green)':v>=40?'var(--yellow)':'var(--red)'};
  let h='<div class="rdr-grid">';
  h+=rc('Engagement',rp.engagementScore,mc(rp.engagementScore),'How hooked?');
  h+=rc('Hook Strength',rp.hookStrength,mc(rp.hookStrength),'Opening grab?');
  h+=rc('Clarity',rp.clarityScore,mc(rp.clarityScore),'Follow the story?');
  h+='<div class="rdr-card"><h4>Pacing</h4><p style="font-size:.82rem;margin-top:.3rem">'+esc(rp.pacingFeel)+'</p></div>';
  h+='<div class="rdr-card"><h4>Verdict</h4><p style="font-size:.82rem;margin-top:.3rem">'+esc(rp.overallVerdict)+'</p></div>';
  h+='</div>';
  // DNF Prediction Engine (full panel)
  if(r.dnfAnalysis){
    const dnf=r.dnfAnalysis;
    const drc=dnf.risk_band==='Low'?'var(--green)':dnf.risk_band==='Medium'?'var(--yellow)':'var(--red)';
    h+='<div class="a-sec"><h3>'+esc(dnf.score_label)+' <span style="color:'+drc+'">'+dnf.dnf_risk+'%</span></h3>';
    h+='<div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.6rem"><div style="font-size:2rem;font-weight:800;color:'+drc+'">'+dnf.dnf_risk+'</div><div><div style="font-size:.82rem;font-weight:600;color:'+drc+'">'+dnf.risk_band+' Risk</div><div style="font-size:.68rem;color:var(--muted)">'+esc(dnf.eval_mode)+' mode</div></div></div>';
    h+='<div class="rdr-bar" style="margin-bottom:.8rem"><div class="rdr-fill" style="width:'+dnf.dnf_risk+'%;background:'+drc+'"></div></div>';
    // 6 dimension scores
    const dimLabels={momentum:'Momentum',character_connection:'Character Connection',structure:'Structure',plot_integrity:'Plot Integrity',cognitive_load:'Cognitive Load',writing_quality:'Writing Quality'};
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem .8rem;margin-bottom:.8rem">';
    Object.entries(dnf.scores).forEach(([k,v])=>{
      const dc=v>=7?'var(--green)':v>=5?'var(--yellow)':'var(--red)';
      h+='<div style="display:flex;justify-content:space-between;align-items:center;padding:.3rem .4rem;background:var(--surface2);border-radius:var(--rs);font-size:.75rem"><span style="color:var(--muted)">'+(dimLabels[k]||k)+'</span><span style="font-weight:700;color:'+dc+'">'+v+'/10</span></div>';
    });
    h+='</div>';
    // Top 3 reasons
    if(dnf.top_3_reasons&&dnf.top_3_reasons.length>0){
      h+='<div style="margin-bottom:.6rem"><div style="font-size:.72rem;font-weight:600;color:var(--gold-l);margin-bottom:.3rem">Why readers may stop:</div>';
      dnf.top_3_reasons.forEach((r,i)=>{h+='<div style="font-size:.75rem;color:var(--muted);padding:.2rem 0;padding-left:.6rem;border-left:2px solid '+drc+'">'+(i+1)+'. '+esc(r)+'</div>'});
      h+='</div>';
    }
    // Best fix
    if(dnf.best_fix){h+='<div style="background:var(--surface2);border-radius:var(--rs);padding:.5rem .65rem;margin-bottom:.6rem;border-left:3px solid var(--green)"><div style="font-size:.68rem;font-weight:600;color:var(--green);margin-bottom:.15rem">Best Fix</div><div style="font-size:.75rem;color:var(--text)">'+esc(dnf.best_fix)+'</div></div>'}
    // Section scores (if chunked)
    if(dnf.section_scores&&dnf.section_scores.length>1){
      h+='<div style="margin-bottom:.5rem"><div style="font-size:.72rem;font-weight:600;color:var(--gold-l);margin-bottom:.3rem">Section Breakdown:</div>';
      dnf.section_scores.forEach(s=>{
        const sc2=s.score>=70?'var(--green)':s.score>=40?'var(--yellow)':'var(--red)';
        const isStrong=s.section===dnf.strongest_section;const isWeak=s.section===dnf.weakest_section;
        h+='<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.25rem"><span style="font-size:.72rem;color:var(--muted);width:40px">'+s.section+'</span><div class="rdr-bar" style="flex:1"><div class="rdr-fill" style="width:'+s.score+'%;background:'+sc2+'"></div></div><span style="font-size:.72rem;font-weight:700;color:'+sc2+';width:28px">'+s.score+'</span>';
        if(isStrong)h+='<span style="font-size:.55rem;background:var(--green);color:#fff;padding:.1rem .3rem;border-radius:3px">BEST</span>';
        if(isWeak)h+='<span style="font-size:.55rem;background:var(--red);color:#fff;padding:.1rem .3rem;border-radius:3px">WEAK</span>';
        h+='</div>';
      });
      h+='</div>';
    }
    // AI Diagnosis button (paid users only)
    h+='<div style="margin-top:.6rem;padding-top:.5rem;border-top:1px solid var(--border)"><button class="btn-gold ai-diagnose-btn" style="width:100%;font-size:.78rem;padding:.5rem">&#9889; Diagnose Weak Passages with AI</button><div id="ai-weakness-result" style="margin-top:.5rem"></div></div>';
    // Context warning
    if(dnf.context_warning){h+='<div style="font-size:.65rem;color:var(--dim);font-style:italic;padding-top:.3rem;border-top:1px solid var(--border)">'+esc(dnf.context_warning)+'</div>'}
    h+='</div>';
  }
  // Writing Quality Engine breakdown
  if(r.writingQuality){
    const wq=r.writingQuality;
    h+='<div class="a-sec"><h3>Writing Quality Engine <span style="color:'+sc(wq.overall)+'">'+wq.overall+'/100</span></h3>';
    h+='<p style="font-size:.75rem;color:var(--muted);margin-bottom:.5rem">Algorithmic assessment: clarity, discipline, efficiency, engagement, momentum</p>';
    const metrics=[
      {name:'Clarity',score:wq.clarityScore,desc:'Direct, easy to follow, no unnecessary complexity'},
      {name:'Discipline',score:wq.disciplineScore,desc:'Tight prose, no filler words, strong verbs'},
      {name:'Efficiency',score:wq.efficiencyScore,desc:'High meaning-to-word ratio, no over-explanation'},
      {name:'Engagement',score:wq.engagementScore,desc:'Maintains curiosity, sensory language, avoids info dumps'},
      {name:'Momentum',score:wq.momentumScore,desc:'Forward motion, no excessive backstory or stalling'}
    ];
    metrics.forEach(m=>{
      h+='<div style="margin-bottom:.4rem"><div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:.15rem"><span>'+m.name+'</span><span style="color:'+sc(m.score)+';font-weight:700">'+m.score+'/100</span></div><div class="rdr-bar"><div class="rdr-fill" style="width:'+m.score+'%;background:'+sc(m.score)+'"></div></div><div style="font-size:.65rem;color:var(--dim)">'+m.desc+'</div></div>';
    });
    // Specific findings
    const d=wq.details;
    if(d.fillerWords>0||d.hedgeWords>0||d.weakOpenings>0){
      h+='<div style="margin-top:.5rem;padding:.4rem;background:var(--surface2);border-radius:var(--rs);font-size:.72rem;color:var(--muted)">';
      if(d.fillerWords>0)h+='<div>Filler words found: <strong style="color:var(--yellow)">'+d.fillerWords+'</strong> ('+d.fillerRate+' per 1000 words)</div>';
      if(d.hedgeWords>0)h+='<div>Hedge phrases: <strong style="color:var(--yellow)">'+d.hedgeWords+'</strong> ("seemed to", "began to", etc.)</div>';
      if(d.weakOpenings>0)h+='<div>Weak openings: <strong style="color:var(--red)">'+d.weakOpenings+'</strong> ("It was", "There was")</div>';
      if(d.infoDumps>0)h+='<div>Potential info dumps: <strong style="color:var(--red)">'+d.infoDumps+'</strong></div>';
      if(d.overExplain>0)h+='<div>Over-explanations: <strong style="color:var(--yellow)">'+d.overExplain+'</strong></div>';
      if(d.sensoryWords>0)h+='<div>Sensory words: <strong style="color:var(--green)">'+d.sensoryWords+'</strong> (good for immersion)</div>';
      h+='</div>';
    }
    h+='</div>';
  }
  const ec={exciting:'#c0392b',tense:'#f39c12',sad:'#2980b9',calm:'#27ae60',hopeful:'#8e44ad'};
  h+='<div class="a-sec"><h3>Emotional Journey</h3>';
  rp.emotionalJourney.forEach(e=>{h+='<div class="emo-row"><span class="emo-name">'+e.emotion+'</span><div class="emo-track"><div class="emo-fill" style="width:'+e.intensity+'%;background:'+(ec[e.emotion]||'#888')+'"></div></div><span style="font-size:.62rem;color:var(--muted);width:35px">'+e.intensity+'%</span></div>'});
  h+='</div>';
  if(rp.immersionBreakers.length>0){h+='<div class="a-sec"><h3>Immersion Breakers ('+rp.immersionBreakers.length+')</h3>';rp.immersionBreakers.forEach(b=>{h+='<div style="padding:.35rem .5rem;border-left:3px solid var(--yellow);margin-bottom:.3rem;font-size:.78rem;background:var(--surface2);border-radius:0 var(--rs) var(--rs) 0"><div>'+esc(b.reason)+'</div><div style="font-size:.65rem;color:var(--muted)">'+esc(b.location)+'</div></div>'});h+='</div>'}
  d.innerHTML=h;
  // AI Weakness Diagnosis handler
  const diagBtn=d.querySelector('.ai-diagnose-btn');
  if(diagBtn){diagBtn.addEventListener('click',async()=>{
    const user=typeof firebase!=='undefined'?firebase.auth().currentUser:null;
    if(!user){alert('Please sign in first');return}
    const isAdmin=window.__isAdmin||false;
    if(!isAdmin){
      // Check if paid (for now, show upgrade prompt for free users)
      diagBtn.textContent='Analyzing...';diagBtn.disabled=true;
    }
    try{
      diagBtn.textContent='&#9889; AI analyzing weak passages...';diagBtn.disabled=true;
      const result=await AIEngine.analyzeWeaknesses(null,extractedText,analysisResult);
      const container=$('ai-weakness-result');
      if(!container)return;
      if(result.parseError){container.innerHTML='<p style="color:var(--red);font-size:.75rem">AI analysis failed. Try again.</p>';diagBtn.disabled=false;diagBtn.textContent='&#9889; Retry AI Diagnosis';return}
      let wh='';
      if(result.overall_pattern){wh+='<div style="background:var(--surface2);border-radius:var(--rs);padding:.5rem .65rem;margin-bottom:.5rem;border-left:3px solid var(--yellow)"><div style="font-size:.68rem;font-weight:600;color:var(--yellow);margin-bottom:.15rem">Pattern Detected</div><div style="font-size:.75rem;color:var(--text)">'+esc(result.overall_pattern)+'</div></div>'}
      if(result.priority_fix){wh+='<div style="background:var(--surface2);border-radius:var(--rs);padding:.5rem .65rem;margin-bottom:.5rem;border-left:3px solid var(--green)"><div style="font-size:.68rem;font-weight:600;color:var(--green);margin-bottom:.15rem">Priority Fix</div><div style="font-size:.75rem;color:var(--text)">'+esc(result.priority_fix)+'</div></div>'}
      if(result.paragraphs&&result.paragraphs.length>0){
        result.paragraphs.forEach(p=>{
          const sevCol=p.severity==='high'?'var(--red)':p.severity==='medium'?'var(--yellow)':'var(--muted)';
          wh+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rs);padding:.6rem;margin-bottom:.4rem;border-left:3px solid '+sevCol+'">';
          wh+='<div style="display:flex;justify-content:space-between;margin-bottom:.3rem"><span style="font-size:.7rem;font-weight:600;color:'+sevCol+'">'+esc(p.category).toUpperCase()+'</span><span style="font-size:.6rem;color:var(--dim)">Para '+p.paragraph_number+'</span></div>';
          wh+='<div style="font-size:.72rem;color:var(--text);margin-bottom:.3rem">'+esc(p.problem)+'</div>';
          if(p.original_snippet){wh+='<div style="font-size:.7rem;color:var(--muted);background:var(--surface2);padding:.3rem .5rem;border-radius:3px;margin-bottom:.3rem;font-style:italic;border-left:2px solid var(--red)">\u201C'+esc(p.original_snippet)+'\u201D</div>'}
          if(p.suggested_rewrite){wh+='<div style="font-size:.7rem;color:var(--green);background:var(--surface2);padding:.3rem .5rem;border-radius:3px;margin-bottom:.2rem;border-left:2px solid var(--green)">\u2192 '+esc(p.suggested_rewrite)+'</div>'}
          if(p.principle){wh+='<div style="font-size:.62rem;color:var(--dim);font-style:italic;margin-top:.2rem">Principle: '+esc(p.principle)+'</div>'}
          wh+='</div>';
        });
      }
      container.innerHTML=wh;
      diagBtn.textContent='&#9889; Re-diagnose with AI';diagBtn.disabled=false;
    }catch(e){
      diagBtn.textContent='&#9889; Diagnose Weak Passages with AI';diagBtn.disabled=false;
      const container=$('ai-weakness-result');
      if(container)container.innerHTML='<p style="color:var(--red);font-size:.75rem">'+esc(e.message)+'</p>';
    }
  })}
}
function rc(t,s,c,desc){return '<div class="rdr-card"><h4>'+t+'</h4><div class="rdr-big" style="color:'+c+'">'+s+'/100</div><div class="rdr-bar"><div class="rdr-fill" style="width:'+s+'%;background:'+c+'"></div></div><div class="rdr-lbl">'+desc+'</div></div>'}

// SYNC: editor → book preview (real-time, paginated)
let syncTimer=null;
function syncPreview(){
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>{
    // If preview is active and we have analysis, re-render with current text
    if(analysisResult&&extractedText){
      // Update extractedText from editor
      const page=$('ed-annotated');
      if(page)extractedText=page.innerText;
      // Re-render paginated preview will happen on next renderBookPreview call
      // For now just trigger auto-save
    }
    autoSave();
  },500);
}

// BOOK PREVIEW — Paginated eBook Reader with chapter-aware pagination & search
let _pvState={pages:[],currentPage:0,totalPages:0,fontSize:16,darkTheme:false,device:'kindle',showNotes:true,searchMatches:[],searchIdx:-1};
let _pvParagraphs=[];let _pvParaHTML=[];let _pvChapterIndices=[];

function renderBookPreview(r){
  const pvEmotions=$('pv-emotions');const pvPage=$('pv-page');const frame=$('pv-device-frame');
  if(!pvEmotions||!pvPage||!frame)return;
  _pvParagraphs=extractedText.split(/\n\s*\n/).filter(p=>p.trim().length>0);
  const emotions=r.sceneEmotions||{scenes:[],total:0};
  frame.className='pv-device-frame '+_pvState.device;

  // Emotion summary
  const emotionMap={};
  emotions.scenes.forEach(s=>{if(!emotionMap[s.emotion])emotionMap[s.emotion]={...s,count:0};emotionMap[s.emotion].count++});
  pvEmotions.innerHTML=Object.values(emotionMap).map(e=>
    '<span class="pv-emo-tag" style="background:'+e.color+'15;color:'+e.color+'">'+e.emoji+' '+e.label+' ('+e.count+')</span>'
  ).join('');

  // Build emotion lookup
  const emotionByPara={};
  emotions.scenes.forEach(s=>{emotionByPara[s.paragraph]=s});

  // Detect chapter headings
  _pvChapterIndices=[];
  const chapterRe=/^(chapter\s+\d+|chapter\s+[a-z]+|part\s+\d+|part\s+[a-z]+|prologue|epilogue)/i;

  // Build paragraph HTML with chapter detection
  _pvParaHTML=_pvParagraphs.map((p,i)=>{
    const emo=emotionByPara[i+1];
    const isChapter=chapterRe.test(p.trim());
    if(isChapter){
      _pvChapterIndices.push(i);
      return '<div class="pv-para chapter-heading" data-para="'+(i+1)+'">'+esc(p)+'</div>';
    }
    return '<div class="pv-para" data-para="'+(i+1)+'">'+(emo&&_pvState.showNotes?'<span class="pv-emo-inline">'+emo.emoji+'</span>':'')+esc(p)+'</div>';
  });

  // Chapter-aware paginate
  function paginate(){
    const container=pvPage;
    const screenEl=container.parentElement;
    const navH=$('pv-navbar')?.offsetHeight||80;
    const searchH=$('pv-search-panel')?.classList.contains('hidden')?0:($('pv-search-panel')?.offsetHeight||0);
    const maxH=screenEl.clientHeight-navH-searchH-20;
    if(maxH<80)return;

    let measurer=document.getElementById('_pv-measurer');
    if(!measurer){
      measurer=document.createElement('div');measurer.id='_pv-measurer';
      measurer.style.cssText='position:absolute;top:-9999px;left:-9999px;visibility:hidden';
      document.body.appendChild(measurer);
    }
    measurer.style.width=container.clientWidth+'px';
    measurer.style.fontSize=_pvState.fontSize+'px';
    const cs=window.getComputedStyle(container);
    measurer.style.fontFamily=cs.fontFamily;
    measurer.style.lineHeight=cs.lineHeight||'1.55';
    measurer.style.textAlign=cs.textAlign;
    measurer.style.padding='0';

    const pages=[];
    let curPage=[];
    let curH=0;

    for(let i=0;i<_pvParaHTML.length;i++){
      // Chapter headings force a new page
      const isChapterStart=_pvChapterIndices.includes(i);
      if(isChapterStart&&curPage.length>0){
        pages.push(curPage.slice());
        curPage=[];curH=0;
      }

      measurer.innerHTML=_pvParaHTML[i];
      const h=measurer.offsetHeight+10;

      if(curH+h>maxH&&curPage.length>0){
        pages.push(curPage.slice());
        curPage=[i];curH=h;
      }else{
        curPage.push(i);curH+=h;
      }
    }
    if(curPage.length>0)pages.push(curPage);
    _pvState.pages=pages;
    _pvState.totalPages=pages.length;
    if(_pvState.currentPage>=_pvState.totalPages)_pvState.currentPage=Math.max(0,_pvState.totalPages-1);
  }

  function renderPage(){
    const page=_pvState.pages[_pvState.currentPage];
    if(!page){pvPage.innerHTML='<p style="color:#999;font-size:.8rem;text-align:center;margin-top:2rem">No content</p>';return}
    pvPage.innerHTML=page.map(i=>_pvParaHTML[i]).join('');
    pvPage.style.fontSize=_pvState.fontSize+'px';
    $('pv-page-info').textContent='Page '+(_pvState.currentPage+1)+' of '+_pvState.totalPages;
    const prev=$('pv-prev');const next=$('pv-next');
    if(prev)prev.disabled=_pvState.currentPage<=0;
    if(next)next.disabled=_pvState.currentPage>=_pvState.totalPages-1;
    // Apply search highlights on current page
    applySearchHighlights();
    // Click paragraph → navigate to editor
    pvPage.querySelectorAll('.pv-para').forEach(el=>{el.addEventListener('click',()=>{
      document.querySelectorAll('.btab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.ms-page').forEach(p=>p.classList.remove('active'));
      document.querySelector('.btab[data-p="annotated"]')?.classList.add('active');
      $('ed-annotated')?.classList.add('active');
      const idx=parseInt(el.dataset.para)-1;
      const pt=_pvParagraphs[idx]?.substring(0,30);
      if(pt){const pg=$('ed-annotated');for(const n of pg.childNodes){if(n.textContent?.includes(pt)){n.scrollIntoView?.({behavior:'smooth',block:'center'});break}}}
    })});
  }
  // Expose for external use
  window._pvPaginate=paginate;window._pvRenderPage=renderPage;

  // === SEARCH ENGINE ===
  function doSearch(query){
    _pvState.searchMatches=[];_pvState.searchIdx=-1;
    if(!query||query.length<2)return;
    const q=query.toLowerCase();
    _pvParagraphs.forEach((p,i)=>{
      const lower=p.toLowerCase();let pos=0;
      while((pos=lower.indexOf(q,pos))!==-1){
        // Find which page this paragraph is on
        const pageIdx=_pvState.pages.findIndex(pg=>pg.includes(i));
        _pvState.searchMatches.push({paraIdx:i,charIdx:pos,pageIdx});
        pos+=q.length;
      }
    });
    $('pv-search-count').textContent=_pvState.searchMatches.length>0?'1/'+_pvState.searchMatches.length:'0 results';
    if(_pvState.searchMatches.length>0){_pvState.searchIdx=0;goToSearchMatch(0)}
  }
  function goToSearchMatch(idx){
    if(idx<0||idx>=_pvState.searchMatches.length)return;
    _pvState.searchIdx=idx;
    const m=_pvState.searchMatches[idx];
    if(m.pageIdx>=0&&m.pageIdx!==_pvState.currentPage){_pvState.currentPage=m.pageIdx;renderPage()}
    else applySearchHighlights();
    $('pv-search-count').textContent=(idx+1)+'/'+_pvState.searchMatches.length;
  }
  function applySearchHighlights(){
    const query=($('pv-search-input')?.value||'').trim();
    if(!query||query.length<2)return;
    const re=new RegExp('('+query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
    pvPage.querySelectorAll('.pv-para').forEach(el=>{
      const paraIdx=parseInt(el.dataset.para)-1;
      // Replace text content with highlighted version
      const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
      const textNodes=[];
      while(walker.nextNode())textNodes.push(walker.currentNode);
      textNodes.forEach(tn=>{
        if(re.test(tn.textContent)){
          const span=document.createElement('span');
          span.innerHTML=tn.textContent.replace(re,'<mark class="pv-highlight">$1</mark>');
          tn.parentNode.replaceChild(span,tn);
        }
      });
    });
    // Mark active match
    const marks=pvPage.querySelectorAll('mark.pv-highlight');
    let globalIdx=0;
    const currentMatch=_pvState.searchMatches[_pvState.searchIdx];
    marks.forEach(m=>{
      // Find all matches on this page and highlight the active one
      const matchesOnPage=_pvState.searchMatches.filter(sm=>sm.pageIdx===_pvState.currentPage);
      if(_pvState.searchIdx>=0){
        const activeOnPage=matchesOnPage.findIndex(sm=>sm===currentMatch);
        if(globalIdx===activeOnPage)m.classList.add('active');
      }
      globalIdx++;
    });
    // Scroll active mark into view
    const active=pvPage.querySelector('mark.pv-highlight.active');
    if(active)active.scrollIntoView({block:'center',behavior:'smooth'});
  }

  // Search UI bindings
  const searchInput=$('pv-search-input');
  if(searchInput){
    let searchDebounce;
    searchInput.addEventListener('input',()=>{clearTimeout(searchDebounce);searchDebounce=setTimeout(()=>doSearch(searchInput.value.trim()),300)});
    searchInput.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();if(e.shiftKey)goToSearchMatch(_pvState.searchIdx-1);else goToSearchMatch(_pvState.searchIdx+1)}
      if(e.key==='Escape'){$('pv-search-panel')?.classList.add('hidden');_pvState.searchMatches=[];_pvState.searchIdx=-1;renderPage()}
    });
  }
  $('pv-search-prev')?.addEventListener('click',()=>goToSearchMatch(_pvState.searchIdx-1));
  $('pv-search-next')?.addEventListener('click',()=>goToSearchMatch(_pvState.searchIdx+1));
  $('pv-search-close')?.addEventListener('click',()=>{$('pv-search-panel')?.classList.add('hidden');_pvState.searchMatches=[];_pvState.searchIdx=-1;searchInput.value='';paginate();renderPage()});

  // Initial paginate + render
  setTimeout(()=>{paginate();renderPage()},100);

  // Navigation
  $('pv-prev')?.addEventListener('click',()=>{if(_pvState.currentPage>0){_pvState.currentPage--;renderPage()}});
  $('pv-next')?.addEventListener('click',()=>{if(_pvState.currentPage<_pvState.totalPages-1){_pvState.currentPage++;renderPage()}});

  // Keyboard nav
  const screen=$('pv-screen');
  if(screen){
    screen.tabIndex=0;
    screen.addEventListener('keydown',e=>{
      if(e.target.tagName==='INPUT')return;
      if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();if(_pvState.currentPage<_pvState.totalPages-1){_pvState.currentPage++;renderPage()}}
      if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();if(_pvState.currentPage>0){_pvState.currentPage--;renderPage()}}
      if(e.key==='f'&&(e.ctrlKey||e.metaKey)){e.preventDefault();$('pv-search-panel')?.classList.remove('hidden');$('pv-search-input')?.focus();paginate();renderPage()}
    });
  }

  // Device switcher
  document.querySelectorAll('.pv-dev').forEach(btn=>{btn.addEventListener('click',()=>{
    document.querySelectorAll('.pv-dev').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    _pvState.device=btn.dataset.dev;
    frame.className='pv-device-frame '+btn.dataset.dev;
    setTimeout(()=>{paginate();renderPage()},50);
  })});

  // Font size control
  const fontSlider=$('pv-fontsize');const fontLabel=$('pv-fontsize-label');
  if(fontSlider){
    fontSlider.value=_pvState.fontSize;
    fontSlider.addEventListener('input',()=>{
      _pvState.fontSize=parseInt(fontSlider.value);
      if(fontLabel)fontLabel.textContent=_pvState.fontSize+'px';
      paginate();renderPage();
    });
  }

  // Nav button actions
  document.querySelectorAll('.pv-nbtn').forEach(btn=>{btn.addEventListener('click',()=>{
    const action=btn.dataset.action;
    if(action==='display'){$('pv-display-panel')?.classList.toggle('hidden')}
    else if(action==='theme'){_pvState.darkTheme=!_pvState.darkTheme;$('pv-screen')?.classList.toggle('dark-theme',_pvState.darkTheme)}
    else if(action==='workspace'){
      // Switch center panel back to annotated view, collapse preview
      document.querySelectorAll('.btab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.ms-page').forEach(p=>p.classList.remove('active'));
      document.querySelector('.btab[data-p="annotated"]')?.classList.add('active');
      $('ed-annotated')?.classList.add('active');
    }
    else if(action==='search'){
      const sp=$('pv-search-panel');sp?.classList.toggle('hidden');
      if(!sp?.classList.contains('hidden')){$('pv-search-input')?.focus();paginate();renderPage()}
    }
    else if(action==='notes'){
      _pvState.showNotes=!_pvState.showNotes;
      btn.style.opacity=_pvState.showNotes?'1':'.4';
      // Rebuild paraHTML with/without emotion markers and re-render
      const emotionByP={};
      (r.sceneEmotions||{scenes:[]}).scenes.forEach(s=>{emotionByP[s.paragraph]=s});
      _pvParaHTML=_pvParagraphs.map((p,i)=>{
        const emo=emotionByP[i+1];
        const isChap=chapterRe.test(p.trim());
        if(isChap)return '<div class="pv-para chapter-heading" data-para="'+(i+1)+'">'+esc(p)+'</div>';
        return '<div class="pv-para" data-para="'+(i+1)+'">'+(emo&&_pvState.showNotes?'<span class="pv-emo-inline">'+emo.emoji+'</span>':'')+esc(p)+'</div>';
      });
      renderPage();
    }
  })});

  // Collapse toggle
  const pvToggleBtn=$('pv-toggle');
  if(pvToggleBtn&&!pvToggleBtn._wired){
    pvToggleBtn._wired=true;
    pvToggleBtn.addEventListener('click',()=>{
      const p=$('preview-panel');p.classList.toggle('collapsed');
      pvToggleBtn.textContent=p.classList.contains('collapsed')?'\u00BB':'\u00AB';
    });
  };

  // Re-paginate on resize
  let resizeTimer;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(_pvState.pages.length>0){paginate();renderPage()}},200)});
}

// OPENING COACH
function showOpeningCoach(){
  if(!analysisResult)return;
  const od=analysisResult.openingDiagnosis;
  // Switch to a new panel view in the center
  document.querySelectorAll('.btab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.ms-page').forEach(p=>p.classList.remove('active'));

  // Create or reuse coach content
  let coach=$('ed-coach');
  if(!coach){coach=document.createElement('div');coach.id='ed-coach';coach.className='ms-page dark-page active';$('manuscript-scroll').appendChild(coach)}
  else{coach.classList.add('active');coach.classList.add('dark-page')}

  let h='<div style="max-width:700px;margin:0 auto">';

  // Header
  h+='<div class="a-sec" style="border-left:3px solid var(--red);margin-bottom:1rem"><h3>Opening Diagnosis <span style="color:'+sc(od.score)+'">'+od.score+'/100</span></h3>';
  h+='<p style="font-size:.78rem;color:var(--muted);margin-bottom:.6rem">Your opening is the most important part of your manuscript. Here\'s what we found:</p>';

  // Show the actual first sentence
  h+='<div style="background:var(--parchment);color:var(--ink);padding:.8rem 1rem;border-radius:var(--rs);font-family:Lora,serif;font-size:.95rem;line-height:1.6;margin-bottom:.75rem">';
  h+='<div style="font-size:.65rem;color:#666;margin-bottom:.3rem;font-family:Inter,sans-serif;text-transform:uppercase;letter-spacing:.5px">Your First Sentence:</div>';
  h+=esc(od.firstSentence);
  h+='</div>';
  h+='</div>';

  // Problems found
  if(od.problems.length>0){
    h+='<div class="a-sec" style="border-left:3px solid var(--yellow)"><h3>Problems Detected ('+od.problems.length+')</h3>';
    od.problems.forEach(p=>{
      const col=p.severity==='high'?'var(--red)':p.severity==='medium'?'var(--yellow)':'var(--muted)';
      const sev=p.severity==='high'?'CRITICAL':p.severity==='medium'?'IMPORTANT':'MINOR';
      h+='<div style="margin-bottom:.75rem;padding-bottom:.75rem;border-bottom:1px solid var(--border)">';
      h+='<div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.2rem"><span style="font-size:.6rem;font-weight:700;color:'+col+';background:'+col+'15;padding:.1rem .4rem;border-radius:3px">'+sev+'</span><strong style="font-size:.85rem">'+esc(p.title)+'</strong></div>';
      h+='<p style="font-size:.78rem;color:var(--muted);margin-bottom:.3rem;line-height:1.5">'+esc(p.desc)+'</p>';
      h+='<div style="font-size:.78rem;color:var(--green);background:var(--surface2);padding:.4rem .6rem;border-radius:var(--rs);border-left:2px solid var(--green)"><strong>Fix:</strong> '+esc(p.fix)+'</div>';
      h+='</div>';
    });
    h+='</div>';
  }else{
    h+='<div class="a-sec" style="border-left:3px solid var(--green)"><h3 style="color:var(--green)">No Major Problems Found</h3><p style="font-size:.8rem;color:var(--muted)">Your opening avoids the most common pitfalls. Check the strategies below to make it even stronger.</p></div>';
  }

  // Strategies
  h+='<div class="a-sec"><h3>Opening Strategies for '+esc(analysisResult.genre.label)+'</h3>';
  h+='<p style="font-size:.72rem;color:var(--muted);margin-bottom:.6rem">Try rewriting your opening using one of these approaches:</p>';
  od.strategies.forEach((s,i)=>{
    h+='<div style="margin-bottom:.75rem;padding:.6rem .8rem;background:var(--surface2);border-radius:var(--rs);border-left:3px solid var(--gold)">';
    h+='<div style="font-size:.82rem;font-weight:700;color:var(--gold-l);margin-bottom:.2rem">'+(i+1)+'. '+esc(s.title)+'</div>';
    h+='<p style="font-size:.78rem;color:var(--muted);margin-bottom:.3rem;line-height:1.5">'+esc(s.desc)+'</p>';
    h+='<div style="font-size:.8rem;font-family:Lora,serif;color:var(--text);background:var(--surface);padding:.4rem .6rem;border-radius:var(--rs);font-style:italic;line-height:1.6">'+esc(s.example)+'</div>';
    h+='</div>';
  });
  h+='</div>';

  // Show first paragraph for editing
  h+='<div class="a-sec"><h3>Your Current Opening</h3>';
  h+='<p style="font-size:.72rem;color:var(--muted);margin-bottom:.5rem">Edit directly below, then click "Re-analyze" to see your improved score:</p>';
  h+='<div id="coach-editor" contenteditable="true" style="background:var(--parchment);color:var(--ink);padding:1rem 1.2rem;border-radius:var(--rs);font-family:Lora,serif;font-size:.95rem;line-height:1.8;min-height:120px;outline:1px solid var(--gold-d);outline-offset:2px">'+esc(od.firstParagraph)+'</div>';
  h+='<div style="display:flex;gap:.4rem;margin-top:.6rem"><button class="btn-gold" id="coach-apply" style="width:auto;padding:.45rem 1.2rem;font-size:.8rem">Apply Changes & Re-analyze</button><button class="btn-dark" id="coach-back" style="font-size:.8rem">Back to Manuscript</button></div>';
  h+='</div>';

  h+='</div>'; // close max-width wrapper
  coach.innerHTML=h;

  // Button handlers
  $('coach-apply')?.addEventListener('click',()=>{
    const newOpening=$('coach-editor').textContent;
    const oldFirst=od.firstParagraph;
    // Replace the first paragraph in the extracted text
    const idx=extractedText.indexOf(oldFirst);
    if(idx>=0){extractedText=newOpening+extractedText.substring(idx+oldFirst.length)}
    else{extractedText=newOpening+'\n\n'+extractedText}
    // Re-analyze
    analysisResult=Analyzer.analyze(extractedText);
    if(!analysisResult.error)renderAll();
    // Switch back to annotated
    coach.classList.remove('active');
    document.querySelector('.btab[data-p="annotated"]')?.classList.add('active');
    $('ed-annotated')?.classList.add('active');
  });
  $('coach-back')?.addEventListener('click',()=>{
    coach.classList.remove('active');
    document.querySelector('.btab[data-p="annotated"]')?.classList.add('active');
    $('ed-annotated')?.classList.add('active');
  });
}

// BLURBS
function renderBlurbs(r){
  const d=$('ed-blurbs');if(!d)return;d.className='ms-page dark-page';
  const b=r.blurbs;
  if(!b||!b.available){
    d.innerHTML='<div class="a-sec"><h3>Blurb Generator</h3><p style="color:var(--muted);font-size:.85rem">'+(b?.reason||'Upload a full manuscript to generate blurb suggestions.')+'</p><p style="color:var(--dim);font-size:.75rem;margin-top:.5rem">Blurbs are generated for books and manuscripts over 5,000 words. The engine extracts your story\'s core elements — protagonist, conflict, stakes — and assembles 5 variations in different styles.</p></div>';
    return;
  }
  let h='<div class="a-sec"><h3>Blurb Generator</h3>';
  h+='<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.75rem;font-size:.72rem;color:var(--muted)">';
  h+='<span>Protagonist: <strong style="color:var(--gold-l)">'+esc(b.protagonist)+'</strong></span>';
  if(b.antagonist)h+='<span>Antagonist: <strong style="color:var(--red)">'+esc(b.antagonist)+'</strong></span>';
  h+='<span>Tone: <strong style="color:var(--text)">'+esc(b.toneDetected)+'</strong></span>';
  h+='<span>Words: <strong>'+b.wordCount.toLocaleString()+'</strong></span>';
  h+='</div></div>';

  // 6-question framework breakdown
  const fw=b.framework;
  h+='<div class="a-sec"><h3>Story Framework <span style="font-size:.7rem;color:var(--muted);font-weight:400">(extracted from manuscript)</span></h3>';
  const questions=[
    {q:'What does the character want?',a:fw.statusQuo},
    {q:'How does it change?',a:fw.incitingIncident},
    {q:'How does it get worse?',a:fw.conflict},
    {q:'How do they try to fix it?',a:fw.attempt},
    {q:'How does that make it worse?',a:fw.crisis},
    {q:'What is at stake?',a:fw.stakes}
  ];
  questions.forEach((q,i)=>{
    h+='<div style="margin-bottom:.5rem"><div style="font-size:.72rem;color:var(--gold);font-weight:600;margin-bottom:.15rem">Q'+(i+1)+': '+q.q+'</div><div style="font-size:.8rem;color:'+(q.a?'var(--text)':'var(--dim)')+';padding-left:.6rem;border-left:2px solid var(--border)">'+(q.a?esc(q.a):'<em>Could not extract — try adding clearer story beats</em>')+'</div></div>';
  });
  h+='</div>';

  // 5 Blurb variations
  b.blurbs.forEach((bl,i)=>{
    h+='<div class="a-sec blurb-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem"><h3 style="margin:0">'+esc(bl.style)+'</h3><span style="font-size:.65rem;color:var(--muted)">'+bl.wordCount+' words</span></div>';
    h+='<div style="font-size:.7rem;color:var(--dim);margin-bottom:.5rem;font-style:italic">'+esc(bl.description)+'</div>';
    h+='<div class="blurb-text" id="blurb-'+i+'">'+esc(bl.text).replace(/\n/g,'<br>')+'</div>';
    h+='<div style="display:flex;gap:.3rem;margin-top:.5rem"><button class="btn-dark blurb-copy" data-idx="'+i+'" style="font-size:.7rem;padding:.25rem .6rem">Copy</button><button class="btn-dark blurb-edit" data-idx="'+i+'" style="font-size:.7rem;padding:.25rem .6rem">Edit</button></div>';
    h+='</div>';
  });

  d.innerHTML=h;

  // Copy buttons
  d.querySelectorAll('.blurb-copy').forEach(btn=>{btn.addEventListener('click',()=>{
    const idx=btn.dataset.idx;const el=$('blurb-'+idx);
    navigator.clipboard.writeText(el.textContent);btn.textContent='Copied!';setTimeout(()=>{btn.textContent='Copy'},1500);
  })});
  // Edit buttons - make blurb editable
  d.querySelectorAll('.blurb-edit').forEach(btn=>{btn.addEventListener('click',()=>{
    const idx=btn.dataset.idx;const el=$('blurb-'+idx);
    if(el.contentEditable==='true'){el.contentEditable='false';el.style.outline='';btn.textContent='Edit'}
    else{el.contentEditable='true';el.style.outline='1px solid var(--gold-d)';el.style.outlineOffset='4px';el.focus();btn.textContent='Done'}
  })});
}

// TABS (bottom)
document.querySelectorAll('.btab').forEach(t=>{t.addEventListener('click',()=>{
  document.querySelectorAll('.btab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.ms-page').forEach(p=>{p.classList.remove('active')});
  t.classList.add('active');
  const target=$('ed-'+t.dataset.p);
  if(target){
    target.classList.add('active');
    if(t.dataset.p!=='annotated'&&!target.classList.contains('dark-page')){target.classList.add('dark-page')}
  }
  // Chapter nav only visible on Detailed (annotated) tab
  const chNav=$('chapter-nav');
  if(chNav)chNav.style.display=t.dataset.p==='annotated'?'':'none';
})});
// Bottom-icon buttons
(function(){
  const tabs=Array.from(document.querySelectorAll('.btab'));
  function activateTab(t){tabs.forEach(b=>b.classList.remove('active'));document.querySelectorAll('.ms-page').forEach(p=>p.classList.remove('active'));t.classList.add('active');const target=$('ed-'+t.dataset.p);if(target){target.classList.add('active');if(t.dataset.p!=='annotated'&&!target.classList.contains('dark-page'))target.classList.add('dark-page')}const chNav=$('chapter-nav');if(chNav)chNav.style.display=t.dataset.p==='annotated'?'':'none';}
  $('bi-prev-tab')?.addEventListener('click',()=>{const cur=tabs.findIndex(t=>t.classList.contains('active'));if(cur>0)activateTab(tabs[cur-1])});
  $('bi-next-tab')?.addEventListener('click',()=>{const cur=tabs.findIndex(t=>t.classList.contains('active'));if(cur<tabs.length-1)activateTab(tabs[cur+1])});
  $('bi-fullscreen')?.addEventListener('click',()=>{
    const lp=$('left-panel'),rp2=$('right-panel'),pp=$('preview-panel');
    const hidden=lp?.style.display==='none';
    if(hidden){if(lp)lp.style.display='';if(rp2)rp2.style.display='';if(pp)pp.style.display=''}
    else{if(lp)lp.style.display='none';if(rp2)rp2.style.display='none';if(pp)pp.style.display='none'}
  });
  let _fontSize=16;
  $('bi-zoom-in')?.addEventListener('click',()=>{_fontSize=Math.min(22,_fontSize+1);document.querySelectorAll('.ms-page').forEach(p=>p.style.fontSize=_fontSize+'px')});
  $('bi-zoom-out')?.addEventListener('click',()=>{_fontSize=Math.max(12,_fontSize-1);document.querySelectorAll('.ms-page').forEach(p=>p.style.fontSize=_fontSize+'px')});
})();

// Collapse/expand panels
$('lp-collapse-btn')?.addEventListener('click',()=>{
  const lp=$('left-panel');lp.classList.toggle('panel-collapsed');
  $('lp-collapse-btn').innerHTML=lp.classList.contains('panel-collapsed')?'&#9654;':'&#9660;';
});
$('rp-collapse-btn')?.addEventListener('click',()=>{
  const rp=$('right-panel');rp.classList.toggle('panel-collapsed');
  $('rp-collapse-btn').innerHTML=rp.classList.contains('panel-collapsed')?'&#9654;':'&#9660;';
});

// ============================================================
// DRAG-TO-RESIZE PANELS
// ============================================================
(function initPanelResize(){
  const panels=$('left-panel')?.parentElement; // .panels container
  if(!panels)return;
  const pp=$('preview-panel');
  const cp=document.querySelector('.center-panel');
  if(!pp||!cp)return;

  // Resize handle between center and preview (right side of center)
  const rHandle=document.createElement('div');
  rHandle.className='panel-resize resize-right';
  rHandle.title='Drag to resize';
  cp.style.position='relative';
  cp.appendChild(rHandle);

  let dragging=false,startX=0,startW=0;
  rHandle.addEventListener('mousedown',e=>{
    e.preventDefault();
    dragging=true;startX=e.clientX;startW=pp.offsetWidth;
    rHandle.classList.add('dragging');
    document.body.style.cursor='col-resize';
    document.body.style.userSelect='none';
  });
  document.addEventListener('mousemove',e=>{
    if(!dragging)return;
    const dx=startX-e.clientX;
    const newW=Math.max(150,Math.min(600,startW+dx));
    pp.style.width=newW+'px';pp.style.minWidth=newW+'px';
  });
  document.addEventListener('mouseup',()=>{
    if(!dragging)return;
    dragging=false;
    rHandle.classList.remove('dragging');
    document.body.style.cursor='';
    document.body.style.userSelect='';
  });
})();

// ============================================================
// TYPOGRAPHY CONTROLS — font family, size, line spacing
// ============================================================
$('fmt-font')?.addEventListener('change',e=>{
  const page=$('ed-annotated');
  if(page)page.style.fontFamily=e.target.value+',serif';
});
$('fmt-size')?.addEventListener('change',e=>{
  const page=$('ed-annotated');
  if(page)page.style.fontSize=e.target.value+'px';
});
$('fmt-spacing')?.addEventListener('change',e=>{
  const page=$('ed-annotated');
  if(page)page.style.lineHeight=e.target.value;
});

// Toolbar format buttons (bold, italic, underline, etc.)
document.querySelectorAll('.fmt-btn[data-cmd]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const cmd=btn.dataset.cmd;
    if(!cmd)return;
    if(cmd.startsWith('formatBlock:')){
      document.execCommand('formatBlock',false,'<'+cmd.split(':')[1]+'>');
    }else{
      document.execCommand(cmd,false,null);
    }
    // Refocus the editor
    $('ed-annotated')?.focus();
  });
});

// ============================================================
// WRITING RULER — tick marks
// ============================================================
(function initRuler(){
  const ticks=$('ms-ruler-ticks');if(!ticks)return;
  let h='';
  // 1 inch = ~96px; page is ~640px content width = ~6.67 inches
  // Draw marks every half-inch (48px), minor every quarter (24px)
  for(let i=0;i<=26;i++){
    const isMajor=i%2===0;
    h+='<div class="ms-ruler-tick '+(isMajor?'major':'minor')+'"></div>';
  }
  ticks.innerHTML=h;
})();

// ============================================================
// CHAPTER NAVIGATION — detect chapters, render sidebar, click-to-scroll
// ============================================================
function buildChapterNav(){
  const list=$('chn-list');if(!list)return;
  const page=$('ed-annotated');
  const text=extractedText||'';
  if(!text){list.innerHTML='<div style="padding:.5rem .7rem;font-size:.7rem;color:var(--dim)">No manuscript loaded</div>';return}

  const entries=[];

  // Method 1: Scan DOM for H1/H2 elements (most reliable after user edits)
  if(page){
    let charPos=0;
    for(const child of page.children){
      const tag=child.tagName;
      const txt=(child.textContent||'').trim();
      if(!txt){charPos+=2;continue}
      if(tag==='H1'){
        entries.push({title:txt,index:charPos,level:1,el:child});
      }else if(tag==='H2'){
        entries.push({title:txt,index:charPos,level:2,el:child});
      }
      charPos+=txt.length+2;
    }
  }

  // Method 2: Regex fallback on plain text (catches chapters not yet formatted as H1)
  if(entries.length===0){
    const chapterRe=/^(chapter\s+\d+[^\n]*|chapter\s+[a-z]+[^\n]*|part\s+\d+[^\n]*|part\s+[a-z]+[^\n]*|prologue[^\n]*|epilogue[^\n]*)/gim;
    const sectionRe=/^(section\s+\d+[^\n]*|scene\s+\d+[^\n]*)/gim;
    let m;
    while((m=chapterRe.exec(text))!==null){
      entries.push({title:m[1].trim(),index:m.index,level:1});
    }
    while((m=sectionRe.exec(text))!==null){
      entries.push({title:m[1].trim(),index:m.index,level:2});
    }
    entries.sort((a,b)=>a.index-b.index);
  }

  if(entries.length===0){
    list.innerHTML='<div style="padding:.5rem .7rem;font-size:.7rem;color:var(--dim)">No chapters detected</div>';
    return;
  }

  list.innerHTML=entries.map((e,i)=>{
    const label=e.title.length>28?e.title.substring(0,28)+'...':e.title;
    return '<div class="chn-item'+(e.level===2?' chn-h2':'')+'" data-ch-idx="'+i+'" data-ch-offset="'+e.index+'" title="'+escA(e.title)+'">'+esc(label)+'</div>';
  }).join('');

  // Click to scroll — use DOM element reference when available
  const _navEntries=entries;
  list.querySelectorAll('.chn-item').forEach((item,i)=>{
    item.addEventListener('click',()=>{
      list.querySelectorAll('.chn-item').forEach(c=>c.classList.remove('active'));
      item.classList.add('active');
      const entry=_navEntries[i];
      if(entry&&entry.el){
        entry.el.scrollIntoView({behavior:'smooth',block:'center'});
      }else{
        const offset=parseInt(item.dataset.chOffset);
        scrollToTextOffset(offset);
      }
    });
  });

  // Mark first chapter as active
  const first=list.querySelector('.chn-item');
  if(first)first.classList.add('active');
}

function scrollToTextOffset(charOffset){
  const page=$('ed-annotated');if(!page)return;
  // Walk text nodes to find the position
  const walker=document.createTreeWalker(page,NodeFilter.SHOW_TEXT,null);
  let pos=0;
  while(walker.nextNode()){
    const node=walker.currentNode;
    if(pos+node.length>=charOffset){
      // Found the node — scroll its parent into view
      const parent=node.parentElement;
      if(parent){
        parent.scrollIntoView({behavior:'smooth',block:'center'});
        // Brief highlight
        const origBg=parent.style.background;
        parent.style.background='rgba(200,149,108,.2)';
        parent.style.borderRadius='3px';
        setTimeout(()=>{parent.style.background=origBg},2000);
      }
      return;
    }
    pos+=node.length;
  }
}

// Update chapter nav highlight on scroll
function updateChapterNavOnScroll(){
  const scroll=$('manuscript-scroll');
  const list=$('chn-list');
  if(!scroll||!list)return;
  scroll.addEventListener('scroll',()=>{
    // Debounce
    clearTimeout(scroll._chNavTimer);
    scroll._chNavTimer=setTimeout(()=>{
      const items=list.querySelectorAll('.chn-item');
      if(!items.length)return;
      // Find which chapter heading is currently visible
      const page=$('ed-annotated');if(!page)return;
      const headings=page.querySelectorAll('h1,h2,.hl');
      // Simple: find the last heading that's above the scroll midpoint
      const scrollMid=scroll.scrollTop+scroll.clientHeight/3;
      let activeIdx=0;
      items.forEach((item,i)=>{
        const offset=parseInt(item.dataset.chOffset);
        // Approximate: chapters at roughly (offset/totalChars)*scrollHeight
        const approxPos=(offset/(extractedText||'').length)*scroll.scrollHeight;
        if(approxPos<=scrollMid)activeIdx=i;
      });
      items.forEach(c=>c.classList.remove('active'));
      if(items[activeIdx])items[activeIdx].classList.add('active');
    },150);
  });
}

// ============================================================
// PAGE-BASED RENDERING — structure text into book pages
// ============================================================
function renderAnnotatedAsPages(text,issues){
  const p=$('ed-annotated');
  p.className='ms-page active parchment';
  // Force parchment styles inline as fallback — guarantees cream background + black text
  p.style.cssText='background:#faf6ee !important;color:#000 !important';
  p.setAttribute('contenteditable','true');
  p.setAttribute('spellcheck','false');
  if(!p._hasInputListener){
    p.addEventListener('input',()=>{scheduleReanalyze();syncPreview();});
    p._hasInputListener=true;
  }

  const chapterRe=/^(chapter\s+\d+\s*:?[^\n]*|chapter\s+[a-z]+\s*:?[^\n]*|part\s+\d+\s*:?[^\n]*|part\s+[a-z]+\s*:?[^\n]*|prologue\s*:?[^\n]*|epilogue\s*:?[^\n]*)/i;
  const sceneBreakRe=/^\s*(\*\s*\*\s*\*|#\s*#\s*#|---+|~~~+|\* \* \*)\s*$/;

  // Build non-overlapping issues sorted by position
  const sorted=[...issues].sort((a,b)=>a.index-b.index);
  const noOverlap=[];let lastEnd=-1;
  for(const i of sorted){if(i.index>=lastEnd){noOverlap.push(i);lastEnd=i.index+i.length}}

  // Split text into paragraphs using regex to track exact positions
  const paraBounds=[];
  const splitter=/\n\s*\n/g;
  let lastIdx=0,splitMatch;
  while((splitMatch=splitter.exec(text))!==null){
    const chunk=text.substring(lastIdx,splitMatch.index);
    if(chunk.trim().length>0){
      // Find the trimmed content's exact position within the chunk
      const leadingWS=chunk.length-chunk.trimStart().length;
      const trimmed=chunk.trim();
      paraBounds.push({start:lastIdx+leadingWS,end:lastIdx+leadingWS+trimmed.length,text:trimmed});
    }
    lastIdx=splitMatch.index+splitMatch[0].length;
  }
  // Handle last paragraph
  if(lastIdx<text.length){
    const chunk=text.substring(lastIdx);
    if(chunk.trim().length>0){
      const leadingWS=chunk.length-chunk.trimStart().length;
      const trimmed=chunk.trim();
      paraBounds.push({start:lastIdx+leadingWS,end:lastIdx+leadingWS+trimmed.length,text:trimmed});
    }
  }

  // Build structured HTML with correct positions
  let structured='';
  for(const pb of paraBounds){
    if(chapterRe.test(pb.text)){
      structured+='<h1>'+getAnnotatedSlice(text,pb.start,pb.end,noOverlap)+'</h1>';
    }else if(sceneBreakRe.test(pb.text)){
      structured+='<div class="scene-break">* * *</div>';
    }else{
      structured+='<p>'+getAnnotatedSlice(text,pb.start,pb.end,noOverlap)+'</p>';
    }
  }

  // Add page number footer
  const wordCount=(text.match(/\S+/g)||[]).length;
  const estPages=Math.max(1,Math.ceil(wordCount/250));
  structured+='<div class="ms-page-footer">Page 1 of ~'+estPages+'</div>';

  p.innerHTML=structured;

  // Wire tooltip on highlights
  const tip=$('tip');
  let activeHL=null;
  if(!p._hasClickListener){
  p._hasClickListener=true;
  p.addEventListener('click',e=>{
    const hl=e.target.closest('.hl');
    if(hl&&!hl.classList.contains('off')){
      activeHL=hl;
      const labels={passive:'Passive voice detected',adverb:'Adverb detected',cliche:'Cliche detected','weak-verb':'Weak verb detected',wordy:'Wordy phrase','show-tell':'Show vs Tell',repetition:'Word repetition','sentence-length':'Long sentence','confused-word':'Wrong word'};
      const t=hl.dataset.t;
      const sug=hl.dataset.s||'';
      // Determine if this issue has an auto-replacement available
      const hasAI=!!sug.match(/Replace with:\s*".+?"/);
      const hasTry=!!sug.match(/Try:\s*.+/i);
      // Types with reliable auto-fix: wordy (has "Replace with"), weak-verb/repetition (has "Try:"), adverb (remove), passive (restructure), cliche (has map)
      const canAutoFix=hasAI||hasTry||t==='adverb'||t==='wordy'||t==='cliche';
      const fixLabel=canAutoFix?'Replace &amp; Fix':'Edit Here';
      tip.innerHTML='<div class="tip-cat">'+(labels[t]||t)+'</div><div class="tip-sug">\u2192 Suggestion:</div><div class="tip-quote">\u201C'+sug+'\u201D</div><div class="tip-btns"><button class="tip-fix" id="tip-fix-btn">'+fixLabel+'</button><button class="tip-ign" id="tip-ign-btn">Ignore</button></div>';
      tip.classList.add('on');
      const rect=hl.getBoundingClientRect();
      tip.style.top=(rect.bottom+8)+'px';
      tip.style.left=Math.min(rect.left,window.innerWidth-360)+'px';
      $('tip-fix-btn').onclick=()=>{
        if(canAutoFix){replaceAndFix(activeHL)}
        else{
          // Focus the highlight text for manual editing
          tip.classList.remove('on');
          const sel=window.getSelection();
          const range=document.createRange();
          range.selectNodeContents(hl);
          sel.removeAllRanges();sel.addRange(range);
          hl.focus();
        }
      };
      $('tip-ign-btn').onclick=()=>{activeHL.classList.add('off');tip.classList.remove('on')};
    }else if(!e.target.closest('.tip')){tip.classList.remove('on')}
  });
  } // end click listener guard

  // Build chapter nav after rendering
  buildChapterNav();
  updateChapterNavOnScroll();
}

// Helper: get annotated HTML for a text slice
function getAnnotatedSlice(fullText,start,end,issues){
  let h='',pos=start;
  for(const i of issues){
    if(i.index>=end)break;
    if(i.index+i.length<=start)continue;
    const iStart=Math.max(i.index,start);
    const iEnd=Math.min(i.index+i.length,end);
    if(iStart>pos)h+=esc(fullText.substring(pos,iStart));
    h+='<span class="hl" data-t="'+i.type+'" data-m="'+escA(i.message)+'" data-s="'+escA(i.suggestion)+'" data-q="'+escA(i.text.substring(0,60))+'">'+esc(fullText.substring(iStart,iEnd))+'</span>';
    pos=iEnd;
  }
  if(pos<end)h+=esc(fullText.substring(pos,end));
  return h;
}

// ============================================================
// SMART BEHAVIOR — auto-detect "Chapter X" and convert to heading
// ============================================================
(function initSmartHeadings(){
  const page=$('ed-annotated');if(!page)return;
  page.addEventListener('keydown',e=>{
    if(e.key!=='Enter')return;
    // Check if current line starts with "Chapter" or "Part"
    const sel=window.getSelection();
    if(!sel||!sel.rangeCount)return;
    const node=sel.anchorNode;
    if(!node)return;
    const lineText=(node.textContent||'').trim();
    const chapterRe=/^(chapter\s+\d+\s*:?[^\n]*|chapter\s+[a-z]+\s*:?[^\n]*|part\s+\d+\s*:?[^\n]*|part\s+[a-z]+\s*:?[^\n]*|prologue\s*:?[^\n]*|epilogue\s*:?[^\n]*)$/i;
    if(chapterRe.test(lineText)){
      // Convert the current block to H1
      const parentBlock=node.parentElement?.closest('p,div,h1,h2,h3')||node.parentElement;
      if(parentBlock&&parentBlock.tagName!=='H1'){
        e.preventDefault();
        document.execCommand('formatBlock',false,'<h1>');
        // Move cursor to next line
        setTimeout(()=>{
          document.execCommand('insertParagraph',false);
          document.execCommand('formatBlock',false,'<p>');
        },10);
      }
    }
  });
})();

document.querySelectorAll('.rtab').forEach(t=>{t.addEventListener('click',()=>{
  document.querySelectorAll('.rtab').forEach(b=>b.classList.remove('active'));t.classList.add('active');
  const mode=t.textContent.trim().toLowerCase();
  if(!analysisResult)return;
  const d=$('rp-detail');const r=analysisResult;
  if(mode==='suggestions'){renderRight(r);return}
  if(mode==='rewrite'){
    const samples=r.issues.filter(i=>_REWRITE_TYPES.has(i.type)).slice(0,8);
    d.innerHTML='<div class="rpd-title">Rewrite Suggestions <span class="rpd-exp-badge" style="margin-left:.4rem">Experimental</span></div>'+(samples.length===0?'<p style="color:var(--muted);font-size:.78rem">No rewrite targets found.</p>':samples.map(i=>'<div class="rpd-issue" data-issue-text="'+escA(i.text)+'" data-issue-sug="'+escA(i.suggestion)+'" data-has-fix="'+(i.type==='adverb'||i.type==='passive'||i.type==='wordy'||i.type==='cliche'?'1':'0')+'" data-issue-type="'+escA(i.type)+'" data-issue-index="'+(i.index||0)+'"><div class="rpd-issue-head">'+esc(i.text.substring(0,40))+'</div><div class="rpd-desc">'+esc(i.suggestion)+'</div><div class="rpd-quote rpd-navigate" style="cursor:pointer" title="Click to jump to this text">\u2018'+esc(i.text.substring(0,60))+'\u2019</div><div class="rpd-btns"><button class="rpd-rewrite-btn">\u2736 Rewrite</button><button class="tip-ign rpd-ign-btn">Dismiss</button></div></div>').join(''));
    d.querySelectorAll('.rpd-navigate').forEach(q=>{q.addEventListener('click',()=>{const card=q.closest('.rpd-issue');const issueText=card.dataset.issueText;document.querySelectorAll('.btab').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.ms-page').forEach(p=>p.classList.remove('active'));const ab=document.querySelector('.btab[data-p="annotated"]');if(ab)ab.classList.add('active');$('ed-annotated')?.classList.add('active');const page=$('ed-annotated');const q2=issueText.substring(0,60).replace(/"/g,'&quot;');const hl=page?.querySelector('.hl[data-q="'+q2+'"]');if(hl){hl.scrollIntoView({behavior:'smooth',block:'center'});hl.style.outline='3px solid var(--gold)';hl.style.outlineOffset='3px';setTimeout(()=>{hl.style.outline=''},3000)}})});
    d.querySelectorAll('.rpd-rewrite-btn').forEach(btn=>{btn.addEventListener('click',()=>{doRewrite(btn.closest('.rpd-issue'))})});
    d.querySelectorAll('.rpd-ign-btn').forEach(btn=>{btn.addEventListener('click',()=>{const card=btn.closest('.rpd-issue');const page=$('ed-annotated');const q=card.dataset.issueText.substring(0,60).replace(/"/g,'&quot;');const hl=page?.querySelector('.hl[data-q="'+q+'"]');if(hl)hl.classList.add('off');card.remove()})});
  }
  if(mode==='tone shift'){
    d.innerHTML='<div class="rpd-title">Tone Analysis</div><div class="rpd-issue"><div class="rpd-issue-head">Current Tone</div><div class="rpd-desc">POV: '+esc(r.style.pov)+'<br>Lexical Diversity: '+r.style.lexicalDiversity+'/100<br>Avg Word Length: '+r.style.avgWordLength+' chars</div></div><div class="rpd-issue"><div class="rpd-issue-head">Emotional Tone</div><div class="rpd-desc">'+r.readerPerspective.emotionalJourney.map(e=>e.emotion+': '+e.intensity+'%').join(' &middot; ')+'</div></div><div class="rpd-issue"><div class="rpd-issue-head">Suggestion</div><div class="rpd-desc">'+(r.style.lexicalDiversity<40?'Consider using more varied vocabulary to enrich the tone.':r.style.lexicalDiversity>70?'Strong vocabulary variety. Consider if some words are too obscure for your audience.':'Good tonal balance. The vocabulary suits the genre well.')+'</div></div>';
  }
  if(mode.startsWith('dial')){
    d.innerHTML='<div class="rpd-title">Dialogue Analysis</div><div class="rpd-issue"><div class="rpd-issue-head">Dialogue Stats</div><div class="rpd-desc">Lines: '+r.dialogue.count+'<br>Ratio: '+r.dialogue.ratio+'% of text<br>"Said" usage: '+r.dialogue.saidRatio+'%<br>Tag variety: '+Object.keys(r.dialogue.tags).length+' unique tags</div></div>'+(r.dialogue.count===0?'<div class="rpd-issue"><div class="rpd-desc">No dialogue detected. If this is fiction, adding dialogue can improve pacing and character development.</div></div>':'<div class="rpd-issue"><div class="rpd-issue-head">Tags Used</div><div class="rpd-desc">'+Object.entries(r.dialogue.tags).map(([k,v])=>k+' ('+v+')').join(', ')+'</div></div>');
  }
})});

// AI
$('run-ai-btn')?.addEventListener('click',async()=>{
  if(!analysisResult)return;
  // Just try the proxy directly — no test ping needed
  runAI(null);
});
// API keys handled server-side only
async function runAI(key){
  if(!analysisResult)return;
  const st=$('ai-status'),stxt=$('ai-status-text');
  st.classList.remove('hidden');
  stxt.textContent='Connecting to AI...';
  try{
    const ai=await AIEngine.runAllFeatures(key,extractedText,analysisResult,(l,i,n)=>{stxt.textContent=l+' ('+(i+1)+'/'+n+')'});
    // Check if first result has an error (proxy might be misconfigured)
    const firstResult=Object.values(ai)[0];
    if(firstResult?.error){
      throw new Error(firstResult.error);
    }
    analysisResult._aiResults=ai;
    renderAI(ai);
    st.classList.add('hidden');
    $('ai-results').classList.remove('hidden');
    document.querySelector('.ai-intro')?.classList.add('hidden');
  }catch(e){
    st.classList.add('hidden');
    const msg=e.message||'Unknown error';
    const isRateLimit=msg.includes('limit reached')||msg.includes('RATE_LIMITED');
    const intro=document.querySelector('.ai-intro');
    if(intro){
      if(isRateLimit){
        intro.innerHTML='<div style="padding:1.5rem;text-align:center"><div style="font-size:2.5rem;margin-bottom:.5rem">&#128274;</div><h4 style="color:var(--gold-l);margin-bottom:.5rem">Daily Limit Reached</h4><p style="color:var(--muted);font-size:.85rem;margin-bottom:1rem">Free accounts get 3 AI analyses per day.</p><p style="color:var(--muted);font-size:.78rem">Resets at midnight UTC.</p><button class="btn-gold" style="width:auto;padding:.5rem 1.5rem;margin-top:1rem" onclick="document.getElementById(\'pricing-modal\').classList.remove(\'hidden\')">&#9733; Upgrade to Premium — $5/mo</button><p style="color:var(--dim);font-size:.7rem;margin-top:.5rem">50 AI analyses/day + Claude deep critique</p></div>';
      }else{
        intro.innerHTML='<div style="color:var(--red);padding:1rem"><h4>AI Analysis Error</h4><p style="margin:.5rem 0;font-size:.85rem">'+esc(msg)+'</p><button class="btn-gold" style="width:auto;padding:.4rem 1rem;margin-top:.75rem" onclick="runAI(null)">Retry</button></div>';
      }
      intro.classList.remove('hidden');
    }
  }
}
function renderAI(ai){
  const dc=ai.deepCritique;if(dc&&!dc.error)$('ai-deep-critique').innerHTML='<h3>Deep Critique</h3><p>'+esc(dc.overallAssessment||'')+'</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin:.5rem 0"><div><h4 style="color:var(--green);font-size:.75rem">Strengths</h4><ul class="ai-list">'+(dc.strengths||[]).map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul></div><div><h4 style="color:var(--red);font-size:.75rem">Weaknesses</h4><ul class="ai-list">'+(dc.weaknesses||[]).map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul></div></div><div style="padding:.4rem;background:var(--surface2);border-radius:var(--rs);margin-top:.4rem"><strong style="color:var(--yellow)">Priority Fix:</strong> '+esc(dc.priorityFix||'')+'</div>';
  const ct=ai.compTitles;if(ct&&!ct.error)$('ai-comp-titles').innerHTML='<h3>Comp Titles</h3><div style="padding:.4rem;background:var(--surface2);border-radius:var(--rs);font-weight:600;color:var(--gold-l);margin:.4rem 0">'+esc(ct.pitchLine||'')+'</div><div class="comp-grid">'+(ct.compTitles||[]).map(c=>'<div class="comp-card"><div class="comp-title">'+esc(c.title)+'</div><div class="comp-author">'+esc(c.author)+'</div><div class="comp-reason">'+esc(c.reason)+'</div></div>').join('')+'</div>';
  const ql=ai.queryLetter;if(ql&&!ql.error)$('ai-query-letter').innerHTML='<h3>Query Letter</h3><div class="ql-text">'+esc(ql.queryLetter||'').replace(/\n/g,'<br>')+'</div><button class="btn-dark" style="margin-top:.4rem" onclick="navigator.clipboard.writeText('+JSON.stringify(ql.queryLetter||'')+');this.textContent=\'Copied!\'">Copy</button>';
  const br=ai.betaReaders;if(br&&!br.error)$('ai-beta-readers').innerHTML='<h3>Beta Readers</h3><div class="beta-grid">'+(br.readers||[]).map(r=>'<div class="beta-card"><div class="beta-hdr"><span class="beta-nm">'+esc(r.name)+' '+(r.emoticon||'')+'</span><span class="beta-rt">'+'\u2605'.repeat(r.rating||0)+'</span></div><div class="beta-pro">'+esc(r.profile)+'</div><div class="beta-rx">'+esc(r.reaction)+'</div></div>').join('')+'</div>';
  const mr=ai.marketReadiness;if(mr&&!mr.error)$('ai-market-readiness').innerHTML='<h3>Market Readiness</h3><div style="font-size:1.8rem;font-weight:800;color:'+sc(mr.readinessScore||0)+'">'+(mr.readinessScore||0)+'/100</div>'+sr('Path',mr.publishingPath||'')+sr('Stage',mr.developmentalStage||'')+sr('Trends',mr.trendAlignment||'');
  const cb=ai.chapterBreakdown;if(cb&&!cb.error)$('ai-chapter-breakdown').innerHTML='<h3>Chapters</h3><p style="font-size:.75rem;color:var(--muted)">'+esc(cb.structureAssessment||'')+'</p><div class="ch-grid2">'+(cb.chapters||[]).map(c=>'<div class="ch-card2"><div class="ch-num">'+c.number+'</div><div><div class="ch-ttl">'+esc(c.title||'')+'</div><div class="ch-sum">'+esc(c.summary||'')+'</div><div style="display:flex;gap:.2rem;margin-top:.2rem"><span class="ch-bdg">'+c.pacingGrade+'</span><span class="ch-bdg">'+c.tensionLevel+'</span></div></div></div>').join('')+'</div>';
}

// VERSIONS
function renderVersions(){const c=$('ed-versions');if(!c)return;c.className='ms-page dark-page';const vs=AIEngine.getVersionHistory();if(!vs.length){c.innerHTML='<p style="color:var(--muted);text-align:center;padding:2rem;font-size:.85rem">No versions yet.</p>';return}let h='<div class="v-head"><h3>Revision History</h3><button class="btn-dark" id="clr-v" style="font-size:.65rem;padding:.2rem .5rem">Clear</button></div><div class="v-tl">';vs.slice().reverse().forEach(v=>{const d=new Date(v.date);const col=scHex(v.overall);h+='<div class="v-item"><div class="v-dot" style="background:'+col+'"></div><div class="v-box"><div class="v-top"><span class="v-grade" style="color:'+col+'">'+v.grade+' ('+v.overall+'/100)</span><span class="v-date">'+d.toLocaleDateString()+'</span></div><div class="v-name">'+esc(v.fileName)+'</div><div class="v-stats">'+v.wordCount.toLocaleString()+' words &middot; '+v.totalIssues+' issues</div></div></div>'});h+='</div>';
if(vs.length>=2){const f=vs[0],l=vs[vs.length-1],d=l.overall-f.overall;h+='<div class="v-sum"><h4>Progress</h4>'+sr('Score',(d>=0?'+':'')+d)+sr('Issues',(l.totalIssues-f.totalIssues>=0?'+':'')+(l.totalIssues-f.totalIssues))+sr('Versions',vs.length)+'</div>'}
c.innerHTML=h;c.querySelector('#clr-v')?.addEventListener('click',()=>{if(confirm('Clear?')){AIEngine.clearVersionHistory();renderVersions()}})}

// EXPORT to Word (.doc) with colored issue highlights
$('export-btn')?.addEventListener('click',()=>{
  if(!analysisResult||!extractedText)return;
  const r=analysisResult;
  const issueColors={passive:'#FFD700','weak-verb':'#FFA500',adverb:'#87CEEB',cliche:'#FF6347',wordy:'#DDA0DD','show-tell':'#98FB98',repetition:'#F0E68C','sentence-length':'#FFC0CB'};
  const issueLabels={passive:'Passive Voice','weak-verb':'Weak Verb',adverb:'Adverb',cliche:'Cliché',wordy:'Wordy','show-tell':'Show vs Tell',repetition:'Repetition','sentence-length':'Long Sentence'};

  // Build annotated HTML
  const sorted=[...r.issues].sort((a,b)=>a.index-b.index);
  const noOverlap=[];let lastEnd=-1;
  for(const i of sorted){if(i.index>=lastEnd){noOverlap.push(i);lastEnd=i.index+i.length}}

  let body='';let pos=0;
  for(const i of noOverlap){
    if(i.index>pos)body+=esc(extractedText.substring(pos,i.index)).replace(/\n\n/g,'</p><p>');
    const col=issueColors[i.type]||'#FFD700';
    body+='<span style="background:'+col+';padding:1px 2px" title="'+esc(i.message)+'">'+esc(extractedText.substring(i.index,i.index+i.length))+'</span>';
    if(i.suggestion)body+='<span style="color:#2E8B57;font-size:9pt"> ['+esc(i.suggestion)+']</span>';
    pos=i.index+i.length;
  }
  if(pos<extractedText.length)body+=esc(extractedText.substring(pos)).replace(/\n\n/g,'</p><p>');

  // Build legend
  let legend='<table style="border-collapse:collapse;margin-bottom:20px">';
  Object.entries(issueColors).forEach(([k,c])=>{
    const count=r.issueCounts[k]||0;
    if(count>0)legend+='<tr><td style="background:'+c+';padding:3px 10px;border:1px solid #ccc">'+issueLabels[k]+'</td><td style="padding:3px 10px;border:1px solid #ccc">'+count+' issues</td></tr>';
  });
  legend+='</table>';

  // Score summary
  let scores='<h2 style="color:#8B4513">AuthorScrolls Analysis Report</h2>';
  scores+='<p><b>File:</b> '+esc(uploadedFile.name)+' | <b>Genre:</b> '+esc(r.genre.label)+' | <b>Words:</b> '+r.totalWords.toLocaleString()+'</p>';
  scores+='<p><b>Overall Score: '+r.overall+'/100</b></p>';
  scores+='<table style="border-collapse:collapse;margin-bottom:15px"><tr><td style="padding:4px 12px;border:1px solid #ccc"><b>Plot</b><br>'+r.scores.plot+'</td><td style="padding:4px 12px;border:1px solid #ccc"><b>Copy</b><br>'+r.scores.copy+'</td><td style="padding:4px 12px;border:1px solid #ccc"><b>Style</b><br>'+r.scores.style+'</td><td style="padding:4px 12px;border:1px solid #ccc"><b>Dialogue</b><br>'+r.scores.dialogue+'</td><td style="padding:4px 12px;border:1px solid #ccc"><b>Show/Tell</b><br>'+r.scores.showTell+'</td></tr></table>';

  const html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Cambria,Georgia,serif;font-size:12pt;line-height:1.8;max-width:6.5in;margin:1in}p{text-indent:0.5in;margin:0 0 6pt 0}h1,h2{font-family:Calibri,sans-serif;text-indent:0}table{font-family:Calibri,sans-serif;font-size:10pt}</style></head><body>'+scores+legend+'<h2 style="color:#8B4513">Manuscript with Highlights</h2><p>'+body+'</p><hr><p style="text-indent:0;font-size:9pt;color:#999">Generated by AuthorScrolls &middot; '+new Date().toLocaleDateString()+'</p></body></html>';

  const blob=new Blob([html],{type:'application/msword'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=uploadedFile.name.replace(/\.\w+$/,'')+'-AuthorScrolls.doc';
  a.click();
});

// SAVE / LOAD
function _showSaveToast(msg){
  let toast=document.getElementById('save-toast');
  if(!toast){toast=document.createElement('div');toast.id='save-toast';toast.style.cssText='position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:#1e1812;border:1px solid rgba(200,149,108,.3);color:var(--gold-l);padding:.4rem 1rem;border-radius:6px;font-size:.78rem;z-index:999;opacity:0;transition:opacity .3s;font-family:Inter,sans-serif';document.body.appendChild(toast)}
  toast.textContent=msg;toast.style.opacity='1';
  clearTimeout(toast._t);toast._t=setTimeout(()=>{toast.style.opacity='0'},2000);
}
async function saveAnalysis(){
  if(!analysisResult||!uploadedFile)return;
  // Save to Firestore
  if(Storage.userId){
    try{
      if(!Storage._currentManuscriptId){
        Storage._currentManuscriptId=await Storage.saveManuscript(uploadedFile.name,extractedText,analysisResult);
      }else{
        await Storage.updateManuscript(Storage._currentManuscriptId,extractedText,analysisResult);
      }
      await Storage.saveVersion(Storage._currentManuscriptId,analysisResult);
      _showSaveToast('Saved to cloud');
      return;
    }catch(e){console.warn('Cloud save error:',e.message)}
  }
  // Fallback to localStorage
  const saves=JSON.parse(localStorage.getItem('ml_saves')||'[]');
  saves.push({fileName:uploadedFile.name,text:extractedText,result:analysisResult,savedAt:new Date().toISOString()});
  if(saves.length>10)saves.splice(0,saves.length-10);
  localStorage.setItem('ml_saves',JSON.stringify(saves));
  _showSaveToast('Saved locally');
}

// ============================================================
// LIBRARY DASHBOARD — Render manuscript cards
// ============================================================
let _libManuscripts=[];

async function renderLibrary(){
  const recentSection=$('lib-recent-section');
  const recentCards=$('lib-recent-cards');
  const allCards=$('lib-all-cards');
  const loading=$('lib-loading');
  if(!allCards)return;

  // Show loading
  if(loading)loading.classList.remove('hidden');

  // Load manuscripts from Firestore
  let manuscripts=[];
  if(Storage.userId){
    try{manuscripts=await Storage.getManuscripts()}catch(e){console.warn('Firestore load error:',e.message)}
  }
  // Fallback to localStorage bookshelf
  if(manuscripts.length===0){
    const shelf=JSON.parse(localStorage.getItem('ml_bookshelf')||'[]');
    const saves=JSON.parse(localStorage.getItem('ml_saves')||'[]');
    const all=[...shelf,...saves];
    manuscripts=all.map((s,i)=>({id:null,fileName:s.fileName,overall:s.result?.overall||s.overall||0,wordCount:s.result?.totalWords||s.totalWords||0,genre:s.result?.genre?.label||s.genre||'',updatedAt:{toDate:()=>new Date(s.savedAt||Date.now())},text:s.text,_local:true,_data:s}));
  }

  // Deduplicate by fileName — keep the most recently updated entry
  const seen=new Map();
  for(const m of manuscripts){
    const key=(m.fileName||'').toLowerCase().trim();
    if(!seen.has(key)){seen.set(key,m)}else{
      const prev=seen.get(key);
      const prevDate=prev.updatedAt?.toDate?prev.updatedAt.toDate():new Date(0);
      const currDate=m.updatedAt?.toDate?m.updatedAt.toDate():new Date(0);
      if(currDate>prevDate)seen.set(key,m);
    }
  }
  manuscripts=Array.from(seen.values());

  _libManuscripts=manuscripts;
  if(loading)loading.classList.add('hidden');

  // Detect chapter count from text
  function chapterCount(text){
    if(!text)return 0;
    return (text.match(/^(chapter\s+\d+[^\n]*|chapter\s+[a-z]+[^\n]*)/gim)||[]).length;
  }

  // Time ago helper
  function timeAgo(date){
    const h=(Date.now()-date.getTime())/3600000;
    if(h<1)return 'Just now';
    if(h<24)return Math.floor(h)+' hours ago';
    if(h<48)return 'Yesterday';
    return Math.floor(h/24)+' days ago';
  }

  // Status badge
  function statusBadge(m){
    const s=m.overall||0;
    if(s>=70)return '<span class="lib-card-badge lib-badge-analyzed">&#9679; Analyzed</span>';
    if(s>=45)return '<span class="lib-card-badge lib-badge-progress">&#9679; In Progress</span>';
    if(s>0)return '<span class="lib-card-badge lib-badge-needs">&#9679; Needs Work</span>';
    return '<span class="lib-card-badge lib-badge-draft">&#9679; Draft</span>';
  }

  // Score circle
  function scoreCircle(s){
    if(!s)return '';
    const col=s>=70?'var(--green)':s>=45?'var(--yellow)':'var(--red)';
    return '<div class="lib-card-score" style="color:'+col+';border-color:'+col+'">'+s+'</div>';
  }

  // Build card HTML
  function cardHtml(m,i,isRecent){
    const date=m.updatedAt?.toDate?m.updatedAt.toDate():new Date();
    const chs=chapterCount(m.text);
    const chLabel=chs>0?chs+' Chapters':'';
    const name=esc(m.fileName||'Untitled').replace(/\.\w+$/,'');
    return '<div class="lib-card'+(isRecent?' lib-card-recent':'')+'" data-lib-idx="'+i+'">'+
      scoreCircle(m.overall)+
      '<div class="lib-card-title" title="'+escA(m.fileName)+'">'+name+'</div>'+
      '<div class="lib-card-meta">'+(chLabel?chLabel+' &middot; ':'')+
        'Last edited: '+timeAgo(date)+
        (m.genre?' &middot; '+esc(m.genre):'')+
        (m.wordCount?' &middot; '+(m.wordCount).toLocaleString()+' words':'')+
      '</div>'+
      statusBadge(m)+
      '<div class="lib-card-actions">'+
        '<button class="lib-btn-open" data-action="open" data-idx="'+i+'">Open</button>'+
        '<button class="lib-btn-analyze" data-action="analyze" data-idx="'+i+'">Analyze</button>'+
        '<button class="lib-btn-more" data-action="more" data-idx="'+i+'">&middot;&middot;&middot;</button>'+
      '</div>'+
    '</div>';
  }

  // Continue Writing — most recent 3 edited in last 7 days
  const recent=manuscripts.filter(m=>{
    const d=m.updatedAt?.toDate?m.updatedAt.toDate():new Date(0);
    return (Date.now()-d.getTime())<7*24*3600000;
  }).slice(0,3);

  if(recent.length>0&&recentSection&&recentCards){
    recentSection.classList.remove('hidden');
    recentCards.innerHTML=recent.map((m,i)=>cardHtml(m,manuscripts.indexOf(m),true)).join('');
  }else if(recentSection){
    recentSection.classList.add('hidden');
  }

  // All Manuscripts — add card is always first
  const addCardHtml='<div class="lib-card lib-card-add" id="lib-add-btn">'+
    '<svg class="lib-add-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'+
    '<span class="lib-add-title">Add Manuscript</span>'+
    '<span class="lib-add-sub">Upload .docx, .pdf, .txt<br>or start from scratch</span></div>';
  allCards.innerHTML=addCardHtml+manuscripts.map((m,i)=>cardHtml(m,i,false)).join('');

  // Wire up events
  _wireLibraryEvents();
}

function _wireLibraryEvents(){
  // Add Manuscript button
  $('lib-add-btn')?.addEventListener('click',()=>{
    $('upload-modal')?.classList.remove('hidden');
  });

  // Upload modal back button
  $('upload-modal-back')?.addEventListener('click',e=>{
    e.preventDefault();
    $('upload-modal')?.classList.add('hidden');
    // Reset upload state
    $('upload-loading')?.classList.add('hidden');
    $('analyze-btn')?.classList.add('hidden');
    $('file-info')?.classList.add('hidden');
    fi.value='';uploadedFile=null;
  });

  // Open buttons
  document.querySelectorAll('[data-action="open"]').forEach(btn=>{
    btn.addEventListener('click',async e=>{
      e.stopPropagation();
      const idx=parseInt(btn.dataset.idx);
      await _openManuscript(idx);
    });
  });

  // Analyze buttons
  document.querySelectorAll('[data-action="analyze"]').forEach(btn=>{
    btn.addEventListener('click',async e=>{
      e.stopPropagation();
      const idx=parseInt(btn.dataset.idx);
      await _openManuscript(idx);
    });
  });

  // More (...) buttons
  document.querySelectorAll('[data-action="more"]').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      _showContextMenu(btn,parseInt(btn.dataset.idx));
    });
  });

  // Search
  $('lib-search')?.addEventListener('input',e=>{
    const q=e.target.value.toLowerCase().trim();
    document.querySelectorAll('.lib-card[data-lib-idx]').forEach(card=>{
      const idx=parseInt(card.dataset.libIdx);
      const m=_libManuscripts[idx];
      if(!m)return;
      const match=!q||m.fileName.toLowerCase().includes(q)||(m.genre||'').toLowerCase().includes(q);
      card.style.display=match?'':'none';
    });
  });

  // "Back to Editor" button — only show if the manuscript actually exists in library
  const backBtn=$('lib-back-editor');
  if(backBtn){
    const lastOpen=JSON.parse(localStorage.getItem('ml_last_open')||'null');
    // Only show if we have a manuscriptId AND it exists in the library list
    const backManuscriptExists=lastOpen?.manuscriptId&&_libManuscripts.some(m=>m.id===lastOpen.manuscriptId);
    if(lastOpen&&lastOpen.fileName&&backManuscriptExists){
      backBtn.classList.remove('hidden');
      backBtn.textContent='↩ Back to "'+lastOpen.fileName.replace(/\.\w+$/,'')+'"';
      backBtn.onclick=async()=>{
        const full=await Storage.getManuscript(lastOpen.manuscriptId).catch(()=>null);
        if(full&&full.text){
          extractedText=full.text;uploadedFile={name:full.fileName,size:0};
          analysisResult=Analyzer.analyze(extractedText);Storage._currentManuscriptId=full.id;
          $('upload-view').classList.add('hidden');$('editor-view').classList.remove('hidden');
          document.body.classList.remove('lib-mode');renderAll();
        }
      };
    }else{
      backBtn.classList.add('hidden');
      // Clean up stale references
      if(lastOpen&&!backManuscriptExists){
        localStorage.removeItem('ml_last_open');
      }
    }
  }

  // Set avatar letter from Firebase user
  if(typeof firebase!=='undefined'){
    const user=firebase.auth().currentUser;
    if(user){
      const letter=(user.displayName||user.email||'U')[0].toUpperCase();
      const el=$('lib-avatar-letter');
      if(el)el.textContent=letter;
    }
  }
}

async function _openManuscript(idx){
  const m=_libManuscripts[idx];if(!m)return;
  if(m._local){
    extractedText=m._data?.text||m.text||'';
    analysisResult=m._data?.result||Analyzer.analyze(extractedText);
    uploadedFile={name:m.fileName,size:0};
  }else{
    const full=await Storage.getManuscript(m.id);
    if(!full)return;
    extractedText=full.text;
    uploadedFile={name:full.fileName,size:0};
    analysisResult=Analyzer.analyze(extractedText);
    Storage._currentManuscriptId=m.id;
  }
  // Remember for "Back to Editor"
  localStorage.setItem('ml_last_open',JSON.stringify({fileName:m.fileName,manuscriptId:Storage._currentManuscriptId||m.id||null}));
  $('upload-view').classList.add('hidden');
  $('editor-view').classList.remove('hidden');
  document.body.classList.remove('lib-mode');
  renderAll();
}

function _showContextMenu(anchor,idx){
  // Remove any existing menu
  document.querySelectorAll('.lib-ctx-menu').forEach(m=>m.remove());
  const m=_libManuscripts[idx];if(!m)return;

  const menu=document.createElement('div');
  menu.className='lib-ctx-menu';
  menu.innerHTML=
    '<button class="lib-ctx-item" data-ctx="rename">Rename</button>'+
    '<button class="lib-ctx-item danger" data-ctx="delete">Delete</button>';

  // Position near the anchor
  const rect=anchor.getBoundingClientRect();
  menu.style.position='fixed';
  menu.style.top=(rect.bottom+4)+'px';
  menu.style.left=(rect.left-100)+'px';
  document.body.appendChild(menu);

  // Close on outside click
  const closeMenu=()=>{menu.remove();document.removeEventListener('click',closeMenu)};
  setTimeout(()=>document.addEventListener('click',closeMenu),10);

  menu.querySelector('[data-ctx="rename"]')?.addEventListener('click',async e=>{
    e.stopPropagation();
    menu.remove();
    const newName=prompt('Rename manuscript:',m.fileName);
    if(!newName||!newName.trim())return;
    if(m.id&&Storage.userId){
      try{
        const ref=firebase.firestore().collection('users').doc(Storage.userId).collection('manuscripts').doc(m.id);
        await ref.update({fileName:newName.trim()});
      }catch(err){console.warn('Rename error:',err.message)}
    }
    renderLibrary();
  });

  menu.querySelector('[data-ctx="delete"]')?.addEventListener('click',async e=>{
    e.stopPropagation();
    menu.remove();
    if(!confirm('Delete "'+m.fileName+'"?'))return;
    if(m.id&&Storage.userId){
      await Storage.deleteManuscript(m.id);
      // Clear stale session data if the deleted manuscript was the active one
      const lastOpen=JSON.parse(localStorage.getItem('ml_last_open')||'null');
      if(lastOpen?.manuscriptId===m.id){
        localStorage.removeItem('ml_last_open');
        localStorage.removeItem('ml_autosave');
      }
    }
    renderLibrary();
  });
}

// Add save + upgrade buttons to top bar
$('export-btn')?.insertAdjacentHTML('beforebegin','<button class="tb-btn" id="save-btn">&#128190; Save</button>');
$('export-btn')?.insertAdjacentHTML('beforebegin','<button class="tb-btn" id="upgrade-btn" style="color:var(--gold-l);border-color:var(--gold-d)">&#9733; Premium</button>');
$('save-btn')?.addEventListener('click',saveAnalysis);
$('upgrade-btn')?.addEventListener('click',()=>$('pricing-modal')?.classList.remove('hidden'));
// Stripe checkout — tier buttons
document.querySelectorAll('.checkout-tier').forEach(btn=>{
  btn.addEventListener('click',async()=>{
    const user=typeof firebase!=='undefined'?firebase.auth().currentUser:null;
    if(!user){alert('Please sign in first');return}
    const plan=btn.dataset.plan;
    btn.textContent='Redirecting...';btn.disabled=true;
    try{
      const resp=await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:user.uid,email:user.email,plan})});
      const data=await resp.json();
      if(data.url){window.location.href=data.url}
      else{alert(data.error||'Checkout failed');btn.textContent='Get '+plan.charAt(0).toUpperCase()+plan.slice(1);btn.disabled=false}
    }catch(e){alert('Error: '+e.message);btn.textContent='Get '+plan.charAt(0).toUpperCase()+plan.slice(1);btn.disabled=false}
  });
});

// Cookie consent
if(!localStorage.getItem('cookie_consent')){$('cookie-banner')?.classList.remove('hidden')}
$('cookie-accept')?.addEventListener('click',()=>{localStorage.setItem('cookie_consent','all');$('cookie-banner')?.classList.add('hidden')});
$('cookie-essential')?.addEventListener('click',()=>{localStorage.setItem('cookie_consent','essential');$('cookie-banner')?.classList.add('hidden')});

// First-time wizard — only show for brand-new users with no manuscripts
async function maybeShowWizard(){
  if(localStorage.getItem('wizard_done'))return;
  // Check if user has existing manuscripts — if so, skip wizard
  let hasManuscripts=false;
  if(Storage.userId){
    try{const ms=await Storage.getManuscripts();hasManuscripts=ms.length>0}catch(e){}
  }
  if(!hasManuscripts){
    const shelf=JSON.parse(localStorage.getItem('ml_bookshelf')||'[]');
    const saves=JSON.parse(localStorage.getItem('ml_saves')||'[]');
    hasManuscripts=shelf.length>0||saves.length>0;
  }
  if(hasManuscripts){localStorage.setItem('wizard_done','1');return}
  const steps=[
    {title:'Welcome to AuthorScrolls!',icon:'&#127807;',text:'Upload your manuscript and get instant analysis — plot structure, clarity, pacing, dialogue quality, and more.'},
    {title:'How It Works',icon:'&#128209;',text:'1. Upload a .docx, .pdf, or .txt file<br>2. Get scored across 10+ writing metrics<br>3. Click highlighted issues to fix them<br>4. Preview your book on Kindle, iPad, or Paperback'},
    {title:'AI-Powered Features',icon:'&#9889;',text:'Upgrade to unlock deep narrative critique, comparable titles, query letter drafting, beta reader simulation, and market readiness scoring.'},
    {title:'Ready to Start?',icon:'&#9997;',text:'Drop your manuscript and let AuthorScrolls guide you to better writing. Your work is saved securely to the cloud.'}
  ];
  let wizStep=0;
  function showWizStep(){
    const s=steps[wizStep];
    $('wizard-step').innerHTML='<div style="font-size:2.5rem;margin-bottom:.5rem">'+s.icon+'</div><h3 style="color:var(--gold-l);margin-bottom:.5rem;font-family:Lora,serif">'+s.title+'</h3><p style="color:var(--muted);font-size:.85rem;line-height:1.6">'+s.text+'</p>';
    $('wizard-dots').innerHTML=steps.map((_,i)=>'<div style="width:8px;height:8px;border-radius:50%;background:'+(i===wizStep?'var(--gold)':'var(--surface3)')+'"></div>').join('');
    $('wizard-next').textContent=wizStep===steps.length-1?'Get Started':'Next';
  }
  showWizStep();
  $('wizard-overlay')?.classList.remove('hidden');
  $('wizard-next')?.addEventListener('click',()=>{wizStep++;if(wizStep>=steps.length){$('wizard-overlay')?.classList.add('hidden');localStorage.setItem('wizard_done','1')}else showWizStep()});
  $('wizard-skip')?.addEventListener('click',()=>{$('wizard-overlay')?.classList.add('hidden');localStorage.setItem('wizard_done','1')});
}
// STARTUP — wait for auth, then route to editor or library
loadAutoSave();
Storage.whenReady().then(async user=>{
  if(!user){renderLibrary();return}

  // Fetch all manuscripts once — used for validation and fallback
  let manuscripts=[];
  try{manuscripts=await Storage.getManuscripts()}catch(e){console.warn('Could not fetch manuscripts:',e.message)}
  const shelf=JSON.parse(localStorage.getItem('ml_bookshelf')||'[]');
  const saves=JSON.parse(localStorage.getItem('ml_saves')||'[]');
  const hasAnyManuscripts=manuscripts.length>0||shelf.length>0||saves.length>0;

  // If no manuscripts anywhere, clear stale session data and show blank library
  if(!hasAnyManuscripts){
    localStorage.removeItem('ml_autosave');
    localStorage.removeItem('ml_last_open');
    renderLibrary();
    maybeShowWizard();
    return;
  }

  // Try to restore the last opened manuscript
  const lastOpen=JSON.parse(localStorage.getItem('ml_last_open')||'null');
  const autosave=JSON.parse(localStorage.getItem('ml_autosave')||'null');

  // Attempt 1: last opened manuscript by Firestore ID
  if(lastOpen?.manuscriptId){
    try{
      const full=await Storage.getManuscript(lastOpen.manuscriptId);
      if(full&&full.text){
        extractedText=full.text;
        uploadedFile={name:full.fileName,size:0};
        analysisResult=Analyzer.analyze(extractedText);
        Storage._currentManuscriptId=full.id;
        $('upload-view').classList.add('hidden');
        $('editor-view').classList.remove('hidden');
        document.body.classList.remove('lib-mode');
        renderAll();
        return;
      }
    }catch(e){console.warn('Could not restore last manuscript:',e.message)}
  }

  // Attempt 2: autosave — only if it matches a known manuscript in library
  if(autosave?.text&&autosave?.result&&autosave.manuscriptId){
    const match=manuscripts.find(m=>m.id===autosave.manuscriptId);
    if(match){
      extractedText=autosave.text;
      analysisResult=autosave.result;
      uploadedFile={name:autosave.fileName||'Untitled',size:0};
      Storage._currentManuscriptId=autosave.manuscriptId;
      $('upload-view').classList.add('hidden');
      $('editor-view').classList.remove('hidden');
      document.body.classList.remove('lib-mode');
      renderAll();
      return;
    }
  }

  // Attempt 3: any manuscript in Firestore (pick most recent)
  if(manuscripts.length>0){
    const sorted=manuscripts.slice().sort((a,b)=>{
      const ad=a.updatedAt?.toDate?a.updatedAt.toDate():new Date(0);
      const bd=b.updatedAt?.toDate?b.updatedAt.toDate():new Date(0);
      return bd-ad;
    });
    const m=sorted[0];
    try{
      const full=await Storage.getManuscript(m.id);
      if(full&&full.text){
        extractedText=full.text;
        uploadedFile={name:full.fileName,size:0};
        analysisResult=Analyzer.analyze(extractedText);
        Storage._currentManuscriptId=m.id;
        localStorage.setItem('ml_last_open',JSON.stringify({fileName:m.fileName,manuscriptId:m.id}));
        $('upload-view').classList.add('hidden');
        $('editor-view').classList.remove('hidden');
        document.body.classList.remove('lib-mode');
        renderAll();
        return;
      }
    }catch(e){console.warn('Could not load manuscript:',e.message)}
  }

  // No manuscript could be loaded — clear stale data, show library
  localStorage.removeItem('ml_autosave');
  localStorage.removeItem('ml_last_open');
  renderLibrary();
  maybeShowWizard();
});

// NEW
// Genre override in editor topbar — re-analyze with new genre
$('genre-override')?.addEventListener('change',()=>{
  if(!extractedText||!analysisResult)return;
  analysisResult=Analyzer.analyze(extractedText);
  renderAll();
});

function goToLibrary(){$('editor-view').classList.add('hidden');$('upload-view').classList.remove('hidden');$('upload-modal')?.classList.add('hidden');$('upload-loading')?.classList.add('hidden');$('analyze-btn')?.classList.add('hidden');$('file-info')?.classList.add('hidden');uploadedFile=null;extractedText='';analysisResult=null;fi.value='';Storage._currentManuscriptId=null;document.body.classList.add('lib-mode');renderLibrary()}
$('new-btn')?.addEventListener('click',goToLibrary);
// Back arrow removed — Library button handles navigation

// Formatting toolbar
document.querySelectorAll('.fmt-btn[data-cmd]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const cmd=btn.dataset.cmd;
    const ed=$('ed-annotated');
    if(!ed)return;
    ed.focus();
    if(cmd.startsWith('formatBlock:')){
      const tag=cmd.split(':')[1];
      const sel=window.getSelection();
      if(sel.rangeCount&&sel.toString().length>0){
        document.execCommand('formatBlock',false,'<'+tag+'>');
      }else{
        document.execCommand('formatBlock',false,'<'+tag+'>');
      }
    }else{
      document.execCommand(cmd,false,null);
    }
    scheduleReanalyze();syncPreview();
  });
});

// Wire undo-fix button
$('undo-fix-btn')?.addEventListener('click',undoLastFix);

// (Bookshelf replaced by Library dashboard)

// ========================
// FOCUS & RECOVERY — Writing Health Guard
// ========================
const FocusGuard={
  _eyeTimer:null,_moveTimer:null,_longTimer:null,
  _sessionStart:Date.now(),_snoozed:false,_enabled:true,
  _mode:'standard', // standard|focus|gentle
  _intervals:{
    standard:{eye:20*60*1000,move:30*60*1000,long:2*60*60*1000},
    focus:{eye:25*60*1000,move:50*60*1000,long:2*60*60*1000},
    gentle:{eye:15*60*1000,move:25*60*1000,long:90*60*1000}
  },
  start(){
    if(!this._enabled)return;
    const prefs=JSON.parse(localStorage.getItem('ml_prefs')||'{}');
    this._mode=prefs.focusMode||'standard';
    this._sessionStart=Date.now();
    this._schedule();
  },
  _schedule(){
    this.stop();
    const iv=this._intervals[this._mode]||this._intervals.standard;
    this._eyeTimer=setTimeout(()=>this._show('&#128065;','Look 20 feet away for 20 seconds.','eye'),iv.eye);
    this._moveTimer=setTimeout(()=>this._show('&#128694;','Stand, stretch, and move for 1\u20133 minutes.','move'),iv.move);
    this._longTimer=setTimeout(()=>this._show('&#9749;','Take a 10\u201315 minute break away from the screen.','long'),iv.long);
  },
  stop(){clearTimeout(this._eyeTimer);clearTimeout(this._moveTimer);clearTimeout(this._longTimer)},
  _show(icon,msg,type){
    const banner=$('focus-banner');if(!banner)return;
    $('focus-icon').innerHTML=icon;
    $('focus-msg').textContent=msg;
    banner.classList.remove('hidden');
    // Auto-dismiss eye strain after 25s
    if(type==='eye')setTimeout(()=>banner.classList.add('hidden'),25000);
  },
  dismiss(){$('focus-banner')?.classList.add('hidden');this._schedule()},
  snooze(){$('focus-banner')?.classList.add('hidden');const iv=this._intervals[this._mode];clearTimeout(this._eyeTimer);this._eyeTimer=setTimeout(()=>this._show('&#128065;','Look 20 feet away for 20 seconds.','eye'),5*60*1000)}
};
$('focus-dismiss')?.addEventListener('click',()=>FocusGuard.dismiss());
$('focus-snooze')?.addEventListener('click',()=>FocusGuard.snooze());
// Start focus guard when editor loads
setTimeout(()=>FocusGuard.start(),2000);

// ========================
// AI CACHING — 24hr cache with change detection
// ========================
const AICache={
  _key(text,feature){return 'aic_'+feature+'_'+(text.length+'_'+text.substring(0,100)).replace(/\W/g,'_').substring(0,80)},
  get(text,feature){
    try{
      const k=this._key(text,feature);
      const raw=localStorage.getItem(k);
      if(!raw)return null;
      const cached=JSON.parse(raw);
      if(Date.now()-cached.ts>24*60*60*1000){localStorage.removeItem(k);return null}
      // Verify text hasn't changed significantly
      if(cached.textLen!==text.length||cached.textHash!==this._hash(text))return null;
      return cached.data;
    }catch(e){return null}
  },
  set(text,feature,data){
    try{
      const k=this._key(text,feature);
      localStorage.setItem(k,JSON.stringify({data,ts:Date.now(),textLen:text.length,textHash:this._hash(text)}));
    }catch(e){/* quota */}
  },
  _hash(text){let h=0;for(let i=0;i<text.length;i+=100){h=((h<<5)-h)+text.charCodeAt(i);h|=0}return h}
};
// Patch AIEngine to use cache
if(typeof AIEngine!=='undefined'){
  const origCall=AIEngine._callClaude.bind(AIEngine);
  AIEngine._callClaude=async function(apiKey,systemPrompt,userPrompt,manuscriptText,feature){
    const cached=AICache.get(manuscriptText,feature);
    if(cached)return cached;
    const result=await origCall(apiKey,systemPrompt,userPrompt,manuscriptText,feature);
    AICache.set(manuscriptText,feature,result);
    return result;
  };
}

// ============================================================
// RE-ENGAGEMENT SYSTEM (3-layer)
// ============================================================

// ── Tracking data model ──────────────────────────────────
function trackSession(actionType){
  if(!uploadedFile||!analysisResult)return;
  const prev=JSON.parse(localStorage.getItem('ml_session')||'{}');
  const text=extractedText||'';
  const chapters=text.match(/^(chapter\s+\d+[^\n]*|chapter\s+[a-z]+[^\n]*)/gim)||[];
  const lastChapter=chapters.length>0?chapters[chapters.length-1].trim():(prev.lastChapter||null);

  const data={
    manuscript:uploadedFile.name,
    manuscriptId:Storage._currentManuscriptId||prev.manuscriptId||null,
    lastChapter,
    lastActionType:actionType||prev.lastActionType||'viewing',
    lastScore:analysisResult.overall||prev.lastScore||0,
    lastSessionTime:Date.now(),
    genre:analysisResult.genre?.label||'',
    totalWords:analysisResult.totalWords||0,
    // Preserve reminder tier so server-side cron can pick up where it left off
    lastReminderTier:prev.lastReminderTier||0
  };
  localStorage.setItem('ml_session',JSON.stringify(data));

  // Mirror to Firestore (server uses this for push/email cron)
  _syncSessionToServer(data);
}

function _syncSessionToServer(data){
  if(typeof firebase==='undefined')return;
  const user=firebase.auth().currentUser;if(!user)return;
  const prefs=JSON.parse(localStorage.getItem('ml_prefs')||'{}');
  const db=firebase.firestore();
  db.collection('userSessions').doc(user.uid).set({
    uid:user.uid,
    email:user.email||'',
    manuscript:data.manuscript||'',
    manuscriptId:data.manuscriptId||'',
    lastChapter:data.lastChapter||'',
    lastActionType:data.lastActionType||'viewing',
    lastScore:data.lastScore||0,
    lastSessionTime:data.lastSessionTime||Date.now(),
    emailReminders:prefs.emailReminders||false,
    lastReminderTier:data.lastReminderTier||0
  },{merge:true}).catch(()=>{});
}

function _resetReminderTier(){
  if(typeof firebase==='undefined')return;
  const user=firebase.auth().currentUser;if(!user)return;
  firebase.firestore().collection('userSessions').doc(user.uid).set(
    {lastReminderTier:0,lastSessionTime:Date.now()},{merge:true}
  ).catch(()=>{});
  // Also reset local tier
  const s=JSON.parse(localStorage.getItem('ml_session')||'{}');
  s.lastReminderTier=0;s.lastSessionTime=Date.now();
  localStorage.setItem('ml_session',JSON.stringify(s));
}

// Track on analysis and periodically
setInterval(()=>trackSession(),60000);

// ============================================================
// WRITING & BLOCK TOOLS
// ============================================================
let _sprintInterval=null;

// Writing Prompt Generator
$('wb-prompt-btn')?.addEventListener('click',async()=>{
  const res=$('wb-prompt-result');if(!res)return;
  res.classList.remove('hidden');
  res.textContent='Generating prompt...';
  const genre=analysisResult?.genre?.label||'fiction';
  const text=extractedText||'';
  const chapters=text.match(/^(chapter\s+\d+[^\n]*|chapter\s+[a-z]+[^\n]*)/gim)||[];
  const lastCh=chapters.length>0?chapters[chapters.length-1].trim():'the opening';

  // Simple local prompt generation (no AI needed)
  const prompts=[
    `Write the next 500 words of your ${genre} manuscript. Your character just discovered something they can't ignore.`,
    `Start with a line of dialogue. Someone in "${lastCh}" says something that changes the direction of the scene.`,
    `Describe a setting your protagonist has never been to before. Use all five senses. Make it matter to the plot.`,
    `Write a flashback scene — something that happened before the story opened. It explains why your character acts the way they do in "${lastCh}".`,
    `Your protagonist is alone with their thoughts. What are they afraid of? Write the inner monologue, then have someone interrupt them.`,
    `Two characters disagree about something important. Write the argument — no one is entirely right.`,
    `A minor detail from an earlier chapter becomes important now. Write the scene where your character notices it.`,
    `Write a quiet moment. No action, no tension. Just your character existing in the world. Make the reader care.`
  ];
  res.textContent=prompts[Math.floor(Math.random()*prompts.length)];
});

// What If Generator
$('wb-whatif-btn')?.addEventListener('click',()=>{
  const res=$('wb-whatif-result');if(!res)return;
  res.classList.remove('hidden');
  const genre=analysisResult?.genre?.label||'fiction';
  const twists=[
    'What if the character everyone trusts is the one causing the problem?',
    'What if the setting suddenly becomes hostile — a storm, a lockdown, a blackout?',
    'What if the protagonist discovers they were wrong about the one thing they were sure of?',
    'What if someone from the past shows up uninvited — and they have information that changes everything?',
    'What if the goal your character has been chasing turns out to be worthless?',
    'What if two characters who\'ve never spoken are forced to depend on each other?',
    'What if the antagonist has a genuinely good reason for what they\'re doing?',
    'What if the next chapter starts 6 months later — and everything has changed?',
    'What if your character has to choose between two people they care about?',
    'What if a seemingly insignificant choice from Chapter 1 has massive consequences now?',
    'What if the mentor, guide, or helper figure is lying?',
    'What if the rules of your world suddenly stop working?'
  ];
  // Pick 5 random unique twists
  const shuffled=twists.sort(()=>0.5-Math.random()).slice(0,5);
  res.innerHTML=shuffled.map((t,i)=>'<div style="padding:.3rem 0;'+(i>0?'border-top:1px solid var(--border);':'')+'"><strong style="color:var(--gold-l)">'+(i+1)+'.</strong> '+t+'</div>').join('');
});

// Sprint Timer
$('wb-sprint-btn')?.addEventListener('click',()=>{
  const display=$('wb-sprint-display');
  const btn=$('wb-sprint-btn');
  if(!display||!btn)return;

  if(_sprintInterval){
    // Stop sprint
    clearInterval(_sprintInterval);
    _sprintInterval=null;
    btn.textContent='Start Sprint';
    display.classList.add('hidden');
    return;
  }

  const mins=parseInt($('wb-sprint-time')?.value||'15');
  let remaining=mins*60;
  display.classList.remove('hidden');
  btn.textContent='Stop Sprint';

  function updateDisplay(){
    const m=Math.floor(remaining/60);
    const s=remaining%60;
    display.innerHTML='<div style="font-size:1.5rem;font-weight:700;color:var(--gold-l);text-align:center">'+m+':'+(s<10?'0':'')+s+'</div><div style="font-size:.7rem;color:var(--muted);text-align:center">Just write. Don\'t edit. Don\'t look back.</div>';
  }
  updateDisplay();

  _sprintInterval=setInterval(()=>{
    remaining--;
    if(remaining<=0){
      clearInterval(_sprintInterval);
      _sprintInterval=null;
      btn.textContent='Start Sprint';
      display.innerHTML='<div style="font-size:1.1rem;font-weight:700;color:var(--green);text-align:center">Sprint complete! Well done.</div>';
      if('Notification' in window&&Notification.permission==='granted'){
        new Notification('AuthorScrolls',{body:'Your writing sprint is complete!'});
      }
    }else{
      updateDisplay();
    }
  },1000);
});

// Character Voice
$('wb-voice-btn')?.addEventListener('click',()=>{
  const res=$('wb-voice-result');
  const nameInput=$('wb-char-name');
  if(!res||!nameInput)return;
  const name=nameInput.value.trim()||'your character';
  res.classList.remove('hidden');
  const exercises=[
    `Write 200 words as ${name}. They're writing a letter to someone they've wronged. What do they say — and what do they leave out?`,
    `${name} is ordering food at a place they've never been. How do they talk to the server? What do they notice about the menu?`,
    `Write ${name}'s internal monologue while waiting for something important. What are the specific words and rhythms of how they think?`,
    `${name} is explaining something they love to someone who doesn't care. How do they sound when they're passionate and ignored?`,
    `${name} is lying. Write the lie in their voice — then write what they're actually thinking underneath it.`
  ];
  res.textContent=exercises[Math.floor(Math.random()*exercises.length)];
});

// ── Layer 1: In-app welcome-back ────────────────────────────
function showReengagement(){
  try{
    const raw=localStorage.getItem('ml_session');if(!raw)return;
    const data=JSON.parse(raw);
    const hoursSince=(Date.now()-data.lastSessionTime)/3600000;
    if(hoursSince<1)return;
    const card=document.querySelector('.upload-card');if(!card)return;
    if(document.querySelector('.reengage-msg'))return; // already shown

    let msg='';
    const m=esc(data.manuscript||'your manuscript');
    const ch=data.lastChapter?esc(data.lastChapter):'';
    const sc=data.lastScore||0;
    const act=data.lastActionType||'viewing';

    if(hoursSince>=72){
      if(ch) msg='You stopped in the middle of <em>'+ch+'</em>. Stories don\'t finish themselves — but yours could.';
      else msg='It\'s been a few days. <strong>'+m+'</strong> is still right where you left it.';
    }else if(hoursSince>=48){
      if(act==='editing'&&ch) msg='You were mid-edit on <em>'+ch+'</em> in <strong>'+m+'</strong>. The prose is still unfinished.';
      else if(ch) msg='<strong>'+m+'</strong> — you left off at <em>'+ch+'</em>. One more pass could make a real difference.';
      else msg='Two days since your last session. <strong>'+m+'</strong> could use your attention.';
    }else if(hoursSince>=24){
      if(act==='analyzing'&&sc) msg='<strong>'+m+'</strong> scored <strong>'+sc+'/100</strong>. Yesterday\'s analysis flagged things worth fixing — want to dig in?';
      else if(ch) msg='You were working on <em>'+ch+'</em> in <strong>'+m+'</strong>. Ready to pick it up?';
      else msg='Welcome back. <strong>'+m+'</strong> is where you left it.';
    }else{
      if(sc>=80) msg='Good to see you back. <strong>'+m+'</strong> is scoring well — keep the momentum going.';
      else if(sc>0) msg='Welcome back. <strong>'+m+'</strong> — last score was <strong>'+sc+'/100</strong>. Let\'s improve it.';
      else msg='Welcome back. Ready to keep working on <strong>'+m+'</strong>?';
    }

    if(!msg)return;
    const div=document.createElement('div');
    div.className='reengage-msg';
    div.style.cssText='margin-bottom:.75rem;padding:.65rem .85rem;background:var(--surface2);border:1px solid rgba(200,149,108,.25);border-radius:var(--rs);font-size:.78rem;color:var(--text);line-height:1.6;font-family:Inter,sans-serif;display:flex;align-items:flex-start;gap:.5rem';
    div.innerHTML='<span style="color:#c8956c;font-size:.9rem;margin-top:.05rem">&#9997;</span><span style="color:#e8dfd4">'+msg+'</span>';
    card.prepend(div);

    // Mark tier 1 sent
    data.lastReminderTier=Math.max(data.lastReminderTier||0,1);
    localStorage.setItem('ml_session',JSON.stringify(data));
  }catch(e){}
}
showReengagement();

// ── Layer 2: Push notification subscription ─────────────
const PushManager={
  VAPID_PUBLIC:'BIExireuGYmZMRI4Ou3bUI0k4BaAJP1pxczO9WCmb58JvUiSqROFYRPcTFcrHcWUWtoF2aGTmBc6uudgqfkFpf8',

  async isSupported(){
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },

  async getPermission(){ return Notification.permission; },

  async register(){
    if(!await this.isSupported())return null;
    try{
      const reg=await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      return reg;
    }catch(e){console.warn('SW register failed',e);return null}
  },

  async subscribe(){
    const reg=await this.register();if(!reg)return false;
    if(Notification.permission==='denied')return false;

    const perm=await Notification.requestPermission();
    if(perm!=='granted')return false;

    try{
      const sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:this._urlBase64ToUint8Array(this.VAPID_PUBLIC)
      });

      const user=firebase.auth().currentUser;
      if(!user)return false;

      // Store subscription directly in Firestore (no server roundtrip needed)
      await firebase.firestore().collection('pushSubscriptions').doc(user.uid).set({
        uid:user.uid,
        email:user.email||'',
        subscription:sub.toJSON(),
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      });

      localStorage.setItem('ml_push_subscribed','1');
      return true;
    }catch(e){console.warn('Push subscribe failed',e);return false}
  },

  async unsubscribe(){
    try{
      const reg=await navigator.serviceWorker.getRegistration('/sw.js');
      const sub=await reg?.pushManager.getSubscription();
      if(sub)await sub.unsubscribe();
      const user=firebase.auth().currentUser;
      if(user)await firebase.firestore().collection('pushSubscriptions').doc(user.uid).delete();
      localStorage.removeItem('ml_push_subscribed');
    }catch(e){}
  },

  _urlBase64ToUint8Array(base64String){
    const padding='='.repeat((4-base64String.length%4)%4);
    const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base64);
    return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
  }
};

// Prompt for push after first successful analysis (gentle, non-intrusive)
function maybePromptPush(){
  if(localStorage.getItem('ml_push_subscribed')||localStorage.getItem('ml_push_dismissed'))return;
  if(!PushManager.isSupported)return;
  if(Notification.permission==='denied')return;

  // Show a subtle opt-in banner rather than a browser permission dialog cold-call
  const existing=document.getElementById('push-prompt-bar');
  if(existing)return;

  const bar=document.createElement('div');
  bar.id='push-prompt-bar';
  bar.style.cssText='position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);z-index:1000;background:#1e1812;border:1px solid rgba(200,149,108,.3);border-radius:10px;padding:.65rem 1rem;display:flex;align-items:center;gap:.75rem;font-size:.78rem;color:#9c9085;box-shadow:0 4px 20px rgba(0,0,0,.5);max-width:420px;width:90%';
  bar.innerHTML=`
    <span style="color:#c8956c;font-size:1rem">&#128276;</span>
    <span style="flex:1;color:#e8dfd4">Get nudged when your manuscript needs attention?</span>
    <button id="push-yes" style="padding:.3rem .75rem;background:linear-gradient(135deg,#c8956c,#8a6548);color:#fff;border:none;border-radius:6px;font-size:.75rem;font-weight:600;cursor:pointer">Enable</button>
    <button id="push-no" style="padding:.3rem .6rem;background:none;border:none;color:#6b6158;font-size:.75rem;cursor:pointer">Not now</button>
  `;
  document.body.appendChild(bar);

  document.getElementById('push-yes').addEventListener('click',async()=>{
    bar.remove();
    const ok=await PushManager.subscribe();
    if(ok){
      const toast=document.createElement('div');
      toast.style.cssText='position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);background:#1e3320;border:1px solid #5dba7d;border-radius:8px;padding:.5rem 1rem;color:#5dba7d;font-size:.78rem;z-index:1001';
      toast.textContent='Notifications enabled.';
      document.body.appendChild(toast);
      setTimeout(()=>toast.remove(),3000);
    }
  });

  document.getElementById('push-no').addEventListener('click',()=>{
    bar.remove();
    localStorage.setItem('ml_push_dismissed','1');
  });

  // Auto-dismiss after 12 seconds
  setTimeout(()=>bar.remove(),12000);
}

// Register service worker early (needed for push to work even before prompting)
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
}

})();
