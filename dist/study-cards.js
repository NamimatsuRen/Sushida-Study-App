import { COURSES } from './core.js';
const learningRows = [
  ['apple', 'りんご', 'eat an apple', 'りんごを食べる', 'i eat an apple every morning', '私は毎朝りんごを食べます。', 'apple の前は an。単語だけでなく eat an apple というまとまりでも覚えましょう。'],
  ['break', '休憩', 'take a break', '休憩する', 'let us take a break', '少し休憩しましょう（Let usで始める）。', '「休憩する」は take a break。do a break とはしません。'],
  ['decision', '決定・決断', 'make a decision', '決断する', 'i need to make a decision', '私は決断する必要があります。', '動詞は decide、名詞は decision。make a decision の組み合わせです。'],
  ['question', '質問', 'ask a question', '質問する', 'can i ask a question', '質問してもいいですか。', 'ask a question で質問する。Can I ...? は許可を求める形です。'],
  ['attention', '注意・注目', 'pay attention', '注意を払う', 'please pay attention to the road', '道路に注意を払ってください。', 'pay attention to ... で「…に注意する」。to の後ろが注意する対象です。'],
  ['progress', '進歩・上達', 'make progress', '進歩する', 'we are making progress every day', '私たちは毎日進歩しています。', 'progress は通常不可算名詞。make a progress とはしません。'],
  ['time', '時間', 'save time', '時間を節約する', 'this will save you time', 'これはあなたの時間を節約するでしょう。', 'save someone time は「人の時間を節約する」。'],
  ['habit', '習慣', 'build a habit', '習慣をつくる（buildで始める）', 'i want to build a good habit', '私はよい習慣をつくりたい。', 'build a habit は習慣をつくること。毎日の行動と結びつけると意味を思い出しやすくなります。'],
  ['advice', '助言・アドバイス', 'give advice', '助言する', 'could you give me some advice', '助言を少しもらえますか（Could youで始める）。', 'advice は通常不可算名詞。some advice と言い、an advice とはしません。'],
  ['plan', '計画', 'make a plan', '計画を立てる', 'let us make a plan for tomorrow', '明日の計画を立てましょう（Let usで始める）。', 'make a plan for ... で「…の計画を立てる」。'],
  ['photo', '写真', 'take a photo', '写真を撮る（photoを使う）', 'could you take a photo of us', '私たちの写真を撮ってもらえますか（Could you、photoを使う）。', '写真を撮る動詞は take。take a photo of ... で「…の写真を撮る」。'],
  ['mistake', '間違い・ミス', 'make a mistake', '間違える', 'everyone can make a mistake', '誰でも間違えることがあります。', 'make a mistake で「間違える」。everyone は単数扱いです。'],
];
export const STUDY_DECKS = [
  { id: 'vocabulary', title: 'お手軽コース', label: '単語を覚える', description: '日本語から、ひとつの英単語へ。', sushi: 'shrimp', seconds: COURSES.easy.seconds, price: COURSES.easy.price, plateSeconds: 5,
    cards: learningRows.map(([word, meaning, phrase, phraseMeaning, sentence, translation, explanation]) => ({ id: `learn-word:${word}`, direction: 'ja-en-word', prompt: `「${meaning}」を英語で。`, answers: word === 'photo' ? ['photo', 'picture'] : word === 'mistake' ? ['mistake', 'error'] : word === 'break' ? ['break', 'rest'] : [word], example: `${phrase} — ${phraseMeaning}`, explanation })) },
  { id: 'expressions', title: 'お勧めコース', label: '熟語・短い組み合わせ', description: 'take a break のような、短いまとまりへ。', sushi: 'tuna', seconds: COURSES.normal.seconds, price: COURSES.normal.price, plateSeconds: 6,
    cards: learningRows.map(([word, meaning, phrase, phraseMeaning, sentence, translation, explanation]) => ({ id: `learn-phrase:${word}`, direction: 'ja-en-collocation', prompt: `「${phraseMeaning}」を英語のまとまりで。`, answers: [phrase], example: sentence + '.', explanation })) },
  { id: 'sentences', title: '高級コース', label: '例文・文章で使う', description: '覚えたまとまりを、文の形で取り出す。', sushi: 'salmon', seconds: COURSES.hard.seconds, price: COURSES.hard.price, plateSeconds: 7,
    cards: learningRows.map(([word, meaning, phrase, phraseMeaning, sentence, translation, explanation]) => ({ id: `learn-sentence:${word}`, direction: 'ja-en-sentence', prompt: translation, answers: [sentence], example: sentence + '.', explanation })) },
];
