import { sourceShortcutGroups } from './source-actions'

export function renderShortcutHelp(shortcutsList: HTMLElement): void {
  for (const [title, shortcuts] of sourceShortcutGroups) {
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
