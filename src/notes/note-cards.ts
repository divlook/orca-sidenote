import { createNoteCard, setCardIcon, type NoteCardView } from './note-card-view'
import { bindDialogControls } from '../dialog'
import type { NoteSession } from './session'
import type { NotePreferences } from '../settings/note-preferences'
import { matchesFilter, reorderDisplayed, type NoteFilter } from './note-filter'

type NoteView = NoteSession['view']
type PreferenceView = NotePreferences['view']
type CardListOptions = {
  list: HTMLElement; panel: HTMLElement; deleteDialog: HTMLDialogElement
  minimizeAll: HTMLButtonElement; expandAll: HTMLButtonElement
  session: NoteSession; preferences: () => PreferenceView; changed: () => void
  filter: () => NoteFilter; filterRoot: HTMLElement
  report: (error: unknown) => void; openLink: (href: string, scope: string, epoch: number) => Promise<unknown>; focusAdd: () => void
}
type Card = {
  key: string; id: string; scope: string; node: HTMLElement; view: NoteCardView
  pinned: boolean; labelId?: string; cancelBlur?: () => void; events: AbortController
}

export function createNoteCards(options: CardListOptions) {
  const { list, panel, deleteDialog, minimizeAll, expandAll, session, preferences, changed, report, openLink, focusAdd } = options
  const deleteCancel = deleteDialog.querySelector<HTMLButtonElement>('#delete-note-cancel')!
  const deleteConfirm = deleteDialog.querySelector<HTMLButtonElement>('#delete-note-confirm')!
  const deleteError = deleteDialog.querySelector<HTMLElement>('#delete-note-error')!
  const events = new AbortController(), signal = events.signal
  const cards = new Map<string, Card>(), removals = new Map<Card, Animation>()
  const requestedRemovals = new Set<string>(), emptyRemovals = new Set<string>()
  let toolbarPointer: string | undefined, disposed = false, dragging: string | null = null
  let deletion: { id: string; scope: string; epoch: number; opener: HTMLButtonElement } | undefined
  let deleting = false, focusNew: string | undefined, focusGeneration = 0, renderedEpoch = 0
  let renderedDefaultMode: 'editing' | 'reading' | undefined
  let displayed = new Set<string>()
  const resetPointer = () => { toolbarPointer = undefined }
  for (const name of ['pointerdown', 'pointerup', 'dragend']) document.addEventListener(name, resetPointer, { capture: true, signal })
  function writable(card?: Card) {
    const view = session.view
    return view.ready && preferences().ready && (!card || card.scope === view.scopeKey && !card.node.hidden && !card.view.error)
  }
  const bulkButtons = [minimizeAll, expandAll]
  setCardIcon(minimizeAll, 'Minimize all notes', 'minimize')
  setCardIcon(expandAll, 'Expand all notes', 'expand')
  for (const control of bulkButtons) {
    control.addEventListener('pointerdown', event => { if (event.button === 0) event.preventDefault() }, { signal })
    control.addEventListener('click', event => {
      if (disposed || !writable()) return
      const minimized = event.currentTarget === minimizeAll
      let updated = false
      for (const card of cards.values()) {
        if (card.scope !== session.view.scopeKey || !displayed.has(card.id) || card.view.minimized === minimized) continue
        card.view.setMinimized(minimized); updated = true
      }
      if (updated) changed()
    }, { signal })
  }
  function bindCardBlur(card: Card) {
    const signal = card.events.signal
    let frame: number | undefined
    card.cancelBlur = () => { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined }
    card.node.addEventListener('pointerdown', event => {
      if (event.target instanceof Node && card.view.ownsToolbar(event.target)) {
        toolbarPointer = card.key
        if (!(event.target instanceof Element) || !event.target.closest('button')) card.view.focusToolbar()
      }
    }, { signal })
    card.node.addEventListener('dragend', event => {
      if (event.target instanceof Node && card.view.ownsToolbar(event.target)
        && !disposed && cards.get(card.key) === card && card.scope === session.view.scopeKey && session.view.ready) card.view.focusToolbar()
    }, { signal })
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
        if (card.pinned) { card.pinned = false; changed() }
        if (options.filterRoot.contains(document.activeElement)) return
        if (card.scope !== view.scopeKey || epoch !== view.epoch || !wasWritable) {
          if (preferences().ready && preferences().defaultMode === 'reading') card.view.setReading(true)
          return
        }
        if (view.notes.find(note => note.key === card.key)?.text.trim() === '') {
          emptyRemovals.add(card.key); requestedRemovals.add(card.key)
          void session.pruneEmptyNote(card.id).catch(report).finally(() => {
            emptyRemovals.delete(card.key); requestedRemovals.delete(card.key)
            if (!disposed && cards.get(card.key) === card && writable(card) && epoch === session.view.epoch
              && preferences().defaultMode === 'reading' && !card.node.contains(document.activeElement)
              && !dragging && toolbarPointer !== card.key && session.view.notes.find(note => note.key === card.key)?.text.trim()) card.view.setReading(true)
            changed()
          })
        } else if (preferences().defaultMode === 'reading') { card.view.setReading(true); changed() }
      })
    }, { signal })
  }
  function makeCard(note: NoteView['notes'][number], scope: string): Card {
    const presentation = createNoteCard(note.key, note, preferences().defaultMode === 'reading', {
      changed, writable: () => writable(card),
      save: text => { void session.save(text, card.key).catch(report) },
      assign: id => { void session.assignLabel(card.key, id).catch(report) },
      openLink: (href, epoch) => openLink(href, scope, epoch), report,
      remove: opener => {
        if (deleting || emptyRemovals.has(card.key) || !writable(card)) return
        deletion = { id: card.id, scope, epoch: session.view.epoch, opener }
        if (!preferences().confirmDelete) { void removeNote(); return }
        deleteError.hidden = true; deleteDialog.showModal(); deleteCancel.focus()
      }
    })
    const card: Card = { key: note.key, id: note.id, scope, node: presentation.element, view: presentation, pinned: false, events: new AbortController() }
    const signal = card.events.signal
    cards.set(card.key, card); bindCardBlur(card)
    let actionPointer = false
    card.node.addEventListener('pointerdown', event => {
      actionPointer = event.target instanceof Element && presentation.ownsToolbar(event.target) && !!event.target.closest('button') && !presentation.ownsGrip(event.target)
    }, { signal })
    card.node.addEventListener('dragstart', event => {
      if (!(event.target instanceof Node) || !presentation.ownsToolbar(event.target)) return
      if (actionPointer || !writable(card) || !event.dataTransfer) { event.preventDefault(); return }
      dragging = card.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-sidenote-id', card.id)
      card.node.classList.add('dragging')
    }, { signal })
    card.node.addEventListener('dragend', clearDrag, { signal })
    card.node.addEventListener('keydown', event => {
      if (!(event.target instanceof Node) || !presentation.ownsGrip(event.target) || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || !writable(card)) return
      event.preventDefault()
      const ids = session.view.notes.filter(note => displayed.has(note.id)).map(note => note.id), index = ids.indexOf(card.id)
      const destination = index + (event.key === 'ArrowUp' ? -1 : 1)
      if (destination < 0 || destination >= ids.length) return
      void session.reorderNotes(reorderDisplayed(session.view.notes.map(note => note.id), displayed, card.id, ids[destination], destination > index)).catch(report)
    }, { signal })
    card.node.addEventListener('dragover', event => {
      if (!dragging || !writable(card)) return
      event.preventDefault(); clearDropMarkers()
      card.node.classList.add(event.clientY < card.node.getBoundingClientRect().top + card.node.offsetHeight / 2 ? 'drop-before' : 'drop-after')
    }, { signal })
    card.node.addEventListener('drop', event => {
      if (!dragging || !writable(card)) return
      event.preventDefault(); event.stopPropagation()
      const moving = dragging, after = card.node.classList.contains('drop-after'); clearDrag()
      if (moving === card.id) return
      void session.reorderNotes(reorderDisplayed(session.view.notes.map(note => note.id), displayed, moving, card.id, after)).catch(report)
    }, { signal })
    return card
  }
  function clearDropMarkers() { for (const card of cards.values()) card.node.classList.remove('drop-before', 'drop-after') }
  function clearDrag() {
    dragging = null; clearDropMarkers()
    for (const card of cards.values()) card.node.classList.remove('dragging')
  }
  function disposeCard(card: Card) {
    const animation = removals.get(card), scroll = panel.scrollTop
    removals.delete(card); animation?.cancel(); card.cancelBlur?.(); card.events.abort(); card.view.dispose()
    if (!removals.size) panel.classList.remove('note-removal-active')
    if (animation) panel.scrollTop = scroll
    if (cards.get(card.key) === card) cards.delete(card.key)
  }
  function removeCard(card: Card) {
    if (removals.has(card)) return
    panel.classList.add('note-removal-active')
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const scroll = panel.scrollTop; disposeCard(card); panel.scrollTop = scroll; return
    }
    card.view.suspend(session.view.epoch, session.view.invalidations.get(card.key)); card.node.inert = true; card.node.classList.add('note-card-removing')
    const height = card.node.getBoundingClientRect().height
    const gap = [...list.children].filter(node => !(node as HTMLElement).hidden).length > 1 ? parseFloat(getComputedStyle(list).rowGap) || 0 : 0
    const animation = card.node.animate([
      { height: `${height}px`, minHeight: '0', opacity: 1, marginBottom: '0', borderWidth: '1px' },
      { height: '0', minHeight: '0', opacity: 0, marginBottom: `${-gap}px`, borderWidth: '0' }
    ], { duration: 200, easing: 'ease-out', fill: 'forwards' })
    removals.set(card, animation); void animation.finished.then(() => disposeCard(card), () => {})
  }
  function reconcile(view: NoteView, preference: PreferenceView): void {
    if (disposed) return
    if (preference.ready && renderedDefaultMode !== preference.defaultMode) {
      renderedDefaultMode = preference.defaultMode
      for (const card of cards.values()) if (!card.node.contains(document.activeElement)) card.view.setReading(renderedDefaultMode === 'reading')
    }
    if (renderedEpoch !== view.epoch) { for (const card of cards.values()) disposeCard(card); renderedEpoch = view.epoch }
    if (!deleting && deletion && (view.scopeKey !== deletion.scope || view.epoch !== deletion.epoch || !view.ready)) {
      deletion = undefined; if (deleteDialog.open) deleteDialog.close()
    }
    const currentKeys = new Set(view.notes.map(note => note.key))
    for (const card of cards.values()) {
      if (card.scope !== view.scopeKey) card.pinned = false
      if (removals.has(card)) {
        if (card.scope !== view.scopeKey || view.loading || currentKeys.has(card.key)) disposeCard(card)
        else continue
      }
      if (card.scope === view.scopeKey && !view.loading && !currentKeys.has(card.key)) {
        if (requestedRemovals.has(card.key)) removeCard(card); else disposeCard(card)
        continue
      }
      if (card.scope !== view.scopeKey || view.loading || !currentKeys.has(card.key)) {
        card.view.suspend(view.epoch, view.invalidations.get(card.key)); card.node.hidden = true
      }
    }
    displayed = new Set()
    const filter = options.filter(), filterPending = new Set<string>()
    for (const note of view.notes) {
      const card = cards.get(note.key) ?? makeCard(note, view.scopeKey), matches = matchesFilter(filter, note)
      if (card.labelId !== note.labelId && !matches && (card.node.contains(document.activeElement) || dragging === card.id)) card.pinned = true
      card.labelId = note.labelId
      if (!view.loading && (matches || card.pinned)) displayed.add(note.id)
      if (!matches && card.pinned) filterPending.add(note.id)
    }
    let position = list.firstElementChild
    const catalog = session.labels
    for (const note of view.notes) {
      const card = cards.get(note.key)!
      while (position?.classList.contains('note-card-removing')) position = position.nextElementSibling
      if (position !== card.node) list.insertBefore(card.node, position)
      position = card.node.nextElementSibling
      const ready = view.ready && preference.ready && !card.view.error
      card.view.update({ note, ready, epoch: view.epoch, invalidation: view.invalidations.get(card.key), lineNumbers: preference.lineNumbers,
        hidden: !displayed.has(note.id), filterPending: filterPending.has(note.id),
        catalog, deleting: deleting || emptyRemovals.has(card.key) })
      if (focusNew === card.key && ready && displayed.has(card.id)) {
        focusNew = undefined; card.node.scrollIntoView({ block: 'nearest' }); card.view.focusBody()
      }
    }
    for (const control of bulkButtons) control.disabled = !view.ready || !preference.ready || displayed.size === 0
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
          && (deleteDialog.open || active === document.body || active === captured.opener || active?.closest('.note-card-removing'))) focusAdd()
      }
    } catch (error) {
      const current = session.view
      if (deleteDialog.open && deletion === captured && current.ready && current.scopeKey === captured.scope && current.epoch === captured.epoch) {
        deleteError.textContent = error instanceof Error ? error.message : String(error); deleteError.hidden = false
      } else { deletion = undefined; if (deleteDialog.open) deleteDialog.close(); report(error) }
    } finally {
      if (key) requestedRemovals.delete(key)
      deleting = false; deleteConfirm.disabled = deleteCancel.disabled = false; changed()
    }
  }
  const unbindDialog = bindDialogControls(deleteDialog, deleteCancel, {
    canClose: () => !deleting, returnFocus: () => { const opener = deletion?.opener; deletion = undefined; return opener?.isConnected ? opener : null }
  })
  deleteConfirm.addEventListener('click', () => { void removeNote() }, { signal })
  return {
    render: reconcile,
    get displayed() { return displayed.size },
    filterChoosing() { for (const card of cards.values()) { card.cancelBlur?.(); card.pinned = false } },
    get problem() { return [...cards.values()].find(card => !card.node.hidden && card.view.error)?.view.error ?? '' },
    async addNote() {
      const scope = session.view.scopeKey, epoch = session.view.epoch, key = await session.createNote()
      if (key && session.view.scopeKey === scope && session.view.epoch === epoch && session.view.ready) {
        const card = cards.get(key)
        if (card) { card.pinned = true; card.view.startEditing() }
        focusNew = key; changed()
      }
    },
    scopeChanging() {
      ++focusGeneration
      for (const card of cards.values()) card.cancelBlur?.()
      clearDrag()
      if (deleteDialog.open) { deletion = undefined; deleteDialog.close() }
    },
    theme() { for (const card of cards.values()) card.view.theme() },
    dispose() { disposed = true; unbindDialog(); events.abort(); for (const card of cards.values()) disposeCard(card) }
  }
}
