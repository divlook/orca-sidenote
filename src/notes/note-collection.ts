export type NoteRecord = Readonly<{ id: string; text: string }>
export type NoteCollection = Readonly<{ version: 2; notes: readonly NoteRecord[] }>
export const LEGACY_NOTE_ID = 'legacy'

export function collection(notes: readonly NoteRecord[]): NoteCollection {
  const seen = new Set<string>()
  return Object.freeze({ version: 2, notes: Object.freeze(notes.map(note => {
    if (!note || typeof note !== 'object' || Object.keys(note).length !== 2
      || typeof note.id !== 'string' || !note.id || typeof note.text !== 'string' || seen.has(note.id)) {
      throw new Error('The stored note collection contains an invalid or duplicate note.')
    }
    seen.add(note.id)
    return Object.freeze({ id: note.id, text: note.text })
  })) })
}

export function readCollection(value: unknown): NoteCollection {
  // Strings are always legacy Markdown, even when they look like JSON.
  if (typeof value === 'string') return collection([{ id: LEGACY_NOTE_ID, text: value }])
  if (value === null) return collection([])
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 2 || !('version' in value) || value.version !== 2
    || !('notes' in value) || !Array.isArray(value.notes)) throw new Error('The stored note collection cannot be read.')
  return collection(value.notes)
}

export async function readStoredCollection(store: { get(key: string): Promise<unknown>; keys(): Promise<string[]> }, key: string): Promise<NoteCollection | null> {
  const value = await store.get(key)
  if (value === null && (await store.keys()).includes(key)) throw new Error(`Stored note is null or disappeared during capture: ${key}`)
  return value === null ? null : readCollection(value)
}

export function sameCollection(a: NoteCollection, b: NoteCollection): boolean {
  return a.notes.length === b.notes.length && a.notes.every((note, i) => note.id === b.notes[i].id && note.text === b.notes[i].text)
}

export function editorKey(scopeKey: string, id: string): string { return JSON.stringify([scopeKey, id]) }
