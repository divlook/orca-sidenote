import type {} from 'orca/frame'
import { NoteSession } from './notes/session'
import { createNoteCards } from './notes/note-cards'
import { createNoteSettings } from './settings/note-settings-view'
import { bindDialog } from './dialog'
import { bindNoteDeletion } from './notes/note-deletion-view'
import { bindNoteTransfer } from './transfer/note-transfer-view'
import { NotesTransfer } from './transfer/notes-transfer'
import { renderShortcutHelp } from './editor/shortcut-help'
import { bindNoteLinks } from './markdown/note-link-view'

const element = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!
const panel = element<HTMLElement>('note-panel')
const problem = element<HTMLElement>('problem'), retry = element<HTMLButtonElement>('retry')
const locationLabel = element<HTMLElement>('location')
const addButtons = [element<HTMLButtonElement>('add-note-top'), element<HTMLButtonElement>('add-note-bottom')]
let disposed = false, externalError = ''
const session = new NoteSession(orca.storage, render)
const settings = createNoteSettings(orca.storage, render)
const links = bindNoteLinks({
  current: (scope, epoch) => !disposed && session.view.ready && session.view.scopeKey === scope && session.view.epoch === epoch,
  preference: () => settings.view,
  external: href => {
    if (!orca.shell) return Promise.reject(new Error('The default application bridge is unavailable.'))
    return orca.shell.openExternal(href)
  },
  internal: (scope, href) => orca.plugin.request('notes.openLink', { scope, href }),
  report
})
const cards = createNoteCards({
  list: element('note-list'), panel, session, preferences: () => settings.view, changed: render, report,
  deleteDialog: element<HTMLDialogElement>('delete-note'),
  openLink: (href, scope, epoch) => links.open(href, scope, epoch),
  focusAdd: () => addButtons[0].focus({ preventScroll: true })
})
bindNoteDeletion(session)
bindNoteTransfer(new NotesTransfer(session))
renderShortcutHelp(element('shortcuts-list'))
bindDialog(element<HTMLDialogElement>('shortcuts-help'), element('shortcuts-open'), element('shortcuts-close'))
void orca.plugin.request('notes.devStatus').then(value => {
  if (value === true) element('dev-badge').hidden = false
}).catch(() => {})

function report(error: unknown) {
  externalError = error instanceof Error ? error.message : String(error)
  render()
}
function render(): void {
  if (disposed) return
  const view = session.view, preferences = settings.view
  cards.render(view, preferences)
  const target = view.target, basename = target?.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || target?.path
  locationLabel.textContent = view.loading ? 'Switching…' : view.problem ? 'Location unavailable'
    : target ? `${target.project ?? basename} · ${target.worktree ?? basename}${target.hostId && target.hostId !== 'local' ? ` · ${target.hostId}` : ''}` : 'No active worktree'
  locationLabel.title = !view.loading && target ? `${target.hostId ?? 'local'}: ${target.path}` : ''
  problem.textContent = [preferences.problem, view.problem, view.error, cards.problem, externalError].filter(Boolean).join(' ')
  problem.hidden = !problem.textContent
  const writable = view.ready && preferences.ready
  retry.hidden = !view.error; retry.disabled = !writable || view.pending > 0
  for (const add of addButtons) add.disabled = !writable
  panel.setAttribute('aria-busy', String(view.loading || !preferences.ready))
}
for (const add of addButtons) add.addEventListener('click', () => { void cards.addNote().catch(report) })
retry.addEventListener('click', () => { void session.retry().catch(report) })
function followFocus() {
  externalError = ''
  links.scopeChanging()
  cards.scopeChanging()
  return session.follow(() => orca.plugin.request('notes.focused'))
}
const subscription = orca.on('workspace.changed', followFocus)
const themeSubscription = orca.on('theme', () => cards.theme())
window.addEventListener('pagehide', () => {
  disposed = true; subscription.dispose(); themeSubscription.dispose(); links.dispose(); cards.dispose()
}, { once: true })
void followFocus()
