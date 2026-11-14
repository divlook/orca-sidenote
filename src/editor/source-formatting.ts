import { EditorSelection, type EditorState, type SelectionRange } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorView, type Command } from '@codemirror/view'
import { canonicalSource } from '../source-text'
import { rawEdit, rawPosition, sourceField } from './source-state'

export function escapeLinkLabel(text: string): string {
  return text.replace(/[\\`*{}\[\]()#+\-.!_>~|&<]/g, '\\$&')
}

// Fail closed when parsing has not reached the selection. Never nest automatic
// links in code, links, images, reference definitions, or raw HTML.
export function ordinaryLinkLabel(state: EditorState, range: SelectionRange): boolean {
  if (range.empty || !state.sliceDoc(range.from, range.to).trim() || /\n/.test(state.sliceDoc(range.from, range.to))) return false
  const tree = ensureSyntaxTree(state, range.to, 50)
  if (!tree) return false
  let ordinary = true
  tree.iterate({ from: range.from, to: range.to, enter(node) {
    if (node.from < range.to && node.to > range.from
      && /^(?:CodeBlock|FencedCode|InlineCode|Link|Image|Autolink|URL|LinkReference|HTMLBlock|HTMLTag|CommentBlock|Comment|ProcessingInstructionBlock|ProcessingInstruction)$/.test(node.name)) {
      ordinary = false
      return false
    }
  } })
  return ordinary
}

function formatSelections(view: EditorView, opening: string, closing: string, link = false, typing = false): boolean {
  if (view.state.readOnly || view.composing) return false
  const state = view.state, ranges = state.selection.ranges, raw = state.field(sourceField)
  if (typing && ranges.every(range => range.empty)) return false
  const edits = ranges.map(range => {
    const label = raw.slice(rawPosition(state, range.from), rawPosition(state, range.to))
    return { from: range.from, to: range.to,
      insert: typing && range.empty ? opening : opening + (link ? escapeLinkLabel(label) : label) + closing }
  })
  const spec = rawEdit(state, edits), changes = state.changes(spec.changes ?? [])
  const selection = EditorSelection.create(ranges.map((range, index) => {
    const start = changes.mapPos(range.from, -1), length = canonicalSource(edits[index].insert).length
    if (link) return EditorSelection.cursor(start + (range.empty ? 1 : length - 1))
    if (range.empty) return EditorSelection.cursor(start + opening.length)
    const from = start + opening.length, to = from + range.to - range.from
    return EditorSelection.range(range.anchor === range.from ? from : to, range.head === range.to ? to : from)
  }), state.selection.mainIndex)
  view.dispatch({ ...spec, selection, userEvent: typing ? 'input.type' : 'input.format', scrollIntoView: true })
  return true
}

export function markdownMarker(marker: string): Command {
  return view => formatSelections(view, marker, marker)
}
export const markdownLink: Command = view => formatSelections(view, '[', ']()', true)

const closing: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' }
export function wrapSelectedText(view: EditorView, text: string): boolean {
  return Object.hasOwn(closing, text) && formatSelections(view, text, closing[text], false, true)
}
export const selectionWrapping = EditorView.inputHandler.of((view, _from, _to, text) => wrapSelectedText(view, text))
