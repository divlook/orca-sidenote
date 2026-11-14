import { NoteFilters, allNotes } from './note-filter'
import type { NoteLabel } from './note-labels'

export function bindNoteFilter(filters: NoteFilters, choosing: () => void) {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
  const root = get('note-filter'), trigger = get<HTMLButtonElement>('filter-open'), summary = get('filter-summary')
  const menu = get('filter-menu'), clear = get<HTMLButtonElement>('filter-clear'), retry = get<HTMLButtonElement>('filter-retry')
  const count = get('filter-count'), empty = get('filtered-empty'), emptyClear = get<HTMLButtonElement>('filtered-empty-clear')
  trigger.setAttribute('aria-haspopup', 'dialog')
  menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Filter notes by label')
  let signature = '', disposed = false
  function close(focus = false) {
    menu.hidden = true; trigger.setAttribute('aria-expanded', 'false')
    if (focus && !trigger.disabled) trigger.focus({ preventScroll: true })
  }
  function position() {
    const bounds = trigger.getBoundingClientRect()
    menu.style.maxHeight = `${Math.max(60, window.innerHeight - 12)}px`
    menu.style.left = `${Math.max(6, Math.min(bounds.left, window.innerWidth - menu.offsetWidth - 6))}px`
    menu.style.top = `${Math.max(6, Math.min(bounds.bottom + 4, window.innerHeight - menu.offsetHeight - 6))}px`
  }
  function choose(value = allNotes()) { choosing(); void filters.choose(value) }
  trigger.addEventListener('click', () => {
    if (!menu.hidden) { close(); return }
    menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); position()
    menu.querySelector<HTMLButtonElement>('.note-filter-option')?.focus()
  })
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); trigger.click() }
  })
  clear.addEventListener('click', () => choose())
  emptyClear.addEventListener('click', () => { trigger.focus({ preventScroll: true }); choose() })
  retry.addEventListener('click', () => { void filters.retry() })
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const buttons = [...menu.querySelectorAll<HTMLButtonElement>('.note-filter-option')], index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
  })
  const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.contains(event.target)) close() }
  const focusout = () => { requestAnimationFrame(() => { if (!disposed && !root.contains(document.activeElement)) close() }) }
  const scroll = (event: Event) => { if (!(event.target instanceof Node) || !menu.contains(event.target)) close() }
  root.addEventListener('focusout', focusout)
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('scroll', scroll, true)
  window.addEventListener('resize', closeOnResize)
  function closeOnResize() { close() }
  return {
    root,
    scopeChanging: close,
    render(labels: readonly NoteLabel[], catalogReady: boolean, scopeReady: boolean, displayed: number, total: number) {
      const view = filters.view, active = view.value.labelIds.length > 0 || view.value.noLabel
      trigger.disabled = !view.ready || !catalogReady || !scopeReady
      clear.disabled = !view.ready || !scopeReady; clear.hidden = !active
      retry.hidden = !view.error; retry.disabled = view.pending > 0
      count.textContent = `${displayed}/${total}`; count.setAttribute('aria-label', `${displayed} of ${total} notes displayed`)
      summary.textContent = active ? [...labels.filter(label => view.value.labelIds.includes(label.id)).map(label => label.name), ...(view.value.noLabel ? ['No label'] : [])].join(', ') || 'Selected labels' : 'All notes'
      trigger.title = summary.textContent
      empty.hidden = !scopeReady || total === 0 || displayed !== 0
      emptyClear.disabled = !view.ready
      if (trigger.disabled) close()
      const nextSignature = JSON.stringify(labels)
      if (nextSignature !== signature) {
        signature = nextSignature; menu.replaceChildren()
        for (const entry of [{ id: '', name: 'No label', color: '' }, ...labels]) {
          const row = document.createElement('button'); row.type = 'button'; row.className = 'note-filter-option'; row.dataset.labelId = entry.id
          const dot = document.createElement('span'); dot.className = `label-dot${entry.color ? ` label-color-${entry.color}` : ''}`; dot.setAttribute('aria-hidden', 'true')
          const text = document.createElement('span'); text.textContent = entry.name
          row.append(dot, text); menu.append(row)
          row.addEventListener('click', () => {
            const value = filters.view.value
            choose(entry.id ? { ...value, labelIds: value.labelIds.includes(entry.id) ? value.labelIds.filter(id => id !== entry.id) : [...value.labelIds, entry.id] }
              : { ...value, noLabel: !value.noLabel })
          })
        }
      }
      for (const row of menu.querySelectorAll<HTMLButtonElement>('.note-filter-option')) {
        row.setAttribute('aria-pressed', String(row.dataset.labelId ? view.value.labelIds.includes(row.dataset.labelId) : view.value.noLabel))
        row.disabled = trigger.disabled
      }
      if (!menu.hidden) position()
    },
    dispose() {
      disposed = true; close(); root.removeEventListener('focusout', focusout)
      document.removeEventListener('pointerdown', outside, true); document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', closeOnResize)
    }
  }
}
