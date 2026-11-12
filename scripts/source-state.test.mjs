import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const bundled = await build({ stdin: { contents: `export * from './src/source-state'; export * from './src/source-commands'; export {pasteSource,selectedSource} from './src/source-menu'; export {search,SearchQuery,setSearchQuery,openSearchPanel} from '@codemirror/search'; export {EditorState, EditorSelection, Transaction} from '@codemirror/state'; export {undo,redo} from '@codemirror/commands'`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' })
const { EditorState, EditorSelection, Transaction, sourceExtensions, sourceField, exactSource, documentPosition, rawPosition, acceptSourceTransaction, undo, redo, lineOperation, listEnter, insertLine, lineEndCursors, allOccurrences, nextOccurrence, occurrenceSession, pasteSource, selectedSource, search, SearchQuery, setSearchQuery, openSearchPanel } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))
function fixture(raw, readOnly = false) {
  let state = EditorState.create({ doc: raw, extensions: [sourceExtensions(raw), occurrenceSession, search(), EditorState.allowMultipleSelections.of(true), EditorState.readOnly.of(readOnly)] })
  let limit = null, writable = true
  let rejected = 0
  const dispatch = transaction => {
    const result = acceptSourceTransaction(transaction, limit, writable)
    state = result.state
    if (result.rejected) rejected++
    assert.equal(state.doc.toString(), state.field(sourceField).replace(/\r\n|\r/g, '\n'))
  }
  return { get state() { return state }, get raw() { return state.field(sourceField) }, get rejected() { return rejected },
    edit(spec) { dispatch(state.update(spec)) }, undo() { return undo({ state, dispatch }) }, redo() { return redo({ state, dispatch }) },
    command(command) { return command({ get state() { return state }, composing: false, dispatch(spec) { dispatch(spec instanceof Transaction ? spec : state.update(spec)) } }) },
    setLimit(value) { limit = value }, block() { writable = false } }
}
test('mixed separators Unicode multicursor splices and task offsets round-trip through history', () => {
  const initial = '😀 첫째\r\n- [ ] task\n끝\rfinal\r\n'
  const f = fixture(initial)
  for (let i = 0; i <= f.state.doc.length; i++) assert.equal(documentPosition(f.state, rawPosition(f.state, i)), i)
  const marker = initial.indexOf('[ ]') + 1
  const position = documentPosition(f.state, marker)
  f.edit({ changes: [{ from: 2, insert: '한' }, { from: position, to: position + 1, insert: 'x' }], userEvent: 'input' })
  const next = initial.slice(0, 2) + '한' + initial.slice(2, marker) + 'x' + initial.slice(marker + 1)
  assert.equal(f.raw, next)
  f.undo(); assert.equal(f.raw, initial)
  f.redo(); assert.equal(f.raw, next)
})
test('exact paste metadata preserves every separator and history inverse', () => {
  const f = fixture('a\r\nb\nc\r')
  const inserted = '😀\rZ\r\n한\n'
  const next = 'a' + inserted + '\r\nb\nc\r'
  f.edit({ changes: { from: 1, insert: inserted }, effects: exactSource.of(next), userEvent: 'input.paste' })
  assert.equal(f.raw, next)
  f.undo(); assert.equal(f.raw, 'a\r\nb\nc\r')
  f.redo(); assert.equal(f.raw, next)
})
test('oversized paste rollback isolates prior input and permits immediate input', () => {
  const f = fixture('a')
  f.setLimit(4)
  f.edit({ changes: { from: 1, insert: 'b' }, userEvent: 'input.type' })
  f.edit({ changes: { from: 2, insert: '12345' }, userEvent: 'input.paste' })
  assert.equal(f.raw, 'ab'); assert.equal(f.rejected, 1)
  f.edit({ changes: { from: 2, insert: 'c' }, userEvent: 'input.type' })
  f.undo(); assert.equal(f.raw, 'ab')
  f.undo(); assert.equal(f.raw, 'a')
})
test('rejected Undo and repeated Redo under lowered limits restore exact accepted history', () => {
  const f = fixture('long\r\n한😀')
  f.edit({ changes: { from: 0, to: f.state.doc.length, insert: 'x' }, userEvent: 'input' })
  f.setLimit(1)
  f.undo(); assert.equal(f.raw, 'x'); assert.equal(f.rejected, 1)
  f.setLimit(null); f.undo(); assert.equal(f.raw, 'long\r\n한😀')
  f.redo(); assert.equal(f.raw, 'x')
  f.edit({ changes: { from: 1, insert: '😀\n한' }, userEvent: 'input' })
  f.undo(); f.setLimit(1)
  f.redo(); assert.equal(f.raw, 'x')
  f.redo(); assert.equal(f.raw, 'x'); assert.equal(f.rejected, 3)
})
test('composition-annotated transactions remain isolated during rejected growth', () => {
  const f = fixture('')
  f.setLimit(2)
  f.edit({ changes: { from: 0, insert: 'ㅎ' }, userEvent: 'input.type.compose' })
  f.edit({ changes: { from: 0, to: 1, insert: '한' }, userEvent: 'input.type.compose' })
  f.edit({ changes: { from: 1, insert: '😀' }, userEvent: 'input.type.compose' })
  assert.equal(f.raw, '한')
  f.undo(); assert.equal(f.raw, 'ㅎ')
  f.undo(); assert.equal(f.raw, '')
})
test('captured writable candidate rolls back when readiness turns false', () => {
  const old = fixture('old\r\nnote')
  old.block()
  old.edit({ changes: { from: 0, insert: 'stale' }, userEvent: 'input' })
  assert.equal(old.raw, 'old\r\nnote')
})

test('effect-only source changes obey limits readiness and exact history', () => {
  const f = fixture('a\nb')
  f.edit({ effects: exactSource.of('a\r\nb'), userEvent: 'input' })
  assert.equal(f.raw, 'a\r\nb')
  f.undo(); assert.equal(f.raw, 'a\nb')
  f.redo(); assert.equal(f.raw, 'a\r\nb')
  f.undo(); f.setLimit(3)
  f.redo(); assert.equal(f.raw, 'a\nb')
  f.edit({ effects: exactSource.of('a\r\nb'), userEvent: 'input' })
  assert.equal(f.raw, 'a\nb')
  const blocked = fixture('a\nb', true)
  blocked.edit({ effects: exactSource.of('a\r\nb'), filter: false })
  blocked.edit({ changes: { from: 0, insert: 'x' }, filter: false })
  assert.equal(blocked.raw, 'a\nb')
  assert.equal(blocked.undo(), false)
})

test('unfiltered unisolated composition fails closed without changing accepted state', () => {
  const f = fixture('a')
  f.edit({ changes: { from: 1, insert: '한' }, userEvent: 'input.type.compose' })
  assert.throws(() => f.edit({ changes: { from: 2, insert: '😀' }, userEvent: 'input.type.compose', filter: false }), /not isolated/)
  assert.equal(f.raw, 'a한')
  f.undo(); assert.equal(f.raw, 'a')
})

test('line move copy and generated newline commands preserve raw slices and undo', () => {
  const initial = 'one\r\n한😀\nthird\rfour'
  const f = fixture(initial)
  f.edit({ selection: EditorSelection.range(4, 13) })
  f.command(lineOperation(-1, false))
  assert.equal(f.raw, '한😀\nthird\r\none\rfour')
  f.undo(); assert.equal(f.raw, initial)
  f.edit({ selection: EditorSelection.cursor(5) })
  f.command(lineOperation(1, true))
  assert.equal(f.raw, 'one\r\n한😀\r\n한😀\nthird\rfour')
  f.undo(); assert.equal(f.raw, initial)
  f.command(insertLine(true))
  assert.equal(f.raw, 'one\r\n\r\n한😀\nthird\rfour')
  assert.equal(f.state.selection.main.head, 4)
  f.undo(); assert.equal(f.raw, initial)
})

test('multicursor list tasks reset markers and preserve prior history', () => {
  const f = fixture('- [X] 한\r\n2. 😀\r\n')
  f.edit({ selection: EditorSelection.create([EditorSelection.cursor(7), EditorSelection.cursor(13)], 1) })
  assert.equal(f.command(listEnter), true)
  assert.equal(f.raw, '- [X] 한\r\n- [ ] \r\n2. 😀\r\n3. \r\n')
  assert.equal(f.state.selection.mainIndex, 1)
  f.undo(); assert.equal(f.raw, '- [X] 한\r\n2. 😀\r\n')
  f.command(insertLine(true))
  assert.equal(f.raw, '\r\n- [X] 한\r\n\r\n2. 😀\r\n')
  assert.deepEqual(f.state.selection.ranges.map(range => range.head), [0, 9])
  assert.equal(f.state.selection.mainIndex, 1)
  f.undo()
  f.command(lineEndCursors); assert.equal(f.state.selection.mainIndex, 1)
})

test('all occurrences starts from an empty word caret and line-end cursors cover selections', () => {
  const f = fixture('alpha alpha\nalpha alpha')
  f.edit({ selection: EditorSelection.cursor(2) })
  assert.equal(f.command(allOccurrences), true)
  assert.equal(f.state.selection.ranges.length, 4)
  f.edit({ selection: EditorSelection.range(0, f.state.doc.length) })
  f.command(lineEndCursors)
  assert.deepEqual(f.state.selection.ranges.map(range => range.head), [11, 23])
})

test('empty-caret occurrences are whole words while selected text may match substrings', () => {
  const f = fixture('alpha alphabet alpha')
  f.edit({ selection: EditorSelection.cursor(2) }); f.command(allOccurrences)
  assert.deepEqual(f.state.selection.ranges.map(range => range.from), [0, 15])
  f.edit({ selection: EditorSelection.range(0, 5) }); f.command(allOccurrences)
  assert.deepEqual(f.state.selection.ranges.map(range => range.from), [0, 6, 15])
})

test('initial CR-majority generated EOL survives paste changing the majority', () => {
  const f = fixture('a\rb\rc')
  f.command(view => pasteSource(view, 'one\ntwo\nthree\nfour\nfive\n'))
  f.edit({ changes: { from: f.state.doc.length, insert: '\nend' }, userEvent: 'input' })
  assert.equal(f.raw.endsWith('c\r\nend'), true)
  f.undo(); f.undo(); assert.equal(f.raw, 'a\rb\rc')
})

test('multicursor paste retains all cursors main index and subsequent input', () => {
  const f = fixture('a\r\nb')
  f.edit({ selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(3)], 1) })
  f.command(view => pasteSource(view, '한\r\n😀'))
  assert.equal(f.raw, 'a한\r\nb😀')
  assert.equal(f.state.selection.ranges.length, 2)
  assert.equal(f.state.selection.mainIndex, 1)
  f.edit({ ...f.state.replaceSelection('!'), userEvent: 'input' })
  assert.equal(f.raw, 'a한!\r\nb😀!')
  f.undo(); f.undo(); assert.equal(f.raw, 'a\r\nb')
})

test('linewise copy-paste inserts at line start and same-line cuts deduplicate', () => {
  const f = fixture('first\r\nsecond')
  f.edit({ selection: EditorSelection.cursor(2) })
  const copied = selectedSource(f.state)
  assert.equal(copied.linewise, true); assert.equal(copied.text, 'first\r\n')
  f.edit({ selection: EditorSelection.cursor(9) })
  f.command(view => pasteSource(view, copied.text, copied.linewise))
  assert.equal(f.raw, 'first\r\nfirst\r\nsecond')
  f.undo(); assert.equal(f.raw, 'first\r\nsecond')
  f.edit({ selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(3)]) })
  const cut = selectedSource(f.state)
  assert.deepEqual(cut.ranges, [{ from: 0, to: 6 }])
  f.edit({ changes: cut.ranges.map(range => ({ ...range, insert: '' })), userEvent: 'delete.cut' })
  assert.equal(f.raw, 'second')
  f.undo(); assert.equal(f.raw, 'first\r\nsecond')
})

test('linewise paste deduplicates same-line destinations without losing cursors', () => {
  const f = fixture('target\nlast')
  f.edit({ selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(4)], 1) })
  f.command(view => pasteSource(view, 'copied\r\n', true))
  assert.equal(f.raw, 'copied\r\ntarget\nlast')
  assert.deepEqual(f.state.selection.ranges.map(range => range.head), [8, 11])
  assert.equal(f.state.selection.mainIndex, 1)
  f.undo(); assert.equal(f.raw, 'target\nlast')
})

test('selected occurrences respect Find case and whole-word options while empty caret forces both', () => {
  const f = fixture('alpha ALPHA alphabet alpha')
  f.edit({ selection: EditorSelection.range(0, 5) }); f.command(allOccurrences)
  assert.deepEqual(f.state.selection.ranges.map(range => range.from), [0, 6, 12, 21])
  f.edit({ selection: EditorSelection.range(21, 26), effects: setSearchQuery.of(new SearchQuery({ search: 'alpha', wholeWord: true, caseSensitive: true })) })
  f.command(allOccurrences)
  assert.deepEqual(f.state.selection.ranges.map(range => range.from), [0, 21])
  assert.equal(f.state.selection.mainIndex, 1)
  f.edit({ selection: EditorSelection.cursor(2), effects: setSearchQuery.of(new SearchQuery({ search: 'alpha' })) })
  f.command(nextOccurrence); f.command(nextOccurrence)
  assert.deepEqual(f.state.selection.ranges.map(range => range.from), [0, 21])
})

test('visible Find regex selects matches even with an empty whitespace caret', () => {
  const f = fixture('aa  aaa  b')
  f.command(openSearchPanel)
  f.edit({ selection: EditorSelection.cursor(3), effects: setSearchQuery.of(new SearchQuery({ search: 'a+', regexp: true })) })
  f.command(allOccurrences)
  assert.deepEqual(f.state.selection.ranges.map(range => [range.from, range.to]), [[0, 2], [4, 7]])
})
