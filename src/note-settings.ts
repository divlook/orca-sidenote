export type NoteLimit = number | null

export const DEFAULT_NOTE_LIMIT = 8000
export const NOTE_LIMIT_KEY = 'settings:note-character-limit'
export const SOURCE_LINE_NUMBERS_KEY = 'settings:source-line-numbers'

export async function loadSourceLineNumbers(store: { get(key: string): Promise<unknown> }): Promise<boolean> {
  const stored = await store.get(SOURCE_LINE_NUMBERS_KEY)
  if (stored === null) return true
  if (typeof stored !== 'boolean') throw new Error('The stored Source line-number setting cannot be read.')
  return stored
}

export async function saveSourceLineNumbers(store: { set(key: string, value: boolean): Promise<void> }, visible: boolean): Promise<void> {
  if (typeof visible !== 'boolean') throw new Error('Source line numbers must be On or Off.')
  await store.set(SOURCE_LINE_NUMBERS_KEY, visible)
}

export function validateNoteLimit(value: unknown): value is NoteLimit {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
}

export async function loadNoteLimit(store: { get(key: string): Promise<unknown> }): Promise<NoteLimit> {
  const stored = await store.get(NOTE_LIMIT_KEY)
  if (stored === null) return DEFAULT_NOTE_LIMIT
  if (typeof stored !== 'object' || Array.isArray(stored) ||
      !('characterLimit' in stored) || !validateNoteLimit(stored.characterLimit)) {
    throw new Error('The stored note limit cannot be read.')
  }
  return stored.characterLimit
}

export async function saveNoteLimit(
  store: { set(key: string, value: { characterLimit: NoteLimit }): Promise<void> }, limit: NoteLimit
): Promise<void> {
  if (!validateNoteLimit(limit)) throw new Error('The note limit must be a positive whole number or No limit.')
  await store.set(NOTE_LIMIT_KEY, { characterLimit: limit })
}

export function allowsNoteChange(previous: string, next: string, limit: NoteLimit): boolean {
  return limit === null || next.length <= limit || next.length <= previous.length
}
