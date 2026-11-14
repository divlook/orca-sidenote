import { bindDialog } from '../dialog'
import { NotePreferences } from './note-preferences'
import type { DefaultNoteMode } from './note-settings'

export function createNoteSettings(store: ConstructorParameters<typeof NotePreferences>[0], changed: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#note-settings')!
  const open = document.querySelector<HTMLButtonElement>('#settings-open')!
  const close = document.querySelector<HTMLButtonElement>('#settings-close')!
  const form = document.querySelector<HTMLFormElement>('#settings-form')!
  const confirmation = document.querySelector<HTMLInputElement>('#confirm-note-deletion')!
  const numbers = document.querySelector<HTMLInputElement>('#source-line-numbers')!
  const defaultMode = document.querySelector<HTMLSelectElement>('#default-note-mode')!
  const error = document.querySelector<HTMLElement>('#settings-error')!
  const preferences = new NotePreferences(store, render)
  confirmation.disabled = numbers.disabled = defaultMode.disabled = true
  function render() {
    confirmation.disabled = numbers.disabled = defaultMode.disabled = !preferences.view.initialized
    confirmation.checked = preferences.view.confirmDelete
    numbers.checked = preferences.view.lineNumbers
    defaultMode.value = preferences.view.defaultMode
    error.textContent = preferences.view.problem
    error.hidden = !error.textContent
    changed()
  }
  bindDialog(dialog, open, close)
  form.addEventListener('submit', event => event.preventDefault())
  confirmation.addEventListener('change', () => { if (preferences.view.initialized) void preferences.chooseConfirmDelete(confirmation.checked) })
  numbers.addEventListener('change', () => { if (preferences.view.initialized) void preferences.chooseLineNumbers(numbers.checked) })
  defaultMode.addEventListener('change', () => { if (preferences.view.initialized) void preferences.chooseDefaultMode(defaultMode.value as DefaultNoteMode) })
  return preferences
}
