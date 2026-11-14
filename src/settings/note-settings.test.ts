/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadConfirmNoteDeletion, saveConfirmNoteDeletion, loadSourceLineNumbers, saveSourceLineNumbers, SOURCE_LINE_NUMBERS_KEY, CONFIRM_NOTE_DELETION_KEY, loadDefaultNoteMode, saveDefaultNoteMode, DEFAULT_NOTE_MODE_KEY, type DefaultNoteMode } from './note-settings'

function memoryStore() {
  const values = new Map<string, unknown>()
  return { values, get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: unknown) => { values.set(key, value) } }
}
test('confirmation defaults on and settings persist independently without touching legacy limits', async () => {
  const store = memoryStore()
  store.values.set('settings:note-character-limit', { characterLimit: 1 })
  assert.equal(await loadConfirmNoteDeletion(store), true)
  assert.equal(await loadSourceLineNumbers(store), true)
  await saveConfirmNoteDeletion(store, false); await saveSourceLineNumbers(store, false)
  assert.equal(await loadConfirmNoteDeletion(store), false)
  assert.equal(await loadSourceLineNumbers(store), false)
  await saveConfirmNoteDeletion(store, true)
  assert.equal(await loadConfirmNoteDeletion(store), true)
  assert.equal(await loadSourceLineNumbers(store), false)
  assert.deepEqual(store.values.get('settings:note-character-limit'), { characterLimit: 1 })
})
test('malformed stored and chosen boolean settings fail closed', async () => {
  for (const value of ['off', 0, {}, []]) {
    const store = memoryStore()
    store.values.set(SOURCE_LINE_NUMBERS_KEY, value); store.values.set(CONFIRM_NOTE_DELETION_KEY, value)
    await assert.rejects(() => loadSourceLineNumbers(store))
    await assert.rejects(() => loadConfirmNoteDeletion(store))
    await assert.rejects(() => saveSourceLineNumbers(store, value as boolean))
    await assert.rejects(() => saveConfirmNoteDeletion(store, value as boolean))
  }
})

test('default note mode defaults to editing, persists independently, and rejects invalid values', async () => {
  const store = memoryStore()
  assert.equal(await loadDefaultNoteMode(store), 'editing')
  await saveDefaultNoteMode(store, 'reading')
  assert.equal(await loadDefaultNoteMode(store), 'reading')
  assert.equal(await loadSourceLineNumbers(store), true)
  for (const value of ['Reading', false, 0, {}, []]) {
    store.values.set(DEFAULT_NOTE_MODE_KEY, value)
    await assert.rejects(() => loadDefaultNoteMode(store))
    await assert.rejects(() => saveDefaultNoteMode(store, value as DefaultNoteMode))
  }
})
