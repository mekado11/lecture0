// ManuscriptLens - Application Logic

(function() {
  // ========================
  // STATE
  // ========================
  let uploadedFile = null;
  let extractedText = '';
  let analysisResult = null;

  // ========================
  // DOM REFS
  // ========================
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

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener('change', e => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  clearBtn.addEventListener('click', () => {
    uploadedFile = null;
    extractedText = '';
    fileInfo.classList.add('hidden');
    analyzeBtn.classList.add('hidden');
    fileInput.value = '';
  });

  function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['docx', 'pdf', 'txt'].includes(ext)) {
      alert('Please upload a .docx, .pdf, or .txt file.');
      return;
    }
    uploadedFile = file;
    fileName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    fileInfo.classList.remove('hidden');
    analyzeBtn.classList.remove('hidden');
  }

  // ========================
  // TEXT EXTRACTION
  // ========================
  async function extractText(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'txt') {
      return await file.text();
    }

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
  // ANALYZE BUTTON
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
      // Small delay to let UI update
      await new Promise(r => setTimeout(r, 100));

      analysisResult = Analyzer.analyze(extractedText);

      if (analysisResult.error) {
        alert(analysisResult.error);
        loadingSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
        return;
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
  // RENDER RESULTS
  // ========================
  function renderResults() {
    const r = analysisResult;

    // Overall
    $('overall-grade').textContent = Analyzer.getGrade(r.overall);
    $('manuscript-title').textContent = uploadedFile.name.replace(/\.\w+$/, '');
    $('genre-badge').textContent = r.genre.label;
    $('word-count').textContent = r.totalWords.toLocaleString();

    // Score rings
    const categories = ['plot', 'transitions', 'copy', 'line', 'style', 'dialogue'];
    categories.forEach(cat => {
      const score = r.scores[cat];
      $(`score-${cat}`).textContent = score;
      const ring = $(`ring-${cat}`);
      ring.style.strokeDasharray = `${score} ${100 - score}`;

      // Color based on score
      const color = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';
      ring.style.stroke = color;
    });

    renderDetailedAnalysis(r);
    renderAnnotatedText(extractedText, r.issues);
    renderIssuesList(r.issues);
  }

  // ========================
  // DETAILED ANALYSIS
  // ========================
  function renderDetailedAnalysis(r) {
    const container = $('detailed-analysis');
    container.innerHTML = '';

    // Plot
    const plotArcLabels = {
      'classic': 'Classic narrative arc detected (rising action, climax, resolution)',
      'rising': 'Rising tension detected but resolution could be stronger',
      'resolution-focused': 'Strong resolution but rising action needs development',
      'flat': 'Flat tension curve - consider adding more conflict and stakes',
      'too-short': 'Text too short for full plot analysis'
    };

    container.innerHTML += `
      <div class="analysis-section">
        <h3>Plot Structure (${r.scores.plot}/100)</h3>
        <p>${plotArcLabels[r.plot.arc] || 'Analysis complete.'}</p>
        <div style="margin-top:.75rem">
          <div class="stat-row"><span class="stat-label">Rising Action</span><span class="stat-value">${r.plot.hasRisingAction ? 'Detected' : 'Weak/Missing'}</span></div>
          <div class="stat-row"><span class="stat-label">Climax</span><span class="stat-value">${r.plot.hasClimax ? 'Detected' : 'Weak/Missing'}</span></div>
          <div class="stat-row"><span class="stat-label">Resolution</span><span class="stat-value">${r.plot.hasResolution ? 'Detected' : 'Weak/Missing'}</span></div>
          <div class="stat-row"><span class="stat-label">Paragraphs</span><span class="stat-value">${r.plot.paragraphCount}</span></div>
        </div>
      </div>`;

    // Transitions
    container.innerHTML += `
      <div class="analysis-section">
        <h3>Transitions (${r.scores.transitions}/100)</h3>
        <p>${r.transitions.smoothRate}% of paragraph transitions are smooth.</p>
        <div style="margin-top:.75rem">
          <div class="stat-row"><span class="stat-label">Transition Words Used</span><span class="stat-value">${r.transitions.transitionsUsed}</span></div>
          <div class="stat-row"><span class="stat-label">Smooth Transitions</span><span class="stat-value">${r.transitions.smoothTransitions} / ${r.transitions.totalParagraphs - 1}</span></div>
        </div>
      </div>`;

    // Copy Editing
    container.innerHTML += `
      <div class="analysis-section">
        <h3>Copy Editing (${r.scores.copy}/100)</h3>
        <p>${r.issues.length} issues found across ${r.totalWords.toLocaleString()} words.</p>
        <div style="margin-top:.75rem">
          <div class="stat-row"><span class="stat-label">Passive Voice</span><span class="stat-value">${r.issueCounts.passive}</span></div>
          <div class="stat-row"><span class="stat-label">Adverbs</span><span class="stat-value">${r.issueCounts.adverb}</span></div>
          <div class="stat-row"><span class="stat-label">Clich&eacute;s</span><span class="stat-value">${r.issueCounts.cliche}</span></div>
          <div class="stat-row"><span class="stat-label">Weak Verbs</span><span class="stat-value">${r.issueCounts['weak-verb']}</span></div>
          <div class="stat-row"><span class="stat-label">Wordy Phrases</span><span class="stat-value">${r.issueCounts.wordy}</span></div>
          <div class="stat-row"><span class="stat-label">Word Repetitions</span><span class="stat-value">${r.issueCounts.repetition}</span></div>
          <div class="stat-row"><span class="stat-label">Long Sentences</span><span class="stat-value">${r.issueCounts['sentence-length']}</span></div>
        </div>
      </div>`;

    // Line Editing
    container.innerHTML += `
      <div class="analysis-section">
        <h3>Line Editing (${r.scores.line}/100)</h3>
        <div style="margin-top:.75rem">
          <div class="stat-row"><span class="stat-label">Readability Grade Level</span><span class="stat-value">${r.readability.grade}</span></div>
          <div class="stat-row"><span class="stat-label">Flesch Ease Score</span><span class="stat-value">${r.readability.ease}</span></div>
          <div class="stat-row"><span class="stat-label">Sentence Variety</span><span class="stat-value">${r.sentenceVariety.score}/100</span></div>
          <div class="stat-row"><span class="stat-label">Avg Sentence Length</span><span class="stat-value">${r.sentenceVariety.avgLength} words</span></div>
          <div class="stat-row"><span class="stat-label">Sentence Starter Variety</span><span class="stat-value">${r.sentenceVariety.starterVariety}%</span></div>
          <div class="stat-row"><span class="stat-label">Total Sentences</span><span class="stat-value">${r.sentenceVariety.totalSentences}</span></div>
        </div>
      </div>`;

    // Style
    container.innerHTML += `
      <div class="analysis-section">
        <h3>Style & Voice (${r.scores.style}/100)</h3>
        <div style="margin-top:.75rem">
          <div class="stat-row"><span class="stat-label">Point of View</span><span class="stat-value">${r.style.pov}</span></div>
          <div class="stat-row"><span class="stat-label">Lexical Diversity</span><span class="stat-value">${r.style.lexicalDiversity}%</span></div>
          <div class="stat-row"><span class="stat-label">Unique Words</span><span class="stat-value">${r.style.uniqueWords.toLocaleString()}</span></div>
          <div class="stat-row"><span class="stat-label">Avg Word Length</span><span class="stat-value">${r.style.avgWordLength} chars</span></div>
          <div class="stat-row"><span class="stat-label">Avg Paragraph Length</span><span class="stat-value">${r.style.avgParagraphLength} words</span></div>
        </div>
      </div>`;

    // Dialogue
    container.innerHTML += `
      <div class="analysis-section">
        <h3>Dialogue (${r.scores.dialogue}/100)</h3>
        ${r.dialogue.count === 0 ? '<p>No dialogue detected in this text.</p>' : `
        <div style="margin-top:.75rem">
          <div class="stat-row"><span class="stat-label">Dialogue Lines</span><span class="stat-value">${r.dialogue.count}</span></div>
          <div class="stat-row"><span class="stat-label">Dialogue Ratio</span><span class="stat-value">${r.dialogue.ratio}% of text</span></div>
          <div class="stat-row"><span class="stat-label">"Said" Usage</span><span class="stat-value">${r.dialogue.saidRatio}%</span></div>
          <div class="stat-row"><span class="stat-label">Avg Dialogue Length</span><span class="stat-value">${r.dialogue.avgLength} words</span></div>
          <div class="stat-row"><span class="stat-label">Tag Variety</span><span class="stat-value">${Object.keys(r.dialogue.tags).length} unique tags</span></div>
        </div>`}
      </div>`;
  }

  // ========================
  // ANNOTATED TEXT
  // ========================
  function renderAnnotatedText(text, issues) {
    const container = $('annotated-text');

    // Sort issues by index, handle overlapping by taking the first
    const sorted = [...issues].sort((a, b) => a.index - b.index);
    const nonOverlapping = [];
    let lastEnd = -1;
    for (const issue of sorted) {
      if (issue.index >= lastEnd) {
        nonOverlapping.push(issue);
        lastEnd = issue.index + issue.length;
      }
    }

    let html = '';
    let pos = 0;
    for (const issue of nonOverlapping) {
      if (issue.index > pos) {
        html += escapeHtml(text.substring(pos, issue.index));
      }
      html += `<span class="highlight" data-type="${issue.type}" data-msg="${escapeAttr(issue.message)}" data-suggestion="${escapeAttr(issue.suggestion)}">${escapeHtml(text.substring(issue.index, issue.index + issue.length))}</span>`;
      pos = issue.index + issue.length;
    }
    if (pos < text.length) {
      html += escapeHtml(text.substring(pos));
    }

    container.innerHTML = html;

    // Tooltip
    let tooltip = document.querySelector('.tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'tooltip';
      document.body.appendChild(tooltip);
    }

    container.addEventListener('mouseover', e => {
      const hl = e.target.closest('.highlight');
      if (hl && !hl.classList.contains('hidden-type')) {
        const typeLabels = {
          passive: 'Passive Voice', adverb: 'Adverb', cliche: 'Cliche',
          repetition: 'Repetition', 'weak-verb': 'Weak Verb', wordy: 'Wordy Phrase',
          'sentence-length': 'Long Sentence'
        };
        tooltip.innerHTML = `<div class="tip-type" style="color:var(--${hl.dataset.type})">${typeLabels[hl.dataset.type] || hl.dataset.type}</div><div class="tip-suggestion">${hl.dataset.suggestion}</div>`;
        tooltip.classList.add('visible');
        const rect = hl.getBoundingClientRect();
        tooltip.style.top = (rect.bottom + 8) + 'px';
        tooltip.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
      }
    });

    container.addEventListener('mouseout', e => {
      if (e.target.closest('.highlight')) {
        tooltip.classList.remove('visible');
      }
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ========================
  // ISSUES LIST
  // ========================
  function renderIssuesList(issues) {
    const container = $('issues-list');
    $('issue-count').textContent = `${issues.length} issues found`;

    function render(sortedIssues) {
      container.innerHTML = sortedIssues.map(issue => {
        const typeColors = {
          passive: 'var(--passive)', adverb: 'var(--adverb)', cliche: 'var(--cliche)',
          repetition: 'var(--repetition)', 'weak-verb': 'var(--weak-verb)',
          wordy: 'var(--wordy)', 'sentence-length': 'var(--sentence-length)'
        };
        return `
          <div class="issue-item severity-${issue.severity}">
            <div class="issue-meta">
              <span class="issue-type-badge" style="background:${typeColors[issue.type]}20; color:${typeColors[issue.type]}">${issue.type}</span>
              <span>${issue.severity} severity</span>
            </div>
            <div class="issue-text">${escapeHtml(issue.message)}</div>
            <div class="issue-suggestion">${escapeHtml(issue.suggestion)}</div>
          </div>`;
      }).join('');
    }

    render(issues);

    $('issue-sort').addEventListener('change', e => {
      const sorted = [...issues];
      switch (e.target.value) {
        case 'severity':
          const sevOrder = { high: 0, medium: 1, low: 2 };
          sorted.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
          break;
        case 'type':
          sorted.sort((a, b) => a.type.localeCompare(b.type));
          break;
        case 'position':
          sorted.sort((a, b) => a.index - b.index);
          break;
      }
      render(sorted);
    });
  }

  // ========================
  // TABS
  // ========================
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // ========================
  // ANNOTATION FILTERS
  // ========================
  document.querySelectorAll('.filter-check').forEach(check => {
    check.addEventListener('change', () => {
      const type = check.value;
      document.querySelectorAll(`.highlight[data-type="${type}"]`).forEach(el => {
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
      '====================================',
      '',
      `File: ${uploadedFile.name}`,
      `Genre: ${r.genre.label}`,
      `Word Count: ${r.totalWords.toLocaleString()}`,
      `Overall Grade: ${Analyzer.getGrade(r.overall)} (${r.overall}/100)`,
      '',
      '--- SCORES ---',
      `Plot Structure:    ${r.scores.plot}/100  (${Analyzer.getGrade(r.scores.plot)})`,
      `Transitions:       ${r.scores.transitions}/100  (${Analyzer.getGrade(r.scores.transitions)})`,
      `Copy Editing:      ${r.scores.copy}/100  (${Analyzer.getGrade(r.scores.copy)})`,
      `Line Editing:      ${r.scores.line}/100  (${Analyzer.getGrade(r.scores.line)})`,
      `Style & Voice:     ${r.scores.style}/100  (${Analyzer.getGrade(r.scores.style)})`,
      `Dialogue:          ${r.scores.dialogue}/100  (${Analyzer.getGrade(r.scores.dialogue)})`,
      '',
      '--- PLOT STRUCTURE ---',
      `Arc Type: ${r.plot.arc}`,
      `Rising Action: ${r.plot.hasRisingAction ? 'Yes' : 'No'}`,
      `Climax: ${r.plot.hasClimax ? 'Yes' : 'No'}`,
      `Resolution: ${r.plot.hasResolution ? 'Yes' : 'No'}`,
      '',
      '--- READABILITY ---',
      `Flesch-Kincaid Grade: ${r.readability.grade}`,
      `Flesch Ease: ${r.readability.ease}`,
      `Avg Sentence Length: ${r.sentenceVariety.avgLength} words`,
      `Sentence Variety: ${r.sentenceVariety.score}/100`,
      '',
      '--- STYLE ---',
      `POV: ${r.style.pov}`,
      `Lexical Diversity: ${r.style.lexicalDiversity}%`,
      `Unique Words: ${r.style.uniqueWords}`,
      '',
      '--- ISSUES SUMMARY ---',
      `Total Issues: ${r.issues.length}`,
      `  Passive Voice: ${r.issueCounts.passive}`,
      `  Adverbs: ${r.issueCounts.adverb}`,
      `  Cliches: ${r.issueCounts.cliche}`,
      `  Weak Verbs: ${r.issueCounts['weak-verb']}`,
      `  Wordy Phrases: ${r.issueCounts.wordy}`,
      `  Repetitions: ${r.issueCounts.repetition}`,
      `  Long Sentences: ${r.issueCounts['sentence-length']}`,
      '',
      '--- TOP ISSUES ---',
    ];

    const topIssues = r.issues.filter(i => i.severity !== 'low').slice(0, 20);
    topIssues.forEach((issue, idx) => {
      lines.push(`${idx + 1}. [${issue.type.toUpperCase()}] ${issue.message}`);
      lines.push(`   Suggestion: ${issue.suggestion}`);
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${uploadedFile.name.replace(/\.\w+$/, '')}-analysis.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ========================
  // NEW ANALYSIS
  // ========================
  $('new-analysis-btn')?.addEventListener('click', () => {
    resultsSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    uploadedFile = null;
    extractedText = '';
    analysisResult = null;
    fileInfo.classList.add('hidden');
    analyzeBtn.classList.add('hidden');
    fileInput.value = '';
  });

})();
