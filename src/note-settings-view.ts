import { bindDialog } from './dialog'
import { DEFAULT_NOTE_LIMIT, validateNoteLimit } from './note-settings'
import { NotePreferences } from './note-preferences'

export function createNoteSettings(store: ConstructorParameters<typeof NotePreferences>[0], changed: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#note-settings')!
  const open = document.querySelector<HTMLButtonElement>('#settings-open')!
  const close = document.querySelector<HTMLButtonElement>('#settings-close')!
  const form = document.querySelector<HTMLFormElement>('#settings-form')!
  const mode = document.querySelector<HTMLSelectElement>('#limit-mode')!
  const custom = document.querySelector<HTMLInputElement>('#limit-custom')!
  const numbers = document.querySelector<HTMLInputElement>('#source-line-numbers')!
  const label = document.querySelector<HTMLElement>('#custom-label')!
  const error = document.querySelector<HTMLElement>('#settings-error')!
  mode.querySelector<HTMLOptionElement>('[value="default"]')!.textContent = `Default (${DEFAULT_NOTE_LIMIT})`
  let loaded = false
  let invalid = false
  const preferences = new NotePreferences(store, render)

  mode.disabled = custom.disabled = numbers.disabled = true

  function showCustom() { custom.hidden = label.hidden = mode.value !== 'custom' }
  function render() {
    mode.disabled = custom.disabled = numbers.disabled = !loaded
    error.textContent = [invalid ? 'Enter a positive whole number. The previous limit still applies.' : '', preferences.view.problem].filter(Boolean).join(' ')
    error.hidden = !error.textContent
    custom.setAttribute('aria-invalid', String(invalid))
    changed()
  }
  bindDialog(dialog, open, close)
  form.addEventListener('submit', event => { event.preventDefault() })
  function applyLimit() {
    showCustom()
    if (!loaded) return
    const value = mode.value === 'unlimited' ? null : mode.value === 'default' ? DEFAULT_NOTE_LIMIT
      : /^\d+$/.test(custom.value.trim()) ? Number(custom.value.trim()) : NaN
    invalid = !validateNoteLimit(value)
    if (invalid) { render(); return }
    void preferences.chooseLimit(value)
  }
  mode.addEventListener('change', applyLimit)
  custom.addEventListener('input', applyLimit)
  numbers.addEventListener('change', () => {
    if (!loaded) return
    void preferences.chooseLineNumbers(numbers.checked)
  })
  void preferences.loaded.then(() => {
    loaded = true
    const { limit, lineNumbers } = preferences.view
    mode.value = limit === null ? 'unlimited' : limit === DEFAULT_NOTE_LIMIT ? 'default' : 'custom'
    custom.value = String(limit ?? DEFAULT_NOTE_LIMIT)
    numbers.checked = lineNumbers
    showCustom()
    render()
  })
  return preferences
}
