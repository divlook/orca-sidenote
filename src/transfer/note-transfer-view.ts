import { bindDialog } from '../dialog'
import { ARCHIVE_BYTES, decodeArchive, encodeArchive, type NoteArchive, type RestoreChoice, type RestorePlan } from './note-archive'
import { noteKey } from '../protocol'
import type { NotesTransfer } from './notes-transfer'

export function bindNoteTransfer(dialog: HTMLDialogElement, open: HTMLButtonElement, transfer: NotesTransfer, reportError: (error: unknown) => void) {
  const element = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!
  const close = element<HTMLButtonElement>('transfer-close')
  const events = new AbortController(), signal = events.signal
  const acknowledge = element<HTMLInputElement>('transfer-alone')
  const start = element<HTMLButtonElement>('transfer-start')
  const capture = element<HTMLButtonElement>('transfer-capture')
  const save = element<HTMLButtonElement>('transfer-save')
  const file = element<HTMLInputElement>('transfer-file')
  const preview = element<HTMLButtonElement>('transfer-preview')
  const protect = element<HTMLButtonElement>('transfer-protect')
  const confirm = element<HTMLInputElement>('transfer-confirm')
  const commit = element<HTMLButtonElement>('transfer-commit')
  const stop = element<HTMLButtonElement>('transfer-stop')
  const summary = element<HTMLElement>('transfer-summary')
  const candidates = element<HTMLElement>('transfer-candidates')
  let busy = false
  let active = false
  let pending = Promise.resolve()
  let backup: Uint8Array | null = null
  let protection: Uint8Array | null = null
  let imported: NoteArchive | null = null
  let plan: RestorePlan | null = null
  let choices: (() => RestoreChoice | null)[] = []
  let revision = 0
  let choiceControls: (HTMLSelectElement | HTMLInputElement)[] = []
  function resetView() {
    candidates.replaceChildren(); file.value = ''
    acknowledge.checked = confirm.checked = false
    acknowledge.disabled = confirm.disabled = close.disabled = false
    for (const control of [capture, save, file, preview, protect, commit, stop, start]) control.disabled = true
  }
  resetView()
  const report = (reason: unknown) => { if (!signal.aborted) summary.textContent = reason instanceof Error ? reason.message : String(reason) }
  const invalidate = () => { ++revision; plan = null; protection = null; protect.disabled = commit.disabled = true; confirm.checked = false }
  const run = async (operation: () => Promise<void>) => {
    if (busy || signal.aborted) return
    busy = true
    let complete!: () => void
    pending = new Promise<void>(resolve => { complete = resolve })
    close.disabled = true
    for (const control of [capture, save, file, preview, protect, commit, confirm, acknowledge, start, ...choiceControls]) control.disabled = true
    try { await operation() } catch (reason) { if (signal.aborted) reportError(reason); else report(reason) }
    finally {
      busy = false
      if (!signal.aborted) {
        close.disabled = false
        capture.disabled = file.disabled = !active
        save.disabled = !backup
        preview.disabled = !imported || !active
        protect.disabled = !protection || !plan
        commit.disabled = !plan
        for (const control of [confirm, acknowledge, ...choiceControls]) control.disabled = false
        start.disabled = !acknowledge.checked || active
      }
      complete()
    }
  }
  const disposeDialog = bindDialog(dialog, open, close, { canClose: () => !busy, opened() {
    acknowledge.checked = false; start.disabled = true
    summary.textContent = 'Save or copy unsaved content from every other Note panel using this plugin store, then close those panels.'
  } })
  acknowledge.addEventListener('change', () => { start.disabled = !acknowledge.checked || active }, { signal })
  start.addEventListener('click', () => { void run(async () => {
    if (!acknowledge.checked) return
    await transfer.beginTransfer(); active = true
    if (signal.aborted) return
    start.disabled = true
    summary.textContent = 'Transfer ready. Editing is paused in this panel.'
  }) }, { signal })
  capture.addEventListener('click', () => { void run(async () => {
    backup = null
    const value = await transfer.captureBackup()
    if (signal.aborted) return
    backup = encodeArchive(value)
    summary.textContent = `Prepared ${value.notes.length} persisted notes and ${value.recoveryDrafts.length} separate recovery drafts. Click Save backup file.`
  }) }, { signal })
  function nativeSave(data: Uint8Array, suggestedName: string) {
    if (!orca.files) throw new Error('Native file saving is unavailable in this host. No download fallback is supported.')
    return orca.files.saveAs({ suggestedName, mimeType: 'application/json', data: data.buffer as ArrayBuffer })
  }
  save.addEventListener('click', () => {
    if (!backup || busy) return
    // Invoke immediately within this fresh, settled user gesture.
    try { const request = nativeSave(backup, 'sidenote-notes.json'); void run(async () => { report((await request).status === 'saved' ? 'Backup file saved.' : 'Save cancelled. No notes changed.') }) }
    catch (reason) { report(reason) }
  }, { signal })
  file.addEventListener('change', () => { void run(async () => {
    invalidate(); imported = null; candidates.replaceChildren(); choices = []; choiceControls = []
    const selected = file.files?.[0]
    if (!selected) return
    if (selected.size > ARCHIVE_BYTES) throw new Error('Backup exceeds the 16 MiB archive limit.')
    const data = new Uint8Array(await selected.arrayBuffer())
    if (signal.aborted) return
    imported = decodeArchive(data)
    const groups = new Map<string, { source: 'notes' | 'recoveryDrafts'; notes: readonly { id: string; text: string }[] }[]>()
    for (const source of ['notes', 'recoveryDrafts'] as const) for (const note of imported[source]) {
      const key = noteKey(note)
      const group = groups.get(key) ?? []; group.push({ source, notes: note.notes }); groups.set(key, group)
    }
    for (const [key, group] of groups) {
      const row = document.createElement('fieldset')
      const legend = document.createElement('legend'); legend.textContent = key; row.append(legend)
      const select = document.createElement('select'); select.setAttribute('aria-label', `Candidate for ${key}`)
      const skip = document.createElement('option'); skip.value = ''; skip.textContent = 'Do not import'; select.append(skip)
      for (const candidate of group) {
        const option = document.createElement('option'); option.value = candidate.source
        option.textContent = `${candidate.source === 'notes' ? 'Persisted collection' : 'Recovery draft'} · ${candidate.notes.length} notes · ${candidate.notes.map(note => note.text.replace(/\s+/gu, ' ').trim()).join(' / ').slice(0, 160)}`
        select.append(option)
      }
      if (group.length === 1) select.value = group[0].source
      const label = document.createElement('label'); const replace = document.createElement('input'); replace.type = 'checkbox'
      label.append(replace, ' Replace different destination text / affected unsaved draft')
      row.append(select, label); candidates.append(row)
      select.disabled = replace.disabled = busy
      choiceControls.push(select, replace)
      select.addEventListener('change', invalidate, { signal }); replace.addEventListener('change', invalidate, { signal })
      choices.push(() => select.value ? { key, source: select.value as RestoreChoice['source'], replace: replace.checked } : null)
    }
    summary.textContent = 'Choose one candidate per identity. Different persisted and recovery candidates require an explicit choice. Existing conflicts are preserved unless replacement is selected.'
  }) }, { signal })
  preview.addEventListener('click', () => { void run(async () => {
    invalidate()
    if (!imported) return
    const currentRevision = revision
    const prepared = await transfer.previewRestore(imported, choices.flatMap(choice => { const value = choice(); return value ? [value] : [] }))
    if (signal.aborted || currentRevision !== revision) return
    plan = prepared
    protection = encodeArchive(plan.protection)
    const count = (action: string) => prepared.items.filter(item => item.action === action).length
    summary.textContent = `${count('create')} create; ${count('identical')} identical skip; ${count('conflict')} preserved conflicts; ${count('replace')} replace. Choices apply to whole host/path collections and preserve card order. Replacement resets undo history only for changed notes. Save protection before replacing.`
  }) }, { signal })
  protect.addEventListener('click', () => {
    if (!plan || !protection || busy) return
    const savedPlan = plan
    try { const request = nativeSave(protection, 'sidenote-before-restore.json'); void run(async () => {
      const result = await request
      if (signal.aborted) return
      transfer.protectRestore(savedPlan, result.status)
      report(result.status === 'saved' ? 'Protection file saved for this preview. Confirm replacements to proceed.' : 'Protection save cancelled. Replacements remain blocked.')
    }) } catch (reason) { report(reason) }
  }, { signal })
  commit.addEventListener('click', () => { void run(async () => {
    if (!plan) return
    stop.disabled = false
    try {
      const result = await transfer.commitRestore(plan, confirm.checked)
      if (signal.aborted) { if (result.error) reportError(new Error(result.error)); return }
      summary.textContent = JSON.stringify({ applied: result.applied.length, appliedKeys: result.applied,
        outcomeUnknown: result.outcomeUnknown, unattempted: result.unattempted.length, unattemptedKeys: result.unattempted, error: result.error }, null, 2)
        + '\nNo rollback. Re-preview before retrying; identical notes will be skipped.'
      invalidate(); backup = null
    } finally { if (!signal.aborted) stop.disabled = true }
  }) }, { signal })
  stop.addEventListener('click', () => { transfer.stopRestore(); stop.disabled = true }, { signal })
  dialog.addEventListener('close', () => {
    if (active) void transfer.finishTransfer().catch(reportError)
    active = false; backup = imported = null; invalidate(); candidates.replaceChildren(); choices = []; choiceControls = []
    file.value = ''
    capture.disabled = file.disabled = save.disabled = preview.disabled = true
  }, { signal })
  return { async dispose() {
    events.abort(); disposeDialog()
    resetView()
    if (dialog.open) dialog.close()
    await pending
    if (active) { active = false; await transfer.finishTransfer().catch(reportError) }
  } }
}
