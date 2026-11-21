import type { JsonValue } from 'orca'
import { NOTE_KEY_PREFIX, noteKey, parseNoteKey, type NoteFocus, type NoteTarget } from '../protocol'
import { collection, editorKey, readCollection, readStoredCollection, sameCollection, type NoteCollection } from './note-collection'
import { DEFAULT_LABELS, LABEL_KEY, labelCatalog, readLabels, type NoteLabel, type LabelColor } from './note-labels'

export type NoteStore = { get(key: string): Promise<unknown>; set(key: string, value: JsonValue): Promise<void>;
  keys(): Promise<string[]>; delete(key: string): Promise<void> }
export type RecoveryCollection = { hostId: string | null; path: string; notes: NoteCollection['notes'] }
export type OperationFocus = Readonly<{ key: string; revision: number }>
export interface NoteOperation {
  get(key: string): Promise<unknown>
  read(key: string): Promise<NoteCollection | null>
  keys(): Promise<string[]>
  recoveryCollections(): RecoveryCollection[]
  refreshCleanDrafts(states: ReadonlyMap<string, NoteCollection | null>): void
  reconcile(): Promise<void>
  focused(): Promise<OperationFocus>
  assertFocus(focus: OperationFocus): void
  writeFocused(focus: OperationFocus, before: NoteCollection | null, value: NoteCollection, labels: readonly NoteLabel[]): Promise<{ error: unknown } | null>
  write(key: string, value: NoteCollection): Promise<void>
  labels(): Promise<readonly NoteLabel[]>
  writeLabels(labels: readonly NoteLabel[], guard?: { focus: OperationFocus; before: readonly NoteLabel[] }): Promise<void>
  finish(): Promise<void>
}
type ScopeDraft = { value: NoteCollection; saved: NoteCollection; pending: number; error: string; revision: number; removed: Set<string> }
type PendingSave = { key: string; draft: ScopeDraft; value: NoteCollection; revision: number; callers: number; promise: Promise<void> }

export class NoteSession {
  private scopeDrafts = new Map<string, ScopeDraft>()
  private scopeKey = ''
  private generation = 0
  private focusRevision = 0
  private writes = Promise.resolve()
  private pendingTextSave: PendingSave | undefined
  private loading = false
  private localSelected = false
  private checking = false
  private problem = ''
  private target: NoteTarget | null = null
  private unavailable: 'remote' | null = null
  private deletion: string[] | null = null
  private deleting = false
  private epoch = 0
  private loadEpoch = 0
  private invalidations = new Map<string, number>()
  private unknownWrites = new Set<string>()
  private resolveTarget: (() => Promise<NoteFocus>) | undefined
  private operation: { pending: number } | null = null
  private deletionOperation: NoteOperation | null = null
  private catalog: readonly NoteLabel[] = []
  private catalogReady = false
  private catalogBusy = false
  private catalogError = ''
  private labelDeletion: { id: string | null; operation: NoteOperation; states: Map<string, NoteCollection | null>; labels: readonly NoteLabel[] } | null = null

  get localStoreAvailable(): boolean { return this.localSelected }
  get labels() { return { ready: this.localSelected && this.catalogReady && !this.catalogBusy && !this.operation,
    labels: this.catalog, busy: this.catalogBusy, error: this.catalogError } }

  private requireLocalStore(): void {
    if (!this.localSelected) throw new Error('The current note store is unavailable. Switch to a local worktree.')
  }

  async loadLabels(): Promise<void> {
    this.requireLocalStore()
    if (this.catalogBusy) return
    if (this.operation) throw new Error('Another note operation is already open.')
    this.catalogBusy = true; this.changed()
    try { this.catalog = readLabels(await this.store.get(LABEL_KEY)); this.catalogReady = true; this.catalogError = '' }
    catch (error) { this.catalogReady = false; this.catalogError = error instanceof Error ? error.message : String(error); throw error }
    finally { this.catalogBusy = false; this.changed() }
  }

  private async persistLabels(labels: readonly NoteLabel[]): Promise<void> {
    const next = labelCatalog(labels)
    try { await this.store.set(LABEL_KEY, { version: 1, labels: next } as unknown as JsonValue) }
    catch (error) {
      this.catalogReady = false
      this.catalogError = error instanceof Error ? error.message : String(error)
      this.changed()
      throw error
    }
    this.catalog = next; this.catalogReady = true; this.catalogError = ''; this.changed()
  }

  private async editLabels(edit: (labels: readonly NoteLabel[]) => readonly NoteLabel[]): Promise<void> {
    if (!this.labels.ready) throw new Error('Wait for the label catalog to be ready.')
    this.catalogBusy = true; this.changed()
    try { await this.persistLabels(edit(readLabels(await this.store.get(LABEL_KEY)))) }
    catch (error) { this.catalogReady = false; this.catalogError = error instanceof Error ? error.message : String(error); throw error }
    finally { this.catalogBusy = false; this.changed() }
  }

  addLabel(name: string, color: LabelColor): Promise<void> {
    return this.editLabels(labels => [...labels, { id: crypto.randomUUID(), name: name.trim(), color }])
  }
  updateLabel(id: string, name: string, color: LabelColor): Promise<void> {
    return this.editLabels(labels => {
      if (!labels.some(label => label.id === id)) throw new Error('The label no longer exists.')
      return labels.map(label => label.id === id ? { id, name: name.trim(), color } : label)
    })
  }
  reorderLabels(ids: readonly string[]): Promise<void> {
    return this.editLabels(labels => {
      if (ids.length !== labels.length || new Set(ids).size !== ids.length || ids.some(id => !labels.some(label => label.id === id))) throw new Error('The label order changed.')
      return ids.map(id => labels.find(label => label.id === id)!)
    })
  }
  async assignLabel(expectedKey: string, labelId: string | null): Promise<void> {
    this.pendingTextSave = undefined
    if (!this.ready || !this.labels.ready) return
    const key = this.scopeKey, draft = this.scopeDrafts.get(key)!, generation = this.generation
    if (!draft.value.notes.some(note => editorKey(key, note.id) === expectedKey)) return
    if (labelId !== null && !this.catalog.some(label => label.id === labelId)) throw new Error('The label no longer exists.')
    this.catalogBusy = true; this.changed()
    try {
      const current = readLabels(await this.store.get(LABEL_KEY))
      if (labelId !== null && !current.some(label => label.id === labelId)) throw new Error('The label no longer exists.')
      await this.persistLabels(current)
      if (!this.ready || generation !== this.generation || this.scopeKey !== key || this.scopeDrafts.get(key) !== draft) return
      draft.value = collection(draft.value.notes.map(note => {
        if (editorKey(key, note.id) !== expectedKey) return note
        const { labelId: previous, ...rest } = note
        return labelId === null ? rest : { ...rest, labelId }
      }))
      await this.enqueue(key, draft)
    } catch (error) {
      this.catalogReady = false
      this.catalogError = error instanceof Error ? error.message : String(error)
      throw error
    } finally { this.catalogBusy = false; this.changed() }
  }

  async prepareLabelDeletion(id: string | null): Promise<number> {
    if (this.labelDeletion || this.catalogBusy) throw new Error('Another label operation is open.')
    const operation = await this.acquireNoteOperation()
    try {
      const labels = await operation.labels()
      if (id !== null && !labels.some(label => label.id === id)) throw new Error('The label no longer exists.')
      const keys = new Set((await operation.keys()).filter(key => key.startsWith(NOTE_KEY_PREFIX)))
      for (const key of this.scopeDrafts.keys()) keys.add(key)
      const states = new Map<string, NoteCollection | null>()
      let count = 0
      for (const key of keys) {
        const stored = await operation.read(key)
        states.set(key, stored)
        const ids = new Set([...(stored?.notes ?? []), ...(this.scopeDrafts.get(key)?.value.notes ?? [])]
          .filter(note => note.labelId !== undefined && (id === null || note.labelId === id)).map(note => note.id))
        count += ids.size
      }
      this.labelDeletion = { id, operation, states, labels }
      return count
    } catch (error) { await operation.finish(); throw error }
  }

  async deletePreparedLabels(): Promise<void> {
    const prepared = this.labelDeletion
    if (!prepared || this.catalogBusy) throw new Error('Prepare label deletion first.')
    this.catalogBusy = true; this.changed()
    const clear = (value: NoteCollection) => collection(value.notes.map(note => {
      if (note.labelId === undefined || (prepared.id !== null && note.labelId !== prepared.id)) return note
      const { labelId, ...rest } = note
      return rest
    }))
    try {
      if (JSON.stringify(await prepared.operation.labels()) !== JSON.stringify(prepared.labels)) throw new Error('The label catalog changed. Cancel and prepare again.')
      for (const [key, before] of prepared.states) {
        const current = await prepared.operation.read(key)
        if (current === null ? before !== null : before === null || !sameCollection(current, before)) throw new Error('Stored notes changed. Cancel and prepare again.')
      }
      for (const [key, before] of prepared.states) {
        if (before) {
          const next = clear(before)
          if (!sameCollection(before, next)) {
            await this.store.set(key, next as unknown as JsonValue)
            prepared.states.set(key, next)
          }
        }
        const draft = this.scopeDrafts.get(key)
        if (draft) { draft.value = clear(draft.value); draft.saved = clear(draft.saved) }
      }
      const next = prepared.id === null
        ? DEFAULT_LABELS.map(label => ({ ...label, id: crypto.randomUUID() }))
        : prepared.labels.filter(label => label.id !== prepared.id)
      await this.persistLabels(next)
      prepared.labels = next
    } catch (error) { this.catalogError = error instanceof Error ? error.message : String(error); throw error }
    finally { this.catalogBusy = false; this.changed() }
  }

  async finishLabelDeletion(): Promise<void> {
    if (this.catalogBusy) throw new Error('Wait for the label operation to finish.')
    const prepared = this.labelDeletion
    this.labelDeletion = null
    if (prepared) await prepared.operation.finish()
  }

  private projection: { key: string; value: NoteCollection | undefined; saved: NoteCollection | undefined; pending: number; error: string;
    notes: (NoteCollection['notes'][number] & { key: string; pending: number; error: string; dirty: boolean })[]; dirty: boolean } | undefined
  constructor(private store: NoteStore, private changed: () => void) {}
  private get ready(): boolean {
    return this.scopeDrafts.has(this.scopeKey) && !this.loading && !this.checking && !this.problem && this.operation === null
  }


  get view() {
    const draft = this.scopeDrafts.get(this.scopeKey), pending = draft?.pending ?? 0, error = draft?.error ?? ''
    if (!this.projection || this.projection.key !== this.scopeKey || this.projection.value !== draft?.value
      || this.projection.saved !== draft?.saved || this.projection.pending !== pending || this.projection.error !== error) {
      const saved = new Map(draft?.saved.notes.map(note => [note.id, note.text]))
      this.projection = { key: this.scopeKey, value: draft?.value, saved: draft?.saved, pending, error,
        notes: (draft?.value.notes ?? []).map(note => ({ ...note, key: editorKey(this.scopeKey, note.id),
          pending, error, dirty: saved.get(note.id) !== note.text })),
        dirty: !!draft && !sameCollection(draft.value, draft.saved) }
    }
    return { scopeKey: this.scopeKey, target: this.target, unavailable: this.unavailable, ready: this.ready,
      notes: this.projection.notes, pending, error, loading: this.loading, checking: this.checking,
      problem: this.problem, dirty: this.projection.dirty, epoch: this.epoch, invalidations: this.invalidations }
  }

  private fail(error: unknown): void {
    this.scopeKey = ''
    this.target = null
    this.unavailable = null
    this.loading = false
    this.checking = false
    this.problem = error instanceof Error ? error.message : String(error)
    this.changed()
  }

  async follow(resolveTarget: () => Promise<NoteFocus>): Promise<void> {
    this.pendingTextSave = undefined
    this.resolveTarget = resolveTarget
    ++this.focusRevision
    if (this.operation !== null) return
    this.checking = true
    this.localSelected = false
    ++this.generation
    this.problem = ''
    this.unavailable = null
    this.changed()
    const generation = this.generation
    try {
      const target = await resolveTarget()
      if (generation === this.generation) await this.focus(target)
    } catch (error) {
      if (generation === this.generation) this.fail(error)
    }
  }

  private async focus(focus: NoteFocus): Promise<void> {
    this.unavailable = focus && 'unavailable' in focus ? focus.unavailable : null
    this.localSelected = this.unavailable === null
    const target = focus && 'path' in focus ? focus : null
    const generation = ++this.generation
    const epoch = this.loadEpoch
    const key = target ? noteKey(target) : ''
    this.loading = !!target && (key !== this.scopeKey || this.loading)
    this.target = target
    this.scopeKey = key
    this.problem = ''
    if (!target) this.checking = false
    this.changed()
    if (!target) return
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
        this.checking = false
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

  private enqueue(key: string, draft: ScopeDraft, textSave = false): Promise<void> {
    const revision = ++draft.revision
    draft.pending++
    draft.error = ''
    const pending = this.pendingTextSave
    if (textSave && pending?.key === key && pending.draft === draft) {
      pending.value = draft.value
      pending.revision = revision
      pending.callers++
      this.changed()
      return pending.promise
    }
    const next: PendingSave = { key, draft, value: draft.value, revision, callers: 1, promise: this.writes }
    this.pendingTextSave = textSave ? next : undefined
    next.promise = this.writes = this.writes.then(async () => {
      if (this.pendingTextSave === next) this.pendingTextSave = undefined
      const snapshot = draft.removed.size ? collection(next.value.notes.filter(note => !draft.removed.has(note.id))) : next.value
      try {
        await this.store.set(key, snapshot as unknown as JsonValue)
        draft.saved = snapshot
        if (next.revision === draft.revision) draft.error = ''
      } catch (error) {
        if (next.revision === draft.revision) draft.error = error instanceof Error ? error.message : String(error)
      } finally {
        draft.pending -= next.callers
        this.changed()
      }
    })
    this.changed()
    return next.promise
  }

  save(text: string, expectedKey: string): Promise<void> {
    const draft = this.scopeDrafts.get(this.scopeKey)
    if (!draft || !this.ready) return Promise.resolve()
    const note = draft.value.notes.find(note => editorKey(this.scopeKey, note.id) === expectedKey)
    if (!note) return Promise.resolve()
    draft.value = collection(draft.value.notes.map(item => item.id === note.id ? { ...item, text } : item))
    return this.enqueue(this.scopeKey, draft, true)
  }

  async createNote(): Promise<string | undefined> {
    this.pendingTextSave = undefined
    const key = this.scopeKey, draft = this.scopeDrafts.get(key)
    if (!draft || !this.ready) return
    const id = crypto.randomUUID()
    draft.value = collection([...draft.value.notes, { id, text: '' }])
    const card = editorKey(key, id)
    void this.enqueue(key, draft)
    return card
  }

  reorderNotes(ids: readonly string[]): Promise<void> {
    this.pendingTextSave = undefined
    const draft = this.scopeDrafts.get(this.scopeKey)
    if (!draft || !this.ready) return Promise.resolve()
    if (ids.length !== draft.value.notes.length || new Set(ids).size !== ids.length
      || ids.some(id => !draft.value.notes.some(note => note.id === id))) throw new Error('The note order has changed. Try again.')
    draft.value = collection(ids.map(id => draft.value.notes.find(note => note.id === id)!))
    return this.enqueue(this.scopeKey, draft)
  }

  retry(): Promise<void> {
    this.pendingTextSave = undefined
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
    this.pendingTextSave = undefined
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
    this.pendingTextSave = undefined
    this.requireLocalStore()
    if (this.operation) throw new Error('Another note operation is already open.')
    if (this.catalogBusy) throw new Error('Wait for the label catalog operation to finish.')
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
    const assertFocus = (focus: OperationFocus) => {
      assertLive()
      if (focus.revision !== this.focusRevision) throw new Error('Workspace focus changed. Preview the copy again.')
    }
    const focused = async (): Promise<OperationFocus> => {
      const revision = this.focusRevision
      const target = await this.resolveTarget?.()
      if (!target || typeof target !== 'object' || 'unavailable' in target || typeof target.path !== 'string' || !target.path
        || (target.hostId !== null && typeof target.hostId !== 'string')) {
        throw new Error('No workspace could be confirmed. Focus the destination and preview the copy again.')
      }
      const focus = Object.freeze({ key: noteKey(target), revision })
      assertFocus(focus)
      return focus
    }
    const verifyFocus = async (focus: OperationFocus) => {
      assertFocus(focus)
      if ((await focused()).key !== focus.key) throw new Error('The current workspace changed. Preview the copy again.')
      assertFocus(focus)
    }
    const checkLabels = async (expected: readonly NoteLabel[]) => {
      if (JSON.stringify(readLabels(await this.store.get(LABEL_KEY))) !== JSON.stringify(expected)) {
        throw new Error('Destination labels changed. Preview the copy again.')
      }
    }
    const persist = async (key: string, snapshot: NoteCollection) => {
      try { await this.store.set(key, snapshot as unknown as JsonValue) }
      catch (error) { this.unknownWrites.add(key); return { error } }
      this.invalidate(key, this.scopeDrafts.get(key)?.value ?? collection([]), snapshot)
      this.scopeDrafts.set(key, this.draft(snapshot))
      this.unknownWrites.delete(key)
      this.changed()
      return null
    }
    const queue = <T>(action: () => Promise<T>): Promise<T> => {
      const write = this.writes.then(action)
      this.writes = write.then(() => {}, () => {})
      return write
    }
    await this.writes
    return {
      get: key => run(() => this.store.get(key)),
      read: key => run(() => readStoredCollection(this.store, key)),
      keys: () => run(() => this.store.keys()),
      labels: () => run(async () => readLabels(await this.store.get(LABEL_KEY))),
      focused: () => run(focused),
      assertFocus,
      writeLabels: (labels, guard) => run(async () => {
        if (guard) {
          await verifyFocus(guard.focus)
          await checkLabels(guard.before)
          assertFocus(guard.focus)
        }
        await this.persistLabels(labels)
      }),
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
        await queue(async () => {
          const failure = await persist(key, snapshot)
          if (failure) throw failure.error
        })
      }),
      writeFocused: (focus, before, value, labels) => run(() => queue(async () => {
        await verifyFocus(focus)
        await checkLabels(labels)
        const current = await readStoredCollection(this.store, focus.key)
        if (current === null ? before !== null : before === null || !sameCollection(current, before)) {
          throw new Error('Destination notes changed. Preview the copy again.')
        }
        // Storage reads may finish before the panel receives a focus change event.
        await verifyFocus(focus)
        assertFocus(focus)
        return persist(focus.key, value)
      })),
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
