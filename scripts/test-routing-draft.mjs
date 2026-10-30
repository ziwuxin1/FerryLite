import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTING_DRAFT_KEY, loadRoutingDraft, saveRoutingDraft, clearRoutingDraft } from '../src/routing-draft.ts';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};
const sample = () => ({
  version: 1, groups: [{ id: 'custom-test-1', name: '我的站点', country: 'ca', enabled: true }],
  sites: [{ name: 'Example', domains: ['example.org'], upstream: '自定义线路 · 加拿大', category: 'custom-test-1', enabled: false }],
  edits: [['Example', { removedRules: ['DOMAIN-SUFFIX,example.org,Example'], domains: ['cdn.example.org'], iconDomain: 'cdn.example.org' }]],
  apps: [['steam', false], ['youtube', true]], target: 'nikki', dnsOverride: false,
});
test('routing groups, sites, edits and choices survive a storage round trip', () => {
  const storage = memoryStorage(), state = sample();
  assert.equal(loadRoutingDraft(storage), null);
  saveRoutingDraft(storage, state);
  assert.deepEqual(loadRoutingDraft(storage), state);
  state.sites[0].domains.push('later.example.org');
  assert.deepEqual(loadRoutingDraft(storage).sites[0].domains, ['example.org']);
});
test('deleted groups and sites stay deleted after another save', () => {
  const storage = memoryStorage(), state = sample();
  saveRoutingDraft(storage, state);
  state.groups = []; state.sites = []; state.edits = [];
  saveRoutingDraft(storage, state);
  assert.deepEqual(loadRoutingDraft(storage).groups, []);
  assert.deepEqual(loadRoutingDraft(storage).sites, []);
  assert.deepEqual(loadRoutingDraft(storage).edits, []);
});
test('Reset clears only FerryLite routing data and a reload starts empty', () => {
  const storage = memoryStorage();
  storage.setItem('unrelated', 'keep');
  saveRoutingDraft(storage, sample()); clearRoutingDraft(storage);
  assert.equal(loadRoutingDraft(storage), null);
  assert.equal(storage.getItem('unrelated'), 'keep');
});
test('serialization excludes credentials, subscription URLs and unknown fields', () => {
  const storage = memoryStorage(), state = sample();
  state.password = 'secret-password'; state.airports = [{url: 'https://secret.test/token'}];
  state.groups[0].password = 'nested-secret';
  saveRoutingDraft(storage, state);
  assert(!storage.getItem(ROUTING_DRAFT_KEY).includes('secret'));
  assert.equal(loadRoutingDraft(storage).password, undefined);
});
test('invalid versions, broken category links and corrupted JSON are not silently overwritten', () => {
  const storage = memoryStorage();
  for (const raw of ['{broken', JSON.stringify({...sample(), version: 2}), JSON.stringify({...sample(), groups: []})]) {
    storage.setItem(ROUTING_DRAFT_KEY, raw);
    assert.throws(() => loadRoutingDraft(storage));
    assert.equal(storage.getItem(ROUTING_DRAFT_KEY), raw);
  }
});
test('storage-denied or quota errors propagate instead of reporting success', () => {
  const storage = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('denied'); } };
  assert.throws(() => loadRoutingDraft(storage), /denied/);
  assert.throws(() => saveRoutingDraft(storage, sample()), /quota/);
  assert.throws(() => clearRoutingDraft(storage), /denied/);
});
