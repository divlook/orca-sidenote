import { EditorSelection, type EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { rawEdit, sourceEOL, rawPosition, sourceField } from './source-state'

export type SourceClipboard = { copied?: { text: string; linewise: boolean } }

export function selectedSource(state: EditorState) {
  const ranges: { from: number; to: number }[] = []
  const linewise = state.selection.ranges.every(range => range.empty)
  for (const selection of state.selection.ranges) {
    const range = selection.empty
      ? { from: state.doc.lineAt(selection.head).from, to: Math.min(state.doc.length, state.doc.lineAt(selection.head).to + 1) } : selection
    const previous = ranges.at(-1)
    if (previous && range.from <= previous.to) previous.to = Math.max(previous.to, range.to)
    else ranges.push({ from: range.from, to: range.to })
  }
  const raw = state.field(sourceField), eol = state.facet(sourceEOL)
  let text = ranges.map(range => raw.slice(rawPosition(state, range.from), rawPosition(state, range.to))).join(linewise ? '' : eol)
  if (linewise && !/[\r\n]$/.test(text)) text += eol
  return { ranges, text, linewise }
}

export function pasteSource(view: EditorView, text: string, linewise = false, selected = view.state.selection): void {
  const ranges = selected.ranges
  const pieces = text.split(/\r\n|\r|\n/)
  const edits = ranges.map((range, index) => ({ from: linewise && range.empty ? view.state.doc.lineAt(range.head).from : range.from,
    to: linewise && range.empty ? view.state.doc.lineAt(range.head).from : range.to,
    insert: !linewise && ranges.length > 1 && pieces.length === ranges.length ? pieces[index] : text }))
    .filter((edit, index, all) => !linewise || index === 0 || edit.from !== all[index - 1].from)
  const changes = view.state.changes(edits)
  const selection = linewise ? selected.map(changes)
    : EditorSelection.create(edits.map(edit => EditorSelection.cursor(changes.mapPos(edit.to, 1))), selected.mainIndex)
  view.dispatch(rawEdit(view.state, edits, { selection, userEvent: 'input.paste', scrollIntoView: true }))
}
