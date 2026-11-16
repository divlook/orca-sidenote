import { bindDialog } from '../dialog'
import type { NotePreferences } from './note-preferences'
import type { SettingsDropdown } from './settings-dropdown'

export function createNoteSettings(dialog: HTMLDialogElement, open: HTMLButtonElement, preferences: NotePreferences, dropdown: SettingsDropdown) {
  const get = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!
  const close = get<HTMLButtonElement>('settings-close'), footer = get<HTMLButtonElement>('settings-close-footer')
  const form = get<HTMLFormElement>('settings-form')
  const confirmation = get<HTMLInputElement>('confirm-note-deletion'), numbers = get<HTMLInputElement>('source-line-numbers')
  const defaultMode = get<HTMLButtonElement>('default-note-mode'), webLinks = get<HTMLButtonElement>('web-link-opening')
  const error = get<HTMLElement>('settings-error')
  const events = new AbortController(), signal = events.signal
  const modeControl = dropdown.bind(defaultMode, { name: 'Default note mode',
    options: [{ value: 'editing', label: 'Editing' }, { value: 'reading', label: 'Reading' }] as const,
    selected: () => preferences.view.defaultMode, choose: value => { if (preferences.view.initialized) void preferences.chooseDefaultMode(value) } })
  const linksControl = dropdown.bind(webLinks, { name: 'Open web links in',
    options: [{ value: 'external', label: 'Default browser' }, { value: 'orca', label: 'Orca browser' }, { value: 'ask', label: 'Ask every time' }] as const,
    selected: () => preferences.view.webLinkOpening, choose: value => { if (preferences.view.initialized) void preferences.chooseWebLinkOpening(value) } })
  confirmation.disabled = numbers.disabled = defaultMode.disabled = webLinks.disabled = true
  function render() {
    if (signal.aborted) return
    confirmation.disabled = numbers.disabled = defaultMode.disabled = webLinks.disabled = !preferences.view.initialized
    confirmation.checked = preferences.view.confirmDelete
    numbers.checked = preferences.view.lineNumbers
    modeControl.render()
    linksControl.render()
    error.textContent = preferences.view.problem
    error.hidden = !error.textContent
  }
  const disposeDialog = bindDialog(dialog, open, [close, footer], { consumeEscape: () => dropdown.close() })
  form.addEventListener('submit', event => event.preventDefault(), { signal })
  confirmation.addEventListener('change', () => { if (preferences.view.initialized) void preferences.chooseConfirmDelete(confirmation.checked) }, { signal })
  numbers.addEventListener('change', () => { if (preferences.view.initialized) void preferences.chooseLineNumbers(numbers.checked) }, { signal })
  return { render, dispose() { events.abort(); modeControl.dispose(); linksControl.dispose(); disposeDialog() } }
}
