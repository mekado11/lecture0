// AuthorScrolls — Manuscript Parser v2
// Converts manuscript text into stable structural units without changing source text.
const ManuscriptParser = (() => {
  const CHAPTER_RE = /^\s*(chapter|chap\.?|ch\.?)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?:\s*[:.\-–—]\s*.*)?\s*$/i;
  const FRONT_RE = /^\s*(prologue|epilogue|introduction|preface|afterword|acknowledg(?:e)?ments|dedication|contents|table of contents|copyright)\s*$/i;
  const REVIEW_RE = /^(?:(?:part|book)\s+(?:\d+|[ivxlcdm]+)\s*[:.\-–—]\s*)?(?:(?:mid[- ]?(?:chapter|book)|chapter)\s+review|review of chapters\b.*|bonus toolkit\b.*|chapter-by-chapter reflection\b.*)$/i;
  const PART_RE = /^\s*(part|book)\s+(\d+|[ivxlcdm]+)(?:\s*[:.\-–—]\s*.*)?\s*$/i;
  const WORD_NUMBERS = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};

  function countWords(text) { return (String(text||'').match(/\b[\p{L}\p{N}'’\-]+\b/gu)||[]).length; }
  function normalizeNewlines(text) { return String(text||'').replace(/\r\n?/g,'\n'); }
  function romanToInt(s){const m={i:1,v:5,x:10,l:50,c:100,d:500,m:1000};let n=0,prev=0;for(const ch of String(s).toLowerCase().split('').reverse()){const v=m[ch]||0;n+=v<prev?-v:v;prev=Math.max(prev,v);}return n||null;}
  function headingNumber(line){const m=String(line||'').match(CHAPTER_RE);if(!m)return null;const raw=m[2].toLowerCase();if(/^\d+$/.test(raw))return Number(raw);if(WORD_NUMBERS[raw])return WORD_NUMBERS[raw];return romanToInt(raw);}
  function headingKind(line){const s=String(line||'').trim();if(FRONT_RE.test(s))return 'front';if(REVIEW_RE.test(s))return 'review';if(PART_RE.test(s))return 'part';if(CHAPTER_RE.test(s))return 'chapter';return null;}
  function isHeading(line){const s=String(line||'').trim();return !!s&&s.length<=120&&!!headingKind(s);}

  function buildUnit(text, heading, start, end, index, kind='chapter') {
    const raw=text.slice(start,end), bodyStart=heading?raw.indexOf('\n')+1:0, body=bodyStart>0?raw.slice(bodyStart):raw;
    return { id:'chapter-'+String(index+1).padStart(3,'0'), index, number:index+1, title:heading||(index===0?'Opening':'Chapter '+(index+1)), heading:heading||null, kind, start, end, wordCount:countWords(body), text:raw, body };
  }

  function scanHeadings(source){
    const headings=[]; let offset=0, maxMainChapter=0, nested=null;
    const lines=source.split('\n');
    for(const line of lines){
      const value=line.trim(), kind=value.length<=120?headingKind(value):null, num=kind==='chapter'?headingNumber(value):null;
      if (REVIEW_RE.test(value) && maxMainChapter>0) nested={max:maxMainChapter,seenMax:false,reason:/toolkit/i.test(value)?'toolkit':'review'};

      if(kind){
        if(kind==='review' && maxMainChapter>0){nested={max:maxMainChapter,seenMax:false,reason:'review'};headings.push({title:value,start:offset,kind:'review'});}
        else if(kind==='chapter' && nested){
          if(nested.seenMax || num==null || num>nested.max){
            nested=null;
            headings.push({title:value,start:offset,kind:'chapter'});
            if(num!=null) maxMainChapter=Math.max(maxMainChapter,num);
          } else {
            if(num===nested.max) nested.seenMax=true;
            // This is a recap/toolkit subsection, not a new top-level manuscript chapter.
          }
        } else {
          headings.push({title:value,start:offset,kind});
          if(kind==='chapter'&&num!=null)maxMainChapter=Math.max(maxMainChapter,num);
        }
      }

      // Collapse duplicate adjacent front-matter labels such as Introduction / epigraph / Introduction.
      if(kind==='front'&&headings.length>=2){
        const prev=headings[headings.length-2],cur=headings[headings.length-1];
        if(prev.kind==='front'&&prev.title.toLowerCase()===cur.title.toLowerCase()&&cur.start-prev.start<500)headings.splice(headings.length-2,1);
      }
      offset+=line.length+1;
    }
    return headings;
  }

  function parse(text) {
    const source=normalizeNewlines(text);
    if(!source.trim())return{version:3,textLength:0,wordCount:0,chapterCount:0,unitCount:0,chapterNumbers:[],chapters:[],warnings:['EMPTY_MANUSCRIPT']};
    const headings=scanHeadings(source), chapters=[];
    if(!headings.length)chapters.push(buildUnit(source,null,0,source.length,0,'opening'));
    else {
      const prefix=source.slice(0,headings[0].start);
      if(prefix.trim())chapters.push(buildUnit(source,'Front Matter',0,headings[0].start,chapters.length,'front'));
      headings.forEach((h,i)=>chapters.push(buildUnit(source,h.title,h.start,i+1<headings.length?headings[i+1].start:source.length,chapters.length,h.kind)));
    }
    const topLevel=chapters.filter(x=>x.kind==='chapter');
    const warnings=[];
    if(!headings.length)warnings.push('NO_CHAPTER_HEADINGS_DETECTED');
    const nums=chapters.filter(x=>x.kind==='chapter').map(x=>headingNumber(x.heading)).filter(Number.isFinite);
    for(let i=1;i<nums.length;i++)if(nums[i]<nums[i-1]&&nums[i]!==1){warnings.push('NON_SEQUENTIAL_CHAPTER_NUMBERING');break;}
    const chapterNumbers=chapters.filter(x=>x.kind==='chapter').map(x=>headingNumber(x.heading));
    return {version:3,textLength:source.length,wordCount:countWords(source),chapterCount:topLevel.length,unitCount:chapters.length,chapterNumbers,chapters,warnings};
  }

  return {parse,isHeading,countWords,headingNumber,headingKind,scanHeadings};
})();
if(typeof window!=='undefined')window.ManuscriptParser=ManuscriptParser;
if(typeof module!=='undefined'&&module.exports)module.exports=ManuscriptParser;
