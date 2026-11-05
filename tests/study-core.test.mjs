import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StudyRound, planStudy, introduceStudy, recordStudy, delayedStudyStats, parseStudyMarkdown, matchesStudy, STUDY_DAY, STUDY_RELEARN, validStudyProgress, studyPlateValue } from '../dist/study-core.js';
import { STUDY_DECKS } from '../dist/study-cards.js';
const now = new Date('2026-11-05T10:00:00Z').getTime();
const cards = STUDY_DECKS[0].cards;
const entry = (card = cards[0], kind = 'review') => ({ card, kind, delayed: true });
const freshProgress = () => introduceStudy({}, [entry(cards[0], 'new')], now);
const typeAnswer = round => { let result; for (const char of round.current.card.answers[0]) result = round.type(char); return result; };

test('three clean completions celebrate without changing prices, time or review scheduling', () => {
  const round = new StudyRound([entry(cards[0]), entry(cards[1]), entry(cards[2])], {}, { continuous: true });
  const events = [];
  for (let i = 0; i < 3; i++) { events.push(typeAnswer(round).event); round.next(); }
  assert.deepEqual(events.map(e => e.milestone), [false, false, true]);
  assert.deepEqual(events.map(e => e.streak), [1, 2, 3]);
  assert.equal(round.remaining, 60); assert.equal(round.plateLimit, 6); assert.equal(round.bestStreak, 3);
  assert.ok(events.every(e => e.points === e.price));
  const plain = { ...events[0] }; delete plain.streak; delete plain.milestone;
  assert.deepEqual(recordStudy(freshProgress(), events[0], now).progress, recordStudy(freshProgress(), plain, now).progress);
  round.hint(); const assisted = typeAnswer(round).event;
  assert.equal(assisted.outcome, 'assisted'); assert.equal(assisted.streak, 0); assert.equal(assisted.milestone, false);
  round.next(); typeAnswer(round); round.next();
  assert.equal(round.cleanStreak, 1); assert.equal(round.submit('', true).streak, 0); assert.equal(round.bestStreak, 3);
});

test('word, collocation and sentence share themes but keep separate memory records', () => {
  assert.deepEqual(STUDY_DECKS.map(deck => deck.seconds), [60, 90, 120]);
  assert.ok(STUDY_DECKS[1].cards.some(card => card.answers[0] === 'make a decision'));
  assert.ok(STUDY_DECKS[2].cards.some(card => card.answers[0] === 'i need to make a decision'));
  const all = STUDY_DECKS.flatMap(deck => deck.cards); assert.equal(new Set(all.map(card => card.id)).size, 36);
});
test('initial-and-length mask hides the answer except the head letter and spaces', () => {
  const round = new StudyRound([entry()]); assert.equal(round.mask, 'a____'); assert.equal(round.typed, '');
  round.type('A'); assert.equal(round.typed, 'A'); assert.equal(round.mask, 'a____');
});
test('two misses reveal exactly the current letter without typing it for the learner', () => {
  const round = new StudyRound([entry()]); round.type('a');
  assert.equal(round.type('x').revealed, false); assert.equal(round.mask, 'a____');
  assert.equal(round.type('y').revealed, true); assert.equal(round.mask, 'ap___'); assert.equal(round.typed, 'a');
  assert.equal(round.addedHints, 1); round.type('p'); round.type('p'); round.type('l');
  const result = round.type('e'); assert.equal(result.kind, 'complete'); assert.equal(result.event.outcome, 'assisted'); assert.equal(result.event.misses, 2);
});
test('miss counter resets after a correct letter; baseline letter is not an added hint', () => {
  const round = new StudyRound([entry()]); round.type('x'); round.type('y'); assert.equal(round.addedHints, 0);
  round.type('a'); round.type('x'); round.type('p'); round.type('x'); assert.equal(round.addedHints, 0);
});
test('letter hints remain assisted even when the eventual answer is correct', () => {
  const round = new StudyRound([entry()]); assert.equal(round.hint(), 'ap___');
  const result = typeAnswer(round); assert.equal(result.event.outcome, 'assisted'); assert.equal(result.event.points, 180);
});
test('completion is automatic, one event per item, and an early Enter does not count as recall', () => {
  const round = new StudyRound([entry()]); assert.equal(round.submit('ap'), null);
  const result = typeAnswer(round); assert.equal(result.event.outcome, 'recalled'); assert.equal(result.event.points, 180);
  assert.equal(round.submit('apple'), null); assert.equal(round.records.length, 1);
});
test('deadline, feedback and pause have distinct timing behavior', () => {
  const round = new StudyRound([entry()], {}, { seconds: 60, plateSeconds: 25 });
  round.advance(5); round.paused = true; round.advance(20); assert.equal(round.remaining, 55);
  round.paused = false; const event = round.advance(21); assert.equal(event.timedOut, true); assert.equal(event.outcome, 'forgot'); assert.equal(round.remaining, 35);
  round.advance(100); assert.equal(round.remaining, 35); assert.equal(round.records.length, 1);
});
test('total time expiry records only the current failed card and leaves unattempted cards untouched', () => {
  const round = new StudyRound([entry(), entry(cards[1])], {}, { seconds: 2, plateSeconds: 25 });
  const event = round.advance(10); assert.equal(event.timedOut, true); assert.equal(round.remaining, 0);
  round.next(); assert.equal(round.phase, 'done'); assert.equal(round.records.length, 1);
});
test('no-cue check reveals neither length nor prefix correctness, and grades after submission', () => {
  const round = new StudyRound([entry()], {}, { cueMode: 'none' });
  assert.equal(round.mask, ''); assert.equal(round.hint(), ''); assert.equal(round.type('a'), null);
  const event = round.testAnswer('APPLE.'); assert.equal(event.outcome, 'recalled'); assert.equal(event.cue, 'none');
  const wrong = new StudyRound([entry()], {}, { cueMode: 'none' }); assert.equal(wrong.testAnswer('orange').outcome, 'forgot');
});
test('due reviews lead the queue, and fresh or early practice items are not locked by count caps', () => {
  const first = planStudy(cards, {}, now); assert.equal(first.entries.length, 12);
  const introduced = introduceStudy({}, first.entries, now);
  let progress = introduced;
  for (const item of first.entries) progress = recordStudy(progress, { id: item.card.id, kind: 'new', outcome: 'recalled' }, now).progress;
  assert.equal(planStudy(cards, progress, now).entries.length, 12);
  assert.ok(planStudy(cards, progress, now).entries.every(item => item.kind === 'extra'));
  assert.equal(planStudy(STUDY_DECKS[1].cards, progress, now).entries.length, 12);
  const nextDue = Math.min(...Object.values(progress).map(item => item.due));
  const duePlan = planStudy(cards, progress, nextDue);
  assert.equal(duePlan.entries[0].kind, 'review'); assert.equal(duePlan.entries.length, 12);
});
test('unanswered newly introduced cards are never mistaken for delayed recalls', () => {
  const introduced = freshProgress(); const planned = planStudy(cards, introduced, now + STUDY_DAY);
  assert.equal(planned.entries[0].kind, 'new'); assert.equal(planned.entries[0].delayed, false);
});
test('FSRS grows intervals after due recall; failed and hinted answers return in ten minutes', () => {
  const p = freshProgress(); const first = recordStudy(p, { id: cards[0].id, kind: 'new', outcome: 'recalled' }, now).progress;
  const firstDue = first[cards[0].id].due;
  assert.equal(firstDue, now + 2 * STUDY_DAY); assert.equal(first[cards[0].id].fsrs.reps, 1);
  const next = recordStudy(first, { id: cards[0].id, kind: 'review', outcome: 'recalled' }, firstDue).progress;
  const nextDue = next[cards[0].id].due;
  assert.equal(nextDue, firstDue + STUDY_DAY * 11);
  assert.ok(next[cards[0].id].fsrs.stability > first[cards[0].id].fsrs.stability);
  for (const outcome of ['forgot', 'assisted']) {
    const failed = recordStudy(next, { id: cards[0].id, kind: 'review', outcome }, nextDue).progress;
    assert.equal(failed[cards[0].id].fsrs.state, 3); assert.equal(failed[cards[0].id].due, nextDue + STUDY_RELEARN);
  }
});
test('extra practice and immediate retries never change review schedules', () => {
  const original = freshProgress();
  for (const kind of ['extra', 'retry']) for (const outcome of ['recalled', 'assisted', 'forgot']) {
    const saved = recordStudy(original, { id: cards[0].id, kind, outcome }, now + 100);
    assert.deepEqual(saved.progress, original);
  }
});
test('incorrect items are retried once only after two intervening items', () => {
  const round = new StudyRound(cards.slice(0, 3).map(card => entry(card, 'new')));
  round.submit('', true); assert.equal(round.queue.length, 4); round.next(); typeAnswer(round); round.next(); typeAnswer(round); round.next();
  assert.equal(round.current.kind, 'retry'); assert.equal(round.current.card.id, cards[0].id);
  round.submit('', true); assert.equal(round.queue.length, 4);
  const short = new StudyRound([entry()]); short.submit('', true); assert.equal(short.queue.length, 1);
});
test('next question resets masks, mistake counters, and hints without resetting the course timer', () => {
  const round = new StudyRound([entry(), entry(cards[1])]); round.hint(); round.advance(4); round.submit('', true); round.next();
  assert.equal(round.assisted, false); assert.equal(round.addedHints, 0); assert.equal(round.typed, ''); assert.equal(round.remaining, 56);
  assert.equal(round.mask[0], cards[1].answers[0][0]);
});
test('retention views separate cued from no-cue tests and exclude immediate/extra/retry work', () => {
  const logs = [
    { kind: 'review', delayed: true, cue: 'initial-and-length', outcome: 'recalled' },
    { kind: 'review', delayed: true, cue: 'initial-and-length', outcome: 'assisted' },
    { kind: 'review', delayed: true, cue: 'none', outcome: 'forgot' },
    ...['new', 'retry', 'extra'].map(kind => ({ kind, delayed: true, cue: 'none', outcome: 'recalled' })),
    { kind: 'review', delayed: false, cue: 'none', outcome: 'recalled' },
  ];
  assert.deepEqual(delayedStudyStats(logs), { correct: 1, total: 2, freeCorrect: 0, freeTotal: 1 });
});
test('Markdown supports aliases, Japanese answers and stable IDs across explanation edits', () => {
  const a = parseStudyMarkdown('# 自分の勉強\n## 水は？\n答え: H2O | H₂O\n解説: 水素と酸素');
  assert.equal(a.errors.length, 0); assert.ok(matchesStudy(' ｈ２ｏ ', a.cards[0].answers));
  const b = parseStudyMarkdown('# 自分の勉強\n## 水は？\n答え: H2O | H₂O\n解説: 補足を修正');
  assert.equal(a.cards[0].id, b.cards[0].id); assert.equal(matchesStudy('りんご', ['りんご']), true);
  assert.ok(parseStudyMarkdown('## 問題\n答え: a |').errors.length); assert.ok(parseStudyMarkdown('## 問題\n答え: a\n## 問題\n答え: a').errors.length);
});
test('invalid stored schedules are filtered before any date arithmetic', () => {
  const p = freshProgress(); assert.deepEqual(validStudyProgress({ ...p, bad: { due: 'tomorrow' }, negative: { ...p[cards[0].id], stage: -1 } }), p);
});

test('continuous rounds wrap into extra practice without exhausting a five-item queue', () => {
  const round = new StudyRound([entry(cards[0], 'new')], {}, { continuous: true });
  for (let i = 0; i < 8; i++) { const result = typeAnswer(round); assert.equal(result.event.kind, i ? 'extra' : 'new'); round.next(); }
  assert.equal(round.phase, 'question'); assert.equal(round.records.length, 8); assert.equal(round.lap, 9);
});
test('retry comes after exactly two intervening cards even in a large deck', () => {
  const round = new StudyRound(cards.map(card => entry(card, 'new')), {}, { continuous: true });
  round.submit('', true); round.next(); typeAnswer(round); round.next(); typeAnswer(round); round.next();
  assert.equal(round.current.kind, 'retry'); assert.equal(round.current.card.id, cards[0].id);
});
test('continuous mode still finishes when its real time budget expires', () => {
  const round = new StudyRound([entry()], {}, { continuous: true, seconds: 2 });
  round.advance(3); round.next(); assert.equal(round.phase, 'done'); assert.equal(round.lap, 1);
});

test('prices rise at clear English-length boundaries, including spaces', () => {
  for (const [length, price] of [[4, 100], [5, 180], [7, 180], [8, 240], [14, 240], [15, 380], [24, 380], [25, 500], [100, 500]]) assert.equal(studyPlateValue('a'.repeat(length)), price);
  assert.equal(studyPlateValue('eat an apple'), 240);
  assert.equal(studyPlateValue(' ＡＰＰＬＥ. '), 180);
});
test('dish value pays in full for new, due, extra and assisted completions, with zero for a timeout', () => {
  for (const kind of ['new', 'review', 'extra', 'retry']) {
    const round = new StudyRound([entry(cards[0], kind)]); round.hint();
    const event = typeAnswer(round).event; assert.equal(event.points, 180); assert.equal(event.price, 180); assert.equal(event.outcome, 'assisted');
  }
  const round = new StudyRound([entry()], {}, { plateSeconds: 5 }); const failed = round.advance(5);
  assert.equal(failed.points, 0); assert.equal(failed.price, 180);
});
test('course times match the shared arcade definitions while dishes have strict short deadlines', () => {
  assert.deepEqual(STUDY_DECKS.map(deck => [deck.seconds, deck.plateSeconds]), [[60, 3], [90, 5], [120, 10]]);
  for (const deck of STUDY_DECKS) {
    const round = new StudyRound([entry(deck.cards[0])], {}, { seconds: deck.seconds, plateSeconds: deck.plateSeconds });
    round.advance(deck.plateSeconds - .01); assert.equal(round.phase, 'question');
    assert.equal(round.advance(.01).timedOut, true);
  }
});
test('automatic feedback uses the course budget without creating phantom failed cards', () => {
  const round = new StudyRound([entry(), entry(cards[1])], {}, { seconds: 1, plateSeconds: 5, continuous: true });
  round.submit('', true); round.advanceFeedback(.4); assert.ok(Math.abs(round.remaining - .6) < 1e-9);
  round.paused = true; round.advanceFeedback(5); assert.ok(Math.abs(round.remaining - .6) < 1e-9);
  round.paused = false; round.advanceFeedback(2); assert.equal(round.remaining, 0);
  round.next(); assert.equal(round.phase, 'done'); assert.equal(round.records.length, 1);
});
test('registered aliases use the completed spelling length for payout', () => {
  const round = new StudyRound([entry(cards[1])]); assert.equal(round.value, 180);
  const event = round.submit('rest'); assert.equal(event.price, 100); assert.equal(event.characters, 4); assert.equal(event.points, 100);
});
