import { DEFAULT_NOTE_LIMIT, loadNoteLimit, saveNoteLimit, validateNoteLimit, loadSourceLineNumbers, saveSourceLineNumbers, type NoteLimit } from './note-settings'

type SettingsStore = Parameters<typeof loadNoteLimit>[0] & Parameters<typeof saveNoteLimit>[0] & Parameters<typeof saveSourceLineNumbers>[0]

export class NotePreferences {
  private limit: NoteLimit = DEFAULT_NOTE_LIMIT
  private lineNumbers = true
  private savedLimit: NoteLimit = this.limit
  private savedNumbers = this.lineNumbers
  private limitLoaded = false
  private numbersLoaded = false
  private limitProblem = ''
  private numbersProblem = ''
  private limitRevision = 0
  private numbersRevision = 0
  private initialized = false
  private writes = Promise.resolve()
  readonly loaded: Promise<void>

  constructor(private store: SettingsStore, private changed: () => void) {
    this.loaded = Promise.allSettled([loadNoteLimit(store), loadSourceLineNumbers(store)]).then(([limitResult, numbersResult]) => {
      if (limitResult.status === 'fulfilled') { this.savedLimit = this.limit = limitResult.value; this.limitLoaded = true }
      else this.limitProblem = `${limitResult.reason instanceof Error ? limitResult.reason.message : String(limitResult.reason)} Choose a character limit to replace it.`
      if (numbersResult.status === 'fulfilled') { this.savedNumbers = this.lineNumbers = numbersResult.value; this.numbersLoaded = true }
      else this.numbersProblem = `${numbersResult.reason instanceof Error ? numbersResult.reason.message : String(numbersResult.reason)} Change Source line numbers to replace it.`
      this.initialized = true
      this.changed()
    })
  }

  get view() {
    return { limit: this.limit, lineNumbers: this.lineNumbers, ready: this.limitLoaded && this.numbersLoaded,
      problem: [this.limitProblem, this.numbersProblem].filter(Boolean).join(' ') }
  }

  chooseLimit(value: NoteLimit): Promise<void> {
    if (!this.initialized) return this.loaded.then(() => this.chooseLimit(value))
    if (!validateNoteLimit(value)) throw new Error('The note limit must be a positive whole number or No limit.')
    if (this.limitLoaded && value === this.limit && !this.limitProblem) { this.changed(); return Promise.resolve() }
    this.limit = value
    const revision = ++this.limitRevision
    this.changed()
    this.writes = this.writes.then(async () => {
      try {
        await saveNoteLimit(this.store, value)
        this.savedLimit = value
        this.limitLoaded = true
        this.limitProblem = ''
      } catch (error) {
        this.limitProblem = error instanceof Error ? error.message : String(error)
        if (revision === this.limitRevision) this.limit = this.savedLimit
      }
      this.changed()
    })
    return this.writes
  }

  chooseLineNumbers(value: boolean): Promise<void> {
    if (!this.initialized) return this.loaded.then(() => this.chooseLineNumbers(value))
    this.lineNumbers = value
    const revision = ++this.numbersRevision
    this.changed()
    this.writes = this.writes.then(async () => {
      try {
        await saveSourceLineNumbers(this.store, value)
        this.savedNumbers = value
        this.numbersLoaded = true
        this.numbersProblem = ''
      } catch (error) {
        this.numbersProblem = error instanceof Error ? error.message : String(error)
        if (revision === this.numbersRevision) this.lineNumbers = this.savedNumbers
      }
      this.changed()
    })
    return this.writes
  }
}
