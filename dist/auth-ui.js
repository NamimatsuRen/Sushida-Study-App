export function mountAccountUI({ auth, store, openDialog, escape, toast }) {
  const q = selector => document.querySelector(selector);
  const labels = { guest: 'ゲストで学習中', loading: '記録を読み込み中', synced: 'アカウントに保存済み', pending: '保存待ち', saving: '記録を保存中', offline: '未同期の記録はこの端末に保存中', conflict: '別の端末の更新があります' };
  const statusText = () => store.cacheError && store.pending ? '端末保存ができません。同期をご確認ください' : store.memoryOnly && !store.user ? 'このページ内に一時保存' : labels[store.status] || 'この端末に保存';
  function header() {
    q('#account-button').textContent = store.user ? 'マイアカウント' : 'ログイン';
    q('#account-status').textContent = statusText();
    const live = q('[data-profile-status]'); if (live) live.textContent = statusText();
  }
  function errorMessage(error) {
    if (error?.code === 'provider_disabled') return 'Googleログインは準備中です。ゲストとして学習することもできます。';
    if (['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error?.code) || error?.status === 429) return '操作が多いため、少し時間を空けてからお試しください。';
    if (['email_address_not_authorized', 'email_provider_disabled', 'signup_disabled'].includes(error?.code)) return 'メール登録は準備中です。ゲストとして学習することもできます。';
    if (error?.code === 'email_not_confirmed') return '確認メールのリンクを開いてからログインしてください。';
    if (error?.code === 'invalid_credentials') return 'メールアドレスまたはパスワードをご確認ください。';
    return '手続きを完了できませんでした。接続を確認して、もう一度お試しください。';
  }
  function form(mode = 'login', savedEmail = '') {
    const signup = mode === 'signup', reset = mode === 'reset';
    openDialog(reset ? 'パスワードを再設定' : '学びの続きを、どこからでも。', `<div class="auth-layout"><div class="auth-intro"><span class="eyebrow">YOUR LEARNING JOURNEY</span><h3>ひと皿ずつの成長を、<br>あなたの記録に。</h3><p>ログインすると、学習記録・復習予定・自分の問題をアカウントに保存できます。</p><div class="auth-benefits"><span>✓ 別の端末でも続きから</span><span>✓ あなたに合わせた復習</span><span>✓ 毎日の積み重ねを記録</span></div></div><div class="auth-panel">${reset ? '' : `<div class="auth-tabs"><button data-auth-mode="login" class="${!signup ? 'selected' : ''}">ログイン</button><button data-auth-mode="signup" class="${signup ? 'selected' : ''}">新規登録</button></div><button id="auth-google" class="google-button" ${!auth.configured ? 'disabled' : ''}><span aria-hidden="true">G</span>Googleで${signup ? '登録' : 'ログイン'}</button><div class="auth-divider"><span>またはメールアドレスで</span></div>`}<form id="auth-form"><label for="auth-email">メールアドレス</label><input id="auth-email" type="email" autocomplete="email" required maxlength="254" value="${escape(savedEmail)}" placeholder="you@example.com">${reset ? '' : `<label for="auth-password">パスワード${signup ? '（8文字以上）' : ''}</label><input id="auth-password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required ${signup ? 'minlength="8"' : ''} maxlength="128">`}<button type="submit" class="red-button auth-submit" ${!auth.configured ? 'disabled' : ''}>${reset ? '再設定メールを送る' : signup ? 'メールで新規登録' : 'メールでログイン'}</button></form><p id="auth-message" class="auth-message" role="status">${auth.configured ? '' : 'ログインは準備中です。今はゲストで学習できます。'}</p>${reset ? '<button class="plain-button" data-auth-mode="login">ログインに戻る</button>' : '<button id="auth-reset" class="plain-button">パスワードを忘れた方</button>'}<p class="auth-note">パスワードの管理・認証にはSupabase Authを使用します。Googleのパスワードがこのアプリに渡ることはありません。</p></div></div>`);
    const panel = q('.auth-panel'), messageNode = q('#auth-message');
    const message = text => { if (messageNode.isConnected) messageNode.textContent = text; };
    function busy(value) { panel.setAttribute('aria-busy', String(value)); panel.querySelectorAll('button, input').forEach(item => item.disabled = value || !auth.configured && (item.type === 'submit' || item.id === 'auth-google')); }
    q('#dialog-body').querySelectorAll('[data-auth-mode]').forEach(button => button.onclick = () => form(button.dataset.authMode, q('#auth-email').value));
    if (q('#auth-reset')) q('#auth-reset').onclick = () => form('reset', q('#auth-email').value);
    if (q('#auth-google')) q('#auth-google').onclick = async () => {
      busy(true); message('Googleに移動しています…');
      try { await auth.google(); } catch (error) { message(errorMessage(error)); busy(false); }
    };
    q('#auth-form').onsubmit = async event => {
      event.preventDefault(); if (!auth.configured || !q('#auth-form').reportValidity()) return;
      const email = q('#auth-email').value.trim(), password = q('#auth-password')?.value;
      busy(true); message('手続き中です…');
      try {
        const data = await auth.email(mode, email, password);
        message(reset ? '再設定メールの送信を受け付けました。メール内のリンクを同じブラウザで開いてください。' : signup && !data?.session ? '登録手続きを受け付けました。届いた確認メールのリンクを同じブラウザで開いてください。登録済みの場合はログインか再設定をお試しください。' : 'ログインしました。記録を準備しています…');
      } catch (error) { message(errorMessage(error)); }
      finally { if (q('#auth-form')) busy(false); }
    };
  }
  function recovery() {
    openDialog('新しいパスワード', '<form id="password-form" class="auth-panel"><p>新しいパスワードを設定してください。</p><label for="new-password">新しいパスワード（8文字以上）</label><input id="new-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><button class="red-button auth-submit" type="submit">パスワードを更新</button><p id="password-message" role="status"></p></form>');
    const recoveryForm = q('#password-form'), message = q('#password-message');
    recoveryForm.onsubmit = async event => {
      event.preventDefault(); const button = recoveryForm.querySelector('button'); button.disabled = true;
      try { await auth.updatePassword(recoveryForm.querySelector('input').value); } catch (error) { if (message.isConnected) message.textContent = errorMessage(error); button.disabled = false; }
    };
  }
  function profile() {
    openDialog('マイアカウント', `<div class="account-profile"><div class="profile-avatar" aria-hidden="true">${escape((store.user.email || 'S')[0].toUpperCase())}</div><h3>${escape(store.user.user_metadata?.full_name || store.user.email || '学習アカウント')}</h3><p class="profile-email">${escape(store.user.email || '')}</p><div class="profile-save-status" data-profile-status role="status">${statusText()}</div>${store.status === 'conflict' ? '<p>別の端末で記録が更新されました。この端末の未同期分は残っています。</p><button id="account-export" class="wood-button">この端末の記録をダウンロード</button><button id="account-cloud" class="plain-button">未同期分を端末に退避して、クラウドを読み込む</button>' : '<button id="account-sync" class="wood-button">記録を同期してホームへ</button>'}${store.canImportGuest() ? '<div class="account-import"><h4>これまでの記録を引き継ぐ</h4><p>このブラウザでログインせずに学んだ記録が見つかりました。元のデータを残したまま、このアカウントに保存できます。</p><button id="account-import" class="red-button">この端末の学習記録を引き継ぐ</button></div>' : ''}<p class="auth-note">学習記録・FSRSの状態・自作問題・タイピング記録を、このアカウントに保存します。ログアウト後も記録は保持されます。未同期の記録は、このブラウザに保存します。</p><button id="account-signout" class="plain-button">ログアウト</button><p id="account-message" role="status"></p></div>`);
    const action = (id, handler) => { const button = q(id); if (button) button.onclick = async () => { button.disabled = true; try { await handler(); } catch { const message = q('#account-message'); if (message) message.textContent = '処理を完了できませんでした。記録はこの端末に残っています。'; } finally { if (button.isConnected) button.disabled = false; } }; };
    action('#account-sync', async () => { if (await store.retry()) auth.reload(); else profile(); });
    action('#account-import', async () => { await store.importGuest(); auth.reload(); });
    action('#account-cloud', async () => { await store.loadCloudCopy(); auth.reload(); });
    action('#account-signout', () => auth.signOut());
    action('#account-export', () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, data: store.data }, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'sushi-study-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  q('#account-button').onclick = () => auth.recovery ? recovery() : store.user ? profile() : form();
  store.subscribe(header); header();
  window.addEventListener('sushi-password-recovery', recovery);
  if (auth.recovery) recovery();
  if (auth.error) toast('ログイン情報を確認できませんでした。ゲストの記録はこの端末に保存します。');
  if (store.memoryOnly) toast('このブラウザでは端末保存が使えません。ページを閉じると未同期の記録が消えるため、保存状況をご確認ください。');
}
