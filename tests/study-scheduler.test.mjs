import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FSRS_CONFIG, newStudyMemory, reviewStudyMemory, validStudyMemory, studyRating } from '../dist/study-scheduler.js';
import { introduceStudy, recordStudy, validStudyProgress, planStudy, STUDY_DAY, STUDY_RELEARN } from '../dist/study-core.js';
const at = Date.parse('2026-11-05T10:00:00Z');
const card = { id: 'a', answers: ['apple'] };
const introduced = () => introduceStudy({}, [{ card, kind: 'new' }], at);
const legacy = (overrides = {}) => ({ stage: 2, due: at + 4 * STUDY_DAY, introducedAt: at, lastReviewedAt: at + STUDY_DAY, attempts: 2, successes: 2, lapses: 0, ...overrides });

test('FSRS-6 reference trajectory changes memory state and interval after each due recall', () => {
  const first = reviewStudyMemory(newStudyMemory(at), 'recalled', at);
  assert.equal(first.rating, 3); assert.equal(first.memory.stability, 2.3065);
  assert.equal(first.memory.due, at + 2 * STUDY_DAY); assert.equal(first.memory.state, 2);
  const second = reviewStudyMemory(first.memory, 'recalled', first.memory.due);
  assert.equal(second.memory.stability, 10.96433194); assert.equal(second.memory.scheduled_days, 11);
  assert.equal(second.memory.reps, 2); assert.ok(second.memory.difficulty < first.memory.difficulty);
  assert.equal(FSRS_CONFIG.request_retention, .9);
});

test('actual elapsed time changes the next interval rather than following a fixed stage table', () => {
  const first = reviewStudyMemory(newStudyMemory(at), 'recalled', at).memory;
  const onTime = reviewStudyMemory(first, 'recalled', at + 2 * STUDY_DAY).memory;
  const overdue = reviewStudyMemory(first, 'recalled', at + 10 * STUDY_DAY).memory;
  assert.equal(onTime.scheduled_days, 11); assert.equal(overdue.scheduled_days, 25);
  assert.ok(overdue.stability > onTime.stability); assert.equal(overdue.elapsed_days, 10);
});

test('hinted answers are Again, not Hard, with the same ten-minute learning step as failed recall', () => {
  const first = reviewStudyMemory(newStudyMemory(at), 'recalled', at).memory;
  const forgot = reviewStudyMemory(first, 'forgot', first.due);
  const assisted = reviewStudyMemory(first, 'assisted', first.due);
  assert.deepEqual(assisted, forgot); assert.equal(assisted.rating, 1);
  assert.equal(assisted.memory.due, first.due + STUDY_RELEARN); assert.equal(assisted.memory.state, 3);
  assert.ok(assisted.memory.stability < first.stability); assert.equal(assisted.memory.lapses, 1);
  const resumed = reviewStudyMemory(assisted.memory, 'recalled', assisted.memory.due).memory;
  assert.equal(resumed.state, 2); assert.ok(resumed.due > assisted.memory.due);
  const newFailure = reviewStudyMemory(newStudyMemory(at), 'assisted', at).memory;
  assert.equal(newFailure.state, 1); assert.equal(newFailure.due, at + STUDY_RELEARN);
  assert.throws(() => studyRating('hard'), /Invalid/);
});

test('JSON round trips preserve memory and review calculations, with epoch dates in the log', () => {
  const first = reviewStudyMemory(newStudyMemory(at), 'recalled', at).memory;
  const restored = JSON.parse(JSON.stringify(first)); assert.equal(validStudyMemory(restored), true);
  const result = reviewStudyMemory(restored, 'recalled', restored.due);
  assert.deepEqual(result, reviewStudyMemory(first, 'recalled', first.due));
  assert.equal(result.log.review, first.due); assert.equal(typeof result.log.due, 'number');
  assert.equal(result.memory.last_review, first.due);
});

test('extra, retry, early and backward-clock responses cannot inflate FSRS or the recall counters', () => {
  const saved = recordStudy(introduced(), { id: 'a', kind: 'new', outcome: 'recalled' }, at).progress;
  for (const kind of ['extra', 'retry', 'review']) for (const outcome of ['recalled', 'assisted', 'forgot']) {
    const result = recordStudy(saved, { id: 'a', kind, outcome }, at + 1000);
    assert.deepEqual(result.progress, saved); assert.equal(result.log.scheduled, false);
  }
  const back = recordStudy(saved, { id: 'a', kind: 'review', outcome: 'recalled' }, at - 1);
  assert.deepEqual(back.progress, saved); assert.equal(back.log.scheduled, false);
  const due = recordStudy(saved, { id: 'a', kind: 'review', outcome: 'recalled' }, saved.a.due);
  assert.equal(due.log.scheduled, true); assert.equal(due.log.rating, 3);
  assert.equal(due.log.nextDue, due.progress.a.due); assert.equal(due.log.scheduler, 'fsrs-6');
  assert.equal(due.progress.a.fsrs.reps, 2); assert.equal(due.progress.a.attempts, 2);
});

test('complete legacy history rebuilds memory while preserving the existing due date and counters', () => {
  const item = legacy();
  const logs = [{ id: 'a', kind: 'review', outcome: 'recalled', at: at + STUDY_DAY }, { id: 'a', kind: 'new', outcome: 'recalled', at }, { id: 'a', kind: 'extra', outcome: 'recalled', at: at + 10 }, { id: 'a', kind: 'retry', outcome: 'forgot', at: at + 20 }];
  const migrated = validStudyProgress({ a: item }, logs);
  assert.equal(migrated.a.due, item.due); assert.equal(migrated.a.fsrs.due, item.due);
  assert.equal(migrated.a.fsrs.reps, 2); assert.equal(migrated.a.fsrs.last_review, item.lastReviewedAt);
  assert.equal(migrated.a.attempts, item.attempts); assert.equal(migrated.a.successes, item.successes);
  assert.deepEqual(validStudyProgress(JSON.parse(JSON.stringify(migrated)), logs), migrated);
});

test('truncated legacy logs preserve due dates without inventing stability from the old stage', () => {
  const item = legacy({ attempts: 100, successes: 90, lapses: 10, stage: 6 });
  const partial = [{ id: 'a', kind: 'review', outcome: 'recalled', at: item.lastReviewedAt }];
  const migrated = validStudyProgress({ a: item }, partial);
  assert.equal(migrated.a.fsrs.reps, 0); assert.equal(migrated.a.fsrs.stability, 0);
  assert.equal(migrated.a.due, item.due); assert.equal(migrated.a.attempts, 100);
  const result = recordStudy(migrated, { id: 'a', kind: 'review', outcome: 'recalled' }, item.due);
  assert.equal(result.progress.a.fsrs.reps, 1); assert.equal(result.progress.a.attempts, 101);
  assert.equal(result.progress.a.due, item.due + 2 * STUDY_DAY);
});

test('bad stored memory is repaired per card without discarding valid study history', () => {
  const saved = recordStudy(introduced(), { id: 'a', kind: 'new', outcome: 'recalled' }, at).progress;
  const broken = { ...saved.a, fsrs: { ...saved.a.fsrs, difficulty: NaN } };
  assert.equal(validStudyMemory(broken.fsrs), false);
  const repaired = validStudyProgress({ a: broken, b: saved.a, malformed: { due: 'tomorrow' } }, [null]);
  assert.equal(repaired.a.due, broken.due); assert.equal(repaired.a.attempts, 1);
  assert.equal(repaired.a.fsrs.reps, 0); assert.deepEqual(repaired.b, saved.a); assert.equal(repaired.malformed, undefined);
  assert.throws(() => reviewStudyMemory(newStudyMemory(at), 'recalled', NaN), /Invalid/);
});

test('overdue cards lead new cards, followed by early practice, using stored FSRS due timestamps', () => {
  const saved = recordStudy(introduced(), { id: 'a', kind: 'new', outcome: 'recalled' }, at).progress;
  const all = [{ id: 'new' }, { id: 'future' }, card, { id: 'oldest' }];
  const progress = { ...saved, future: { ...saved.a, due: at + 10 * STUDY_DAY }, oldest: { ...saved.a, due: at + STUDY_DAY } };
  const plan = planStudy(all, progress, at + 3 * STUDY_DAY);
  assert.deepEqual(plan.entries.map(e => [e.card.id, e.kind]), [['oldest', 'review'], ['a', 'review'], ['new', 'new'], ['future', 'extra']]);
  assert.equal(plan.dueCount, 2);
});
