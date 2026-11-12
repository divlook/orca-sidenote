import { EditorSelection, type EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { allOccurrences, rawEdit } from './source-commands'
import { sourceEOL, rawPosition, sourceField } from './source-state'

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
export function sourceMenu(view: EditorView, current: () => number | null, clipboardState: SourceClipboard): () => void {
  const menu = document.createElement('div')
  menu.className = 'source-context-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', 'Source actions')
  menu.hidden = true
  const message = document.createElement('div')
  message.className = 'source-context-message'
  message.setAttribute('role', 'alert')
  const actions: HTMLButtonElement[] = []
  let anchorState = view.state
  let anchorRevision: number | null = null
  const valid = () => !menu.hidden && anchorRevision !== null && current() === anchorRevision
    && view.state.field(sourceField) === anchorState.field(sourceField)
  function close() { menu.hidden = true; message.textContent = '' }
  async function clipboard(action: 'Cut' | 'Copy' | 'Paste') {
    const state = anchorState
    if (!valid() || action !== 'Copy' && state.readOnly) { close(); return }
    try {
      if (action === 'Paste') {
        const text = await navigator.clipboard.readText()
        if (!valid()) { close(); return }
        pasteSource(view, text, clipboardState.copied?.text === text && clipboardState.copied.linewise, state.selection)
      } else {
        const { ranges, text, linewise } = selectedSource(state)
        await navigator.clipboard.writeText(text)
        clipboardState.copied = { text, linewise }
        if (!valid()) { close(); return }
        if (action === 'Cut') view.dispatch({ changes: ranges.map(range => ({ from: range.from, to: range.to })), userEvent: 'delete.cut' })
      }
      close(); view.focus()
    } catch {
      if (!valid()) { close(); return }
      message.textContent = `Unable to ${action.toLowerCase()}: clipboard access failed. Your note was not changed.`
    }
  }
  for (const label of ['Change All Occurrences', 'Cut', 'Copy', 'Paste'] as const) {
    const button = document.createElement('button')
    button.type = 'button'; button.textContent = label; button.setAttribute('role', 'menuitem')
    if (label === 'Change All Occurrences') {
      button.setAttribute('aria-keyshortcuts', 'Meta+F2')
      const shortcut = document.createElement('span')
      shortcut.className = 'source-context-shortcut'; shortcut.textContent = '⌘F2'; shortcut.setAttribute('aria-hidden', 'true')
      button.append(shortcut)
    }
    button.addEventListener('click', () => {
      if (label === 'Change All Occurrences') {
        if (valid()) { view.dispatch({ selection: anchorState.selection, userEvent: 'select' }); allOccurrences(view) }
        close(); view.focus()
      }
      else void clipboard(label)
    })
    actions.push(button); menu.append(button)
  }
  menu.append(message); document.body.append(menu)
  menu.addEventListener('focusout', event => { if (!menu.contains(event.relatedTarget as Node)) close() })
  const open = (event: MouseEvent) => {
    event.preventDefault(); close()
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (position !== null && !view.state.selection.ranges.some(range => !range.empty && range.from <= position && range.to >= position)) {
      view.dispatch({ selection: { anchor: position }, userEvent: 'select' })
    }
    anchorState = view.state; anchorRevision = current()
    actions[0].disabled = view.state.readOnly
    actions[1].disabled = actions[3].disabled = view.state.readOnly || anchorRevision === null
    menu.hidden = false
    menu.style.left = `${Math.max(0, Math.min(event.clientX, window.innerWidth - menu.offsetWidth))}px`
    menu.style.top = `${Math.max(0, Math.min(event.clientY, window.innerHeight - menu.offsetHeight))}px`
    actions.find(button => !button.disabled)?.focus()
  }
  const outside = (event: PointerEvent) => { if (!menu.contains(event.target as Node)) close() }
  const key = (event: KeyboardEvent) => {
    if (menu.hidden) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); view.focus() }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const enabled = actions.filter(button => !button.disabled), index = enabled.indexOf(document.activeElement as HTMLButtonElement)
      enabled[(index + (event.key === 'ArrowDown' ? 1 : enabled.length - 1)) % enabled.length]?.focus()
    } else if (event.key === 'Tab') close()
  }
  view.dom.addEventListener('contextmenu', open)
  document.addEventListener('pointerdown', outside)
  menu.addEventListener('keydown', key)
  return () => { view.dom.removeEventListener('contextmenu', open); document.removeEventListener('pointerdown', outside); menu.remove() }
}
