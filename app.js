(function(){
let uploadedFile=null,extractedText='',analysisResult=null;
const $=id=>document.getElementById(id);

// UPLOAD
const dz=$('drop-zone'),fi=$('file-input');
dz.addEventListener('click',()=>fi.click());
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag-over')});
dz.addEventListener('dragleave',()=>dz.classList.remove('drag-over'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag-over');if(e.dataTransfer.files.length)hf(e.dataTransfer.files[0])});
fi.addEventListener('change',e=>{if(e.target.files.length)hf(e.target.files[0])});
$('clear-file').addEventListener('click',()=>{uploadedFile=null;$('file-info').classList.add('hidden');$('analyze-btn').classList.add('hidden');fi.value=''});
function hf(f){const x=f.name.split('.').pop().toLowerCase();if(!['docx','pdf','txt'].includes(x)){alert('Upload .docx, .pdf, or .txt');return}uploadedFile=f;$('file-name').textContent=f.name+' ('+(f.size/1024).toFixed(1)+' KB)';$('file-info').classList.remove('hidden');$('analyze-btn').classList.remove('hidden')}
async function ext(f){const x=f.name.split('.').pop().toLowerCase();if(x==='txt')return await f.text();if(x==='docx'){$('loader-text').textContent='Extracting Word...';return(await mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()})).value}if(x==='pdf'){$('loader-text').textContent='Extracting PDF...';pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';const p=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;let t='';for(let i=1;i<=p.numPages;i++){const c=await(await p.getPage(i)).getTextContent();t+=c.items.map(x=>x.str).join(' ')+'\n\n'}return t}}
$('analyze-btn').addEventListener('click',async()=>{if(!uploadedFile)return;$('analyze-btn').classList.add('hidden');$('upload-loading').classList.remove('hidden');try{$('loader-text').textContent='Extracting...';extractedText=await ext(uploadedFile);$('loader-text').textContent='Analyzing...';await new Promise(r=>setTimeout(r,80));analysisResult=Analyzer.analyze(extractedText);if(analysisResult.error){alert(analysisResult.error);$('upload-loading').classList.add('hidden');$('analyze-btn').classList.remove('hidden');return}$('upload-view').classList.add('hidden');$('editor-view').classList.remove('hidden');renderAll()}catch(e){alert('Error: '+e.message);$('upload-loading').classList.add('hidden');$('analyze-btn').classList.remove('hidden')}});

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

// Track ignored issues
let ignoredIssues=new Set();

function renderAll(){
  const r=analysisResult;
  $('top-filename').textContent=uploadedFile.name.replace(/\.\w+$/,'');
  $('top-wc').textContent=r.totalWords.toLocaleString();
  $('top-status').textContent=r.genre.label+' \u00B7 '+r.manuscriptMode.label;
  drawGauge(r.overall);
  renderLeft(r);renderRight(r);renderAnnotated(extractedText,r.issues);renderDetailed(r);renderReader(r);renderVersions();
  // Save version
  AIEngine.saveVersion(uploadedFile.name,analysisResult,null);
}

// REPLACE & FIX: actually replace the text with a proper fix
function replaceAndFix(hlElement){
  const page=$('ed-annotated');
  const type=hlElement.dataset.t;
  const suggestion=hlElement.dataset.s||'';
  const original=hlElement.textContent;
  let replacement='';
  let mode='replace'; // 'replace', 'remove', 'split'

  if(type==='weak-verb'){
    const m=suggestion.match(/Try:\s*(.+)/i);
    replacement=m?m[1].split(',')[0].trim():original;
  }else if(type==='wordy'){
    const m=suggestion.match(/Replace with:\s*"(.+?)"/i);
    replacement=m?m[1]:'';
    if(replacement==='(omit)'||replacement==='(omit or rephrase)'){replacement='';mode='remove'}
    else if(!replacement){mode='remove';replacement=''}
  }else if(type==='passive'){
    replacement=original.replace(/\b(was|were)\s+(being\s+)?/i,'').trim();
  }else if(type==='adverb'){
    replacement='';mode='remove';
  }else if(type==='cliche'){
    // Map common cliches to plain alternatives
    const fixes={
      'the calm before the storm':'the tense quiet before everything changed',
      'crystal clear':'completely obvious','like a punch to the gut':'a sudden shock',
      'hit her like':'struck her as','hit him like':'struck him as',
      'at the end of the day':'ultimately','few and far between':'rare',
      'in the nick of time':'just barely in time','beat around the bush':'avoid the point',
      'bite the bullet':'face it directly','break the ice':'ease the tension',
      'cold as ice':'frigid','cool as a cucumber':'completely calm',
      'dead as a doornail':'lifeless','easy as pie':'effortless',
      'heart of gold':'genuinely kind','piece of cake':'simple',
      'once in a blue moon':'very rarely','under the weather':'feeling ill',
      'tip of the iceberg':'only the surface','needle in a haystack':'nearly impossible to find',
      'on thin ice':'in a precarious position','raining cats and dogs':'pouring rain',
      'the elephant in the room':'the obvious unspoken issue',
      'water under the bridge':'already past','head over heels':'completely captivated',
      'every cloud has a silver lining':'there is an upside',
      'butterflies in my stomach':'a nervous flutter',
      'light at the end of the tunnel':'a sign of hope ahead',
      'back to the drawing board':'starting over','add insult to injury':'making it worse',
      'caught between a rock and a hard place':'trapped with no good option'
    };
    const lo=original.toLowerCase().trim();
    replacement=fixes[lo]||Object.entries(fixes).find(([k])=>lo.includes(k))?.[1]||'';
    if(!replacement){
      // Generic: strip the cliche structure, keep core meaning
      replacement=original.replace(/\b(like|as)\s+a\s+/gi,'').trim();
      if(replacement===original)replacement=original+' [replace with original phrasing]';
    }
  }else if(type==='show-tell'){
    replacement=original.replace(/\b(felt|feeling|could feel|could sense|could tell|could see|obviously|clearly|evidently|apparently)\s*/i,'').trim();
    if(!replacement||replacement===original){
      // "was beautiful" -> "beautiful" (let writer expand into showing)
      replacement=original.replace(/\b(was|were|seemed|looked)\s+/i,'').trim();
    }
  }else if(type==='repetition'){
    // Provide a synonym from a basic map
    const synonyms={
      'said':['stated','mentioned','noted','remarked'],
      'looked':['glanced','peered','gazed','watched'],
      'walked':['moved','strode','made their way','went'],
      'made':['created','produced','crafted','formed'],
      'came':['arrived','appeared','emerged','approached'],
      'went':['headed','moved','traveled','proceeded'],
      'here':['this place','this spot','nearby','in this location'],
      'there':['that place','that spot','in that direction'],
      'very':['extremely','remarkably','incredibly','deeply'],
      'really':['truly','genuinely','absolutely','certainly'],
      'just':['simply','merely','only','precisely'],
      'back':['returned','again','behind','rear'],
      'time':['moment','occasion','instance','period'],
      'eyes':['gaze','stare','glance','look'],
      'hand':['palm','grip','fingers','fist'],
      'face':['expression','features','countenance','visage'],
      'dark':['dim','shadowed','unlit','gloomy'],
      'door':['entrance','doorway','threshold','entry']
    };
    const lo=original.toLowerCase().trim();
    const syns=synonyms[lo];
    if(syns){replacement=syns[Math.floor(Math.random()*syns.length)]}
    else{replacement=original} // keep original, writer decides
  }else if(type==='sentence-length'){
    mode='split';
    let text=original;
    const midpoint=text.length/2;

    // Phase 1: Try splitting at comma+conjunction (strongest break)
    const phase1=[/, and\s/i,/, but\s/i,/, or\s/i,/;\s/,/ — /,/ -- /];
    // Phase 2: Bare conjunctions (no comma)
    const phase2=[/\s+and\s+/i,/\s+but\s+/i,/\s+or\s+/i];
    // Phase 3: Relative/subordinate clauses
    const phase3=[/\s+who\s+/i,/\s+which\s+/i,/\s+where\s+/i,/\s+when\s+/i,/\s+that\s+/i,/\s+while\s+/i,/\s+although\s+/i,/\s+because\s+/i];
    // Phase 4: Any comma at all
    const phase4=[/,\s+/];

    function findBestSplit(patterns,minPos){
      let best=-1,bestPat=null;
      for(const pat of patterns){
        const r=new RegExp(pat.source,'gi');
        let m;
        while((m=r.exec(text))!==null){
          const pos=m.index;
          if(pos<(minPos||15)||pos>text.length-15)continue;
          if(best===-1||Math.abs(pos-midpoint)<Math.abs(best-midpoint)){best=pos;bestPat=m[0]}
        }
      }
      return {pos:best,pat:bestPat};
    }

    let split=findBestSplit(phase1,15);
    if(split.pos===-1)split=findBestSplit(phase2,20);
    if(split.pos===-1)split=findBestSplit(phase3,20);
    if(split.pos===-1)split=findBestSplit(phase4,15);

    if(split.pos>10){
      const splitStr=split.pat;
      const part1=text.substring(0,split.pos).trim();
      let part2=text.substring(split.pos+splitStr.length).trim();
      // Capitalize first letter of part2
      if(part2.length>0)part2=part2.charAt(0).toUpperCase()+part2.slice(1);
      // Add period to part1 if it doesn't end with punctuation
      const p1end=/[.!?]$/.test(part1)?'':'.';
      replacement=part1+p1end+' '+part2;
      // Clean up: if part2 starts with "and "/"but " from a bare conjunction split, keep it
    }else{
      // Last resort: hard split near midpoint at a word boundary
      const words=text.split(/\s+/);
      const halfIdx=Math.floor(words.length/2);
      const p1=words.slice(0,halfIdx).join(' ').trim()+'.';
      let p2=words.slice(halfIdx).join(' ').trim();
      if(p2.length>0)p2=p2.charAt(0).toUpperCase()+p2.slice(1);
      replacement=p1+' '+p2;
    }
  }

  // Apply the replacement
  const span=document.createElement('span');
  span.className='fix-applied';
  if(replacement===original){
    // Truly can't fix - but still useful, highlight it for the writer
    span.innerHTML='<span style="outline:2px dashed var(--gold);outline-offset:2px;padding:1px 2px">'+esc(original)+'</span>';
    span.title='This needs a manual rewrite - click to edit directly';
  }else if(mode==='remove'||replacement===''){
    span.textContent=''; // just remove it
  }else{
    // Show the replacement directly (clean, no strikethrough clutter)
    span.textContent=replacement;
    span.style.color='#2d6b45';span.style.fontWeight='600';
  }
  hlElement.replaceWith(span);
  // Update text reference
  extractedText=page.textContent;
  $('tip').classList.remove('on');
  // Flash confirmation
  span.style.outline='2px solid var(--green)';span.style.outlineOffset='2px';
  setTimeout(()=>{span.style.outline=''},1500);
  addReanalyzeButton();
}

// RE-ANALYZE: let user re-run analysis on edited text
function addReanalyzeButton(){
  const existing=document.querySelector('.reanalyze-btn');
  if(existing)return;
  const btn=document.createElement('button');
  btn.className='btn-gold reanalyze-btn';
  btn.style.cssText='position:fixed;bottom:70px;right:20px;width:auto;padding:.5rem 1.2rem;z-index:100;font-size:.8rem;border-radius:20px;box-shadow:0 4px 12px rgba(0,0,0,.4)';
  btn.textContent='\u21BB Re-analyze';
  btn.onclick=()=>{
    extractedText=$('ed-annotated').textContent;
    analysisResult=Analyzer.analyze(extractedText);
    if(!analysisResult.error){renderAll();btn.remove()}
  };
  document.body.appendChild(btn);
}

// LEFT SIDEBAR
function renderLeft(r){
  const rp=r.readerPerspective;
  const cards=[
    {name:'Engagement Score',score:rp.engagementScore,sub:'How hooked will readers be?',action:'+ Improve Opening',bar:true},
    {name:'Hook Strength',score:rp.hookStrength,sub:(r.issueCounts.passive+r.issueCounts.adverb)+' Issues',action:'+ Improve Opening',bar:false},
    {name:'Clarity',score:rp.clarityScore,sub:'Weak transitions',bar:true},
    {name:'Pacing',score:Math.round((r.scores.plot+r.scores.transitions)/2),sub:rp.pacingFeel.split(' - ')[0],badge:rp.pacingFeel.includes('Rushed')?'Rushed':rp.pacingFeel.includes('Slow')?'Slow':'Good'},
    {name:'DNF Risk',score:rp.dnfRisk,sub:rp.dnfRisk>60?'At Risk':rp.dnfRisk>30?'Moderate':'Safe',inv:true}
  ];
  $('lp-cards').innerHTML=cards.map(c=>{
    const col=c.inv?scHex(100-c.score):scHex(c.score);
    const id='lpc-'+Math.random().toString(36).substr(2,5);
    return '<div class="lp-card"><div class="lp-card-head"><div class="lpc-ring"><canvas id="'+id+'" width="40" height="40"></canvas><span class="lpc-num" style="color:'+col+'">'+c.score+'</span></div><div class="lpc-info"><div class="lpc-name">'+c.name+'</div><div class="lpc-sub">'+esc(c.sub)+'</div></div>'+(c.badge?'<span class="rsc-badge" style="background:var(--surface2);color:'+col+'">'+c.badge+'</span>':'<span class="lpc-score" style="color:'+col+'">'+c.score+'</span>')+'</div>'+(c.bar?'<div class="lpc-bar"><div class="lpc-bar-fill" style="width:'+c.score+'%;background:'+col+'"></div></div>':'')+(c.action?'<span class="lpc-action">'+c.action+'</span>':'')+'</div>';
  }).join('');
  // Draw rings
  cards.forEach((c,i)=>{const cvs=document.querySelectorAll('.lpc-ring canvas')[i];if(cvs)drawRing(cvs,c.inv?100-c.score:c.score,40)});
  // Improve Opening buttons - scroll to first paragraph and highlight
  document.querySelectorAll('.lpc-action').forEach(btn=>{btn.addEventListener('click',()=>{
    // Switch to annotated tab
    document.querySelectorAll('.btab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.ms-page').forEach(p=>p.classList.remove('active'));
    document.querySelector('.btab[data-p="annotated"]').classList.add('active');
    $('ed-annotated').classList.add('active');
    // Scroll to top and flash first paragraph
    const page=$('ed-annotated');page.scrollTop=0;
    const firstHL=page.querySelector('.hl');
    if(firstHL){firstHL.scrollIntoView({behavior:'smooth',block:'center'});firstHL.style.outline='2px solid var(--gold)';firstHL.style.outlineOffset='2px';setTimeout(()=>{firstHL.style.outline=''},2000)}
  })});
}

// RIGHT SIDEBAR
function renderRight(r){
  const cats=[
    {k:'plot',name:'Plot Structure',score:r.scores.plot,issues:0},
    {k:'clarity',name:'Clarity',score:r.readerPerspective.clarityScore,issues:r.issueCounts.passive},
    {k:'pacing',name:'Pacing',score:Math.round((r.scores.plot+r.scores.transitions)/2),issues:r.issueCounts['sentence-length'],badge:r.readerPerspective.pacingFeel.includes('Rushed')?'Rushed':null},
    {k:'hook',name:'Hook Strength',score:r.readerPerspective.hookStrength,issues:r.issueCounts.adverb},
    {k:'style',name:'Style & Voice',score:r.scores.style,issues:r.issueCounts['weak-verb']},
    {k:'dialogue',name:'Dialogue',score:r.scores.dialogue,issues:0},
    {k:'showTell',name:'Show vs Tell',score:r.scores.showTell,issues:r.issueCounts['show-tell']},
    {k:'copy',name:'Copy Editing',score:r.scores.copy,issues:r.issues.length}
  ];
  const container=$('rp-scores');
  container.innerHTML=cats.map(c=>{
    const col=scHex(c.score);const id='rsc-'+Math.random().toString(36).substr(2,5);
    return '<div class="rsc" data-cat="'+c.k+'"><div class="rsc-ring"><canvas id="'+id+'" width="34" height="34"></canvas><span class="rsc-n" style="color:'+col+'">'+c.score+'</span></div><div class="rsc-info"><div class="rsc-name">'+c.name+'</div><div class="rsc-sub">'+c.issues+' Issues</div></div>'+(c.badge?'<span class="rsc-badge" style="background:var(--surface2);color:'+col+'">'+c.badge+'</span>':'<span class="rsc-val" style="color:'+col+'">'+c.score+'</span>')+'</div>';
  }).join('');
  // Draw rings
  cats.forEach((c,i)=>{const cvs=container.querySelectorAll('.rsc-ring canvas')[i];if(cvs)drawRing(cvs,c.score,34)});
  // Click handlers
  container.querySelectorAll('.rsc').forEach(el=>{el.addEventListener('click',()=>{container.querySelectorAll('.rsc').forEach(e=>e.classList.remove('active'));el.classList.add('active');showDetail(el.dataset.cat)})});
  // Show first by default
  if(cats.length)showDetail(cats[0].k);
}

function showDetail(cat){
  const r=analysisResult;const d=$('rp-detail');
  const typeMap={plot:null,clarity:'passive',pacing:'sentence-length',hook:'adverb',style:'weak-verb',dialogue:null,showTell:'show-tell',copy:null};
  const titles={plot:'Plot Structure',clarity:'Clarity',pacing:'Pacing',hook:'Hook Strength',style:'Style & Voice',dialogue:'Dialogue',showTell:'Show vs Tell',copy:'Copy Editing'};
  const typeLabels={passive:'Passive Voice Detected',adverb:'Adverb Overuse',cliche:'Cliche Detected','weak-verb':'Weak Verb','show-tell':'Show vs Tell',wordy:'Wordy Phrase',repetition:'Repetition','sentence-length':'Long Sentence'};
  const t=typeMap[cat];
  const issues=t?r.issues.filter(i=>i.type===t).slice(0,5):r.issues.slice(0,5);
  d.innerHTML='<div class="rpd-title"><span style="font-size:1.1rem">'+titles[cat]+'</span><span>&#9660;</span></div>'+
    (issues.length===0?'<p style="color:var(--muted);font-size:.78rem">No issues in this category.</p>':
    issues.map((iss,idx)=>'<div class="rpd-issue" data-issue-text="'+escA(iss.text)+'" data-issue-sug="'+escA(iss.suggestion)+'"><div class="rpd-issue-head">'+(typeLabels[iss.type]||iss.type)+'</div><div class="rpd-desc">'+esc(iss.suggestion)+'</div><div class="rpd-quote">\u2018'+esc(iss.text.substring(0,60))+'\u2019</div><div class="rpd-btns"><button class="tip-fix rpd-fix-btn">Replace &amp; Fix</button><button class="tip-ign rpd-ign-btn">Ignore</button></div></div>').join(''));
  // Bind right-sidebar Replace & Fix
  d.querySelectorAll('.rpd-fix-btn').forEach(btn=>{btn.addEventListener('click',()=>{const card=btn.closest('.rpd-issue');const issueText=card.dataset.issueText;const page=$('ed-annotated');const hl=page.querySelector('.hl[data-q="'+issueText.substring(0,60).replace(/"/g,'&quot;')+'"]');if(hl){replaceAndFix(hl)}card.style.opacity='.3';card.style.pointerEvents='none'})});
  d.querySelectorAll('.rpd-ign-btn').forEach(btn=>{btn.addEventListener('click',()=>{const card=btn.closest('.rpd-issue');const issueText=card.dataset.issueText;const page=$('ed-annotated');const hl=page.querySelector('.hl[data-q="'+issueText.substring(0,60).replace(/"/g,'&quot;')+'"]');if(hl)hl.classList.add('off');card.remove()})});
}

// ANNOTATED TEXT
function renderAnnotated(text,issues){
  const p=$('ed-annotated');p.className='ms-page active parchment';
  p.setAttribute('contenteditable','true');
  p.setAttribute('spellcheck','false');
  p.addEventListener('input',()=>{addReanalyzeButton()});
  const sorted=[...issues].sort((a,b)=>a.index-b.index);const no=[];let le=-1;
  for(const i of sorted){if(i.index>=le){no.push(i);le=i.index+i.length}}
  let h='',pos=0;
  for(const i of no){if(i.index>pos)h+=esc(text.substring(pos,i.index));h+='<span class="hl" data-t="'+i.type+'" data-m="'+escA(i.message)+'" data-s="'+escA(i.suggestion)+'" data-q="'+escA(i.text.substring(0,60))+'">'+esc(text.substring(i.index,i.index+i.length))+'</span>';pos=i.index+i.length}
  if(pos<text.length)h+=esc(text.substring(pos));
  p.innerHTML=h;
  const tip=$('tip');
  let activeHL=null;
  p.addEventListener('click',e=>{const hl=e.target.closest('.hl');if(hl&&!hl.classList.contains('off')){activeHL=hl;const labels={passive:'Passive voice detected',adverb:'Adverb detected',cliche:'Cliche detected','weak-verb':'Weak verb detected',wordy:'Wordy phrase','show-tell':'Show vs Tell',repetition:'Word repetition','sentence-length':'Long sentence'};tip.innerHTML='<div class="tip-cat">'+(labels[hl.dataset.t]||hl.dataset.t)+'</div><div class="tip-sug">\u2192 Suggestion:</div><div class="tip-quote">\u201C'+hl.dataset.s+'\u201D</div><div class="tip-btns"><button class="tip-fix" id="tip-fix-btn">Replace &amp; Fix</button><button class="tip-ign" id="tip-ign-btn">Ignore</button></div>';tip.classList.add('on');const rect=hl.getBoundingClientRect();tip.style.top=(rect.bottom+8)+'px';tip.style.left=Math.min(rect.left,window.innerWidth-360)+'px';$('tip-fix-btn').onclick=()=>{replaceAndFix(activeHL)};$('tip-ign-btn').onclick=()=>{activeHL.classList.add('off');tip.classList.remove('on')}}else if(!e.target.closest('.tip')){tip.classList.remove('on')}});
  document.addEventListener('click',e=>{if(!e.target.closest('.hl')&&!e.target.closest('.tip'))tip.classList.remove('on')});
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
  h+=sec(plotLabel,r.scores.plot,plotRows);
  h+=sec('Transitions',r.scores.transitions,[r.transitions.smoothRate+'% smooth',sr('Transition Words',r.transitions.transitionsUsed),sr('Smooth',r.transitions.smoothTransitions+'/'+(r.transitions.totalParagraphs-1))]);
  h+=sec('Copy Editing',r.scores.copy,[r.issues.length+' issues in '+r.totalWords.toLocaleString()+' words',sr('Passive',r.issueCounts.passive),sr('Adverbs',r.issueCounts.adverb),sr('Cliches',r.issueCounts.cliche),sr('Weak Verbs',r.issueCounts['weak-verb']),sr('Show/Tell',r.issueCounts['show-tell'])]);
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
  h+=sec('Line Editing',r.scores.line,lineRows);
  h+=sec('Style & Voice',r.scores.style,[sr('POV',r.style.pov),sr('Lexical Diversity',r.style.lexicalDiversity+'/100'),sr('Unique Words',r.style.uniqueWords.toLocaleString())]);
  h+=sec('Dialogue',r.scores.dialogue,[r.dialogue.count===0?'No dialogue detected.':'',sr('Lines',r.dialogue.count),sr('Ratio',r.dialogue.ratio+'/100')]);
  // Pacing heatmap
  if(r.pacing){const cols={action:'#c0392b',dialogue:'#2980b9',description:'#27ae60',exposition:'#f39c12',reflection:'#8e44ad'};
  h+='<div class="a-sec"><h3>Pacing Heatmap</h3><div class="hm-wrap">'+r.pacing.segments.map((s,i)=>'<div class="hm-blk" style="background:'+cols[s.type]+'" title="Seg '+(i+1)+': '+s.type+'"></div>').join('')+'</div><div class="hm-leg"><span><span class="hm-dot" style="background:#c0392b"></span>Action</span><span><span class="hm-dot" style="background:#2980b9"></span>Dialogue</span><span><span class="hm-dot" style="background:#27ae60"></span>Description</span><span><span class="hm-dot" style="background:#f39c12"></span>Exposition</span><span><span class="hm-dot" style="background:#8e44ad"></span>Reflection</span></div></div>'}
  // Characters
  if(r.characters.list.length>0){const mx=Math.max(...r.characters.list.map(c=>c.mentions));h+='<div class="a-sec"><h3>Characters</h3><div class="ch-grid">'+r.characters.list.map(c=>'<div class="ch-card"><div class="ch-name">'+esc(c.name)+'</div><div class="ch-cnt">'+c.mentions+' mentions</div><div class="ch-bar"><div class="ch-fill" style="width:'+Math.round(c.mentions/mx*100)+'%"></div></div></div>').join('')+'</div></div>'}
  d.innerHTML=h;
}
function sec(t,s,items){return '<div class="a-sec"><h3>'+t+' <span style="color:'+sc(s)+'">'+s+'/100</span></h3>'+items.filter(Boolean).map(i=>typeof i==='string'?(i?'<p>'+i+'</p>':''):i).join('')+'</div>'}
function sr(l,v){return '<div class="sr"><span class="sr-l">'+l+'</span><span class="sr-v">'+v+'</span></div>'}

// READER VIEW
function renderReader(r){
  const d=$('ed-reader');d.className='ms-page dark-page';const rp=r.readerPerspective;
  const mc=(s,inv)=>{const v=inv?100-s:s;return v>=70?'var(--green)':v>=40?'var(--yellow)':'var(--red)'};
  let h='<div class="rdr-grid">';
  h+=rc('Engagement',rp.engagementScore,mc(rp.engagementScore),'How hooked?');
  h+=rc('Hook Strength',rp.hookStrength,mc(rp.hookStrength),'Opening grab?');
  h+='<div class="rdr-card"><h4>DNF Risk</h4><div class="rdr-big" style="color:'+mc(rp.dnfRisk,true)+'">'+rp.dnfRisk+'/100</div><div class="rdr-bar"><div class="rdr-fill" style="width:'+rp.dnfRisk+'%;background:'+mc(rp.dnfRisk,true)+'"></div></div><div style="display:flex;justify-content:space-between"><span class="rdr-lbl">Safe</span><span class="rdr-lbl">At Risk</span></div></div>';
  h+=rc('Clarity',rp.clarityScore,mc(rp.clarityScore),'Follow the story?');
  h+='<div class="rdr-card"><h4>Pacing</h4><p style="font-size:.82rem;margin-top:.3rem">'+esc(rp.pacingFeel)+'</p></div>';
  h+='<div class="rdr-card"><h4>Verdict</h4><p style="font-size:.82rem;margin-top:.3rem">'+esc(rp.overallVerdict)+'</p></div>';
  h+='</div>';
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
}
function rc(t,s,c,desc){return '<div class="rdr-card"><h4>'+t+'</h4><div class="rdr-big" style="color:'+c+'">'+s+'/100</div><div class="rdr-bar"><div class="rdr-fill" style="width:'+s+'%;background:'+c+'"></div></div><div class="rdr-lbl">'+desc+'</div></div>'}

// TABS (bottom)
document.querySelectorAll('.btab').forEach(t=>{t.addEventListener('click',()=>{
  document.querySelectorAll('.btab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.ms-page').forEach(p=>{p.classList.remove('active')});
  t.classList.add('active');
  const target=$('ed-'+t.dataset.p);
  if(target){
    target.classList.add('active');
    // Ensure non-parchment tabs have dark-page class
    if(t.dataset.p!=='annotated'&&!target.classList.contains('dark-page')){target.classList.add('dark-page')}
  }
})});
document.querySelectorAll('.rtab').forEach(t=>{t.addEventListener('click',()=>{
  document.querySelectorAll('.rtab').forEach(b=>b.classList.remove('active'));t.classList.add('active');
  const mode=t.textContent.trim().toLowerCase();
  if(!analysisResult)return;
  const d=$('rp-detail');const r=analysisResult;
  if(mode==='suggestions'){renderRight(r);return}
  if(mode==='rewrite'){
    const samples=r.issues.filter(i=>['passive','weak-verb','wordy'].includes(i.type)).slice(0,5);
    d.innerHTML='<div class="rpd-title">Rewrite Suggestions</div>'+(samples.length===0?'<p style="color:var(--muted);font-size:.78rem">No rewrite targets found.</p>':samples.map(i=>'<div class="rpd-issue"><div class="rpd-issue-head">Rewrite: "'+esc(i.text.substring(0,40))+'"</div><div class="rpd-desc">'+esc(i.suggestion)+'</div><div class="rpd-quote">Original: \u201C'+esc(i.text)+'\u201D</div></div>').join(''));
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
  // Try server proxy first (no API key needed - your server handles it)
  // If server proxy not available, show modal for dev/testing mode
  try{
    const test=await fetch(AIEngine.API_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({test:true})});
    if(test.ok||test.status===400){runAI(null);return}
  }catch(e){}
  // Server proxy not available - fall back to dev mode modal
  const k=sessionStorage.getItem('ml_claude_key');
  if(k){runAI(k);return}
  $('api-modal').classList.remove('hidden');
});
$('modal-x')?.addEventListener('click',()=>$('api-modal').classList.add('hidden'));
$('modal-go')?.addEventListener('click',()=>{const k=$('modal-key').value.trim();if(!k){alert('Enter API key');return}sessionStorage.setItem('ml_claude_key',k);$('api-modal').classList.add('hidden');runAI(k)});
async function runAI(key){if(!analysisResult)return;const st=$('ai-status'),stxt=$('ai-status-text');st.classList.remove('hidden');try{const ai=await AIEngine.runAllFeatures(key,extractedText,analysisResult,(l,i,n)=>{stxt.textContent=l+' ('+(i+1)+'/'+n+')'});analysisResult._aiResults=ai;renderAI(ai);st.classList.add('hidden');$('ai-results').classList.remove('hidden');document.querySelector('.ai-intro')?.classList.add('hidden');AIEngine.saveVersion(uploadedFile.name,analysisResult,ai);renderVersions()}catch(e){st.classList.add('hidden');alert('AI error: '+e.message)}}
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

// EXPORT
$('export-btn')?.addEventListener('click',()=>{if(!analysisResult)return;const r=analysisResult;const l=['ManuscriptLens Report','='.repeat(30),'','File: '+uploadedFile.name,'Genre: '+r.genre.label,'Words: '+r.totalWords,'Overall: '+r.overall+'/100','','Plot: '+r.scores.plot+'/100','Copy: '+r.scores.copy+'/100','Style: '+r.scores.style+'/100','Dialogue: '+r.scores.dialogue+'/100','Show/Tell: '+r.scores.showTell+'/100','','Engagement: '+r.readerPerspective.engagementScore+'/100','Hook: '+r.readerPerspective.hookStrength+'/100','DNF Risk: '+r.readerPerspective.dnfRisk+'/100','Clarity: '+r.readerPerspective.clarityScore+'/100','','Issues: '+r.issues.length];r.issues.slice(0,20).forEach((i,n)=>{l.push((n+1)+'. ['+i.type+'] '+i.message)});const b=new Blob([l.join('\n')],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=uploadedFile.name.replace(/\.\w+$/,'')+'-report.txt';a.click()});

// NEW
$('new-btn')?.addEventListener('click',()=>{$('editor-view').classList.add('hidden');$('upload-view').classList.remove('hidden');$('upload-loading').classList.add('hidden');$('analyze-btn').classList.add('hidden');$('file-info').classList.add('hidden');uploadedFile=null;extractedText='';analysisResult=null;fi.value=''});
})();
