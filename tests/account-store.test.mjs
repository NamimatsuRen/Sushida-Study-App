import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountStore, ACCOUNT_KEYS, validAccountData } from '../dist/account-store.js';
const learning = ACCOUNT_KEYS[0], arcade = ACCOUNT_KEYS[1];
const record = value => JSON.stringify({ progress: { a: { attempts: value } }, logs: [] });
const localStore = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }; };
const make = local => new AccountStore({ local: local || localStore(), schedule: () => 1, cancel() {} });
function repository() {
  const rows = new Map();
  return { rows, async read(id) { return rows.get(id) || null; }, async write(id, data, revision) {
    const current = rows.get(id); if ((current?.revision || 0) !== revision) return null;
    const row = { data: { ...data }, revision: revision + 1 }; rows.set(id, row); return row;
  } };
}

test('guest records keep the existing keys and never enter another account automatically', async () => {
  const local = localStore(), store = make(local), repo = repository();
  store.setItem(learning, record(1)); assert.equal(local.getItem(learning), record(1));
  await store.connect({ id: 'alice' }, repo); assert.equal(store.getItem(learning), null);
  assert.equal(store.canImportGuest(), true); assert.equal(local.getItem(learning), record(1));
});
test('explicit import saves a complete guest copy once while leaving the original unchanged', async () => {
  const local = localStore(), store = make(local), repo = repository();
  local.setItem(learning, record(5)); local.setItem(arcade, JSON.stringify({ history: [{ score: 123 }] }));
  await store.connect({ id: 'alice' }, repo); assert.equal(await store.importGuest(), true);
  assert.equal(repo.rows.get('alice').data[learning], record(5)); assert.ok(repo.rows.get('alice').data[arcade]);
  assert.equal(local.getItem(learning), record(5)); assert.equal(store.canImportGuest(), false);
  await assert.rejects(() => store.importGuest(), /import_not_available/);
});
test('signing into another account reads only that account and keeps separate local caches', async () => {
  const local = localStore(), repo = repository();
  const alice = make(local); await alice.connect({ id: 'alice' }, repo); alice.setItem(learning, record(3)); await alice.flush();
  const bob = make(local); await bob.connect({ id: 'bob' }, repo); assert.equal(bob.getItem(learning), null);
  bob.setItem(learning, record(7)); await bob.flush();
  const reloaded = make(local); await reloaded.connect({ id: 'alice' }, repo);
  assert.equal(reloaded.getItem(learning), record(3)); assert.equal(repo.rows.get('bob').data[learning], record(7));
});
test('a new device loads cloud progress and correct revision before any writes', async () => {
  const repo = repository(); repo.rows.set('alice', { revision: 4, data: { [learning]: record(8) } });
  const store = make(); await store.connect({ id: 'alice' }, repo);
  assert.equal(store.getItem(learning), record(8)); assert.equal(store.status, 'synced');
  store.setItem(learning, record(9)); await store.flush(); assert.equal(repo.rows.get('alice').revision, 5);
});
test('edits made during a save remain pending and are included in the following revision', async () => {
  const store = make(), repo = repository(); await store.connect({ id: 'alice' }, repo);
  const write = repo.write; let release; repo.write = (...args) => new Promise(resolve => { release = async () => resolve(await write(...args)); });
  store.setItem(learning, record(1)); const first = store.flush(); store.setItem(learning, record(2));
  await release(); assert.equal(await first, true); assert.equal(store.pending, true);
  assert.equal(repo.rows.get('alice').data[learning], record(1));
  repo.write = write; await store.flush(); assert.equal(store.pending, false);
  assert.equal(repo.rows.get('alice').data[learning], record(2)); assert.equal(repo.rows.get('alice').revision, 2);
});
test('concurrent devices cannot silently overwrite the first accepted revision', async () => {
  const repo = repository(), a = make(), b = make();
  await a.connect({ id: 'alice' }, repo); await b.connect({ id: 'alice' }, repo);
  a.setItem(learning, record(1)); b.setItem(learning, record(2));
  assert.equal(await a.flush(), true); assert.equal(await b.flush(), false);
  assert.equal(b.status, 'conflict'); assert.equal(b.getItem(learning), record(2));
  assert.equal(repo.rows.get('alice').data[learning], record(1)); assert.equal(b.pending, true);
});
test('unsynced data survives reload and uploads when its saved cloud revision still matches', async () => {
  const local = localStore(), repo = repository(), before = make(local);
  await before.connect({ id: 'alice' }, repo); before.setItem(learning, record(4));
  const after = make(local); await after.connect({ id: 'alice' }, repo); await after.flush();
  assert.equal(repo.rows.get('alice').data[learning], record(4)); assert.equal(after.pending, false);
});
test('reload preserves a conflicting local copy instead of replacing it with cloud data', async () => {
  const local = localStore(), repo = repository(), a = make(local); await a.connect({ id: 'alice' }, repo);
  a.setItem(learning, record(2)); repo.rows.set('alice', { revision: 1, data: { [learning]: record(8) } });
  const b = make(local); await b.connect({ id: 'alice' }, repo);
  assert.equal(b.status, 'conflict'); assert.equal(b.getItem(learning), record(2)); assert.equal(await b.flush(), false);
});
test('explicit cloud recovery keeps a backup before loading the other device’s revision', async () => {
  const local = localStore(), repo = repository(), store = make(local); await store.connect({ id: 'alice' }, repo);
  store.setItem(learning, record(2)); repo.rows.set('alice', { revision: 1, data: { [learning]: record(8) } });
  await store.loadCloudCopy(); assert.equal(store.getItem(learning), record(8)); assert.equal(store.pending, false);
  const backup = JSON.parse(local.getItem('sushi-account-cache-v1:alice:backup')); assert.equal(backup.data[learning], record(2));
});
test('failed first connection keeps account data separate; retry can later save its local pending work', async () => {
  const local = localStore(), store = make(local), repo = repository(); local.setItem(learning, record(99));
  const read = repo.read; repo.read = async () => { throw new Error('offline'); };
  await store.connect({ id: 'alice' }, repo); assert.equal(store.status, 'offline'); assert.equal(store.getItem(learning), null);
  store.setItem(learning, record(1)); assert.equal(await store.flush(), false);
  repo.read = read; assert.equal(await store.retry(), true); assert.equal(repo.rows.get('alice').data[learning], record(1));
});
test('network failure during save does not drop local progress or report it as synced', async () => {
  const store = make(), repo = repository(); await store.connect({ id: 'alice' }, repo);
  store.setItem(learning, record(2)); repo.write = async () => { throw new Error('offline'); };
  assert.equal(await store.flush(), false); assert.equal(store.status, 'offline'); assert.equal(store.pending, true);
  assert.equal(store.getItem(learning), record(2));
});
test('a full local cache still allows cloud saves and reports that the pending backup failed', async () => {
  const local = localStore(), repo = repository(), store = make(local); await store.connect({ id: 'alice' }, repo);
  local.setItem = () => { throw new Error('quota'); };
  store.setItem(learning, record(2)); assert.equal(store.cacheError, true);
  assert.equal(await store.flush(), true); assert.equal(repo.rows.get('alice').data[learning], record(2)); assert.equal(store.pending, false);
});
test('only recognized JSON records can be uploaded; tokens and unrelated storage keys are excluded', () => {
  assert.deepEqual(validAccountData({ [learning]: record(1), 'sb-auth-token': 'secret' }), { [learning]: record(1) });
  assert.throws(() => validAccountData({ [learning]: 'broken' }));
  assert.throws(() => validAccountData({ [learning]: '[]' }));
  assert.throws(() => validAccountData({ [learning]: 'x'.repeat(2000001) }));
});
