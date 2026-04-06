// ManuscriptLens - 3-Panel Editor App v3
(function() {
  let uploadedFile = null, extractedText = '', analysisResult = null;
  const $ = id => document.getElementById(id);

  // ========================
  // FILE UPLOAD
  // ========================
  const dropZone = $('drop-zone'), fileInput = $('file-input');
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });
  $('clear-file').addEventListener('click', () => { uploadedFile = null; $('file-info').classList.add('hidden'); $('analyze-btn').classList.add('hidden'); fileInput.value = ''; });

  function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['docx','pdf','txt'].includes(ext)) { alert('Please upload a .docx, .pdf, or .txt file.'); return; }
    uploadedFile = file;
    $('file-name').textContent = file.name + ' (' + (file.size/1024).toFixed(1) + ' KB)';
    $('file-info').classList.remove('hidden');
    $('analyze-btn').classList.remove('hidden');
  }

  async function extractText(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'txt') return await file.text();
    if (ext === 'docx') { $('loader-text').textContent = 'Extracting from Word...'; return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value; }
    if (ext === 'pdf') {
      $('loader-text').textContent = 'Extracting from PDF...';
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      let t = ''; for (let i = 1; i <= pdf.numPages; i++) { const c = await (await pdf.getPage(i)).getTextContent(); t += c.items.map(x => x.str).join(' ') + '\n\n'; } return t;
    }
  }

  $('analyze-btn').addEventListener('click', async () => {
    if (!uploadedFile) return;
    $('analyze-btn').classList.add('hidden');
    $('upload-loading').classList.remove('hidden');
    try {
      $('loader-text').textContent = 'Extracting text...';
      extractedText = await extractText(uploadedFile);
      $('loader-text').textContent = 'Analyzing manuscript...';
      await new Promise(r => setTimeout(r, 100));
      analysisResult = Analyzer.analyze(extractedText);
      if (analysisResult.error) { alert(analysisResult.error); $('upload-loading').classList.add('hidden'); $('analyze-btn').classList.remove('hidden'); return; }
      $('upload-view').classList.add('hidden');
      $('editor-view').classList.remove('hidden');
      renderAll();
    } catch (err) { alert('Error: ' + err.message); $('upload-loading').classList.add('hidden'); $('analyze-btn').classList.remove('hidden'); }
  });

  // ========================
  // HELPERS
  // ========================
  function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escA(s) { return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function paraNum(text, idx) { return (text.substring(0, idx).match(/\n\s*\n/g) || []).length + 1; }
  function scoreColor(s) { return s >= 70 ? 'var(--success)' : s >= 45 ? 'var(--warning)' : 'var(--danger)'; }

  // ========================
  // RENDER ALL
  // ========================
  function renderAll() {
    const r = analysisResult;
    $('top-filename').textContent = uploadedFile.name.replace(/\.\w+$/, '');
    $('top-wordcount').textContent = r.totalWords.toLocaleString();
    $('top-status').textContent = r.genre.label;

    // Overall gauge
    $('overall-score').textContent = r.overall;
    const circumference = 2 * Math.PI * 52; // r=52
    const fill = $('gauge-fill-overall');
    fill.style.strokeDasharray = (r.overall / 100 * circumference) + ' ' + circumference;
    fill.style.stroke = scoreColor(r.overall);

    renderLeftSidebar(r);
    renderRightSidebar(r);
    renderAnnotatedText(extractedText, r.issues);
    renderDetailed(r);
    renderReaderView(r);
    renderVersionHistory();
  }

  // ========================
  // LEFT SIDEBAR
  // ========================
  function renderLeftSidebar(r) {
    const rp = r.readerPerspective;
    const cards = [
      { name: 'Engagement Score', score: rp.engagementScore, sub: 'How hooked will readers be?', action: '+ Improve Opening' },
      { name: 'Hook Strength', score: rp.hookStrength, sub: (r.issueCounts.passive + r.issueCounts.adverb) + ' Issues', action: '+ Improve Opening' },
      { name: 'Clarity', score: rp.clarityScore, sub: 'Weak transitions', action: null },
      { name: 'Pacing', score: Math.round((r.scores.plot + r.scores.transitions) / 2), sub: rp.pacingFeel.split(' - ')[0] || rp.pacingFeel, action: null, badge: rp.pacingFeel.includes('Rushed') ? 'Rushed' : rp.pacingFeel.includes('Slow') ? 'Slow' : 'Good' },
      { name: 'DNF Risk', score: rp.dnfRisk, sub: rp.dnfRisk > 60 ? 'At Risk' : rp.dnfRisk > 30 ? 'Moderate' : 'Safe', invert: true }
    ];
    const container = $('health-cards');
    container.innerHTML = cards.map(c => {
      const displayScore = c.score;
      const color = c.invert ? scoreColor(100 - displayScore) : scoreColor(displayScore);
      const ringPct = displayScore;
      return '<div class="health-card">' +
        '<div class="hc-ring"><svg viewBox="0 0 36 36"><circle class="hc-bg" cx="18" cy="18" r="15.9155"/><circle class="hc-fill" cx="18" cy="18" r="15.9155" style="stroke-dasharray:' + ringPct + ' ' + (100-ringPct) + ';stroke:' + color + '"/></svg><span class="hc-num" style="color:' + color + '">' + displayScore + '</span></div>' +
        '<div class="hc-info"><div class="hc-name">' + c.name + '</div><div class="hc-sub">' + esc(c.sub) + '</div>' +
        (c.action ? '<span class="hc-action">' + c.action + '</span>' : '') + '</div>' +
        (c.badge ? '<span class="rc-badge" style="background:var(--surface-2);color:' + color + '">' + c.badge + '</span>' : '<span class="hc-score" style="color:' + color + '">' + displayScore + '</span>') +
        '</div>';
    }).join('');
  }

  // ========================
  // RIGHT SIDEBAR
  // ========================
  function renderRightSidebar(r) {
    const categories = [
      { key: 'plot', name: 'Plot Structure', score: r.scores.plot, issues: 0 },
      { key: 'copy', name: 'Copy Editing', score: r.scores.copy, issues: r.issues.length },
      { key: 'clarity', name: 'Clarity', score: r.readerPerspective.clarityScore, issues: r.issueCounts.passive },
      { key: 'pacing', name: 'Pacing', score: Math.round((r.scores.plot + r.scores.transitions) / 2), issues: r.issueCounts['sentence-length'] },
      { key: 'hookStrength', name: 'Hook Strength', score: r.readerPerspective.hookStrength, issues: r.issueCounts.adverb },
      { key: 'style', name: 'Style & Voice', score: r.scores.style, issues: r.issueCounts['weak-verb'] },
      { key: 'dialogue', name: 'Dialogue', score: r.scores.dialogue, issues: 0 },
      { key: 'showTell', name: 'Show vs Tell', score: r.scores.showTell, issues: r.issueCounts['show-tell'] }
    ];
    const container = $('right-score-cards');
    container.innerHTML = categories.map(c => {
      const color = scoreColor(c.score);
      return '<div class="right-card" data-cat="' + c.key + '">' +
        '<div class="rc-ring"><svg viewBox="0 0 36 36"><circle class="rc-bg" cx="18" cy="18" r="15.9155"/><circle class="rc-fill" cx="18" cy="18" r="15.9155" style="stroke-dasharray:' + c.score + ' ' + (100-c.score) + ';stroke:' + color + '"/></svg><span class="rc-num" style="color:' + color + '">' + c.score + '</span></div>' +
        '<div class="rc-info"><div class="rc-name">' + c.name + '</div><div class="rc-sub">' + c.issues + ' Issues</div></div>' +
        '<span class="rc-score" style="color:' + color + '">' + c.score + '</span></div>';
    }).join('');

    // Click to expand issues
    container.querySelectorAll('.right-card').forEach(card => {
      card.addEventListener('click', () => {
        const cat = card.dataset.cat;
        showCategoryDetail(cat);
        container.querySelectorAll('.right-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });
    });
  }

  function showCategoryDetail(cat) {
    const r = analysisResult;
    const detail = $('right-issue-detail');
    detail.classList.remove('hidden');
    const typeMap = { plot: null, copy: null, clarity: 'passive', pacing: 'sentence-length', hookStrength: 'adverb', style: 'weak-verb', dialogue: null, showTell: 'show-tell' };
    const issueType = typeMap[cat];
    const typeLabels = { passive:'Passive Voice Detected', adverb:'Adverb Overuse', cliche:'Cliche Detected', 'weak-verb':'Weak Verb', wordy:'Wordy Phrase', repetition:'Word Repetition', 'sentence-length':'Long Sentence', 'show-tell':'Show vs Tell' };
    const title = { plot:'Plot Structure', copy:'Copy Editing', clarity:'Clarity', pacing:'Pacing', hookStrength:'Hook Strength', style:'Style & Voice', dialogue:'Dialogue', showTell:'Show vs Tell' };
    $('detail-category-title').textContent = title[cat] || cat;
    const issues = issueType ? r.issues.filter(i => i.type === issueType).slice(0, 8) : r.issues.slice(0, 5);
    $('detail-issues-list').innerHTML = issues.length === 0 ? '<p style="color:var(--text-muted);font-size:.8rem">No specific issues in this category.</p>' :
      issues.map(i => '<div class="detail-issue"><div class="detail-issue-title">' + (typeLabels[i.type] || i.type) + '</div><div class="detail-issue-desc">' + esc(i.suggestion) + '</div><div class="detail-issue-quote">\u201C' + esc(i.text.substring(0, 60)) + '\u201D</div><div class="detail-issue-actions"><button class="tip-btn tip-btn-fix" onclick="alert(\'Replace & Fix coming soon\')">Replace &amp; Fix</button><button class="tip-btn tip-btn-ignore" onclick="this.closest(\'.detail-issue\').remove()">Ignore</button></div></div>').join('');
  }

  // ========================
  // ANNOTATED TEXT (parchment)
  // ========================
  function renderAnnotatedText(text, issues) {
    const container = $('annotated-text');
    const sorted = [...issues].sort((a, b) => a.index - b.index);
    const noOverlap = []; let lastEnd = -1;
    for (const i of sorted) { if (i.index >= lastEnd) { noOverlap.push(i); lastEnd = i.index + i.length; } }
    let html = '', pos = 0;
    for (const i of noOverlap) {
      if (i.index > pos) html += esc(text.substring(pos, i.index));
      html += '<span class="highlight" data-type="' + i.type + '" data-msg="' + escA(i.message) + '" data-suggestion="' + escA(i.suggestion) + '">' + esc(text.substring(i.index, i.index + i.length)) + '</span>';
      pos = i.index + i.length;
    }
    if (pos < text.length) html += esc(text.substring(pos));
    container.innerHTML = html;

    // Tooltip with Replace & Fix / Ignore
    const tooltip = $('tooltip');
    const typeLabels = { passive:'Passive Voice', adverb:'Adverb', cliche:'Cliche', repetition:'Repetition', 'weak-verb':'Weak Verb', wordy:'Wordy Phrase', 'sentence-length':'Long Sentence', 'show-tell':'Show vs Tell' };
    container.addEventListener('mouseover', e => {
      const hl = e.target.closest('.highlight');
      if (hl && !hl.classList.contains('hidden-type')) {
        tooltip.innerHTML = '<div class="tip-type" style="color:var(--' + hl.dataset.type + ')">' + (typeLabels[hl.dataset.type] || hl.dataset.type) + '</div>' +
          '<div class="tip-suggestion">\u2192 Suggestion:<br>' + hl.dataset.suggestion + '</div>' +
          '<div class="tip-actions"><button class="tip-btn tip-btn-fix">Replace &amp; Fix</button><button class="tip-btn tip-btn-ignore">Ignore</button></div>';
        tooltip.classList.add('visible');
        const rect = hl.getBoundingClientRect();
        tooltip.style.top = (rect.bottom + 8) + 'px';
        tooltip.style.left = Math.min(rect.left, window.innerWidth - 340) + 'px';
        // Ignore button
        tooltip.querySelector('.tip-btn-ignore')?.addEventListener('click', () => { hl.classList.add('hidden-type'); tooltip.classList.remove('visible'); }, { once: true });
      }
    });
    container.addEventListener('mouseout', e => { if (e.target.closest('.highlight')) setTimeout(() => { if (!tooltip.matches(':hover')) tooltip.classList.remove('visible'); }, 200); });
    tooltip.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
  }

  // ========================
  // DETAILED ANALYSIS
  // ========================
  function renderDetailed(r) {
    const d = $('detailed-analysis');
    const plotLabels = { classic:'Classic arc (rising action, climax, resolution)', rising:'Rising tension but resolution needs work', 'resolution-focused':'Strong resolution, rising action needs development', flat:'Flat tension - add more conflict', 'too-short':'Text too short for plot analysis' };
    d.innerHTML = [
      sec('Plot Structure', r.scores.plot, [
        plotLabels[r.plot.arc] || '', row('Rising Action', r.plot.hasRisingAction ? 'Detected' : 'Weak'), row('Climax', r.plot.hasClimax ? 'Detected' : 'Weak'), row('Resolution', r.plot.hasResolution ? 'Detected' : 'Weak'), row('Paragraphs', r.plot.paragraphCount)
      ]),
      sec('Transitions', r.scores.transitions, [
        r.transitions.smoothRate + '% of transitions are smooth', row('Transition Words', r.transitions.transitionsUsed), row('Smooth', r.transitions.smoothTransitions + ' / ' + (r.transitions.totalParagraphs - 1))
      ]),
      sec('Copy Editing', r.scores.copy, [
        r.issues.length + ' issues across ' + r.totalWords.toLocaleString() + ' words',
        row('Passive Voice', r.issueCounts.passive), row('Adverbs', r.issueCounts.adverb), row('Cliches', r.issueCounts.cliche), row('Weak Verbs', r.issueCounts['weak-verb']), row('Show vs Tell', r.issueCounts['show-tell'])
      ]),
      sec('Line Editing', r.scores.line, [
        row('Readability Grade', r.readability.grade), row('Flesch Ease', r.readability.ease + '/100'), row('Sentence Variety', r.sentenceVariety.score + '/100'), row('Avg Sentence', r.sentenceVariety.avgLength + ' words')
      ]),
      sec('Style & Voice', r.scores.style, [
        row('POV', r.style.pov), row('Lexical Diversity', r.style.lexicalDiversity + '/100'), row('Unique Words', r.style.uniqueWords.toLocaleString())
      ]),
      sec('Dialogue', r.scores.dialogue, [
        r.dialogue.count === 0 ? 'No dialogue detected.' : '', row('Lines', r.dialogue.count), row('Ratio', r.dialogue.ratio + '/100'), row('Said Usage', r.dialogue.saidRatio + '/100')
      ])
    ].join('');

    // Pacing heatmap
    const hm = $('pacing-heatmap');
    if (hm && r.pacing) {
      const colors = { action:'#c0392b', dialogue:'#2980b9', description:'#27ae60', exposition:'#f39c12', reflection:'#8e44ad' };
      hm.innerHTML = '<div class="heatmap-container">' + r.pacing.segments.map((s, i) =>
        '<div class="heatmap-block" style="background:' + colors[s.type] + '" title="Segment ' + (i+1) + ': ' + s.type + ' (' + s.wordCount + ' words)"></div>'
      ).join('') + '</div>';
    }
    // Characters
    const ch = $('character-tracker');
    if (ch && r.characters.list.length > 0) {
      const max = Math.max(...r.characters.list.map(c => c.mentions));
      ch.innerHTML = '<div class="character-grid">' + r.characters.list.map(c =>
        '<div class="character-card"><div class="char-name">' + esc(c.name) + '</div><div class="char-mentions">' + c.mentions + ' mentions' + (c.dialogueCount ? ' &middot; ' + c.dialogueCount + ' dialogue' : '') + '</div><div class="char-bar"><div class="char-bar-fill" style="width:' + Math.round(c.mentions/max*100) + '%"></div></div></div>'
      ).join('') + '</div>';
    } else if (ch) { ch.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">No recurring characters detected.</p>'; }
    // Grammar placeholder
    const gr = $('grammar-results');
    if (gr) gr.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Grammar API integration available via AI Critique tab.</p>';
  }
  function sec(title, score, items) {
    return '<div class="analysis-section"><h3>' + title + ' <span style="float:right;color:' + scoreColor(score) + '">' + score + '/100</span></h3>' + items.filter(Boolean).map(i => typeof i === 'string' ? (i ? '<p>' + i + '</p>' : '') : i).join('') + '</div>';
  }
  function row(label, val) { return '<div class="stat-row"><span class="stat-label">' + label + '</span><span class="stat-value">' + val + '</span></div>'; }

  // ========================
  // READER VIEW
  // ========================
  function renderReaderView(r) {
    const rp = r.readerPerspective;
    const mc = (s, inv) => { const v = inv ? 100-s : s; return v >= 70 ? 'var(--success)' : v >= 40 ? 'var(--warning)' : 'var(--danger)'; };
    let html = '<div class="reader-grid">';
    html += rCard('Engagement Score', rp.engagementScore, mc(rp.engagementScore), 'How hooked will readers be?');
    html += rCard('Hook Strength', rp.hookStrength, mc(rp.hookStrength), 'Does the opening grab attention?');
    html += '<div class="reader-card"><h4>DNF Risk</h4><div class="big-score" style="color:' + mc(rp.dnfRisk, true) + '">' + rp.dnfRisk + '/100</div><div class="meter-bar"><div class="meter-fill" style="width:' + rp.dnfRisk + '%;background:' + mc(rp.dnfRisk, true) + '"></div></div><div style="display:flex;justify-content:space-between;font-size:.65rem;color:var(--text-muted)"><span>Safe</span><span>At Risk</span></div></div>';
    html += rCard('Clarity', rp.clarityScore, mc(rp.clarityScore), 'Can readers follow the story?');
    html += '<div class="reader-card"><h4>Pacing Feel</h4><p style="font-size:.85rem;margin-top:.4rem">' + esc(rp.pacingFeel) + '</p></div>';
    html += '<div class="reader-card"><h4>Verdict</h4><p style="font-size:.85rem;margin-top:.4rem">' + esc(rp.overallVerdict) + '</p></div>';
    html += '</div>';
    // Emotional journey
    const emColors = { exciting:'#c0392b', tense:'#f39c12', sad:'#2980b9', calm:'#27ae60', hopeful:'#8e44ad' };
    html += '<div class="analysis-section"><h3>Emotional Journey</h3>';
    rp.emotionalJourney.forEach(e => {
      html += '<div class="emotion-bar-row"><span class="emotion-label">' + e.emotion + '</span><div class="emotion-track"><div class="emotion-fill" style="width:' + e.intensity + '%;background:' + (emColors[e.emotion]||'#888') + '"></div></div><span style="font-size:.65rem;color:var(--text-muted);width:30px">' + e.intensity + '/100</span></div>';
    });
    html += '</div>';
    if (rp.immersionBreakers.length > 0) {
      html += '<div class="analysis-section"><h3>Immersion Breakers (' + rp.immersionBreakers.length + ')</h3>';
      rp.immersionBreakers.forEach(b => { html += '<div class="immersion-breaker-item"><div>' + esc(b.reason) + '</div><div class="breaker-location">' + esc(b.location) + '</div></div>'; });
      html += '</div>';
    }
    $('reader-view-content').innerHTML = html;
  }
  function rCard(title, score, color, desc) {
    return '<div class="reader-card"><h4>' + title + '</h4><div class="big-score" style="color:' + color + '">' + score + '/100</div><div class="meter-bar"><div class="meter-fill" style="width:' + score + '%;background:' + color + '"></div></div><div class="score-label">' + desc + '</div></div>';
  }

  // ========================
  // TABS
  // ========================
  document.querySelectorAll('.ed-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ed-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.ed-tab-content').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = $('ed-tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
      // Show/hide filters only on annotated tab
      $('editor-filters').style.display = tab.dataset.tab === 'annotated' ? 'flex' : 'none';
    });
  });
  document.querySelectorAll('.filter-check').forEach(check => {
    check.addEventListener('change', () => {
      document.querySelectorAll('.highlight[data-type="' + check.value + '"]').forEach(el => el.classList.toggle('hidden-type', !check.checked));
    });
  });
  document.querySelectorAll('.fb-tab').forEach(tab => {
    tab.addEventListener('click', () => { document.querySelectorAll('.fb-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active'); });
  });

  // ========================
  // AI CRITIQUE (modal for API key)
  // ========================
  $('run-ai-btn')?.addEventListener('click', () => {
    // Check if key exists in session
    const existing = sessionStorage.getItem('ml_claude_key');
    if (existing) { runAI(existing); return; }
    // Show modal
    $('api-modal').classList.remove('hidden');
  });
  $('modal-cancel')?.addEventListener('click', () => $('api-modal').classList.add('hidden'));
  $('modal-save')?.addEventListener('click', () => {
    const key = $('modal-api-key').value.trim();
    if (!key) { alert('Please enter your API key.'); return; }
    sessionStorage.setItem('ml_claude_key', key);
    $('api-modal').classList.add('hidden');
    runAI(key);
  });

  async function runAI(apiKey) {
    if (!analysisResult) return;
    const statusEl = $('ai-status');
    const statusText = $('ai-status-text');
    statusEl.classList.remove('hidden');
    try {
      const aiResults = await AIEngine.runAllFeatures(apiKey, extractedText, analysisResult, (label, i, total) => {
        statusText.textContent = label + ' (' + (i+1) + '/' + total + ')';
      });
      analysisResult._aiResults = aiResults;
      renderAIResults(aiResults);
      statusEl.classList.add('hidden');
      $('ai-results').classList.remove('hidden');
      document.querySelector('.ai-intro')?.classList.add('hidden');
      AIEngine.saveVersion(uploadedFile.name, analysisResult, aiResults);
      renderVersionHistory();
      // Cache info
      let totalCache = 0, totalInput = 0;
      Object.values(aiResults).forEach(r => { if (r._cacheInfo) { totalCache += r._cacheInfo.cache_read || 0; totalInput += r._cacheInfo.input_tokens || 0; } });
      if (totalCache > 0) $('ai-cache-info').innerHTML = '<p style="color:var(--success);font-size:.75rem">Cached ' + totalCache.toLocaleString() + ' tokens (' + Math.round(totalCache/Math.max(totalInput,1)*100) + '% savings)</p>';
    } catch (err) { statusEl.classList.add('hidden'); alert('AI error: ' + err.message); }
  }

  function renderAIResults(ai) {
    // Reuse existing renderAI logic
    const dc = ai.deepCritique;
    if (dc && !dc.error) {
      $('ai-deep-critique').innerHTML = '<h3>Deep Narrative Critique</h3><p>' + esc(dc.overallAssessment||'') + '</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin:.75rem 0"><div><h4 style="color:var(--success);font-size:.8rem">Strengths</h4><ul class="ai-list">' + (dc.strengths||[]).map(s => '<li>' + esc(s) + '</li>').join('') + '</ul></div><div><h4 style="color:var(--danger);font-size:.8rem">Weaknesses</h4><ul class="ai-list">' + (dc.weaknesses||[]).map(s => '<li>' + esc(s) + '</li>').join('') + '</ul></div></div>' +
        '<div style="margin-top:.75rem;padding:.5rem;background:var(--surface-2);border-radius:var(--radius-sm)"><strong style="color:var(--warning)">Priority Fix:</strong> ' + esc(dc.priorityFix||'') + '</div>';
    }
    const ct = ai.compTitles;
    if (ct && !ct.error) {
      $('ai-comp-titles').innerHTML = '<h3>Comparable Titles</h3><div style="padding:.5rem;background:var(--surface-2);border-radius:var(--radius-sm);font-weight:600;color:var(--accent-light);margin:.5rem 0">' + esc(ct.pitchLine||'') + '</div><div class="comp-grid">' + (ct.compTitles||[]).map(c => '<div class="comp-card"><div class="comp-title">' + esc(c.title) + '</div><div class="comp-author">by ' + esc(c.author) + '</div><div class="comp-reason">' + esc(c.reason) + '</div></div>').join('') + '</div>';
    }
    const ql = ai.queryLetter;
    if (ql && !ql.error) {
      $('ai-query-letter').innerHTML = '<h3>Query Letter</h3><div class="query-letter-text">' + esc(ql.queryLetter||'').replace(/\n/g,'<br>') + '</div><button class="btn-secondary" style="margin-top:.5rem" onclick="navigator.clipboard.writeText(' + JSON.stringify(ql.queryLetter||'') + ');this.textContent=\'Copied!\'">Copy Letter</button>';
    }
    const br = ai.betaReaders;
    if (br && !br.error) {
      $('ai-beta-readers').innerHTML = '<h3>Beta Reader Simulation</h3><div class="beta-grid">' + (br.readers||[]).map(r => '<div class="beta-card"><div class="beta-header"><span class="beta-name">' + esc(r.name) + ' ' + (r.emoticon||'') + '</span><span class="beta-rating">' + '\u2605'.repeat(r.rating||0) + '\u2606'.repeat(5-(r.rating||0)) + '</span></div><div class="beta-profile">' + esc(r.profile) + '</div><div class="beta-reaction">' + esc(r.reaction) + '</div></div>').join('') + '</div><div style="margin-top:.5rem">' + row('Consensus', (br.consensusRating||0) + '/5') + '</div>';
    }
    const mr = ai.marketReadiness;
    if (mr && !mr.error) {
      $('ai-market-readiness').innerHTML = '<h3>Market Readiness</h3><div style="font-size:2rem;font-weight:800;color:' + scoreColor(mr.readinessScore||0) + '">' + (mr.readinessScore||0) + '/100</div>' + row('Publishing Path', mr.publishingPath||'') + row('Stage', mr.developmentalStage||'') + row('Trend Alignment', mr.trendAlignment||'') + '<h4 style="margin-top:.5rem;font-size:.8rem;color:var(--accent-light)">Next Steps</h4><ol class="ai-list">' + (mr.nextSteps||[]).map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>';
    }
    const cb = ai.chapterBreakdown;
    if (cb && !cb.error) {
      $('ai-chapter-breakdown').innerHTML = '<h3>Chapter Breakdown</h3><p style="font-size:.8rem;color:var(--text-muted)">' + esc(cb.structureAssessment||'') + '</p><div class="chapter-grid">' + (cb.chapters||[]).map(c => '<div class="chapter-card"><div class="chapter-num">Ch.' + c.number + '</div><div><div class="chapter-title">' + esc(c.title||'') + '</div><div class="chapter-summary">' + esc(c.summary||'') + '</div><div style="display:flex;gap:.3rem;margin-top:.3rem"><span class="chapter-badge">Pacing: ' + (c.pacingGrade||'?') + '</span><span class="chapter-badge">Tension: ' + (c.tensionLevel||'?') + '</span></div></div></div>').join('') + '</div>';
    }
  }

  // ========================
  // VERSION HISTORY
  // ========================
  function renderVersionHistory() {
    const versions = AIEngine.getVersionHistory();
    const container = $('version-list');
    if (!container) return;
    if (versions.length === 0) { container.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;text-align:center;padding:1.5rem">No versions yet. Analyze a manuscript to start tracking.</p>'; return; }
    let html = '<div class="version-timeline">';
    versions.slice().reverse().forEach(v => {
      const date = new Date(v.date);
      const color = scoreColor(v.overall);
      html += '<div class="version-item"><div class="version-dot" style="background:' + color + '"></div><div class="version-content"><div class="version-top"><span class="version-grade" style="color:' + color + '">' + v.grade + ' (' + v.overall + '/100)</span><span class="version-date">' + date.toLocaleDateString() + '</span></div><div class="version-name">' + esc(v.fileName) + '</div><div class="version-stats">' + v.wordCount.toLocaleString() + ' words &middot; ' + v.totalIssues + ' issues &middot; ' + v.genre + '</div></div></div>';
    });
    html += '</div>';
    if (versions.length >= 2) {
      const f = versions[0], l = versions[versions.length-1], d = l.overall - f.overall;
      html += '<div class="version-summary"><h4>Progress</h4>' + row('Score Change', (d >= 0 ? '+' : '') + d + ' points') + row('Issues Change', (l.totalIssues - f.totalIssues >= 0 ? '+' : '') + (l.totalIssues - f.totalIssues)) + row('Versions', versions.length) + '</div>';
    }
    container.innerHTML = html;
  }
  $('clear-versions-btn')?.addEventListener('click', () => { if (confirm('Clear all history?')) { AIEngine.clearVersionHistory(); renderVersionHistory(); } });

  // ========================
  // EXPORT
  // ========================
  $('export-btn')?.addEventListener('click', () => {
    if (!analysisResult) return;
    const r = analysisResult;
    const lines = ['ManuscriptLens Analysis Report', "Author's Best Buddy", '='.repeat(40), '',
      'File: ' + uploadedFile.name, 'Genre: ' + r.genre.label, 'Words: ' + r.totalWords.toLocaleString(),
      'Overall: ' + r.overall + '/100 (' + Analyzer.getGrade(r.overall) + ')', '',
      'Plot: ' + r.scores.plot + '/100', 'Transitions: ' + r.scores.transitions + '/100',
      'Copy Editing: ' + r.scores.copy + '/100', 'Line Editing: ' + r.scores.line + '/100',
      'Style: ' + r.scores.style + '/100', 'Dialogue: ' + r.scores.dialogue + '/100',
      'Show vs Tell: ' + r.scores.showTell + '/100', '',
      'Engagement: ' + r.readerPerspective.engagementScore + '/100',
      'Hook: ' + r.readerPerspective.hookStrength + '/100',
      'DNF Risk: ' + r.readerPerspective.dnfRisk + '/100',
      'Clarity: ' + r.readerPerspective.clarityScore + '/100', '',
      'Issues: ' + r.issues.length
    ];
    r.issues.slice(0, 25).forEach((i, n) => { lines.push((n+1) + '. [' + i.type + ' | Para ' + paraNum(extractedText, i.index) + '] ' + i.message); });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = uploadedFile.name.replace(/\.\w+$/, '') + '-report.txt'; a.click();
  });

  // ========================
  // NEW ANALYSIS
  // ========================
  $('new-analysis-btn')?.addEventListener('click', () => {
    $('editor-view').classList.add('hidden');
    $('upload-view').classList.remove('hidden');
    $('upload-loading').classList.add('hidden');
    $('analyze-btn').classList.add('hidden');
    $('file-info').classList.add('hidden');
    uploadedFile = null; extractedText = ''; analysisResult = null; fileInput.value = '';
  });

})();
