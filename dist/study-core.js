// Transparent prototype scheduler. This is not Anki's FSRS algorithm.
export const STUDY_DAY = 86400000;
export const STUDY_STEPS = [1, 3, 7, 14, 30, 60];
export const STUDY_RELEARN = 10 * 60000;
export const normalizeStudy = text => String(text).normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.!?。！？]+$/g, '');
export const matchesStudy = (answer, accepted) => accepted.some(value => normalizeStudy(value) === normalizeStudy(answer));
export const studyDayKey = now => new Date(now).toLocaleDateString('sv-SE');

export function studyCardId(prompt, answers) {
  const text = JSON.stringify([prompt.trim(), answers.map(normalizeStudy)]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `custom-${(hash >>> 0).toString(36)}`;
}
export function parseStudyMarkdown(source) {
  const title = source.match(/^#\s+(.+)$/m)?.[1].trim() || '自分のノート';
  const cards = [], errors = [], ids = new Set();
  const blocks = source.replace(/\r\n?/g, '\n').split(/^##\s+/m).slice(1);
  for (const [i, block] of blocks.entries()) {
    const [prompt, ...lines] = block.split('\n');
    const answer = lines.find(line => /^答え:\s*/.test(line))?.replace(/^答え:\s*/, '');
    const explanation = lines.find(line => /^解説:\s*/.test(line))?.replace(/^解説:\s*/, '') || '';
    const answers = answer?.split('|').map(text => text.trim());
    if (!prompt.trim() || !answers?.length || answers.some(text => !text)) { errors.push(`${i + 1}枚目：問題と空でない答えが必要です。`); continue; }
    if (prompt.length > 400 || answers.some(text => text.length > 200) || explanation.length > 1000) { errors.push(`${i + 1}枚目：問題400字・答え200字・解説1,000字以内で登録してください。`); continue; }
    const id = studyCardId(prompt, answers);
    if (ids.has(id)) { errors.push(`${i + 1}枚目：同じ問題と答えが重複しています。`); continue; }
    ids.add(id); cards.push({ id, prompt: prompt.trim(), answers, explanation, example: '', direction: 'custom' });
  }
  if (!blocks.length) errors.push('「## 問題」と「答え: 回答」を記入してください。');
  if (blocks.length > 100) errors.push('1つのノートは100枚以内にしてください。');
  return { title: title.slice(0, 80), cards, errors };
}

export function planStudy(cards, progress, now, extra = false) {
  const seen = cards.filter(card => progress[card.id]);
  const due = seen.filter(card => progress[card.id].due <= now).sort((a, b) => progress[a.id].due - progress[b.id].due);
  const unseen = cards.filter(card => !progress[card.id]);
  const reviews = due.map(card => ({ card, kind: progress[card.id].attempts ? 'review' : 'new', delayed: progress[card.id].lastReviewedAt > 0 && studyDayKey(now) !== studyDayKey(progress[card.id].lastReviewedAt) && now - progress[card.id].lastReviewedAt >= 20 * 3600000 }));
  const fresh = unseen.map(card => ({ card, kind: 'new', delayed: false }));
  const upcoming = seen.filter(card => progress[card.id].due > now).sort((a, b) => progress[a.id].lastReviewedAt - progress[b.id].lastReviewedAt).map(card => ({ card, kind: 'extra', delayed: false }));
  const entries = extra ? seen.map(card => ({ card, kind: 'extra', delayed: false })) : [...reviews, ...fresh, ...upcoming];
  return { entries, dueCount: due.length, unseenCount: unseen.length, seenCount: seen.length,
    nextDue: seen.length ? Math.min(...seen.map(card => progress[card.id].due)) : null };
}

export function introduceStudy(progress, entries, now) {
  const next = { ...progress };
  for (const { card, kind } of entries) if (kind === 'new' && !next[card.id]) next[card.id] = {
    stage: 0, due: now, introducedAt: now, lastReviewedAt: 0, attempts: 0, successes: 0, lapses: 0,
  };
  return next;
}
export function recordStudy(progress, event, now) {
  const previous = progress[event.id];
  if (!previous) throw new Error('Card must be introduced before review');
  const log = { ...event, at: now };
  // Retries and optional early practice never change a scheduled review.
  if (event.kind === 'retry' || event.kind === 'extra') return { progress, log };
  const canAdvance = previous.due <= now;
  const recalled = event.outcome === 'recalled';
  const next = { ...previous, attempts: previous.attempts + 1, successes: previous.successes + Number(recalled),
    lapses: previous.lapses + Number(!recalled), lastReviewedAt: now };
  if (!recalled) { next.stage = 0; next.due = now + STUDY_RELEARN; }
  else if (canAdvance) {
    next.stage = Math.min(STUDY_STEPS.length, previous.stage + 1);
    next.due = now + STUDY_STEPS[next.stage - 1] * STUDY_DAY;
  }
  return { progress: { ...progress, [event.id]: next }, log };
}
export function delayedStudyStats(logs) {
  const eligible = logs.filter(log => log.kind === 'review' && log.delayed === true);
  const scaffolded = eligible.filter(log => log.cue === 'initial-and-length');
  const uncued = eligible.filter(log => log.cue === 'none');
  return { correct: scaffolded.filter(log => log.outcome === 'recalled').length, total: scaffolded.length, freeCorrect: uncued.filter(log => log.outcome === 'recalled').length, freeTotal: uncued.length };
}
export function validStudyProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item &&
    ['due', 'introducedAt', 'lastReviewedAt', 'attempts', 'successes', 'lapses', 'stage'].every(key => Number.isFinite(item[key]) && item[key] >= 0) &&
    Number.isInteger(item.stage) && item.stage <= STUDY_STEPS.length));
}

export class StudyRound {
  constructor(entries, progress = {}, options = {}) {
    this.queue = entries.map(entry => ({ ...entry }));
    this.baseTotal = entries.length;
    this.continuous = options.continuous === true;
    this.cycleEntries = entries.map(entry => ({ ...entry, kind: 'extra', delayed: false }));
    this.lap = 1;
    this.remaining = options.seconds || 60;
    this.plateLimit = options.plateSeconds || 25;
    this.cueMode = options.cueMode === 'none' ? 'none' : 'initial-and-length';
    this.position = 0; this.records = []; this.phase = entries.length ? 'question' : 'done';
    this.paused = false;
    this.resetQuestion();
  }
  get current() { return this.queue[this.position]; }
  resetQuestion() {
    this.assisted = false; this.typed = ''; this.mistakesAtIndex = 0;
    this.misses = 0; this.addedHints = 0; this.plateElapsed = 0;
    this.guide = this.current?.card.answers[0] || '';
    this.revealed = new Set(this.cueMode === 'none' ? [] : [0]);
  }
  get mask() {
    if (this.cueMode === 'none') return '';
    return [...this.guide].map((char, i) => i < this.typed.length || this.revealed.has(i) || char === ' ' ? char : '_').join('');
  }
  hint(index = null) {
    if (this.phase !== 'question' || this.paused || this.cueMode === 'none') return '';
    const position = index ?? [...this.guide].findIndex((char, i) => i >= this.typed.length && !this.revealed.has(i) && char !== ' ');
    if (position >= 0 && position < this.guide.length && !this.revealed.has(position)) {
      this.revealed.add(position); this.assisted = true; this.addedHints++;
    }
    return this.mask;
  }
  type(char) {
    if (this.phase !== 'question' || this.paused || this.cueMode === 'none' || char.length !== 1) return null;
    const prefix = (this.typed + char).normalize('NFKC').toLowerCase();
    const candidate = this.current.card.answers.find(answer => answer.normalize('NFKC').toLowerCase().startsWith(prefix));
    if (!candidate) {
      this.misses++; this.mistakesAtIndex++;
      const before = this.addedHints;
      if (this.mistakesAtIndex >= 2) { this.hint(this.typed.length); this.mistakesAtIndex = 0; }
      return { kind: 'miss', revealed: this.addedHints > before };
    }
    this.guide = candidate; this.typed += char; this.mistakesAtIndex = 0;
    if (matchesStudy(this.typed, this.current.card.answers)) return { kind: 'complete', event: this.submit(this.typed) };
    return { kind: 'key' };
  }
  advance(seconds) {
    if (this.phase !== 'question' || this.paused || !Number.isFinite(seconds) || seconds <= 0) return null;
    const elapsed = Math.min(seconds, this.remaining, this.plateLimit - this.plateElapsed);
    this.remaining = Math.max(0, this.remaining - elapsed); this.plateElapsed += elapsed;
    if (this.remaining < 1e-8 || this.plateLimit - this.plateElapsed < 1e-8) {
      if (this.remaining < 1e-8) this.remaining = 0;
      return this.submit('', true, true);
    }
    return null;
  }
  testAnswer(answer) {
    if (this.cueMode !== 'none' || !answer.trim()) return null;
    return this.submit(answer, !matchesStudy(answer, this.current.card.answers));
  }
  submit(answer, reveal = false, timedOut = false) {
    if (this.phase !== 'question' || this.paused || (!reveal && !matchesStudy(answer, this.current.card.answers))) return null;
    const { card, kind, delayed } = this.current;
    const outcome = reveal ? 'forgot' : this.assisted ? 'assisted' : 'recalled';
    const points = outcome === 'recalled' ? kind === 'review' ? 300 : kind === 'new' ? 150 : 100 : outcome === 'assisted' ? 50 : 0;
    const event = { id: card.id, kind, delayed, cue: this.cueMode, outcome, points, addedHints: this.addedHints, misses: this.misses, timedOut };
    this.records.push(event); this.phase = 'feedback';
    if (outcome !== 'recalled' && kind !== 'retry' && this.queue.length - this.position - 1 >= 2) this.queue.splice(this.position + 3, 0, { ...this.current, kind: 'retry', delayed: false });
    return event;
  }
  next() {
    if (this.phase !== 'feedback') return;
    this.position++;
    if (this.continuous && this.remaining > 0 && this.position >= this.queue.length && this.cycleEntries.length) {
      this.queue = this.cycleEntries.map(entry => ({ ...entry })); this.position = 0; this.lap++;
    }
    this.phase = this.position < this.queue.length && this.remaining > 0 ? 'question' : 'done';
    this.resetQuestion();
  }
}
