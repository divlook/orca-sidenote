import { EditorState, Facet, StateEffect, StateField, Transaction, type Extension, type TransactionSpec } from '@codemirror/state'
import { history, invertedEffects, isolateHistory, redo, undo } from '@codemirror/commands'
import { applySourceChanges, canonicalSource, sourceLineStarts } from '../source-text'

// Exact source is history state, not a second document or a persistence format.
export const exactSource = StateEffect.define<string>()
export const sourceEOL = Facet.define<string, string>({ combine: values => values[0] ?? '\n' })
export function generatedEOL(raw: string): string {
  let breaks = 0, carriageReturns = 0
  for (let index = 0; index < raw.length; index++) {
    if (raw[index] === '\r') { breaks++; carriageReturns++; if (raw[index + 1] === '\n') index++ }
    else if (raw[index] === '\n') breaks++
  }
  return carriageReturns > breaks / 2 ? '\r\n' : '\n'
}
const lineCache = new WeakMap<EditorState, number[]>()
const transactionLines = new WeakMap<Transaction, number[]>()
function sourceLineIndex(starts: readonly number[], offset: number): number {
  let from = 0, to = starts.length
  while (from < to) {
    const middle = Math.floor((from + to) / 2)
    if (starts[middle] <= offset) from = middle + 1
    else to = middle
  }
  return from - 1
}
function spliceLineStarts(raw: string, starts: readonly number[], from: number, to: number, text: string): number[] {
  const first = Math.max(0, sourceLineIndex(starts, from) - 1)
  const suffix = Math.min(starts.length, sourceLineIndex(starts, to) + 2)
  const end = starts[suffix] ?? raw.length, beginning = starts[first]
  const local = sourceLineStarts(raw.slice(beginning, from) + text + raw.slice(to, end))
  const next = starts.slice(0, first), shift = text.length - (to - from)
  for (let index = 0; index < local.length - (suffix < starts.length ? 1 : 0); index++) next.push(beginning + local[index])
  for (let index = suffix; index < starts.length; index++) next.push(starts[index] + shift)
  return next
}
function lineStarts(state: EditorState): number[] {
  let starts = lineCache.get(state)
  if (!starts) { starts = sourceLineStarts(state.field(sourceField)); lineCache.set(state, starts) }
  return starts
}
export function rawPosition(state: EditorState, position: number): number {
  const line = state.doc.lineAt(position)
  return lineStarts(state)[line.number - 1] + position - line.from
}
export function sourceSlice(state: EditorState, from: number, to: number): string {
  return state.field(sourceField).slice(rawPosition(state, from), rawPosition(state, to))
}
export function documentPosition(state: EditorState, offset: number): number {
  const raw = state.field(sourceField)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > raw.length) throw new Error('Invalid source offset.')
  const starts = lineStarts(state)
  const line = sourceLineIndex(starts, offset)
  const position = state.doc.line(line + 1).from + offset - starts[line]
  if (position > state.doc.line(line + 1).to) throw new Error('Source offset is inside a line separator.')
  return position
}
// Use raw slices for explicit paste/drop and line operations; CM's Text has
// already normalized separators by the time a generic transaction arrives.
export function rawEdit(state: EditorState, edits: readonly { from: number; to: number; insert: string }[], extra: TransactionSpec = {}): TransactionSpec {
  const raw = applySourceChanges(state.field(sourceField), [...edits].sort((a, b) => b.from - a.from)
    .map(edit => ({ from: rawPosition(state, edit.from), to: rawPosition(state, edit.to), text: edit.insert })))
  return { ...extra, changes: edits.map(edit => ({ ...edit, insert: canonicalSource(edit.insert) })), effects: exactSource.of(raw) }
}
export const sourceField = StateField.define<string>({
  create: state => state.doc.toString(),
  update(raw, transaction) {
    const restoration = transaction.effects.findLast(effect => effect.is(exactSource))
    if (!transaction.docChanged && !restoration) return raw
    let updatedLines: number[] | undefined
    if (restoration) raw = restoration.value as string
    else if (transaction.docChanged) {
      const starts = lineStarts(transaction.startState)
      const eol = transaction.startState.facet(sourceEOL)
      const splices: { from: number; to: number; text: string }[] = []
      transaction.changes.iterChanges((from, to, _a, _b, inserted) => {
        const first = transaction.startState.doc.lineAt(from), last = transaction.startState.doc.lineAt(to)
        splices.push({ from: starts[first.number - 1] + from - first.from,
          to: starts[last.number - 1] + to - last.from, text: inserted.toString().replaceAll('\n', eol) })
      })
      updatedLines = starts
      for (let index = splices.length - 1; index >= 0; index--) {
        const splice = splices[index]
        updatedLines = spliceLineStarts(raw, updatedLines, splice.from, splice.to, splice.text)
        raw = raw.slice(0, splice.from) + splice.text + raw.slice(splice.to)
      }
    }
    if (canonicalSource(raw) !== transaction.newDoc.toString()) throw new Error('The editor source text could not be verified.')
    if (updatedLines) transactionLines.set(transaction, updatedLines)
    return raw
  }
})
export function sourceExtensions(raw: string): Extension {
  return [sourceField.init(() => raw), sourceEOL.of(generatedEOL(raw)), history(),
    invertedEffects.of(transaction => transaction.docChanged || transaction.effects.some(effect => effect.is(exactSource))
      ? [exactSource.of(transaction.startState.field(sourceField))] : []),
    // CM always merges plain compose events, even across isolateHistory. Preserve
    // the composition event family, but mark each transaction as a history start.
    EditorState.transactionFilter.of(transaction => transaction.annotation(Transaction.userEvent) === 'input.type.compose'
      ? [{ annotations: Transaction.userEvent.of('input.type.compose.start') }, transaction] : transaction),
    EditorState.transactionExtender.of(transaction => (transaction.docChanged || transaction.effects.some(effect => effect.is(exactSource))) && !transaction.isUserEvent('undo') && !transaction.isUserEvent('redo')
      ? { annotations: isolateHistory.of('full') } : null)]
}

export function acceptSourceTransaction(transaction: Transaction, writable: boolean): { state: EditorState; rejected: boolean; restoration?: Transaction } {
  // filter:false is public. Fail closed before inspecting a candidate whose
  // unisolated composition history could have joined an earlier accepted edit.
  if (transaction.annotation(Transaction.userEvent) === 'input.type.compose') throw new Error('The editor composition transaction was not isolated.')
  const previous = transaction.startState.field(sourceField)
  const candidate = transaction.state
  const updatedLines = transactionLines.get(transaction)
  if (updatedLines) lineCache.set(candidate, updatedLines)
  const sourceChanged = candidate.field(sourceField) !== previous
  if (!sourceChanged) {
    const cached = lineCache.get(transaction.startState)
    if (cached) lineCache.set(candidate, cached)
  }
  if (!sourceChanged || (writable && !transaction.startState.readOnly)) {
    return { state: candidate, rejected: false }
  }
  // Read-only-origin changes were never writable input. Do not enter their
  // history: public undo deliberately refuses a read-only state.
  if (transaction.startState.readOnly) return { state: transaction.startState, rejected: true }
  let restoration: Transaction | undefined
  const reverse = transaction.isUserEvent('undo') ? redo : undo
  if (!reverse({ state: candidate, dispatch: inverse => { restoration = inverse } }) || !restoration) {
    throw new Error('The editor could not restore the note after a rejected edit.')
  }
  const restored = (restoration as Transaction).state
  if (restored.field(sourceField) !== previous || restored.doc.toString() !== canonicalSource(previous)) {
    throw new Error('The editor could not restore the note after a rejected edit.')
  }
  return { state: restored, rejected: true, restoration }
}
