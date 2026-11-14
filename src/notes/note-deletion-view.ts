import { bindDialog } from '../dialog'
import type { NoteSession } from './session'

export function bindNoteDeletion(session: NoteSession): void {
  const dialog = document.querySelector<HTMLDialogElement>('#delete-notes')!
  const open = document.querySelector<HTMLButtonElement>('#delete-notes-open')!
  const cancel = document.querySelector<HTMLButtonElement>('#delete-notes-cancel')!
  const confirm = document.querySelector<HTMLButtonElement>('#delete-notes-confirm')!
  const description = document.querySelector<HTMLElement>('#delete-notes-description')!
  const error = document.querySelector<HTMLElement>('#delete-notes-error')!
  let busy = false
  bindDialog(dialog, open, cancel, () => !busy)
  const showError = (reason: unknown) => {
    error.textContent = reason instanceof Error ? reason.message : String(reason)
    error.hidden = false
  }
  open.addEventListener('click', () => {
    busy = true
    cancel.disabled = confirm.disabled = true
    error.hidden = true
    description.textContent = 'Waiting for pending saves and counting notes…'
    confirm.textContent = 'Delete all notes'
    void session.prepareDeletion().then(count => {
      description.textContent = `${count} notes or empty saved locations across all projects and worktrees will be permanently deleted from this plugin store.`
      confirm.disabled = count === 0
    }).catch(showError).finally(() => { busy = false; cancel.disabled = false; cancel.focus() })
  })
  confirm.addEventListener('click', () => {
    if (busy || confirm.disabled) return
    busy = true
    cancel.disabled = confirm.disabled = true
    error.hidden = true
    description.textContent = 'Deleting notes…'
    void session.deletePrepared().then(() => {
      dialog.close()
    }).catch(reason => {
      showError(reason)
      description.textContent = 'Some notes could not be deleted. Deleted notes cannot be restored. Retry the remaining notes or close this dialog.'
      confirm.textContent = 'Retry remaining notes'
      confirm.disabled = false
    }).finally(() => { busy = false; cancel.disabled = false })
  })
  dialog.addEventListener('close', () => { void session.finishDeletion() })
}
