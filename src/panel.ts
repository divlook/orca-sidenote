import type {} from 'orca/frame'
import { NoteSession } from './session'
import { createSourceEditor, renderShortcutHelp, type SourceEditor } from './source-editor'
import { createNoteSettings } from './note-settings-view'
import { bindDialog } from './dialog'
import { createPreview } from './preview'
import { bindNoteDeletion } from './note-deletion-view'

const editor = document.querySelector<HTMLElement>('#editor')!
const preview = document.querySelector<HTMLElement>('#preview')!
const problem = document.querySelector<HTMLElement>('#problem')!
const status = document.querySelector<HTMLElement>('#status')!
const retry = document.querySelector<HTMLButtonElement>('#retry')!
const editTab = document.querySelector<HTMLButtonElement>('#edit-tab')!
const previewTab = document.querySelector<HTMLButtonElement>('#preview-tab')!
const notePanel = document.querySelector<HTMLElement>('#note-panel')!
const locationLabel = document.querySelector<HTMLElement>('#location')!
const shortcutsOpen = document.querySelector<HTMLButtonElement>('#shortcuts-open')!
const shortcutsHelp = document.querySelector<HTMLDialogElement>('#shortcuts-help')!
const shortcutsClose = document.querySelector<HTMLButtonElement>('#shortcuts-close')!
renderShortcutHelp(document.querySelector<HTMLElement>('#shortcuts-list')!)
bindDialog(shortcutsHelp, shortcutsOpen, shortcutsClose)

let previewing = false
let source: SourceEditor | undefined
let editorError = ''
let externalError = ''
let limitMessage = ''
const session = new NoteSession(orca.storage, render)
const settings = createNoteSettings(orca.storage, () => {
  limitMessage = ''
  session.setLimit(settings.view.limit)
})
bindNoteDeletion(session)
const markdown = createPreview(preview, async href => { await orca.shell?.openExternal(href) }, error => {
  externalError = error instanceof Error ? error.message : String(error)
  render()
}, (key, text, marker, epoch) => {
  const view = session.view
  return previewing && view.ready && settings.view.ready && !editorError && view.key === key
    && view.text === text && view.epoch === epoch && !!source?.toggleTask(key, text, marker, epoch)
})

function render(): void {
  const view = session.view
  const { limit, ready: settingsReady, problem: settingsProblem } = settings.view
  const ready = view.ready && settingsReady && !editorError
  source?.sync(view.key, view.text, ready, limit, view.epoch)
  source?.setLineNumbers(settings.view.lineNumbers)
  notePanel.setAttribute('aria-busy', String(view.loading || !settingsReady))
  const target = view.target
  const basename = target?.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || target?.path
  locationLabel.textContent = view.loading ? 'Switching…' : view.problem ? 'Location unavailable'
    : target ? `${target.project ?? basename} · ${target.worktree ?? basename}${target.hostId && target.hostId !== 'local' ? ` · ${target.hostId}` : ''}` : 'No active worktree'
  locationLabel.title = !view.loading && target ? `${target.hostId ?? 'local'}: ${target.path}` : ''
  problem.textContent = editorError || settingsProblem || view.problem || view.error || externalError || limitMessage
  problem.hidden = !problem.textContent
  retry.hidden = !view.error
  retry.disabled = view.pending > 0 || !ready
  const count = limit === null ? `${view.text.length} characters` : `${view.text.length}/${limit} characters`
  status.textContent = view.loading ? 'Switching…' : editorError ? 'Editor unavailable' : !settingsReady ? (settingsProblem ? 'Settings unavailable' : 'Loading settings…')
    : !source ? 'Loading editor…' : !view.ready ? (view.problem ? '' : 'Select a worktree')
    : `${view.pending ? 'Saving…' : view.dirty ? 'Not saved' : 'Saved'} · ${count}`
  if (previewing) markdown.render(view.loading || !view.ready ? '' : view.text, view.key, ready && !!source, view.epoch)
}

function showPreview(value: boolean): void {
  previewing = value
  editor.hidden = value
  preview.hidden = !value
  editTab.setAttribute('aria-selected', String(!value))
  previewTab.setAttribute('aria-selected', String(value))
  editTab.tabIndex = value ? -1 : 0
  previewTab.tabIndex = value ? 0 : -1
  notePanel.setAttribute('aria-labelledby', value ? 'preview-tab' : 'edit-tab')
  if (value) render()
  else { markdown.suspend(); source?.show(true) }
}

function followFocus(): Promise<void> {
  externalError = ''
  return session.follow(() => orca.plugin.request('notes.focused'))
}
function editorFailed(error: unknown): void {
  editorError = error instanceof Error ? error.message : String(error)
  render()
}

retry.addEventListener('click', () => { void session.save(session.view.text, session.view.key) })
editTab.addEventListener('click', () => showPreview(false))
previewTab.addEventListener('click', () => showPreview(true))
for (const tab of [editTab, previewTab]) {
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? false : event.key === 'End' ? true : !previewing
    showPreview(next)
    ;(next ? previewTab : editTab).focus()
  })
}
const subscription = orca.on('workspace.changed', followFocus)
const themeSubscription = orca.on('theme', () => { source?.theme(); if (previewing) render() })
window.addEventListener('pagehide', () => {
  subscription.dispose()
  themeSubscription.dispose()
  source?.dispose()
  markdown.dispose()
}, { once: true })
void createSourceEditor(editor, (key, text) => {
  limitMessage = ''
  void session.save(text, key)
}, editorFailed, () => {
  limitMessage = `Notes are limited to ${settings.view.limit} characters. The edit was not applied.`
  render()
}).then(value => {
  source = value
  render()
}).catch(editorFailed)
void followFocus()
