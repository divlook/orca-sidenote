import { createSourceEditor, type SourceEditor } from '../editor/source-editor'
import { createPreview, type MarkdownPreview } from '../markdown/preview'
import { markdownSummary } from '../markdown/markdown-summary'
import { bindDialogControls } from '../dialog'
import type { NoteSession } from './session'
import type { NotePreferences } from '../settings/note-preferences'

type NoteView = NoteSession['view']
type PreferenceView = NotePreferences['view']
type CardListOptions = {
  list: HTMLElement; panel: HTMLElement; deleteDialog: HTMLDialogElement;
  minimizeAll: HTMLButtonElement; expandAll: HTMLButtonElement;
  session: NoteSession; preferences: () => PreferenceView; changed: () => void;
  report: (error: unknown) => void; openLink: (href: string, scope: string, epoch: number) => Promise<unknown>; focusAdd: () => void;
}

export function createNoteCards(options: CardListOptions) {
  const { list, panel, deleteDialog, minimizeAll, expandAll, session, preferences, changed, report, openLink, focusAdd } = options
  const deleteCancel = deleteDialog.querySelector<HTMLButtonElement>('#delete-note-cancel')!
  const deleteConfirm = deleteDialog.querySelector<HTMLButtonElement>('#delete-note-confirm')!
  const deleteError = deleteDialog.querySelector<HTMLElement>('#delete-note-error')!
  type Card = {
    key: string; id: string; scope: string; node: HTMLElement; body: HTMLElement; summary: HTMLElement; preview: HTMLElement;
    mode: HTMLButtonElement; collapse: HTMLButtonElement; trash: HTMLButtonElement; controls: HTMLButtonElement[];
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
    minimize: '<path d="M10 2v5m-3-3 3 3 3-3M10 18v-5m-3 3 3-3 3 3M2 10h3m3 0h4m3 0h3"/>',
    expand: '<path d="M3 2h14M3 18h14M10 8V4m-3 3 3-3 3 3M10 12v4m-3-3 3 3 3-3"/>',
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
    return view.ready && preferences().ready && (!card || card.scope === view.scopeKey && !card.error && !!card.source)
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
      if (!card || card.collapsed === minimized) continue
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
        if (card.scope !== view.scopeKey || epoch !== view.epoch || !writable(card)) {
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
    const actions = document.createElement('div'); actions.className = 'card-actions'; toolbar.append(actions)
    const mode = button(actions, 'Read note', icons.eye)
    const collapse = button(actions, 'Minimize note', icons.minimize), trash = button(actions, 'Delete note', icons.trash)
    const body = document.createElement('div'); body.className = 'note-source'
    const preview = document.createElement('article'); preview.className = 'note-preview'; preview.hidden = true
    const summary = document.createElement('div'); summary.className = 'note-summary'; summary.hidden = true
    summary.tabIndex = -1
    node.append(toolbar, summary, body, preview)
    const card: Card = { key: note.key, id: note.id, scope, node, body, preview, summary, mode, collapse, trash,
      controls: [grip, mode, collapse, trash], reading: preferences().defaultMode === 'reading', collapsed: false, error: '', text: note.text,
      markdown: createPreview(preview, href => openLink(href, card.scope, session.view.epoch), report, (key, text, marker, epoch) => {
        const current = session.view.notes.find(value => value.key === key)
        return writable(card) && card.reading && !card.collapsed && current?.text === text
          && session.view.epoch === epoch && !!card.source?.toggleTask(key, text, marker, epoch)
      })
    }
    cards.set(card.key, card)
    bindCardBlur(card)
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
      const ids = session.view.notes.map(value => value.id), index = ids.indexOf(card.id)
      const destination = index + (event.key === 'ArrowUp' ? -1 : 1)
      if (destination < 0 || destination >= ids.length) return
      ;[ids[index], ids[destination]] = [ids[destination], ids[index]]
      void session.reorderNotes(ids).catch(report)
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
      const ids = session.view.notes.map(value => value.id).filter(id => id !== moving)
      ids.splice(ids.indexOf(card.id) + Number(after), 0, moving)
      void session.reorderNotes(ids).catch(report)
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
    for (const control of bulkButtons) control.disabled = !view.ready || !preference.ready || view.notes.length === 0
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
      card.text = note.text; card.node.hidden = view.loading
      while (position?.classList.contains('note-card-removing')) position = position.nextElementSibling
      if (position !== card.node) list.insertBefore(card.node, position)
      position = card.node.nextElementSibling
      const ready = view.ready && preference.ready && !card.error && !!card.source
      card.source?.sync(note.text, ready, view.epoch, view.invalidations.get(card.key))
      card.source?.setLineNumbers(preference.lineNumbers)
      for (const control of card.controls) control.disabled = !view.ready || !preference.ready
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
    get problem() { return [...cards.values()].find(card => !card.node.hidden && card.error)?.error ?? '' },
    async addNote() {
      const scope = session.view.scopeKey, epoch = session.view.epoch
      const key = await session.createNote()
      if (key && session.view.scopeKey === scope && session.view.epoch === epoch && session.view.ready) {
        const card = cards.get(key)
        if (card) { card.reading = false; card.collapsed = false }
        focusNew = key; render()
      }
    },
    scopeChanging() {
      ++focusGeneration
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
