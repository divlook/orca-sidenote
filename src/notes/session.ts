import type { JsonValue } from 'orca'
import { NOTE_KEY_PREFIX, noteKey, parseNoteKey, type NoteTarget } from '../protocol'
import { collection, editorKey, readCollection, readStoredCollection, sameCollection, type NoteCollection } from './note-collection'

export type NoteStore = { get(key: string): Promise<unknown>; set(key: string, value: JsonValue): Promise<void>;
  keys(): Promise<string[]>; delete(key: string): Promise<void> }
export type RecoveryCollection = { hostId: string | null; path: string; notes: NoteCollection['notes'] }
export interface NoteOperation {
  get(key: string): Promise<unknown>
  read(key: string): Promise<NoteCollection | null>
  keys(): Promise<string[]>
  recoveryCollections(): RecoveryCollection[]
  refreshCleanDrafts(states: ReadonlyMap<string, NoteCollection | null>): void
  reconcile(): Promise<void>
  write(key: string, value: NoteCollection): Promise<void>
  finish(): Promise<void>
}
type ScopeDraft = { value: NoteCollection; saved: NoteCollection; pending: number; error: string; revision: number; removed: Set<string> }

export class NoteSession {
  private scopeDrafts = new Map<string, ScopeDraft>()
  private scopeKey = ''
  private generation = 0
  private writes = Promise.resolve()
  private loading = false
  private problem = ''
  private target: NoteTarget | null = null
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
  private get ready(): boolean {
    return this.scopeDrafts.has(this.scopeKey) && !this.loading && !this.problem && this.operation === null
  }


  get view() {
    const draft = this.scopeDrafts.get(this.scopeKey)
    const saved = new Map(draft?.saved.notes.map(note => [note.id, note.text]))
    return { scopeKey: this.scopeKey, target: this.target,
      ready: this.ready,
      notes: (draft?.value.notes ?? []).map(note => ({ ...note, key: editorKey(this.scopeKey, note.id),
        pending: draft?.pending ?? 0, error: draft?.error ?? '',
        dirty: saved.get(note.id) !== note.text })),
      pending: draft?.pending ?? 0, error: draft?.error ?? '', loading: this.loading,
      problem: this.problem, dirty: !!draft && !sameCollection(draft.value, draft.saved), epoch: this.epoch,
      invalidations: this.invalidations }
  }

  private suspend(): void {
    this.scopeKey = ''
    this.target = null
    ++this.generation
    this.loading = true
    this.problem = ''
    this.changed()
  }

  private fail(error: unknown): void {
    this.scopeKey = ''
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
    this.scopeKey = target ? noteKey(target) : ''
    this.loading = !!target
    this.problem = ''
    this.changed()
    if (!target) return
    const key = this.scopeKey
    try {
      if (this.unknownWrites.has(key)) {
        await this.reconcileUnknownWrites([key], generation)
        if (epoch !== this.loadEpoch || generation !== this.generation) return
      }
      if (!this.scopeDrafts.has(key)) {
        const stored = readCollection(await this.store.get(key))
        if (epoch !== this.loadEpoch) return
        if (!this.scopeDrafts.has(key)) this.scopeDrafts.set(key, this.draft(stored))
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

  private draft(value: NoteCollection): ScopeDraft { return { value, saved: value, pending: 0, error: '', revision: 0, removed: new Set() } }

  private invalidate(key: string, before: NoteCollection, after: NoteCollection): void {
    const ids = new Set([...before.notes, ...after.notes].map(note => note.id))
    for (const id of ids) {
      if (before.notes.find(note => note.id === id)?.text === after.notes.find(note => note.id === id)?.text) continue
      const card = editorKey(key, id)
      this.invalidations.set(card, (this.invalidations.get(card) ?? 0) + 1)
    }
  }

  private enqueue(key: string, draft: ScopeDraft): Promise<void> {
    const value = draft.value
    const revision = ++draft.revision
    draft.pending++
    draft.error = ''
    this.changed()
    this.writes = this.writes.then(async () => {
      const snapshot = draft.removed.size ? collection(value.notes.filter(note => !draft.removed.has(note.id))) : value
      try {
        await this.store.set(key, snapshot as unknown as JsonValue)
        draft.saved = snapshot
        if (revision === draft.revision) draft.error = ''
      } catch (error) {
        if (revision === draft.revision) draft.error = error instanceof Error ? error.message : String(error)
      } finally {
        draft.pending--
        this.changed()
      }
    })
    return this.writes
  }

  save(text: string, expectedKey: string): Promise<void> {
    const draft = this.scopeDrafts.get(this.scopeKey)
    if (!draft || !this.ready) return Promise.resolve()
    const note = draft.value.notes.find(note => editorKey(this.scopeKey, note.id) === expectedKey)
    if (!note) return Promise.resolve()
    draft.value = collection(draft.value.notes.map(item => item.id === note.id ? { id: item.id, text } : item))
    return this.enqueue(this.scopeKey, draft)
  }

  async createNote(): Promise<string | undefined> {
    const key = this.scopeKey, draft = this.scopeDrafts.get(key)
    if (!draft || !this.ready) return
    const id = crypto.randomUUID()
    draft.value = collection([...draft.value.notes, { id, text: '' }])
    const card = editorKey(key, id)
    void this.enqueue(key, draft)
    return card
  }

  reorderNotes(ids: readonly string[]): Promise<void> {
    const draft = this.scopeDrafts.get(this.scopeKey)
    if (!draft || !this.ready) return Promise.resolve()
    if (ids.length !== draft.value.notes.length || new Set(ids).size !== ids.length
      || ids.some(id => !draft.value.notes.some(note => note.id === id))) throw new Error('The note order has changed. Try again.')
    draft.value = collection(ids.map(id => draft.value.notes.find(note => note.id === id)!))
    return this.enqueue(this.scopeKey, draft)
  }

  retry(): Promise<void> {
    const draft = this.scopeDrafts.get(this.scopeKey)
    return draft && this.ready ? this.enqueue(this.scopeKey, draft) : Promise.resolve()
  }

  deleteNote(id: string): Promise<void> {
    return this.removeNote(id, false)
  }

  pruneEmptyNote(id: string): Promise<void> {
    return this.removeNote(id, true)
  }

  private async removeNote(id: string, onlyIfEmpty: boolean): Promise<void> {
    const key = this.scopeKey, draft = this.scopeDrafts.get(key), generation = this.generation
    if (!this.ready || !draft?.value.notes.some(note => note.id === id)) return
    draft.pending++
    const write = this.writes.then(async () => {
      try {
        if (onlyIfEmpty && (generation !== this.generation || this.scopeKey !== key || !this.ready
          || draft.value.notes.find(note => note.id === id)?.text.trim() !== '')) return
        const snapshot = collection(draft.value.notes.filter(note => note.id !== id))
        const revision = draft.revision
        await this.store.set(key, snapshot as unknown as JsonValue)
        const before = draft.value
        if (!onlyIfEmpty || draft.value.notes.find(note => note.id === id)?.text.trim() === '') {
          draft.removed.add(id)
          draft.value = collection(draft.value.notes.filter(note => note.id !== id))
          this.invalidate(key, before, draft.value)
        }
        draft.saved = snapshot
        if (revision === draft.revision) draft.error = ''
        this.unknownWrites.delete(key)
      } catch (error) {
        this.unknownWrites.add(key)
        throw error
      } finally {
        draft.pending--
        this.changed()
      }
    })
    this.writes = write.catch(() => {})
    this.changed()
    await write
  }

  async prepareDeletion(): Promise<number> {
    if (this.deleting || this.deletion !== null) throw new Error('Another note operation is already open.')
    this.deleting = true
    try {
      this.deletionOperation = await this.acquireNoteOperation()
      const keys = new Set((await this.store.keys()).filter(key => key.startsWith(NOTE_KEY_PREFIX)))
      for (const [key, draft] of this.scopeDrafts) if (draft.value.notes.length || draft.pending || draft.error) keys.add(key)
      this.deletion = [...keys]
      let count = 0
      for (const key of keys) {
        const draft = this.scopeDrafts.get(key)
        if (draft) count += Math.max(1, draft.value.notes.length)
        else {
          const stored = await this.store.get(key)
          try { count += Math.max(1, readCollection(stored).notes.length) } catch { count++ }
        }
      }
      return count
    } finally { this.deleting = false; this.changed() }
  }

  async deletePrepared(): Promise<void> {
    if (this.deletion === null || this.deleting) throw new Error('Prepare note deletion first.')
    this.deleting = true
    this.changed()
    let removed = 0
    try {
      for (const key of [...this.deletion]) {
        await this.store.delete(key)
        this.scopeDrafts.delete(key)
        this.unknownWrites.delete(key)
        this.deletion.splice(this.deletion.indexOf(key), 1)
        removed++
      }
    } catch (error) {
      throw new Error(`Deletion stopped. ${this.deletion.length} locations remain to retry. ${error instanceof Error ? error.message : String(error)}`)
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

  private recoveryCollections(): RecoveryCollection[] {
    return [...this.scopeDrafts].filter(([, draft]) => !sameCollection(draft.value, draft.saved) || !!draft.error)
      .map(([key, draft]) => ({ ...parseNoteKey(key), notes: draft.value.notes }))
  }

  private refreshCleanDraft(key: string, stored: NoteCollection | null): boolean {
    const draft = this.scopeDrafts.get(key), next = stored ?? collection([])
    if (draft && sameCollection(draft.value, draft.saved) && !draft.error && !draft.pending
      && !sameCollection(draft.value, next)) {
      this.invalidate(key, draft.value, next)
      this.scopeDrafts.set(key, this.draft(next))
      return true
    }
    return false
  }

  private async reconcileUnknownWrites(keys: Iterable<string> = this.unknownWrites, generation?: number): Promise<void> {
    const epoch = this.loadEpoch
    for (const key of keys) {
      const value = await readStoredCollection(this.store, key)
      if (epoch !== this.loadEpoch || (generation !== undefined && generation !== this.generation)) return
      this.refreshCleanDraft(key, value)
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
      read: key => run(() => readStoredCollection(this.store, key)),
      keys: () => run(() => this.store.keys()),
      recoveryCollections: () => { assertLive(); return this.recoveryCollections() },
      refreshCleanDrafts: states => {
        assertLive()
        let refreshed = false
        for (const [key, stored] of states) refreshed = this.refreshCleanDraft(key, stored) || refreshed
        if (refreshed) this.changed()
      },
      reconcile: () => run(() => this.reconcileUnknownWrites()),
      write: (key, value) => run(async () => {
        parseNoteKey(key)
        const snapshot = readCollection(value)
        const write = this.writes.then(async () => {
          try {
            await this.store.set(key, snapshot as unknown as JsonValue)
            this.invalidate(key, this.scopeDrafts.get(key)?.value ?? collection([]), snapshot)
            this.scopeDrafts.set(key, this.draft(snapshot))
            this.unknownWrites.delete(key)
            this.changed()
          } catch (error) {
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
}
