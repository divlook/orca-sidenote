import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/editor/browser/coreCommands.js'
import 'monaco-editor/editor/contrib/tokenization/browser/tokenization.js'
import '../node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css'
import '../node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css'
import 'monaco-editor/editor/contrib/find/browser/findController.js'
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard.js'
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js'
import 'monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js'
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations.js'
import 'monaco-editor/editor/contrib/multicursor/browser/multicursor.js'
import { conf, language } from 'monaco-editor/languages/definitions/markdown/markdown.js'
import { allowsNoteChange, DEFAULT_NOTE_LIMIT, type NoteLimit } from './note-settings'
import { EDITOR_WORKER_READY } from './protocol'
import { markdownListItemLines } from './markdown-list'
import type { TaskMarker } from './markdown-tasks'
import { applySourceChanges, canonicalSource, sourceLineStarts } from './source-text'

monaco.languages.register({ id: 'markdown' })
monaco.languages.setLanguageConfiguration('markdown', conf)
monaco.languages.setMonarchTokensProvider('markdown', language)

export interface SourceEditor {
  sync(key: string, text: string, ready: boolean, limit: NoteLimit, epoch: number, invalidations?: ReadonlyMap<string, number>): void
  setLineNumbers(visible: boolean): void
  toggleTask(key: string, text: string, marker: TaskMarker, epoch: number): boolean
  show(focus: boolean): void
  theme(): void
  dispose(): void
}
export async function createSourceEditor(container: HTMLElement, changed: (key: string, text: string) => void,
  failed: (error: unknown) => void, limited: () => void): Promise<SourceEditor> {
  const workers = new Set<Worker>()
  function startWorker(): Promise<Worker> {
    const { promise, resolve, reject } = Promise.withResolvers<Worker>()
    const worker = new Worker(new URL('./editor.worker.js', import.meta.url), { type: 'module', name: 'sidenote-editor' })
    workers.add(worker)
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('The local editor worker did not start.')) }, 10000)
    worker.addEventListener('error', event => {
      clearTimeout(timer)
      const error = new Error(`The local editor worker failed: ${event.message || 'Unable to load worker assets.'}`)
      reject(error)
      failed(error)
    })
    worker.addEventListener('message', function ready(event) {
      if (event.data?.type !== EDITOR_WORKER_READY) return
      clearTimeout(timer)
      worker.removeEventListener('message', ready)
      resolve(worker)
    })
    return promise
  }
  let firstWorker: Worker | undefined = await startWorker()
  globalThis.MonacoEnvironment = { getWorker: () => {
    if (firstWorker) { const worker = firstWorker; firstWorker = undefined; return worker }
    return startWorker().catch(error => { failed(error); throw error })
  } }
  const editor = monaco.editor.create(container, {
    model: null, readOnly: true, ariaLabel: 'Note source', minimap: { enabled: false },
    wordWrap: 'on', lineNumbers: 'on', scrollBeyondLastLine: false, fontSize: 13,
    lineNumbersMinChars: 2, folding: false, automaticLayout: false,
    padding: { top: 12, bottom: 12 }, quickSuggestions: false,
    unicodeHighlight: { ambiguousCharacters: false }, renderLineHighlight: 'none'
  })
  type Entry = { model: monaco.editor.ITextModel; view: monaco.editor.ICodeEditorViewState | null }
  const entries = new Map<string, Entry>()
  let key = ''
  let restoring = false
  let enabled = false
  let limit: NoteLimit = DEFAULT_NOTE_LIMIT
  let epoch = 0
  let lineNumbers = true
  let revision = 0
  const invalidated = new Map<string, number>()
  function theme() {
    const style = getComputedStyle(document.documentElement)
    const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
    const dark = document.documentElement.classList.contains('dark')
    const background = color('--orca-background', dark ? '#1e1e1e' : '#ffffff')
    const foreground = color('--orca-foreground', dark ? '#d4d4d4' : '#333333')
    // Monaco's inherited comment palette is not paired with the host canvas.
    const comment = dark ? '#608b4e' : '#008000'
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    const sample = (value?: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = background
      context.fillRect(0, 0, 1, 1)
      if (value) {
        context.fillStyle = value
        context.fillRect(0, 0, 1, 1)
      }
      return context.getImageData(0, 0, 1, 1).data
    }
    const luminance = (rgb: Uint8ClampedArray) => {
      return [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
        const channel = rgb[index] / 255
        return sum + weight * (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
      }, 0)
    }
    const bg = luminance(sample())
    const contrast = (value: string) => {
      const fg = luminance(sample(value))
      return (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05)
    }
    const rules: monaco.editor.ITokenThemeRule[] = []
    if (sample()[3] === 255 && contrast(comment) < 4.5 && contrast(foreground) > contrast(comment)) {
      const rgb = sample(foreground)
      rules.push({ token: 'comment', foreground: [...rgb.slice(0, 3)].map(channel => channel.toString(16).padStart(2, '0')).join('') })
    }
    monaco.editor.defineTheme('sidenote', { base: dark ? 'vs-dark' : 'vs', inherit: true, rules, colors: {
      'editor.background': background,
      'editor.foreground': foreground,
      'editorLineNumber.foreground': color('--orca-muted-foreground', '#888888'),
      'editorWidget.background': color('--orca-popover', dark ? '#252526' : '#f3f3f3'),
      'editorWidget.foreground': color('--orca-popover-foreground', dark ? '#d4d4d4' : '#333333'),
      'editorWidget.border': color('--orca-border', '#888888')
    } })
    monaco.editor.setTheme('sidenote')
  }
  theme()
  const observer = new ResizeObserver(() => { if (!container.hidden) editor.layout() })
  observer.observe(container)
  editor.onKeyDown(event => {
    if (!enabled || event.keyCode !== monaco.KeyCode.Enter || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.browserEvent.isComposing) return
    const model = editor.getModel()
    const selections = editor.getSelections()
    if (!model || !selections?.length || selections.some(selection => !selection.isEmpty())) return
    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = []
    const lines = new Set<number>()
    let itemLines: Set<number> | undefined
    for (const selection of selections) {
      const lineNumber = selection.positionLineNumber
      if (lines.has(lineNumber)) return
      lines.add(lineNumber)
      const line = model.getLineContent(lineNumber)
      const item = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(?:\[([ xX])\]([ \t]+|$))?/.exec(line)
      if (!item || selection.positionColumn <= item[0].length) return
      itemLines ??= markdownListItemLines(model.getValue())
      if (!itemLines.has(lineNumber)) return
      if (!line.slice(item[0].length).trim()) {
        const indent = item[1].replace(/(?:\t| {1,4})$/, '')
        edits.push({ range: new monaco.Range(lineNumber, 1, lineNumber, line.length + 1), text: indent })
      } else {
        const ordered = /^(\d+)([.)])$/.exec(item[2])
        const marker = ordered ? `${Math.min(Number(ordered[1]) + 1, 999999999)}${ordered[2]}` : item[2]
        const prefix = `${item[1]}${marker}${item[3]}${item[4] === undefined ? '' : '[ ] '}`
        edits.push({ range: selection, text: model.getEOL() + prefix })
      }
    }
    event.preventDefault()
    event.stopPropagation()
    editor.pushUndoStop()
    editor.executeEdits('markdown-list-enter', edits)
    editor.pushUndoStop()
  })
  return {
    sync(nextKey: string, text: string, ready: boolean, nextLimit: NoteLimit, nextEpoch: number, invalidations?: ReadonlyMap<string, number>) {
      for (const [changedKey, version] of invalidations ?? []) {
        if (invalidated.get(changedKey) === version) continue
        invalidated.set(changedKey, version)
        const entry = entries.get(changedKey)
        if (entry) {
          revision++
          if (key === changedKey) { editor.setModel(null); key = '' }
          entry.model.dispose()
          entries.delete(changedKey)
        }
      }
      if (epoch !== nextEpoch) {
        revision++
        editor.setModel(null)
        for (const entry of entries.values()) entry.model.dispose()
        entries.clear()
        key = ''
        epoch = nextEpoch
      }
      if (nextKey !== key || enabled !== ready) revision++
      limit = nextLimit
      enabled = ready
      editor.updateOptions({ readOnly: !ready })
      if (nextKey !== key && key) {
        entries.get(key)!.view = editor.saveViewState()
        editor.setModel(null)
        key = ''
      }
      if (!ready || nextKey === key) return
      let entry = entries.get(nextKey)
      if (!entry) {
        const model = monaco.editor.createModel(text, 'markdown')
        entry = { model, view: null }
        entries.set(nextKey, entry)
        let acceptedText = text
        let sourceText = text
        const sourceVersions = new Map([[model.getAlternativeVersionId(), text]])
        model.onDidChangeContent(event => {
          if (restoring) return
          const version = model.getAlternativeVersionId()
          let nextText: string
          try {
            nextText = ((event.isUndoing || event.isRedoing) ? sourceVersions.get(version) : undefined)
              ?? applySourceChanges(sourceText, event.changes)
            if (canonicalSource(nextText) !== model.getValue(monaco.editor.EndOfLinePreference.LF)) {
              throw new Error('The editor source text could not be verified.')
            }
          } catch (error) { failed(error); return }
          sourceText = nextText
          sourceVersions.set(version, nextText)
          const editRevision = revision
          // Finish the current Monaco edit transaction before touching its undo stack.
          queueMicrotask(() => {
            if (model.isDisposed()) return
            const stale = !enabled || key !== nextKey || editRevision !== revision
            if (stale || !allowsNoteChange(acceptedText, nextText, limit)) {
              restoring = true
              try {
                if (event.isUndoing) model.redo()
                else model.undo()
                sourceText = acceptedText
                if (model.getValue(monaco.editor.EndOfLinePreference.LF) !== canonicalSource(acceptedText)) {
                  throw new Error('The editor could not restore the note after a rejected edit.')
                }
              } catch (error) { failed(error) } finally { restoring = false }
              if (!stale) limited()
              return
            }
            acceptedText = nextText
            // Isolate each input transaction so rejecting a later paste cannot undo earlier typing.
            if (!event.isUndoing && !event.isRedoing) model.pushStackElement()
            changed(nextKey, acceptedText)
          })
        })
      }
      key = nextKey
      editor.setModel(entry.model)
      if (entry.view) editor.restoreViewState(entry.view)
    },
    setLineNumbers(visible: boolean) {
      if (visible === lineNumbers) return
      lineNumbers = visible
      editor.updateOptions({ lineNumbers: visible ? 'on' : 'off' })
    },
    toggleTask(expectedKey, text, marker, expectedEpoch) {
      const model = editor.getModel()
      if (!enabled || expectedKey !== key || expectedEpoch !== epoch || !model
        || model.getValue(monaco.editor.EndOfLinePreference.LF) !== canonicalSource(text)
        || text[marker.offset] !== marker.marker || text[marker.offset - 1] !== '[' || text[marker.offset + 1] !== ']') return false
      const starts = sourceLineStarts(text)
      let line = 0
      while (line + 1 < starts.length && starts[line + 1] <= marker.offset) line++
      const column = marker.offset - starts[line] + 1
      const view = editor.saveViewState()
      editor.pushUndoStop()
      const applied = editor.executeEdits('preview-task', [{
        range: new monaco.Range(line + 1, column, line + 1, column + 1),
        text: marker.marker === ' ' ? 'x' : ' '
      }])
      editor.pushUndoStop()
      if (view) editor.restoreViewState(view)
      return applied
    },
    show(focus: boolean) { editor.layout(); if (focus && enabled) editor.focus() },
    theme,
    dispose() {
      observer.disconnect()
      editor.dispose()
      for (const entry of entries.values()) entry.model.dispose()
      for (const worker of workers) worker.terminate()
    }
  }
}

