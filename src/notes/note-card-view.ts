import { createSourceEditor, type SourceEditor } from '../editor/source-editor'
import { createPreview } from '../markdown/preview'
import { markdownSummary } from '../markdown/markdown-summary'
import type { NoteLabel } from './note-labels'
import type { NoteRecord } from './note-collection'

export type CardPresentation = {
  note: NoteRecord; ready: boolean; epoch: number; invalidation: number | undefined; lineNumbers: boolean
  hidden: boolean; filterPending: boolean; deleting: boolean
  catalog: { labels: readonly NoteLabel[]; ready: boolean; busy: boolean }
}
type CardIntents = {
  changed(): void; writable(): boolean; save(text: string): void; assign(label: string | null): void; remove(opener: HTMLButtonElement): void
  openLink(href: string, epoch: number): Promise<unknown>; report(error: unknown): void
}

export interface NoteCardView {
  readonly element: HTMLElement
  readonly error: string
  readonly minimized: boolean
  ownsToolbar(target: Node): boolean
  ownsGrip(target: Node): boolean
  focusToolbar(): void
  setReading(value: boolean): void
  setMinimized(value: boolean): void
  startEditing(): void
  focusBody(): void
  theme(): void
  suspend(epoch: number, invalidation: number | undefined): void
  update(next: CardPresentation): void
  dispose(): void
}

const icons = {
  grip: '<circle cx="7" cy="5" r="1"/><circle cx="13" cy="5" r="1"/><circle cx="7" cy="10" r="1"/><circle cx="13" cy="10" r="1"/><circle cx="7" cy="15" r="1"/><circle cx="13" cy="15" r="1"/>',
  eye: '<path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Z"/><circle cx="10" cy="10" r="2.5"/>',
  pencil: '<path d="m4 13-1 4 4-1L17 6l-3-3Z"/><path d="m12 5 3 3"/>',
  minimize: '<g transform="scale(0.8333333333333334)"><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></g>',
  expand: '<g transform="scale(0.8333333333333334)"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></g>',
  trash: '<path d="M3 5h14M7 5V2h6v3M5 5l1 13h8l1-13M8 8v7m4-7v7"/>'
}

export function setCardIcon(button: HTMLButtonElement, label: string, kind: 'minimize' | 'expand') {
  icon(button, label, icons[kind])
}
function icon(button: HTMLButtonElement, label: string, drawing: string) {
  if (button.getAttribute('aria-label') === label) return
  button.title = label; button.setAttribute('aria-label', label)
  button.innerHTML = `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">${drawing}</svg>`
}

export function createNoteCard(key: string, initial: NoteRecord, readingInitially: boolean, intents: CardIntents): NoteCardView {
  const events = new AbortController(), signal = events.signal
  const element = document.createElement('section'); element.className = 'note-card'; element.dataset.noteId = initial.id
  const toolbar = document.createElement('div'); toolbar.className = 'card-toolbar'; toolbar.draggable = true
  toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Note actions'); toolbar.tabIndex = -1
  function button(owner: HTMLElement, label: string, drawing: string) {
    const value = document.createElement('button'); value.type = 'button'; value.className = 'icon-button'
    icon(value, label, drawing); owner.append(value); return value
  }
  const grip = button(toolbar, 'Drag to reorder; Option+Up or Down to move', icons.grip); grip.classList.add('note-grip'); grip.tabIndex = -1
  const pending = document.createElement('span'); pending.className = 'filter-pending'; pending.hidden = true
  pending.title = 'This note will hide when focus leaves because it does not match the filter.'; pending.setAttribute('aria-label', pending.title)
  pending.innerHTML = '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 5v5l3 2"/></svg><span class="filter-pending-text">Filter pending</span>'
  toolbar.append(pending)
  const actions = document.createElement('div'); actions.className = 'card-actions'; toolbar.append(actions)
  const label = document.createElement('button'); label.type = 'button'; label.className = 'card-label'
  label.setAttribute('aria-haspopup', 'menu'); label.setAttribute('aria-expanded', 'false'); actions.append(label)
  const picker = document.createElement('div'); picker.className = 'label-picker'; picker.setAttribute('role', 'menu'); picker.hidden = true; actions.append(picker)
  const mode = button(actions, 'Read note', icons.eye), collapse = button(actions, 'Minimize note', icons.minimize), trash = button(actions, 'Delete note', icons.trash)
  const controls = [grip, mode, collapse, trash]
  const body = document.createElement('div'); body.className = 'note-source'
  const preview = document.createElement('article'); preview.className = 'note-preview'; preview.hidden = true
  const summary = document.createElement('div'); summary.className = 'note-summary'; summary.hidden = true; summary.tabIndex = -1
  element.append(toolbar, summary, body, preview)
  let source: SourceEditor | undefined, error = '', reading = readingInitially, minimized = false, disposed = false
  let current: CardPresentation | undefined, rendered: CardPresentation | undefined
  let renderedReading: boolean | undefined, renderedMinimized: boolean | undefined, summaryText: string | undefined
  const markdown = createPreview(preview, href => intents.openLink(href, current?.epoch ?? 0), intents.report, (expectedKey, text, marker, epoch) => {
    return !disposed && intents.writable() && reading && !minimized && current?.note.text === text
      && current.epoch === epoch && !!ensureSource()?.toggleTask(expectedKey, text, marker, epoch)
  })
  function fail(reason: unknown) { error = reason instanceof Error ? reason.message : String(reason); intents.changed() }
  function ensureSource() {
    if (!source && !error && current) {
      try {
        source = createSourceEditor(body, key, (_key, text) => intents.save(text), fail)
        source.sync(current.note.text, intents.writable(), current.epoch, current.invalidation)
        source.setLineNumbers(current.lineNumbers)
      } catch (reason) { fail(reason) }
    }
    return source
  }
  function closePicker(focus = false) {
    picker.hidden = true; label.setAttribute('aria-expanded', 'false')
    if (focus) label.focus({ preventScroll: true })
  }
  function setMinimized(value: boolean) {
    if (value && (body.contains(document.activeElement) || preview.contains(document.activeElement))) toolbar.focus({ preventScroll: true })
    minimized = value
    if (!value && !reading) source?.show(false)
  }
  function edit() {
    if (!intents.writable()) return
    reading = false; setMinimized(false); intents.changed(); source?.show(true)
  }
  label.addEventListener('click', () => {
    if (!picker.hidden) { closePicker(); return }
    if (!intents.writable() || !current?.catalog.ready || current.catalog.busy) return
    picker.replaceChildren()
    for (const entry of [{ id: null, name: 'No label', color: null }, ...current.catalog.labels]) {
      const choice = document.createElement('button'); choice.type = 'button'; choice.setAttribute('role', 'menuitemradio')
      choice.setAttribute('aria-checked', String((current.note.labelId ?? null) === entry.id))
      if (entry.color) { const dot = document.createElement('span'); dot.className = `label-dot label-color-${entry.color}`; dot.setAttribute('aria-hidden', 'true'); choice.append(dot) }
      choice.append(document.createTextNode(entry.name))
      choice.addEventListener('click', () => { closePicker(true); intents.assign(entry.id) }, { signal }); picker.append(choice)
    }
    picker.hidden = false; label.setAttribute('aria-expanded', 'true')
    const bounds = label.getBoundingClientRect()
    picker.style.left = `${Math.max(6, Math.min(bounds.left, window.innerWidth - picker.offsetWidth - 6))}px`
    picker.style.top = `${Math.max(6, Math.min(bounds.bottom, window.innerHeight - picker.offsetHeight - 6))}px`
    picker.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
  }, { signal })
  picker.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePicker(true); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const choices = [...picker.querySelectorAll<HTMLButtonElement>('button')], index = choices.indexOf(document.activeElement as HTMLButtonElement)
    choices[event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length]?.focus()
  }, { signal })
  picker.addEventListener('focusout', () => { requestAnimationFrame(() => { if (!disposed && !picker.hidden && !picker.contains(document.activeElement) && document.activeElement !== label) closePicker() }) }, { signal })
  summary.addEventListener('click', edit, { signal })
  mode.addEventListener('click', () => { if (reading) edit(); else { reading = true; intents.changed() } }, { signal })
  collapse.addEventListener('click', () => { setMinimized(!minimized); intents.changed() }, { signal })
  trash.addEventListener('click', () => intents.remove(trash), { signal })

  return {
    element,
    get error() { return error },
    get minimized() { return minimized },
    ownsToolbar(target: Node) { return toolbar.contains(target) },
    ownsGrip(target: Node) { return grip.contains(target) },
    focusToolbar() { toolbar.focus({ preventScroll: true }) },
    setReading(value: boolean) { reading = value },
    setMinimized,
    startEditing() { reading = false; setMinimized(false) },
    focusBody() { source?.show(true) },
    theme() { source?.theme() },
    suspend(epoch: number, invalidation: number | undefined) {
      source?.sync(current?.note.text ?? initial.text, false, epoch, invalidation); markdown.suspend(); rendered = undefined
    },
    update(next: CardPresentation) {
      current = next
      if (element.hidden !== next.hidden) element.hidden = next.hidden
      if (pending.hidden !== !next.filterPending) pending.hidden = !next.filterPending
      if (next.hidden && !picker.hidden) closePicker()
      if (next.ready && !next.hidden && !error && !reading && !minimized) ensureSource()
      const ready = next.ready && !next.hidden && !error
      const before = rendered
      if (before && before.note.text === next.note.text && before.ready === next.ready && before.epoch === next.epoch
        && before.invalidation === next.invalidation && before.lineNumbers === next.lineNumbers && before.hidden === next.hidden
        && before.note.labelId === next.note.labelId && before.catalog.labels === next.catalog.labels
        && before.catalog.ready === next.catalog.ready && before.catalog.busy === next.catalog.busy
        && before.deleting === next.deleting && renderedReading === reading && renderedMinimized === minimized) return
      rendered = next; renderedReading = reading; renderedMinimized = minimized
      source?.sync(next.note.text, ready, next.epoch, next.invalidation); source?.setLineNumbers(next.lineNumbers)
      for (const control of controls) control.disabled = !ready
      const assigned = next.catalog.labels.find(value => value.id === next.note.labelId), labelText = assigned?.name ?? '+ Label'
      if (label.dataset.labelText !== labelText || label.dataset.labelColor !== (assigned?.color ?? '')) {
        if (label.dataset.labelColor) toolbar.classList.remove(`label-color-${label.dataset.labelColor}`)
        if (assigned) toolbar.classList.add(`label-color-${assigned.color}`)
        label.replaceChildren()
        if (assigned) { const dot = document.createElement('span'); dot.className = `label-dot label-color-${assigned.color}`; dot.setAttribute('aria-hidden', 'true'); label.append(dot) }
        const text = document.createElement('span'); text.textContent = labelText; label.append(text)
        label.dataset.labelText = labelText; label.dataset.labelColor = assigned?.color ?? ''
      }
      label.setAttribute('aria-label', assigned ? `Label: ${assigned.name}` : 'Add label')
      const labelDisabled = !ready || !next.catalog.ready || next.catalog.busy
      if (labelDisabled && ready && (document.activeElement === label || picker.contains(document.activeElement))) toolbar.focus({ preventScroll: true })
      label.disabled = labelDisabled
      if (labelDisabled) closePicker()
      trash.disabled ||= next.deleting
      body.hidden = minimized || reading; preview.hidden = minimized || !reading; summary.hidden = !minimized
      if (minimized && summaryText !== next.note.text) {
        summary.textContent = markdownSummary(next.note.text) + (next.note.text.trim() ? '...' : ''); summary.title = summary.textContent; summaryText = next.note.text
      }
      icon(mode, reading ? 'Edit note' : 'Read note', reading ? icons.pencil : icons.eye)
      icon(collapse, minimized ? 'Expand note' : 'Minimize note', minimized ? icons.expand : icons.minimize)
      collapse.setAttribute('aria-expanded', String(!minimized))
      if (reading && !minimized && !next.hidden) markdown.render(next.note.text, key, ready, next.epoch)
      else markdown.suspend()
    },
    dispose() { disposed = true; events.abort(); source?.dispose(); markdown.dispose(); element.remove() }
  }
}

