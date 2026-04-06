// ManuscriptLens - Application Logic v2

(function() {
  let uploadedFile = null;
  let extractedText = '';
  let analysisResult = null;

  const $ = id => document.getElementById(id);
  const dropZone = $('drop-zone');
  const fileInput = $('file-input');
  const fileInfo = $('file-info');
  const fileName = $('file-name');
  const clearBtn = $('clear-file');
  const analyzeBtn = $('analyze-btn');
  const uploadSection = $('upload-section');
  const loadingSection = $('loading-section');
  const resultsSection = $('results-section');
  const loaderText = $('loader-text');

  // ========================
  // FILE UPLOAD
  // ========================
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });
  clearBtn.addEventListener('click', () => { uploadedFile = null; extractedText = ''; fileInfo.classList.add('hidden'); analyzeBtn.classList.add('hidden'); fileInput.value = ''; });

  function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['docx','pdf','txt'].includes(ext)) { alert('Please upload a .docx, .pdf, or .txt file.'); return; }
    uploadedFile = file;
    fileName.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
    fileInfo.classList.remove('hidden');
    analyzeBtn.classList.remove('hidden');
  }

  // ========================
  // TEXT EXTRACTION
  // ========================
  async function extractText(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'txt') return await file.text();
    if (ext === 'docx') {
      loaderText.textContent = 'Extracting text from Word document...';
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }
    if (ext === 'pdf') {
      loaderText.textContent = 'Extracting text from PDF...';
      const arrayBuffer = await file.arrayBuffer();
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ') + '\n\n';
      }
      return text;
    }
    throw new Error('Unsupported file type');
  }

  // ========================
  // ANALYZE
  // ========================
  analyzeBtn.addEventListener('click', async () => {
    if (!uploadedFile) return;
    uploadSection.classList.add('hidden');
    loadingSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    try {
      loaderText.textContent = 'Extracting text...';
      extractedText = await extractText(uploadedFile);
      loaderText.textContent = 'Analyzing manuscript...';
      await new Promise(r => setTimeout(r, 100));
      analysisResult = Analyzer.analyze(extractedText);
      if (analysisResult.error) { alert(analysisResult.error); loadingSection.classList.add('hidden'); uploadSection.classList.remove('hidden'); return; }
      // Grammar API
      const apiKey = $('grammar-api-key')?.value?.trim();
      if (apiKey) {
        loaderText.textContent = 'Checking grammar & spelling...';
        const grammarResult = await Analyzer.checkGrammarAPI(extractedText, apiKey);
        analysisResult.grammarResult = grammarResult;
        if (grammarResult && !grammarResult.error) {
          const corrections = grammarResult.corrections || grammarResult.matches || [];
          analysisResult.scores.grammar = Math.max(0, 100 - corrections.length * 3);
        }
      }
      renderResults();
      loadingSection.classList.add('hidden');
      resultsSection.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      alert('Error processing file: ' + err.message);
      loadingSection.classList.add('hidden');
      uploadSection.classList.remove('hidden');
    }
  });

  // ========================
  // HELPERS
  // ========================
  function escapeHtml(str) { return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escapeAttr(str) { return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function getParagraphNumber(text, charIndex) {
    const before = text.substring(0, charIndex);
    return (before.match(/\n\s*\n/g) || []).length + 1;
  }

  function drawDonutChart(canvasId, data) {
    const canvas = $(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const outerR = Math.min(cx, cy) - 10;
    const innerR = outerR * 0.6;
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) return;

    let startAngle = -Math.PI / 2;
    data.forEach(d => {
      const sliceAngle = (d.value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
      ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = d.color;
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Center text
    ctx.fillStyle = '#e8eaf0';
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total, cx, cy - 8);
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillStyle = '#8b90a5';
    ctx.fillText('issues', cx, cy + 12);
  }

  // ========================
  // RENDER RESULTS
  // ========================
  function renderResults() {
    const r = analysisResult;
    $('overall-grade').textContent = Analyzer.getGrade(r.overall);
    $('manuscript-title').textContent = uploadedFile.name.replace(/\.\w+$/, '');
    $('genre-badge').textContent = r.genre.label;
    $('word-count').textContent = r.totalWords.toLocaleString();

    const categories = ['plot','transitions','copy','line','style','dialogue','showTell','grammar'];
    const ringIds = { showTell: 'show-tell', grammar: 'grammar' };
    categories.forEach(cat => {
      const score = r.scores[cat] || 0;
      const id = ringIds[cat] || cat;
      const scoreEl = $('score-' + id);
      const ringEl = $('ring-' + id);
      if (scoreEl) scoreEl.textContent = score;
      if (ringEl) {
        ringEl.style.strokeDasharray = score + ' ' + (100 - score);
        ringEl.style.stroke = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';
      }
    });

    renderDetailedAnalysis(r);
    renderAnnotatedText(extractedText, r.issues);
    renderIssuesList(r.issues);
    renderReaderView(r);
  }

  // ========================
  // DETAILED ANALYSIS
  // ========================
  function renderDetailedAnalysis(r) {
    const container = $('detailed-analysis');
    container.innerHTML = '';
    const plotArcLabels = {
      'classic': 'Classic narrative arc detected (rising action, climax, resolution)',
      'rising': 'Rising tension detected but resolution could be stronger',
      'resolution-focused': 'Strong resolution but rising action needs development',
      'flat': 'Flat tension curve - consider adding more conflict and stakes',
      'too-short': 'Text too short for full plot analysis'
    };

    container.innerHTML += '<div class="analysis-section"><h3>Plot Structure (' + r.scores.plot + '/100)</h3><p>' + (plotArcLabels[r.plot.arc] || 'Analysis complete.') + '</p><div style="margin-top:.75rem"><div class="stat-row"><span class="stat-label">Rising Action</span><span class="stat-value">' + (r.plot.hasRisingAction ? 'Detected' : 'Weak/Missing') + '</span></div><div class="stat-row"><span class="stat-label">Climax</span><span class="stat-value">' + (r.plot.hasClimax ? 'Detected' : 'Weak/Missing') + '</span></div><div class="stat-row"><span class="stat-label">Resolution</span><span class="stat-value">' + (r.plot.hasResolution ? 'Detected' : 'Weak/Missing') + '</span></div><div class="stat-row"><span class="stat-label">Paragraphs</span><span class="stat-value">' + r.plot.paragraphCount + '</span></div></div></div>';

    container.innerHTML += '<div class="analysis-section"><h3>Transitions (' + r.scores.transitions + '/100)</h3><p>' + r.transitions.smoothRate + '% of paragraph transitions are smooth.</p><div style="margin-top:.75rem"><div class="stat-row"><span class="stat-label">Transition Words Used</span><span class="stat-value">' + r.transitions.transitionsUsed + '</span></div><div class="stat-row"><span class="stat-label">Smooth Transitions</span><span class="stat-value">' + r.transitions.smoothTransitions + ' / ' + (r.transitions.totalParagraphs - 1) + '</span></div></div></div>';

    container.innerHTML += '<div class="analysis-section"><h3>Copy Editing (' + r.scores.copy + '/100)</h3><p>' + r.issues.length + ' issues found across ' + r.totalWords.toLocaleString() + ' words.</p><div style="margin-top:.75rem"><div class="stat-row"><span class="stat-label">Passive Voice</span><span class="stat-value">' + r.issueCounts.passive + '</span></div><div class="stat-row"><span class="stat-label">Adverbs</span><span class="stat-value">' + r.issueCounts.adverb + '</span></div><div class="stat-row"><span class="stat-label">Clich&eacute;s</span><span class="stat-value">' + r.issueCounts.cliche + '</span></div><div class="stat-row"><span class="stat-label">Weak Verbs</span><span class="stat-value">' + r.issueCounts['weak-verb'] + '</span></div><div class="stat-row"><span class="stat-label">Wordy Phrases</span><span class="stat-value">' + r.issueCounts.wordy + '</span></div><div class="stat-row"><span class="stat-label">Repetitions</span><span class="stat-value">' + r.issueCounts.repetition + '</span></div><div class="stat-row"><span class="stat-label">Long Sentences</span><span class="stat-value">' + r.issueCounts['sentence-length'] + '</span></div><div class="stat-row"><span class="stat-label">Show vs Tell</span><span class="stat-value">' + r.issueCounts['show-tell'] + '</span></div></div></div>';

    container.innerHTML += '<div class="analysis-section"><h3>Line Editing (' + r.scores.line + '/100)</h3><div style="margin-top:.75rem"><div class="stat-row"><span class="stat-label">Readability Grade</span><span class="stat-value">' + r.readability.grade + '</span></div><div class="stat-row"><span class="stat-label">Flesch Ease</span><span class="stat-value">' + r.readability.ease + '</span></div><div class="stat-row"><span class="stat-label">Sentence Variety</span><span class="stat-value">' + r.sentenceVariety.score + '/100</span></div><div class="stat-row"><span class="stat-label">Avg Sentence Length</span><span class="stat-value">' + r.sentenceVariety.avgLength + ' words</span></div><div class="stat-row"><span class="stat-label">Starter Variety</span><span class="stat-value">' + r.sentenceVariety.starterVariety + '%</span></div></div></div>';

    container.innerHTML += '<div class="analysis-section"><h3>Style &amp; Voice (' + r.scores.style + '/100)</h3><div style="margin-top:.75rem"><div class="stat-row"><span class="stat-label">Point of View</span><span class="stat-value">' + r.style.pov + '</span></div><div class="stat-row"><span class="stat-label">Lexical Diversity</span><span class="stat-value">' + r.style.lexicalDiversity + '%</span></div><div class="stat-row"><span class="stat-label">Unique Words</span><span class="stat-value">' + r.style.uniqueWords.toLocaleString() + '</span></div><div class="stat-row"><span class="stat-label">Avg Word Length</span><span class="stat-value">' + r.style.avgWordLength + ' chars</span></div></div></div>';

    container.innerHTML += '<div class="analysis-section"><h3>Dialogue (' + r.scores.dialogue + '/100)</h3>' + (r.dialogue.count === 0 ? '<p>No dialogue detected.</p>' : '<div style="margin-top:.75rem"><div class="stat-row"><span class="stat-label">Lines</span><span class="stat-value">' + r.dialogue.count + '</span></div><div class="stat-row"><span class="stat-label">Ratio</span><span class="stat-value">' + r.dialogue.ratio + '%</span></div><div class="stat-row"><span class="stat-label">"Said" Usage</span><span class="stat-value">' + r.dialogue.saidRatio + '%</span></div></div>') + '</div>';

    // Pacing Heatmap
    const heatmapEl = $('pacing-heatmap');
    if (heatmapEl && r.pacing) {
      const colors = { action:'#e17055', dialogue:'#74b9ff', description:'#00cec9', exposition:'#fdcb6e', reflection:'#a29bfe' };
      let heatHtml = '<div class="heatmap-container">';
      r.pacing.segments.forEach((seg, i) => {
        heatHtml += '<div class="heatmap-block" style="background:' + colors[seg.type] + '" title="Segment ' + (i+1) + ': ' + seg.type + ' (' + seg.wordCount + ' words)"></div>';
      });
      heatHtml += '</div>';
      heatmapEl.innerHTML = heatHtml;
    }

    // Character Tracker
    const charEl = $('character-tracker');
    if (charEl && r.characters && r.characters.list.length > 0) {
      const maxMentions = Math.max(...r.characters.list.map(c => c.mentions));
      let charHtml = '<div class="character-grid">';
      r.characters.list.forEach(c => {
        const pct = Math.round(c.mentions / maxMentions * 100);
        charHtml += '<div class="character-card"><div class="char-name">' + escapeHtml(c.name) + '</div><div class="char-mentions">' + c.mentions + ' mentions' + (c.dialogueCount > 0 ? ' &middot; ' + c.dialogueCount + ' dialogue lines' : '') + '</div><div class="char-bar"><div class="char-bar-fill" style="width:' + pct + '%"></div></div></div>';
      });
      charHtml += '</div>';
      charEl.innerHTML = charHtml;
    } else if (charEl) {
      charEl.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">No recurring characters detected.</p>';
    }

    // Grammar Results
    const grammarEl = $('grammar-results');
    if (grammarEl) {
      if (r.grammarResult && !r.grammarResult.error) {
        const corrections = r.grammarResult.corrections || r.grammarResult.matches || [];
        if (corrections.length > 0) {
          let gHtml = '<p>' + corrections.length + ' grammar/spelling issues found.</p>';
          corrections.slice(0, 20).forEach(c => {
            gHtml += '<div class="grammar-issue"><span class="grammar-original">' + escapeHtml(c.original || c.context?.text || '') + '</span> &rarr; <span class="grammar-corrected">' + escapeHtml(c.suggestion || c.replacements?.[0]?.value || '') + '</span><br><small style="color:var(--text-muted)">' + escapeHtml(c.message || c.rule?.description || '') + '</small></div>';
          });
          grammarEl.innerHTML = gHtml;
        } else {
          grammarEl.innerHTML = '<p style="color:var(--success)">No grammar or spelling issues found!</p>';
        }
      } else {
        grammarEl.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem">Enter your RapidAPI key above to enable grammar &amp; spelling checking.</p>';
      }
    }
  }

  // ========================
  // ANNOTATED TEXT
  // ========================
  function renderAnnotatedText(text, issues) {
    const container = $('annotated-text');
    const sorted = [...issues].sort((a, b) => a.index - b.index);
    const nonOverlapping = [];
    let lastEnd = -1;
    for (const issue of sorted) {
      if (issue.index >= lastEnd) { nonOverlapping.push(issue); lastEnd = issue.index + issue.length; }
    }
    let html = '';
    let pos = 0;
    for (const issue of nonOverlapping) {
      if (issue.index > pos) html += escapeHtml(text.substring(pos, issue.index));
      html += '<span class="highlight" data-type="' + issue.type + '" data-msg="' + escapeAttr(issue.message) + '" data-suggestion="' + escapeAttr(issue.suggestion) + '">' + escapeHtml(text.substring(issue.index, issue.index + issue.length)) + '</span>';
      pos = issue.index + issue.length;
    }
    if (pos < text.length) html += escapeHtml(text.substring(pos));
    container.innerHTML = html;

    let tooltip = document.querySelector('.tooltip');
    if (!tooltip) { tooltip = document.createElement('div'); tooltip.className = 'tooltip'; document.body.appendChild(tooltip); }
    container.addEventListener('mouseover', e => {
      const hl = e.target.closest('.highlight');
      if (hl && !hl.classList.contains('hidden-type')) {
        const typeLabels = { passive:'Passive Voice', adverb:'Adverb', cliche:'Cliche', repetition:'Repetition', 'weak-verb':'Weak Verb', wordy:'Wordy Phrase', 'sentence-length':'Long Sentence', 'show-tell':'Show vs Tell' };
        tooltip.innerHTML = '<div class="tip-type" style="color:var(--' + hl.dataset.type + ')">' + (typeLabels[hl.dataset.type] || hl.dataset.type) + '</div><div class="tip-suggestion">' + hl.dataset.suggestion + '</div>';
        tooltip.classList.add('visible');
        const rect = hl.getBoundingClientRect();
        tooltip.style.top = (rect.bottom + 8) + 'px';
        tooltip.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
      }
    });
    container.addEventListener('mouseout', e => { if (e.target.closest('.highlight')) tooltip.classList.remove('visible'); });
  }

  // ========================
  // ISSUES LIST (REDESIGNED)
  // ========================
  function renderIssuesList(issues) {
    $('issue-count').textContent = issues.length + ' issues found';
    const typeColors = {
      passive:'#fd79a8', adverb:'#fdcb6e', cliche:'#e17055',
      repetition:'#74b9ff', 'weak-verb':'#a29bfe', wordy:'#55efc4',
      'sentence-length':'#fab1a0', 'show-tell':'#fd79a8'
    };
    const typeLabels = {
      passive:'Passive Voice', adverb:'Adverbs', cliche:'Cliches',
      'weak-verb':'Weak Verbs', wordy:'Wordy Phrases', repetition:'Repetitions',
      'sentence-length':'Long Sentences', 'show-tell':'Show vs Tell'
    };

    // Summary pills
    const summaryBar = $('issues-summary-bar');
    if (summaryBar) {
      let pillsHtml = '';
      const grouped = {};
      issues.forEach(i => { grouped[i.type] = (grouped[i.type] || 0) + 1; });
      Object.entries(grouped).sort((a,b) => b[1] - a[1]).forEach(([type, count]) => {
        pillsHtml += '<div class="issue-pill"><span class="pill-dot" style="background:' + (typeColors[type]||'#888') + '"></span>' + (typeLabels[type]||type) + ': ' + count + '</div>';
      });
      summaryBar.innerHTML = pillsHtml;
    }

    // Donut chart
    const donutData = Object.entries(typeColors).map(([type, color]) => ({
      label: typeLabels[type] || type,
      value: issues.filter(i => i.type === type).length,
      color
    })).filter(d => d.value > 0);
    drawDonutChart('issues-donut', donutData);

    // Grouped accordion render
    function renderGrouped() {
      const container = $('issues-list');
      const grouped = {};
      issues.forEach(i => { if (!grouped[i.type]) grouped[i.type] = []; grouped[i.type].push(i); });
      let html = '';
      Object.entries(grouped).sort((a,b) => b[1].length - a[1].length).forEach(([type, items]) => {
        html += '<div class="issue-group"><div class="issue-group-header" onclick="this.classList.toggle(\'collapsed\');this.nextElementSibling.classList.toggle(\'collapsed\')" style="border-left:3px solid ' + (typeColors[type]||'#888') + '"><span>' + (typeLabels[type]||type) + '</span><span><span class="group-count">' + items.length + '</span> <span class="group-arrow">&#9660;</span></span></div><div class="issue-group-body">';
        items.forEach(issue => {
          const paraNum = getParagraphNumber(extractedText, issue.index);
          html += '<div class="issue-item severity-' + issue.severity + '"><div class="issue-meta"><span class="issue-type-badge" style="background:' + (typeColors[issue.type]||'#888') + '20;color:' + (typeColors[issue.type]||'#888') + '">' + issue.severity + '</span></div><div class="issue-text">' + escapeHtml(issue.message) + '</div><div class="issue-suggestion">' + escapeHtml(issue.suggestion) + '</div><div class="issue-location">Paragraph ' + paraNum + '</div></div>';
        });
        html += '</div></div>';
      });
      container.innerHTML = html;
    }

    function renderFlat(sortedIssues) {
      const container = $('issues-list');
      container.innerHTML = sortedIssues.map(issue => {
        const paraNum = getParagraphNumber(extractedText, issue.index);
        return '<div class="issue-item severity-' + issue.severity + '"><div class="issue-meta"><span class="issue-type-badge" style="background:' + (typeColors[issue.type]||'#888') + '20;color:' + (typeColors[issue.type]||'#888') + '">' + issue.type + '</span><span>' + issue.severity + '</span></div><div class="issue-text">' + escapeHtml(issue.message) + '</div><div class="issue-suggestion">' + escapeHtml(issue.suggestion) + '</div><div class="issue-location">Paragraph ' + paraNum + '</div></div>';
      }).join('');
    }

    // Default: grouped
    renderGrouped();

    $('issue-sort').addEventListener('change', e => {
      const sorted = [...issues];
      switch (e.target.value) {
        case 'group': renderGrouped(); return;
        case 'severity':
          sorted.sort((a, b) => ({ high:0, medium:1, low:2 })[a.severity] - ({ high:0, medium:1, low:2 })[b.severity]);
          break;
        case 'type': sorted.sort((a, b) => a.type.localeCompare(b.type)); break;
        case 'position': sorted.sort((a, b) => a.index - b.index); break;
      }
      renderFlat(sorted);
    });
  }

  // ========================
  // READER'S VIEW
  // ========================
  function renderReaderView(r) {
    const container = $('tab-reader');
    if (!container || !r.readerPerspective) return;
    const rp = r.readerPerspective;

    const meterColor = (score, invert) => {
      const s = invert ? 100 - score : score;
      return s >= 70 ? 'var(--success)' : s >= 40 ? 'var(--warning)' : 'var(--danger)';
    };

    let html = '<div class="reader-grid">';
    // Engagement
    html += '<div class="reader-card"><h4>Engagement Score</h4><div class="big-score" style="color:' + meterColor(rp.engagementScore) + '">' + rp.engagementScore + '</div><div class="meter-bar"><div class="meter-fill" style="width:' + rp.engagementScore + '%;background:' + meterColor(rp.engagementScore) + '"></div></div><div class="score-label">How hooked will readers be?</div></div>';
    // Hook Strength
    html += '<div class="reader-card"><h4>Hook Strength</h4><div class="big-score" style="color:' + meterColor(rp.hookStrength) + '">' + rp.hookStrength + '</div><div class="meter-bar"><div class="meter-fill" style="width:' + rp.hookStrength + '%;background:' + meterColor(rp.hookStrength) + '"></div></div><div class="score-label">Does the opening grab attention?</div></div>';
    // DNF Risk
    html += '<div class="reader-card dnf-meter"><h4>DNF Risk</h4><div class="big-score" style="color:' + meterColor(rp.dnfRisk, true) + '">' + rp.dnfRisk + '%</div><div class="meter-bar"><div class="meter-fill" style="width:' + rp.dnfRisk + '%;background:' + meterColor(rp.dnfRisk, true) + '"></div></div><div class="dnf-label"><span>Safe</span><span>At Risk</span></div></div>';
    // Clarity
    html += '<div class="reader-card"><h4>Clarity</h4><div class="big-score" style="color:' + meterColor(rp.clarityScore) + '">' + rp.clarityScore + '</div><div class="meter-bar"><div class="meter-fill" style="width:' + rp.clarityScore + '%;background:' + meterColor(rp.clarityScore) + '"></div></div><div class="score-label">Can readers follow the story?</div></div>';
    // Pacing
    html += '<div class="reader-card"><h4>Pacing Feel</h4><p style="font-size:.9rem;margin-top:.5rem">' + escapeHtml(rp.pacingFeel) + '</p></div>';
    // Verdict
    html += '<div class="reader-card"><h4>Overall Verdict</h4><p style="font-size:.9rem;margin-top:.5rem">' + escapeHtml(rp.overallVerdict) + '</p></div>';
    html += '</div>';

    // Emotional Journey
    html += '<div class="analysis-section" style="margin-top:1rem"><h3>Emotional Journey</h3><div id="emotional-journey">';
    const emotionColors = { exciting:'#e17055', tense:'#fdcb6e', sad:'#74b9ff', calm:'#00cec9', hopeful:'#a29bfe' };
    rp.emotionalJourney.forEach(e => {
      html += '<div class="emotion-bar-row"><span class="emotion-label">' + e.emotion + '</span><div class="emotion-track"><div class="emotion-fill" style="width:' + e.intensity + '%;background:' + (emotionColors[e.emotion]||'#888') + '"></div></div><span style="font-size:.75rem;color:var(--text-muted);width:30px">' + e.intensity + '%</span></div>';
    });
    html += '</div></div>';

    // Immersion Breakers
    if (rp.immersionBreakers.length > 0) {
      html += '<div class="analysis-section" style="margin-top:1rem"><h3>Immersion Breakers (' + rp.immersionBreakers.length + ')</h3><div id="immersion-breakers">';
      rp.immersionBreakers.forEach(b => {
        html += '<div class="immersion-breaker-item"><div>' + escapeHtml(b.reason) + '</div><div class="breaker-location">' + escapeHtml(b.location) + ': "' + escapeHtml(b.text) + '"</div></div>';
      });
      html += '</div></div>';
    }

    container.innerHTML = html;
  }

  // ========================
  // TABS
  // ========================
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById('tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  // ========================
  // ANNOTATION FILTERS
  // ========================
  document.querySelectorAll('.filter-check').forEach(check => {
    check.addEventListener('change', () => {
      const type = check.value;
      document.querySelectorAll('.highlight[data-type="' + type + '"]').forEach(el => {
        el.classList.toggle('hidden-type', !check.checked);
      });
    });
  });

  // ========================
  // EXPORT REPORT
  // ========================
  $('export-btn')?.addEventListener('click', () => {
    if (!analysisResult) return;
    const r = analysisResult;
    const lines = [
      '====================================',
      'MANUSCRIPTLENS ANALYSIS REPORT',
      "Author's Best Buddy",
      '====================================','',
      'File: ' + uploadedFile.name, 'Genre: ' + r.genre.label,
      'Word Count: ' + r.totalWords.toLocaleString(),
      'Overall Grade: ' + Analyzer.getGrade(r.overall) + ' (' + r.overall + '/100)','',
      '--- SCORES ---',
      'Plot Structure:    ' + r.scores.plot + '/100', 'Transitions:       ' + r.scores.transitions + '/100',
      'Copy Editing:      ' + r.scores.copy + '/100', 'Line Editing:      ' + r.scores.line + '/100',
      'Style & Voice:     ' + r.scores.style + '/100', 'Dialogue:          ' + r.scores.dialogue + '/100',
      'Show vs Tell:      ' + r.scores.showTell + '/100','',
      '--- READER PERSPECTIVE ---',
      'Engagement:        ' + r.readerPerspective.engagementScore + '/100',
      'Hook Strength:     ' + r.readerPerspective.hookStrength + '/100',
      'DNF Risk:          ' + r.readerPerspective.dnfRisk + '%',
      'Clarity:           ' + r.readerPerspective.clarityScore + '/100',
      'Pacing:            ' + r.readerPerspective.pacingFeel,
      'Verdict:           ' + r.readerPerspective.overallVerdict,'',
      '--- CHARACTERS ---'
    ];
    if (r.characters.list.length > 0) {
      r.characters.list.forEach(c => lines.push('  ' + c.name + ': ' + c.mentions + ' mentions'));
    } else { lines.push('  No recurring characters detected.'); }
    lines.push('', '--- ISSUES (' + r.issues.length + ') ---');
    r.issues.slice(0, 30).forEach((issue, i) => {
      const para = getParagraphNumber(extractedText, issue.index);
      lines.push((i+1) + '. [' + issue.type.toUpperCase() + ' | Para ' + para + '] ' + issue.message);
      lines.push('   -> ' + issue.suggestion);
    });
    if (r.issues.length > 30) lines.push('   ... and ' + (r.issues.length - 30) + ' more');
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = uploadedFile.name.replace(/\.\w+$/, '') + '-analysis.txt';
    a.click(); URL.revokeObjectURL(url);
  });

  // ========================
  // NEW ANALYSIS
  // ========================
  $('new-analysis-btn')?.addEventListener('click', () => {
    resultsSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    uploadedFile = null; extractedText = ''; analysisResult = null;
    fileInfo.classList.add('hidden'); analyzeBtn.classList.add('hidden'); fileInput.value = '';
  });

})();
