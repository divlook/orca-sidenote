import { bindDialog } from '../dialog'
import { NotePreferences } from './note-preferences'
import type { SettingsDropdown } from './settings-dropdown'

export function createNoteSettings(store: ConstructorParameters<typeof NotePreferences>[0], changed: () => void, dropdown: SettingsDropdown) {
  const dialog = document.querySelector<HTMLDialogElement>('#note-settings')!
  const open = document.querySelector<HTMLButtonElement>('#settings-open')!
  const close = document.querySelector<HTMLButtonElement>('#settings-close')!
  const form = document.querySelector<HTMLFormElement>('#settings-form')!
  const confirmation = document.querySelector<HTMLInputElement>('#confirm-note-deletion')!
  const numbers = document.querySelector<HTMLInputElement>('#source-line-numbers')!
  const defaultMode = document.querySelector<HTMLButtonElement>('#default-note-mode')!
  const webLinks = document.querySelector<HTMLButtonElement>('#web-link-opening')!
  const error = document.querySelector<HTMLElement>('#settings-error')!
  const preferences = new NotePreferences(store, render)
  const modeControl = dropdown.bind(defaultMode, { name: 'Default note mode',
    options: [{ value: 'editing', label: 'Editing' }, { value: 'reading', label: 'Reading' }] as const,
    selected: () => preferences.view.defaultMode, choose: value => { if (preferences.view.initialized) void preferences.chooseDefaultMode(value) } })
  const linksControl = dropdown.bind(webLinks, { name: 'Open web links in',
    options: [{ value: 'external', label: 'Default browser' }, { value: 'orca', label: 'Orca browser' }, { value: 'ask', label: 'Ask every time' }] as const,
    selected: () => preferences.view.webLinkOpening, choose: value => { if (preferences.view.initialized) void preferences.chooseWebLinkOpening(value) } })
  confirmation.disabled = numbers.disabled = defaultMode.disabled = webLinks.disabled = true
  function render() {
    confirmation.disabled = numbers.disabled = defaultMode.disabled = webLinks.disabled = !preferences.view.initialized
    confirmation.checked = preferences.view.confirmDelete
    numbers.checked = preferences.view.lineNumbers
    modeControl.render()
    linksControl.render()
    error.textContent = preferences.view.problem
    error.hidden = !error.textContent
    changed()
  }
  bindDialog(dialog, open, close, undefined, () => dropdown.close())
  document.querySelector<HTMLButtonElement>('#settings-close-footer')!.addEventListener('click', () => dialog.close())
  form.addEventListener('submit', event => event.preventDefault())
  confirmation.addEventListener('change', () => { if (preferences.view.initialized) void preferences.chooseConfirmDelete(confirmation.checked) })
  numbers.addEventListener('change', () => { if (preferences.view.initialized) void preferences.chooseLineNumbers(numbers.checked) })
  return preferences
}
