export type MenuAction = { label: string; disabled?: boolean; tooltip?: string; run: () => void }

let tooltipId = 0

// Keep focus inside the note card: leaving it can prune empty notes or switch modes.
export function createContextMenu(container: HTMLElement, actions: () => MenuAction[]) {
  const menu = document.createElement('div')
  menu.className = 'note-context-menu'; menu.setAttribute('role', 'menu'); menu.hidden = true
  const error = document.createElement('div')
  error.className = 'note-clipboard-error'; error.setAttribute('role', 'alert'); error.hidden = true
  let opener: HTMLElement | null = null
  let generation = 0
  let hideTooltip: (() => void) | undefined
  function close(focus = false) {
    generation++
    hideTooltip?.(); hideTooltip = undefined
    if (focus && menu.contains(document.activeElement)) opener?.focus({ preventScroll: true })
    menu.hidden = true; menu.replaceChildren()
  }
  const outside = (event: Event) => { if (!menu.contains(event.target as Node)) close() }
  const context = (event: MouseEvent) => {
    event.preventDefault(); event.stopPropagation(); close()
    const entries = actions()
    if (!entries.length) return
    const captured = generation
    opener = document.activeElement instanceof HTMLElement && container.contains(document.activeElement) ? document.activeElement : container
    if (!container.hasAttribute('tabindex')) container.tabIndex = -1
    if (opener === container) container.focus({ preventScroll: true })
    for (const entry of entries) {
      const button = document.createElement('button')
      button.type = 'button'; button.textContent = entry.label; button.disabled = !!entry.disabled
      button.addEventListener('click', () => { if (!button.disabled && !menu.hidden && captured === generation) { close(true); entry.run() } })
      if (entry.disabled && entry.tooltip) {
        const row = document.createElement('div')
        row.className = 'note-context-tooltip-row'; row.setAttribute('role', 'none')
        button.setAttribute('aria-hidden', 'true')
        const info = document.createElement('button')
        info.type = 'button'; info.className = 'note-context-info'; info.textContent = 'ⓘ'
        info.setAttribute('role', 'menuitem'); info.setAttribute('aria-label', `${entry.label} information`)
        const tooltip = document.createElement('div')
        tooltip.className = 'note-context-tooltip'; tooltip.id = `note-context-tooltip-${++tooltipId}`
        tooltip.setAttribute('role', 'tooltip'); tooltip.textContent = entry.tooltip
        tooltip.style.visibility = 'hidden'
        info.setAttribute('aria-describedby', tooltip.id)
        const hide = () => { tooltip.style.visibility = 'hidden' }
        const show = () => { tooltip.style.visibility = 'visible' }
        hideTooltip = hide
        info.addEventListener('pointerenter', show); info.addEventListener('pointerleave', hide)
        info.addEventListener('focus', show); info.addEventListener('blur', hide)
        row.append(button, info, tooltip); menu.append(row)
      } else {
        button.setAttribute('role', 'menuitem')
        button.addEventListener('pointerenter', () => hideTooltip?.())
        button.addEventListener('focus', () => hideTooltip?.())
        menu.append(button)
      }
    }
    container.append(menu, error); menu.hidden = false
    menu.style.left = `${Math.max(6, Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 6))}px`
    menu.style.top = `${Math.max(6, Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 6))}px`
    for (const tooltip of menu.querySelectorAll<HTMLElement>('.note-context-tooltip')) {
      tooltip.style.width = `${Math.min(280, window.innerWidth - 12)}px`
      const icon = tooltip.previousElementSibling!.getBoundingClientRect()
      const above = icon.top - 10
      const below = window.innerHeight - icon.bottom - 10
      const placeAbove = tooltip.offsetHeight <= above || above >= below
      tooltip.style.maxHeight = `${Math.max(1, placeAbove ? above : below)}px`
      tooltip.style.left = `${Math.max(6, Math.min((icon.left + icon.right - tooltip.offsetWidth) / 2, window.innerWidth - tooltip.offsetWidth - 6))}px`
      tooltip.style.top = `${placeAbove ? icon.top - tooltip.offsetHeight - 4 : icon.bottom + 4}px`
    }
    // Pointer actions retain the editor selection. Keyboard invocation enters the menu.
    if (event.button === 0) menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  }
  const ownerKey = (event: KeyboardEvent) => {
    if (menu.hidden || menu.contains(event.target as Node) || event.key !== 'Escape') return
    event.preventDefault(); event.stopPropagation(); close()
  }
  menu.addEventListener('pointerdown', event => event.preventDefault())
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); event.stopPropagation(); close(true); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault(); event.stopPropagation()
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not(button:disabled)')]
    const index = items.indexOf(document.activeElement as HTMLElement)
    items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  })
  container.addEventListener('contextmenu', context)
  container.addEventListener('keydown', ownerKey, true)
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('scroll', outside, true)
  return {
    close,
    fail(message: string) { container.append(error); error.textContent = message; error.hidden = false },
    clearError() { error.hidden = true },
    dispose() { close(); menu.remove(); error.remove(); container.removeEventListener('contextmenu', context); container.removeEventListener('keydown', ownerKey, true); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('scroll', outside, true) }
  }
}

export const primaryModifier = () => /Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl'

export function copyMarkdown(container: HTMLElement, text: string): boolean {
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const selection = document.getSelection()
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : []
  const textarea = document.createElement('textarea')
  textarea.value = text; textarea.readOnly = true; textarea.tabIndex = -1
  textarea.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
  let copied = false
  const copy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return
    event.clipboardData.setData('text/plain', text); event.preventDefault(); copied = true
  }
  textarea.addEventListener('copy', copy)
  container.append(textarea)
  try { textarea.focus({ preventScroll: true }); textarea.select(); return document.execCommand('copy') && copied }
  finally {
    focused?.focus({ preventScroll: true }); textarea.remove()
    if (selection) { selection.removeAllRanges(); for (const range of ranges) if (range.commonAncestorContainer.isConnected) selection.addRange(range) }
  }
}
