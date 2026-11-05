import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthController, validAuthConfig, createProfileRepository } from '../dist/auth.js';
const config = { supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'sb_publishable_12345678901234567890' };
const origin = 'https://study.example.test';
function clientMock(session = null) {
  const calls = []; let handler;
  const client = { calls, emit: (...args) => handler(...args), auth: {
    onAuthStateChange(fn) { handler = fn; }, async getSession() { return { data: { session } }; },
    async signInWithOAuth(options) { calls.push(['google', options]); return { data: { url: 'https://accounts.google.com/test' } }; },
    async signInWithPassword(options) { calls.push(['login', options]); return { data: { session: {} } }; },
    async signUp(options) { calls.push(['signup', options]); return { data: { session: null } }; },
    async resetPasswordForEmail(email, options) { calls.push(['reset', email, options]); return {}; },
    async updateUser(options) { calls.push(['update', options]); return {}; },
    async signOut(options) { calls.push(['signout', options]); return {}; }
  } };
  return client;
}

test('configuration accepts only a public key over HTTPS and rejects privileged keys', () => {
  assert.equal(validAuthConfig(config), true);
  for (const supabasePublishableKey of ['sb_secret_not-for-browser', 'bad-key', '', 'a.' + btoa(JSON.stringify({ role: 'service_role' })) + '.c']) assert.equal(validAuthConfig({ ...config, supabasePublishableKey }), false);
  assert.equal(validAuthConfig({ ...config, supabasePublishableKey: 'a.' + btoa(JSON.stringify({ role: 'anon' })) + '.c' }), true);
  for (const supabaseUrl of ['http://example.supabase.co', 'https://user:pass@example.test', 'https://example.test/path', 'https://example.test/?key=x']) assert.equal(validAuthConfig({ ...config, supabaseUrl }), false);
});
test('initialization uses PKCE and the authenticated Supabase user for profile loading', async () => {
  const client = clientMock({ user: { id: 'alice' } }); let options, connected;
  const store = { user: null, async connect(user, repository) { connected = { user, repository }; this.user = user; } };
  const auth = new AuthController({ config, origin, store, recoveryRequested: true });
  await auth.start((url, key, value) => { assert.equal(url, config.supabaseUrl); assert.equal(key, config.supabasePublishableKey); options = value; return client; });
  assert.equal(options.auth.flowType, 'pkce'); assert.equal(options.auth.persistSession, true);
  assert.equal(connected.user.id, 'alice'); assert.equal(typeof connected.repository.write, 'function'); assert.equal(auth.recovery, true);
});
test('Google OAuth uses the current site return URL and top-level navigation after checking provider availability', async () => {
  const client = clientMock(); let navigated;
  const auth = new AuthController({ config, origin, store: {}, navigate: url => navigated = url, request: async (url, options) => {
    assert.equal(url, config.supabaseUrl + '/auth/v1/settings'); assert.equal(options.headers.apikey, config.supabasePublishableKey);
    return { ok: true, json: async () => ({ external: { google: true } }) };
  } });
  auth.client = client; await auth.google();
  assert.equal(navigated, 'https://accounts.google.com/test');
  assert.deepEqual(client.calls[0][1], { provider: 'google', options: { redirectTo: origin + '/', skipBrowserRedirect: true } });
});
test('disabled Google provider stays on the app instead of navigating to an error page', async () => {
  const auth = new AuthController({ config, origin, request: async () => ({ ok: true, json: async () => ({ external: { google: false } }) }) });
  auth.client = clientMock(); await assert.rejects(() => auth.google(), error => error.code === 'provider_disabled');
  assert.equal(auth.client.calls.length, 0);
});
test('email login, confirmed signup and recovery use the hosted auth service, not local password storage', async () => {
  const client = clientMock(), auth = new AuthController({ config, origin }); auth.client = client;
  await auth.email('login', 'person@example.test', 'password');
  const signup = await auth.email('signup', 'person@example.test', 'password'); assert.equal(signup.session, null);
  await auth.email('reset', 'person@example.test');
  assert.deepEqual(client.calls[0], ['login', { email: 'person@example.test', password: 'password' }]);
  assert.equal(client.calls[1][1].options.emailRedirectTo, origin + '/');
  assert.equal(client.calls[2][2].redirectTo, origin + '/?flow=recovery');
});
test('auth errors do not get converted into successful sign-in or account updates', async () => {
  const client = clientMock(), auth = new AuthController({ config, origin }); auth.client = client;
  const failure = { code: 'invalid_credentials' }; client.auth.signInWithPassword = async () => ({ error: failure });
  await assert.rejects(() => auth.email('login', 'person@example.test', 'wrong'), error => error === failure);
});
test('identity changes reload the app, token refresh does not, and recovery opens its own flow', async () => {
  const client = clientMock(), tasks = []; let reloads = 0, recoveries = 0;
  const auth = new AuthController({ config, origin, store: { user: null }, recoveryRequested: true, defer: callback => tasks.push(callback), reload: () => reloads++, onRecovery: () => recoveries++ });
  await auth.start(() => client); assert.equal(auth.recovery, false);
  client.emit('TOKEN_REFRESHED', { user: { id: 'alice' } }); assert.equal(tasks.length, 0);
  client.emit('SIGNED_IN', { user: { id: 'alice' } }); assert.equal(tasks.length, 1); tasks[0](); assert.equal(reloads, 1);
  client.emit('PASSWORD_RECOVERY', { user: { id: 'alice' } }); assert.equal(auth.recovery, true); assert.equal(recoveries, 1);
});
test('sign-out drains pending work and requests only the current browser session to sign out', async () => {
  const client = clientMock(); let flushed = 0, reloads = 0;
  const store = { pending: true, async flush() { flushed++; this.pending = flushed < 2; return true; } };
  const auth = new AuthController({ config, origin, store, reload: () => reloads++ }); auth.client = client;
  await auth.signOut(); assert.equal(flushed, 2); assert.deepEqual(client.calls.at(-1), ['signout', { scope: 'local' }]); assert.equal(reloads, 1);
});
test('profile writes include both user ownership and optimistic revision checks', async () => {
  const calls = [], result = { data: { revision: 3 } };
  const chain = { select(...args) { calls.push(['select', ...args]); return this; }, eq(...args) { calls.push(['eq', ...args]); return this; }, update(...args) { calls.push(['update', ...args]); return this; }, insert(...args) { calls.push(['insert', ...args]); return this; }, async maybeSingle() { return result; } };
  const repo = createProfileRepository({ from(name) { assert.equal(name, 'sushi_profiles'); return chain; } });
  await repo.write('alice', {}, 2);
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'alice'));
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'revision' && call[2] === 2));
  result.data = null; assert.equal(await repo.write('alice', {}, 2), null);
  result.error = { code: '23505' }; assert.equal(await repo.write('alice', {}, 0), null);
});
