import { accountStore } from './account-store.js';
import { AUTH_CONFIG } from './config.js';

export function validAuthConfig(config) {
  try {
    const url = new URL(config.supabaseUrl), key = config.supabasePublishableKey;
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return false;
    if (typeof key !== 'string' || key.startsWith('sb_secret_')) return false;
    if (key.startsWith('sb_publishable_') && key.length >= 30) return true;
    const claims = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return claims.role === 'anon';
  } catch { return false; }
}
export function createProfileRepository(client) {
  return {
    async read(id) {
      const { data, error } = await client.from('sushi_profiles').select('data, revision, updated_at').eq('user_id', id).maybeSingle();
      if (error) throw error; return data;
    },
    async write(id, data, revision) {
      const table = client.from('sushi_profiles');
      const query = revision === 0 ? table.insert({ user_id: id, data, revision: 1 }) : table.update({ data, revision: revision + 1 }).eq('user_id', id).eq('revision', revision);
      const result = await query.select('revision, updated_at').maybeSingle();
      if (result.error?.code === '23505') return null;
      if (result.error) throw result.error;
      return result.data;
    }
  };
}
export class AuthController {
  constructor({ config = AUTH_CONFIG, store = accountStore, reload = () => location.reload(), navigate = url => {
    const link = document.createElement('a'); link.href = url; link.target = '_top'; link.rel = 'noopener'; document.body.append(link); link.click(); link.remove();
  }, origin = globalThis.location?.origin || 'https://localhost.invalid', onRecovery = () => globalThis.dispatchEvent?.(new Event('sushi-password-recovery')), defer = callback => setTimeout(callback, 0), request = (...args) => fetch(...args), recoveryRequested = new URLSearchParams(globalThis.location?.search || '').get('flow') === 'recovery' } = {}) {
    this.config = config; this.store = store; this.reload = reload; this.navigate = navigate; this.origin = origin;
    this.configured = validAuthConfig(config); this.client = null; this.recovery = false; this.initialized = false;
    this.onRecovery = onRecovery; this.defer = defer;
    this.request = request;
    this.recoveryRequested = recoveryRequested;
  }
  async start(createClient) {
    if (!this.configured) return;
    this.client = createClient(this.config.supabaseUrl, this.config.supabasePublishableKey, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }, global: { fetch: (url, options) => fetch(url, { ...options, signal: options?.signal || AbortSignal.timeout(12000) }) } });
    this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { this.recovery = true; this.onRecovery(); }
      if (this.initialized && ['SIGNED_IN', 'SIGNED_OUT'].includes(event) && (session?.user?.id || null) !== (this.store.user?.id || null)) this.defer(() => this.reload());
    });
    try {
      const { data, error } = await this.client.auth.getSession(); if (error) throw error;
      if (data.session?.user) { await this.store.connect(data.session.user, createProfileRepository(this.client)); if (this.recoveryRequested) this.recovery = true; }
    } catch { this.error = true; }
    this.initialized = true;
  }
  async google() {
    const response = await this.request(`${this.config.supabaseUrl.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: this.config.supabasePublishableKey }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('auth_unavailable');
    const settings = await response.json();
    if (settings.external?.google === false) throw Object.assign(new Error('provider_disabled'), { code: 'provider_disabled' });
    const { data, error } = await this.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${this.origin}/`, skipBrowserRedirect: true } });
    if (error) throw error; if (!data.url) throw new Error('auth_unavailable'); this.navigate(data.url);
  }
  async email(mode, email, password) {
    let result;
    if (mode === 'signup') result = await this.client.auth.signUp({ email, password, options: { emailRedirectTo: `${this.origin}/` } });
    else if (mode === 'reset') result = await this.client.auth.resetPasswordForEmail(email, { redirectTo: `${this.origin}/?flow=recovery` });
    else result = await this.client.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    return result.data;
  }
  async updatePassword(password) {
    const { error } = await this.client.auth.updateUser({ password }); if (error) throw error;
    this.recovery = false; this.reload();
  }
  async signOut() {
    for (let i = 0; i < 3 && this.store.pending; i++) if (!await this.store.flush()) break;
    const { error } = await this.client.auth.signOut({ scope: 'local' }); if (error) throw error;
    this.reload();
  }
}
export const authController = new AuthController();
