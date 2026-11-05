import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, MODES, PRICES, TypingGame, plateValue } from '../dist/core.js';
import { PHRASES } from '../dist/phrases.js';
const phrase = { text: 'tea', translation: 'お茶' };
const create = (mode = 'normal', words = [phrase]) => new TypingGame('easy', mode, words, () => 0);
const complete = game => { for (const key of game.phrase.text) game.type(key); };

test('three courses retain the 3000/5000/10000 yen and 60/90/120 second progression', () => {
  assert.deepEqual(Object.values(COURSES).map(c => [c.price, c.seconds]), [[3000, 60], [5000, 90], [10000, 120]]);
  assert.equal(Object.keys(MODES).length, 5);
});
test('phrase bank is original English, non-empty, unique and typable with the screen keyboard', () => {
  for (const items of Object.values(PHRASES)) {
    assert.ok(items.length >= 35);
    assert.equal(new Set(items.map(item => item.text)).size, items.length);
    for (const item of items) { assert.match(item.text, /^[a-z]+(?: [a-z]+)*$/); assert.ok(item.translation); }
  }
});
test('one character at a time, case-insensitive; no submission or backspace is needed', () => {
  const g = create(); g.start(); g.advance(1);
  assert.equal(g.type('T').kind, 'key');
  assert.equal(g.index, 1);
  assert.equal(g.type('x').kind, 'miss');
  assert.equal(g.index, 1);
  assert.equal(g.score, 0);
  g.type('e'); assert.equal(g.type('a').kind, 'plate');
  assert.equal(g.index, 0); assert.equal(g.score, plateValue('tea', 'easy'));
  assert.equal(g.result().accuracy, 75); assert.equal(g.result().net, g.score - 3000);
});
test('spaces are actual required keystrokes', () => {
  const g = create('normal', [{ text: 'green tea', translation: '緑茶' }]); g.start();
  for (const key of 'green') g.type(key);
  assert.equal(g.type('t').kind, 'miss'); assert.equal(g.index, 5);
  g.type(' '); for (const key of 'tea') g.type(key);
  assert.equal(g.result().plates, 1);
});
test('30 consecutive correct characters grant 2 seconds, and a typo resets the streak', () => {
  const g = create(); g.start();
  for (let i = 0; i < 10; i++) complete(g);
  assert.equal(g.remaining, 62); assert.equal(g.bonus, 2); assert.equal(g.maxCombo, 30);
  g.type('x'); assert.equal(g.combo, 0); assert.equal(g.maxCombo, 30);
});
test('normal mode skips expired plates without awarding their value', () => {
  const g = create(); g.start(); g.type('t'); g.advance(g.plateDuration + 0.2);
  assert.equal(g.skipped, 1); assert.equal(g.index, 0); assert.equal(g.score, 0); assert.equal(g.status, 'playing');
  assert.ok(Math.abs(g.plateElapsed - 0.2) < 1e-8);
});
test('practice plates move slower while the course still has a real time limit', () => {
  const g = create('practice'), normal = create();
  assert.ok(g.plateDuration > normal.plateDuration);
  g.start(); g.advance(61); assert.equal(g.status, 'ended'); assert.equal(g.elapsed, 60);
});
test('accuracy mode resets only typed progress, not plate deadline or earned money', () => {
  const g = create('accuracy'); g.start(); complete(g); const score = g.score;
  g.advance(1); g.type('t'); g.type('e'); g.type('x');
  assert.equal(g.index, 0); assert.equal(g.plateElapsed, 1); assert.equal(g.score, score); assert.equal(g.misses, 1);
});
test('speed mode allows typos but ends on the first escaped plate', () => {
  const g = create('speed'); g.start(); g.type('x'); assert.equal(g.status, 'playing');
  g.advance(g.plateDuration); assert.equal(g.status, 'ended'); assert.equal(g.reason, 'escaped');
});
test('sudden death ends on either typo or escaped plate', () => {
  const g = create('sudden'); g.start(); g.type('x'); assert.equal(g.reason, 'miss');
  const h = create('sudden'); h.start(); h.advance(h.plateDuration); assert.equal(h.reason, 'escaped');
});
test('ready, pause, resume and ended states cannot leak time or score', () => {
  const g = create(); g.advance(10); g.type('t'); assert.equal(g.correct, 0);
  g.start(); g.advance(2); g.pause(); const before = g.result(); g.advance(100); g.type('t');
  assert.deepEqual(g.result(), before); g.resume(); g.advance(1); assert.equal(g.elapsed, 3);
  g.end(); g.type('t'); g.advance(1); assert.equal(g.elapsed, 3);
});
test('time expiration precedes a late input; metrics use active elapsed time', () => {
  const g = create(); g.start(); complete(g); g.advance(61);
  const score = g.score; assert.equal(g.reason, 'time'); assert.equal(g.remaining, 0);
  assert.ok(Math.abs(g.result().speed - 3 / 60) < 1e-10); g.type('t'); assert.equal(g.score, score);
});
test('shuffled bags prevent starvation and immediate repetition at bag boundaries', () => {
  const items = [phrase, { text: 'rice', translation: 'ごはん' }, { text: 'egg', translation: 'たまご' }];
  const g = create('normal', items); g.start(); const texts = [];
  for (let i = 0; i < 9; i++) { texts.push(g.phrase.text); complete(g); }
  for (let i = 1; i < texts.length; i++) assert.notEqual(texts[i], texts[i - 1]);
  assert.equal(new Set(texts.slice(0, 3)).size, 3);
});
test('price tiers remain valid for every phrase and course', () => {
  for (const [course, items] of Object.entries(PHRASES)) for (const item of items) assert.ok(PRICES.includes(plateValue(item.text, course)));
  assert.throws(() => new TypingGame('bad', 'normal', [phrase]));
});
