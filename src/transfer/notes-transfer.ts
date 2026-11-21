import { NOTE_KEY_PREFIX, noteKey, parseNoteKey } from '../protocol'
import { ARCHIVE_BYTES, ARCHIVE_RECORDS, archive, encodeArchive, planRestore, validateArchive, type NoteArchive, type RestoreChoice, type RestorePlan } from './note-archive'
import type { NoteSession, NoteOperation, OperationFocus } from '../notes/session'
import { collection, sameCollection, type NoteCollection } from '../notes/note-collection'
import { LABEL_KEY, mergeLabels } from '../notes/note-labels'

const HOST_KEY_CHARACTERS = 256
const HOST_KEYS = 1024
const HOST_STORE_BYTES = 5242880
const HOST_VALUE_BYTES = 262144

export type CopyChoice = Readonly<{ key: string; source: RestoreChoice['source']; noteIds: readonly string[] }>
export type CopyPlan = Readonly<{ source: Pick<CopyChoice, 'key' | 'source'>; target: string; notes: NoteCollection['notes'];
  destinationCount: number; addedLabels: number }>
type CopyPreview = { plan: CopyPlan; focus: OperationFocus; before: NoteCollection | null;
  next: NoteCollection; labels: RestorePlan['labels']; beforeLabels: RestorePlan['beforeLabels'] }

function* restoreWrites(plan: RestorePlan) {
  for (const item of plan.items) if (item.action === 'create' || item.action === 'replace') {
    yield [item.key, collection(item.note.notes)] as const
  }
}

export class NotesTransfer {
  private operation: NoteOperation | null = null
  private transferring = false
  private transferBusy = false
  private restore: RestorePlan | null = null
  private protectedPlan: RestorePlan | null = null
  private copy: CopyPreview | null = null
  private unknownCopies = new Set<string>()
  private stopped = false

  constructor(private session: NoteSession) {}

  private lease(): NoteOperation {
    if (!this.operation) throw new Error('Open an idle notes transfer first.')
    return this.operation
  }

  async beginTransfer(): Promise<void> {
    if (this.transferring) throw new Error('Another note operation is already open.')
    this.transferring = true
    this.transferBusy = true
    try { this.operation = await this.session.acquireNoteOperation() }
    catch (error) { this.transferring = false; throw error }
    finally { this.transferBusy = false }
  }

  private async stored(key: string): Promise<NoteCollection | null> {
    if (key.length > HOST_KEY_CHARACTERS) throw new Error(`Note identity exceeds the host 256-character storage-key limit: ${key}`)
    return this.lease().read(key)
  }
  private async preflightStorage(plan: Pick<RestorePlan, 'labels' | 'beforeLabels'>,
    writes: Iterable<readonly [string, NoteCollection]>, action: 'Restore' | 'Copy'): Promise<void> {
    const keys = await this.lease().keys()
    if (keys.length > HOST_KEYS) throw new Error('The plugin store exceeds the host key limit.')
    const contents: Record<string, unknown> = Object.create(null)
    for (const key of keys) {
      const value = await this.lease().get(key)
      contents[key] = value
    }
    const encoder = new TextEncoder()
    let bytes = encoder.encode(JSON.stringify(contents, null, 2)).byteLength
    let count = keys.length
    if (bytes > HOST_STORE_BYTES) throw new Error('The plugin store exceeds the host 5 MiB limit.')
    if (JSON.stringify(plan.labels) !== JSON.stringify(plan.beforeLabels)) {
      const catalog = { version: 1, labels: plan.labels }
      if (encoder.encode(JSON.stringify(catalog)).byteLength > HOST_VALUE_BYTES) throw new Error(`The ${action === 'Restore' ? 'restored' : 'copied'} label catalog exceeds the host stored-value limit.`)
      const singleton = encoder.encode(JSON.stringify({ [LABEL_KEY]: catalog }, null, 2)).byteLength
      if (Object.hasOwn(contents, LABEL_KEY)) bytes += singleton - encoder.encode(JSON.stringify({ [LABEL_KEY]: contents[LABEL_KEY] }, null, 2)).byteLength
      else { bytes += singleton - 2; ++count }
      if (count > HOST_KEYS || bytes > HOST_STORE_BYTES) throw new Error(`${action} exceeds the host plugin-store limit. Nothing was written.`)
    }
    for (const [key, value] of writes) {
      if (encoder.encode(JSON.stringify(value)).byteLength > HOST_VALUE_BYTES) {
        throw new Error(`Note collection exceeds the host 262,144-byte stored-value limit: ${key}`)
      }
      const singleton = encoder.encode(JSON.stringify({ [key]: value }, null, 2)).byteLength
      if (Object.hasOwn(contents, key)) {
        bytes += singleton - encoder.encode(JSON.stringify({ [key]: contents[key] }, null, 2)).byteLength
      } else {
        bytes += singleton - 2
        ++count
      }
      contents[key] = value
      if (count > HOST_KEYS || bytes > HOST_STORE_BYTES) {
        throw new Error(`${action} exceeds the host 1,024-key or 5 MiB plugin-store limit. Nothing was written.`)
      }
    }
  }

  async captureBackup(): Promise<NoteArchive> {
    if (!this.transferring || this.transferBusy) throw new Error('Open an idle notes transfer first.')
    this.transferBusy = true
    try {
      const keys = (await this.lease().keys()).filter(key => key.startsWith(NOTE_KEY_PREFIX))
      if (keys.length > ARCHIVE_RECORDS) throw new Error('Backup exceeds the 10,000 candidate limit.')
      const notes = []
      let size = 0
      for (const key of keys) {
        const target = parseNoteKey(key)
        const value = await this.stored(key)
        if (value === null) throw new Error(`Stored note disappeared during capture: ${key}`)
        size += JSON.stringify(value).length + key.length
        if (size > ARCHIVE_BYTES) throw new Error('Backup exceeds the archive resource limit. Nothing was truncated.')
        notes.push({ ...target, notes: value.notes })
      }
      const value = archive(notes, this.lease().recoveryCollections(), await this.lease().labels())
      encodeArchive(value)
      return value
    } finally { this.transferBusy = false }
  }

  async previewRestore(value: NoteArchive, choices: readonly RestoreChoice[]): Promise<RestorePlan> {
    if (!this.transferring || this.transferBusy) throw new Error('Open an idle notes transfer first.')
    this.restore = this.protectedPlan = null
    this.copy = null
    this.transferBusy = true
    try {
      const snapshot = validateArchive(value)
      encodeArchive(snapshot)
      await this.lease().reconcile()
      const states = new Map<string, NoteCollection | null>()
      for (const choice of choices) {
        const stored = await this.stored(choice.key)
        states.set(choice.key, stored)
      }
      this.lease().refreshCleanDrafts(states)
      const plan = planRestore(snapshot, choices, states, this.lease().recoveryCollections(), await this.lease().labels())
      await this.preflightStorage(plan, restoreWrites(plan), 'Restore')
      this.restore = plan
      return plan
    } finally { this.transferBusy = false }
  }

  protectRestore(plan: RestorePlan, status: 'saved' | 'cancelled'): void {
    if (plan !== this.restore || this.transferBusy) throw new Error('The restore preview has changed.')
    this.protectedPlan = status === 'saved' ? plan : null
  }

  stopRestore(): void { this.stopped = true }

  async commitRestore(plan: RestorePlan, confirmReplacement: boolean) {
    if (!this.transferring || this.transferBusy || plan !== this.restore) throw new Error('Prepare a fresh restore preview.')
    const selected = plan.items.filter(item => item.action === 'create' || item.action === 'replace')
    if (selected.some(item => item.action === 'replace') && (!confirmReplacement || this.protectedPlan !== plan)) {
      throw new Error('Save the prepared protection file and confirm replacements first.')
    }
    this.transferBusy = true
    this.stopped = false
    const applied: string[] = []
    let failed: string | null = null
    let error = ''
    try {
      await this.preflightStorage(plan, restoreWrites(plan), 'Restore')
      if (JSON.stringify(await this.lease().labels()) !== JSON.stringify(plan.beforeLabels)) {
        this.restore = this.protectedPlan = null
        throw new Error('Destination labels changed. Prepare a new preview and protection file.')
      }
      for (const item of plan.items) {
        const current = await this.stored(item.key)
        if (current === null ? item.before !== null : item.before === null || !sameCollection(current, item.before)) {
          this.restore = this.protectedPlan = null
          throw new Error('Destination notes changed. Prepare a new preview and protection file.')
        }
      }
      if (JSON.stringify(plan.labels) !== JSON.stringify(plan.beforeLabels)) {
        try { await this.lease().writeLabels(plan.labels) }
        catch (reason) {
          this.restore = this.protectedPlan = null
          throw new Error(`Label catalog write failed; its outcome may be unknown. Preview again before retrying. ${reason instanceof Error ? reason.message : String(reason)}`)
        }
      }
      for (const item of selected) {
        if (this.stopped) break
        try {
          await this.lease().write(item.key, collection(item.note.notes))
          applied.push(item.key)
        } catch (reason) {
          failed = item.key
          error = reason instanceof Error ? reason.message : String(reason)
          break
        }
      }
      this.restore = this.protectedPlan = null
      return { applied, outcomeUnknown: failed, error,
        unattempted: selected.filter(item => !applied.includes(item.key) && item.key !== failed).map(item => item.key) }
    } finally { this.transferBusy = false }
  }

  async previewCopy(value: NoteArchive, choice: CopyChoice): Promise<CopyPlan> {
    if (!this.transferring || this.transferBusy) throw new Error('Open an idle notes transfer first.')
    this.restore = this.protectedPlan = this.copy = null
    this.transferBusy = true
    try {
      const snapshot = validateArchive(value)
      encodeArchive(snapshot)
      const candidate = snapshot[choice.source]?.find(note => noteKey(note) === choice.key)
      if (!candidate) throw new Error('Choose a source collection from the backup.')
      const ids = new Set(choice.noteIds)
      const selected = candidate.notes.filter(note => ids.has(note.id))
      if (!selected.length || selected.length !== ids.size || ids.size !== choice.noteIds.length) {
        throw new Error('Select one or more notes from the chosen source collection.')
      }
      const operation = this.lease()
      const focus = await operation.focused()
      if (this.unknownCopies.has(focus.key)) {
        throw new Error('A previous copy could not be verified. Close the transfer and inspect the destination before retrying. To prevent duplicates, this panel will not copy there again until reloaded.')
      }
      await operation.reconcile()
      const before = await this.stored(focus.key)
      operation.refreshCleanDrafts(new Map([[focus.key, before]]))
      this.checkCopyDraft(focus.key)
      const beforeLabels = await operation.labels()
      const { labels, remap } = mergeLabels(beforeLabels, snapshot.labels, new Set(selected.flatMap(note => note.labelId ? [note.labelId] : [])))
      const taken = new Set(candidate.notes.map(note => note.id))
      for (const note of before?.notes ?? []) taken.add(note.id)
      const copied = selected.map(note => {
        let id: string
        do { id = crypto.randomUUID() } while (taken.has(id))
        taken.add(id)
        return { id, text: note.text, labelId: note.labelId === undefined ? undefined : remap.get(note.labelId) }
      })
      const next = collection([...(before?.notes ?? []), ...copied])
      const destinationCount = before?.notes.length ?? 0
      const plan: CopyPlan = Object.freeze({ source: Object.freeze({ key: choice.key, source: choice.source }),
        target: focus.key, notes: Object.freeze(next.notes.slice(destinationCount)), destinationCount, addedLabels: labels.length - beforeLabels.length })
      const preview = { plan, focus, before, next, labels, beforeLabels }
      await this.preflightStorage(preview, [[focus.key, next]], 'Copy')
      operation.assertFocus(focus)
      this.copy = preview
      return plan
    } finally { this.transferBusy = false }
  }

  private checkCopyDraft(key: string) {
    if (this.lease().recoveryCollections().some(draft => noteKey(draft) === key)) {
      throw new Error('The destination has an unsaved draft in this panel. Close the transfer, save the draft, then preview the copy again.')
    }
  }

  async commitCopy(plan: CopyPlan, confirmed: boolean): Promise<void> {
    const preview = this.copy
    if (!this.transferring || this.transferBusy || !preview || plan !== preview.plan) throw new Error('Prepare a fresh copy preview.')
    if (!confirmed) throw new Error('Confirm the destination before copying notes.')
    this.transferBusy = true
    this.copy = null
    let labelsAttempted = false
    try {
      const operation = this.lease(), { focus, before, next, beforeLabels, labels } = preview
      operation.assertFocus(focus)
      if ((await operation.focused()).key !== focus.key) throw new Error('The current workspace changed. Preview the copy again.')
      operation.assertFocus(focus)
      this.checkCopyDraft(focus.key)
      await this.preflightStorage(preview, [[focus.key, next]], 'Copy')
      if (plan.addedLabels) {
        const current = await this.stored(focus.key)
        if (current === null ? before !== null : before === null || !sameCollection(current, before)) {
          throw new Error('Destination notes changed. Preview the copy again.')
        }
        labelsAttempted = true
        await operation.writeLabels(labels, { focus, before: beforeLabels })
      }
      const failure = await operation.writeFocused(focus, before, next, labels)
      if (failure) {
        let saved: NoteCollection | null = null
        try { saved = await this.stored(focus.key) } catch { /* The write outcome remains unknown. */ }
        if (!saved || !sameCollection(saved, next)) {
          this.unknownCopies.add(focus.key)
          throw new Error('Could not verify whether the notes were copied. Close the transfer and inspect the destination before retrying. To prevent duplicates, this panel will not copy there again until reloaded.')
        }
        operation.refreshCleanDrafts(new Map([[focus.key, saved]]))
      }
    } catch (error) {
      if (labelsAttempted) throw new Error(`${error instanceof Error ? error.message : String(error)} The label catalog may already contain new labels.`)
      throw error
    } finally { this.transferBusy = false }
  }

  async finishTransfer(): Promise<void> {
    if (this.transferBusy) throw new Error('Wait for the in-flight note before closing.')
    const operation = this.operation
    this.operation = null
    this.transferring = false
    this.restore = this.protectedPlan = null
    this.copy = null
    if (operation) await operation.finish()
  }
}
