// AuthorScrolls story intelligence helpers.
// Conservative extraction: every inferred fact keeps manuscript evidence.
const StoryIntelligence = (() => {
  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  }

  function mergeAliases(characters) {
    const out = characters.map(c => ({ ...c, aliases: c.aliases || [] }));
    const consumed = new Set();
    for (const short of out.filter(c => !c.canonicalName.includes(' '))) {
      const targets = out.filter(c => c.canonicalName.includes(' ') && c.canonicalName.split(/\s+/).includes(short.canonicalName));
      if (targets.length !== 1) continue;
      const target = targets[0];
      target.aliases.push(short.canonicalName);
      target.mentions += short.mentions;
      target.chapterIds = [...new Set(target.chapterIds.concat(short.chapterIds))];
      consumed.add(short.canonicalName.toLowerCase());
    }
    return out.filter(c => !consumed.has(c.canonicalName.toLowerCase()));
  }

  function buildRelationships(chapters, characters) {
    const map = new Map();
    for (const chapter of chapters) {
      const present = characters.filter(c => c.chapterIds.includes(chapter.id));
      for (let i = 0; i < present.length; i++) {
        for (let j = i + 1; j < present.length; j++) {
          const names = [present[i].canonicalName, present[j].canonicalName].sort();
          const key = names.join('|').toLowerCase();
          const cur = map.get(key) || { characters: names, chapterIds: [], coOccurrences: 0, evidence: [] };
          cur.coOccurrences += 1;
          if (!cur.chapterIds.includes(chapter.id)) cur.chapterIds.push(chapter.id);
          const source = chapter.text || chapter.body || '';
          const pos = source.toLowerCase().indexOf(names[0].toLowerCase());
          if (pos >= 0 && cur.evidence.length < 3) {
            cur.evidence.push({ chapterId: chapter.id, text: source.slice(Math.max(0, pos - 100), Math.min(source.length, pos + 260)).trim() });
          }
          map.set(key, cur);
        }
      }
    }
    return [...map.values()].sort((a, b) => b.coOccurrences - a.coOccurrences);
  }

  function extractFacts(chapters, characters) {
    const facts = [];
    for (const chapter of chapters) {
      const text = chapter.text || chapter.body || '';
      for (const character of characters.filter(c => c.chapterIds.includes(chapter.id))) {
        for (const name of [character.canonicalName, ...(character.aliases || [])]) {
          const re = new RegExp('\\b' + escapeRegExp(name) + '\\b\\s+(is|was|has|had|lives|lived|works|worked|wants|wanted|needs|needed|knows|knew|loves|loved|hates|hated)\\s+([^.!?]{1,140})[.!?]', 'gi');
          let match;
          while ((match = re.exec(text)) && facts.length < 500) {
            facts.push({ subject: character.canonicalName, predicate: match[1].toLowerCase(), object: match[2].trim(), chapterId: chapter.id, evidence: match[0].trim(), confidence: 0.7, source: 'deterministic' });
          }
        }
      }
    }
    return facts;
  }

  function enrich(parsed, base) {
    const characters = mergeAliases(base.characters || []);
    return { ...base, characters, relationships: buildRelationships(parsed.chapters || [], characters), facts: extractFacts(parsed.chapters || [], characters) };
  }

  return { mergeAliases, buildRelationships, extractFacts, enrich };
})();

if (typeof window !== 'undefined') window.StoryIntelligence = StoryIntelligence;
if (typeof module !== 'undefined' && module.exports) module.exports = StoryIntelligence;
