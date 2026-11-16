import { loadConfirmNoteDeletion, saveConfirmNoteDeletion, loadSourceLineNumbers, saveSourceLineNumbers,
  loadDefaultNoteMode, saveDefaultNoteMode, type DefaultNoteMode, loadWebLinkOpening, saveWebLinkOpening, type WebLinkOpening } from './note-settings'

type SettingsStore = { get(key: string): Promise<unknown>; set(key: string, value: boolean | DefaultNoteMode | WebLinkOpening): Promise<void> }
type Preference<T> = { value: T; saved: T; ready: boolean; problem: string; revision: number }
export class NotePreferences {
  private confirmation: Preference<boolean> = { value: true, saved: true, ready: false, problem: '', revision: 0 }
  private numbers: Preference<boolean> = { value: true, saved: true, ready: false, problem: '', revision: 0 }
  private defaultMode: Preference<DefaultNoteMode> = { value: 'editing', saved: 'editing', ready: false, problem: '', revision: 0 }
  private webLinks: Preference<WebLinkOpening> = { value: 'external', saved: 'external', ready: false, problem: '', revision: 0 }
  private initialized = false
  private writes = Promise.resolve()
  private loading: Promise<void> | undefined
  constructor(private store: SettingsStore, private changed: () => void) {}
  initialize(): Promise<void> {
    if (this.loading) return this.loading
    let resolve!: () => void, reject!: (reason: unknown) => void
    this.loading = new Promise<void>((complete, fail) => { resolve = complete; reject = fail })
    void Promise.all([
      this.load(this.confirmation, () => loadConfirmNoteDeletion(this.store), 'Change note deletion confirmation to replace it.'),
      this.load(this.numbers, () => loadSourceLineNumbers(this.store), 'Change Source line numbers to replace it.'),
      this.load(this.defaultMode, () => loadDefaultNoteMode(this.store), 'Change default note mode to replace it.'),
      this.load(this.webLinks, () => loadWebLinkOpening(this.store), 'Change web link opening to replace it.')
    ]).then(() => { this.initialized = true; this.changed() }).then(resolve, reject)
    return this.loading
  }
  private async load<T>(preference: Preference<T>, read: () => Promise<T>, recovery: string) {
    try { preference.saved = preference.value = await read(); preference.ready = true }
    catch (error) { preference.problem = `${error instanceof Error ? error.message : String(error)} ${recovery}` }
    finally { this.changed() }
  }
  get view() {
    return { confirmDelete: this.confirmation.value, lineNumbers: this.numbers.value, defaultMode: this.defaultMode.value,
      webLinkOpening: this.webLinks.value, webLinksReady: this.webLinks.ready,
      initialized: this.initialized, ready: this.confirmation.ready && this.numbers.ready && this.defaultMode.ready,
      problem: [this.confirmation.problem, this.numbers.problem, this.defaultMode.problem, this.webLinks.problem].filter(Boolean).join(' ') }
  }
  private choose<T>(preference: Preference<T>, value: T, save: (store: SettingsStore, value: T) => Promise<void>): Promise<void> {
    if (!this.initialized) return this.initialize().then(() => this.choose(preference, value, save))
    preference.value = value
    const revision = ++preference.revision
    this.changed()
    this.writes = this.writes.then(async () => {
      try {
        await save(this.store, value)
        preference.saved = value; preference.ready = true; preference.problem = ''
      } catch (error) {
        preference.problem = error instanceof Error ? error.message : String(error)
        if (revision === preference.revision) preference.value = preference.saved
      }
      this.changed()
    })
    return this.writes
  }
  chooseConfirmDelete(value: boolean): Promise<void> {
    return this.choose(this.confirmation, value, saveConfirmNoteDeletion)
  }
  chooseLineNumbers(value: boolean): Promise<void> {
    return this.choose(this.numbers, value, saveSourceLineNumbers)
  }
  chooseDefaultMode(value: DefaultNoteMode): Promise<void> {
    return this.choose(this.defaultMode, value, saveDefaultNoteMode)
  }
  chooseWebLinkOpening(value: WebLinkOpening): Promise<void> {
    return this.choose(this.webLinks, value, saveWebLinkOpening)
  }
}
