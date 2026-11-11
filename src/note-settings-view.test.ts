import { afterEach, assert, test } from 'orca/testing'
import { createNoteSettings } from './note-settings-view'
import { DEFAULT_NOTE_LIMIT, NOTE_LIMIT_KEY, SOURCE_LINE_NUMBERS_KEY } from './note-settings'

// Exercise the view's actual event handlers without loading Monaco or touching user storage.
class Control extends EventTarget {
  value = ''
  checked = false
  disabled = false
  hidden = false
  open = false
  textContent = ''
  attributes = new Map<string, string>()
  querySelector() { return new Control() }
  setAttribute(key: string, value: string) { this.attributes.set(key, value) }
  showModal() { this.open = true }
  close() { this.open = false; this.dispatchEvent(new Event('close')) }
  focus() {}
}
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
afterEach(() => {
  for (const [key, descriptor] of [['document', originalDocument], ['window', originalWindow]] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})
async function settle() { for (let i = 0; i < 40; i++) await Promise.resolve() }
function fixture(values = new Map<string, unknown>()) {
  const controls = new Map<string, Control>()
  const control = (id: string) => {
    if (!controls.has(id)) controls.set(id, new Control())
    return controls.get(id)!
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: control } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() })
  const calls: [string, unknown][] = []
  const store = {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: unknown) => { calls.push([key, value]); values.set(key, value) }
  }
  const settings = createNoteSettings(store, () => {})
  function select(value: string) { control('#limit-mode').value = value; control('#limit-mode').dispatchEvent(new Event('change')) }
  function input(value: string) { control('#limit-custom').value = value; control('#limit-custom').dispatchEvent(new Event('input')) }
  function toggle(value: boolean) { control('#source-line-numbers').checked = value; control('#source-line-numbers').dispatchEvent(new Event('change')) }
  return { settings, store, values, calls, control, select, input, toggle }
}

test('settings apply immediately and persist without submitting; invalid numeric drafts are independent', async () => {
  const f = fixture()
  await settle()
  f.select('custom')
  f.input('123')
  assert.equal(f.settings.view.limit, 123)
  await settle()
  for (const invalid of ['', '0', '-1', '1.5', 'abc', '9007199254740992']) {
    const count = f.calls.length
    f.input(invalid)
    assert.equal(f.settings.view.limit, 123)
    f.toggle(false)
    assert.equal(f.settings.view.lineNumbers, false)
    assert.equal(f.settings.view.ready, true)
    await settle()
    assert.equal(f.calls.length, count + 1)
    assert.deepEqual(f.values.get(NOTE_LIMIT_KEY), { characterLimit: 123 })
    assert.equal(f.control('#limit-custom').value, invalid)
  }
  f.input('456')
  f.toggle(true)
  await settle()
  const reloaded = fixture(f.values)
  await settle()
  assert.equal(reloaded.settings.view.limit, 456)
  assert.equal(reloaded.settings.view.lineNumbers, true)
  f.select('unlimited')
  assert.equal(f.settings.view.limit, null)
  await settle()
  assert.deepEqual(f.values.get(NOTE_LIMIT_KEY), { characterLimit: null })
  f.select('default')
  await settle()
  assert.equal(f.settings.view.limit, DEFAULT_NOTE_LIMIT)
})

test('rapid numeric edits and toggles capture intent and serialize delayed writes without disabling controls', async () => {
  const f = fixture()
  await settle()
  const originalSet = f.store.set
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let active = 0
  let maximum = 0
  f.store.set = async (key, value) => {
    active++
    maximum = Math.max(maximum, active)
    await gate
    await originalSet(key, value)
    active--
  }
  f.select('custom')
  f.input('12')
  f.toggle(false)
  f.input('123')
  f.toggle(true)
  assert.equal(f.settings.view.limit, 123)
  assert.equal(f.settings.view.lineNumbers, true)
  assert.equal(f.control('#limit-mode').disabled, false)
  assert.equal(f.control('#source-line-numbers').disabled, false)
  await settle()
  assert.equal(maximum, 1)
  assert.equal(f.calls.length, 0)
  release()
  await settle()
  assert.deepEqual(f.calls, [[NOTE_LIMIT_KEY, { characterLimit: 12 }], [SOURCE_LINE_NUMBERS_KEY, false], [NOTE_LIMIT_KEY, { characterLimit: 123 }], [SOURCE_LINE_NUMBERS_KEY, true]])
  assert.equal(maximum, 1)
})

test('failed writes retain successful values and drafts, and normal interactions retry the same desired value', async () => {
  const f = fixture()
  await settle()
  f.select('custom')
  f.input('321')
  await settle()
  const originalSet = f.store.set
  f.store.set = async () => { throw new Error('Preference write failed') }
  f.input('654')
  f.toggle(false)
  await settle()
  assert.equal(f.settings.view.limit, 321)
  assert.equal(f.settings.view.lineNumbers, true)
  assert.equal(f.control('#limit-custom').value, '654')
  assert.equal(f.control('#source-line-numbers').checked, false)
  assert.match(f.settings.view.problem, /Preference write failed/)
  assert.deepEqual(f.values.get(NOTE_LIMIT_KEY), { characterLimit: 321 })
  f.store.set = originalSet
  f.input('654')
  f.toggle(false)
  await settle()
  assert.equal(f.settings.view.limit, 654)
  assert.equal(f.settings.view.lineNumbers, false)
  assert.equal(f.settings.view.problem, '')
})

test('unreadable preferences stay fail-closed until each setting is explicitly replaced', async () => {
  const f = fixture(new Map<string, unknown>([[NOTE_LIMIT_KEY, 'bad'], [SOURCE_LINE_NUMBERS_KEY, 'bad']]))
  await settle()
  assert.equal(f.settings.view.ready, false)
  assert.equal(f.calls.length, 0)
  f.toggle(false)
  await settle()
  assert.equal(f.settings.view.ready, false)
  assert.equal(f.values.get(NOTE_LIMIT_KEY), 'bad')
  f.select('default')
  await settle()
  assert.equal(f.settings.view.ready, true)
  assert.equal(f.settings.view.problem, '')
})
