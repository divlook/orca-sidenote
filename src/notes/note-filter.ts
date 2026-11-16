import { parseNoteKey } from '../protocol'

export type NoteFilter = { version: 1; labelIds: string[]; noLabel: boolean }
export const FILTER_KEY_PREFIX = 'view:note-filter:v1:'
export const allNotes = (): NoteFilter => ({ version: 1, labelIds: [], noLabel: false })
export function filterKey(scope: string): string {
  const { hostId, path } = parseNoteKey(scope)
  return FILTER_KEY_PREFIX + JSON.stringify([hostId, path])
}
export function matchesFilter(filter: NoteFilter, note: { labelId?: string }): boolean {
  return !filter.labelIds.length && !filter.noLabel || (note.labelId ? filter.labelIds.includes(note.labelId) : filter.noLabel)
}
function readFilter(value: unknown): NoteFilter {
  if (value === undefined || value === null) return allNotes()
  const record = value as Partial<NoteFilter>
  if (typeof value !== 'object' || record.version !== 1 || !Array.isArray(record.labelIds)
    || record.labelIds.some(id => typeof id !== 'string' || !id) || new Set(record.labelIds).size !== record.labelIds.length
    || typeof record.noLabel !== 'boolean') throw new Error('The saved note filter is unreadable.')
  return { version: 1, labelIds: [...record.labelIds], noLabel: record.noLabel }
}

export function reorderDisplayed(full: readonly string[], displayed: ReadonlySet<string>, moving: string, target: string, after = false): string[] {
  const visible = full.filter(id => displayed.has(id))
  if (!visible.includes(moving) || !visible.includes(target) || moving === target) return [...full]
  visible.splice(visible.indexOf(moving), 1)
  visible.splice(visible.indexOf(target) + Number(after), 0, moving)
  let index = 0
  return full.map(id => displayed.has(id) ? visible[index++] : id)
}

type Store = { get(key: string): Promise<unknown>; set(key: string, value: NoteFilter): Promise<void> }
type State = { value: NoteFilter; ready: boolean; error: string; revision: number; pending: number; loaded: Promise<void> }
export class NoteFilters {
  private states = new Map<string, State>()
  private scope = ''
  private writes = Promise.resolve()
  constructor(private store: Store, private changed: () => void) {}
  get view() {
    const state = this.states.get(this.scope)
    return { value: state?.value ?? allNotes(), ready: !!state?.ready, error: state?.error ?? '', pending: state?.pending ?? 0 }
  }
  follow(scope: string): Promise<void> {
    this.scope = scope
    if (!scope) return Promise.resolve()
    const existing = this.states.get(scope)
    if (existing) return existing.loaded
    const state: State = { value: allNotes(), ready: false, error: '', revision: 0, pending: 0, loaded: Promise.resolve() }
    this.states.set(scope, state)
    state.loaded = this.read(scope, state)
    return state.loaded
  }
  private async read(scope: string, state: State): Promise<void> {
    const revision = state.revision
    try {
      const value = readFilter(await this.store.get(filterKey(scope)))
      if (revision !== state.revision) return
      state.value = value; state.ready = true; state.error = ''
    } catch (error) {
      if (revision !== state.revision) return
      state.ready = false; state.error = `${error instanceof Error ? error.message : String(error)} Retry the note filter.`
    }
    if (this.scope === scope) this.changed()
  }
  choose(value: NoteFilter): Promise<void> {
    const scope = this.scope, state = this.states.get(scope)
    if (!state?.ready) return Promise.resolve()
    state.value = { version: 1, labelIds: [...value.labelIds], noLabel: value.noLabel }
    const revision = ++state.revision, snapshot = state.value
    state.pending++; state.error = ''; this.changed()
    this.writes = this.writes.then(async () => {
      try { await this.store.set(filterKey(scope), snapshot) }
      catch (error) {
        // A rejected host write may have committed. Keep the chosen presentation, but
        // require an explicit reread before another choice instead of guessing rollback.
        if (revision === state.revision) {
          state.ready = false; state.error = `${error instanceof Error ? error.message : String(error)} Retry the note filter.`
        }
      }
      state.pending--
      if (this.scope === scope) this.changed()
    })
    return this.writes
  }
  retry(): Promise<void> {
    const scope = this.scope, state = this.states.get(scope)
    if (!state) return Promise.resolve()
    return this.writes.then(() => {
      if (this.scope !== scope || state.ready) return
      state.error = ''; this.changed()
      state.loaded = this.read(scope, state)
      return state.loaded
    })
  }
  reconcile(labelIds: ReadonlySet<string>): void {
    const state = this.states.get(this.scope)
    if (!state?.ready) return
    const ids = state.value.labelIds.filter(id => labelIds.has(id))
    if (ids.length !== state.value.labelIds.length) void this.choose({ ...state.value, labelIds: ids })
  }
}
