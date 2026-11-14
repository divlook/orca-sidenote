export const SOURCE_LINE_NUMBERS_KEY = 'settings:source-line-numbers'
export const CONFIRM_NOTE_DELETION_KEY = 'settings:confirm-note-deletion'
export const DEFAULT_NOTE_MODE_KEY = 'settings:default-note-mode'
export type DefaultNoteMode = 'editing' | 'reading'

type Reader = { get(key: string): Promise<unknown> }
type Writer<T = boolean> = { set(key: string, value: T): Promise<void> }
async function loadBoolean(store: Reader, key: string, label: string): Promise<boolean> {
  const value = await store.get(key)
  if (value === null) return true
  if (typeof value !== 'boolean') throw new Error(`The stored ${label} setting cannot be read.`)
  return value
}
export function loadSourceLineNumbers(store: Reader): Promise<boolean> {
  return loadBoolean(store, SOURCE_LINE_NUMBERS_KEY, 'Source line-number')
}
export function loadConfirmNoteDeletion(store: Reader): Promise<boolean> {
  return loadBoolean(store, CONFIRM_NOTE_DELETION_KEY, 'note deletion confirmation')
}
export async function saveSourceLineNumbers(store: Writer, value: boolean): Promise<void> {
  if (typeof value !== 'boolean') throw new Error('Source line numbers must be On or Off.')
  await store.set(SOURCE_LINE_NUMBERS_KEY, value)
}
export async function saveConfirmNoteDeletion(store: Writer, value: boolean): Promise<void> {
  if (typeof value !== 'boolean') throw new Error('Note deletion confirmation must be On or Off.')
  await store.set(CONFIRM_NOTE_DELETION_KEY, value)
}
export async function loadDefaultNoteMode(store: Reader): Promise<DefaultNoteMode> {
  const value = await store.get(DEFAULT_NOTE_MODE_KEY)
  if (value === null) return 'editing'
  if (value !== 'editing' && value !== 'reading') throw new Error('The stored default note mode setting cannot be read.')
  return value
}
export async function saveDefaultNoteMode(store: Writer<DefaultNoteMode>, value: DefaultNoteMode): Promise<void> {
  if (value !== 'editing' && value !== 'reading') throw new Error('Default note mode must be Editing or Reading.')
  await store.set(DEFAULT_NOTE_MODE_KEY, value)
}
