import { bindDialog } from '../dialog'
import type { NoteSession } from './session'

export function bindNoteDeletion(dialog: HTMLDialogElement, open: HTMLButtonElement, session: NoteSession, report: (error: unknown) => void) {
  const get = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!
  const cancel = get<HTMLButtonElement>('delete-notes-cancel'), confirm = get<HTMLButtonElement>('delete-notes-confirm')
  const description = get<HTMLElement>('delete-notes-description'), error = get<HTMLElement>('delete-notes-error')
  const events = new AbortController(), signal = events.signal
  let busy = false, ownsOperation = false, pending = Promise.resolve()
  const showError = (reason: unknown) => {
    if (signal.aborted) { report(reason); return }
    error.textContent = reason instanceof Error ? reason.message : String(reason); error.hidden = false
  }
  async function finishOperation() {
    if (!ownsOperation) return
    ownsOperation = false
    await session.finishDeletion()
  }
  function run(action: () => Promise<void>) {
    busy = true
    let complete!: () => void
    pending = new Promise<void>(resolve => { complete = resolve })
    void action().catch(showError).finally(() => {
      busy = false
      if (!signal.aborted) cancel.disabled = false
      complete()
    })
  }
  const disposeDialog = bindDialog(dialog, open, cancel, { canClose: () => !busy, opened() {
    ownsOperation = true
    run(async () => {
      cancel.disabled = confirm.disabled = true; error.hidden = true
      description.textContent = 'Waiting for pending saves and counting notes…'; confirm.textContent = 'Delete all notes'
      try {
        const count = await session.prepareDeletion()
        if (signal.aborted) return
        description.textContent = `${count} notes or empty saved locations across all projects and worktrees will be permanently deleted from the local SideNote store.`
        confirm.disabled = count === 0
      } finally { if (!signal.aborted) { cancel.disabled = false; cancel.focus() } }
    })
  } })
  confirm.addEventListener('click', () => {
    if (busy || confirm.disabled) return
    run(async () => {
      cancel.disabled = confirm.disabled = true; error.hidden = true; description.textContent = 'Deleting notes…'
      try {
        await session.deletePrepared()
        if (!signal.aborted) dialog.close()
      } catch (reason) {
        showError(reason)
        if (signal.aborted) return
        description.textContent = 'Some notes could not be deleted. Deleted notes cannot be restored. Retry the remaining notes or close this dialog.'
        confirm.textContent = 'Retry remaining notes'; confirm.disabled = false
      }
    })
  }, { signal })
  dialog.addEventListener('close', () => { void finishOperation().catch(report) }, { signal })
  return { async dispose() {
    events.abort(); disposeDialog()
    if (dialog.open) dialog.close()
    await pending
    await finishOperation().catch(report)
  } }
}
