import { bindDialogControls } from '../dialog'
import { LABEL_COLORS, type LabelColor, type NoteLabel } from '../notes/note-labels'
import type { NoteSession } from '../notes/session'
import type { SettingsDropdown } from './settings-dropdown'

export function createLabelSettings(session: NoteSession, dropdown: SettingsDropdown) {
  const element = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!
  const list = element<HTMLElement>('labels-list'), error = element<HTMLElement>('labels-error')
  const retry = element<HTMLButtonElement>('labels-retry'), add = element<HTMLButtonElement>('label-add')
  const name = element<HTMLInputElement>('label-name'), color = element<HTMLButtonElement>('label-color')
  const reset = element<HTMLButtonElement>('labels-reset'), dialog = element<HTMLDialogElement>('label-confirm')
  const title = element<HTMLElement>('label-confirm-title'), description = element<HTMLElement>('label-confirm-description')
  const confirmError = element<HTMLElement>('label-confirm-error'), cancel = element<HTMLButtonElement>('label-confirm-cancel')
  const ack = element<HTMLInputElement>('label-confirm-ack')
  const confirm = element<HTMLButtonElement>('label-confirm-action')
  let localError = '', opener: HTMLElement | null = null, confirming = false, dragging: string | null = null
  type Row = {
    element: HTMLDivElement; input: HTMLInputElement; palette: HTMLButtonElement
    save: HTMLButtonElement; up: HTMLButtonElement; down: HTMLButtonElement; remove: HTMLButtonElement; renderPalette: () => void
    status: HTMLElement; baseline: NoteLabel; draftName: string; draftColor: LabelColor
    feedback: '' | 'saving' | 'saved' | 'failed'
  }
  const rows = new Map<string, Row>()
  let newColor: LabelColor = LABEL_COLORS[0]
  const colorOptions = LABEL_COLORS.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1), color: value }))
  function colors(button: HTMLButtonElement, name: () => string, selected: () => LabelColor, change: (value: LabelColor) => void) {
    return dropdown.bind(button, { name, options: colorOptions, selected, choose: change })
  }
  colors(color, () => 'Color for new label', () => newColor, value => { newColor = value })
  function fail(reason: unknown) { localError = reason instanceof Error ? reason.message : String(reason); render() }
  function run(action: () => Promise<unknown>) { localError = ''; void action().catch(fail) }
  function move(id: string, destination: number) {
    const ids = session.labels.labels.map(label => label.id), index = ids.indexOf(id)
    if (index < 0 || destination < 0 || destination >= ids.length || index === destination) return
    ids.splice(index, 1); ids.splice(destination, 0, id); run(() => session.reorderLabels(ids))
  }
  async function prepare(label: NoteLabel | null, source: HTMLElement) {
    localError = ''; opener = source
    try {
      const count = await session.prepareLabelDeletion(label?.id ?? null)
      title.textContent = label ? `Delete “${label.name}”?` : 'Reset all labels?'
      description.textContent = label
        ? `This removes the label from ${count} ${count === 1 ? 'note' : 'notes'} across all projects and worktrees in this store. Note text is unchanged.`
        : `This removes labels from ${count} ${count === 1 ? 'note' : 'notes'} across all projects and worktrees in this store, deletes the current catalog, and restores the default labels. Note text and order are unchanged.`
      confirm.textContent = label ? 'Delete label' : 'Reset labels'; confirmError.hidden = true; ack.checked = false; confirm.disabled = true
      dialog.showModal(); dialog.focus({ preventScroll: true }); dialog.scrollTop = 0
    } catch (reason) { await session.finishLabelDeletion().catch(fail); fail(reason) }
  }
  bindDialogControls(dialog, cancel, { canClose: () => !confirming, returnFocus: () => opener })
  dialog.addEventListener('close', () => { void session.finishLabelDeletion().catch(fail) })
  ack.addEventListener('change', () => { confirm.disabled = !ack.checked || confirming })
  confirm.addEventListener('click', () => {
    if (confirming || !ack.checked) return
    confirming = true; confirm.disabled = cancel.disabled = true; confirmError.hidden = true
    void session.deletePreparedLabels().then(() => dialog.close()).catch(reason => {
      confirmError.textContent = reason instanceof Error ? reason.message : String(reason); confirmError.hidden = false
    }).finally(() => { confirming = false; confirm.disabled = !ack.checked; cancel.disabled = false })
  })
  retry.addEventListener('click', () => run(() => session.loadLabels()))
  add.addEventListener('click', () => run(async () => { await session.addLabel(name.value, newColor); name.value = '' }))
  reset.addEventListener('click', () => { void prepare(null, reset) })
  function dirty(row: Row) { return row.draftName !== row.baseline.name || row.draftColor !== row.baseline.color }
  function updateRow(row: Row, enabled: boolean, index: number, count: number) {
    row.element.draggable = enabled
    row.input.disabled = row.palette.disabled = !enabled
    row.save.disabled = !enabled || !dirty(row)
    row.up.disabled = !enabled || index === 0
    row.down.disabled = !enabled || index === count - 1
    row.remove.disabled = !enabled
    row.save.classList.toggle('label-save-dirty', dirty(row))
    row.status.textContent = row.feedback === 'saving' ? 'Saving changes…'
      : row.feedback === 'failed' ? 'Save could not be confirmed. Retry labels to check.'
      : dirty(row) ? 'Unsaved changes' : row.feedback === 'saved' ? 'Changes saved' : ''
    row.status.classList.toggle('label-status-error', row.feedback === 'failed')
    row.status.classList.toggle('label-status-dirty', dirty(row))
    row.input.setAttribute('aria-label', `Name for ${row.baseline.name}`)
    row.renderPalette()
    row.up.setAttribute('aria-label', `Move ${row.baseline.name} up`)
    row.down.setAttribute('aria-label', `Move ${row.baseline.name} down`)
    row.remove.setAttribute('aria-label', `Delete ${row.baseline.name}`)
  }
  function createRow(label: NoteLabel): Row {
    const element = document.createElement('div'); element.className = 'label-row'
    const input = document.createElement('input'); input.value = label.name
    const palette = document.createElement('button'); palette.type = 'button'
    const status = document.createElement('span'); status.className = 'label-status'; status.setAttribute('role', 'status')
    const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Save changes'
    const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'
    const down = document.createElement('button'); down.type = 'button'; down.textContent = '↓'
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete'
    const actions = document.createElement('div'); actions.className = 'label-row-actions'; actions.append(status, save, up, down, remove)
    let paletteControl: { render(): void }
    const row: Row = { element, input, palette, save, up, down, remove, status, baseline: label, draftName: label.name, draftColor: label.color, feedback: '', renderPalette: () => paletteControl.render() }
    const changed = () => { row.feedback = ''; updateRow(row, session.labels.ready && !session.labels.busy, session.labels.labels.findIndex(value => value.id === label.id), session.labels.labels.length) }
    input.addEventListener('input', () => { row.draftName = input.value; changed() })
    paletteControl = colors(palette, () => `Color for ${row.baseline.name}`, () => row.draftColor, value => { row.draftColor = value; changed() })
    save.addEventListener('click', () => {
      const submittedName = row.draftName, submittedColor = row.draftColor
      localError = ''; row.feedback = 'saving'; render()
      void session.updateLabel(label.id, submittedName, submittedColor).then(() => {
        row.feedback = 'saved'
        const saved = session.labels.labels.find(value => value.id === label.id)
        if (saved) { row.baseline = saved; row.draftName = saved.name; row.draftColor = saved.color; row.input.value = saved.name }
        render()
      }).catch(reason => { row.feedback = 'failed'; fail(reason) })
    })
    up.addEventListener('click', () => move(label.id, session.labels.labels.findIndex(value => value.id === label.id) - 1))
    down.addEventListener('click', () => move(label.id, session.labels.labels.findIndex(value => value.id === label.id) + 1))
    remove.addEventListener('click', () => { void prepare(row.baseline, remove) })
    element.append(input, palette, actions)
    element.addEventListener('dragstart', event => {
      if (!session.labels.ready || !event.dataTransfer || (event.target as HTMLElement).closest('input, button, label, fieldset')) { event.preventDefault(); return }
      dragging = label.id; event.dataTransfer.setData('text/plain', label.id); event.dataTransfer.effectAllowed = 'move'; element.classList.add('dragging')
    })
    element.addEventListener('dragend', () => { dragging = null; for (const child of list.children) child.classList.remove('dragging', 'drop-before', 'drop-after') })
    element.addEventListener('dragover', event => { if (!dragging || dragging === label.id) return; event.preventDefault(); for (const child of list.children) child.classList.remove('drop-before', 'drop-after'); element.classList.add(event.clientY < element.getBoundingClientRect().top + element.offsetHeight / 2 ? 'drop-before' : 'drop-after') })
    element.addEventListener('drop', event => { if (!dragging) return; event.preventDefault(); const ids = session.labels.labels.map(value => value.id), from = ids.indexOf(dragging); let to = ids.indexOf(label.id) + Number(element.classList.contains('drop-after')); if (from < to) to--; move(dragging, to); dragging = null })
    return row
  }
  function render() {
    const state = session.labels, enabled = state.ready && !state.busy
    error.textContent = localError || state.error; error.hidden = !error.textContent
    retry.hidden = !state.error; retry.disabled = state.busy
    name.disabled = color.disabled = add.disabled = reset.disabled = !enabled
    const ids = new Set(state.labels.map(label => label.id))
    for (const [id, row] of rows) if (!ids.has(id)) { row.element.remove(); rows.delete(id) }
    state.labels.forEach((label, index) => {
      let row = rows.get(label.id)
      if (!row) { row = createRow(label); rows.set(label.id, row) }
      else {
        const wasDirty = dirty(row)
        row.baseline = label
        if (enabled && row.feedback === 'failed') {
          if (row.draftName.trim() === label.name && row.draftColor === label.color) {
            row.feedback = 'saved'; row.draftName = label.name; row.input.value = label.name
          } else row.feedback = ''
        }
        if (!wasDirty && row.feedback !== 'saving') {
          row.draftName = label.name; row.draftColor = label.color
          if (row.input.value !== label.name) row.input.value = label.name
        }
      }
      updateRow(row, enabled, index, state.labels.length)
      if (list.children[index] !== row.element) list.insertBefore(row.element, list.children[index] ?? null)
    })
  }
  return { render }
}
