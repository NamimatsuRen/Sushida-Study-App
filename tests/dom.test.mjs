import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const root = fileURLToPath(new URL('../', import.meta.url));

function setup(saved = null, learningSaved = null) {
  const dom = new JSDOM(readFileSync(root + 'dist/index.html', 'utf8'), { url: 'https://example.test', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  let now = 0, raf, intervalId = 0;
  const intervals = new Map();
  w.performance.now = () => now;
  const baseTime = Date.now();
  w.Date.now = () => baseTime + now;
  w.requestAnimationFrame = callback => { raf = callback; return 1; };
  w.setInterval = callback => { intervals.set(++intervalId, callback); return intervalId; };
  w.clearInterval = id => intervals.delete(id);
  w.setTimeout = () => 1; w.clearTimeout = () => {};
  w.confirm = () => true;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  if (learningSaved) w.localStorage.setItem('sushi-type-learning-v1', learningSaved);
  if (saved) w.localStorage.setItem('sushi-type-english-v2', saved);
  w.eval(['core.js', 'phrases.js', 'sushi.js', 'study-core.js', 'study-cards.js', 'study.js', 'app.js'].map(file => readFileSync(root + 'dist/' + file, 'utf8').replace(/^import .+;\n/gm, '').replace(/export /g, '')).join('\n'));
  const q = selector => w.document.querySelector(selector);
  const click = selector => { assert.ok(q(selector), selector); q(selector).click(); };
  const key = (key, extras = {}) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extras }));
  const advance = seconds => { now += seconds * 1000; raf(now); };
  const countDown = () => { for (let i = 0; i < 3; i++) { now += 1000; for (const callback of [...intervals.values()]) callback(); } };
  const phrase = () => q('#english-prompt').textContent.replace('␣', ' ');
  return { w, dom, q, click, key, advance, countDown, phrase };
}

test('title -> course -> real-time character input -> result -> saved record -> replay', () => {
  const t = setup(); const { q, click, key, advance, countDown, phrase, w } = t;
  assert.ok(q('.title-screen')); click('#start-menu'); assert.equal(w.document.querySelectorAll('[data-course]').length, 3);
  assert.equal(w.document.querySelectorAll('[data-mode]').length, 5);
  click('[data-course="easy"]'); assert.ok(q('#game-overlay:not([hidden])'));
  key(' '); assert.equal(q('.countdown-number').textContent, '3'); countDown();
  assert.ok(q('#game-overlay[hidden]'));
  const text = phrase();
  key('~'); assert.ok(q('#prompt-area.mistake')); assert.equal(q('.typed').textContent, '');
  for (const char of text) { advance(.07); key(char.toUpperCase()); }
  assert.ok(Number(q('#score').textContent.replaceAll(',', '')) > 0);
  advance(65); assert.ok(q('.result-screen')); assert.ok(q('.result-details').textContent.includes('1'));
  const saved = JSON.parse(w.localStorage.getItem('sushi-type-english-v2'));
  assert.equal(saved.history.length, 1); assert.equal(saved.history[0].misses, 1);
  assert.equal(saved.history[0].correct, text.length); assert.equal(saved.history[0].reason, 'time');
  assert.ok(Number.isFinite(saved.bests['easy:normal:keyboard']));
  key('Enter'); assert.ok(q('#start-game')); click('#ready-back'); assert.ok(q('.menu-screen'));
  click('#history-button'); assert.ok(q('#dialog').open); assert.equal(w.document.querySelectorAll('.history-list article').length, 1);
  click('#close-dialog'); assert.equal(q('#dialog').open, false); w.close();
});

test('pause freezes active time; IME and leaving the window pause; dialog never auto-resumes', () => {
  const { q, click, key, advance, countDown, w } = setup();
  click('#start-menu'); click('[data-course="easy"]'); click('#start-game'); countDown(); advance(2);
  const left = q('#time').textContent; key('Escape'); assert.ok(q('#resume')); advance(20);
  assert.equal(q('#time').textContent, left); key('t'); assert.equal(q('.typed').textContent, '');
  click('#resume'); advance(1); assert.equal(Number(q('#time').textContent), Number(left) - 1);
  key('Process', { isComposing: true }); assert.ok(q('.overlay-card').textContent.includes('日本語入力をOFF'));
  click('#resume'); w.dispatchEvent(new w.Event('blur')); assert.ok(q('#resume')); click('#resume');
  click('#help-button'); assert.ok(q('#dialog').open); key('Escape'); assert.ok(q('#resume'));
  click('#close-dialog'); assert.ok(q('#resume')); click('#resume');
  click('#settings-button'); const field = q('#setting-translation'); field.checked = false; field.dispatchEvent(new w.Event('change'));
  assert.equal(q('#translation').textContent, ''); click('#close-dialog');
  click('#end-game'); assert.ok(q('.result-screen')); w.close();
});

test('sudden death reacts immediately; desktop key repeat and modifiers do not create points', () => {
  const { q, click, key, countDown, phrase, w } = setup();
  click('#start-menu'); click('[data-mode="sudden"]'); click('[data-course="easy"]'); click('#start-game'); countDown();
  const text = phrase(); key(text[0], { repeat: true }); key(text[0], { ctrlKey: true }); assert.equal(q('.typed').textContent, '');
  key(text[0]); key('~'); assert.ok(q('.result-screen')); assert.ok(q('.result-heading').textContent.includes('ミスタイプで終了')); w.close();
});

test('touch keyboard can complete a plate and is recorded separately; settings survive reload', () => {
  const { q, click, countDown, phrase, advance, w } = setup();
  click('#settings-button'); q('#setting-keyboard').checked = true; q('#setting-keyboard').dispatchEvent(new w.Event('change')); click('#close-dialog');
  click('#start-menu'); click('[data-course="easy"]'); click('#start-game'); countDown(); assert.equal(q('#virtual-keyboard').hidden, false);
  for (const char of phrase()) { advance(.1); const button = [...w.document.querySelectorAll('[data-key]')].find(el => el.dataset.key === char); button.dispatchEvent(new w.Event('pointerdown', { cancelable: true })); }
  advance(65); const saved = w.localStorage.getItem('sushi-type-english-v2');
  assert.equal(JSON.parse(saved).history[0].touch, true); assert.ok(Object.keys(JSON.parse(saved).bests).some(key => key.endsWith(':touch')));
  const reloaded = setup(saved); reloaded.click('#settings-button'); assert.equal(reloaded.q('#setting-keyboard').checked, true); reloaded.w.close(); w.close();
});

test('learning: visible mask, two-error hint, completion, spaced retry and persisted assisted grade', () => {
  const { q, click, advance, w } = setup();
  click('#start-study'); assert.equal(w.document.querySelectorAll('[data-study-deck]').length, 3);
  click('[data-study-deck="vocabulary"]'); assert.ok(q('.study-prep').textContent.includes('apple'));
  click('#study-begin'); assert.equal(q('#study-mask').textContent, 'a____');
  assert.equal(q('#study-feedback').textContent, ''); assert.equal(q('#study-answer').value, '');
  const type = text => { for (const key of text) { advance(.03); q('#study-answer').dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); } };
  type('a'); type('x'); assert.equal(q('#study-mask').textContent, 'a____');
  type('y'); assert.equal(q('#study-mask').textContent, 'ap___'); assert.equal(q('#study-answer').value, 'a');
  type('pple'); assert.ok(q('.study-feedback.assisted'));
  const storage = () => JSON.parse(w.localStorage.getItem('sushi-type-learning-v1'));
  assert.equal(storage().logs[0].outcome, 'assisted');
  const due = storage().progress['learn-word:apple'].due;
  const clock = q('#study-total-time').textContent; advance(50); assert.equal(q('#study-total-time').textContent, clock);
  click('#study-next'); type('break'); assert.ok(q('.study-feedback.recalled'));
  click('#study-next'); type('decision'); click('#study-next');
  assert.ok(q('.study-question-kind').textContent.includes('もう一度')); type('apple');
  assert.equal(storage().progress['learn-word:apple'].due, due); assert.equal(storage().logs.at(-1).kind, 'retry');
  click('#study-next'); assert.ok(q('.study-result')); assert.ok(q('.study-result-stats').textContent.includes('ヒントあり'));
  click('#study-done'); assert.ok(q('.study-summary').textContent.includes('—'));
  click('[data-study-deck="vocabulary"]'); assert.ok(q('#study-extra'));
  const reload = setup(null, w.localStorage.getItem('sushi-type-learning-v1')); reload.click('#start-study'); reload.click('[data-study-deck="vocabulary"]'); assert.ok(reload.q('#study-extra'));
  reload.w.close(); w.close();
});

test('learning deadlines pause with dialogs/window changes, record timeout once and stop during feedback', () => {
  const { q, click, advance, w } = setup(); click('#start-study'); click('[data-study-deck="vocabulary"]'); click('#study-begin');
  advance(3); const left = q('#study-total-time').textContent;
  click('#help-button'); assert.ok(q('#study-pause')); advance(100); assert.equal(q('#study-total-time').textContent, left);
  click('#close-dialog'); click('#study-resume'); advance(1); assert.equal(Number(q('#study-total-time').textContent), Number(left) - 1);
  w.dispatchEvent(new w.Event('blur')); assert.ok(q('#study-pause')); advance(100); click('#study-resume');
  advance(25); assert.ok(q('.study-feedback.forgot').textContent.includes('時間切れ'));
  const first = JSON.parse(w.localStorage.getItem('sushi-type-learning-v1')); assert.equal(first.logs.length, 1); assert.equal(first.logs[0].timedOut, true);
  advance(100); assert.equal(JSON.parse(w.localStorage.getItem('sushi-type-learning-v1')).logs.length, 1); w.close();
});

test('learning no-cue check is editable, has no prefix oracle, and records the assessment separately', () => {
  const { q, click, advance, w } = setup(); click('#start-study'); click('[data-study-deck="vocabulary"]');
  q('#study-probe').checked = true; click('#study-begin'); assert.equal(q('#study-mask').textContent, '今回は頭文字・文字数の表示なし');
  q('#study-answer').value = 'apl'; q('#study-answer').dispatchEvent(new w.Event('input'));
  assert.equal(q('#study-answer').value, 'apl'); assert.equal(q('#study-feedback').textContent, '');
  q('#study-answer').value = 'APPLE'; advance(.2); q('#study-answer-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  assert.ok(q('.study-feedback.recalled')); const logs = JSON.parse(w.localStorage.getItem('sushi-type-learning-v1')).logs;
  assert.equal(logs[0].cue, 'none'); assert.equal(logs[0].kind, 'new'); assert.equal(logs[0].delayed, false); w.close();
});

test('custom Markdown escapes HTML, blocks malformed input, and preserves progress through explanation edits', () => {
  const { q, click, w } = setup(); click('#start-study'); click('#study-import');
  const markdown = '# 自分のノート\n## <img src=x onerror=alert(1)>\n答え: a\n解説: <script>alert(1)</script>';
  q('#study-markdown').value = '## 問題\n答え: a |'; q('#study-markdown').dispatchEvent(new w.Event('input')); assert.equal(q('#study-save').disabled, true);
  q('#study-markdown').value = markdown; q('#study-markdown').dispatchEvent(new w.Event('input')); assert.equal(q('#study-preview img'), null);
  click('#study-save'); click('[data-study-deck="custom"]'); click('#study-begin'); assert.equal(q('.study-prompt-panel img'), null);
  q('#study-answer').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
  assert.ok(q('.study-feedback.recalled')); assert.equal(q('.study-feedback script'), null);
  const original = JSON.parse(w.localStorage.getItem('sushi-type-learning-v1')).progress;
  click('#study-next'); click('#study-done'); click('#study-import');
  q('#study-markdown').value = markdown.replace('alert(1)</script>', 'alert(2)</script>'); q('#study-markdown').dispatchEvent(new w.Event('input')); click('#study-save');
  assert.deepEqual(JSON.parse(w.localStorage.getItem('sushi-type-learning-v1')).progress, original); w.close();
});
