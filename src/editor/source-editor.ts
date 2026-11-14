import { Compartment, EditorState, Prec } from '@codemirror/state'
import { EditorView, crosshairCursor, drawSelection, dropCursor, keymap, lineNumbers, rectangularSelection } from '@codemirror/view'
import { historyKeymap, indentWithTab, standardKeymap } from '@codemirror/commands'
import { search, searchKeymap } from '@codemirror/search'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import type { TaskMarker } from '../markdown/markdown-tasks'
import { acceptSourceTransaction, documentPosition, exactSource, rawEdit, rawPosition, sourceEOL, sourceExtensions, sourceField } from './source-state'
import { occurrenceSession } from './source-commands'
import { pasteSource, selectedSource, type SourceClipboard } from './source-clipboard'
import { sourceMenu } from './source-menu'
import { sourceKeymap } from './source-actions'
import { sourceTheme } from './source-theme'

export interface SourceEditor {
  sync(text: string, ready: boolean, epoch: number, invalidation?: number): void
  setLineNumbers(visible: boolean): void
  toggleTask(key: string, text: string, marker: TaskMarker, epoch: number): boolean
  show(focus: boolean): void
  theme(): void
  dispose(): void
}
export function createSourceEditor(container: HTMLElement, key: string, changed: (key: string, text: string) => void,
  failed: (error: unknown) => void): SourceEditor {
  const writable = new Compartment(), numbers = new Compartment(), palette = new Compartment()
  let enabled = false, disposed = false, broken = false, initialized = false
  let epoch = 0, invalidation = 0, revision = 0, visibleNumbers = true
  const clipboard: SourceClipboard = {}
  let drag: { state: EditorState; ranges: readonly { from: number; to: number }[]; text: string } | undefined
  const active = () => !disposed && !broken && enabled && initialized
  function copyPayload(event: ClipboardEvent, editor: EditorView) {
    if (!event.clipboardData) return
    const payload = selectedSource(editor.state)
    event.clipboardData.setData('text/plain', payload.text)
    event.clipboardData.setData('application/x-sidenote-lines', String(payload.linewise))
    clipboard.copied = { text: payload.text, linewise: payload.linewise }
    event.preventDefault()
    return payload
  }
  function extensions(text: string) {
    return [sourceExtensions(text), occurrenceSession, EditorState.allowMultipleSelections.of(true),
      writable.of([EditorState.readOnly.of(!enabled), EditorView.editable.of(enabled)]),
      numbers.of(visibleNumbers ? lineNumbers() : []), palette.of(sourceTheme()),
      EditorView.contentAttributes.of({ 'aria-label': 'Note source', 'aria-multiline': 'true' }),
      EditorView.lineWrapping, drawSelection(), dropCursor(), rectangularSelection(), crosshairCursor(),
      EditorView.clickAddsSelectionRange.of(event => event.altKey),
      markdown({ base: markdownLanguage, addKeymap: false, completeHTMLTags: false, pasteURLAsLink: false }), search({ top: true }),
      Prec.highest(keymap.of([
        ...sourceKeymap,
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
          return !!copyPayload(event, editor)
        },
        cut(event, editor) {
          if (!active() || editor.state.readOnly) return true
          const payload = copyPayload(event, editor)
          if (!payload) return false
          editor.dispatch({ changes: payload.ranges.map(range => ({ from: range.from, to: range.to })), userEvent: 'delete.cut' }); return true
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
  let view: EditorView
  try {
    view = new EditorView({ parent: container, state: EditorState.create({ extensions: extensions('') }),
    dispatchTransactions(transactions, editor) {
      if (disposed) return
      const originEpoch = epoch
      let originRevision = revision
      try {
        for (const transaction of transactions) {
          if (transaction.startState !== editor.state) throw new Error('The editor transaction is stale.')
          const current = active() && revision === originRevision && epoch === originEpoch
          if ((transaction.docChanged || transaction.effects.some(effect => effect.is(exactSource))) && (!current || transaction.startState.readOnly)) continue
          const result = acceptSourceTransaction(transaction, current)
          if (result.rejected) {
            if (!result.restoration) throw new Error('The editor rejected an unexpected read-only transaction.')
            editor.update([transaction, result.restoration])
          } else {
            editor.update([transaction])
            if (editor.state.field(sourceField) !== transaction.startState.field(sourceField) && current) {
              originRevision = ++revision
              changed(key, editor.state.field(sourceField))
            }
          }
        }
      } catch (error) { broken = true; failed(error) }
    }
  })
  } catch (error) {
    container.replaceChildren()
    throw error
  }
  if (broken) { view.destroy(); throw new Error('The Source editor could not be initialized.') }
  // Let CM initialize native dragging, then replace its canonical clipboard text
  // at the outer DOM listener with the exact payload captured for that event.
  const exactDrag = (event: DragEvent) => { if (drag?.state === view.state) event.dataTransfer?.setData('text/plain', drag.text) }
  view.dom.addEventListener('dragstart', exactDrag)
  let removeMenu: (() => void) | undefined
  let observer: ResizeObserver | undefined
  try {
    removeMenu = sourceMenu(view, () => disposed || !initialized ? null : revision, clipboard)
    observer = new ResizeObserver(() => { if (!disposed && !container.hidden) view.requestMeasure() })
    observer.observe(container)
  function configure() {
    view.dispatch({ effects: writable.reconfigure([EditorState.readOnly.of(!enabled), EditorView.editable.of(enabled)]) })
  }
  return {
    sync(text, ready, nextEpoch, nextInvalidation = 0) {
      if (disposed) return
      ready = ready && !broken
      if (epoch !== nextEpoch || invalidation !== nextInvalidation) {
        initialized = false; epoch = nextEpoch; invalidation = nextInvalidation; revision++
      }
      const changedReady = enabled !== ready
      if (changedReady) revision++
      enabled = ready
      if (!ready) { if (changedReady) configure(); return }
      if (!initialized) {
        try {
          const state = EditorState.create({ doc: text, extensions: extensions(text) })
          initialized = true
          view.setState(state)
          view.requestMeasure()
        } catch (error) {
          broken = true; enabled = false; failed(error)
        }
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
    dispose() { if (disposed) return; disposed = true; enabled = false; revision++; observer?.disconnect(); removeMenu?.(); view.dom.removeEventListener('dragstart', exactDrag); view.destroy(); drag = undefined }
  }
  } catch (error) {
    observer?.disconnect(); removeMenu?.(); view.dom.removeEventListener('dragstart', exactDrag); view.destroy()
    throw error
  }
}
