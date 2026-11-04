import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const root = fileURLToPath(new URL('../', import.meta.url));

function setup(saved = null, learningSaved = null, mockAudio = false) {
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
  const audioEvents = [];
  if (mockAudio) w.AudioContext = class {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createOscillator() { const item = { frequency: { setValueAtTime: value => item.hz = value, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() { audioEvents.push(item.hz); }, stop() {} }; return item; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  };
  w.confirm = () => true;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  if (learningSaved) w.localStorage.setItem('sushi-type-learning-v1', learningSaved);
  if (saved) w.localStorage.setItem('sushi-type-english-v2', saved);
  w.eval(['core.js', 'phrases.js', 'sushi.js', 'study-core.js', 'activity.js', 'study-cards.js', 'study.js', 'sound.js', 'app.js'].map(file => readFileSync(root + 'dist/' + file, 'utf8').replace(/^import .+;\n/gm, '').replace(/export /g, '')).join('\n'));
  const q = selector => w.document.querySelector(selector);
  const click = selector => { assert.ok(q(selector), selector); q(selector).click(); };
  const key = (key, extras = {}) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extras }));
  const advance = seconds => { now += seconds * 1000; raf(now); };
  const countDown = () => { for (let i = 0; i < 3; i++) { now += 1000; for (const callback of [...intervals.values()]) callback(); } };
  const phrase = () => q('#english-prompt').textContent.replace('␣', ' ');
  return { w, dom, q, click, key, advance, countDown, phrase, audioEvents };
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

test('learning flows from each completion automatically, retries after two cards and preserves schedules', () => {
  const { q, click, advance, w } = setup();
  click('#start-study'); assert.equal(w.document.querySelectorAll('[data-study-deck]').length, 3);
  click('[data-study-deck="vocabulary"]'); assert.equal(q('.study-prep').open, false);
  click('#study-begin'); assert.equal(q('#study-mask').textContent, 'a____');
  const type = text => { for (const key of text) { advance(.03); q('#study-answer').dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); } };
  type('axy'); assert.equal(q('#study-mask').textContent, 'ap___'); assert.equal(q('#study-answer').value, 'a');
  type('pple'); assert.ok(q('.study-feedback.assisted'));
  const storage = () => JSON.parse(w.localStorage.getItem('sushi-type-learning-v1'));
  assert.equal(storage().logs[0].outcome, 'assisted'); const due = storage().progress['learn-word:apple'].due;
  advance(.3); assert.equal(q('#study-mask').textContent, 'b____');
  type('break'); assert.equal(q('#study-mask').textContent, 'd_______'); assert.equal(q('#study-feedback').textContent, '');
  type('decision'); assert.ok(q('.study-question-kind').textContent.includes('もう一度')); type('apple');
  assert.equal(storage().progress['learn-word:apple'].due, due); assert.equal(storage().logs.at(-1).kind, 'retry');
  assert.equal(storage().logs.length, 4); assert.ok(q('.study-last-outcome').textContent.includes('apple'));
  click('#study-stop'); click('#study-finish-now'); assert.ok(q('.study-result'));
  assert.equal(w.document.querySelectorAll('.study-recap').length, 3);
  click('#study-again'); assert.ok(q('#study-answer')); assert.equal(q('#study-feedback').textContent, '');
  const reload = setup(null, w.localStorage.getItem('sushi-type-learning-v1')); reload.click('#start-study'); reload.click('[data-study-deck="vocabulary"]'); assert.ok(reload.q('#study-begin'));
  reload.w.close(); w.close();
});

test('learning deadlines pause with dialogs/window changes, record timeout once and stop during feedback', () => {
  const { q, click, advance, w } = setup(); click('#start-study'); click('[data-study-deck="vocabulary"]'); click('#study-begin');
  advance(1); const left = q('#study-total-time').textContent;
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
  assert.equal(q('#study-feedback').textContent, ''); assert.ok(q('#study-answer')); const logs = JSON.parse(w.localStorage.getItem('sushi-type-learning-v1')).logs;
  assert.equal(logs[0].cue, 'none'); assert.equal(logs[0].kind, 'new'); assert.equal(logs[0].delayed, false); w.close();
});

test('custom Markdown escapes HTML, blocks malformed input, and preserves progress through explanation edits', () => {
  const { q, click, w } = setup(); click('#start-study'); click('#study-import');
  const markdown = '# 自分のノート\n## <img src=x onerror=alert(1)>\n答え: a\n解説: <script>alert(1)</script>';
  q('#study-markdown').value = '## 問題\n答え: a |'; q('#study-markdown').dispatchEvent(new w.Event('input')); assert.equal(q('#study-save').disabled, true);
  q('#study-markdown').value = markdown; q('#study-markdown').dispatchEvent(new w.Event('input')); assert.equal(q('#study-preview img'), null);
  click('#study-save'); click('[data-study-deck="custom"]'); click('#study-begin'); assert.equal(q('.study-prompt-panel img'), null);
  q('#study-answer').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
  assert.equal(q('#study-feedback').textContent, ''); assert.equal(q('.study-prompt-panel script'), null);
  const original = JSON.parse(w.localStorage.getItem('sushi-type-learning-v1')).progress;
  click('#study-stop'); click('#study-finish-now'); click('#study-done'); click('#study-import');
  q('#study-markdown').value = markdown.replace('alert(1)</script>', 'alert(2)</script>'); q('#study-markdown').dispatchEvent(new w.Event('input')); click('#study-save');
  assert.deepEqual(JSON.parse(w.localStorage.getItem('sushi-type-learning-v1')).progress, original); w.close();
});

test('automatic feedback can be held or paused without skipping when the window is hidden', () => {
  const { q, click, advance, w } = setup(); click('#start-study'); click('[data-study-deck="vocabulary"]'); click('#study-begin');
  const type = text => { for (const key of text) q('#study-answer').dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); };
  type('axypple'); assert.ok(q('.study-feedback.assisted'));
  w.dispatchEvent(new w.Event('blur')); assert.ok(q('#study-pause')); advance(10); assert.ok(q('.study-feedback.assisted'));
  click('#study-resume'); advance(.2); assert.ok(q('.study-feedback.assisted')); advance(.1); assert.equal(q('#study-mask').textContent, 'b____');
  click('#study-reveal'); assert.ok(q('.study-feedback.forgot')); click('#study-hold'); advance(20); assert.ok(q('.study-feedback.forgot'));
  click('#study-next'); assert.equal(q('#study-mask').textContent, 'd_______'); w.close();
});
test('leaving during automatic feedback never advances an old round in a new screen', () => {
  const { q, click, advance, w } = setup(); click('#start-study'); click('[data-study-deck="vocabulary"]'); click('#study-begin');
  click('#study-reveal'); click('#home-link'); assert.ok(q('.title-screen')); advance(5); assert.ok(q('.title-screen'));
  click('#start-study'); assert.ok(q('.study-menu')); advance(5); assert.ok(q('.study-menu')); w.close();
});

test('learning shows length-priced dishes, changes tiers, and times out at three seconds', () => {
  const { q, click, advance, w } = setup(); click('#start-study'); click('[data-study-deck="vocabulary"]'); click('#study-begin');
  assert.equal(q('#study-dish-price').textContent, '180円'); assert.equal(q('#study-plate-time').textContent, '3.0');
  const type = text => { for (const key of text) q('#study-answer').dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); };
  type('apple'); assert.ok(q('#study-score').textContent.includes('180'));
  type('break'); assert.equal(q('#study-dish-price').textContent, '240円');
  advance(2.9); assert.equal(q('#study-plate-time').textContent, '0.1'); assert.ok(q('#study-plate-time').classList.contains('study-time-urgent'));
  advance(.1); assert.ok(q('.study-feedback.forgot')); assert.equal(q('#study-plate-time').textContent, '0.0');
  const left = Number(q('#study-total-time').textContent); advance(.8); assert.ok(Number(q('#study-total-time').textContent) <= left);
  const saved = JSON.parse(w.localStorage.getItem('sushi-type-learning-v1')); assert.equal(saved.logs[0].price, 180); assert.equal(saved.logs[2].points, 0); w.close();
});
test('no-cue checks do not leak answer length through a dish price badge', () => {
  const { q, click, w } = setup(); click('#start-study'); click('[data-study-deck="vocabulary"]'); q('#study-probe').checked = true; click('#study-begin');
  assert.equal(q('#study-dish-price').textContent, '完答で加算'); assert.equal(q('.study-plate .sushi-art').dataset.value, ''); w.close();
});
test('menu click sound works on the first gesture and dynamic buttons, and respects sound off', async () => {
  const { click, audioEvents, w } = setup(null, null, true);
  click('#start-study'); await new Promise(resolve => setImmediate(resolve)); assert.equal(audioEvents.filter(hz => hz === 1700).length, 1);
  click('[data-study-deck="vocabulary"]'); await new Promise(resolve => setImmediate(resolve)); assert.equal(audioEvents.filter(hz => hz === 1700).length, 2);
  click('#sound-toggle'); click('#study-back'); await new Promise(resolve => setImmediate(resolve)); assert.equal(audioEvents.filter(hz => hz === 1700).length, 2); w.close();
});

test('volume and sound previews work, survive reload and honor mute and zero volume', async () => {
  const { q, click, audioEvents, w } = setup(null, null, true);
  const settle = () => new Promise(resolve => setImmediate(resolve));
  click('#settings-button'); await settle();
  assert.equal(q('#setting-volume').value, '35');
  const before = audioEvents.length; click('[data-sound-preview="plate"]'); await settle();
  assert.deepEqual(audioEvents.slice(before), [523.25, 659.25, 1046.5]); // No extra button click over a preview.
  q('#setting-volume').value = '20'; q('#setting-volume').dispatchEvent(new w.Event('input'));
  assert.equal(q('#sound-volume-value').textContent, '20%');
  const saved = w.localStorage.getItem('sushi-type-english-v2'); assert.equal(JSON.parse(saved).settings.volume, .2);
  q('#setting-volume').value = '0'; q('#setting-volume').dispatchEvent(new w.Event('input'));
  assert.equal(q('[data-sound-preview="plate"]').disabled, true);
  const silentAt = audioEvents.length; click('[data-sound-preview="plate"]'); await settle(); assert.equal(audioEvents.length, silentAt);
  q('#setting-volume').value = '20'; q('#setting-volume').dispatchEvent(new w.Event('input'));
  q('#setting-sound').checked = false; q('#setting-sound').dispatchEvent(new w.Event('change'));
  assert.equal(q('[data-sound-preview="promote"]').disabled, true);
  click('#close-dialog'); click('#start-study'); await settle(); assert.equal(audioEvents.length, silentAt);
  const reload = setup(saved); reload.click('#settings-button'); assert.equal(reload.q('#setting-volume').value, '20');
  reload.w.close(); w.close();
});

test('learning celebrates three clean plates immediately and clears the streak after an assisted answer', async () => {
  const { q, click, audioEvents, w } = setup(null, null, true);
  click('#start-study'); click('[data-study-deck="vocabulary"]'); click('#study-begin');
  const type = text => { for (const key of text) q('#study-answer').dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); };
  type('apple'); type('break'); type('decision');
  assert.ok(q('#study-streak').textContent.includes('3連続')); assert.equal(w.document.querySelectorAll('.study-streak-dots .filled').length, 3);
  assert.ok(q('.study-last-outcome.study-milestone').textContent.includes('3連続！')); assert.equal(q('#study-feedback').textContent, '');
  await new Promise(resolve => setImmediate(resolve)); assert.equal(audioEvents.filter(hz => hz === 880).length, 1);
  type('q~~'); assert.ok(q('#study-answer').classList.contains('study-input-miss')); assert.ok(q('#study-hint-text').textContent.includes('2回ミス'));
  const logs = JSON.parse(w.localStorage.getItem('sushi-type-learning-v1')).logs; assert.equal(logs.length, 3);
  type('uestion'); assert.ok(q('.study-feedback.assisted')); assert.ok(q('#study-streak').textContent.includes('0連続'));
  click('#study-stop'); click('#study-finish-now'); assert.ok(q('.study-result-caption').textContent.includes('3皿'));
  w.close();
});

test('learning calendar migrates old logs, updates after each response, and stays stable after reload', () => {
  const at = Date.now();
  const logs = [ { id: 'old-a', outcome: 'recalled', at, kind: 'new' }, { id: 'old-b', outcome: 'assisted', at, kind: 'extra' } ];
  const { q, click, w } = setup(null, JSON.stringify({ progress: {}, logs }));
  click('#start-study'); assert.equal(q('[data-activity-today]').textContent, '2回');
  click('[data-study-deck="vocabulary"]'); click('#study-begin');
  for (const key of 'apple') q('#study-answer').dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const saved = w.localStorage.getItem('sushi-type-learning-v1'); assert.equal(Object.values(JSON.parse(saved).activity)[0].attempts, 3);
  click('#study-stop'); click('#study-finish-now'); assert.ok(q('.activity-session-note').textContent.includes('3回'));
  click('#study-done'); assert.equal(q('[data-activity-today]').textContent, '3回');
  const reload = setup(null, saved); reload.click('#start-study'); assert.equal(reload.q('[data-activity-today]').textContent, '3回');
  reload.w.close(); w.close();
});
test('daily aggregate is kept when detailed logs roll off and is available from the shared history button', () => {
  const date = new Date(); const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const stored = { progress: {}, logs: [], activity: { [key]: { attempts: 3500, correct: 3000, assisted: 400, forgot: 100 } } };
  const { q, click, w } = setup(null, JSON.stringify(stored));
  click('#history-button'); assert.ok(q('#dialog').open); assert.equal(q('#dialog [data-activity-today]').textContent, '3,500回');
  assert.ok(q('.activity-calendar svg').getAttribute('aria-label').includes('3500回')); assert.equal(w.document.querySelectorAll('.activity-recent tbody tr').length, 7);
  click('#close-dialog'); click('#start-study'); click('[data-study-deck="vocabulary"]'); click('#study-begin'); click('#study-reveal');
  const saved = JSON.parse(w.localStorage.getItem('sushi-type-learning-v1')); assert.equal(saved.activity[key].attempts, 3501); assert.equal(saved.logs.length, 1); w.close();
});
