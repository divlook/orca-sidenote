/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NotePreferences } from './note-preferences'
import { CONFIRM_NOTE_DELETION_KEY, SOURCE_LINE_NUMBERS_KEY, DEFAULT_NOTE_MODE_KEY } from './note-settings'

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
  const confirmation = f.preferences.chooseConfirmDelete(false)
  const numbers = f.preferences.chooseLineNumbers(false)
  assert.equal(f.preferences.view.confirmDelete, false)
  assert.equal(f.preferences.view.lineNumbers, false)
  await Promise.all([confirmation, numbers])
  const reloaded = fixture(f.values)
  await reloaded.preferences.loaded
  assert.equal(reloaded.preferences.view.confirmDelete, false)
  assert.equal(reloaded.preferences.view.lineNumbers, false)
  await f.preferences.chooseConfirmDelete(true)
  const unlimited = fixture(f.values)
  await unlimited.preferences.loaded
  assert.equal(unlimited.preferences.view.confirmDelete, true)
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
  const firstConfirmation = f.preferences.chooseConfirmDelete(false)
  await started.promise
  const firstToggle = f.preferences.chooseLineNumbers(false)
  const latestConfirmation = f.preferences.chooseConfirmDelete(true)
  const latestToggle = f.preferences.chooseLineNumbers(true)
  assert.equal(f.preferences.view.confirmDelete, true)
  assert.equal(f.preferences.view.lineNumbers, true)
  release.resolve()
  await Promise.all([firstConfirmation, firstToggle, latestConfirmation, latestToggle])
  const reloaded = fixture(f.values)
  await reloaded.preferences.loaded
  assert.equal(reloaded.preferences.view.confirmDelete, true)
  assert.equal(reloaded.preferences.view.lineNumbers, true)
})

test('failed preference writes restore applied values and the same choices can be retried', async () => {
  const f = fixture(new Map<string, unknown>([[SOURCE_LINE_NUMBERS_KEY, true]]))
  await f.preferences.loaded
  await f.preferences.chooseConfirmDelete(false)
  const originalSet = f.store.set
  f.store.set = async () => { throw new Error('Preference write failed') }
  await Promise.all([f.preferences.chooseConfirmDelete(true), f.preferences.chooseLineNumbers(false)])
  assert.equal(f.preferences.view.confirmDelete, false)
  assert.equal(f.preferences.view.lineNumbers, true)
  const reloaded = fixture(f.values)
  await reloaded.preferences.loaded
  assert.equal(reloaded.preferences.view.confirmDelete, false)
  f.store.set = originalSet
  await Promise.all([f.preferences.chooseConfirmDelete(true), f.preferences.chooseLineNumbers(false)])
  const retried = fixture(f.values)
  await retried.preferences.loaded
  assert.equal(retried.preferences.view.confirmDelete, true)
  assert.equal(retried.preferences.view.lineNumbers, false)
})

test('unreadable preferences remain fail-closed until each is explicitly replaced', async () => {
  const f = fixture(new Map<string, unknown>([[CONFIRM_NOTE_DELETION_KEY, 'bad'], [SOURCE_LINE_NUMBERS_KEY, 'bad'], ['settings:note-character-limit', 'legacy-unreadable']]))
  await f.preferences.loaded
  assert.equal(f.preferences.view.ready, false)
  await f.preferences.chooseLineNumbers(false)
  assert.equal(f.preferences.view.ready, false)
  assert.equal(f.values.get(CONFIRM_NOTE_DELETION_KEY), 'bad')
  await f.preferences.chooseConfirmDelete(true)
  assert.equal(f.preferences.view.ready, true)
  const reloaded = fixture(f.values)
  await reloaded.preferences.loaded
  assert.equal(reloaded.preferences.view.confirmDelete, true)
  assert.equal(reloaded.preferences.view.lineNumbers, false)
})

test('default mode loads, saves independently, rolls back and retries', async () => {
  const f = fixture()
  await f.preferences.loaded
  assert.equal(f.preferences.view.defaultMode, 'editing')
  const saving = f.preferences.chooseDefaultMode('reading')
  assert.equal(f.preferences.view.defaultMode, 'reading')
  await saving
  assert.equal(f.values.get(DEFAULT_NOTE_MODE_KEY), 'reading')
  const reloaded = fixture(f.values)
  await reloaded.preferences.loaded
  assert.equal(reloaded.preferences.view.defaultMode, 'reading')
  const originalSet = f.store.set
  f.store.set = async () => { throw new Error('Mode write failed') }
  await f.preferences.chooseDefaultMode('editing')
  assert.equal(f.preferences.view.defaultMode, 'reading')
  assert.equal(f.preferences.view.confirmDelete, true)
  assert.equal(f.preferences.view.lineNumbers, true)
  f.store.set = originalSet
  await f.preferences.chooseDefaultMode('editing')
  assert.equal(f.values.get(DEFAULT_NOTE_MODE_KEY), 'editing')
})

test('unreadable default mode requires explicit replacement without changing other settings', async () => {
  const f = fixture(new Map<string, unknown>([[DEFAULT_NOTE_MODE_KEY, 'invalid'], [CONFIRM_NOTE_DELETION_KEY, false]]))
  await f.preferences.loaded
  assert.equal(f.preferences.view.ready, false)
  await f.preferences.chooseLineNumbers(false)
  assert.equal(f.preferences.view.ready, false)
  await f.preferences.chooseDefaultMode('editing')
  assert.equal(f.preferences.view.ready, true)
  assert.equal(f.preferences.view.confirmDelete, false)
  assert.equal(f.preferences.view.lineNumbers, false)
  assert.equal(f.values.get(DEFAULT_NOTE_MODE_KEY), 'editing')
})

test('preference load failure is published while another setting remains pending', { timeout: 5000 }, async () => {
  const delayed = Promise.withResolvers<unknown>()
  const failed = Promise.withResolvers<void>()
  const store = {
    get: async (key: string): Promise<unknown> => {
      if (key === CONFIRM_NOTE_DELETION_KEY) throw new Error('confirmation unavailable')
      if (key === SOURCE_LINE_NUMBERS_KEY) return delayed.promise
      return 'reading'
    },
    set: async () => {}
  }
  const observations: { initialized: boolean; problem: string }[] = []
  const preferences: NotePreferences = new NotePreferences(store, () => {
    observations.push(preferences.view)
    if (preferences.view.problem.includes('confirmation unavailable')) failed.resolve()
  })
  await failed.promise
  assert.equal(observations.some(view => !view.initialized && view.problem.includes('confirmation unavailable')), true)
  assert.equal(preferences.view.initialized, false)
  assert.equal(preferences.view.ready, false)
  delayed.resolve(false)
  await preferences.loaded
  assert.equal(preferences.view.initialized, true)
  assert.equal(preferences.view.ready, false)
  assert.equal(preferences.view.confirmDelete, true)
  assert.equal(preferences.view.lineNumbers, false)
  assert.equal(preferences.view.defaultMode, 'reading')
})
