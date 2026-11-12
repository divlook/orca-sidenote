import { Compartment, EditorState, Prec, type StateEffect } from '@codemirror/state'
import { EditorView, crosshairCursor, drawSelection, dropCursor, keymap, lineNumbers, rectangularSelection } from '@codemirror/view'
import { addCursorAbove, addCursorBelow, deleteLine, historyKeymap, indentLess, indentMore, indentWithTab, simplifySelection, standardKeymap } from '@codemirror/commands'
import { closeSearchPanel, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { DEFAULT_NOTE_LIMIT, type NoteLimit } from './note-settings'
import type { TaskMarker } from './markdown-tasks'
import { acceptSourceTransaction, documentPosition, exactSource, rawPosition, sourceEOL, sourceExtensions, sourceField } from './source-state'
import { allOccurrences, insertLine, lineEndCursors, lineOperation, listEnter, nextOccurrence, occurrenceSession, rawEdit } from './source-commands'
import { pasteSource, selectedSource, sourceMenu, type SourceClipboard } from './source-menu'
import { sourceTheme } from './source-theme'

export interface SourceEditor {
  sync(key: string, text: string, ready: boolean, limit: NoteLimit, epoch: number, invalidations?: ReadonlyMap<string, number>): void
  setLineNumbers(visible: boolean): void
  toggleTask(key: string, text: string, marker: TaskMarker, epoch: number): boolean
  show(focus: boolean): void
  theme(): void
  dispose(): void
}
export async function createSourceEditor(container: HTMLElement, changed: (key: string, text: string) => void,
  failed: (error: unknown) => void, limited: () => void): Promise<SourceEditor> {
  type Entry = { state: EditorState; scroll?: StateEffect<unknown> }
  const entries = new Map<string, Entry>(), invalidated = new Map<string, number>()
  const writable = new Compartment(), numbers = new Compartment(), palette = new Compartment()
  let key = '', enabled = false, disposed = false, broken = false, epoch = 0, revision = 0, visibleNumbers = true
  let limit: NoteLimit = DEFAULT_NOTE_LIMIT
  const clipboard: SourceClipboard = {}
  let drag: { state: EditorState; ranges: readonly { from: number; to: number }[]; text: string } | undefined
  const active = () => !disposed && !broken && enabled && !!key && entries.get(key)?.state === view.state
  function extensions(text: string) {
    return [sourceExtensions(text), occurrenceSession, EditorState.allowMultipleSelections.of(true),
      writable.of([EditorState.readOnly.of(!enabled), EditorView.editable.of(enabled)]),
      numbers.of(visibleNumbers ? lineNumbers() : []), palette.of(sourceTheme()),
      EditorView.contentAttributes.of({ 'aria-label': 'Note source', 'aria-multiline': 'true' }),
      EditorView.lineWrapping, drawSelection(), dropCursor(), rectangularSelection(), crosshairCursor(),
      EditorView.clickAddsSelectionRange.of(event => event.altKey),
      markdown({ base: markdownLanguage, addKeymap: false, completeHTMLTags: false, pasteURLAsLink: false }), search({ top: true }),
      Prec.highest(keymap.of([
        { key: 'Enter', run: listEnter },
        { key: 'Mod-Alt-f', run: editor => { openSearchPanel(editor); editor.dom.querySelector<HTMLInputElement>('input[name="replace"]')?.focus(); return true }, scope: 'editor search-panel' },
        { key: 'Escape', run: editor => closeSearchPanel(editor) || simplifySelection(editor), scope: 'editor search-panel' },
        { key: 'Alt-ArrowUp', run: lineOperation(-1, false) }, { key: 'Alt-ArrowDown', run: lineOperation(1, false) },
        { key: 'Alt-Shift-ArrowUp', run: lineOperation(-1, true) }, { key: 'Alt-Shift-ArrowDown', run: lineOperation(1, true) },
        { key: 'Mod-Shift-k', run: deleteLine },
        { key: 'Mod-Enter', run: insertLine(false) }, { key: 'Mod-Shift-Enter', run: insertLine(true) },
        { key: 'Mod-Alt-ArrowUp', run: addCursorAbove }, { key: 'Mod-Alt-ArrowDown', run: addCursorBelow },
        { key: 'Mod-d', run: nextOccurrence }, { key: 'Mod-Shift-l', run: allOccurrences }, { key: 'Mod-F2', run: allOccurrences },
        { key: 'Alt-Shift-i', run: lineEndCursors }, { key: 'Mod-]', run: indentMore }, { key: 'Mod-[', run: indentLess },
        indentWithTab, ...searchKeymap, ...historyKeymap, ...standardKeymap
      ])),
      EditorView.exceptionSink.of(error => { if (!disposed) { broken = true; failed(error) } }),
      EditorView.domEventHandlers({
        paste(event, editor) {
          if (!active() || editor.state.readOnly) return true
          const text = event.clipboardData?.getData('text/plain')
          if (text === undefined) return false
          const linewise = event.clipboardData?.getData('application/x-sidenote-lines') === 'true'
            || clipboard.copied?.text === text && clipboard.copied.linewise
          event.preventDefault(); pasteSource(editor, text, linewise); return true
        },
        copy(event, editor) {
          if (!event.clipboardData) return false
          const { text, linewise } = selectedSource(editor.state)
          event.clipboardData.setData('text/plain', text)
          event.clipboardData.setData('application/x-sidenote-lines', String(linewise))
          clipboard.copied = { text, linewise }
          event.preventDefault(); return true
        },
        cut(event, editor) {
          if (!active() || editor.state.readOnly) return true
          if (!event.clipboardData) return false
          const { ranges, text, linewise } = selectedSource(editor.state)
          event.clipboardData.setData('text/plain', text)
          event.clipboardData.setData('application/x-sidenote-lines', String(linewise))
          clipboard.copied = { text, linewise }
          event.preventDefault(); editor.dispatch({ changes: ranges.map(range => ({ from: range.from, to: range.to })), userEvent: 'delete.cut' }); return true
        },
        dragstart(event, editor) {
          const ranges = editor.state.selection.ranges.filter(range => !range.empty)
          if (!ranges.length || !event.dataTransfer) return false
          const raw = editor.state.field(sourceField)
          drag = { state: editor.state, ranges, text: ranges.map(range => raw.slice(rawPosition(editor.state, range.from), rawPosition(editor.state, range.to))).join(editor.state.facet(sourceEOL)) }
          event.dataTransfer.setData('text/plain', drag.text)
          return false
        },
        dragend() { drag = undefined; return false },
        drop(event, editor) {
          if (!active() || editor.state.readOnly) { drag = undefined; return true }
          const at = editor.posAtCoords({ x: event.clientX, y: event.clientY }), text = event.dataTransfer?.getData('text/plain')
          if (at === null || text === undefined) return false
          event.preventDefault()
          const moving = drag?.state === editor.state && !event.altKey && !event.ctrlKey
          if (moving && drag!.ranges.some(range => at >= range.from && at <= range.to)) { drag = undefined; return true }
          const edits = [...(moving ? drag!.ranges.map(range => ({ ...range, insert: '' })) : []), { from: at, to: at, insert: moving ? drag!.text : text }].sort((a, b) => a.from - b.from)
          const spec = rawEdit(editor.state, edits, { userEvent: moving ? 'move.drop' : 'input.drop', scrollIntoView: true })
          const changes = editor.state.changes(spec.changes ?? [])
          editor.dispatch({ ...spec, changes, selection: { anchor: changes.mapPos(at, -1), head: changes.mapPos(at, 1) } })
          editor.focus()
          drag = undefined; return true
        }
      })]
  }
  const view = new EditorView({ parent: container, state: EditorState.create({ extensions: extensions('') }),
    dispatchTransactions(transactions, editor) {
      if (disposed) return
      const originKey = key, originEpoch = epoch, entry = entries.get(originKey)
      let originRevision = revision
      try {
        for (const transaction of transactions) {
          if (transaction.startState !== editor.state) throw new Error('The editor transaction is stale.')
          const current = !broken && enabled && key === originKey && revision === originRevision && epoch === originEpoch && entries.get(originKey) === entry
          // Blocked DOM/programmatic input never enters history. A previously
          // writable candidate is resolved synchronously before any readiness change.
          if ((transaction.docChanged || transaction.effects.some(effect => effect.is(exactSource))) && (!current || transaction.startState.readOnly)) continue
          const result = acceptSourceTransaction(transaction, limit, current)
          if (result.rejected) {
            if (!result.restoration) throw new Error('The editor rejected an unexpected read-only transaction.')
            editor.update([transaction, result.restoration])
            if (entry) entry.state = result.state
            if (current) limited()
          } else {
            editor.update([transaction])
            if (entry) entry.state = editor.state
            if (editor.state.field(sourceField) !== transaction.startState.field(sourceField) && current && entry) {
              originRevision = ++revision
              changed(originKey, editor.state.field(sourceField))
            }
          }
        }
      } catch (error) { broken = true; failed(error) }
    }
  })
  if (broken) { view.destroy(); throw new Error('The Source editor could not be initialized.') }
  // Let CM initialize native dragging, then replace its canonical clipboard text
  // at the outer DOM listener with the exact payload captured for that event.
  const exactDrag = (event: DragEvent) => { if (drag?.state === view.state) event.dataTransfer?.setData('text/plain', drag.text) }
  view.dom.addEventListener('dragstart', exactDrag)
  const removeMenu = sourceMenu(view, () => disposed || !key ? null : revision, clipboard)
  const observer = new ResizeObserver(() => { if (!disposed && !container.hidden) view.requestMeasure() })
  observer.observe(container)
  function configure() {
    view.dispatch({ effects: [writable.reconfigure([EditorState.readOnly.of(!enabled), EditorView.editable.of(enabled)]), numbers.reconfigure(visibleNumbers ? lineNumbers() : []), palette.reconfigure(sourceTheme())] })
  }
  return {
    sync(nextKey, text, ready, nextLimit, nextEpoch, invalidations) {
      if (disposed) return
      ready = ready && !broken
      for (const [changedKey, version] of invalidations ?? []) {
        if (invalidated.get(changedKey) === version) continue
        invalidated.set(changedKey, version); entries.delete(changedKey); revision++
        if (key === changedKey) key = ''
      }
      if (epoch !== nextEpoch) { entries.clear(); key = ''; epoch = nextEpoch; revision++ }
      if (key !== nextKey || enabled !== ready) revision++
      limit = nextLimit
      const changedReady = enabled !== ready
      enabled = ready
      if (key !== nextKey && key) {
        const previous = entries.get(key)
        if (previous) { previous.state = view.state; previous.scroll = view.scrollSnapshot() }
      }
      if (!ready) { if (changedReady) configure(); return }
      if (key !== nextKey) {
        let entry = entries.get(nextKey)
        if (!entry) { entry = { state: EditorState.create({ doc: text, extensions: extensions(text) }) }; entries.set(nextKey, entry) }
        key = nextKey; view.setState(entry.state); configure()
        if (entry.scroll) view.dispatch({ effects: entry.scroll })
        view.requestMeasure()
      } else if (changedReady) configure()
    },
    setLineNumbers(visible) {
      if (disposed || visible === visibleNumbers) return
      visibleNumbers = visible
      view.dispatch({ effects: numbers.reconfigure(visible ? lineNumbers() : []) })
    },
    toggleTask(expectedKey, text, marker, expectedEpoch) {
      if (!active() || expectedKey !== key || expectedEpoch !== epoch || view.state.field(sourceField) !== text
        || text[marker.offset] !== marker.marker || text[marker.offset - 1] !== '[' || text[marker.offset + 1] !== ']') return false
      const position = documentPosition(view.state, marker.offset), scroll = view.scrollSnapshot()
      view.dispatch({ changes: { from: position, to: position + 1, insert: marker.marker === ' ' ? 'x' : ' ' }, effects: scroll, userEvent: 'input.task' })
      return true
    },
    show(focus) { if (!disposed) { view.requestMeasure(); if (focus && enabled) view.focus() } },
    theme() { if (!disposed) view.dispatch({ effects: palette.reconfigure(sourceTheme()) }) },
    dispose() { if (disposed) return; disposed = true; enabled = false; revision++; observer.disconnect(); removeMenu(); view.dom.removeEventListener('dragstart', exactDrag); view.destroy(); entries.clear(); drag = undefined }
  }
}
