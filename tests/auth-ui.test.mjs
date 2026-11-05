import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
function setup(configured = true) {
  const dom = new JSDOM('<button id="account-button"></button><span id="account-status"></span><dialog id="dialog"><h2 id="dialog-title"></h2><div id="dialog-body"></div></dialog>', { url: 'https://study.example.test', runScripts: 'outside-only' });
  const w = dom.window, calls = [];
  const auth = { configured, user: null, recovery: false, async google() { calls.push(['google']); }, async email(...args) { calls.push(['email', ...args]); return { session: null }; }, reload() { calls.push(['reload']); }, async signOut() { calls.push(['signout']); }, async updatePassword(password) { calls.push(['update', password]); } };
  const store = { status: 'guest', user: null, data: {}, subscribe(fn) { this.notify = fn; }, canImportGuest() { return false; }, async retry() { calls.push(['retry']); return true; } };
  w.auth = auth; w.store = store;
  w.openDialog = (title, body) => { w.document.querySelector('#dialog-title').textContent = title; w.document.querySelector('#dialog-body').innerHTML = body; w.document.querySelector('#dialog').open = true; };
  w.escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  w.toast = message => calls.push(['toast', message]);
  w.eval(readFileSync(new URL('../dist/auth-ui.js', import.meta.url), 'utf8').replace(/export /g, '') + '\nmountAccountUI({auth,store,openDialog,escape,toast});');
  const q = selector => w.document.querySelector(selector), click = selector => { assert.ok(q(selector), selector); q(selector).click(); };
  return { w, q, click, auth, store, calls, settle: () => new Promise(resolve => setImmediate(resolve)) };
}
test('login, registration, reset and Google buttons invoke the actual auth controller paths', async () => {
  const { w, q, click, calls, settle } = setup(); click('#account-button');
  assert.equal(q('#auth-password').autocomplete, 'current-password');
  click('[data-auth-mode="signup"]'); assert.equal(q('#auth-password').getAttribute('minlength'), '8');
  q('#auth-email').value = 'person@example.test'; q('#auth-password').value = 'new-password';
  q('#auth-form').dispatchEvent(new w.Event('submit', { cancelable: true })); await settle();
  assert.deepEqual(calls[0], ['email', 'signup', 'person@example.test', 'new-password']);
  assert.ok(q('#auth-message').textContent.includes('確認メール'));
  click('#auth-reset'); assert.equal(q('#auth-password'), null);
  q('#auth-form').dispatchEvent(new w.Event('submit', { cancelable: true })); await settle(); assert.equal(calls[1][1], 'reset');
  click('[data-auth-mode="login"]'); click('#auth-google'); await settle(); assert.equal(calls[2][0], 'google');
  w.close();
});
test('login failure remains visible, re-enables the form, and never reports success', async () => {
  const { w, q, click, auth, settle } = setup();
  auth.email = async () => { throw { code: 'invalid_credentials' }; }; click('#account-button');
  q('#auth-email').value = 'person@example.test'; q('#auth-password').value = 'wrong-password';
  q('#auth-form').dispatchEvent(new w.Event('submit', { cancelable: true })); await settle();
  assert.ok(q('#auth-message').textContent.includes('ご確認')); assert.equal(q('#auth-message').textContent.includes('ログインしました'), false);
  assert.equal(q('.auth-submit').disabled, false); w.close();
});
test('an unconfigured app explicitly offers guest use and does not fake login', () => {
  const { w, q, click, calls } = setup(false); click('#account-button');
  assert.equal(q('#auth-google').disabled, true); assert.equal(q('.auth-submit').disabled, true);
  assert.ok(q('#auth-message').textContent.includes('ゲスト')); click('#auth-google'); assert.equal(calls.length, 0); w.close();
});
test('responses from a previous auth dialog do not overwrite or crash another screen', async () => {
  const { w, q, click, auth, settle } = setup(); let reject;
  auth.email = () => new Promise((_, fail) => { reject = fail; }); click('#account-button');
  q('#auth-email').value = 'person@example.test'; q('#auth-password').value = 'password';
  q('#auth-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  q('#dialog-body').innerHTML = '<p id="new-screen">設定画面</p>'; reject({ code: 'invalid_credentials' }); await settle();
  assert.equal(q('#new-screen').textContent, '設定画面'); w.close();
});
test('account details are escaped and manual refresh reloads data into the study application', async () => {
  const { w, q, click, store, calls, settle } = setup(); store.user = { id: 'a', email: '<img src=x>', user_metadata: { full_name: '<script>bad()</script>' } }; store.status = 'synced';
  store.notify(); click('#account-button'); assert.equal(q('#dialog-body img'), null); assert.equal(q('#dialog-body script'), null);
  assert.ok(q('.account-profile h3').textContent.includes('<script>'));
  click('#account-sync'); await settle(); assert.deepEqual(calls.map(c => c[0]), ['retry', 'reload']); w.close();
});
test('password recovery has a distinct form and calls updatePassword', async () => {
  const { w, q, auth, calls, settle } = setup(); auth.recovery = true;
  w.dispatchEvent(new w.Event('sushi-password-recovery')); q('#new-password').value = 'a-new-password';
  q('#password-form').dispatchEvent(new w.Event('submit', { cancelable: true })); await settle();
  assert.deepEqual(calls[0], ['update', 'a-new-password']); w.close();
});
