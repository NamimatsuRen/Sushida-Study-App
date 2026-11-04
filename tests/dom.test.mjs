import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const root = fileURLToPath(new URL('../', import.meta.url));

function setup(saved = null) {
  const dom = new JSDOM(readFileSync(root + 'dist/index.html', 'utf8'), { url: 'https://example.test', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  let now = 0, raf, intervalId = 0;
  const intervals = new Map();
  w.performance.now = () => now;
  w.requestAnimationFrame = callback => { raf = callback; return 1; };
  w.setInterval = callback => { intervals.set(++intervalId, callback); return intervalId; };
  w.clearInterval = id => intervals.delete(id);
  w.setTimeout = () => 1; w.clearTimeout = () => {};
  w.confirm = () => true;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  if (saved) w.localStorage.setItem('sushi-type-english-v2', saved);
  w.eval(['core.js', 'phrases.js', 'sushi.js', 'app.js'].map(file => readFileSync(root + 'dist/' + file, 'utf8').replace(/^import .+;\n/gm, '').replace(/export /g, '')).join('\n'));
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
  assert.ok(q('.title-screen')); key(' '); assert.equal(w.document.querySelectorAll('[data-course]').length, 3);
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
