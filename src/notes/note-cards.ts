import { createSourceEditor, type SourceEditor } from '../editor/source-editor'
import { createPreview, type MarkdownPreview } from '../markdown/preview'
import { markdownSummary } from '../markdown/markdown-summary'
import { bindDialogControls } from '../dialog'
import type { NoteSession } from './session'
import type { NotePreferences } from '../settings/note-preferences'
import { matchesFilter, reorderDisplayed, type NoteFilter } from './note-filter'

type NoteView = NoteSession['view']
type PreferenceView = NotePreferences['view']
type CardListOptions = {
  list: HTMLElement; panel: HTMLElement; deleteDialog: HTMLDialogElement;
  minimizeAll: HTMLButtonElement; expandAll: HTMLButtonElement;
  session: NoteSession; preferences: () => PreferenceView; changed: () => void;
  filter: () => NoteFilter; filterRoot: HTMLElement;
  report: (error: unknown) => void; openLink: (href: string, scope: string, epoch: number) => Promise<unknown>; focusAdd: () => void;
}

export function createNoteCards(options: CardListOptions) {
  const { list, panel, deleteDialog, minimizeAll, expandAll, session, preferences, changed, report, openLink, focusAdd } = options
  const deleteCancel = deleteDialog.querySelector<HTMLButtonElement>('#delete-note-cancel')!
  const deleteConfirm = deleteDialog.querySelector<HTMLButtonElement>('#delete-note-confirm')!
  const deleteError = deleteDialog.querySelector<HTMLElement>('#delete-note-error')!
  type Card = {
    key: string; id: string; scope: string; node: HTMLElement; toolbar: HTMLElement; pending: HTMLElement; pinned: boolean; labelId?: string; body: HTMLElement; summary: HTMLElement; preview: HTMLElement;
    mode: HTMLButtonElement; collapse: HTMLButtonElement; trash: HTMLButtonElement; label: HTMLButtonElement; picker: HTMLElement; controls: HTMLButtonElement[];
    cancelBlur?: () => void; source?: SourceEditor; markdown: MarkdownPreview; reading: boolean; collapsed: boolean; error: string; text: string; summaryText?: string;
  }
  const cards = new Map<string, Card>()
  const removals = new Map<Card, Animation>()
  const requestedRemovals = new Set<string>(), emptyRemovals = new Set<string>()
  let toolbarPointer: string | undefined
  const resetPointer = () => { toolbarPointer = undefined }
  document.addEventListener('pointerdown', resetPointer, true)
  document.addEventListener('pointerup', resetPointer, true)
  document.addEventListener('dragend', resetPointer, true)
  let disposed = false, dragging: string | null = null
  let deletion: { id: string; scope: string; epoch: number; opener: HTMLButtonElement } | undefined
  let deleting = false, focusNew: string | undefined
  let focusGeneration = 0
  const icons = {
    grip: '<circle cx="7" cy="5" r="1"/><circle cx="13" cy="5" r="1"/><circle cx="7" cy="10" r="1"/><circle cx="13" cy="10" r="1"/><circle cx="7" cy="15" r="1"/><circle cx="13" cy="15" r="1"/>',
    eye: '<path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Z"/><circle cx="10" cy="10" r="2.5"/>',
    pencil: '<path d="m4 13-1 4 4-1L17 6l-3-3Z"/><path d="m12 5 3 3"/>',
    minimize: '<g transform="scale(0.8333333333333334)"><path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/></g>',
    expand: '<g transform="scale(0.8333333333333334)"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></g>',
    trash: '<path d="M3 5h14M7 5V2h6v3M5 5l1 13h8l1-13M8 8v7m4-7v7"/>'
  }
  function icon(button: HTMLButtonElement, label: string, drawing: string) {
    if (button.getAttribute('aria-label') === label) return
    button.title = label; button.setAttribute('aria-label', label)
    button.innerHTML = `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">${drawing}</svg>`
  }
  function button(toolbar: HTMLElement, label: string, drawing: string) {
    const value = document.createElement('button'); value.type = 'button'; value.className = 'icon-button'
    icon(value, label, drawing); toolbar.append(value); return value
  }
  const render = changed
  function writable(card?: Card) {
    const view = session.view
    // Hidden editors retain their state, but cannot accept stale queued actions.
    return view.ready && preferences().ready && (!card || card.scope === view.scopeKey && !card.node.hidden && !card.error && !!card.source)
  }
  function displayedIds() {
    return session.view.notes.filter(note => matchesFilter(options.filter(), note) || cards.get(note.key)?.pinned).map(note => note.id)
  }
  const bulkButtons = [minimizeAll, expandAll]
  icon(minimizeAll, 'Minimize all notes', icons.minimize)
  icon(expandAll, 'Expand all notes', icons.expand)
  const keepCardFocus = (event: PointerEvent) => { if (event.button === 0) event.preventDefault() }
  const setAllMinimized = (event: MouseEvent) => {
    if (disposed || !writable()) return
    const minimized = event.currentTarget === minimizeAll
    const focusedCard = document.activeElement?.closest('.note-card')
    let changed = false
    for (const note of session.view.notes) {
      const card = cards.get(note.key)
      if (!card || card.node.hidden || card.collapsed === minimized) continue
      if (minimized && card.node === focusedCard) {
        card.node.querySelector<HTMLElement>('.card-toolbar')!.focus({ preventScroll: true })
      }
      card.collapsed = minimized
      // Source measurements run after the batched render below.
      if (!minimized && !card.reading) card.source?.show(false)
      changed = true
    }
    if (changed) render()
  }
  for (const control of bulkButtons) {
    control.addEventListener('pointerdown', keepCardFocus)
    control.addEventListener('click', setAllMinimized)
  }
  function bindCardBlur(card: Card) {
    let frame: number | undefined
    card.cancelBlur = () => { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined }
    const toolbar = card.node.querySelector<HTMLElement>('.card-toolbar')!
    toolbar.tabIndex = -1
    card.node.addEventListener('pointerdown', event => {
      if (event.target instanceof Element && event.target.closest('.card-toolbar')) {
        toolbarPointer = card.key
        if (!event.target.closest('button')) toolbar.focus({ preventScroll: true })
      }
    })
    card.node.addEventListener('dragend', event => {
      if (event.target instanceof Element && event.target.closest('.card-toolbar')
        && !disposed && cards.get(card.key) === card && card.scope === session.view.scopeKey && session.view.ready) {
        toolbar.focus({ preventScroll: true })
      }
    })
    card.node.addEventListener('focusout', () => {
      if (toolbarPointer === card.key || dragging || frame !== undefined) return
      const epoch = session.view.epoch, generation = focusGeneration
      frame = requestAnimationFrame(() => {
        frame = undefined
        const view = session.view
        if (disposed || generation !== focusGeneration || cards.get(card.key) !== card || card.node.contains(document.activeElement) || dragging
          || emptyRemovals.has(card.key) || requestedRemovals.has(card.key)
          || deleteDialog.open && deletion?.scope === card.scope && deletion.id === card.id) return
        const wasWritable = writable(card)
        if (card.pinned) { card.pinned = false; render() }
        // Pointer opening and keyboard Tab into the filter are presentation actions,
        // not an ordinary card exit that may delete a blank note or change its mode.
        if (options.filterRoot.contains(document.activeElement)) return
        if (card.scope !== view.scopeKey || epoch !== view.epoch || !wasWritable) {
          const preference = preferences()
          if (preference.ready && preference.defaultMode === 'reading') card.reading = true
          return
        }
        if (view.notes.find(note => note.key === card.key)?.text.trim() === '') {
          emptyRemovals.add(card.key); requestedRemovals.add(card.key)
          void session.pruneEmptyNote(card.id).catch(report).finally(() => {
            emptyRemovals.delete(card.key); requestedRemovals.delete(card.key)
            if (!disposed && cards.get(card.key) === card && writable(card) && epoch === session.view.epoch
              && preferences().defaultMode === 'reading' && !card.node.contains(document.activeElement)
              && !dragging && toolbarPointer !== card.key
              && session.view.notes.find(note => note.key === card.key)?.text.trim()) {
              card.reading = true
            }
            render()
          })
        } else if (preferences().defaultMode === 'reading') {
          card.reading = true; render()
        }
      })
    })
  }
  function makeCard(note: { id: string; key: string; text: string }, scope: string): Card {
    const node = document.createElement('section'); node.className = 'note-card'; node.dataset.noteId = note.id
    const toolbar = document.createElement('div'); toolbar.className = 'card-toolbar'; toolbar.draggable = true; toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Note actions')
    const grip = button(toolbar, 'Drag to reorder; Option+Up or Down to move', icons.grip); grip.classList.add('note-grip')
    grip.tabIndex = -1
    const pending = document.createElement('span'); pending.className = 'filter-pending'; pending.hidden = true
    pending.title = 'This note will hide when focus leaves because it does not match the filter.'
    pending.setAttribute('aria-label', pending.title)
    pending.innerHTML = '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 5v5l3 2"/></svg><span class="filter-pending-text">Filter pending</span>'
    toolbar.append(pending)
    const actions = document.createElement('div'); actions.className = 'card-actions'; toolbar.append(actions)
    const label = document.createElement('button'); label.type = 'button'; label.className = 'card-label'
    label.setAttribute('aria-haspopup', 'menu'); label.setAttribute('aria-expanded', 'false'); actions.append(label)
    const picker = document.createElement('div'); picker.className = 'label-picker'; picker.setAttribute('role', 'menu'); picker.hidden = true; actions.append(picker)
    const mode = button(actions, 'Read note', icons.eye)
    const collapse = button(actions, 'Minimize note', icons.minimize), trash = button(actions, 'Delete note', icons.trash)
    const body = document.createElement('div'); body.className = 'note-source'
    const preview = document.createElement('article'); preview.className = 'note-preview'; preview.hidden = true
    const summary = document.createElement('div'); summary.className = 'note-summary'; summary.hidden = true
    summary.tabIndex = -1
    node.append(toolbar, summary, body, preview)
    const card: Card = { key: note.key, id: note.id, scope, node, toolbar, pending, pinned: false, body, preview, summary, mode, collapse, trash, label, picker,
      controls: [grip, mode, collapse, trash], reading: preferences().defaultMode === 'reading', collapsed: false, error: '', text: note.text,
      markdown: createPreview(preview, href => openLink(href, card.scope, session.view.epoch), report, (key, text, marker, epoch) => {
        const current = session.view.notes.find(value => value.key === key)
        return writable(card) && card.reading && !card.collapsed && current?.text === text
          && session.view.epoch === epoch && !!card.source?.toggleTask(key, text, marker, epoch)
      })
    }
    cards.set(card.key, card)
    bindCardBlur(card)
    const closePicker = (focus = false) => {
      picker.hidden = true; label.setAttribute('aria-expanded', 'false')
      if (focus) label.focus({ preventScroll: true })
    }
    label.addEventListener('click', () => {
      if (!picker.hidden) { closePicker(); return }
      if (!writable(card) || !session.labels.ready || session.labels.busy) return
      picker.replaceChildren()
      const current = session.view.notes.find(value => value.key === card.key)?.labelId
      const entries = [{ id: null, name: 'No label', color: null }, ...session.labels.labels]
      for (const entry of entries) {
        const choice = document.createElement('button'); choice.type = 'button'; choice.setAttribute('role', 'menuitemradio')
        choice.setAttribute('aria-checked', String((current ?? null) === entry.id))
        if (entry.color) { const dot = document.createElement('span'); dot.className = `label-dot label-color-${entry.color}`; dot.setAttribute('aria-hidden', 'true'); choice.append(dot) }
        choice.append(document.createTextNode(entry.name))
        choice.addEventListener('click', () => { closePicker(true); void session.assignLabel(card.key, entry.id).catch(report) })
        picker.append(choice)
      }
      picker.hidden = false; label.setAttribute('aria-expanded', 'true')
      const bounds = label.getBoundingClientRect()
      picker.style.left = `${Math.max(6, Math.min(bounds.left, window.innerWidth - picker.offsetWidth - 6))}px`
      picker.style.top = `${Math.max(6, Math.min(bounds.bottom, window.innerHeight - picker.offsetHeight - 6))}px`
      picker.querySelector<HTMLButtonElement>('[aria-checked=\"true\"]')?.focus()
    })
    picker.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePicker(true); return }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const choices = [...picker.querySelectorAll<HTMLButtonElement>('button')], index = choices.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length
      choices[next]?.focus()
    })
    picker.addEventListener('focusout', () => { requestAnimationFrame(() => { if (!picker.hidden && !picker.contains(document.activeElement) && document.activeElement !== label) closePicker() }) })
    const edit = () => {
      if (!writable(card)) return
      card.reading = false; card.collapsed = false; render()
      card.source?.show(true)
    }
    summary.addEventListener('click', edit)
    mode.addEventListener('click', () => {
      if (card.reading) { edit(); return }
      card.reading = true; render()
    })
    collapse.addEventListener('click', () => {
      card.collapsed = !card.collapsed; render()
      if (!card.collapsed && !card.reading) card.source?.show(false)
    })
    trash.addEventListener('click', () => {
      if (deleting || emptyRemovals.has(card.key) || !writable(card)) return
      deletion = { id: card.id, scope: card.scope, epoch: session.view.epoch, opener: trash }
      if (!preferences().confirmDelete) { void removeNote(); return }
      deleteError.hidden = true; deleteDialog.showModal(); deleteCancel.focus()
    })
    let actionPointer = false
    toolbar.addEventListener('pointerdown', event => {
      actionPointer = event.target instanceof Element && !!event.target.closest('.card-actions button')
    })
    toolbar.addEventListener('dragstart', event => {
      if (actionPointer) { event.preventDefault(); return }
      if (!writable(card) || !event.dataTransfer) { event.preventDefault(); return }
      dragging = card.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-sidenote-id', card.id)
      node.classList.add('dragging')
    })
    toolbar.addEventListener('dragend', clearDrag)
    grip.addEventListener('keydown', event => {
      if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || !writable(card)) return
      event.preventDefault()
      const ids = displayedIds(), index = ids.indexOf(card.id)
      const destination = index + (event.key === 'ArrowUp' ? -1 : 1)
      if (destination < 0 || destination >= ids.length) return
      const full = session.view.notes.map(value => value.id)
      void session.reorderNotes(reorderDisplayed(full, new Set(ids), card.id, ids[destination], destination > index)).catch(report)
    })
    node.addEventListener('dragover', event => {
      if (!dragging || !writable(card)) return
      event.preventDefault(); clearDropMarkers()
      node.classList.add(event.clientY < node.getBoundingClientRect().top + node.offsetHeight / 2 ? 'drop-before' : 'drop-after')
    })
    node.addEventListener('drop', event => {
      if (!dragging || !writable(card)) return
      event.preventDefault(); event.stopPropagation()
      const moving = dragging, after = node.classList.contains('drop-after')
      clearDrag()
      if (moving === card.id) return
      const latest = session.view.notes
      const displayed = new Set(displayedIds())
      void session.reorderNotes(reorderDisplayed(latest.map(value => value.id), displayed, moving, card.id, after)).catch(report)
    })
    try {
      card.source = createSourceEditor(body, card.key, (key, text) => { void session.save(text, key).catch(report) }, error => {
        card.error = error instanceof Error ? error.message : String(error)
        render()
      })
    } catch (error) {
      card.error = error instanceof Error ? error.message : String(error)
    }
    return card
  }
  function clearDropMarkers() {
    for (const card of cards.values()) card.node.classList.remove('drop-before', 'drop-after')
  }
  function clearDrag() {
    dragging = null; clearDropMarkers()
    for (const card of cards.values()) card.node.classList.remove('dragging')
  }
  function disposeCard(card: Card) {
    const animation = removals.get(card)
    const scroll = panel.scrollTop
    removals.delete(card); animation?.cancel()
    card.cancelBlur?.(); card.source?.dispose(); card.markdown.dispose(); card.node.remove()
    if (!removals.size) panel.classList.remove('note-removal-active')
    if (animation) panel.scrollTop = scroll
    if (cards.get(card.key) === card) cards.delete(card.key)
  }
  function removeCard(card: Card) {
    if (removals.has(card)) return
    panel.classList.add('note-removal-active')
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const scroll = panel.scrollTop
      disposeCard(card); panel.scrollTop = scroll
      return
    }
    card.source?.sync(card.text, false, session.view.epoch, session.view.invalidations.get(card.key))
    card.node.inert = true
    card.node.classList.add('note-card-removing')
    const height = card.node.getBoundingClientRect().height
    const gap = [...list.children].filter(node => !(node as HTMLElement).hidden).length > 1
      ? parseFloat(getComputedStyle(list).rowGap) || 0 : 0
    const animation = card.node.animate([
      { height: `${height}px`, minHeight: '0', opacity: 1, marginBottom: '0', borderWidth: '1px' },
      { height: '0', minHeight: '0', opacity: 0, marginBottom: `${-gap}px`, borderWidth: '0' }
    ], { duration: 200, easing: 'ease-out', fill: 'forwards' })
    removals.set(card, animation)
    void animation.finished.then(() => disposeCard(card), () => {})
  }
  let renderedEpoch = 0
  let renderedDefaultMode: 'editing' | 'reading' | undefined
  function reconcile(view: NoteView, preference: PreferenceView): void {
    if (disposed) return
    for (const control of bulkButtons) control.disabled = !view.ready || !preference.ready
    if (preference.ready && renderedDefaultMode !== preference.defaultMode) {
      renderedDefaultMode = preference.defaultMode
      for (const card of cards.values()) {
        if (!card.node.contains(document.activeElement)) card.reading = renderedDefaultMode === 'reading'
      }
    }
    if (renderedEpoch !== view.epoch) {
      for (const card of cards.values()) disposeCard(card)
      renderedEpoch = view.epoch
    }
    if (!deleting && deletion && (view.scopeKey !== deletion.scope || view.epoch !== deletion.epoch || !view.ready)) {
      deletion = undefined; if (deleteDialog.open) deleteDialog.close()
    }
    const currentKeys = new Set(view.notes.map(note => note.key))
    for (const card of cards.values()) {
      if (removals.has(card)) {
        if (card.scope !== view.scopeKey || view.loading || currentKeys.has(card.key)) disposeCard(card)
        else continue
      }
      if (card.scope === view.scopeKey && !view.loading && !currentKeys.has(card.key)) {
        if (requestedRemovals.has(card.key)) removeCard(card)
        else disposeCard(card)
        continue
      }
      if (card.scope !== view.scopeKey || view.loading || !currentKeys.has(card.key)) {
        card.source?.sync(card.text, false, view.epoch, view.invalidations.get(card.key))
      }
      card.node.hidden = card.scope !== view.scopeKey || view.loading || !currentKeys.has(card.key)
    }
    let position = list.firstElementChild
    for (const note of view.notes) {
      let card = cards.get(note.key)
      if (!card) card = makeCard(note, view.scopeKey)
      const matches = matchesFilter(options.filter(), note)
      if (card.labelId !== note.labelId && !matches && (card.node.contains(document.activeElement) || dragging === card.id)) card.pinned = true
      card.labelId = note.labelId
      card.text = note.text; card.node.hidden = view.loading || !matches && !card.pinned
      card.pending.hidden = matches || !card.pinned
      if (card.node.hidden && !card.picker.hidden) { card.picker.hidden = true; card.label.setAttribute('aria-expanded', 'false') }
      while (position?.classList.contains('note-card-removing')) position = position.nextElementSibling
      if (position !== card.node) list.insertBefore(card.node, position)
      position = card.node.nextElementSibling
      const ready = view.ready && preference.ready && !card.node.hidden && !card.error && !!card.source
      card.source?.sync(note.text, ready, view.epoch, view.invalidations.get(card.key))
      card.source?.setLineNumbers(preference.lineNumbers)
      for (const control of card.controls) control.disabled = !ready
      const assigned = session.labels.labels.find(value => value.id === note.labelId)
      const labelText = assigned?.name ?? '+ Label'
      if (card.label.dataset.labelText !== labelText || card.label.dataset.labelColor !== (assigned?.color ?? '')) {
        if (card.label.dataset.labelColor) card.toolbar.classList.remove(`label-color-${card.label.dataset.labelColor}`)
        if (assigned) card.toolbar.classList.add(`label-color-${assigned.color}`)
        card.label.replaceChildren()
        if (assigned) { const dot = document.createElement('span'); dot.className = `label-dot label-color-${assigned.color}`; dot.setAttribute('aria-hidden', 'true'); card.label.append(dot) }
        const text = document.createElement('span'); text.textContent = labelText; card.label.append(text)
        card.label.dataset.labelText = labelText; card.label.dataset.labelColor = assigned?.color ?? ''
      }
      card.label.setAttribute('aria-label', assigned ? `Label: ${assigned.name}` : 'Add label')
      const labelDisabled = !ready || !session.labels.ready || session.labels.busy
      if (labelDisabled && ready && (document.activeElement === card.label || card.picker.contains(document.activeElement))) {
        card.node.querySelector<HTMLElement>('.card-toolbar')!.focus({ preventScroll: true })
      }
      card.label.disabled = labelDisabled
      if (labelDisabled && !card.picker.hidden) { card.picker.hidden = true; card.label.setAttribute('aria-expanded', 'false') }
      card.trash.disabled ||= deleting || emptyRemovals.has(card.key)
      card.body.hidden = card.collapsed || card.reading
      card.preview.hidden = card.collapsed || !card.reading
      card.summary.hidden = !card.collapsed
      if (card.collapsed && card.summaryText !== note.text) {
        card.summary.textContent = markdownSummary(note.text) + (note.text.trim() ? '...' : ''); card.summary.title = card.summary.textContent; card.summaryText = note.text
      }
      icon(card.mode, card.reading ? 'Edit note' : 'Read note', card.reading ? icons.pencil : icons.eye)
      icon(card.collapse, card.collapsed ? 'Expand note' : 'Minimize note', card.collapsed ? icons.expand : icons.minimize)
      card.collapse.setAttribute('aria-expanded', String(!card.collapsed))
      if (card.reading && !card.collapsed) card.markdown.render(note.text, note.key, ready, view.epoch)
      else card.markdown.suspend()
      if (focusNew === card.key && ready) {
        focusNew = undefined; card.node.scrollIntoView({ block: 'nearest' }); card.source?.show(true)
      }
    }
    const displayed = view.notes.filter(note => !cards.get(note.key)?.node.hidden).length
    for (const control of bulkButtons) control.disabled ||= displayed === 0
  }
  async function removeNote() {
    const captured = deletion
    if (!captured || deleting || !writable() || session.view.scopeKey !== captured.scope || session.view.epoch !== captured.epoch) return
    deleting = true; deleteConfirm.disabled = deleteCancel.disabled = true
    const key = session.view.notes.find(note => note.id === captured.id)?.key
    if (key) requestedRemovals.add(key)
    try {
      await session.deleteNote(captured.id)
      if (deletion === captured) {
        deletion = undefined
        if (deleteDialog.open) deleteDialog.close()
        const active = document.activeElement
        if (session.view.scopeKey === captured.scope && session.view.ready
          && (deleteDialog.open || active === document.body || active === captured.opener || active?.closest('.note-card-removing'))) {
          focusAdd()
        }
      }
    } catch (error) {
      const current = session.view
      if (deleteDialog.open && deletion === captured && current.ready && current.scopeKey === captured.scope && current.epoch === captured.epoch) {
        deleteError.textContent = error instanceof Error ? error.message : String(error); deleteError.hidden = false
      } else {
        deletion = undefined
        if (deleteDialog.open) deleteDialog.close()
        report(error)
      }
    } finally {
      if (key) requestedRemovals.delete(key)
      deleting = false; deleteConfirm.disabled = deleteCancel.disabled = false; render()
    }
  }

  const unbindDialog = bindDialogControls(deleteDialog, deleteCancel, {
    canClose: () => !deleting,
    returnFocus: () => { const opener = deletion?.opener; deletion = undefined; return opener?.isConnected ? opener : null }
  })
  const confirmDeletion = () => { void removeNote() }
  deleteConfirm.addEventListener('click', confirmDeletion)
  return {
    render: reconcile,
    get displayed() { return session.view.notes.filter(note => !cards.get(note.key)?.node.hidden).length },
    filterChoosing() {
      for (const card of cards.values()) { card.cancelBlur?.(); card.pinned = false }
    },
    get problem() { return [...cards.values()].find(card => !card.node.hidden && card.error)?.error ?? '' },
    async addNote() {
      const scope = session.view.scopeKey, epoch = session.view.epoch
      const key = await session.createNote()
      if (key && session.view.scopeKey === scope && session.view.epoch === epoch && session.view.ready) {
        const card = cards.get(key)
        if (card) { card.pinned = true; card.reading = false; card.collapsed = false }
        focusNew = key; render()
      }
    },
    scopeChanging() {
      ++focusGeneration
      for (const card of cards.values()) { card.cancelBlur?.(); card.pinned = false }
      clearDrag()
      if (deleteDialog.open) { deletion = undefined; deleteDialog.close() }
    },
    theme() { for (const card of cards.values()) card.source?.theme() },
    dispose() {
      disposed = true
      unbindDialog(); deleteConfirm.removeEventListener('click', confirmDeletion)
      for (const control of bulkButtons) {
        control.removeEventListener('pointerdown', keepCardFocus)
        control.removeEventListener('click', setAllMinimized)
      }
      document.removeEventListener('pointerdown', resetPointer, true)
      document.removeEventListener('pointerup', resetPointer, true)
      document.removeEventListener('dragend', resetPointer, true)
      for (const card of cards.values()) disposeCard(card)
    }
  }
}
