/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { archive, decodeArchive, encodeArchive, planRestore, ARCHIVE_BYTES } from './note-archive'
import { collection, editorKey, readCollection } from '../notes/note-collection'
import { NoteSession, type NoteStore } from '../notes/session'
import { noteKey } from '../protocol'
import { NotesTransfer } from './notes-transfer'

const first = { hostId: null, path: '/Case/é\\"\u0000',
  notes: [{ id: 'legacy', text: '"quotes" \\ slash\r\n한글😀\u0000 {"literal":true}\n\ud800' }, { id: 'second', text: '' }] }
const second = { hostId: 'local', path: first.path, notes: [{ id: 'legacy', text: '' }] }
function fixture(initial: [string, unknown][] = []) {
  const values = new Map(initial), writes: string[] = []
  const store: NoteStore = { get: async key => values.get(key) ?? null,
    keys: async () => [...values.keys()], delete: async key => { values.delete(key) },
    set: async (key, value) => { writes.push(key); values.set(key, value) } }
  const session = new NoteSession(store, () => {})
  return { values, writes, store, session, notesTransfer: new NotesTransfer(session) }
}

test('v2 backup preserves IDs, order, empty cards, exact text and legacy v1 imports as one note', () => {
  const expected = { format: 'orca-sidenote-notes', version: 2, notes: [first, second],
    recoveryDrafts: [{ ...first, notes: [] }] }
  assert.deepEqual(decodeArchive(encodeArchive(archive(expected.notes, expected.recoveryDrafts))), expected)
  const fixture = '{"format":"orca-sidenote-notes","version":2,"notes":[{"hostId":null,"path":"/fixture","notes":[{"id":"n","text":"line\\r\\nnext"}]}],"recoveryDrafts":[]}'
  const independentlyAuthored = { format: 'orca-sidenote-notes', version: 2, notes: [
    { hostId: null, path: '/fixture', notes: [{ id: 'n', text: 'line\r\nnext' }] }
  ], recoveryDrafts: [] }
  assert.deepEqual(decodeArchive(new TextEncoder().encode(fixture)), independentlyAuthored)
  assert.deepEqual(JSON.parse(new TextDecoder().decode(encodeArchive(archive(independentlyAuthored.notes, [])))), JSON.parse(fixture))
  for (const text of ['', 'one\n---\ntwo', '{"version":2,"notes":[]}']) {
    const value = decodeArchive(new TextEncoder().encode(JSON.stringify({
      format: 'orca-sidenote-notes', version: 1, notes: [{ hostId: null, path: '/legacy', text }], recoveryDrafts: []
    })))
    assert.deepEqual(value.notes[0].notes, [{ id: 'legacy', text }])
    assert.equal(value.version, 2)
  }
})

test('whole archive rejects unknown fields, duplicate scopes or IDs, versions, UTF8 and sizes', () => {
  for (const value of [{ ...archive([], []), version: 3 }, { ...archive([], []), settings: {} },
    { ...archive([], []), notes: [first, first] },
    { ...archive([], []), notes: [{ ...first, notes: [{ id: 'a', text: 4 }] }] },
    { ...archive([], []), notes: [{ ...first, notes: [{ id: 'a', text: '' }, { id: 'a', text: '' }] }] },
    { ...archive([], []), notes: [{ ...first, notes: [{ id: '', text: '' }] }] }]) {
    assert.throws(() => decodeArchive(new TextEncoder().encode(JSON.stringify(value))))
  }
  assert.throws(() => decodeArchive(new Uint8Array([0xff])))
  assert.throws(() => decodeArchive(new Uint8Array(ARCHIVE_BYTES + 1)))
})

test('capture drains saves, gates edits, and retains failed full collections including empty clears', async () => {
  const a = noteKey(first), b = noteKey(second)
  const { store, values } = fixture([[a, 'old'], [b, 'old two'], ['settings:v1', 'keep']])
  const release = Promise.withResolvers<void>()
  let pending = true
  const session = new NoteSession({ ...store, set: async () => {
    if (pending) { pending = false; await release.promise }
    throw new Error('disk failed')
  } }, () => {})
  const transfer = new NotesTransfer(session)
  await session.follow(async () => first)
  const save = session.save('failed new', session.view.notes[0].key)
  const begin = transfer.beginTransfer()
  assert.equal(session.view.ready, false)
  await session.createNote()
  release.resolve(); await save; await begin
  await transfer.finishTransfer()
  await session.follow(async () => second); await session.save('', session.view.notes[0].key)
  await session.follow(async () => ({ hostId: 'server', path: '/new' })); await session.createNote()
  await transfer.beginTransfer()
  const value = await transfer.captureBackup()
  assert.equal(value.notes.length, 2)
  assert.deepEqual(value.recoveryDrafts.map(scope => scope.notes.map(note => note.text)), [['failed new'], [''], ['']])
  assert.equal(values.get(a), 'old')
  await transfer.finishTransfer()
})

test('scope conflicts protect complete originals and cancellation blocks replacement without touching settings', async () => {
  const key = noteKey(first)
  const { session, notesTransfer: transfer, values, writes } = fixture([[key, 'original'],
    [noteKey(second), 'unrelated'], ['settings:v1', 'keep']])
  await transfer.beginTransfer()
  const value = archive([first], [])
  let plan = await transfer.previewRestore(value, [{ key, source: 'notes', replace: false }])
  assert.equal(plan.items[0].action, 'conflict')
  await transfer.commitRestore(plan, false); assert.equal(writes.length, 0)
  plan = await transfer.previewRestore(value, [{ key, source: 'notes', replace: true }])
  assert.deepEqual(plan.protection.notes[0].notes, [{ id: 'legacy', text: 'original' }])
  transfer.protectRestore(plan, 'cancelled')
  await assert.rejects(() => transfer.commitRestore(plan, true))
  transfer.protectRestore(plan, 'saved')
  await transfer.commitRestore(plan, true)
  assert.deepEqual(values.get(key), { version: 2, notes: first.notes })
  assert.equal(values.get(noteKey(second)), 'unrelated')
  assert.equal(values.get('settings:v1'), 'keep')
  assert.equal(session.view.invalidations.has(editorKey(key, 'legacy')), true)
  await transfer.finishTransfer()
})

test('corrupt, null, changed or oversized destinations fail without writes', async () => {
  const key = noteKey(first), choices = [{ key, source: 'notes' as const, replace: true }]
  const { notesTransfer: transfer, values, writes } = fixture([[key, { corrupt: true }]])
  await transfer.beginTransfer()
  await assert.rejects(() => transfer.captureBackup())
  await assert.rejects(() => transfer.previewRestore(archive([first], []), choices))
  values.set(key, null)
  await assert.rejects(() => transfer.previewRestore(archive([first], []), choices))
  values.delete(key)
  await assert.rejects(() => transfer.previewRestore(archive([{ ...first, notes: [{ id: 'large', text: 'x'.repeat(262144) }] }], []), choices))
  const plan = await transfer.previewRestore(archive([first], []), choices)
  values.set(key, 'other panel')
  await assert.rejects(() => transfer.commitRestore(plan, false))
  assert.equal(writes.length, 0)
  await transfer.finishTransfer()
})

test('middle failure returns applied, unknown and unattempted scopes; retry skips identical and allows long notes', async () => {
  const third = { hostId: 'server', path: '/third', notes: [{ id: 'long', text: 'z'.repeat(12000) }] }
  const notes = [first, second, third]
  const { store, values } = fixture()
  let fail = true
  const session = new NoteSession({ ...store, set: async (key, value) => {
    if (key === noteKey(second) && fail) throw new Error('timeout')
    await store.set(key, value)
  } }, () => {})
  const transfer = new NotesTransfer(session)
  await transfer.beginTransfer()
  const choices = notes.map(note => ({ key: noteKey(note), source: 'notes' as const, replace: false }))
  let plan = await transfer.previewRestore(archive(notes, []), choices)
  const result = await transfer.commitRestore(plan, false)
  assert.deepEqual(result.applied, [noteKey(first)])
  assert.equal(result.outcomeUnknown, noteKey(second))
  assert.deepEqual(result.unattempted, [noteKey(third)])
  fail = false
  plan = await transfer.previewRestore(archive(notes, []), choices)
  assert.equal(plan.items[0].action, 'identical')
  await transfer.commitRestore(plan, false); await transfer.finishTransfer()
  await session.follow(async () => third)
  await session.save('z'.repeat(13000), session.view.notes[0].key)
  assert.equal(readCollection(values.get(noteKey(third))).notes[0].text.length, 13000)
})

test('duplicate candidates never last-win, empty collection differs from absence, and order is significant', () => {
  const key = noteKey(first), value = archive([first], [{ ...first, notes: [] }])
  assert.throws(() => planRestore(value, [{ key, source: 'notes', replace: false },
    { key, source: 'recoveryDrafts', replace: false }], new Map([[key, null]]), []))
  const empty = archive([{ ...first, notes: [] }], [])
  const choices = [{ key, source: 'notes' as const, replace: false }]
  assert.equal(planRestore(empty, choices, new Map([[key, collection([])]]), []).items[0].action, 'identical')
  assert.equal(planRestore(empty, choices, new Map([[key, null]]), []).items[0].action, 'create')
  assert.equal(planRestore(archive([first], []), choices,
    new Map([[key, collection([...first.notes].reverse())]]), []).items[0].action, 'conflict')
})

test('transfer invalidates late loads and resumes the latest requested focus', async () => {
  const key = noteKey(first), old = Promise.withResolvers<unknown>(), started = Promise.withResolvers<void>()
  const { store } = fixture()
  let blocked = true
  const session = new NoteSession({ ...store, get: async requested => {
    if (requested === key && blocked) { blocked = false; started.resolve(); return old.promise }
    return store.get(requested)
  } }, () => {})
  const transfer = new NotesTransfer(session), loading = session.follow(async () => first)
  await started.promise; await transfer.beginTransfer()
  const plan = await transfer.previewRestore(archive([first], []), [{ key, source: 'notes', replace: false }])
  await transfer.commitRestore(plan, false)
  old.resolve('late stale'); await loading
  await session.follow(async () => second); await transfer.finishTransfer()
  assert.equal(session.view.scopeKey, noteKey(second))
  assert.equal(session.view.notes.length, 0)
  await session.follow(async () => first)
  assert.deepEqual(session.view.notes.map(({ id, text }) => ({ id, text })), first.notes)
})

test('dirty replacement protects empty clears and stop leaves subsequent collections untouched', async () => {
  const key = noteKey(first), { store } = fixture([[key, 'original']])
  const gate = Promise.withResolvers<void>(), started = Promise.withResolvers<void>()
  let restoring = false
  const session = new NoteSession({ ...store, set: async (key, value) => {
    if (!restoring) throw new Error('save failed')
    started.resolve(); await gate.promise; await store.set(key, value)
  } }, () => {})
  const transfer = new NotesTransfer(session)
  await session.follow(async () => first); await session.save('', session.view.notes[0].key)
  await transfer.beginTransfer()
  const plan = await transfer.previewRestore(archive([first, second], []),
    [{ key, source: 'notes', replace: true }, { key: noteKey(second), source: 'notes', replace: false }])
  assert.equal(plan.protection.recoveryDrafts[0].notes[0].text, '')
  await assert.rejects(() => transfer.commitRestore(plan, true))
  transfer.protectRestore(plan, 'saved'); restoring = true
  const committing = transfer.commitRestore(plan, true)
  await started.promise; transfer.stopRestore(); gate.resolve()
  const result = await committing
  assert.deepEqual(result.applied, [key])
  assert.deepEqual(result.unattempted, [noteKey(second)])
  await transfer.finishTransfer()
})

test('quota preflight counts envelopes, serialized escapes, settings, keys and exact long identities', async () => {
  const key = noteKey(first), choices = [{ key, source: 'notes' as const, replace: false }]
  for (const text of ['"'.repeat(131072), '\u0000'.repeat(43691)]) {
    const { notesTransfer: transfer, writes } = fixture()
    await transfer.beginTransfer()
    await assert.rejects(() => transfer.previewRestore(archive([{ ...first, notes: [{ id: 'a', text }] }], []), choices))
    assert.equal(writes.length, 0); await transfer.finishTransfer()
  }
  for (const initial of [Array.from({ length: 1024 }, (_, i): [string, unknown] => [`setting:${i}`, null]),
    [['settings', 'x'.repeat(5242800)]] as [string, unknown][]]) {
    const { notesTransfer: transfer, writes } = fixture(initial)
    await transfer.beginTransfer()
    await assert.rejects(() => transfer.previewRestore(archive([first], []), choices))
    assert.equal(writes.length, 0); await transfer.finishTransfer()
  }
  const long = { ...first, path: '/'.repeat(40000) }
  assert.equal(decodeArchive(encodeArchive(archive([long], []))).notes[0].path, long.path)
  const { notesTransfer: transfer } = fixture()
  await transfer.beginTransfer()
  await assert.rejects(() => transfer.previewRestore(archive([long], []),
    [{ key: noteKey(long), source: 'notes', replace: false }]))
  await transfer.finishTransfer()
})

test('write-then-reject refreshes clean cards on retry or close and invalidates only changed IDs', async () => {
  for (const retry of [true, false]) {
    const key = noteKey(first), before = collection([{ id: 'legacy', text: 'old' }, first.notes[1]])
    const { store, values } = fixture([[key, before]])
    let reject = true
    const session = new NoteSession({ ...store, set: async (key, value) => {
      await store.set(key, value)
      if (reject) { reject = false; throw new Error('response lost') }
    } }, () => {})
    const transfer = new NotesTransfer(session)
    await session.follow(async () => first); await transfer.beginTransfer()
    const choices = [{ key, source: 'notes' as const, replace: true }]
    const plan = await transfer.previewRestore(archive([first], []), choices)
    transfer.protectRestore(plan, 'saved')
    assert.equal((await transfer.commitRestore(plan, true)).outcomeUnknown, key)
    assert.deepEqual(values.get(key), { version: 2, notes: first.notes })
    if (retry) {
      const next = await transfer.previewRestore(archive([first], []), choices)
      assert.equal(next.items[0].action, 'identical')
      assert.equal((await transfer.commitRestore(next, false)).applied.length, 0)
    }
    await transfer.finishTransfer()
    assert.equal(session.view.notes[0].text, first.notes[0].text)
    assert.equal(session.view.invalidations.has(editorKey(key, 'legacy')), true)
    assert.equal(session.view.invalidations.has(editorKey(key, 'second')), false)
  }
})

test('unknown writes never overwrite dirty empty recovery and identical previews refresh only clean stale cards', async () => {
  const key = noteKey(first), unchanged = { hostId: null, path: '/unchanged', notes: [{ id: 'same', text: 'same' }] }
  const { store, values } = fixture([[key, 'original'], [noteKey(unchanged), collection(unchanged.notes)]])
  let restoring = false
  const session = new NoteSession({ ...store, set: async (key, value) => {
    if (restoring) await store.set(key, value)
    throw new Error('failed response')
  } }, () => {})
  const transfer = new NotesTransfer(session)
  await session.follow(async () => unchanged)
  await session.follow(async () => first); await session.save('', session.view.notes[0].key)
  await transfer.beginTransfer()
  const value = archive([first, unchanged], [])
  const plan = await transfer.previewRestore(value, [{ key, source: 'notes', replace: true }])
  transfer.protectRestore(plan, 'saved'); restoring = true
  assert.equal((await transfer.commitRestore(plan, true)).outcomeUnknown, key)
  const next = await transfer.previewRestore(value, [{ key, source: 'notes', replace: false },
    { key: noteKey(unchanged), source: 'notes', replace: false }])
  assert.equal(next.items[0].action, 'conflict')
  assert.equal(next.items[1].action, 'identical')
  assert.equal(next.protection.recoveryDrafts[0].notes[0].text, '')
  await transfer.finishTransfer()
  assert.equal(session.view.notes[0].text, '')
  assert.equal(session.view.dirty, true)
  assert.equal(session.view.invalidations.size, 0)
  assert.deepEqual(values.get(key), { version: 2, notes: first.notes })
})

test('identical restore refreshes stale clean collections but keeps unchanged card history', async () => {
  const key = noteKey(first), { store, values } = fixture([[key, collection([{ id: 'legacy', text: 'old' }, first.notes[1]])]])
  const session = new NoteSession(store, () => {}), transfer = new NotesTransfer(session)
  await session.follow(async () => first)
  values.set(key, collection(first.notes))
  await transfer.beginTransfer()
  const plan = await transfer.previewRestore(archive([first], []), [{ key, source: 'notes', replace: false }])
  assert.equal(plan.items[0].action, 'identical')
  await transfer.commitRestore(plan, false); await transfer.finishTransfer()
  assert.equal(session.view.notes[0].text, first.notes[0].text)
  assert.equal(session.view.invalidations.has(editorKey(key, 'legacy')), true)
  assert.equal(session.view.invalidations.has(editorKey(key, 'second')), false)
})
