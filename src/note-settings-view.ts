import { bindDialog } from './dialog'
import { DEFAULT_NOTE_LIMIT, loadNoteLimit, saveNoteLimit, validateNoteLimit, loadSourceLineNumbers, saveSourceLineNumbers, type NoteLimit } from './note-settings'

type SettingsStore = Parameters<typeof loadNoteLimit>[0] & Parameters<typeof saveNoteLimit>[0] & Parameters<typeof saveSourceLineNumbers>[0]

export function createNoteSettings(store: SettingsStore, changed: () => void) {
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
  let limit: NoteLimit = DEFAULT_NOTE_LIMIT
  let lineNumbers = true
  let savedLimit: NoteLimit = limit
  let savedNumbers = lineNumbers
  let limitLoaded = false
  let numbersLoaded = false
  let loaded = false
  let limitProblem = ''
  let numbersProblem = ''
  let invalid = false
  let limitRevision = 0
  let numbersRevision = 0
  let writes = Promise.resolve()

  mode.disabled = custom.disabled = numbers.disabled = true

  function showCustom() { custom.hidden = label.hidden = mode.value !== 'custom' }
  function render() {
    mode.disabled = custom.disabled = numbers.disabled = !loaded
    error.textContent = [invalid ? 'Enter a positive whole number. The previous limit still applies.' : '', limitProblem, numbersProblem].filter(Boolean).join(' ')
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
    if (limitLoaded && value === limit && !limitProblem) { render(); return }
    limit = value
    const revision = ++limitRevision
    render()
    // Capture each valid choice and serialize writes; never read a later DOM draft here.
    writes = writes.then(async () => {
      try {
        await saveNoteLimit(store, value)
        savedLimit = value
        limitLoaded = true
        limitProblem = ''
      } catch (error) {
        limitProblem = error instanceof Error ? error.message : String(error)
        if (revision === limitRevision) limit = savedLimit
      }
      render()
    })
  }
  mode.addEventListener('change', applyLimit)
  custom.addEventListener('input', applyLimit)
  numbers.addEventListener('change', () => {
    if (!loaded) return
    const value = numbers.checked
    lineNumbers = value
    const revision = ++numbersRevision
    render()
    writes = writes.then(async () => {
      try {
        await saveSourceLineNumbers(store, value)
        savedNumbers = value
        numbersLoaded = true
        numbersProblem = ''
      } catch (error) {
        numbersProblem = error instanceof Error ? error.message : String(error)
        if (revision === numbersRevision) lineNumbers = savedNumbers
      }
      render()
    })
  })
  void Promise.allSettled([loadNoteLimit(store), loadSourceLineNumbers(store)]).then(([limitResult, numbersResult]) => {
    if (limitResult.status === 'fulfilled') { savedLimit = limit = limitResult.value; limitLoaded = true }
    else limitProblem = `${String(limitResult.reason instanceof Error ? limitResult.reason.message : limitResult.reason)} Choose a character limit to replace it.`
    if (numbersResult.status === 'fulfilled') { savedNumbers = lineNumbers = numbersResult.value; numbersLoaded = true }
    else numbersProblem = `${String(numbersResult.reason instanceof Error ? numbersResult.reason.message : numbersResult.reason)} Change Source line numbers to replace it.`
    loaded = true
    mode.value = limit === null ? 'unlimited' : limit === DEFAULT_NOTE_LIMIT ? 'default' : 'custom'
    custom.value = String(limit ?? DEFAULT_NOTE_LIMIT)
    numbers.checked = lineNumbers
    showCustom()
    render()
  })
  return { get view() { return { limit, lineNumbers, ready: limitLoaded && numbersLoaded, problem: [limitProblem, numbersProblem].filter(Boolean).join(' ') } } }
}
