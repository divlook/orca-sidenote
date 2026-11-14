import { EditorSelection, StateEffect, StateField, type EditorState } from '@codemirror/state'
import { type Command, type EditorView } from '@codemirror/view'
import { getSearchQuery, SearchQuery, searchPanelOpen } from '@codemirror/search'
import { markdownListItemLines } from '../markdown/markdown-list'
import { sourceEOL, rawPosition, sourceField, rawEdit } from './source-state'
import { canonicalSource } from '../source-text'

export function listEnter(view: EditorView): boolean {
  if (view.state.readOnly || view.composing || view.state.selection.ranges.some(range => !range.empty)) return false
  const state = view.state, eligible = markdownListItemLines(state.doc.toString()), lines = new Set<number>()
  const changes: { from: number; to: number; insert: string }[] = []
  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.head)
    if (lines.has(line.number)) return false
    lines.add(line.number)
    const item = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(?:\[([ xX])\]([ \t]+|$))?/.exec(line.text)
    if (!item || range.head - line.from < item[0].length || !eligible.has(line.number)) return false
    if (!line.text.slice(item[0].length).trim()) changes.push({ from: line.from, to: line.to, insert: item[1].replace(/(?:\t| {1,4})$/, '') })
    else {
      const ordered = /^(\d+)([.)])$/.exec(item[2])
      const marker = ordered ? `${Math.min(Number(ordered[1]) + 1, 999999999)}${ordered[2]}` : item[2]
      changes.push({ from: range.head, to: range.head, insert: `\n${item[1]}${marker}${item[3]}${item[4] === undefined ? '' : '[ ] '}` })
    }
  }
  const changeSet = state.changes(changes)
  view.dispatch({ changes: changeSet, selection: EditorSelection.create(changes.map(change => EditorSelection.cursor(changeSet.mapPos(change.to, 1))), state.selection.mainIndex), userEvent: 'input.list', scrollIntoView: true })
  return true
}
export function insertLine(above: boolean): Command {
  return view => {
    if (view.state.readOnly) return false
    const state = view.state
    const positions = [...new Set(state.selection.ranges.map(range => {
      const line = state.doc.lineAt(range.head)
      return above ? line.from : line.to
    }))].sort((a, b) => a - b)
    const changes = state.changes(positions.map(from => ({ from, insert: '\n' })))
    const mainLine = state.doc.lineAt(state.selection.main.head)
    const main = positions.indexOf(above ? mainLine.from : mainLine.to)
    view.dispatch({ changes, selection: EditorSelection.create(positions.map(position => EditorSelection.cursor(changes.mapPos(position, above ? -1 : 1))), main), userEvent: 'input.line', scrollIntoView: true })
    return true
  }
}
export const lineEndCursors: Command = view => {
  const lines = new Set<number>()
  for (const range of view.state.selection.ranges) {
    const first = view.state.doc.lineAt(range.from).number, last = view.state.doc.lineAt(range.to).number
    for (let line = first; line <= last; line++) lines.add(line)
  }
  const sorted = [...lines].sort((a, b) => a - b)
  const main = sorted.indexOf(view.state.doc.lineAt(view.state.selection.main.head).number)
  view.dispatch({ selection: EditorSelection.create(sorted.map(line => EditorSelection.cursor(view.state.doc.line(line).to)), main), userEvent: 'select' })
  return true
}
const rememberOccurrences = StateEffect.define<SearchQuery>()
export const occurrenceSession = StateField.define<SearchQuery | null>({
  create: () => null,
  update(value, transaction) {
    const remembered = transaction.effects.find(effect => effect.is(rememberOccurrences))
    if (remembered) return remembered.value as SearchQuery
    return transaction.docChanged || transaction.selection && !transaction.isUserEvent('select.occurrence') ? null : value
  }
})
function occurrenceMatches(state: EditorState) {
  const range = state.selection.main, configured = getSearchQuery(state)
  const visibleRegex = searchPanelOpen(state) && configured.regexp && !!configured.search
  const word = visibleRegex ? range : range.empty ? state.wordAt(range.head) : range
  if (!word || !visibleRegex && word.empty) return null
  const session = state.field(occurrenceSession, false)
  const query = visibleRegex ? configured : session ?? new SearchQuery({
    search: state.sliceDoc(word.from, word.to), literal: true,
    caseSensitive: range.empty || configured.caseSensitive, wholeWord: range.empty || configured.wholeWord })
  if (!query.valid) return null
  const ranges = [], cursor = query.getCursor(state)
  for (let match = cursor.next(); !match.done; match = cursor.next()) {
    if (match.value.from !== match.value.to) ranges.push(EditorSelection.range(match.value.from, match.value.to))
  }
  return { query, ranges, word }
}
export function allOccurrences(view: EditorView): boolean {
  const matches = occurrenceMatches(view.state)
  if (!matches?.ranges.length) return false
  const current = view.state.selection.main
  const main = Math.max(0, matches.ranges.findIndex(range => range.from <= current.from && range.to >= current.to))
  view.dispatch({ selection: EditorSelection.create(matches.ranges, main), effects: rememberOccurrences.of(matches.query), userEvent: 'select.occurrence' })
  return true
}
export function nextOccurrence(view: EditorView): boolean {
  const state = view.state, matches = occurrenceMatches(state)
  if (!matches?.ranges.length) return false
  if (state.selection.main.empty) {
    const selection = matches.word.empty ? matches.ranges.find(range => range.from >= state.selection.main.head) ?? matches.ranges[0] : matches.word
    view.dispatch({ selection, effects: rememberOccurrences.of(matches.query), userEvent: 'select.occurrence' })
    return true
  }
  const next = [...matches.ranges.filter(range => range.from >= state.selection.main.to), ...matches.ranges.filter(range => range.from < state.selection.main.to)]
    .find(range => !state.selection.ranges.some(selected => selected.from < range.to && selected.to > range.from))
  if (!next) return true
  const ranges = [...state.selection.ranges, next].sort((a, b) => a.from - b.from)
  view.dispatch({ selection: EditorSelection.create(ranges, ranges.indexOf(next)), effects: rememberOccurrences.of(matches.query), userEvent: 'select.occurrence', scrollIntoView: true })
  return true
}

export function lineOperation(direction: -1 | 1, copy: boolean): Command {
  return view => {
    const state = view.state
    if (state.readOnly) return false
    const blocks: { first: number; last: number }[] = []
    for (const range of state.selection.ranges) {
      const first = state.doc.lineAt(range.from).number
      const last = state.doc.lineAt(range.to > range.from && state.doc.lineAt(range.to).from === range.to ? range.to - 1 : range.to).number
      const previous = blocks.at(-1)
      if (previous && first <= previous.last + 1) previous.last = Math.max(previous.last, last)
      else blocks.push({ first, last })
    }
    const raw = state.field(sourceField), eol = state.facet(sourceEOL)
    const edits: { from: number; to: number; insert: string }[] = []
    const shifts: { from: number; to: number; delta: number }[] = []
    for (const block of blocks) {
      const first = state.doc.line(block.first), last = state.doc.line(block.last)
      if (copy) {
        const body = raw.slice(rawPosition(state, first.from), rawPosition(state, last.to))
        const at = direction < 0 ? first.from : last.to
        edits.push({ from: at, to: at, insert: direction < 0 ? body + eol : eol + body })
        shifts.push({ from: first.from, to: last.to, delta: direction < 0 ? 0 : canonicalSource(body).length + 1 })
      } else {
        if (direction < 0 && block.first === 1 || direction > 0 && block.last === state.doc.lines) continue
        const adjacent = state.doc.line(direction < 0 ? block.first - 1 : block.last + 1)
        const from = direction < 0 ? adjacent.from : first.from, to = direction < 0 ? last.to : adjacent.to
        const body = raw.slice(rawPosition(state, first.from), rawPosition(state, last.to))
        const neighbor = raw.slice(rawPosition(state, adjacent.from), rawPosition(state, adjacent.to))
        const separator = direction < 0 ? raw.slice(rawPosition(state, adjacent.to), rawPosition(state, first.from)) : raw.slice(rawPosition(state, last.to), rawPosition(state, adjacent.from))
        edits.push({ from, to, insert: direction < 0 ? body + separator + neighbor : neighbor + separator + body })
        shifts.push({ from: first.from, to: last.to, delta: (neighbor.length + 1) * direction })
      }
    }
    if (!edits.length) return false
    const changes = state.changes(edits.map(edit => ({ ...edit, insert: canonicalSource(edit.insert) })))
    const selection = EditorSelection.create(state.selection.ranges.map(range => {
      const shift = shifts.find(value => range.from >= value.from && range.to <= value.to)
      if (!shift) return range.map(changes)
      const before = edits.filter(edit => edit.to < shift.from).reduce((sum, edit) => sum + canonicalSource(edit.insert).length - (edit.to - edit.from), 0)
      return EditorSelection.range(range.anchor + shift.delta + before, range.head + shift.delta + before)
    }), state.selection.mainIndex)
    view.dispatch(rawEdit(state, edits, { selection, userEvent: copy ? 'input.copyline' : 'move.line', scrollIntoView: true }))
    return true
  }
}
