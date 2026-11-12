import { assert, test } from 'orca/testing'
import { archive, decodeArchive, encodeArchive, planRestore, ARCHIVE_BYTES } from './note-transfer'
import { NoteSession, type NoteStore } from './session'
import { noteKey } from './protocol'
import { NotesTransfer } from './notes-transfer'

const first = { hostId: null, path: '/Case/é\\"\u0000', text: '"quotes" \\ slash\r\n한글😀\u0000 {"literal":true}\n\ud800' }
const second = { hostId: 'local', path: first.path, text: '' }
function fixture(initial: [string, unknown][] = []) {
  const values = new Map(initial)
  const writes: string[] = []
  const store: NoteStore = { get: async key => values.get(key) ?? null,
    keys: async () => [...values.keys()], delete: async key => { values.delete(key) },
    set: async (key, text) => { writes.push(key); values.set(key, text) } }
  const session = new NoteSession(store, () => {})
  return { values, writes, store, session, notesTransfer: new NotesTransfer(session) }
}
async function rejected(operation: () => Promise<unknown>) {
  let threw = false
  try { await operation() } catch { threw = true }
  assert.equal(threw, true)
}

test('JSON backup interoperates with the version 1 archive format', () => {
  const expected = { format: 'orca-sidenote-notes', version: 1, notes: [first, second],
    recoveryDrafts: [{ ...first, text: '' }] }
  const external = new TextEncoder().encode(JSON.stringify(expected))
  assert.deepEqual(decodeArchive(external), expected)
  const encoded = encodeArchive(archive([first, second], [{ ...first, text: '' }]))
  assert.deepEqual(JSON.parse(new TextDecoder().decode(encoded)), expected)
})

test('whole archive validation rejects unknown fields, duplicates, versions, UTF8 and size', () => {
  for (const value of [{ ...archive([], []), version: 2 }, { ...archive([], []), settings: {} },
    { ...archive([], []), notes: [first, first] }, { ...archive([], []), notes: [{ ...first, text: 4 }] }]) {
    assert.throws(() => decodeArchive(new TextEncoder().encode(JSON.stringify(value))))
  }
  assert.throws(() => decodeArchive(new Uint8Array([0xff])))
  assert.throws(() => decodeArchive(new Uint8Array(ARCHIVE_BYTES + 1)))
})

test('capture drains pending saves, gates edits and retains every failed cached draft including empty clear', async () => {
  const a = noteKey(first), b = noteKey(second)
  const { store, values } = fixture([[a, 'old'], [b, 'old two'], ['settings:v1', 'keep']])
  const release = Promise.withResolvers<void>()
  let pending = true
  const session = new NoteSession({ ...store, set: async () => {
    if (pending) { pending = false; await release.promise }
    throw new Error('disk failed')
  } }, () => {})
  const notesTransfer = new NotesTransfer(session)
  await session.follow(async () => first)
  const save = session.save('failed new')
  const begin = notesTransfer.beginTransfer()
  assert.equal(session.view.ready, false)
  await session.save('blocked')
  release.resolve(); await save; await begin
  await notesTransfer.finishTransfer()
  await session.follow(async () => second); await session.save('')
  await session.follow(async () => ({ hostId: 'server', path: '/new' })); await session.save('failed absent')
  await notesTransfer.beginTransfer()
  const value = await notesTransfer.captureBackup()
  assert.equal(value.notes.length, 2)
  assert.deepEqual(value.recoveryDrafts.map(note => note.text), ['failed new', '', 'failed absent'])
  assert.equal(values.get(a), 'old')
})

test('conflicts preserve by default, protection cancellation blocks replacement, and unrelated data stays', async () => {
  const key = noteKey(first)
  const { session, notesTransfer, values, writes } = fixture([[key, 'original'], [noteKey(second), 'unrelated'], ['settings:v1', 'keep']])
  await notesTransfer.beginTransfer()
  const value = archive([first], [])
  let plan = await notesTransfer.previewRestore(value, [{ key, source: 'notes', replace: false }])
  assert.equal(plan.items[0].action, 'conflict')
  await notesTransfer.commitRestore(plan, false); assert.equal(writes.length, 0)
  plan = await notesTransfer.previewRestore(value, [{ key, source: 'notes', replace: true }])
  assert.equal(plan.protection.notes[0].text, 'original')
  notesTransfer.protectRestore(plan, 'cancelled')
  await rejected(() => notesTransfer.commitRestore(plan, true)); assert.equal(writes.length, 0)
  notesTransfer.protectRestore(plan, 'saved')
  await notesTransfer.commitRestore(plan, true)
  assert.equal(values.get(key), first.text)
  assert.equal(values.get(noteKey(second)), 'unrelated')
  assert.equal(values.get('settings:v1'), 'keep')
  assert.equal(session.view.invalidations.has(key), true)
})

test('corrupt or changed destinations and oversized values cause zero writes', async () => {
  const key = noteKey(first)
  const { session, notesTransfer, values, writes } = fixture([[key, { corrupt: true }]])
  await notesTransfer.beginTransfer()
  await rejected(() => notesTransfer.captureBackup())
  await rejected(() => notesTransfer.previewRestore(archive([first], []), [{ key, source: 'notes', replace: true }]))
  values.delete(key)
  await rejected(() => notesTransfer.previewRestore(archive([{ ...first, text: 'x'.repeat(262144) }], []), [{ key, source: 'notes', replace: false }]))
  const plan = await notesTransfer.previewRestore(archive([first], []), [{ key, source: 'notes', replace: false }])
  values.set(key, 'other panel')
  await rejected(() => notesTransfer.commitRestore(plan, false))
  assert.equal(writes.length, 0)
})

test('sequential middle failure reports applied unknown and unattempted, retry skips identical', async () => {
  const notes = [first, second, { hostId: 'server', path: '/third', text: 'z'.repeat(12000) }]
  const { store, values } = fixture()
  let fail = true
  const session = new NoteSession({ ...store, set: async (key, text) => {
    if (key === noteKey(second) && fail) throw new Error('timeout')
    await store.set(key, text)
  } }, () => {})
  const notesTransfer = new NotesTransfer(session)
  await notesTransfer.beginTransfer()
  const choices = notes.map(note => ({ key: noteKey(note), source: 'notes' as const, replace: false }))
  let plan = await notesTransfer.previewRestore(archive(notes, []), choices)
  const result = await notesTransfer.commitRestore(plan, false)
  assert.deepEqual(result.applied, [noteKey(first)])
  assert.equal(result.outcomeUnknown, noteKey(second))
  assert.deepEqual(result.unattempted, [noteKey(notes[2])])
  fail = false
  plan = await notesTransfer.previewRestore(archive(notes, []), choices)
  assert.equal(plan.items[0].action, 'identical')
  await notesTransfer.commitRestore(plan, false)
  assert.equal(values.get(noteKey(notes[2])), notes[2].text)
  await notesTransfer.finishTransfer()
  await session.follow(async () => notes[2])
  session.setLimit(100)
  await session.save('z'.repeat(13000))
  assert.equal(session.view.text.length, 12000)
  await session.save('z'.repeat(11000))
  assert.equal(values.get(noteKey(notes[2])), 'z'.repeat(11000))
})

test('two archive candidates cannot silently last-win and empty stored note differs from absence', () => {
  const key = noteKey(first)
  const value = archive([first], [{ ...first, text: 'draft' }])
  assert.throws(() => planRestore(value, [{ key, source: 'notes', replace: false }, { key, source: 'recoveryDrafts', replace: false }], new Map([[key, null]]), []))
  const empty = archive([{ ...first, text: '' }], [])
  assert.equal(planRestore(empty, [{ key, source: 'notes', replace: false }], new Map([[key, '']]), []).items[0].action, 'identical')
  assert.equal(planRestore(empty, [{ key, source: 'notes', replace: false }], new Map([[key, null]]), []).items[0].action, 'create')
})

test('transfer invalidates late loads and re-resolves latest focus without resurrecting old text', async () => {
  const key = noteKey(first)
  const old = Promise.withResolvers<unknown>()
  const started = Promise.withResolvers<void>()
  const { store } = fixture()
  let blocked = true
  const session = new NoteSession({ ...store, get: async requested => {
    if (requested === key && blocked) { blocked = false; started.resolve(); return old.promise }
    return store.get(requested)
  } }, () => {})
  const notesTransfer = new NotesTransfer(session)
  const loading = session.follow(async () => first)
  await started.promise
  await notesTransfer.beginTransfer()
  const plan = await notesTransfer.previewRestore(archive([first], []), [{ key, source: 'notes', replace: false }])
  await notesTransfer.commitRestore(plan, false)
  old.resolve('late stale text'); await loading
  await session.follow(async () => second)
  await notesTransfer.finishTransfer()
  assert.equal(session.view.key, noteKey(second))
  assert.equal(session.view.text, '')
  await session.follow(async () => first)
  assert.equal(session.view.text, first.text)
})

test('dirty replacement requires protected empty recovery and keeps unapplied draft on stop', async () => {
  const key = noteKey(first)
  const { store } = fixture([[key, 'original']])
  const gate = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  let restoring = false
  const session = new NoteSession({ ...store, set: async (requested, text) => {
    if (!restoring) throw new Error('ordinary save failed')
    started.resolve()
    await gate.promise; await store.set(requested, text)
  } }, () => {})
  const notesTransfer = new NotesTransfer(session)
  await session.follow(async () => first); await session.save('')
  await notesTransfer.beginTransfer()
  const choices = [{ key, source: 'notes' as const, replace: true },
    { key: noteKey(second), source: 'notes' as const, replace: false }]
  const plan = await notesTransfer.previewRestore(archive([first, second], []), choices)
  assert.equal(plan.protection.recoveryDrafts[0].text, '')
  await rejected(() => notesTransfer.commitRestore(plan, true))
  notesTransfer.protectRestore(plan, 'saved'); restoring = true
  const committing = notesTransfer.commitRestore(plan, true)
  await started.promise
  notesTransfer.stopRestore(); gate.resolve()
  const result = await committing
  assert.deepEqual(result.applied, [key])
  assert.deepEqual(result.unattempted, [noteKey(second)])
})

test('quota preflight counts serialized escapes, unchanged settings and namespace keys before any write', async () => {
  const key = noteKey(first)
  const choices = [{ key, source: 'notes' as const, replace: false }]
  for (const text of ['\"'.repeat(131072), '\\u0000'.repeat(43691)]) {
    const { session, notesTransfer, writes } = fixture()
    await notesTransfer.beginTransfer()
    await rejected(() => notesTransfer.previewRestore(archive([{ ...first, text }], []), choices))
    assert.equal(writes.length, 0)
  }
  const full = fixture(Array.from({ length: 1024 }, (_, i) => [`setting:${i}`, null]))
  await full.notesTransfer.beginTransfer()
  await rejected(() => full.notesTransfer.previewRestore(archive([first], []), choices))
  assert.equal(full.writes.length, 0)
  const large = fixture([['settings', 'x'.repeat(5242800)]])
  await large.notesTransfer.beginTransfer()
  await rejected(() => large.notesTransfer.previewRestore(archive([first], []), choices))
  assert.equal(large.writes.length, 0)
})

test('null persisted destination is corrupt rather than absent; long identities remain exact', async () => {
  const key = noteKey(first)
  const { session, notesTransfer, writes } = fixture([[key, null]])
  await notesTransfer.beginTransfer()
  await rejected(() => notesTransfer.previewRestore(archive([first], []), [{ key, source: 'notes', replace: false }]))
  assert.equal(writes.length, 0)
  const note = { ...first, path: '/'.repeat(40000) }
  assert.equal(decodeArchive(encodeArchive(archive([note], []))).notes[0].path, note.path)
  await rejected(() => notesTransfer.previewRestore(archive([note], []), [{ key: noteKey(note), source: 'notes', replace: false }]))
  assert.equal(writes.length, 0)
})

test('write-then-reject outcomes reread clean caches on retry preview or closing, with targeted refresh', async () => {
  for (const retry of [true, false]) {
    const key = noteKey(first)
    const { store, values } = fixture([[key, 'old clean cache']])
    let rejectAfterWrite = true
    const session = new NoteSession({ ...store, set: async (requested, text) => {
      await store.set(requested, text)
      if (rejectAfterWrite) { rejectAfterWrite = false; throw new Error('response lost after write') }
    } }, () => {})
    const notesTransfer = new NotesTransfer(session)
    await session.follow(async () => first)
    await notesTransfer.beginTransfer()
    const value = archive([first], [])
    const choices = [{ key, source: 'notes' as const, replace: true }]
    const plan = await notesTransfer.previewRestore(value, choices)
    notesTransfer.protectRestore(plan, 'saved')
    const result = await notesTransfer.commitRestore(plan, true)
    assert.equal(result.outcomeUnknown, key)
    assert.equal(result.applied.length, 0)
    assert.equal(values.get(key), first.text)
    if (retry) {
      const rechecked = await notesTransfer.previewRestore(value, choices)
      assert.equal(rechecked.items[0].action, 'identical')
      const skipped = await notesTransfer.commitRestore(rechecked, false)
      assert.equal(skipped.applied.length, 0)
    }
    await notesTransfer.finishTransfer()
    assert.equal(session.view.text, first.text)
    assert.equal(session.view.invalidations.has(key), true)
    await session.save(first.text + ' next edit')
    assert.equal(values.get(key), first.text + ' next edit')
  }
})

test('unknown writes never replace local dirty empty recovery with guessed persisted text', async () => {
  const key = noteKey(first)
  const { store, values } = fixture([[key, 'original']])
  let transfer = false
  const session = new NoteSession({ ...store, set: async (requested, text) => {
    if (transfer) await store.set(requested, text)
    throw new Error(transfer ? 'response lost' : 'ordinary save failed')
  } }, () => {})
  const notesTransfer = new NotesTransfer(session)
  await session.follow(async () => first); await session.save('')
  await notesTransfer.beginTransfer()
  const value = archive([first], [])
  const plan = await notesTransfer.previewRestore(value, [{ key, source: 'notes', replace: true }])
  notesTransfer.protectRestore(plan, 'saved'); transfer = true
  assert.equal((await notesTransfer.commitRestore(plan, true)).outcomeUnknown, key)
  const retry = await notesTransfer.previewRestore(value, [{ key, source: 'notes', replace: false }])
  assert.equal(retry.items[0].action, 'conflict')
  assert.equal(retry.protection.recoveryDrafts[0].text, '')
  await notesTransfer.finishTransfer()
  assert.equal(values.get(key), first.text)
  assert.equal(session.view.text, '')
  assert.equal(session.view.dirty, true)
  assert.equal(session.view.invalidations.has(key), false)
})

test('identical restore refreshes stale clean caches without discarding unchanged or failed drafts', async () => {
  const stale = { hostId: null, path: '/stale', text: 'new persisted' }
  const unchanged = { hostId: null, path: '/unchanged', text: 'unchanged' }
  const failed = { hostId: null, path: '/failed', text: 'failed destination' }
  const { store, values, writes } = fixture([
    [noteKey(stale), 'old cached'], [noteKey(unchanged), unchanged.text], [noteKey(failed), 'original']
  ])
  const session = new NoteSession({ ...store, set: async (key, text) => {
    if (key === noteKey(failed)) throw new Error('failed save')
    await store.set(key, text)
  } }, () => {})
  const notesTransfer = new NotesTransfer(session)
  await session.follow(async () => unchanged)
  await session.follow(async () => failed)
  await session.save('')
  await session.follow(async () => stale)
  values.set(noteKey(stale), stale.text)
  values.set(noteKey(failed), failed.text)
  await notesTransfer.beginTransfer()
  const notes = [stale, unchanged, failed]
  const plan = await notesTransfer.previewRestore(archive(notes, []),
    notes.map(note => ({ key: noteKey(note), source: 'notes', replace: false })))
  assert.equal(plan.items.map(item => item.action).join(','), 'identical,identical,conflict')
  assert.equal(plan.protection.recoveryDrafts[0].text, '')
  const result = await notesTransfer.commitRestore(plan, false)
  assert.equal(result.applied.length, 0)
  await notesTransfer.finishTransfer()
  assert.equal(session.view.text, stale.text)
  assert.equal(session.view.invalidations.has(noteKey(stale)), true)
  assert.equal(session.view.invalidations.has(noteKey(unchanged)), false)
  assert.equal(session.view.invalidations.has(noteKey(failed)), false)
  await session.save(session.view.text + ' edited')
  assert.equal(values.get(noteKey(stale)), stale.text + ' edited')
  assert.equal(writes.length, 1)
  await session.follow(async () => failed)
  assert.equal(session.view.text, '')
  assert.equal(session.view.dirty, true)
  assert.equal(session.view.error, 'failed save')
})
