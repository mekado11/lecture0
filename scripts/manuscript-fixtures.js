'use strict';
// Entirely synthetic text. No user manuscript or private excerpts.
function nonfiction(chapters=30,paragraphs=45){
  const prose=[
    'Consider how a small decision changes the next hour. I learned this while helping my family plan a difficult move. We wrote each obligation on paper and chose one realistic step. The example illustrates a method, not a promise of identical results.',
    'Research suggests that context can shape a repeated behavior. This attributed claim requires a real citation before publication. For example, a quieter desk may help one reader concentrate, while another needs a conversation. Compare the alternatives rather than assuming a universal answer.',
    'First, identify what is within your control. Next, describe the evidence that would change your mind. However, an observation is not a moral verdict. A practical plan leaves room for constraints, uncertainty, help from others, and an honest revision when circumstances change.'
  ];
  const result=['Preface','A synthetic book for testing structure and reader application, not factual advice.'];
  for(let i=1;i<=chapters;i++){
    result.push(`Chapter ${i}: Practice ${i}`,`UNIQUE_ANCHOR_${i} begins this chapter.`);
    for(let j=0;j<paragraphs;j++)result.push(prose[(i+j)%prose.length]);
    result.push(`I call this the practice-${i} method.`,
      'Reflection questions:',`What can you learn from practice ${i}?`,
      'Action: Write down a small experiment for the coming week.',
      'Recommendations','Review the outcome with a trusted person.',
      `ENDING_ANCHOR_${i} closes this chapter.`);
  }
  return result.join('\n\n');
}
module.exports={nonfiction};
