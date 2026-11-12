import { NOTE_KEY_PREFIX, parseNoteKey } from './protocol'
import { ARCHIVE_BYTES, ARCHIVE_RECORDS, archive, encodeArchive, planRestore, validateArchive, type NoteArchive, type RestoreChoice, type RestorePlan } from './note-transfer'
import type { NoteSession, NoteOperation } from './session'

const HOST_KEY_CHARACTERS = 256
const HOST_KEYS = 1024
const HOST_STORE_BYTES = 5242880
const HOST_VALUE_BYTES = 262144

export class NotesTransfer {
  private operation: NoteOperation | null = null
  private transferring = false
  private transferBusy = false
  private restore: RestorePlan | null = null
  private protectedPlan: RestorePlan | null = null
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

  private async stored(key: string): Promise<string | null> {
    if (key.length > HOST_KEY_CHARACTERS) throw new Error(`Note identity exceeds the host 256-character storage-key limit: ${key}`)
    const value = await this.lease().get(key)
    if (value !== null && typeof value !== 'string') throw new Error(`Stored note cannot be read: ${key}`)
    if (value === null && (await this.lease().keys()).includes(key)) throw new Error(`Stored note is null or disappeared during capture: ${key}`)
    return value
  }
  private async preflightStorage(plan: RestorePlan): Promise<void> {
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
    for (const item of plan.items) {
      if (item.action !== 'create' && item.action !== 'replace') continue
      if (encoder.encode(JSON.stringify(item.note.text)).byteLength > HOST_VALUE_BYTES) {
        throw new Error(`Note exceeds the host 262,144-byte stored-value limit: ${item.key}`)
      }
      const singleton = encoder.encode(JSON.stringify({ [item.key]: item.note.text }, null, 2)).byteLength
      if (Object.hasOwn(contents, item.key)) {
        bytes += singleton - encoder.encode(JSON.stringify({ [item.key]: contents[item.key] }, null, 2)).byteLength
      } else {
        bytes += singleton - 2
        ++count
      }
      contents[item.key] = item.note.text
      if (count > HOST_KEYS || bytes > HOST_STORE_BYTES) {
        throw new Error('Restore exceeds the host 1,024-key or 5 MiB plugin-store limit. Nothing was written.')
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
        const text = await this.stored(key)
        if (text === null) throw new Error(`Stored note disappeared during capture: ${key}`)
        size += text.length + key.length
        if (size > ARCHIVE_BYTES) throw new Error('Backup exceeds the archive resource limit. Nothing was truncated.')
        notes.push({ ...target, text })
      }
      const value = archive(notes, this.lease().recoveryDrafts())
      encodeArchive(value)
      return value
    } finally { this.transferBusy = false }
  }

  async previewRestore(value: NoteArchive, choices: readonly RestoreChoice[]): Promise<RestorePlan> {
    if (!this.transferring || this.transferBusy) throw new Error('Open an idle notes transfer first.')
    this.restore = this.protectedPlan = null
    this.transferBusy = true
    try {
      const snapshot = validateArchive(value)
      encodeArchive(snapshot)
      await this.lease().reconcile()
      const states = new Map<string, string | null>()
      for (const choice of choices) {
        const stored = await this.stored(choice.key)
        states.set(choice.key, stored)
      }
      this.lease().refreshCleanDrafts(states)
      const plan = planRestore(snapshot, choices, states, this.lease().recoveryDrafts())
      await this.preflightStorage(plan)
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
      await this.preflightStorage(plan)
      for (const item of plan.items) {
        if (await this.stored(item.key) !== item.before) {
          this.restore = this.protectedPlan = null
          throw new Error('Destination notes changed. Prepare a new preview and protection file.')
        }
      }
      for (const item of selected) {
        if (this.stopped) break
        try {
          await this.lease().write(item.key, item.note.text)
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

  async finishTransfer(): Promise<void> {
    if (this.transferBusy) throw new Error('Wait for the in-flight note before closing.')
    const operation = this.operation
    this.operation = null
    this.transferring = false
    this.restore = this.protectedPlan = null
    if (operation) await operation.finish()
  }
}
