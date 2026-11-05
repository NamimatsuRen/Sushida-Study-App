import { SPECIES, PHRASES, VISITORS, STORAGE_KEY, CAPACITY, JOB_SECONDS, newState, restoreState, profile, level, visitorCount, visitors, buy, feed, applyJob, applyQuiz, TypingJob, normalize, rng } from './model.js';
import { creatureArt, habitatArt } from './art.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = value => value.toLocaleString('ja-JP');
let state = newState(), view = 'aquarium', filter = 'all', selected = 'r1', job = null, quiz = null, lastFrame = 0, toastTimer;
let storageFailed = false;
try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) { const restored = restoreState(JSON.parse(raw)); if (restored) state = restored; else storageFailed = true; } } catch { storageFailed = true; }
selected = state.residents[0]?.id;
const positions = [[47,38],[23,23],[74,26],[26,60],[66,61],[49,14],[83,46],[12,44],[46,65],[69,9],[12,12],[83,68]];
const themes = { lagoon: ['はじまりのラグーン', 'いろんな個性が、これから育ちます。'], clear: ['すみわたる青の水族館', '正確な指先に、ロボットたちも興味しんしん。'], current: ['すいすい海流の水族館', '軽やかなタイピングで、潮もお客さんも活発に。'], cosmic: ['ひらめき宇宙水族館', '思い出したことばを聞きつけ、宇宙からもご来館。'] };
let audio;
function sound(kind) {
  if (!state.sound) return;
  try {
    const Context = window.AudioContext || window.webkitAudioContext; if (!Context) return;
    audio ||= new Context(); if (audio.state !== 'running') void audio.resume().catch(() => {});
    const notes = { click: [620], key: [460], miss: [140], buy: [523,659,784], care: [440,659], grow: [440,554,659,880], end: [523,659,784,1047] }[kind] || [620];
    notes.forEach((frequency, index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + index * .055;
      oscillator.type = kind === 'miss' ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(kind === 'key' ? .012 : .035, at); gain.gain.exponentialRampToValueAtTime(.0001, at + (kind === 'key' ? .035 : .18));
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at); oscillator.stop(at + .2);
    });
  } catch { /* Sound is optional. */ }
}
function toast(text) { clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').classList.add('visible'); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2800); }
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { toast('端末に保存できません。ページを閉じる前に、記録を書き出してください。'); } }
function commit(next, message) { state = next; save(); render(); if (message) toast(message); }
function openDialog(html) { $('#dialog-content').innerHTML = html; if (!$('#dialog').open) $('#dialog').showModal(); }
function coin(amount) { return `<span class="coin-icon" aria-hidden="true">G</span><b>${number(amount)}</b>`; }
function shopCard(species) {
  const owned = state.residents.filter(r => r.species === species.id).length;
  return `<article class="shop-card"><div class="shop-art" style="--species-color:${species.color}">${creatureArt(species.id)}<span>${species.category === 'ocean' ? '海のなかま' : 'ちょっと不思議'}</span></div><div class="shop-body"><div class="shop-name"><h3>${species.name}</h3>${owned ? `<span>在館 ${owned}</span>` : ''}</div><p>${species.description}</p><span class="affinity-tag">${species.tag}</span><div class="shop-purchase"><span class="shop-price">${coin(species.price)}</span><button class="button button-small" data-action="buy" data-id="${species.id}" ${state.coins < species.price || state.residents.length >= CAPACITY ? 'disabled' : ''}>迎える ＋</button></div></div></article>`;
}
function traitPanel() {
  const p = profile(state);
  return `<section class="panel traits-panel"><div class="panel-title"><span>水族館の個性</span><button class="icon-button" data-action="traits" aria-label="個性のしくみ">?</button></div><div class="trait"><div><span>指先の正確さ</span><b>${p.accuracy === null ? '—' : Math.round(p.accuracy * 100) + '<small>%</small>'}</b></div><i><em style="width:${p.accuracy === null ? 0 : p.accuracy * 100}%"></em></i></div><div class="trait trait-blue"><div><span>タイピングの速さ</span><b>${p.wpm ? Math.round(p.wpm) + '<small>WPM</small>' : '—'}</b></div><i><em style="width:${p.speed * 100}%"></em></i></div><div class="trait trait-purple"><div><span>思い出せた表現</span><b>${p.remembered}<small> / ${p.encountered}</small></b></div><i><em style="width:${p.encountered ? p.remembered / p.encountered * 100 : 0}%"></em></i></div><p class="panel-note">${p.encountered ? '「思い出しチェック」で、ことばを取り出してみよう。' : 'おしごとをすると、あなたらしさが育ちます。'}</p></section>`;
}
function residentPanel() {
  const r = state.residents.find(r => r.id === selected) || state.residents[0];
  if (!r) return '<section class="panel"><h3>最初の仲間を迎えよう。</h3><button class="button" data-action="nav" data-view="shop">ショップへ →</button></section>';
  const species = SPECIES.find(s => s.id === r.species), stage = level(r), limit = stage === 1 ? 60 : 140;
  const progress = stage === 3 ? 100 : r.growth / limit * 100;
  return `<section class="panel care-panel"><div class="panel-title"><span>なかまをお世話</span><span class="level-badge">Lv.${stage}</span></div><div class="care-creature" style="--species-color:${species.color}">${creatureArt(r.species, r.seed)}</div><h3>${species.name}</h3><p>${stage === 1 ? 'まだちいさな、かけだしさん。' : stage === 2 ? 'だいぶ、この館に慣れてきた。' : 'すっかり、館の人気者。'}</p><div class="growth-label"><span>${stage === 3 ? 'おとなになりました' : '次の成長まで'}</span><b>${stage === 3 ? 'MAX' : Math.max(0, limit - r.growth) + 'pt'}</b></div><div class="growth-meter"><i style="width:${progress}%"></i></div><button class="button feed-button" data-action="feed" data-id="${r.id}" ${state.coins < 15 || stage === 3 && r.happiness === 100 ? 'disabled' : ''}>${stage === 3 && r.happiness === 100 ? '元気いっぱい！' : 'ごはんをあげる <span>15G</span>'}</button><span class="care-affinity">${species.tag} · なかよし ${r.happiness}%</span></section>`;
}
function aquarium() {
  const p = profile(state), crowd = visitors(state), types = VISITORS.map(v => ({ ...v, count: crowd.filter(g => g.id === v.id).length })).filter(v => v.count);
  return `<div class="dashboard"><div class="aquarium-column"><section class="aquarium" aria-label="${escape(state.name)}"><div class="tank"><div class="tank-art">${habitatArt(p.theme)}</div><div class="tank-heading"><span><i></i> ${themes[p.theme][0]}</span><button class="tank-info" data-action="traits">個性のしくみ ↗</button></div><div class="bubble b1"></div><div class="bubble b2"></div><div class="bubble b3"></div>${p.theme === 'cosmic' ? '<span class="cosmic-spark s1">✧</span><span class="cosmic-spark s2">✦</span><span class="cosmic-spark s3">✧</span>' : ''}<div class="tank-residents">${state.residents.map((r, index) => { const [x, y] = positions[index % positions.length], species = SPECIES.find(s => s.id === r.species); return `<button class="swimmer ${r.id === selected ? 'selected' : ''}" data-action="select" data-id="${r.id}" aria-label="${species.name}、レベル${level(r)}。お世話する" style="left:${x}%;top:${y}%;--size:${.72 + level(r) * .14};--duration:${22 - p.speed * 8 + index % 5}s;--delay:-${index * 3}s"><span class="swimmer-inner">${creatureArt(r.species, r.seed)}<span class="swimmer-label">${species.name}<i>Lv.${level(r)}</i></span></span></button>`; }).join('')}</div><div class="tank-caption"><span>${themes[p.theme][1]}</span><b>なかま ${state.residents.length}<small> / ${CAPACITY}</small></b></div></div><div class="visitor-deck"><div class="visitor-deck-heading"><span>きょうも、へんてこなご来館。</span><b>お客さん ${crowd.length}<small>人</small></b></div><div class="visitor-crowd" aria-label="館に遊びに来たお客さん">${crowd.map((v, index) => `<div class="visitor" title="${v.name}" style="--visitor-delay:-${index * .6}s">${creatureArt(v.art, index, true)}</div>`).join('')}</div></div></section><div class="residents-strip" aria-label="お世話する仲間を選ぶ">${state.residents.map(r => `<button data-action="select" data-id="${r.id}" class="resident-chip ${r.id === selected ? 'active' : ''}" aria-label="${SPECIES.find(s => s.id === r.species).name}を選ぶ">${creatureArt(r.species, r.seed)}<span>Lv.${level(r)}</span></button>`).join('')}<button class="resident-chip add-resident" data-action="nav" data-view="shop" aria-label="新しい仲間を迎える">＋</button></div><section class="panel visitor-panel"><div class="panel-title"><span>どんなお客さんが来ている？</span><span class="muted">館の個性で変化</span></div><div class="visitor-types">${types.map(v => `<div class="visitor-type">${creatureArt(v.art, 0, true)}<span>${v.name}</span><b>${v.count}</b></div>`).join('')}</div><p class="panel-note">${state.residents.some(r => ['uncle', 'aunt'].includes(r.species)) ? `おじさん ${state.residents.filter(r => r.species === 'uncle').length}人・マダム ${state.residents.filter(r => r.species === 'aunt').length}人が暮らす、ちょっと不思議な館。` : '仲間が増えると客足も増えます。新しい出会いを楽しもう。'}</p></section></div><aside>${residentPanel()}<section class="work-card"><span class="eyebrow">GROW YOUR LITTLE WORLD</span><h2>指先で、館を育てよう。</h2><p>20秒のおしごとでコインを獲得。<br>なかまが多いほど、入館料もアップ。</p><button class="button work-start" data-action="job">タイピングで稼ぐ <span>→</span></button><button class="check-button" data-action="quiz" ${p.encountered ? '' : 'disabled'}>思い出しチェック <span>${p.encountered ? p.encountered + '表現' : 'おしごとのあとで'}</span></button></section>${traitPanel()}</aside></div><section class="shop-preview"><div class="section-heading"><div><span class="eyebrow">MEET YOUR NEXT FRIEND</span><h2>つぎは、だれを迎えよう？</h2></div><button class="text-button" data-action="nav" data-view="shop">すべてのなかまを見る →</button></div><div class="shop-grid">${SPECIES.filter(s => ['jelly', 'uncle', 'aunt', 'alien'].includes(s.id)).map(shopCard).join('')}</div></section>`;
}
function shop() {
  const items = SPECIES.filter(s => filter === 'all' || s.category === filter);
  return `<div class="page-heading"><span class="eyebrow">A STRANGE LITTLE PET SHOP</span><h1>つぎの仲間は、どんなひと？</h1><p>魚も、おじさんも、宇宙人も。あなたの「好き」で館をつくろう。</p></div><div class="shop-toolbar"><div class="filter-tabs">${[['all','すべて'],['ocean','海のなかま'],['odd','ちょっと不思議']].map(([id,label]) => `<button data-action="filter" data-filter="${id}" aria-pressed="${filter === id}" class="${filter === id ? 'active' : ''}">${label}</button>`).join('')}</div><span>なかま ${state.residents.length} / ${CAPACITY}</span></div><div class="shop-grid full-shop">${items.map(shopCard).join('')}</div><p class="page-note">同じ種類の仲間も迎えられます。おじさんだらけの館だって、あなたの自由。</p>`;
}
function collection() {
  return `<div class="page-heading"><span class="eyebrow">THE STORY OF YOUR AQUARIUM</span><h1>わたしの、へんてこ図鑑。</h1><p>出会ったなかまと、ここまでの小さなできごと。</p></div><div class="collection-stats"><div><span>おしごと</span><b>${state.stats.jobs}<small>回</small></b></div><div><span>出会った種類</span><b>${new Set(state.residents.map(r => r.species)).size}<small> / ${SPECIES.length}</small></b></div><div><span>稼いだコイン</span><b>${number(state.stats.earned)}<small>G</small></b></div></div><div class="collection-layout"><div class="collection-grid">${SPECIES.map(s => { const owned = state.residents.filter(r => r.species === s.id); return `<article class="collection-card ${owned.length ? '' : 'undiscovered'}">${creatureArt(s.id)}<h3>${owned.length ? s.name : 'まだ出会っていない'}</h3><p>${owned.length ? '在館 ' + owned.length + ' · 最高 Lv.' + Math.max(...owned.map(level)) : s.category === 'odd' ? 'ちょっと不思議な気配がする。' : '海のどこかで、待っている。'}</p></article>`; }).join('')}</div><section class="panel journal"><div class="panel-title"><span>水族館の日誌</span><span>最近のできごと</span></div>${state.log.map(e => `<article><i class="journal-dot ${escape(e.kind)}"></i><p>${escape(e.text)}</p></article>`).join('')}</section></div>`;
}
function render() {
  const p = profile(state);
  $('#app').innerHTML = `<header class="site-header"><a class="brand" href="#" data-action="nav" data-view="aquarium"><span class="brand-icon">≈</span><span><b>へんてこ水族館</b><small>TYPEQUARIUM</small></span></a><span class="lab-badge">CONCEPT LAB <i>01</i></span><div class="header-right"><button class="sound-toggle" data-action="sound" aria-pressed="${state.sound}" aria-label="サウンド切り替え">${state.sound ? '♫' : '♪ OFF'}</button><div class="wallet" aria-label="所持コイン">${coin(state.coins)}</div></div></header><main><div class="topline"><div><span class="eyebrow">YOUR OWN LITTLE WORLD</span><div class="aquarium-name"><h1>${escape(state.name)}</h1><button class="icon-button" data-action="rename" aria-label="水族館の名前を変える">✎</button></div><p>タイピングで稼いで、好きな仲間と、ちょっとおかしな毎日を。</p></div><div class="topline-actions"><span class="world-badge"><i></i> ${themes[p.theme][0]}</span><button class="button top-work" data-action="job">⌨ タイピングで稼ぐ <span>→</span></button></div></div><nav class="main-nav" aria-label="メインメニュー">${[['aquarium','わたしの水族館'],['shop','なかまを迎える'],['collection','図鑑と日誌']].map(([id,label]) => `<button data-action="nav" data-view="${id}" aria-current="${view === id ? 'page' : 'false'}" class="${view === id ? 'active' : ''}">${label}</button>`).join('')}<button class="how-link" data-action="help">あそび方 ↗</button></nav>${view === 'aquarium' ? aquarium() : view === 'shop' ? shop() : collection()}</main><footer><span>TYPEQUARIUM <small>育成のアイデアを試す、小さな実験。</small></span><div><button data-action="export">記録を書き出す</button><button data-action="import">読み込む</button><button data-action="reset">最初から</button></div><p>記録はこのブラウザに保存します。コインはゲーム内のものです。</p></footer>`;
}
function closeModal() {
  if (job && !job.done && !job.paused) pauseJob();
  if (job && !job.done && !confirm('今回のおしごとを中断しますか？途中の報酬は記録されません。')) return;
  if (quiz && !quiz.done && !confirm('今回のチェックを中断しますか？途中の結果は記録されません。')) return;
  job = null; quiz = null; $('#dialog').close();
}
function jobReady() {
  openDialog(`<div class="modal-heading"><div><span class="eyebrow">20 SECONDS OF LITTLE PROGRESS</span><h2>タイピングのおしごと</h2></div><button class="close-button" data-action="close" aria-label="閉じる">×</button></div><div class="job-ready"><div class="ready-art">${creatureArt('robot')}</div><h3>20秒で、コツコツ稼ごう。</h3><p>表示された英語を、スペースも含めてタイピング。<br>1文字で2G、完答でさらに12G。入館料ももらえます。</p><div class="ready-tip">覚えた表現は、あとで「思い出しチェック」に登場します。</div><button class="button" data-action="begin-job">20秒のおしごとをはじめる →</button><small>英語は半角で。ミスしても、そのまま次の文字を打って大丈夫。</small></div>`);
}
function beginJob() {
  job = new TypingJob(state.seed + state.stats.jobs * 79 + state.wave); job.runId = `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  lastFrame = performance.now(); quiz = null;
  openDialog(`<div class="modal-heading"><div><span class="eyebrow">TYPE TO GROW</span><h2>ひとことずつ、館のチカラに。</h2></div><button class="close-button" data-action="close" aria-label="中断">×</button></div><div class="job-status"><span><b id="job-time">20.0</b>秒</span><span id="job-earned">0G</span><button class="text-button" data-action="pause-job">Ⅱ 一時停止</button></div><div class="job-meter"><i id="job-meter"></i></div><div class="job-prompt"><span id="job-japanese"></span><div id="job-english" aria-label="入力する英語"></div><label for="job-input">ここに入力・最後まで打つと次へ</label><input id="job-input" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" placeholder="キーボードで入力しよう"><div class="job-feedback"><span id="job-feedback" role="status">落ち着いて、ひとことずつ。</span><span><b id="job-completed">0</b>表現を完答</span></div></div><div id="job-pause" class="job-pause" hidden><h3>ひとやすみ中。</h3><p>時計も止まっています。</p><button class="button" data-action="resume-job">つづける →</button></div>`);
  const input = $('#job-input');
  input.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) { pauseJob(); return; }
    if (event.key === 'Escape') { event.preventDefault(); pauseJob(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.length === 1) { event.preventDefault(); if (!event.repeat) typeJob(event.key); }
    if (event.key === 'Backspace' || event.key === 'Enter') event.preventDefault();
  });
  input.addEventListener('input', () => {
    if (!job || job.paused || job.done) return;
    const value = input.value, prior = job.typed;
    if (value.startsWith(prior)) for (const char of value.slice(prior.length)) { const before = job.completed; typeJob(char); if (!job || job.completed !== before) break; }
    input.value = job?.typed || '';
  });
  input.addEventListener('paste', event => { event.preventDefault(); toast('ひと文字ずつ、打ってみよう。'); });
  drawJob(); input.focus();
}
function drawJob() {
  if (!job || !$('#job-input')) return;
  $('#job-time').textContent = Math.max(0, (job.duration - job.elapsed) / 1000).toFixed(1);
  $('#job-meter').style.width = `${(1 - job.elapsed / job.duration) * 100}%`;
  $('#job-earned').textContent = `${job.correct * 2 + job.completed * 12}G`;
  $('#job-japanese').textContent = job.phrase.ja;
  $('#job-english').innerHTML = `<span class="typed">${escape(job.phrase.en.slice(0, job.typed.length))}</span><span class="remaining">${escape(job.phrase.en.slice(job.typed.length))}</span>`;
  $('#job-input').value = job.typed; $('#job-completed').textContent = job.completed;
}
function tickJob(now = performance.now()) {
  if (!job || job.done || job.paused) return;
  job.advance(Math.max(0, now - lastFrame)); lastFrame = now;
  if (job.done) { finishJob(); return; } drawJob();
}
function typeJob(char) {
  if (!job || job.paused || job.done) return; tickJob(); if (!job || job.done) return;
  const result = job.type(char); sound(result === 'complete' ? 'care' : result === 'miss' ? 'miss' : 'key'); drawJob();
  $('#job-input').classList.toggle('input-miss', result === 'miss');
  $('#job-feedback').textContent = result === 'miss' ? 'だいじょうぶ。その位置から続けよう。' : result === 'complete' ? 'ひとこと完答！ +12G' : 'その調子！';
}
function pauseJob() { if (!job || job.done || job.paused) return; tickJob(); if (!job || job.done) return; job.paused = true; $('#job-pause').hidden = false; $('#job-input').blur(); }
function finishJob() {
  const result = job.result(job.runId), payout = applyJob(state, result); if (!payout) return;
  const summary = { ...result }; commit(payout.state); sound('end');
  openDialog(`<div class="modal-heading"><div><span class="eyebrow">NICE LITTLE WORK!</span><h2>おつかれさま、館長。</h2></div><button class="close-button" data-action="close" aria-label="閉じる">×</button></div><div class="job-result"><div class="result-art">${creatureArt('puffer')}</div><span class="reward-label">今回の報酬</span><h3>+${number(payout.total)}<small>G</small></h3><div class="receipt"><div><span>タイピング ${summary.correct}文字・${summary.completed}表現</span><b>${payout.typing}G</b></div><div><span>水族館の入館料</span><b>${payout.admissions}G</b></div></div><div class="result-metrics"><span>正確さ <b>${summary.correct + summary.misses ? Math.round(summary.correct / (summary.correct + summary.misses) * 100) + '%' : '—'}</b></span><span>速さ <b>${Math.round(summary.correct / 5 / (summary.ms / 60000))} WPM</b></span><span>ミス <b>${summary.misses}回</b></span></div><p>${summary.completed ? '新しい表現は、思い出しチェックで確かめてみよう。' : '次はひとつの表現を、最後まで打ってみよう。'}</p><button class="button" data-action="back-home">水族館にもどる →</button><button class="text-button" data-action="job">もう一度おしごと</button></div>`);
}
function beginQuiz() {
  const seen = PHRASES.filter(p => state.seen[p.id]); if (!seen.length) return;
  const random = rng(state.seed + state.stats.checks * 31 + state.wave);
  const unremembered = seen.filter(p => !state.seen[p.id].recalled), remembered = seen.filter(p => state.seen[p.id].recalled);
  const rotate = items => { const at = Math.floor(random() * items.length); return [...items.slice(at), ...items.slice(0, at)]; };
  quiz = { id: `quiz-${Date.now()}-${Math.random().toString(36).slice(2)}`, cards: [...rotate(unremembered), ...rotate(remembered)].slice(0, 3), index: 0, answers: [], hinted: false, answered: false, done: false }; job = null; quizQuestion();
}
function quizQuestion() {
  const card = quiz.cards[quiz.index]; quiz.hinted = false; quiz.answered = false;
  openDialog(`<div class="modal-heading"><div><span class="eyebrow">REMEMBER A LITTLE</span><h2>思い出しチェック</h2></div><button class="close-button" data-action="close" aria-label="閉じる">×</button></div><div class="quiz-content"><span class="quiz-step">${quiz.index + 1} / ${quiz.cards.length}</span><h3>「${escape(card.ja)}」を英語で？</h3><p>おしごとで出会った表現を、思い出してみよう。</p><form id="quiz-form"><label class="sr-only" for="quiz-input">思い出した英語</label><input id="quiz-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="思い出した英語を入力"><button class="button" type="submit">答え合わせ →</button></form><button class="text-button" data-action="quiz-hint">答えをひと目見る</button><div id="quiz-feedback" role="status"></div><small>ヒントなしで思い出せた表現が、館の個性につながります。</small></div>`);
  $('#quiz-form').onsubmit = event => { event.preventDefault(); if (!quiz.answered && $('#quiz-input').value.trim()) answerQuiz(normalize($('#quiz-input').value) === normalize(card.en)); };
  $('#quiz-input').addEventListener('paste', event => event.preventDefault()); $('#quiz-input').focus();
}
function answerQuiz(correct) {
  if (!quiz || quiz.answered) return; quiz.answered = true;
  const card = quiz.cards[quiz.index]; quiz.answers.push({ id: card.id, correct, hinted: quiz.hinted });
  $('#quiz-input').readOnly = true; $('#quiz-form button').disabled = true;
  $('#quiz-feedback').innerHTML = `<div class="quiz-answer ${correct && !quiz.hinted ? 'success' : ''}"><b>${correct && !quiz.hinted ? '思い出せた！' : 'また、少しずつ覚えよう。'}</b><span>${card.en}</span><button class="button button-small" data-action="quiz-next">${quiz.index + 1 < quiz.cards.length ? '次へ →' : '結果を見る →'}</button></div>`;
  sound(correct && !quiz.hinted ? 'care' : 'click');
}
function finishQuiz() {
  quiz.done = true; const result = applyQuiz(state, quiz.id, quiz.answers); if (!result) return;
  commit(result.state); sound('end');
  openDialog(`<div class="modal-heading"><div><span class="eyebrow">WORDS BECOME YOUR WORLD</span><h2>思い出したことばが、館の個性に。</h2></div><button class="close-button" data-action="close" aria-label="閉じる">×</button></div><div class="job-result"><div class="result-art">${creatureArt('alien')}</div><h3>${result.recalled}<small> / ${quiz.answers.length}表現</small></h3><p>ヒントなしで思い出せた表現</p><div class="quiz-reward">チェックのごほうび <b>+${result.coins}G</b></div><p>初めて思い出せた表現は15G。もう一度の成功は3Gです。</p><button class="button" data-action="back-home">水族館の変化を見にいこう →</button></div>`);
}
function help(traitsOnly = false) {
  openDialog(`<div class="modal-heading"><div><span class="eyebrow">A LITTLE GUIDE</span><h2>${traitsOnly ? 'あなたの指先で、個性が変わる。' : 'へんてこ水族館のつくりかた'}</h2></div><button class="close-button" data-action="close" aria-label="閉じる">×</button></div><div class="guide"><div class="guide-loop"><span>⌨<b>タイピングで稼ぐ</b></span><i>→</i><span>◉<b>仲間を迎える</b></span><i>→</i><span>♡<b>育てて、にぎわう</b></span></div><p>おしごとでコインを稼ぎ、好きな仲間を迎えて、ごはんをあげよう。なかまの数・種類・成長・なかよし度が、客足につながります。入館料は、表現を完答したおしごとの終了時にもらえます。</p><div class="guide-traits"><article><span>正確さ</span><p>ロボットのお客さんが来やすくなり、正確さと仲良しの生き物が育ちやすくなります。</p></article><article><span>スピード</span><p>泳ぐテンポが軽快になり、ペンギンのお客さんが増えやすくなります。</p></article><article><span>思い出し</span><p>チェックで思い出せた表現が、宇宙のお客さんや館の雰囲気につながります。</p></article><article><span>あなたの好み</span><p>おじさん・マダムの比率でも客層が変わります。失敗で仲間がいなくなることはありません。</p></article></div><p class="panel-note">思い出しチェックは、この試作で出会った表現の確認です。記憶の長期定着を測るものではありません。記録はこのブラウザに保存されます。</p><button class="button" data-action="close">わかった、やってみる →</button></div>`);
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  if (button.tagName === 'A') event.preventDefault(); const action = button.dataset.action;
  if (!['buy', 'feed'].includes(action)) sound('click');
  if (action === 'nav') { view = button.dataset.view; render(); }
  else if (action === 'select') { selected = button.dataset.id; render(); }
  else if (action === 'filter') { filter = button.dataset.filter; render(); }
  else if (action === 'buy') { const result = buy(state, button.dataset.id); if (result) { selected = result.resident.id; commit(result.state, '新しい仲間がやってきました！'); sound('buy'); } }
  else if (action === 'feed') { const result = feed(state, button.dataset.id); if (result) { commit(result.state, result.evolved ? 'ひとまわり成長しました！' : result.gain ? `ごきげん！ 成長 +${result.gain}pt` : 'ごきげん！ なかよし度が上がりました。'); sound(result.evolved ? 'grow' : 'care'); } }
  else if (action === 'sound') { state.sound = !state.sound; save(); render(); }
  else if (action === 'job') { job = null; quiz = null; jobReady(); }
  else if (action === 'begin-job') beginJob();
  else if (action === 'pause-job') pauseJob();
  else if (action === 'resume-job' && job) { job.paused = false; lastFrame = performance.now(); $('#job-pause').hidden = true; $('#job-input').focus(); }
  else if (action === 'quiz') beginQuiz();
  else if (action === 'quiz-hint' && quiz && !quiz.answered) { quiz.hinted = true; $('#quiz-feedback').innerHTML = `<div class="hint-answer">${quiz.cards[quiz.index].en}</div>`; $('#quiz-input').focus(); }
  else if (action === 'quiz-next' && quiz && quiz.answered) { quiz.index++; if (quiz.index < quiz.cards.length) quizQuestion(); else finishQuiz(); }
  else if (action === 'back-home') { job = null; quiz = null; $('#dialog').close(); view = 'aquarium'; render(); }
  else if (action === 'close') closeModal();
  else if (action === 'help' || action === 'traits') help(action === 'traits');
  else if (action === 'rename') {
    openDialog(`<div class="modal-heading"><h2>水族館に名前をつけよう。</h2><button class="close-button" data-action="close" aria-label="閉じる">×</button></div><form id="name-form" class="name-form"><label for="name-input">水族館の名前（24文字まで）</label><input id="name-input" maxlength="24" required value="${escape(state.name)}"><button class="button" type="submit">この名前にする →</button></form>`);
    $('#name-form').onsubmit = e => { e.preventDefault(); const name = $('#name-input').value.trim(); if (!name) return; state.name = name.slice(0,24); save(); render(); $('#dialog').close(); };
  }
  else if (action === 'export') { const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'typequarium.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  else if (action === 'import') $('#import-file').click();
  else if (action === 'reset' && confirm('この試作の水族館を最初から作り直しますか？記録を書き出しておくと、あとで戻せます。')) { state = newState(); selected = state.residents[0].id; view = 'aquarium'; save(); render(); toast('新しい水族館のはじまりです。'); }
});
$('#import-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 100000) throw new Error(); const restored = restoreState(JSON.parse(await file.text())); if (!restored) throw new Error(); if (!confirm('この水族館の記録に切り替えますか？現在の記録は置き換わります。')) return; selected = restored.residents[0]?.id; view = 'aquarium'; commit(restored, '記録を読み込みました。'); } catch { toast('この記録は読み込めません。書き出したJSONファイルをご確認ください。'); }
  event.target.value = '';
};
$('#dialog').addEventListener('cancel', event => { event.preventDefault(); if (job && !job.done && !job.paused) pauseJob(); else closeModal(); });
window.addEventListener('blur', pauseJob);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseJob(); });
function frame(now) { tickJob(now); requestAnimationFrame(frame); }
render(); requestAnimationFrame(frame);
if (storageFailed) toast('保存記録を読み込めませんでした。新しい試作として開始しています。');
