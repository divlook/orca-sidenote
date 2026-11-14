import { addCursorAbove, addCursorBelow, deleteLine, indentLess, indentMore, simplifySelection } from '@codemirror/commands'
import { closeSearchPanel, openSearchPanel } from '@codemirror/search'
import type { KeyBinding } from '@codemirror/view'
import { allOccurrences, insertLine, lineEndCursors, lineOperation, listEnter, nextOccurrence } from './source-commands'
import { markdownLink, markdownMarker } from './source-formatting'

const shortcuts = {
  bold: { key: 'Mod-b', display: '⌘B' }, italic: { key: 'Mod-i', display: '⌘I' },
  strike: { key: 'Mod-Shift-x', display: '⇧⌘X' }, link: { key: 'Mod-k', display: '⌘K' },
  replace: { key: 'Mod-Alt-f', display: '⌘⌥F' },
  escape: { key: 'Escape', display: 'Esc' },
  moveUp: { key: 'Alt-ArrowUp', display: '⌥↑' }, moveDown: { key: 'Alt-ArrowDown', display: '⌥↓' },
  copyUp: { key: 'Alt-Shift-ArrowUp', display: '⇧⌥↑' }, copyDown: { key: 'Alt-Shift-ArrowDown', display: '⇧⌥↓' },
  deleteLine: { key: 'Mod-Shift-k', display: '⇧⌘K' },
  insertBelow: { key: 'Mod-Enter', display: '⌘Enter' }, insertAbove: { key: 'Mod-Shift-Enter', display: '⇧⌘Enter' },
  cursorUp: { key: 'Mod-Alt-ArrowUp', display: '⌘⌥↑' }, cursorDown: { key: 'Mod-Alt-ArrowDown', display: '⌘⌥↓' },
  nextOccurrence: { key: 'Mod-d', display: '⌘D' }, allOccurrences: { key: 'Mod-Shift-l', display: '⇧⌘L' },
  lineEnds: { key: 'Alt-Shift-i', display: '⇧⌥I' },
  indent: { key: 'Mod-]', display: '⌘]' }, outdent: { key: 'Mod-[', display: '⌘[' }
} as const

export const changeAllOccurrences = {
  label: 'Change All Occurrences', shortcut: '⌘F2', ariaShortcut: 'Meta+F2', key: 'Mod-F2', run: allOccurrences
} as const

export const sourceKeymap: readonly KeyBinding[] = [
  { key: 'Enter', run: listEnter },
  { key: shortcuts.bold.key, run: markdownMarker('**') }, { key: shortcuts.italic.key, run: markdownMarker('*') },
  { key: shortcuts.strike.key, run: markdownMarker('~~') }, { key: shortcuts.link.key, run: markdownLink },
  { key: shortcuts.replace.key, run: editor => { openSearchPanel(editor); editor.dom.querySelector<HTMLInputElement>('input[name="replace"]')?.focus(); return true }, scope: 'editor search-panel' },
  { key: shortcuts.escape.key, run: editor => closeSearchPanel(editor) || simplifySelection(editor), scope: 'editor search-panel' },
  { key: shortcuts.moveUp.key, run: lineOperation(-1, false) }, { key: shortcuts.moveDown.key, run: lineOperation(1, false) },
  { key: shortcuts.copyUp.key, run: lineOperation(-1, true) }, { key: shortcuts.copyDown.key, run: lineOperation(1, true) },
  { key: shortcuts.deleteLine.key, run: deleteLine },
  { key: shortcuts.insertBelow.key, run: insertLine(false) }, { key: shortcuts.insertAbove.key, run: insertLine(true) },
  { key: shortcuts.cursorUp.key, run: addCursorAbove }, { key: shortcuts.cursorDown.key, run: addCursorBelow },
  { key: shortcuts.nextOccurrence.key, run: nextOccurrence }, { key: shortcuts.allOccurrences.key, run: changeAllOccurrences.run }, { key: changeAllOccurrences.key, run: changeAllOccurrences.run },
  { key: shortcuts.lineEnds.key, run: lineEndCursors }, { key: shortcuts.indent.key, run: indentMore }, { key: shortcuts.outdent.key, run: indentLess }
]

export const sourceShortcutGroups = [
  ['Editing', [
    ['Select all', '⌘A'],
    ['Cut / Copy / Paste', '⌘X / ⌘C / ⌘V'],
    ['Undo / Redo', '⌘Z / ⇧⌘Z']
  ]],
  ['Markdown', [
    ['Bold', shortcuts.bold.display], ['Italic', shortcuts.italic.display],
    ['Strikethrough', shortcuts.strike.display], ['Link', shortcuts.link.display],
    ['Wrap selected text', `( / [ / { / " / ' / \``]
  ]],
  ['Find', [
    ['Find', '⌘F'],
    ['Replace', shortcuts.replace.display],
    ['Next / previous match', '⌘G / ⇧⌘G']
  ]],
  ['Line Editing', [
    ['Move line up / down', `${shortcuts.moveUp.display} / ${shortcuts.moveDown.display}`],
    ['Copy line up / down', `${shortcuts.copyUp.display} / ${shortcuts.copyDown.display}`],
    ['Delete line', shortcuts.deleteLine.display],
    ['Insert line below / above', `${shortcuts.insertBelow.display} / ${shortcuts.insertAbove.display}`],
    ['Indent / outdent', 'Tab / ⇧Tab', `${shortcuts.indent.display} / ${shortcuts.outdent.display}`]
  ]],
  ['Selection & Cursors', [
    ['Add cursor above / below', `${shortcuts.cursorUp.display} / ${shortcuts.cursorDown.display}`],
    ['Add cursor at click', '⌥Click'],
    ['Add next occurrence', shortcuts.nextOccurrence.display],
    ['Select all occurrences', shortcuts.allOccurrences.display],
    ['Add cursors at selected line ends', shortcuts.lineEnds.display],
    ['Remove extra cursors (closes Find first)', shortcuts.escape.display]
  ]],
  ['Navigation', [
    ['Line start / end', '⌘← / ⌘→'],
    ['Document start / end', '⌘↑ / ⌘↓'],
    ['Previous / next word', '⌥← / ⌥→'],
    ['Extend selection while navigating', 'Hold ⇧']
  ]]
] as const
