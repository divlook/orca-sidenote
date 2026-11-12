export function renderShortcutHelp(shortcutsList: HTMLElement): void {
  const shortcutGroups = [
    ['Editing', [
      ['Select all', '⌘A'],
      ['Cut / Copy / Paste', '⌘X / ⌘C / ⌘V'],
      ['Undo / Redo', '⌘Z / ⇧⌘Z']
    ]],
    ['Find', [
      ['Find', '⌘F'],
      ['Replace', '⌘⌥F'],
      ['Next / previous match', '⌘G / ⇧⌘G']
    ]],
    ['Line Editing', [
      ['Move line up / down', '⌥↑ / ⌥↓'],
      ['Copy line up / down', '⇧⌥↑ / ⇧⌥↓'],
      ['Delete line', '⇧⌘K'],
      ['Insert line below / above', '⌘Enter / ⇧⌘Enter'],
      ['Indent / outdent', 'Tab / ⇧Tab', '⌘] / ⌘[']
    ]],
    ['Selection & Cursors', [
      ['Add cursor above / below', '⌘⌥↑ / ⌘⌥↓'],
      ['Add cursor at click', '⌥Click'],
      ['Add next occurrence', '⌘D'],
      ['Select all occurrences', '⇧⌘L'],
      ['Add cursors at selected line ends', '⇧⌥I'],
      ['Remove extra cursors (closes Find first)', 'Esc']
    ]],
    ['Navigation', [
      ['Line start / end', '⌘← / ⌘→'],
      ['Document start / end', '⌘↑ / ⌘↓'],
      ['Previous / next word', '⌥← / ⌥→'],
      ['Extend selection while navigating', 'Hold ⇧']
    ]]
  ] as const

  for (const [title, shortcuts] of shortcutGroups) {
    const group = document.createElement('section')
    group.className = 'shortcut-group'
    const heading = document.createElement('h3')
    heading.textContent = title
    const list = document.createElement('dl')
    for (const [action, ...keys] of shortcuts) {
      const row = document.createElement('div')
      row.className = 'shortcut-row'
      const label = document.createElement('dt')
      label.textContent = action
      const value = document.createElement('dd')
      for (const [index, key] of keys.entries()) {
        if (index) value.append(document.createElement('br'))
        const keycap = document.createElement('kbd')
        keycap.textContent = key
        value.append(keycap)
      }
      row.append(label, value)
      list.append(row)
    }
    group.append(heading, list)
    shortcutsList.append(group)
  }
}
