import { createStudyUI } from './study.js';
import { COURSES, MODES, PRICES, TYPES, BONUS_EVERY, TypingGame, yen } from './core.js';
import { PHRASES } from './phrases.js';
import { sushi } from './sushi.js';

const $ = selector => document.querySelector(selector);
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const screen = $('#screen');
const defaults = { sound: true, translation: true, keyboard: false };
let settings = { ...defaults }, history = [], bests = {}, storageAvailable = true;
try {
  const saved = JSON.parse(localStorage.getItem('sushi-type-english-v2') || 'null');
  if (saved) {
    for (const key of Object.keys(defaults)) if (typeof saved.settings?.[key] === 'boolean') settings[key] = saved.settings[key];
    if (Array.isArray(saved.history)) history = saved.history.filter(row => COURSES[row.course] && MODES[row.mode] && Number.isFinite(row.score)).slice(0, 50);
    if (saved.bests && typeof saved.bests === 'object') bests = saved.bests;
  }
} catch { storageAvailable = false; }
let phase = 'title', mode = 'normal', course = 'easy', game = null;
let lastTick = 0, countdownTimer = null, displayedPhrase = null, audio = null, touchUsed = false;
let renderedIndex = -1, renderedTranslation = null;
let toastTimer;
const studyUI = createStudyUI({ screen, escape, sushi, sound, showTitle: title, toast });

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
function persist() {
  try { localStorage.setItem('sushi-type-english-v2', JSON.stringify({ settings, history, bests })); }
  catch { storageAvailable = false; toast('記録を保存できません。ブラウザのストレージ設定を確認してください。'); }
}
function initAudio() {
  if (!settings.sound) return Promise.resolve();
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return Promise.resolve();
    if (!audio) audio = new Context();
    if (audio.state === 'suspended') return audio.resume().catch(() => {});
  } catch { /* Sound is optional. */ }
  return Promise.resolve();
}
function sound(kind) {
  if (!settings.sound || !audio || audio.state !== 'running') return;
  try {
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = kind === 'miss' ? 'sawtooth' : kind === 'click' ? 'triangle' : 'sine';
    const duration = kind === 'click' ? 0.045 : kind === 'key' ? 0.035 : 0.16;
    const frequency = { click: 1700, key: 920, miss: 125, plate: 1350, bonus: 1760, start: 700 }[kind] || 700;
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    if (kind === 'click') oscillator.frequency.exponentialRampToValueAtTime(450, audio.currentTime + duration);
    if (kind === 'plate' || kind === 'bonus') oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.5, audio.currentTime + duration);
    gain.gain.setValueAtTime(kind === 'key' ? 0.018 : 0.035, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.start(); oscillator.stop(audio.currentTime + duration);
  } catch { /* Browsers without audio still play normally. */ }
}
function updateSoundStatus() {
  $('#sound-status').innerHTML = `<button id="sound-toggle" aria-pressed="${settings.sound}">${settings.sound ? '♪ SOUND ON' : '♪ SOUND OFF'}</button>`;
  $('#sound-toggle').onclick = () => { settings.sound = !settings.sound; initAudio(); persist(); updateSoundStatus(); };
}
function cancelCountdown() { clearInterval(countdownTimer); countdownTimer = null; }
function title() {
  cancelCountdown(); phase = 'title'; game = null;
  screen.className = 'screen title-screen';
  screen.innerHTML = `
    <div class="noren"><i></i><i></i><i></i><i></i><i></i><span>いらっしゃいませ</span></div>
    <div class="title-heading"><p class="edition">THE ENGLISH TYPING CHALLENGE</p><h1>寿司<span>タイプ</span><b>ENGLISH</b></h1><p class="title-tagline">思い出すほど、身につく。</p></div>
    <div class="title-sushi"><div class="hero-side">${sushi('shrimp', 2)}</div><div class="hero-center">${sushi('tuna', 3)}</div><div class="hero-side right">${sushi('salmon', 4)}</div></div>
    <button id="start-study" class="red-button title-start">学んで遊ぶ <small>LEARN</small><span>▶</span></button><button id="start-menu" class="plain-button arcade-entry">タイピングだけで遊ぶ →</button>
    <p class="start-hint">単語 → 熟語 → 例文。頭文字を頼りに思い出そう。</p>
    <div class="title-bottom"><span>手助けを使っても、次の復習につなげよう。</span></div>`;
  $('#start-study').onclick = () => { initAudio(); phase = 'study'; studyUI.open(); };
  $('#start-menu').onclick = () => { initAudio(); menu(); };
}
function menu() {
  cancelCountdown(); phase = 'menu'; game = null;
  screen.className = 'screen menu-screen';
  screen.innerHTML = `
    <div class="screen-heading"><span class="stamp">お品書き</span><div><p>CHOOSE YOUR COURSE</p><h1>コースを選んでください</h1></div></div>
    <div class="mode-tabs" role="group" aria-label="難易度">${Object.entries(MODES).map(([key, value]) => `<button data-mode="${key}" aria-pressed="${mode === key}" class="${mode === key ? 'selected' : ''}">${value.name}</button>`).join('')}</div>
    <p class="mode-description" id="mode-description">${MODES[mode].description}</p>
    <div class="course-list">${Object.entries(COURSES).map(([key, value]) => {
      const best = bests[`${key}:${mode}:keyboard`];
      return `<button class="course-card course-${key}" data-course="${key}" aria-label="${value.name} ${yen(value.price)}円コース ${value.seconds}秒"><span class="course-en">${value.en}</span><h2>${value.name}</h2><div class="course-art">${sushi(value.sushi, key === 'easy' ? 2 : key === 'normal' ? 3 : 5)}</div><strong>${yen(value.price)}<small>円コース</small></strong><span class="course-range">${value.subtitle} · ${value.range}文字</span><span class="course-time">制限時間 <b>${value.seconds}</b> 秒</span><span class="course-best">${Number.isFinite(best) ? `自己ベスト ${best < 0 ? '−' : '+'}${yen(best)}円` : 'はじめての記録をつくろう'}</span><span class="course-play">このコースで遊ぶ →</span></button>`;
    }).join('')}</div>
    <div class="menu-bottom"><button id="back-title" class="plain-button">‹ タイトルへ戻る</button><span>英字の大文字・小文字はどちらでもOK。空白はスペースキー。</span></div>`;
  screen.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => { mode = button.dataset.mode; menu(); });
  screen.querySelectorAll('[data-course]').forEach(button => button.onclick = () => { course = button.dataset.course; ready(); });
  $('#back-title').onclick = title;
}
function plateShelf(counts = {}) {
  return `<div class="plate-shelf">${PRICES.map((value, i) => `<div class="shelf-item"><div class="mini-sushi">${sushi(TYPES[i], i)}</div><span class="shelf-price">${yen(value)}円</span><b id="count-${value}">${counts[value] || 0}<small> 皿</small></b></div>`).join('')}</div>`;
}
function ready() {
  cancelCountdown();
  game = new TypingGame(course, mode, PHRASES[course]);
  touchUsed = false; displayedPhrase = null; renderedIndex = -1; phase = 'ready';
  screen.className = 'screen play-screen';
  screen.innerHTML = `
    <div class="game-hud"><div class="clock-box"><span>残り時間</span><strong id="time">${COURSES[course].seconds}</strong><small>秒</small></div><div class="combo-box"><div class="combo-label"><span>連続タイプ <b id="combo">0</b></span><small>30連打ごとに +2秒</small></div><div class="combo-track"><i id="combo-fill"></i><span>TIME BONUS</span></div></div><button id="pause-button" class="pause-button" aria-label="一時停止">Ⅱ</button></div>
    <div class="shop-wall"><span class="wall-label">ENGLISH ONLY</span><div class="wall-menu"><span>鮪</span><span>海老</span><span>玉子</span><span>鮭</span></div><span class="shop-mark">寿司<br>タイプ</span></div>
    <div class="conveyor"><div class="conveyor-back"></div><div id="moving-plate" class="moving-plate">${sushi('tuna', 3)}</div><div class="conveyor-front"></div><div class="rail-shadow"></div><div id="plate-gain" class="plate-gain"></div></div>
    <div class="counter"><div class="tea-cup" aria-hidden="true"><i></i><span>寿司</span></div><div class="sauce-dish" aria-hidden="true"></div><div id="eaten-stack" class="eaten-stack" aria-hidden="true"></div><div class="prompt-area" id="prompt-area"><p id="translation" class="translation"></p><div id="english-prompt" class="english-prompt" aria-label="入力する英文"></div><p class="input-note" id="input-note">半角英数で入力 · ミスしても消さずに続けてOK</p></div><div id="bonus-notice" class="bonus-notice" aria-live="polite"></div></div>
    <div class="plate-time"><i id="plate-time-fill"></i></div>
    <div class="game-status"><span>${COURSES[course].name} ${yen(COURSES[course].price)}円コース <b>【${MODES[mode].name}】</b></span><strong><span id="score">0</span> 円分 <small>ゲット！</small></strong></div>
    ${plateShelf()}
    <div id="virtual-keyboard" class="virtual-keyboard" ${settings.keyboard ? '' : 'hidden'}>${['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].map(row => `<div>${[...row].map(key => `<button data-key="${key}" aria-label="${key}">${key}</button>`).join('')}</div>`).join('')}<div><button data-key=" " class="space-key" aria-label="スペース">SPACE</button></div></div>
    <div id="game-overlay" class="game-overlay"><div class="overlay-card"><span class="overlay-kicker">${COURSES[course].en} COURSE · ${MODES[mode].name}</span><h2>準備はいいですか？</h2><p>お皿の英文を、最後まで打ち切ろう。</p><button id="start-game" class="red-button">スペース / Enter で開始 <span>▶</span></button><p class="overlay-note">日本語入力はOFFにしてください。</p><button id="ready-back" class="plain-button">コース選択へ戻る</button></div></div>`;
  $('#start-game').onclick = startCountdown;
  $('#ready-back').onclick = menu;
  $('#pause-button').onclick = pause;
  screen.querySelectorAll('[data-key]').forEach(button => {
    button.onpointerdown = event => { event.preventDefault(); touchUsed = true; typeKey(button.dataset.key); };
  });
  draw();
}
function startCountdown() {
  if (phase !== 'ready') return;
  initAudio(); phase = 'countdown';
  let count = 3;
  $('#game-overlay').innerHTML = '<div class="countdown-number">3</div>';
  sound('start');
  countdownTimer = setInterval(() => {
    count--;
    if (count === 0) {
      cancelCountdown(); game.start(); phase = 'playing'; lastTick = performance.now();
      $('#game-overlay').hidden = true;
      $('#announcement').textContent = 'スタート。' + game.phrase.text;
    } else { $('.countdown-number').textContent = count; sound('start'); }
  }, 1000);
}
function syncTime(now = performance.now()) {
  if (phase !== 'playing') return;
  game.advance(Math.max(0, (now - lastTick) / 1000)); lastTick = now;
  if (game.status === 'ended') finish();
}
function typeKey(key) {
  if (phase !== 'playing') return;
  syncTime();
  if (phase !== 'playing') return;
  const result = game.type(key);
  if (result.kind === 'ignored') return;
  sound(result.kind === 'key' ? 'key' : result.kind);
  if (result.kind === 'miss') {
    $('#prompt-area').classList.remove('mistake');
    void $('#prompt-area').offsetWidth;
    $('#prompt-area').classList.add('mistake');
    $('#announcement').textContent = mode === 'accuracy' ? 'ミスタイプ。入力が最初に戻ります。' : 'ミスタイプ';
  }
  if (result.kind === 'plate') {
    const gain = $('#plate-gain'); gain.textContent = `+${yen(result.value)}円`;
    gain.classList.remove('pop'); void gain.offsetWidth; gain.classList.add('pop');
    $('#announcement').textContent = `${result.value}円のお皿をゲット。次は ${game.phrase.text}`;
  }
  if (result.bonus) {
    sound('bonus'); $('#bonus-notice').textContent = 'TIME BONUS +2秒';
    setTimeout(() => { const notice = $('#bonus-notice'); if (notice) notice.textContent = ''; }, 1300);
  }
  if (game.status === 'ended') finish(); else draw();
}
function draw() {
  if (!game || !['ready', 'countdown', 'playing', 'paused'].includes(phase)) return;
  $('#time').textContent = Math.ceil(game.remaining);
  $('.clock-box').classList.toggle('urgent', game.remaining <= 10);
  $('#combo').textContent = game.combo;
  $('#combo-fill').style.width = `${game.combo % BONUS_EVERY / BONUS_EVERY * 100}%`;
  $('#score').textContent = yen(game.score);
  const progress = game.plateElapsed / game.plateDuration;
  $('#moving-plate').style.left = `${105 - progress * 120}%`;
  $('#plate-time-fill').style.width = `${(1 - progress) * 100}%`;
  $('#plate-time-fill').classList.toggle('danger', progress > 0.75);
  const newPhrase = displayedPhrase !== game.phrase;
  if (newPhrase) {
    displayedPhrase = game.phrase;
    const tier = PRICES.indexOf(game.value);
    $('#moving-plate').innerHTML = sushi(TYPES[tier], tier) + `<span class="moving-price">${game.value}円</span>`;
  }
  if (newPhrase || renderedTranslation !== settings.translation) {
    $('#translation').textContent = settings.translation ? game.phrase.translation : '';
    renderedTranslation = settings.translation;
  }
  if (newPhrase || renderedIndex !== game.index) $('#english-prompt').innerHTML = `<span class="typed">${escape(game.phrase.text.slice(0, game.index))}</span><span class="next-letter">${escape(game.phrase.text[game.index]).replace(' ', '␣')}</span><span>${escape(game.phrase.text.slice(game.index + 1))}</span>`;
  renderedIndex = game.index;
  for (const price of PRICES) {
    const count = $(`#count-${price}`);
    if (count.dataset.count !== String(game.counts[price])) {
      count.innerHTML = `${game.counts[price]}<small> 皿</small>`;
      count.dataset.count = game.counts[price];
    }
  }
  const eaten = Object.values(game.counts).reduce((sum, n) => sum + n, 0);
  const stack = $('#eaten-stack');
  if (stack.dataset.count !== String(eaten)) {
    stack.innerHTML = Array.from({ length: Math.min(8, eaten) }, (_, i) => `<i style="bottom:${i * 5}px"></i>`).join('');
    stack.dataset.count = eaten;
  }
}
function pause(reason = 'manual') {
  if (phase !== 'playing') return;
  syncTime(); if (phase !== 'playing') return;
  game.pause(); phase = 'paused';
  $('#game-overlay').hidden = false;
  $('#game-overlay').innerHTML = `<div class="overlay-card"><span class="overlay-kicker">TAKE A LITTLE BREAK</span><h2>一時停止中</h2><p>${reason === 'ime' ? '日本語入力をOFFにして、半角英数に切り替えてください。' : 'お寿司も、時計も止まっています。'}</p><button id="resume" class="red-button">続ける <span>▶</span></button><button id="end-game" class="plain-button">ここで終了する</button></div>`;
  $('#resume').onclick = resume;
  $('#end-game').onclick = () => { game.end('exit'); finish(); };
  $('#resume').focus();
}
function resume() {
  if (phase !== 'paused' || $('#dialog').open) return;
  game.resume(); phase = 'playing'; lastTick = performance.now();
  $('#game-overlay').hidden = true;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}
function finish() {
  if (phase === 'result') return;
  phase = 'result'; cancelCountdown();
  const result = { ...game.result(), at: Date.now(), touch: touchUsed };
  const bestKey = `${course}:${mode}:${touchUsed ? 'touch' : 'keyboard'}`;
  const eligible = result.reason !== 'exit' && result.correct > 0;
  const isBest = eligible && (!Number.isFinite(bests[bestKey]) || result.net > bests[bestKey]);
  if (isBest) bests[bestKey] = result.net;
  if (result.correct + result.misses > 0) { history.unshift(result); history = history.slice(0, 50); persist(); }
  const reason = { time: '制限時間終了', escaped: 'お皿が流れてしまいました', miss: 'ミスタイプで終了', exit: '途中終了' }[result.reason];
  screen.className = 'screen result-screen';
  screen.innerHTML = `
    <div class="result-heading"><span class="result-kicker">${COURSES[course].name} ${yen(COURSES[course].price)}円コース【${MODES[mode].name}】</span><h1>結果発表</h1><p>${reason}</p></div>
    <div class="receipt-intro">${yen(COURSES[course].price)}円のお支払いで、<br><strong>${yen(result.score)}円分</strong>のお寿司を食べました。</div>
    <div class="net-result ${result.net >= 0 ? 'profit' : 'loss'}"><b>${yen(result.net)}</b><span>円分 ${result.net >= 0 ? 'お得でした！' : '足りませんでした…'}</span>${isBest ? '<small class="new-best">NEW PERSONAL BEST</small>' : ''}</div>
    <div class="result-details"><div><span>正しく打ったキー</span><strong>${result.correct}<small> 回</small></strong></div><div><span>平均キータイプ数</span><strong>${result.speed.toFixed(1)}<small> 回 / 秒</small></strong></div><div><span>ミスタイプ</span><strong>${result.misses}<small> 回</small></strong></div><div><span>正確率</span><strong>${result.accuracy.toFixed(1)}<small> %</small></strong></div><div><span>食べたお皿 / 逃したお皿</span><strong>${result.plates}<small> 皿 / </small>${result.skipped}<small> 皿</small></strong></div><div><span>最高連続 / 時間ボーナス</span><strong>${result.maxCombo}<small> 打 / +</small>${result.bonus}<small> 秒</small></strong></div></div>
    <div class="result-actions"><button id="retry" class="red-button">もう一回！ <small>Space / Enter</small></button><button id="choose-course" class="wood-button">コースを選び直す</button><button id="copy-result" class="plain-button">結果をコピー</button></div>
    ${plateShelf(result.counts)}<p class="result-note">${touchUsed ? '画面キーボードでの入力を含む記録です。' : 'キーボード入力の記録です。'}${result.reason === 'exit' ? '途中終了は自己ベストに含まれません。' : ''}${storageAvailable ? '自己ベストと直近50回の記録を、このブラウザに保存します。' : 'このブラウザには記録を保存できません。'}</p>`;
  $('#retry').onclick = ready;
  $('#choose-course').onclick = menu;
  $('#copy-result').onclick = async () => {
    const text = `寿司タイプ ENGLISH｜${COURSES[course].name} ${yen(COURSES[course].price)}円【${MODES[mode].name}】\n${yen(result.score)}円分食べて${yen(result.net)}円分${result.net >= 0 ? 'お得' : '不足'}！ ${result.speed.toFixed(1)}打/秒・ミス${result.misses}回\n${location.origin}`;
    try { await navigator.clipboard.writeText(text); toast('結果をコピーしました。'); }
    catch { toast('コピーできませんでした。ブラウザのクリップボード権限をご確認ください。'); }
  };
}
function openDialog(title, html) {
  if (phase === 'study') studyUI.pause();
  if (phase === 'playing') pause();
  if (phase === 'countdown') ready();
  $('#dialog-title').textContent = title;
  $('#dialog-body').innerHTML = html;
  if (!$('#dialog').open) $('#dialog').showModal();
}
$('#help-button').onclick = () => openDialog('遊び方', `
  <p class="dialog-lead">学習モードは、頭文字と空欄から思い出してタイプ。</p><p class="small-note">お手軽＝単語・お勧め＝短い組み合わせ・高級＝例文。同じ位置で2回ミスすると1文字表示されます。制限時間は答え合わせ中に止まり、追加ヒントや時間切れの問題は短い間隔で復習します。以下は「タイピングだけで遊ぶ」のルールです。</p>
  <ol class="help-list"><li><b>コースと難易度を選ぶ</b><p>3,000円・5,000円・10,000円の3コース。金額はゲームの目標です。</p></li><li><b>表示された英語を、そのまま入力</b><p>半角英数で1文字ずつ。大文字・小文字はどちらでもOK。単語の間はスペースを打ちます。Enterでの送信やBackspaceでの修正は不要です。</p></li><li><b>打ち切って、お皿をゲット</b><p>流れてしまうとそのお皿の得点は入りません。30文字連続でミスなく打つと、残り時間が2秒増えます。</p></li><li><b>目指せ、元取り！</b><p>食べたお皿の合計 − コース金額がお得になった金額です。結果ではキータイプ数やミスも確認できます。</p></li></ol>
  <div class="help-modes">${Object.values(MODES).map(value => `<p><b>${value.name}</b><span>${value.description}</span></p>`).join('')}</div><p class="small-note">Escで一時停止。タブやウィンドウを離れたときも自動停止します。スマホでは設定から画面キーボードをONにしてください。</p>`);
$('#settings-button').onclick = () => {
  openDialog('設定', `<div class="settings-list"><label><span><b>サウンド</b><small>打鍵音・ミス音・お皿を取った音</small></span><input type="checkbox" id="setting-sound" ${settings.sound ? 'checked' : ''}></label><label><span><b>日本語の意味を表示</b><small>英文の上に日本語を表示します</small></span><input type="checkbox" id="setting-translation" ${settings.translation ? 'checked' : ''}></label><label><span><b>画面キーボード</b><small>スマホ・タブレットでタップして遊べます</small></span><input type="checkbox" id="setting-keyboard" ${settings.keyboard ? 'checked' : ''}></label></div><p class="small-note">設定はこのブラウザに保存されます。以前の暗記版データは変更しません。</p>`);
  for (const key of Object.keys(defaults)) $(`#setting-${key}`).onchange = event => {
    settings[key] = event.target.checked; persist(); updateSoundStatus(); initAudio();
    if ($('#virtual-keyboard')) $('#virtual-keyboard').hidden = !settings.keyboard;
    draw();
  };
};
$('#history-button').onclick = () => openDialog('これまでの記録', history.length ? `<p class="small-note">直近50回。キーボードとタッチの自己ベストは別に集計します。</p><div class="history-list">${history.map(row => `<article><div><b>${COURSES[row.course].name} ${yen(COURSES[row.course].price)}円</b><span>${MODES[row.mode].name} · ${new Date(row.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${row.touch ? ' · タッチ' : ''}${row.reason === 'exit' ? ' · 途中終了' : ''}</span></div><strong class="${row.net >= 0 ? 'positive' : ''}">${row.net < 0 ? '−' : '+'}${yen(row.net)}<small> 円</small></strong></article>`).join('')}</div>` : '<div class="history-empty">まだ記録がありません。<br>まずはひと皿、食べてみましょう。</div>');
$('#close-dialog').onclick = () => $('#dialog').close();
$('#home-link').onclick = event => {
  event.preventDefault();
  if (phase === 'study' && !studyUI.leave()) return;
  if (phase === 'playing') pause();
  if (game && ['paused', 'countdown'].includes(phase) && !confirm('タイトルへ戻りますか？今回のプレイは終了します。')) return;
  title();
};
document.addEventListener('keydown', event => {
  if (phase === 'study') { if (!$('#dialog').open) studyUI.handleKey(event); return; }
  if ($('#dialog').open || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (event.isComposing || event.keyCode === 229) {
    if (phase === 'playing') pause('ime');
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (phase === 'playing') pause(); else if (phase === 'paused') resume();
    return;
  }
  if (event.target.closest?.('header, footer, dialog, .cabinet-foot')) return;
  if (!['playing', 'paused'].includes(phase) && event.target.closest?.('button, a, input')) return;
  if ([' ', 'Enter'].includes(event.key) && ['title', 'ready', 'result'].includes(phase)) {
    event.preventDefault(); initAudio();
    if (phase === 'title') { phase = 'study'; studyUI.open(); } else if (phase === 'ready') startCountdown(); else ready();
    return;
  }
  if (phase === 'playing' && event.key.length === 1) { event.preventDefault(); typeKey(event.key); }
});
document.addEventListener('compositionstart', () => { if (phase === 'playing') pause('ime'); });
function onLeave() {
  if (phase === 'study') { studyUI.pause(); return; }
  if (phase === 'playing') pause();
  else if (phase === 'countdown') ready();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) onLeave(); });
window.addEventListener('blur', onLeave);
function frame(now) {
  if (phase === 'study') studyUI.frame(now);
  if (phase === 'playing') { syncTime(now); if (phase === 'playing') draw(); }
  requestAnimationFrame(frame);
}
// Capture dynamic menu buttons once; touch keys already have their own sound.
document.addEventListener('click', event => {
  const button = event.target.closest?.('button');
  if (!button || button.disabled || button.id === 'sound-toggle' || button.hasAttribute('data-key') || !settings.sound) return;
  initAudio().then(() => sound('click'));
}, true);
updateSoundStatus(); title(); requestAnimationFrame(frame);
