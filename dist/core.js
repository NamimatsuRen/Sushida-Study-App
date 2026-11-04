export const normalize = s => s.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');
export const matches = (value, answers) => answers.some(a => normalize(a) === normalize(value));
export function parseMarkdown(source) {
  const errors = [], cards = [];
  const title = source.match(/^#\s+(.+)$/m)?.[1]?.trim() || 'マイデッキ';
  const sections = source.split(/^##\s+/m).slice(1);
  sections.forEach((section, i) => {
    const [question, ...lines] = section.split('\n');
    const answer = lines.find(l => /^答え:\s*/.test(l))?.replace(/^答え:\s*/, '').trim();
    const explanation = lines.find(l => /^解説:\s*/.test(l))?.replace(/^解説:\s*/, '').trim() || '';
    if (!question.trim() || !answer || !answer.split('|').every(a=>a.trim())) errors.push(`${i+1}枚目：問題と答えを入力してください。`);
    else cards.push({question:question.trim(),answers:answer.split('|').map(a=>a.trim()),explanation});
  });
  if (!sections.length) errors.push('「## 問題」と「答え: 回答」を追加してください。');
  if(cards.length>500) errors.push('一度に登録できるのは500枚までです。');
  return {title,cards,errors};
}
export function schedule(previous, correct, now=Date.now()) {
  const interval = correct ? (previous?.interval ? Math.min(90,previous.interval*2) : 1) : 0;
  return {interval,due:now+(correct ? interval*86400000 : 600000),attempts:(previous?.attempts||0)+1,correct:(previous?.correct||0)+Number(correct)};
}
export function pickCards(cards, progress, limit=5, now=Date.now()) {
  return [...cards].sort((a,b)=>(progress[a.id]?.due||0)-(progress[b.id]?.due||0)).slice(0,limit);
}
export function attachIds(cards, deckId) {return cards.map((c,i)=>({...c,id:`${deckId}:${i}`}));}
