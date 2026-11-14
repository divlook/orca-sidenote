import type { EditorView } from '@codemirror/view'
import { changeAllOccurrences } from './source-actions'
import { pasteSource, selectedSource, type SourceClipboard } from './source-clipboard'
import { sourceField } from './source-state'

export function sourceMenu(view: EditorView, current: () => number | null, clipboardState: SourceClipboard): () => void {
  const menu = document.createElement('div')
  menu.className = 'source-context-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', 'Source actions')
  menu.hidden = true
  const message = document.createElement('div')
  message.className = 'source-context-message'
  message.setAttribute('role', 'alert')
  const actions: { button: HTMLButtonElement; eligible: () => boolean }[] = []
  let anchorState = view.state
  let anchorRevision: number | null = null
  const valid = () => !menu.hidden && anchorRevision !== null && current() === anchorRevision
    && view.state.field(sourceField) === anchorState.field(sourceField)
  function close() { menu.hidden = true; message.textContent = '' }
  async function clipboard(action: 'cut' | 'copy' | 'paste') {
    const state = anchorState
    if (!valid() || action !== 'copy' && state.readOnly) { close(); return }
    try {
      if (action === 'paste') {
        const text = await navigator.clipboard.readText()
        if (!valid()) { close(); return }
        pasteSource(view, text, clipboardState.copied?.text === text && clipboardState.copied.linewise, state.selection)
      } else {
        const { ranges, text, linewise } = selectedSource(state)
        await navigator.clipboard.writeText(text)
        clipboardState.copied = { text, linewise }
        if (!valid()) { close(); return }
        if (action === 'cut') view.dispatch({ changes: ranges.map(range => ({ from: range.from, to: range.to })), userEvent: 'delete.cut' })
      }
      close(); view.focus()
    } catch {
      if (!valid()) { close(); return }
      message.textContent = `Unable to ${action}: clipboard access failed. Your note was not changed.`
    }
  }
  const writable = () => !view.state.readOnly && anchorRevision !== null
  const descriptors = [
    { ...changeAllOccurrences, eligible: () => !view.state.readOnly, run: () => {
      if (valid()) { view.dispatch({ selection: anchorState.selection, userEvent: 'select' }); changeAllOccurrences.run(view) }
      close(); view.focus()
    } },
    { label: 'Cut', eligible: writable, run: () => { void clipboard('cut') } },
    { label: 'Copy', eligible: () => true, run: () => { void clipboard('copy') } },
    { label: 'Paste', eligible: writable, run: () => { void clipboard('paste') } }
  ]
  for (const action of descriptors) {
    const button = document.createElement('button')
    button.type = 'button'; button.textContent = action.label; button.setAttribute('role', 'menuitem')
    if ('ariaShortcut' in action) {
      button.setAttribute('aria-keyshortcuts', action.ariaShortcut)
      const shortcut = document.createElement('span')
      shortcut.className = 'source-context-shortcut'; shortcut.textContent = action.shortcut; shortcut.setAttribute('aria-hidden', 'true')
      button.append(shortcut)
    }
    button.addEventListener('click', action.run)
    actions.push({ button, eligible: action.eligible }); menu.append(button)
  }
  menu.append(message); view.dom.append(menu)
  menu.addEventListener('focusout', event => { if (!menu.contains(event.relatedTarget as Node)) close() })
  const open = (event: MouseEvent) => {
    event.preventDefault(); close()
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (position !== null && !view.state.selection.ranges.some(range => !range.empty && range.from <= position && range.to >= position)) {
      view.dispatch({ selection: { anchor: position }, userEvent: 'select' })
    }
    anchorState = view.state; anchorRevision = current()
    for (const action of actions) action.button.disabled = !action.eligible()
    menu.hidden = false
    menu.style.left = `${Math.max(0, Math.min(event.clientX, window.innerWidth - menu.offsetWidth))}px`
    menu.style.top = `${Math.max(0, Math.min(event.clientY, window.innerHeight - menu.offsetHeight))}px`
    actions.find(action => !action.button.disabled)?.button.focus()
  }
  const outside = (event: PointerEvent) => { if (!menu.contains(event.target as Node)) close() }
  const key = (event: KeyboardEvent) => {
    if (menu.hidden) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); view.focus() }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const enabled = actions.map(action => action.button).filter(button => !button.disabled), index = enabled.indexOf(document.activeElement as HTMLButtonElement)
      enabled[(index + (event.key === 'ArrowDown' ? 1 : enabled.length - 1)) % enabled.length]?.focus()
    } else if (event.key === 'Tab') close()
  }
  view.dom.addEventListener('contextmenu', open)
  document.addEventListener('pointerdown', outside)
  menu.addEventListener('keydown', key)
  return () => { view.dom.removeEventListener('contextmenu', open); document.removeEventListener('pointerdown', outside); menu.remove() }
}
