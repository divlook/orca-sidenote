import { assert, test } from 'orca/testing'
import { allowsNoteChange, loadNoteLimit, saveNoteLimit, loadSourceLineNumbers, saveSourceLineNumbers, SOURCE_LINE_NUMBERS_KEY } from './note-settings'

function memoryStore() {
  const values = new Map<string, unknown>()
  return {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: unknown) => { values.set(key, value) }
  }
}

test('custom and unlimited limits survive loading, and invalid values do not replace them', async () => {
  const store = memoryStore()
  await saveNoteLimit(store, 123)
  assert.equal(await loadNoteLimit(store), 123)
  for (const invalid of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, '123', undefined]) {
    let rejected = false
    try { await saveNoteLimit(store, invalid as number) } catch { rejected = true }
    assert.equal(rejected, true)
    assert.equal(await loadNoteLimit(store), 123)
  }
  await saveNoteLimit(store, null)
  assert.equal(await loadNoteLimit(store), null)
})

test('unreadable stored limits are rejected rather than treated as defaults', async () => {
  for (const value of [{}, { characterLimit: 0 }, { characterLimit: '8000' }, 'bad']) {
    let rejected = false
    try { await loadNoteLimit({ get: async () => value }) } catch { rejected = true }
    assert.equal(rejected, true)
  }
})

test('lowering a limit allows non-growing edits to an existing long note', () => {
  assert.equal(allowsNoteChange('abcdef', 'abcdeg', 3), true)
  assert.equal(allowsNoteChange('abcdef', 'abcde', 3), true)
  assert.equal(allowsNoteChange('abcdef', 'abcdefg', 3), false)
  assert.equal(allowsNoteChange('abcdef', 'abcdefg', null), true)
})

test('Source visibility persists independently of older limit settings and rejects malformed data', async () => {
  const store = memoryStore()
  await saveNoteLimit(store, 123)
  await saveSourceLineNumbers(store, false)
  assert.equal(await loadSourceLineNumbers(store), false)
  assert.equal(await loadNoteLimit(store), 123)
  await saveSourceLineNumbers(store, true)
  assert.equal(await loadSourceLineNumbers(store), true)
  for (const value of ['off', 0, {}, []]) {
    await store.set(SOURCE_LINE_NUMBERS_KEY, value)
    await assert.rejects(() => loadSourceLineNumbers(store))
    assert.equal(await loadNoteLimit(store), 123)
  }
})
