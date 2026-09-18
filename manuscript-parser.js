// AuthorScrolls — Manuscript Parser v1
// Converts a manuscript string into stable structural units without changing source text.

const ManuscriptParser = (() => {
  const CHAPTER_PATTERNS = [
    /^\s*(chapter|chap\.?|ch\.?)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?:\s*[:.\-–—]\s*.*)?\s*$/i,
    /^\s*(prologue|epilogue|introduction|preface|afterword)\s*$/i,
    /^\s*(part|book)\s+(\d+|[ivxlcdm]+)(?:\s*[:.\-–—]\s*.*)?\s*$/i
  ];

  function countWords(text) {
    return (String(text || '').match(/\b[\p{L}\p{N}'’\-]+\b/gu) || []).length;
  }

  function normalizeNewlines(text) {
    return String(text || '').replace(/\r\n?/g, '\n');
  }

  function isHeading(line) {
    const value = String(line || '').trim();
    if (!value || value.length > 120) return false;
    return CHAPTER_PATTERNS.some(pattern => pattern.test(value));
  }

  function buildChapter(text, heading, start, end, index) {
    const raw = text.slice(start, end);
    const bodyStart = heading ? raw.indexOf('\n') + 1 : 0;
    const body = bodyStart > 0 ? raw.slice(bodyStart) : raw;
    return {
      id: 'chapter-' + String(index + 1).padStart(3, '0'),
      index,
      number: index + 1,
      title: heading || (index === 0 ? 'Opening' : 'Chapter ' + (index + 1)),
      heading: heading || null,
      start,
      end,
      wordCount: countWords(body),
      text: raw,
      body
    };
  }

  function parse(text) {
    const source = normalizeNewlines(text);
    if (!source.trim()) {
      return { version: 1, textLength: 0, wordCount: 0, chapterCount: 0, chapters: [], warnings: ['EMPTY_MANUSCRIPT'] };
    }

    const headings = [];
    let offset = 0;
    for (const line of source.split('\n')) {
      if (isHeading(line)) headings.push({ title: line.trim(), start: offset });
      offset += line.length + 1;
    }

    const chapters = [];
    if (!headings.length) {
      chapters.push(buildChapter(source, null, 0, source.length, 0));
    } else {
      const prefix = source.slice(0, headings[0].start);
      if (prefix.trim()) chapters.push(buildChapter(source, 'Front Matter', 0, headings[0].start, chapters.length));

      headings.forEach((heading, i) => {
        const end = i + 1 < headings.length ? headings[i + 1].start : source.length;
        chapters.push(buildChapter(source, heading.title, heading.start, end, chapters.length));
      });
    }

    return {
      version: 1,
      textLength: source.length,
      wordCount: countWords(source),
      chapterCount: chapters.length,
      chapters,
      warnings: headings.length ? [] : ['NO_CHAPTER_HEADINGS_DETECTED']
    };
  }

  return { parse, isHeading, countWords };
})();

if (typeof window !== 'undefined') window.ManuscriptParser = ManuscriptParser;
if (typeof module !== 'undefined' && module.exports) module.exports = ManuscriptParser;
