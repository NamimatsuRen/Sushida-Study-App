export const STORAGE_KEY = 'typequarium-lab-v1';
export const CAPACITY = 12;
export const JOB_SECONDS = 20;
export const SPECIES = [
  { id: 'puffer', name: 'まめフグ', category: 'ocean', price: 80, color: '#efc35c', affinity: 'accuracy', description: '小さなひれで、今日も一生けんめい。', tag: '正確さとなかよし' },
  { id: 'jelly', name: 'ゆめみるクラゲ', category: 'ocean', price: 100, color: '#bd9cec', affinity: 'recall', description: '覚えたことを、ふわふわ光らせる。', tag: '思い出しとなかよし' },
  { id: 'octopus', name: 'ねむねむタコ', category: 'ocean', price: 120, color: '#e7a4a5', affinity: 'chaos', description: '八本の手で、たぶん何かを考え中。', tag: 'にぎやかさとなかよし' },
  { id: 'ray', name: '夜ふかしエイ', category: 'ocean', price: 160, color: '#78bfc5', affinity: 'speed', description: '速い潮に乗る、夜空みたいなひと。', tag: 'スピードとなかよし' },
  { id: 'seal', name: 'もちもちアザラシ', category: 'ocean', price: 160, color: '#dce9e5', affinity: 'accuracy', description: 'おなかを上にして、お昼寝の研究。', tag: '正確さとなかよし' },
  { id: 'uncle', name: '湯のみのおじさん', category: 'odd', price: 180, color: '#d6a46e', affinity: 'chaos', description: '海の中でも、お茶の時間は守ります。', tag: 'にぎやかさとなかよし' },
  { id: 'aunt', name: 'おせっかいマダム', category: 'odd', price: 180, color: '#e29bb4', affinity: 'accuracy', description: 'あなたも、ごはんちゃんと食べた？', tag: '正確さとなかよし' },
  { id: 'alien', name: 'ひらめき宇宙人', category: 'odd', price: 220, color: '#a5d985', affinity: 'recall', description: '地球のことば、ちょっと覚えた。', tag: '思い出しとなかよし' },
  { id: 'robot', name: 'おさんぽロボ', category: 'odd', price: 240, color: '#a6c4d7', affinity: 'speed', description: '水中でも、軽快な電子音がする。', tag: 'スピードとなかよし' }
];
export const PHRASES = [
  { id: 'break', en: 'take a break', ja: '休憩する' }, { id: 'step', en: 'step by step', ja: '一歩ずつ' },
  { id: 'going', en: 'keep going', ja: 'そのまま続ける' }, { id: 'attention', en: 'pay attention', ja: '注意を払う' },
  { id: 'new', en: 'try something new', ja: '新しいことに挑戦する' }, { id: 'decision', en: 'make a decision', ja: '決断する' },
  { id: 'little', en: 'a little at a time', ja: '少しずつ' }, { id: 'sense', en: 'it makes sense', ja: '筋が通る・なるほどと思う' },
  { id: 'forward', en: 'look forward to', ja: '楽しみにする' }, { id: 'idea', en: 'come up with an idea', ja: 'アイデアを思いつく' },
  { id: 'curiosity', en: 'out of curiosity', ja: '好奇心から' }, { id: 'long', en: 'in the long run', ja: '長い目で見れば' }
];
export const VISITORS = [
  { id: 'person', name: '地球のひと', art: 'uncle', color: '#c5ad80' }, { id: 'madam', name: 'おばさんご一行', art: 'aunt', color: '#e0abc5' },
  { id: 'penguin', name: 'ペンギン観光客', art: 'penguin', color: '#9ccbd0' }, { id: 'fish', name: '見学に来た魚', art: 'puffer', color: '#f1cd72' },
  { id: 'alien', name: '宇宙の観光客', art: 'alien', color: '#b7de8e' }, { id: 'robot', name: '観光ロボ', art: 'robot', color: '#a8c5da' },
  { id: 'cat', name: 'ねこ探検隊', art: 'cat', color: '#e7c8a0' }
];
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const normalize = value => String(value).normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.!?]+$/g, '');
export function rng(seed) { let n = seed >>> 0; return () => { n += 0x6D2B79F5; let t = Math.imul(n ^ n >>> 15, 1 | n); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function newState(seed = Math.floor(Math.random() * 4294967296)) {
  return { version: 1, seed: seed >>> 0, name: 'わたしのへんてこ水族館', coins: 240, nextId: 2, wave: 0, sound: true,
    residents: [{ id: 'r1', species: 'puffer', growth: 0, happiness: 50, seed: seed >>> 0 }],
    stats: { correct: 0, misses: 0, typingMs: 0, jobs: 0, earned: 0, admissions: 0, checks: 0, recalled: 0 },
    seen: {}, credited: [], log: [{ text: '開館準備金240Gと、最初のまめフグをお届け。', kind: 'welcome' }] };
}
export function restoreState(raw) {
  if (!raw || raw.version !== 1) return null;
  const validInt = value => Number.isSafeInteger(value) && value >= 0;
  if (![raw.seed, raw.coins, raw.nextId, raw.wave].every(validInt) || !raw.stats || !Object.values(raw.stats).every(validInt)) return null;
  const next = newState(raw.seed);
  if (!Object.keys(next.stats).every(key => validInt(raw.stats[key])) || raw.stats.recalled > raw.stats.checks) return null;
  next.coins = clamp(raw.coins, 0, 10000000); next.name = String(raw.name || next.name).trim().slice(0, 24) || next.name;
  next.nextId = raw.nextId; next.wave = raw.wave; next.sound = raw.sound !== false; next.stats = { ...next.stats, ...raw.stats };
  if (!Array.isArray(raw.residents) || raw.residents.length > CAPACITY) return null;
  const ids = new Set();
  for (const r of raw.residents) if (!r || !SPECIES.some(s => s.id === r.species) || !/^r\d+$/.test(r.id) || !validInt(Number(r.id.slice(1))) || Number(r.id.slice(1)) > 100000000 || ids.has(r.id) || ![r.growth, r.happiness, r.seed].every(validInt)) return null; else ids.add(r.id);
  next.residents = raw.residents.map(r => ({ ...r, growth: clamp(r.growth, 0, 200), happiness: clamp(r.happiness, 0, 100) }));
  next.nextId = Math.max(next.nextId, 1, ...next.residents.map(r => Number(r.id.slice(1)) + 1));
  for (const phrase of PHRASES) if (raw.seen?.[phrase.id]) {
    const seen = raw.seen[phrase.id]; if (validInt(seen.copies) && typeof seen.recalled === 'boolean') next.seen[phrase.id] = { copies: seen.copies, recalled: seen.recalled };
  }
  next.credited = Array.isArray(raw.credited) ? raw.credited.filter(id => typeof id === 'string').slice(-100) : [];
  next.log = Array.isArray(raw.log) ? raw.log.filter(e => e && typeof e.text === 'string' && typeof e.kind === 'string').slice(0, 20).map(e => ({ text: e.text.slice(0, 200), kind: e.kind })) : [];
  return next;
}
export function profile(state) {
  const { correct, misses, typingMs, checks, recalled } = state.stats;
  const accuracy = correct + misses ? correct / (correct + misses) : null;
  const wpm = typingMs ? correct / 5 / (typingMs / 60000) : 0;
  const memory = checks ? recalled / checks : null;
  const precision = accuracy ?? .5, speed = clamp(wpm / 60, 0, 1), recall = memory ?? .25;
  const chaos = clamp(.25 + (1 - precision) * .7 + new Set(state.residents.map(r => r.species)).size / 20, 0, 1);
  const theme = checks >= 3 && recall >= .66 ? 'cosmic' : correct >= 20 && precision >= .95 ? 'clear' : wpm >= 30 ? 'current' : 'lagoon';
  return { accuracy, wpm, memory, precision, speed, recall, chaos, theme, remembered: Object.values(state.seen).filter(s => s.recalled).length, encountered: Object.keys(state.seen).length };
}
export function level(resident) { return resident.growth >= 140 ? 3 : resident.growth >= 60 ? 2 : 1; }
export function visitorCount(state) {
  if (!state.residents.length) return 0;
  const diversity = new Set(state.residents.map(r => r.species)).size;
  return clamp(Math.floor(2 + state.residents.length * 1.4 + diversity * .8 + state.residents.reduce((s, r) => s + level(r) - 1 + r.happiness / 100, 0)), 0, 24);
}
export function visitorWeights(state) {
  const p = profile(state), count = id => state.residents.filter(r => r.species === id).length;
  return { person: 1 + count('uncle') * 1.5, madam: 1 + count('aunt') * 1.5, penguin: 1 + p.speed * 3, fish: 1 + state.residents.filter(r => SPECIES.find(s => s.id === r.species).category === 'ocean').length * .3,
    alien: .7 + p.recall * 4 + count('alien'), robot: .7 + p.precision * 3 + count('robot'), cat: 1 + p.chaos * 3 };
}
export function visitors(state) {
  const random = rng(state.seed + state.wave * 127), weights = visitorWeights(state), total = Object.values(weights).reduce((a, b) => a + b, 0);
  return Array.from({ length: visitorCount(state) }, (_, index) => { let roll = random() * total; const type = VISITORS.find(v => (roll -= weights[v.id]) < 0) || VISITORS.at(-1); return { ...type, key: `${index}-${type.id}`, offset: random() }; });
}
function logged(state, text, kind) { state.log = [{ text, kind }, ...state.log].slice(0, 20); }
export function buy(state, speciesId) {
  const species = SPECIES.find(s => s.id === speciesId);
  if (!species || state.coins < species.price || state.residents.length >= CAPACITY) return null;
  const next = structuredClone(state); next.coins -= species.price;
  const resident = { id: `r${next.nextId++}`, species: species.id, growth: 0, happiness: 50, seed: (state.seed + next.nextId * 7919) >>> 0 };
  next.residents.push(resident); next.wave++; logged(next, `${species.name}が仲間入り！`, 'arrival'); return { state: next, resident };
}
export function feed(state, id) {
  const current = state.residents.find(r => r.id === id); if (!current || state.coins < 15 || level(current) === 3 && current.happiness === 100) return null;
  const next = structuredClone(state), resident = next.residents.find(r => r.id === id), p = profile(state);
  const affinity = SPECIES.find(s => s.id === resident.species).affinity;
  const factor = { accuracy: p.precision, speed: p.speed, recall: p.recall, chaos: p.chaos }[affinity];
  const gain = Math.min(200 - resident.growth, 24 + Math.round(factor * 16)), before = level(resident);
  next.coins -= 15; resident.growth = Math.min(200, resident.growth + gain); resident.happiness = Math.min(100, resident.happiness + 12); next.wave++;
  const evolved = level(resident) > before;
  logged(next, `${SPECIES.find(s => s.id === resident.species).name}${evolved ? 'が成長した！' : 'にごはんをあげた。'}`, evolved ? 'growth' : 'care');
  return { state: next, gain, evolved, resident };
}
export function applyJob(state, result) {
  if (!result || typeof result.id !== 'string' || state.credited.includes(result.id) || ![result.correct, result.misses, result.ms, result.completed].every(n => Number.isSafeInteger(n) && n >= 0) || result.ms !== JOB_SECONDS * 1000 || result.correct > 2000 || result.misses > 4000 || result.completed > 100) return null;
  if (!Array.isArray(result.phraseIds) || result.phraseIds.length !== result.completed || result.phraseIds.some(id => !PHRASES.some(p => p.id === id)) || result.phraseIds.reduce((sum, id) => sum + PHRASES.find(p => p.id === id).en.length, 0) > result.correct) return null;
  const next = structuredClone(state);
  next.stats.correct += result.correct; next.stats.misses += result.misses; next.stats.typingMs += result.ms; next.stats.jobs++;
  for (const id of result.phraseIds || []) if (PHRASES.some(p => p.id === id)) next.seen[id] = { copies: (next.seen[id]?.copies || 0) + 1, recalled: next.seen[id]?.recalled || false };
  const typing = result.correct * 2 + result.completed * 12, admissions = result.completed ? visitorCount(next) * 3 : 0;
  next.coins = Math.min(10000000, next.coins + typing + admissions); next.stats.earned += typing + admissions; next.stats.admissions += admissions; next.wave++;
  next.credited.push(result.id); next.credited = next.credited.slice(-100);
  logged(next, `おしごと完了。タイピング${typing}G ＋ 入館料${admissions}G。`, 'job');
  return { state: next, typing, admissions, total: typing + admissions };
}
export function applyQuiz(state, id, answers) {
  if (typeof id !== 'string' || state.credited.includes(id) || !Array.isArray(answers) || !answers.length) return null;
  const unique = new Set();
  for (const answer of answers) {
    if (!answer || !state.seen[answer.id] || unique.has(answer.id) || typeof answer.correct !== 'boolean' || typeof answer.hinted !== 'boolean') return null;
    unique.add(answer.id);
  }
  const next = structuredClone(state); let coins = 0, recalled = 0;
  for (const answer of answers) {
    next.stats.checks++;
    if (answer.correct && !answer.hinted) { next.stats.recalled++; recalled++; coins += next.seen[answer.id].recalled ? 3 : 15; next.seen[answer.id].recalled = true; }
  }
  next.coins = Math.min(10000000, next.coins + coins); next.stats.earned += coins; next.wave++;
  next.credited.push(id); next.credited = next.credited.slice(-100);
  logged(next, `思い出しチェック：${recalled}/${answers.length}問。${coins ? coins + 'Gを獲得！' : 'また少しずつ覚えよう。'}`, 'recall');
  return { state: next, coins, recalled };
}

export class TypingJob {
  constructor(seed = 1) { this.duration = JOB_SECONDS * 1000; this.elapsed = 0; this.correct = 0; this.misses = 0; this.completed = 0; this.typed = ''; this.paused = false; this.done = false; this.ids = []; const random = rng(seed); this.queue = [...PHRASES].sort((a, b) => a.id.localeCompare(b.id)); for (let i = this.queue.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]]; } }
  get phrase() { return this.queue[this.completed % this.queue.length]; }
  advance(ms) { if (this.done || this.paused || !Number.isFinite(ms) || ms <= 0) return; this.elapsed = Math.min(this.duration, this.elapsed + ms); if (this.elapsed >= this.duration) this.done = true; }
  type(char) {
    if (this.done || this.paused || char.length !== 1) return null;
    const expected = this.phrase.en[this.typed.length];
    if (char.toLowerCase() !== expected) { this.misses++; return 'miss'; }
    this.correct++; this.typed += char.toLowerCase();
    if (this.typed === this.phrase.en) { this.ids.push(this.phrase.id); this.completed++; this.typed = ''; return 'complete'; }
    return 'key';
  }
  result(id) { return this.done ? { id, correct: this.correct, misses: this.misses, ms: this.duration, completed: this.completed, phraseIds: this.ids } : null; }
}
