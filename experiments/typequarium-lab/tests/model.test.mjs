import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, restoreState, buy, feed, applyJob, applyQuiz, TypingJob, PHRASES, SPECIES, CAPACITY, visitorCount, visitorWeights, visitors, profile, level, normalize } from '../dist/model.js';
function completedJob(state, id = 'job-1', phrases = 1) {
  const job = new TypingJob(7);
  for (let i = 0; i < phrases; i++) for (const c of job.phrase.en) job.type(c);
  job.advance(20000); return { job, result: applyJob(state, job.result(id)) };
}
test('an honest starting gift is separate from earned money and the first resident is alive', () => {
  const state = newState(42); assert.equal(state.coins, 240); assert.equal(state.stats.earned, 0);
  assert.equal(state.residents.length, 1); assert.equal(state.residents[0].species, 'puffer'); assert.ok(state.log[0].text.includes('開館準備金'));
});
test('purchase pays once, creates an independent resident and increases the visitor count', () => {
  const before = newState(4), result = buy(before, 'uncle'); assert.ok(result);
  assert.equal(result.state.coins, 60); assert.equal(before.coins, 240);
  assert.equal(result.state.residents[1].species, 'uncle'); assert.ok(visitorCount(result.state) > visitorCount(before));
  const duplicate = buy({ ...result.state, coins: 500 }, 'uncle'); assert.equal(duplicate.state.residents.filter(r => r.species === 'uncle').length, 2);
  assert.notEqual(duplicate.resident.id, result.resident.id);
});
test('insufficient funds, unknown species and a full aquarium cannot spend money', () => {
  const state = newState(1); assert.equal(buy({ ...state, coins: 0 }, 'puffer'), null); assert.equal(buy(state, 'bad'), null);
  while (state.residents.length < CAPACITY) state.residents.push({ ...state.residents[0], id: 'r' + (state.residents.length + 1) });
  assert.equal(buy(state, 'jelly'), null); assert.equal(state.coins, 240);
});
test('feeding grows a resident, raises affinity and attracts a larger crowd without infinite waste', () => {
  let state = newState(2), evolved = false; const before = visitorCount(state);
  while (true) { const result = feed(state, 'r1'); if (!result) break; state = result.state; evolved ||= result.evolved; }
  assert.equal(level(state.residents[0]), 3); assert.equal(state.residents[0].happiness, 100);
  assert.ok(state.residents[0].growth <= 200); assert.ok(evolved); assert.ok(visitorCount(state) > before);
  assert.equal(feed(state, 'r1'), null); assert.ok(state.coins >= 0);
});
test('real typing accuracy and speed affect growth and visitor preferences on separate axes', () => {
  const slow = newState(8), fast = structuredClone(slow), precise = structuredClone(slow);
  fast.stats = { ...fast.stats, correct: 100, misses: 30, typingMs: 20000 };
  precise.stats = { ...precise.stats, correct: 100, misses: 0, typingMs: 40000 };
  assert.ok(visitorWeights(fast).penguin > visitorWeights(slow).penguin);
  assert.ok(visitorWeights(precise).robot > visitorWeights(fast).robot);
  assert.ok(feed(precise, 'r1').gain > feed(fast, 'r1').gain);
  assert.equal(profile(precise).theme, 'clear');
});
test('uncle and madam composition changes the corresponding audience rather than using user demographics', () => {
  let state = newState(5); state.coins = 1000; state = buy(state, 'uncle').state; state = buy(state, 'uncle').state;
  assert.ok(visitorWeights(state).person > visitorWeights(state).madam);
  let other = newState(5); other.coins = 1000; other = buy(other, 'aunt').state; other = buy(other, 'aunt').state;
  assert.ok(visitorWeights(other).madam > visitorWeights(other).person);
});
test('crowds are repeatable for an unchanged state and include strange non-human visitors', () => {
  let state = newState(77); state.coins = 10000;
  for (const species of SPECIES) state = buy(state, species.id).state;
  assert.deepEqual(visitors(state), visitors(state)); assert.equal(visitors(state).length, visitorCount(state));
  assert.ok(visitors(state).some(v => ['alien', 'robot', 'fish', 'cat', 'penguin'].includes(v.id)));
  assert.ok(visitorCount(state) <= 24);
});
test('partial, paused and abandoned work never produces a payable result', () => {
  const job = new TypingJob(2); job.type(job.phrase.en[0]); job.advance(3000); assert.equal(job.result('x'), null);
  job.paused = true; job.advance(20000); assert.equal(job.elapsed, 3000); assert.equal(job.type('x'), null);
  job.paused = false; job.advance(17000); assert.equal(job.done, true); assert.equal(job.result('x').ms, 20000);
});
test('wrong keys count as mistakes without advancing the word or earning characters', () => {
  const job = new TypingJob(3); assert.equal(job.type('~'), 'miss'); assert.equal(job.correct, 0); assert.equal(job.misses, 1); assert.equal(job.typed, '');
  const first = job.phrase.en[0]; assert.equal(job.type(first.toUpperCase()), 'key'); assert.equal(job.correct, 1);
});
test('a completed work session pays typing plus admissions exactly once and introduces encountered expressions', () => {
  const before = newState(42), { job, result } = completedJob(before);
  assert.ok(result.total > 0); assert.equal(result.total, result.typing + result.admissions);
  assert.equal(result.state.coins, before.coins + result.total); assert.equal(before.coins, 240);
  assert.equal(result.state.stats.jobs, 1); assert.ok(result.state.seen[job.ids[0]]);
  assert.equal(result.state.seen[job.ids[0]].recalled, false);
  assert.equal(applyJob(result.state, job.result('job-1')), null);
});
test('no work, impossible completion counts and invalid character totals cannot mint coins', () => {
  const state = newState(9), idle = new TypingJob(8); idle.advance(20000);
  assert.equal(applyJob(state, idle.result('idle')).total, 0);
  const base = idle.result('bad'); assert.equal(applyJob(state, { ...base, completed: 1 }), null);
  assert.equal(applyJob(state, { ...base, ms: 1, correct: 5 }), null);
  assert.equal(applyJob(state, { ...base, completed: 1, phraseIds: [PHRASES[0].id], correct: 1 }), null);
});
test('only unassisted recall counts; first successful expressions and retries receive distinct rewards', () => {
  const { state } = completedJob(newState(4), 'work', 3).result; const ids = Object.keys(state.seen);
  const first = applyQuiz(state, 'q1', ids.map(id => ({ id, correct: true, hinted: false })));
  assert.equal(first.coins, 45); assert.equal(first.recalled, 3); assert.equal(profile(first.state).remembered, 3);
  assert.equal(profile(first.state).theme, 'cosmic'); assert.ok(visitorWeights(first.state).alien > visitorWeights(state).alien);
  const repeat = applyQuiz(first.state, 'q2', ids.map(id => ({ id, correct: true, hinted: false }))); assert.equal(repeat.coins, 9);
  const hinted = applyQuiz(state, 'q3', [{ id: ids[0], correct: true, hinted: true }]);
  assert.equal(hinted.coins, 0); assert.equal(hinted.state.stats.recalled, 0);
  assert.equal(applyQuiz(first.state, 'q1', []), null);
  assert.equal(applyQuiz(state, 'q4', [{ id: 'unseen', correct: true, hinted: false }]), null);
});
test('snapshot round trips preserve balances, residents, journal and memory independently', () => {
  let state = completedJob(newState(51)).result.state; state = buy(state, 'jelly').state; state = feed(state, 'r1').state;
  assert.deepEqual(restoreState(JSON.parse(JSON.stringify(state))), state);
});
test('malformed saves cannot create unknown creatures, duplicate residents or negative money', () => {
  const state = newState(3);
  assert.equal(restoreState({ ...state, coins: -1 }), null);
  assert.equal(restoreState({ ...state, residents: [...state.residents, ...state.residents] }), null);
  assert.equal(restoreState({ ...state, residents: [{ ...state.residents[0], species: 'missing' }] }), null);
  assert.equal(restoreState({ ...state, residents: [{ ...state.residents[0], id: 'r999999999999999999999999' }] }), null);
  assert.equal(normalize(' TAKE  A BREAK! '), 'take a break');
});
