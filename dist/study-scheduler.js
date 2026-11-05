import * as FSRS from './vendor/ts-fsrs.mjs';

export const FSRS_ENGINE = 'fsrs-6';
export const FSRS_LIBRARY_VERSION = '5.4.2';
export const FSRS_CONFIG = Object.freeze({ request_retention: .9, maximum_interval: 36500, enable_fuzz: false, enable_short_term: true, learning_steps: Object.freeze(['10m']), relearning_steps: Object.freeze(['10m']) });
const studyScheduler = FSRS.fsrs(FSRS_CONFIG);
export const validStudyTimestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;

function serializeMemory(card) {
  const memory = { engine: FSRS_ENGINE, libraryVersion: FSRS_LIBRARY_VERSION };
  for (const key of ['stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'learning_steps', 'reps', 'lapses', 'state']) memory[key] = card[key];
  memory.due = Number(card.due);
  if (card.last_review !== undefined) memory.last_review = Number(card.last_review);
  return memory;
}
export function newStudyMemory(now) {
  if (!validStudyTimestamp(now)) throw new Error('Invalid study timestamp');
  return serializeMemory(FSRS.createEmptyCard(now));
}
export function validStudyMemory(memory) {
  if (!memory || memory.engine !== FSRS_ENGINE || memory.libraryVersion !== FSRS_LIBRARY_VERSION || !validStudyTimestamp(memory.due)) return false;
  if (!['reps', 'lapses', 'learning_steps', 'state'].every(key => Number.isSafeInteger(memory[key]) && memory[key] >= 0)) return false;
  if (memory.state > 3 || memory.lapses > memory.reps || memory.learning_steps > 100) return false;
  if (!['stability', 'difficulty', 'elapsed_days', 'scheduled_days'].every(key => Number.isFinite(memory[key]) && memory[key] >= 0)) return false;
  if (memory.difficulty > 10 || memory.stability > FSRS.S_MAX || memory.scheduled_days > FSRS_CONFIG.maximum_interval) return false;
  if (memory.state === FSRS.State.New) return memory.reps === 0 && memory.stability === 0 && memory.difficulty === 0 && memory.last_review === undefined;
  return memory.reps > 0 && memory.stability >= FSRS.S_MIN && memory.difficulty >= 1 && validStudyTimestamp(memory.last_review) && memory.last_review <= memory.due;
}
export function studyRating(outcome) {
  if (outcome === 'recalled') return FSRS.Rating.Good;
  if (outcome === 'assisted' || outcome === 'forgot') return FSRS.Rating.Again;
  throw new Error('Invalid study outcome');
}
export function reviewStudyMemory(memory, outcome, now) {
  if (!validStudyMemory(memory) || !validStudyTimestamp(now) || now < (memory.last_review ?? 0)) throw new Error('Invalid FSRS review');
  const rating = studyRating(outcome);
  const result = studyScheduler.next({ ...memory }, now, rating);
  return { memory: serializeMemory(result.card), rating, log: { ...result.log, due: Number(result.log.due), review: Number(result.log.review) } };
}

// Keep existing due dates on upgrade. Only complete scheduled histories are replayed;
// incomplete logs must not turn an old fixed stage into invented memory strength.
export function restoreStudyMemory(item, id, logs = []) {
  if (validStudyMemory(item.fsrs) && (item.fsrs.last_review ?? 0) <= item.lastReviewedAt) return item.fsrs;
  const history = (Array.isArray(logs) ? logs : []).filter(log => log && log.id === id && ['new', 'review'].includes(log.kind) && log.scheduled !== false && ['recalled', 'assisted', 'forgot'].includes(log.outcome) && validStudyTimestamp(log.at) && log.at >= item.introducedAt && log.at <= item.lastReviewedAt).sort((a, b) => a.at - b.at);
  const complete = history.length === item.attempts && (item.attempts === 0 || history.at(-1)?.at === item.lastReviewedAt);
  let memory = newStudyMemory(item.introducedAt);
  if (complete) for (const log of history) memory = reviewStudyMemory(memory, log.outcome, log.at).memory;
  return { ...memory, due: item.due };
}
