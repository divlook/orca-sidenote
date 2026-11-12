import { NOTE_KEY_PREFIX, noteKey, parseNoteKey, type NoteTarget } from './protocol'
import { allowsNoteChange, DEFAULT_NOTE_LIMIT, type NoteLimit } from './note-settings'

export type NoteStore = { get(key: string): Promise<unknown>; set(key: string, value: string): Promise<void>;
  keys(): Promise<string[]>; delete(key: string): Promise<void> }
export interface NoteOperation {
  get(key: string): Promise<unknown>
  keys(): Promise<string[]>
  recoveryDrafts(): { hostId: string | null; path: string; text: string }[]
  refreshCleanDrafts(states: ReadonlyMap<string, string | null>): void
  reconcile(): Promise<void>
  write(key: string, text: string): Promise<void>
  finish(): Promise<void>
}
type Draft = { text: string; saved: string; pending: number; error: string }

export class NoteSession {
  private drafts = new Map<string, Draft>()
  private key = ''
  private generation = 0
  private writes = Promise.resolve()
  private loading = false
  private problem = ''
  private target: NoteTarget | null = null
  private limit: NoteLimit = DEFAULT_NOTE_LIMIT
  private deletion: string[] | null = null
  private deleting = false
  private epoch = 0
  private loadEpoch = 0
  private invalidations = new Map<string, number>()
  private unknownWrites = new Set<string>()
  private resolveTarget: (() => Promise<NoteTarget | null>) | undefined
  private operation: { pending: number } | null = null
  private deletionOperation: NoteOperation | null = null

  constructor(private store: NoteStore, private changed: () => void) {}

  get view() {
    const draft = this.drafts.get(this.key)
    return { key: this.key, target: this.target, text: draft?.text ?? '', ready: !!draft && !this.loading && !this.problem && this.operation === null,
      pending: draft?.pending ?? 0, error: draft?.error ?? '', loading: this.loading,
      problem: this.problem, dirty: !!draft && draft.text !== draft.saved, epoch: this.epoch,
      invalidations: this.invalidations }
  }

  private suspend(): void {
    this.key = ''
    this.target = null
    ++this.generation
    this.loading = true
    this.problem = ''
    this.changed()
  }

  private fail(error: unknown): void {
    this.key = ''
    this.target = null
    this.loading = false
    this.problem = error instanceof Error ? error.message : String(error)
    this.changed()
  }

  async follow(resolveTarget: () => Promise<NoteTarget | null>): Promise<void> {
    this.resolveTarget = resolveTarget
    if (this.operation !== null) return
    this.suspend()
    const generation = this.generation
    try {
      const target = await resolveTarget()
      if (generation === this.generation) await this.focus(target)
    } catch (error) {
      if (generation === this.generation) this.fail(error)
    }
  }

  private async focus(target: NoteTarget | null): Promise<void> {
    const generation = ++this.generation
    const epoch = this.loadEpoch
    this.target = target
    this.key = target ? noteKey(target) : ''
    this.loading = !!target
    this.problem = ''
    this.changed()
    if (!target) return
    const key = this.key
    try {
      if (this.unknownWrites.has(key)) {
        await this.reconcileUnknownWrites([key], generation)
        if (epoch !== this.loadEpoch || generation !== this.generation) return
      }
      if (!this.drafts.has(key)) {
        const stored = await this.store.get(key)
        if (epoch !== this.loadEpoch) return
        if (stored !== null && typeof stored !== 'string') throw new Error('The stored note format cannot be read.')
        if (!this.drafts.has(key)) {
          this.drafts.set(key, { text: stored ?? '', saved: stored ?? '', pending: 0, error: '' })
        }
      }
    } catch (error) {
      if (generation === this.generation) this.fail(error)
    } finally {
      if (generation === this.generation) {
        this.loading = false
        this.changed()
      }
    }
  }
  setLimit(limit: NoteLimit): void {
    this.limit = limit
    this.changed()
  }

  async prepareDeletion(): Promise<number> {
    if (this.deleting || this.deletion !== null) throw new Error('Another note operation is already open.')
    this.deleting = true
    try {
      this.deletionOperation = await this.acquireNoteOperation()
      const keys = new Set((await this.store.keys()).filter(key => key.startsWith(NOTE_KEY_PREFIX)))
      for (const [key, draft] of this.drafts) if (draft.text || draft.pending || draft.error) keys.add(key)
      this.deletion = [...keys]
      return keys.size
    } finally {
      this.deleting = false
      this.changed()
    }
  }

  async deletePrepared(): Promise<void> {
    if (this.deletion === null || this.deleting) throw new Error('Prepare note deletion first.')
    this.deleting = true
    this.changed()
    let removed = 0
    try {
      for (const key of [...this.deletion]) {
        await this.store.delete(key)
        this.drafts.delete(key)
        this.deletion.splice(this.deletion.indexOf(key), 1)
        removed++
      }
    } catch (error) {
      throw new Error(`Deletion stopped. ${this.deletion.length} notes remain to retry. ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (removed) ++this.epoch
      this.deleting = false
      this.changed()
    }
  }

  async finishDeletion(): Promise<void> {
    if (this.deleting) return
    this.deletion = null
    const operation = this.deletionOperation
    this.deletionOperation = null
    if (operation) await operation.finish()
    else if (this.resolveTarget) await this.follow(this.resolveTarget)
    else this.changed()
  }
  private recoveryDrafts() {
    return [...this.drafts].filter(([, draft]) => draft.text !== draft.saved || !!draft.error)
      .map(([key, draft]) => ({ ...parseNoteKey(key), text: draft.text }))
  }


  private refreshCleanDraft(key: string, stored: string | null): boolean {
    const draft = this.drafts.get(key)
    if (draft && draft.text === draft.saved && !draft.error && !draft.pending
      && draft.text !== (stored ?? '')) {
      if (stored === null) this.drafts.delete(key)
      else this.drafts.set(key, { text: stored, saved: stored, pending: 0, error: '' })
      this.invalidations.set(key, (this.invalidations.get(key) ?? 0) + 1)
      return true
    }
    return false
  }

  private async reconcileUnknownWrites(keys: Iterable<string> = this.unknownWrites, generation?: number): Promise<void> {
    const epoch = this.loadEpoch
    for (const key of keys) {
      const stored = await this.store.get(key)
      if (stored !== null && typeof stored !== 'string') throw new Error(`Stored note cannot be read: ${key}`)
      if (stored === null && (await this.store.keys()).includes(key)) throw new Error(`Stored note is null or disappeared during capture: ${key}`)
      if (epoch !== this.loadEpoch || (generation !== undefined && generation !== this.generation)) return
      this.refreshCleanDraft(key, stored)
      this.unknownWrites.delete(key)
    }
    this.changed()
  }

  async acquireNoteOperation(): Promise<NoteOperation> {
    if (this.operation) throw new Error('Another note operation is already open.')
    const operation = { pending: 0 }
    this.operation = operation
    ++this.generation
    ++this.loadEpoch
    this.changed()
    const assertLive = () => {
      if (this.operation !== operation) throw new Error('The note operation has finished.')
    }
    const run = async <T>(action: () => Promise<T>): Promise<T> => {
      assertLive()
      operation.pending++
      try { return await action() } finally { operation.pending-- }
    }
    await this.writes
    return {
      get: key => run(() => this.store.get(key)),
      keys: () => run(() => this.store.keys()),
      recoveryDrafts: () => { assertLive(); return this.recoveryDrafts() },
      refreshCleanDrafts: states => {
        assertLive()
        let refreshed = false
        for (const [key, stored] of states) refreshed = this.refreshCleanDraft(key, stored) || refreshed
        if (refreshed) this.changed()
      },
      reconcile: () => run(() => this.reconcileUnknownWrites()),
      write: (key, text) => run(async () => {
        parseNoteKey(key)
        const write = this.writes.then(async () => {
          try {
            await this.store.set(key, text)
            this.drafts.set(key, { text, saved: text, pending: 0, error: '' })
            this.invalidations.set(key, (this.invalidations.get(key) ?? 0) + 1)
            this.changed()
          } catch (error) {
            // A rejected host request may have written the note before failing.
            this.unknownWrites.add(key)
            throw error
          }
        })
        this.writes = write.catch(() => {})
        await write
      }),
      finish: async () => {
        assertLive()
        if (operation.pending) throw new Error('Wait for the in-flight note before closing.')
        this.operation = null
        if (this.resolveTarget) await this.follow(this.resolveTarget)
        else this.changed()
      }
    }
  }


  save(text: string, expectedKey = this.key): Promise<void> {
    const key = this.key
    const draft = this.drafts.get(key)
    if (!draft || !this.view.ready || expectedKey !== key) return Promise.resolve()
    if (!allowsNoteChange(draft.text, text, this.limit)) {
      draft.error = `Notes are limited to ${this.limit} characters.`
      this.changed()
      return Promise.resolve()
    }
    draft.text = text
    draft.pending++
    draft.error = ''
    this.changed()
    this.writes = this.writes.then(async () => {
      try {
        await this.store.set(key, text)
        draft.saved = text
        draft.error = ''
      } catch (error) {
        draft.error = error instanceof Error ? error.message : String(error)
      } finally {
        draft.pending--
        this.changed()
      }
    })
    return this.writes
  }
}
