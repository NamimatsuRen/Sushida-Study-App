export const COURSES = {
  easy: { name: 'お手軽', price: 3000, seconds: 60, range: '2–7', en: 'EASY', subtitle: '身近な英単語', sushi: 'shrimp' },
  normal: { name: 'お勧め', price: 5000, seconds: 90, range: '8–18', en: 'STANDARD', subtitle: 'よく使うフレーズ', sushi: 'tuna' },
  hard: { name: '高級', price: 10000, seconds: 120, range: '17–40', en: 'PREMIUM', subtitle: '少し長めの英文', sushi: 'salmon' },
};
export const MODES = {
  practice: { name: '練習', description: 'お皿がゆっくり流れます。まずは指ならしに。' },
  normal: { name: '普通', description: 'お皿が流れきる前にタイプ。たくさん食べて、元を取ろう！' },
  accuracy: { name: '正確重視', description: 'ミスタイプで、そのお題の入力が最初からになります。' },
  speed: { name: '速度必須', description: 'お皿を1枚でも逃すと終了。速さに挑戦！' },
  sudden: { name: '一発勝負', description: 'ミスタイプ、またはお皿を逃したら即終了。' },
};
export const PRICES = [100, 180, 240, 300, 400, 500];
export const TYPES = ['egg', 'cucumber', 'shrimp', 'tuna', 'salmon', 'eel'];
export const BONUS_EVERY = 30;
export const BONUS_SECONDS = 2;
export const yen = value => Math.abs(value).toLocaleString('ja-JP');

export function plateValue(text, course) {
  const lower = course === 'easy' ? 2 : course === 'normal' ? 8 : 17;
  const upper = course === 'easy' ? 7 : course === 'normal' ? 18 : 40;
  const tier = Math.max(0, Math.min(5, Math.floor((text.length - lower) / (upper - lower + 1) * 6)));
  return PRICES[tier];
}

export class TypingGame {
  constructor(course, mode, phrases, random = Math.random) {
    if (!COURSES[course] || !MODES[mode] || !phrases?.length) throw new Error('Invalid game configuration');
    this.course = course;
    this.mode = mode;
    this.phrases = phrases;
    this.random = random;
    this.status = 'ready';
    this.remaining = COURSES[course].seconds;
    this.elapsed = 0;
    this.plateElapsed = 0;
    this.index = 0;
    this.score = 0;
    this.correct = 0;
    this.misses = 0;
    this.skipped = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.bonus = 0;
    this.counts = Object.fromEntries(PRICES.map(price => [price, 0]));
    this.bag = [];
    this.lastText = '';
    this.nextPlate();
  }

  nextPlate() {
    if (!this.bag.length) {
      this.bag = [...this.phrases];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag.length > 1 && this.bag.at(-1).text === this.lastText) {
        [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag.at(-1), this.bag[0]];
      }
    }
    this.phrase = this.bag.pop();
    this.lastText = this.phrase.text;
    this.value = plateValue(this.phrase.text, this.course);
    this.plateDuration = (5 + this.phrase.text.length * 0.18) * (this.mode === 'practice' ? 1.8 : 1);
    this.index = 0;
    this.plateElapsed = 0;
  }

  start() { if (this.status === 'ready') this.status = 'playing'; }
  pause() { if (this.status === 'playing') this.status = 'paused'; }
  resume() { if (this.status === 'paused') this.status = 'playing'; }
  end(reason = 'time') { this.status = 'ended'; this.reason = reason; }

  advance(seconds) {
    if (this.status !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return;
    let rest = seconds;
    while (rest > 0 && this.status === 'playing') {
      const step = Math.min(rest, this.remaining, this.plateDuration - this.plateElapsed);
      this.remaining = Math.max(0, this.remaining - step);
      this.plateElapsed += step;
      this.elapsed += step;
      rest -= step;
      if (this.remaining < 1e-8) { this.remaining = 0; this.end('time'); }
      else if (this.plateElapsed >= this.plateDuration - 1e-8) {
        this.skipped++;
        this.combo = 0;
        if (this.mode === 'speed' || this.mode === 'sudden') this.end('escaped');
        else this.nextPlate();
      }
    }
  }

  type(key) {
    if (this.status !== 'playing' || key.length !== 1) return { kind: 'ignored' };
    if (key.toLowerCase() !== this.phrase.text[this.index].toLowerCase()) {
      this.misses++;
      this.combo = 0;
      if (this.mode === 'accuracy') this.index = 0;
      if (this.mode === 'sudden') this.end('miss');
      return { kind: 'miss' };
    }
    this.index++;
    this.correct++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const bonus = this.combo % BONUS_EVERY === 0;
    if (bonus) {
      this.remaining += BONUS_SECONDS;
      this.bonus += BONUS_SECONDS;
    }
    if (this.index === this.phrase.text.length) {
      const value = this.value;
      this.score += value;
      this.counts[value]++;
      this.nextPlate();
      return { kind: 'plate', value, bonus };
    }
    return { kind: 'key', bonus };
  }

  result() {
    const typed = this.correct + this.misses;
    return {
      course: this.course, mode: this.mode, score: this.score,
      net: this.score - COURSES[this.course].price,
      correct: this.correct, misses: this.misses, skipped: this.skipped,
      accuracy: typed ? this.correct / typed * 100 : 0,
      speed: this.elapsed ? this.correct / this.elapsed : 0,
      maxCombo: this.maxCombo, bonus: this.bonus, elapsed: this.elapsed,
      plates: Object.values(this.counts).reduce((sum, n) => sum + n, 0),
      counts: { ...this.counts }, reason: this.reason,
    };
  }
}
