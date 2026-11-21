import type {} from 'orca/frame'
import { NoteSession } from './notes/session'
import { createNoteCards } from './notes/note-cards'
import { NotePreferences } from './settings/note-preferences'
import { createNoteSettings } from './settings/note-settings-view'
import { createLabelSettings } from './settings/label-settings-view'
import { createSettingsDropdown } from './settings/settings-dropdown'
import { bindDialog } from './dialog'
import { bindNoteDeletion } from './notes/note-deletion-view'
import { bindNoteTransfer } from './transfer/note-transfer-view'
import { NotesTransfer } from './transfer/notes-transfer'
import { renderShortcutHelp } from './editor/shortcut-help'
import { bindNoteLinks } from './markdown/note-link-view'
import { NoteFilters } from './notes/note-filter'
import { bindNoteFilter } from './notes/note-filter-view'

const element = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!
const panel = element<HTMLElement>('note-panel')
const problem = element<HTMLElement>('problem'), retry = element<HTMLButtonElement>('retry')
const locationLabel = element<HTMLElement>('location'), settingsRoot = element<HTMLDialogElement>('note-settings')
const locationHelp = element<HTMLElement>('location-help')
const filterRoot = element<HTMLElement>('note-filter')
const addButtons = [element<HTMLButtonElement>('add-note-top'), element<HTMLButtonElement>('add-note-bottom')]
const deleteAll = element<HTMLButtonElement>('delete-notes-open')
const dataUnavailable = element('data-unavailable')
const events = new AbortController(), signal = events.signal
let disposed = false, externalError = '', filterScope = ''
let catalogLoadStarted = false
const session = new NoteSession(orca.storage, sessionChanged)
const filters = new NoteFilters(orca.storage, filterChanged)
const preferences = new NotePreferences(orca.storage, preferencesChanged)
const dropdown = createSettingsDropdown(settingsRoot, element('settings-body'))
const settings = createNoteSettings(settingsRoot, element('settings-open'), preferences, dropdown)
const links = bindNoteLinks(element('open-note-link'), {
  current: (scope, epoch) => !disposed && session.view.ready && session.view.scopeKey === scope && session.view.epoch === epoch,
  preference: () => preferences.view,
  external: href => {
    if (!orca.shell) return Promise.reject(new Error('The default application bridge is unavailable.'))
    return orca.shell.openExternal(href)
  },
  internal: (scope, href) => orca.plugin.request('notes.openLink', { scope, href }),
  report
})
const cards = createNoteCards({
  list: element('note-list'), panel, session, preferences: () => preferences.view, changed: render, report,
  filter: () => filters.view.value, filterRoot,
  deleteDialog: element('delete-note'),
  minimizeAll: element('minimize-all-notes'), expandAll: element('expand-all-notes'),
  openLink: (href, scope, epoch) => links.open(href, scope, epoch),
  focusAdd: () => addButtons[0].focus({ preventScroll: true })
})
const filterView = bindNoteFilter(filterRoot, element('filtered-empty'), filters, () => cards.filterChoosing())
const labelSettings = createLabelSettings(settingsRoot, element('label-confirm'), session, dropdown, report)
const deletion = bindNoteDeletion(element('delete-notes'), deleteAll, session, report)
const transfer = bindNoteTransfer(element('note-transfer'), element('transfer-open'), new NotesTransfer(session), report)
renderShortcutHelp(element('shortcuts-list'))
const disposeHelp = bindDialog(element('shortcuts-help'), element('shortcuts-open'),
  [element('shortcuts-close'), element('shortcuts-close-footer')])

function report(error: unknown) {
  externalError = error instanceof Error ? error.message : String(error)
  render()
}
function sessionChanged() {
  if (disposed) return
  if (session.localStoreAvailable && !catalogLoadStarted) {
    catalogLoadStarted = true
    void session.loadLabels().catch(() => {})
  }
  const scope = session.view.scopeKey
  if (scope !== filterScope) { filterScope = scope; void filters.follow(scope) }
  filterChanged()
}
function filterChanged() {
  if (disposed) return
  if (session.labels.ready) filters.reconcile(new Set(session.labels.labels.map(label => label.id)))
  render()
}
function preferencesChanged() {
  if (disposed) return
  settings.render()
  render()
}
function render(): void {
  if (disposed) return
  const view = session.view, preference = preferences.view, catalog = session.labels
  cards.render(view, preference)
  filterView.render(catalog.labels, catalog.ready, view.ready, cards.displayed, view.notes.length)
  labelSettings.render()
  const localStoreAvailable = session.localStoreAvailable
  const target = view.target, basename = target?.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || target?.path
  locationLabel.textContent = view.loading || view.checking && !target ? 'Switching…'
    : view.problem ? localStoreAvailable ? 'Notes unavailable' : 'Location unavailable'
    : view.unavailable === 'remote' ? 'Remote worktree not supported'
    : target ? `${target.project ?? basename} · ${target.worktree ?? basename}${target.hostId && target.hostId !== 'local' ? ` · ${target.hostId}` : ''}` : 'No active worktree'
  locationLabel.title = !view.loading && target ? `${target.hostId ?? 'local'}: ${target.path}` : ''
  locationHelp.hidden = view.unavailable !== 'remote'
  const storeStatus = localStoreAvailable ? '' : view.checking ? 'Checking the note store…'
    : view.unavailable === 'remote' ? 'SideNote cannot access a note store for this remote worktree.'
    : 'The note store could not be confirmed.'
  transfer.render(storeStatus)
  deleteAll.disabled = !localStoreAvailable
  dataUnavailable.hidden = localStoreAvailable
  if (dataUnavailable.textContent !== storeStatus) dataUnavailable.textContent = storeStatus
  problem.textContent = [preference.problem, view.problem, view.error, localStoreAvailable ? catalog.error : '', filters.view.error, cards.problem, externalError].filter(Boolean).join(' ')
  problem.hidden = !problem.textContent
  const writable = view.ready && preference.ready
  retry.hidden = !view.error; retry.disabled = !writable || view.pending > 0
  for (const add of addButtons) add.disabled = !writable
  panel.setAttribute('aria-busy', String(view.loading || view.checking || !preference.ready))
}
for (const add of addButtons) add.addEventListener('click', () => { void cards.addNote().catch(report) }, { signal })
retry.addEventListener('click', () => { void session.retry().catch(report) }, { signal })
function followFocus() {
  externalError = ''
  links.scopeChanging()
  cards.scopeChanging()
  filterView.scopeChanging()
  return session.follow(() => orca.plugin.request('notes.focused'))
}
const subscription = orca.on('workspace.changed', followFocus)
const themeSubscription = orca.on('theme', () => cards.theme())
window.addEventListener('pagehide', () => {
  disposed = true; events.abort(); subscription.dispose(); themeSubscription.dispose()
  links.dispose(); filterView.dispose(); cards.dispose(); settings.dispose()
  void labelSettings.dispose(); void deletion.dispose(); void transfer.dispose()
  dropdown.dispose(); disposeHelp()
}, { once: true })
render()
settings.render()
void preferences.initialize()
void followFocus()
void orca.plugin.request('notes.devStatus').then(value => {
  if (!disposed && value === true) element('dev-badge').hidden = false
}).catch(() => {})
