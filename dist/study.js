import { STUDY_DECKS } from './study-cards.js';
import { StudyRound, planStudy, introduceStudy, recordStudy, delayedStudyStats, validStudyProgress, parseStudyMarkdown } from './study-core.js';

export function createStudyUI({ screen, escape, sushi, sound, showTitle, toast }) {
  let studyState = { progress: {}, logs: [], custom: null };
  let deck = null, round = null, plan = null, route = 'menu', composing = false;
  let award = 0, lastStudyTick = 0, advanceAt = null, advanceWait = 0, lastOutcome = null;
  const storageKey = 'sushi-type-learning-v1';
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved) {
      studyState.progress = validStudyProgress(saved.progress);
      if (Array.isArray(saved.logs)) studyState.logs = saved.logs.filter(log => log && typeof log.id === 'string' && ['recalled', 'assisted', 'forgot'].includes(log.outcome) && Number.isFinite(log.at)).slice(-2000);
      if (typeof saved.markdown === 'string') {
        const parsed = parseStudyMarkdown(saved.markdown);
        if (!parsed.errors.length) studyState.custom = { ...parsed, id: 'custom', label: '自分の問題', description: 'ノートを小さな問いに変えて、思い出す。', sushi: 'egg', markdown: saved.markdown };
      }
    }
  } catch { toast('学習記録を読み込めませんでした。保存設定をご確認ください。'); }
  const studyAllDecks = () => studyState.custom ? [...STUDY_DECKS, studyState.custom] : STUDY_DECKS;
  const q = selector => screen.querySelector(selector);
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, progress: studyState.progress, logs: studyState.logs.slice(-2000), markdown: studyState.custom?.markdown || '' }));
      return true;
    } catch { toast('学習記録を保存できません。ブラウザのストレージ設定をご確認ください。'); return false; }
  }
  function dueLabel(timestamp) {
    const delta = timestamp - Date.now();
    if (delta <= 0) return 'いま';
    if (delta < 3600000) return `約${Math.ceil(delta / 60000)}分後`;
    if (delta < 86400000) return `約${Math.ceil(delta / 3600000)}時間後`;
    return `${new Date(timestamp).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}ごろ`;
  }
  function header(kicker, title, caption = '') {
    return `<div class="study-heading"><p>${escape(kicker)}</p><h1>${escape(title)}</h1>${caption ? `<span>${escape(caption)}</span>` : ''}</div>`;
  }
  function menu() {
    route = 'menu'; round = null; advanceAt = null;
    screen.className = 'screen study-screen study-menu';
    const stats = delayedStudyStats(studyState.logs);
    const plans = studyAllDecks().map(item => ({ item, available: planStudy(item.cards, studyState.progress, Date.now()) }));
    const totalDue = plans.reduce((sum, item) => sum + item.available.dueCount, 0);
    screen.innerHTML = `${header('RECALL · REVIEW · REMEMBER', '思い出して、ひと皿。', '頭文字と空欄を頼りに、時間内にことばを思い出して打とう。')}
      <div class="study-summary"><div><span>いま復習できる</span><b>${totalDue}<small>枚</small></b></div><div><span>今回のスタイル</span><b>周回<small>時間いっぱい</small></b></div><div><span>翌日以降・追加ヒントなし</span><b>${stats.total ? `${stats.correct}<small> / ${stats.total}回</small>` : '—'}</b></div></div>
      <div class="study-decks">${plans.map(({ item, available }, i) => `<article class="study-deck"><div class="study-deck-art">${sushi(item.sushi, i % 6)}</div><span class="study-deck-label">${escape(item.label)}</span><h2>${escape(item.title)}</h2><p>${escape(item.description)}</p><div class="study-deck-status"><span>${available.dueCount}枚 復習待ち</span><span>未学習 ${available.unseenCount}枚</span></div><button class="red-button" data-study-deck="${escape(item.id)}">${available.entries.length ? '今日のひと皿へ' : '復習の予定を見る'} →</button></article>`).join('')}</div>
      <div class="study-menu-actions"><button class="wood-button" id="study-import">＋ Markdownから問題を登録</button><button class="plain-button" id="study-method">学び方と研究の根拠</button><button class="plain-button" id="study-exit">タイトルへ戻る</button></div>
      <p class="study-footnote">手掛かりなしの後日確認：${stats.freeTotal ? stats.freeCorrect + " / " + stats.freeTotal + "回正答" : "まだ記録がありません"}。<br>正解したらそのまま次へ。枚数上限なしで、制限時間まで周回します。初回練習や同じ日の解き直しは、翌日以降・追加ヒントなしに含めません。<br>集計は保存した直近2,000回答が対象です。記録はこのブラウザに保存され、端末間同期はありません。</p>`;
    screen.querySelectorAll('[data-study-deck]').forEach(button => button.onclick = () => prepare(studyAllDecks().find(item => item.id === button.dataset.studyDeck)));
    q('#study-exit').onclick = showTitle;
    q('#study-import').onclick = importMenu;
    q('#study-method').onclick = method;
  }
  function prepare(selected, extra = false) {
    deck = selected; route = 'prepare';
    plan = planStudy(deck.cards, studyState.progress, Date.now(), extra);
    const newEntries = plan.entries.filter(entry => entry.kind === 'new');
    screen.className = 'screen study-screen';
    screen.innerHTML = `${header(extra ? 'OPTIONAL PRACTICE' : 'TODAY’S MENU', deck.title, extra ? '追加練習は復習予定を延ばしません。' : '正解で即次へ。覚えきらなくても、何度も回して慣れていこう。')}
      ${plan.entries.length ? `<div class="study-session-info">今回 ${plan.entries.length}種類を周回 ${extra ? '追加練習' : `（復習${plan.entries.filter(entry => entry.kind === 'review').length}枚・初回練習${newEntries.length}枚）`}<span>${deck.seconds || 90}秒コース · 2回ミスで1文字ヒント</span></div>
      ${newEntries.length ? `<details class="study-prep"><summary>初めての答えを先に見たいときはこちら（任意）</summary><p>読まずに始めて、ヒントを頼りに覚えていっても大丈夫。</p>${newEntries.map(({ card }) => `<article><h3>${escape(card.prompt)}</h3><b>${escape(card.answers[0])}</b><p>${escape(card.example)}</p><small>${escape(card.explanation)}</small></article>`).join('')}</details>` : '<div class="study-ready-art">' + sushi(deck.sushi, 3) + '<p>答えを見ずに、まずは思い出してみましょう。</p></div>'}
      <label class="study-probe-choice"><input type="checkbox" id="study-probe"> 手掛かりなしで確認する（全文を入力してから判定）</label><button id="study-begin" class="red-button study-main-action">時間いっぱい、どんどん回す ▶</button>` : `<div class="study-empty"><div>${sushi(deck.sushi, 2)}</div><h2>いまの復習はひと区切り。</h2><p>${plan.nextDue ? `次の復習は${dueLabel(plan.nextDue)}。` : ''}${plan.unseenCount ? '新しい問題も、同じコースで続けて回せます。' : 'お茶を飲んで、また次の周回へ。'}</p>${plan.seenCount ? '<button id="study-extra" class="wood-button">学んだ問題で追加練習する</button><p class="study-footnote">追加練習は復習予定・翌日以降の正答集計を変えません。</p>' : ''}</div>`}
      <button id="study-back" class="plain-button study-main-action">‹ デッキを選び直す</button>`;
    q('#study-back').onclick = menu;
    if (q('#study-extra')) q('#study-extra').onclick = () => prepare(deck, true);
    if (q('#study-begin')) q('#study-begin').onclick = () => {
      round = new StudyRound(plan.entries, studyState.progress, { seconds: deck.seconds || 90, plateSeconds: deck.plateSeconds || 45, cueMode: q('#study-probe').checked ? 'none' : 'initial-and-length', continuous: true }); award = 0; lastOutcome = null; advanceAt = null; question();
    };
  }
  function question() {
    route = 'question'; composing = false; lastStudyTick = performance.now();
    const { card, kind } = round.current;
    if (!studyState.progress[card.id]) { studyState.progress = introduceStudy(studyState.progress, [round.current], Date.now()); save(); }
    const probe = round.cueMode === 'none';
    const completed = round.records.length;
    screen.className = 'screen study-screen study-question-screen';
    screen.innerHTML = `<div class="study-hud"><button id="study-stop" class="plain-button">Ⅱ 一時停止</button><span>${escape(deck.title)}</span><strong>${completed + 1}皿目 · ${round.lap}周目${kind === 'retry' ? ' · 再挑戦' : ''}</strong></div>
      <div class="study-progress"><i style="width:${(1 - round.remaining / (deck.seconds || 90)) * 100}%"></i></div>
      <div class="study-clock"><span>コース残り <b id="study-total-time"></b>秒</span><span>このお皿 <b id="study-plate-time"></b>秒</span><small>答え合わせ中は時計が止まります</small></div>
      <div class="study-rail"><div class="study-plate">${sushi(deck.sushi, Math.min(5, Math.floor(award / 200)))}</div><span id="study-rail-note">2回ミスで、その位置の1文字が見えます。</span></div>
      <div class="study-plate-progress"><i id="study-plate-meter"></i></div>
      <div class="study-last-outcome" role="status">${lastOutcome ? `${escape(lastOutcome.word)} · ${escape(lastOutcome.label)} ${lastOutcome.points ? "+" + lastOutcome.points + "円" : ""}` : "正解したら、自動で次のお皿へ。"}</div><section class="study-prompt-panel"><span class="study-question-kind">${kind === 'new' ? 'はじめての練習' : kind === 'retry' ? '少し間を空けて、もう一度' : kind === 'extra' ? '追加練習' : '頭文字を頼りに復習'}</span><h2>${escape(card.prompt).replace(/\n/g, '<br>')}</h2>
      <div id="study-mask" class="study-mask" aria-label="頭文字と文字数の手掛かり"></div>
      <form id="study-answer-form"><label for="study-answer">${probe ? "手掛かりなしで答えを入力・Enterで判定" : "1文字ずつ入力（スペースも必要です）"}</label><div class="study-input-row"><input id="study-answer" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="300" placeholder="最初の文字から打ってみよう…"></div></form>
      <div class="study-support"><button id="study-hint" class="plain-button" ${probe ? "disabled" : ""}>次の1文字をヒントに</button><button id="study-reveal" class="plain-button">まだわからない・答えを見る</button></div><p id="study-hint-text" role="status"></p><p class="study-input-help">${probe ? "答えは送信後まで表示しません。Enterで答え合わせ。" : "英語は半角英数で。最後まで打てたら自動で答え合わせ。見えた文字も、自分で入力して進みます。"}</p><div id="study-feedback" aria-live="polite"></div></section>
      <div class="study-score"><span>今日のごほうび</span><b id="study-score">${award}円分</b><small>追加ヒントなし300円・初回150円・ヒントあり50円</small></div>`;
    q('#study-stop').onclick = pause;
    const input = q('#study-answer');
    input.addEventListener('compositionstart', () => composing = true);
    input.addEventListener('compositionend', () => { composing = false; readInput(); });
    input.addEventListener('keydown', event => {
      if (event.isComposing || composing || event.keyCode === 229) return;
      if (event.ctrlKey || event.metaKey || event.altKey || probe) return;
      if (event.repeat || event.key === 'Backspace') { event.preventDefault(); return; }
      if (event.key.length === 1) { event.preventDefault(); acceptKey(event.key); }
      if (event.key === 'Enter') event.preventDefault();
    });
    function readInput() {
      if (composing || round.phase !== 'question' || probe) return;
      const current = round.current;
      const extra = input.value.startsWith(round.typed) ? input.value.slice(round.typed.length) : '';
      for (const char of extra) { acceptKey(char); if (round.phase !== 'question' || round.current !== current) break; }
      input.value = round.typed;
    }
    input.addEventListener('input', readInput);
    input.addEventListener('paste', event => { event.preventDefault(); toast('貼り付けではなく、1文字ずつ思い出して入力してみましょう。'); });
    q('#study-answer-form').onsubmit = event => {
      event.preventDefault();
      if (probe && !composing) { const current = round.current; tick(); if (round.current === current) feedback(round.testAnswer(input.value)); }
    };
    q('#study-hint').onclick = () => {
      tick(); if (round.phase !== 'question' || round.paused) return;
      round.hint(); q('#study-hint-text').textContent = '1文字を追加しました。今回は「追加ヒントあり」で記録します。';
      drawQuestion(); input.focus();
    };
    q('#study-reveal').onclick = () => { tick(); if (round.phase === 'question') feedback(round.submit('', true)); };
    drawQuestion(); input.focus();
  }
  function acceptKey(key) {
    const current = round.current; tick(); if (round.phase !== 'question' || round.paused || round.current !== current) return;
    const result = round.type(key);
    if (!result) return;
    if (result.kind === 'complete') feedback(result.event);
    else {
      sound(result.kind === 'miss' ? 'miss' : 'key');
      if (result.revealed) q('#study-hint-text').textContent = '同じ位置で2回ミス。1文字を表示しました。その文字を打って進もう！';
      drawQuestion();
    }
  }
  function drawQuestion() {
    if (!round || route !== 'question') return;
    q('#study-total-time').textContent = Math.ceil(round.remaining);
    q('#study-plate-time').textContent = Math.ceil(Math.max(0, round.plateLimit - round.plateElapsed));
    q('#study-plate-meter').style.width = `${Math.max(0, 1 - round.plateElapsed / round.plateLimit) * 100}%`;
    q('.study-plate').style.left = `${90 - round.plateElapsed / round.plateLimit * 80}%`;
    if (round.cueMode === 'none') { q('#study-mask').textContent = '今回は頭文字・文字数の表示なし'; return; }
    q('#study-mask').innerHTML = [...round.guide].map((char, i) => `<span class="${i < round.typed.length ? 'study-typed' : i === round.typed.length ? 'study-current' : ''}">${escape(i < round.typed.length || round.revealed.has(i) || char === ' ' ? char : '_').replace(/ /g, ' ')}</span>`).join('');
    q('#study-answer').value = round.typed;
  }
  function tick(now = performance.now()) {
    if (route !== 'question' || !round || round.paused) return;
    if (round.phase === 'feedback') { if (advanceAt !== null && now >= advanceAt) advanceRound(); return; }
    if (round.phase !== 'question') return;
    const event = round.advance(Math.max(0, now - lastStudyTick) / 1000); lastStudyTick = now;
    if (event) feedback(event); else {
      q('#study-total-time').textContent = Math.ceil(round.remaining);
      q('#study-plate-time').textContent = Math.ceil(Math.max(0, round.plateLimit - round.plateElapsed));
      q('#study-plate-meter').style.width = `${Math.max(0, 1 - round.plateElapsed / round.plateLimit) * 100}%`;
      q('.study-plate').style.left = `${90 - round.plateElapsed / round.plateLimit * 80}%`;
    }
  }
  function pause() {
    tick(); if (route !== 'question' || !round || round.paused) return;
    advanceWait = advanceAt === null ? null : Math.max(0, advanceAt - performance.now()); advanceAt = null;
    round.paused = true;
    screen.insertAdjacentHTML('beforeend', '<div id="study-pause" class="game-overlay study-pause"><div class="overlay-card"><h2>一時停止中</h2><p>時計も、お皿も止まっています。</p><button id="study-resume" class="red-button">続ける ▶</button><button id="study-finish-now" class="plain-button">ここまでの結果を見る</button></div></div>');
    q('#study-resume').onclick = () => { q('#study-pause').remove(); round.paused = false; lastStudyTick = performance.now(); if (advanceWait !== null && round.phase === 'feedback') advanceAt = performance.now() + advanceWait; q('#study-answer').focus(); };
    q('#study-finish-now').onclick = () => results(true);
  }
  function feedback(event) {
    if (!event) return;
    const { card } = round.current;
    const recorded = recordStudy(studyState.progress, event, Date.now());
    studyState.progress = recorded.progress;
    studyState.logs.push(recorded.log); studyState.logs = studyState.logs.slice(-2000); save();
    award += event.points; sound(event.outcome === 'forgot' ? 'start' : 'plate');
    q('#study-answer').readOnly = true;
    q('#study-hint').disabled = true; q('#study-reveal').disabled = true;
    q('#study-score').textContent = `${award}円分`;
    lastOutcome = { word: card.answers[0], label: event.outcome === 'recalled' ? '追加ヒントなし' : event.outcome === 'assisted' ? 'ヒントで完答' : 'また回そう', points: event.points };
    if (event.outcome === 'recalled') { advanceRound(); return; }
    q('#study-mask').textContent = card.answers[0];
    q('#study-rail-note').textContent = '答えをひと目見て、次のお皿へ。';
    q('#study-feedback').innerHTML = `<div class="study-feedback study-feedback-quick ${event.outcome}"><div class="study-feedback-top"><b>${event.outcome === 'assisted' ? 'ヒントで完答！' : event.timedOut ? '時間切れ。次でまた挑戦。' : 'この答えを、ひと目で。'}</b><span>${event.points ? '+' + event.points + '円' : '復習へ'}</span></div><div class="study-correct-answer">${escape(card.answers[0])}</div><small id="study-auto-note">自動で次へ · 詳しい解説は終了後にまとめて確認できます</small><div class="study-quick-actions"><button id="study-next" class="plain-button">すぐ次へ →</button><button id="study-hold" class="plain-button">止めて確認する</button></div></div>`;
    advanceAt = performance.now() + (event.outcome === 'assisted' ? 250 : 900);
    q('#study-next').onclick = advanceRound;
    q('#study-hold').onclick = () => { advanceAt = null; q('#study-auto-note').textContent = '確認中。「すぐ次へ」で再開できます。'; q('#study-hold').disabled = true; };
  }
  function advanceRound() {
    if (!round || route !== 'question' || round.phase !== 'feedback' || round.paused) return;
    advanceAt = null; round.next();
    if (round.phase === 'done') results(); else question();
  }

  function results(interrupted = false) {
    route = 'result'; advanceAt = null;
    const first = round.records.filter(event => event.kind !== 'retry');
    const count = outcome => first.filter(event => event.outcome === outcome).length;
    const reviews = first.filter(event => event.kind === 'review');
    const dueTimes = first.map(event => studyState.progress[event.id]?.due).filter(Number.isFinite);
    const nextDue = dueTimes.length ? Math.min(...dueTimes) : null;
    const unique = [...new Map(round.records.map(event => [event.id, event])).values()];
    screen.className = 'screen study-screen study-result';
    screen.innerHTML = `${header('ONE RECALL AT A TIME', interrupted ? '今日は、ここまで。' : 'ひと皿ずつ、積み重ねました。', '「今できた」と「後日も思い出せた」を、分けて育てよう。')}
      <div class="study-result-art">${sushi(deck.sushi, 4)}</div><div class="study-reward-total">${award}<span>円分のごほうび</span></div>
      <div class="study-result-stats"><div><b>${count('recalled')}</b><span>追加ヒントなし</span></div><div><b>${count('assisted')}</b><span>ヒントあり</span></div><div><b>${count('forgot')}</b><span>学び直し</span></div></div>
      <p class="study-result-caption">全${round.records.length}回・${unique.length}種類に挑戦。上の数字は周回を含み、間違い直後の再挑戦は重複計上しません。</p>
      <div class="study-review-detail"><b>今回の期限が来た復習：${reviews.length}枚中 ${reviews.filter(event => event.outcome === 'recalled').length}枚を追加ヒントなし完答</b><p>${nextDue ? `次の復習は${dueLabel(nextDue)}。` : 'まだ回答した問題はありません。'}${round.records.some(event => event.kind === 'retry') ? '同じ回の解き直しは、元の復習予定を維持しています。' : ''}</p></div>
      <h2 class="study-recap-heading">答え・解説は、ここでまとめて。</h2><div class="study-result-list">${unique.map(event => { const card = deck.cards.find(item => item.id === event.id); return `<details class="study-recap"><summary><span>${escape(card.prompt)}</span><b>${event.outcome === 'recalled' ? '追加ヒントなし' : event.outcome === 'assisted' ? 'ヒントあり' : '要復習'}</b></summary><div class="study-correct-answer">${escape(card.answers[0])}</div>${card.example ? `<p>${escape(card.example)}</p>` : ''}<p>${escape(card.explanation)}</p><small>次の復習：${dueLabel(studyState.progress[event.id].due)}</small></details>`; }).join('')}</div>
      <button id="study-again" class="red-button study-main-action">同じコースでもう1回 ▶</button>
      <button id="study-done" class="red-button study-main-action">学習メニューへ</button><p class="study-footnote">これは語彙・知識の取り出し練習です。会話力や長期の記憶定着を保証する評価ではありません。</p>`;
    q('#study-done').onclick = menu;
    q('#study-again').onclick = () => { const cueMode = round.cueMode; plan = planStudy(deck.cards, studyState.progress, Date.now()); round = new StudyRound(plan.entries, studyState.progress, { seconds: deck.seconds || 90, plateSeconds: deck.plateSeconds || 45, cueMode, continuous: true }); award = 0; lastOutcome = null; advanceAt = null; question(); };
  }
  function method() {
    route = 'method';
    screen.className = 'screen study-screen';
    screen.innerHTML = `${header('WHY THIS WAY?', '覚える仕組み、楽しむ仕掛け。')}
      <div class="study-method"><article><h2>1. 見て打つ前に、思い出す</h2><p>日本語や場面から答えを取り出します。頭文字・文字数は見せ、2回ミスすると現在の文字を追加表示します。追加のヒントを使った回答は分けて記録します。別に「手掛かりなしで確認」も選べます。</p><a href="https://doi.org/10.1126/science.1152408" target="_blank" rel="noopener">Karpicke & Roediger（2008）↗</a></article><article><h2>2. 少し忘れた頃に、また会う</h2><p>期限の来た問題を優先します。この試作は成功時1・3・7・14・30・60日、忘れた／ヒントを使ったときは10分後という簡易方式です。AnkiのFSRSではなく、間隔は今後調整する仮設定です。</p><a href="https://doi.org/10.1111/lang.12479" target="_blank" rel="noopener">Kim & Webb（2022）↗</a></article><article><h2>3. 使う方向に、練習する</h2><p>お手軽は単語、お勧めは短い組み合わせ、高級は例文。レベルごとの復習記録を分け、単語の正解だけで文章も覚えたとは判断しません。</p><a href="https://www.jstage.jst.go.jp/article/katejournal/30/0/30_11/_article/-char/en" target="_blank" rel="noopener">Yanagisawa（2016）↗</a></article><article><h2>4. 手助けと締め切りで、挑戦を支える</h2><p>寿司・音・制限時間を残し、答え合わせ中は時計を止めます。頭文字の表示・2回ミスで1文字・時間の長さが適切かは、楽しさと後日の正答で検証する仮説です。</p><a href="https://doi.org/10.1007/s10648-019-09498-w" target="_blank" rel="noopener">Sailer & Homner（2020）↗</a></article></div><p class="study-footnote">文字ヒント付き練習から、ヒントなしの後日テストへの転移は限定的だった研究もあります。追加ヒントなしの成績と、手掛かりなしの確認を分けて見ることが大切です。<a href="https://pubmed.ncbi.nlm.nih.gov/30998028/" target="_blank" rel="noopener">van den Broek et al.（2019）</a></p><button id="study-method-back" class="wood-button study-main-action">学習メニューへ戻る</button>`;
    q('#study-method-back').onclick = menu;
  }
  function importMenu() {
    route = 'import';
    const example = '# 自分のノート\n\n## 「習慣」を英語で？\n答え: habit\n解説: A small habit makes a big difference.\n\n## 水の化学式は？\n答え: H2O | H₂O\n解説: 水素原子2つと酸素原子1つからできています。';
    screen.className = 'screen study-screen';
    screen.innerHTML = `${header('YOUR NOTES, YOUR SUSHI', 'ノートを、思い出す問題に。', '1枚1つの問い、短い答え、理由や例を解説に。')}
      <div class="study-import"><label for="study-markdown">Markdown（問題と各項目は1行ずつ・最大100枚）</label><textarea id="study-markdown" spellcheck="false">${escape(studyState.custom?.markdown || example)}</textarea><p>別解は <code>|</code> で区切れます。英語以外の勉強にも使えます。</p><label class="study-file">.mdファイルを読み込む <input type="file" id="study-file" accept=".md,.markdown,.txt,text/plain"></label><div id="study-preview" aria-live="polite"></div><p class="study-footnote">保存すると「自分のノート」1デッキを置き換えます。同じ問題と答えの復習記録は保持します。問題や答えを変えたカードは新しく学び直します。</p><button id="study-save" class="red-button">このノートを保存する</button><button id="study-import-back" class="plain-button">戻る</button></div>`;
    const preview = () => {
      const parsed = parseStudyMarkdown(q('#study-markdown').value);
      q('#study-save').disabled = !!parsed.errors.length;
      q('#study-preview').innerHTML = parsed.errors.length ? parsed.errors.map(error => `<p class="study-error">${escape(error)}</p>`).join('') : `<b>${escape(parsed.title)} · ${parsed.cards.length}枚</b>` + parsed.cards.slice(0, 4).map(card => `<p>${escape(card.prompt)} → ${escape(card.answers.join(' / '))}</p>`).join('');
      return parsed;
    };
    q('#study-markdown').oninput = preview;
    q('#study-file').onchange = async event => {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > 100000) { toast('100KB以下のファイルを選んでください。'); return; }
      try { q('#study-markdown').value = await file.text(); preview(); } catch { toast('ファイルを読み込めませんでした。'); }
    };
    q('#study-save').onclick = () => {
      const parsed = preview(); if (parsed.errors.length) return;
      studyState.custom = { ...parsed, id: 'custom', label: '自分の問題', description: 'ノートからつくった問いを、少しずつ。', sushi: 'egg', markdown: q('#study-markdown').value };
      save(); menu(); toast('自分のノートを登録しました。');
    };
    q('#study-import-back').onclick = menu;
    preview();
  }
  return {
    open: menu,
    frame: tick,
    pause,
    leave() {
      if (route === 'question' && round?.phase === 'question' && !confirm('学習を終了しますか？回答済みの問題は保存されています。')) return false;
      round = null; advanceAt = null; return true;
    },
    handleKey(event) {
      if (['Enter', ' '].includes(event.key) && route === 'question' && round?.phase === 'feedback' && !round.paused) { event.preventDefault(); advanceRound(); return; }
      if (event.key === 'Escape' && route === 'question') { event.preventDefault(); pause(); }
    },
  };
}
