import { assert, test } from 'orca/testing'
import { NotePreferences } from './note-preferences'
import { NOTE_LIMIT_KEY, SOURCE_LINE_NUMBERS_KEY } from './note-settings'

function fixture(values = new Map<string, unknown>()) {
  const store = {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: unknown) => { values.set(key, value) }
  }
  return { values, store, preferences: new NotePreferences(store, () => {}) }
}

test('preference changes apply immediately and persist independently', async () => {
  const f = fixture()
  await f.preferences.loaded
  const limit = f.preferences.chooseLimit(123)
  const numbers = f.preferences.chooseLineNumbers(false)
  assert.equal(f.preferences.view.limit, 123)
  assert.equal(f.preferences.view.lineNumbers, false)
  await Promise.all([limit, numbers])
  const reloaded = fixture(f.values)
  await reloaded.preferences.loaded
  assert.equal(reloaded.preferences.view.limit, 123)
  assert.equal(reloaded.preferences.view.lineNumbers, false)
  await f.preferences.chooseLimit(null)
  const unlimited = fixture(f.values)
  await unlimited.preferences.loaded
  assert.equal(unlimited.preferences.view.limit, null)
  assert.equal(unlimited.preferences.view.lineNumbers, false)
})

test('rapid preference changes preserve the latest choice across delayed writes', async () => {
  const f = fixture()
  await f.preferences.loaded
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const originalSet = f.store.set
  let first = true
  f.store.set = async (key, value) => {
    if (first) { first = false; started.resolve(); await release.promise }
    await originalSet(key, value)
  }
  const firstLimit = f.preferences.chooseLimit(12)
  await started.promise
  const firstToggle = f.preferences.chooseLineNumbers(false)
  const latestLimit = f.preferences.chooseLimit(123)
  const latestToggle = f.preferences.chooseLineNumbers(true)
  assert.equal(f.preferences.view.limit, 123)
  assert.equal(f.preferences.view.lineNumbers, true)
  release.resolve()
  await Promise.all([firstLimit, firstToggle, latestLimit, latestToggle])
  const reloaded = fixture(f.values)
  await reloaded.preferences.loaded
  assert.equal(reloaded.preferences.view.limit, 123)
  assert.equal(reloaded.preferences.view.lineNumbers, true)
})

test('failed preference writes restore applied values and the same choices can be retried', async () => {
  const f = fixture(new Map<string, unknown>([[SOURCE_LINE_NUMBERS_KEY, true]]))
  await f.preferences.loaded
  await f.preferences.chooseLimit(321)
  const originalSet = f.store.set
  f.store.set = async () => { throw new Error('Preference write failed') }
  await Promise.all([f.preferences.chooseLimit(654), f.preferences.chooseLineNumbers(false)])
  assert.equal(f.preferences.view.limit, 321)
  assert.equal(f.preferences.view.lineNumbers, true)
  const reloaded = fixture(f.values)
  await reloaded.preferences.loaded
  assert.equal(reloaded.preferences.view.limit, 321)
  f.store.set = originalSet
  await Promise.all([f.preferences.chooseLimit(654), f.preferences.chooseLineNumbers(false)])
  const retried = fixture(f.values)
  await retried.preferences.loaded
  assert.equal(retried.preferences.view.limit, 654)
  assert.equal(retried.preferences.view.lineNumbers, false)
})

test('unreadable preferences remain fail-closed until each is explicitly replaced', async () => {
  const f = fixture(new Map<string, unknown>([[NOTE_LIMIT_KEY, 'bad'], [SOURCE_LINE_NUMBERS_KEY, 'bad']]))
  await f.preferences.loaded
  assert.equal(f.preferences.view.ready, false)
  await f.preferences.chooseLineNumbers(false)
  assert.equal(f.preferences.view.ready, false)
  assert.equal(f.values.get(NOTE_LIMIT_KEY), 'bad')
  await f.preferences.chooseLimit(123)
  assert.equal(f.preferences.view.ready, true)
  const reloaded = fixture(f.values)
  await reloaded.preferences.loaded
  assert.equal(reloaded.preferences.view.limit, 123)
  assert.equal(reloaded.preferences.view.lineNumbers, false)
})
