import { noteKey, parseNoteKey } from '../protocol'
import { collection, readCollection, sameCollection, type NoteCollection, type NoteRecord } from '../notes/note-collection'

// Archive limits are application resource bounds, not storage quotas.
export const ARCHIVE_BYTES = 16 * 1024 * 1024
export const ARCHIVE_RECORDS = 10000
export type ArchiveNote = Readonly<{ hostId: string | null; path: string; notes: readonly NoteRecord[] }>
export type NoteArchive = Readonly<{ format: 'orca-sidenote-notes'; version: 2;
  notes: readonly ArchiveNote[]; recoveryDrafts: readonly ArchiveNote[] }>
export type RestoreChoice = Readonly<{ key: string; source: 'notes' | 'recoveryDrafts'; replace: boolean }>
export type RestoreItem = Readonly<{ key: string; note: ArchiveNote; before: NoteCollection | null;
  action: 'create' | 'identical' | 'conflict' | 'replace'; dirty: boolean }>
export type RestorePlan = Readonly<{ items: readonly RestoreItem[]; protection: NoteArchive }>

function fields(value: unknown, names: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== names.length || names.some(name => !Object.hasOwn(value, name))) {
    throw new Error('The backup has an invalid or unknown field.')
  }
}
export function archive(notes: readonly ArchiveNote[], recoveryDrafts: readonly ArchiveNote[]): NoteArchive {
  return validateArchive({ format: 'orca-sidenote-notes', version: 2, notes, recoveryDrafts })
}
export function validateArchive(value: unknown): NoteArchive {
  fields(value, ['format', 'version', 'notes', 'recoveryDrafts'])
  if (value.format !== 'orca-sidenote-notes' || (value.version !== 1 && value.version !== 2)) throw new Error('Unsupported notes backup format or version.')
  if (!Array.isArray(value.notes) || !Array.isArray(value.recoveryDrafts)
    || value.notes.length + value.recoveryDrafts.length > ARCHIVE_RECORDS) throw new Error('Backup exceeds the 10,000 candidate limit or has invalid lists.')
  const version = value.version
  let count = 0
  const lists = [value.notes, value.recoveryDrafts].map(list => {
    const seen = new Set<string>()
    return Object.freeze(list.map(value => {
      fields(value, ['hostId', 'path', version === 1 ? 'text' : 'notes'])
      if ((value.hostId !== null && typeof value.hostId !== 'string') || typeof value.path !== 'string' || !value.path) {
        throw new Error('Invalid note identity. Note paths must be nonempty strings.')
      }
      if (version === 1 && typeof value.text !== 'string') throw new Error('Invalid legacy note text.')
      if (version === 2 && !Array.isArray(value.notes)) throw new Error('Invalid note collection.')
      const notes = version === 1 ? readCollection(value.text).notes : collection(value.notes as NoteRecord[]).notes
      count += Math.max(1, notes.length)
      if (count > ARCHIVE_RECORDS) throw new Error('Backup exceeds the 10,000 note candidate limit.')
      const note = Object.freeze({ hostId: value.hostId as string | null, path: value.path, notes })
      const key = noteKey(note)
      if (seen.has(key)) throw new Error('Duplicate note identity within a backup list.')
      seen.add(key)
      return note
    }))
  })
  return Object.freeze({ format: 'orca-sidenote-notes', version: 2, notes: lists[0], recoveryDrafts: lists[1] })
}
export function encodeArchive(value: NoteArchive): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(validateArchive(value), null, 2))
  if (bytes.byteLength > ARCHIVE_BYTES) throw new Error('Backup exceeds the 16 MiB archive limit. Nothing was truncated.')
  return bytes
}
export function decodeArchive(bytes: Uint8Array): NoteArchive {
  if (bytes.byteLength > ARCHIVE_BYTES) throw new Error('Backup exceeds the 16 MiB archive limit.')
  return validateArchive(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
}

export function planRestore(value: NoteArchive, choices: readonly RestoreChoice[], states: ReadonlyMap<string, NoteCollection | null>,
  drafts: readonly ArchiveNote[]): RestorePlan {
  const seen = new Set<string>()
  const candidates = {
    notes: new Map(value.notes.map(note => [noteKey(note), note])),
    recoveryDrafts: new Map(value.recoveryDrafts.map(note => [noteKey(note), note]))
  }
  const dirtyKeys = new Set(drafts.map(noteKey))
  const items = choices.map(choice => {
    if (seen.has(choice.key)) throw new Error('Select only one candidate for each identity.')
    seen.add(choice.key)
    const note = candidates[choice.source]?.get(choice.key)
    if (!note || !states.has(choice.key)) throw new Error('Unknown restore candidate.')
    const before = states.get(choice.key)!
    const dirty = dirtyKeys.has(choice.key)
    const action = before !== null && sameCollection(before, collection(note.notes)) && !dirty ? 'identical'
      : before === null && !dirty ? 'create' : choice.replace ? 'replace' : 'conflict'
    return Object.freeze({ key: choice.key, note, before, dirty, action })
  })
  const originals = items.filter(item => item.action === 'replace' && item.before !== null)
    .map(item => ({ ...parseNoteKey(item.key), notes: item.before!.notes }))
  return Object.freeze({ items: Object.freeze(items), protection: archive(originals, drafts) })
}
