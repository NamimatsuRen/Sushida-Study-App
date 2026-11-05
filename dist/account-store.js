export const ACCOUNT_KEYS = ['sushi-type-learning-v1', 'sushi-type-english-v2'];
export function accountHasRecords(data) {
  try {
    const learning = JSON.parse(data?.[ACCOUNT_KEYS[0]] || '{}');
    const arcade = JSON.parse(data?.[ACCOUNT_KEYS[1]] || '{}');
    return Boolean(Object.keys(learning.progress || {}).length || learning.logs?.length || Object.keys(learning.activity || {}).length || learning.markdown || arcade.history?.length || Object.keys(arcade.bests || {}).length);
  } catch { return true; }
}
export function validAccountData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid_data');
  const result = {};
  for (const key of ACCOUNT_KEYS) if (data[key] !== undefined) {
    if (typeof data[key] !== 'string' || data[key].length > 2000000) throw new Error('invalid_data');
    const parsed = JSON.parse(data[key]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_data');
    result[key] = data[key];
  }
  return result;
}

export class AccountStore {
  constructor({ local, schedule = callback => setTimeout(callback, 750), cancel = id => clearTimeout(id) } = {}) {
    if (!local) try { local = globalThis.localStorage; } catch { /* Browser storage may be disabled. */ }
    this.memoryOnly = !local;
    if (!local) { const memory = new Map(); local = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) }; }
    this.local = local; this.schedule = schedule; this.cancel = cancel; this.user = null; this.data = {};
    this.revision = null; this.pending = false; this.ready = false; this.status = 'guest';
    this.sequence = 0; this.listeners = new Set(); this.timer = null; this.saving = null; this.repository = null;
  }
  cacheKey() { return `sushi-account-cache-v1:${this.user.id}`; }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit() { for (const listener of this.listeners) listener(this); }
  cache() {
    try { this.local.setItem(this.cacheKey(), JSON.stringify({ data: this.data, revision: this.revision, pending: this.pending })); this.cacheError = false; }
    catch { this.cacheError = true; }
  }
  async connect(user, repository) {
    this.user = user; this.repository = repository; this.ready = false; this.status = 'loading';
    let cached;
    try { cached = JSON.parse(this.local.getItem(this.cacheKey()) || 'null'); if (cached) cached.data = validAccountData(cached.data); } catch { cached = null; }
    this.data = cached?.data || {}; this.revision = Number.isSafeInteger(cached?.revision) ? cached.revision : null; this.pending = cached?.pending === true;
    this.emit();
    try {
      const cloud = await repository.read(user.id);
      const revision = cloud?.revision || 0;
      if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('invalid_revision');
      if (this.pending && this.revision !== revision && !(this.revision === null && revision === 0)) {
        this.status = 'conflict'; this.emit(); return;
      }
      if (!this.pending) this.data = validAccountData(cloud?.data || {});
      this.revision = revision; this.ready = true; this.status = this.pending ? 'pending' : 'synced';
      this.cache(); this.emit(); if (this.pending) this.queue();
    } catch { this.status = 'offline'; this.emit(); }
  }
  getItem(key) { return this.user && ACCOUNT_KEYS.includes(key) ? this.data[key] ?? null : this.local.getItem(key); }
  setItem(key, value) {
    if (!this.user || !ACCOUNT_KEYS.includes(key)) { this.local.setItem(key, value); return; }
    validAccountData({ [key]: value });
    this.data = { ...this.data, [key]: value }; this.pending = true; this.sequence++;
    if (this.status !== 'conflict' && this.ready) this.status = 'pending';
    this.cache(); this.emit(); this.queue();
  }
  queue() {
    if (!this.ready || this.status === 'conflict') return;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = this.schedule(() => { this.timer = null; void this.flush(); });
  }
  async flush() {
    if (this.saving) return this.saving;
    if (!this.user || !this.ready || !this.pending || this.status === 'conflict') return !this.pending;
    const id = this.user.id, sequence = this.sequence, data = { ...this.data }, revision = this.revision;
    this.status = 'saving'; this.emit();
    this.saving = (async () => {
      try {
        const result = await this.repository.write(id, data, revision);
        if (this.user?.id !== id) return false;
        if (!result) { this.status = 'conflict'; this.ready = false; this.emit(); return false; }
        this.revision = result.revision; this.pending = this.sequence !== sequence;
        this.status = this.pending ? 'pending' : 'synced'; this.cache(); this.emit(); return true;
      } catch { this.status = 'offline'; this.emit(); return false; }
      finally { this.saving = null; if (this.pending && this.status === 'pending') this.queue(); }
    })();
    return this.saving;
  }
  guestData() { try { return Object.fromEntries(ACCOUNT_KEYS.map(key => [key, this.local.getItem(key)]).filter(([, value]) => value !== null)); } catch { return {}; } }
  canImportGuest() { return this.user && this.ready && !accountHasRecords(this.data) && accountHasRecords(this.guestData()); }
  async importGuest() {
    if (!this.canImportGuest()) throw new Error('import_not_available');
    const guest = validAccountData(this.guestData());
    for (const [key, value] of Object.entries(guest)) this.setItem(key, value);
    return this.flush();
  }
  async retry() {
    if (!this.user || this.status === 'conflict') return false;
    await this.connect(this.user, this.repository); return this.ready && this.flush();
  }
  async loadCloudCopy() {
    if (!this.user) return false;
    // Explicit recovery only: retain the unsynced copy before loading another device's data.
    this.local.setItem(`${this.cacheKey()}:backup`, JSON.stringify({ data: this.data, revision: this.revision, at: Date.now() }));
    const cloud = await this.repository.read(this.user.id);
    this.data = validAccountData(cloud?.data || {}); this.revision = cloud?.revision || 0;
    this.pending = false; this.ready = true; this.status = 'synced'; this.cache(); this.emit(); return true;
  }
}
export const accountStore = new AccountStore();
