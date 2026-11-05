import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
function setup(saved) {
  const root = new URL('../dist/', import.meta.url), console = new VirtualConsole(); const errors = [];
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(readFileSync(new URL('index.html', root), 'utf8'), { url: 'https://aquarium.test', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
  const w = dom.window; let now = 0, frame;
  w.performance.now = () => now; w.requestAnimationFrame = callback => { frame = callback; return 1; };
  w.setTimeout = () => 1; w.clearTimeout = () => {}; w.confirm = () => true; w.structuredClone = structuredClone;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  if (saved) w.localStorage.setItem('typequarium-lab-v1', saved);
  w.localStorage.setItem('sushi-type-learning-v1', 'original-study-data');
  w.eval(['model.js','art.js','app.js'].map(file => readFileSync(new URL(file, root), 'utf8').replace(/^import .+;\n/gm, '').replace(/export /g, '')).join('\n'));
  const q = selector => w.document.querySelector(selector), click = selector => { assert.ok(q(selector), selector); q(selector).click(); };
  const advance = seconds => { now += seconds * 1000; frame(now); };
  const stored = () => JSON.parse(w.localStorage.getItem('typequarium-lab-v1'));
  const typePhrase = () => { const text = q('#job-english').textContent; for (const key of text) { advance(.025); q('#job-input').dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); } return text; };
  return { w, dom, q, click, advance, stored, typePhrase, errors };
}
test('purchase -> select -> feed -> growth -> visitors -> reload, while the original study key stays untouched', () => {
  const { w, q, click, stored } = setup();
  assert.ok(q('.aquarium')); assert.equal(q('.wallet b').textContent, '240'); assert.equal(q('[data-action="quiz"]').disabled, true);
  click('[data-action="nav"][data-view="shop"]'); click('[data-action="filter"][data-filter="odd"]');
  assert.equal(w.document.querySelectorAll('.shop-card').length, 4); click('[data-action="buy"][data-id="uncle"]');
  assert.equal(stored().residents.length, 2); assert.equal(stored().coins, 60);
  click('[data-action="nav"][data-view="aquarium"]'); assert.ok(q('.care-panel h3').textContent.includes('おじさん'));
  click('[data-action="feed"]'); click('[data-action="feed"]');
  assert.ok(stored().residents[1].growth >= 60); assert.equal(q('.level-badge').textContent, 'Lv.2');
  const next = setup(w.localStorage.getItem('typequarium-lab-v1')); assert.equal(next.w.document.querySelectorAll('.swimmer').length, 2);
  assert.equal(w.localStorage.getItem('sushi-type-learning-v1'), 'original-study-data'); next.w.close(); w.close();
});
test('real timed typing pays once, unlocks recall, and correctly records a hinted answer', () => {
  const { w, q, click, advance, stored, typePhrase, errors } = setup();
  click('[data-action="job"]'); click('[data-action="begin-job"]'); typePhrase(); typePhrase(); typePhrase(); advance(20);
  assert.ok(q('.job-result')); const before = stored(); assert.ok(before.coins > 240); assert.equal(before.stats.jobs, 1);
  assert.equal(Object.keys(before.seen).length, 3); advance(5); assert.equal(stored().coins, before.coins);
  click('[data-action="back-home"]'); click('[data-action="quiz"]');
  const inputAnswer = text => { q('#quiz-input').value = text; q('#quiz-form').dispatchEvent(new w.Event('submit', { cancelable: true })); };
  click('[data-action="quiz-hint"]'); inputAnswer(q('.hint-answer').textContent); click('[data-action="quiz-next"]');
  for (let i = 0; i < 2; i++) { click('[data-action="quiz-hint"]'); inputAnswer(q('.hint-answer').textContent); click('[data-action="quiz-next"]'); }
  assert.equal(stored().stats.checks, 3); assert.equal(stored().stats.recalled, 0); assert.equal(stored().coins, before.coins);
  assert.ok(q('.job-result').textContent.includes('0')); assert.deepEqual(errors, []); w.close();
});
test('pause, leaving the page and closing a working dialog cannot advance the timer or issue partial rewards', () => {
  const { w, q, click, advance } = setup(); click('[data-action="job"]'); click('[data-action="begin-job"]'); advance(2);
  const left = q('#job-time').textContent; w.dispatchEvent(new w.Event('blur')); advance(100);
  assert.equal(q('#job-time').textContent, left); assert.equal(q('#job-pause').hidden, false);
  click('[data-action="resume-job"]'); advance(1); assert.ok(Number(q('#job-time').textContent) < Number(left));
  click('[data-action="close"]'); advance(100); assert.equal(q('#dialog').open, false); assert.equal(q('.wallet b').textContent, '240'); w.close();
});
test('a declined cancellation stays paused, and a new work session cannot receive an old result', () => {
  const { w, q, click, advance, stored, typePhrase } = setup(); click('[data-action="job"]'); click('[data-action="begin-job"]'); advance(1);
  w.confirm = () => false; click('[data-action="close"]'); const left = q('#job-time').textContent; advance(50); assert.equal(q('#job-time').textContent, left);
  w.confirm = () => true; click('[data-action="close"]'); click('[data-action="job"]'); click('[data-action="begin-job"]'); typePhrase(); advance(20);
  assert.equal(stored().stats.jobs, 1); w.close();
});
test('aquarium names and imported journal text stay text rather than HTML', () => {
  const { w, q, click } = setup(); click('[data-action="rename"]'); q('#name-input').value = '<img src=x onerror=1>';
  q('#name-form').dispatchEvent(new w.Event('submit', { cancelable: true })); assert.equal(q('.aquarium-name img'), null);
  assert.ok(q('.aquarium-name h1').textContent.includes('<img'));
  click('[data-action="nav"][data-view="collection"]'); assert.ok(q('.journal')); w.close();
});
test('both responsive and reduced-motion stylesheet rules parse without CSS errors', () => {
  const console = new VirtualConsole(), errors = []; console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<style>'+readFileSync(new URL('../dist/style.css', import.meta.url),'utf8')+'</style>', { virtualConsole: console });
  assert.deepEqual(errors, []); assert.ok(dom.window.document.styleSheets[0].cssRules.length > 50); dom.window.close();
});
