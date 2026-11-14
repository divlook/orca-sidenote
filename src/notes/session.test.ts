/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NoteSession, type NoteStore } from './session'
import { noteKey, type NoteTarget } from '../protocol'
import { collection, editorKey, readCollection } from './note-collection'

const local: NoteTarget = { path: '/projects/app', hostId: 'local' }
const branch: NoteTarget = { path: '/projects/app-feature', hostId: 'local' }
const remote: NoteTarget = { path: '/projects/app', hostId: 'server' }
function memoryStore(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial))
  const store: NoteStore = {
    get: async key => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value) },
    keys: async () => [...values.keys()], delete: async key => { values.delete(key) }
  }
  return { store, values }
}
async function add(session: NoteSession, text = '') {
  const key = (await session.createNote())!
  await session.save(text, key)
  return key
}
function texts(values: Map<string, unknown>, target: NoteTarget) {
  return readCollection(values.get(noteKey(target)) ?? null).notes.map(note => note.text)
}

test('exact keys, strict collections and lossless lazy legacy migration', async () => {
  assert.equal(noteKey(local), 'note:v1:["local","/projects/app"]')
  assert.equal(noteKey({ hostId: null, path: '/a "quoted"' }), 'note:v1:[null,"/a \\"quoted\\""]')
  for (const text of ['', 'one\r\n---\nsecond', '{"version":2,"notes":[]}']) {
    const { store, values } = memoryStore({ [noteKey(local)]: text })
    const session = new NoteSession(store, () => {})
    await session.follow(async () => local)
    assert.equal(values.get(noteKey(local)), text)
    assert.deepEqual(session.view.notes.map(({ id, text }) => ({ id, text })), [{ id: 'legacy', text }])
    await session.save(text, session.view.notes[0].key)
    assert.deepEqual(values.get(noteKey(local)), { version: 2, notes: [{ id: 'legacy', text }] })
  }
  for (const value of [{ version: 3, notes: [] }, { version: 2, notes: [{ id: '', text: '' }] },
    { version: 2, notes: [{ id: 'a', text: '' }, { id: 'a', text: '' }] },
    { version: 2, notes: [], extra: true }, { version: 2, notes: [{ id: 'a', text: '', extra: 1 }] }]) {
    assert.throws(() => readCollection(value))
  }
})

test('new scopes are empty; blank append, independent edits, order and IDs survive reopening', async () => {
  const { store, values } = memoryStore()
  let session = new NoteSession(store, () => {})
  await session.follow(async () => local)
  assert.equal(session.view.notes.length, 0)
  assert.equal(session.view.ready, true)
  const a = await add(session, 'A'), b = await add(session)
  assert.notEqual(a, b)
  const ids = session.view.notes.map(note => note.id)
  await session.save('B', b)
  await session.save('A revised', a)
  await session.reorderNotes([...ids].reverse())
  assert.deepEqual(texts(values, local), ['B', 'A revised'])
  assert.equal(session.view.invalidations.size, 0)
  session = new NoteSession(store, () => {})
  await session.follow(async () => local)
  assert.deepEqual(session.view.notes.map(note => note.key), [b, a])
  assert.throws(() => session.reorderNotes([ids[0], ids[0]]))
  for (const target of [branch, remote]) {
    await session.follow(async () => target)
    assert.equal(session.view.notes.length, 0)
    await add(session, target.hostId!)
  }
  assert.deepEqual(texts(values, local), ['B', 'A revised'])
})

test('queued snapshots preserve optimistic card edits and never cross focus scopes', async () => {
  const { store, values } = memoryStore({ [noteKey(local)]: 'old' })
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let delay = true
  const session = new NoteSession({ ...store, set: async (key, value) => {
    if (delay) { delay = false; started.resolve(); await release.promise }
    await store.set(key, value)
  } }, () => {})
  await session.follow(async () => local)
  const card = session.view.notes[0].key
  const first = session.save('first', card)
  await started.promise
  const second = session.save('second', card)
  assert.equal(session.view.notes[0].text, 'second')
  await session.follow(async () => branch)
  const created = session.createNote()
  await session.save('stale', card)
  release.resolve()
  await Promise.all([first, second, created])
  assert.deepEqual(texts(values, local), ['second'])
  assert.deepEqual(texts(values, branch), [''])
})

test('late loads and target lookups cannot replace newer focus or newly typed cards', async () => {
  const { store } = memoryStore()
  const old = Promise.withResolvers<unknown>(), started = Promise.withResolvers<void>()
  let delay = true
  const session = new NoteSession({ ...store, get: async key => {
    if (key === noteKey(local) && delay) { delay = false; started.resolve(); return old.promise }
    return store.get(key)
  } }, () => {})
  const previous = session.follow(async () => local)
  await started.promise
  await session.follow(async () => branch)
  await session.follow(async () => local)
  await add(session, 'newly typed')
  old.resolve('late old text'); await previous
  assert.equal(session.view.notes[0].text, 'newly typed')
  for (const reject of [false, true]) {
    const lookup = Promise.withResolvers<NoteTarget | null>()
    const following = session.follow(() => lookup.promise)
    assert.equal(session.view.scopeKey, '')
    assert.equal(session.view.target, null)
    assert.equal(session.view.notes.length, 0)
    await session.follow(async () => branch)
    if (reject) lookup.reject(new Error('old lookup failed'))
    else lookup.resolve(local)
    await following
    assert.deepEqual(session.view.target, branch)
  }
})

test('failed creates, edits and reorder retain complete drafts and retry with no character cap', async () => {
  const { store, values } = memoryStore()
  let fail = true
  const session = new NoteSession({ ...store, set: async (key, value) => {
    if (fail) throw new Error('Disk error')
    await store.set(key, value)
  } }, () => {})
  await session.follow(async () => local)
  const a = await add(session, 'x'.repeat(20000)), b = await add(session)
  const ids = session.view.notes.map(note => note.id)
  await session.reorderNotes([...ids].reverse())
  assert.equal(session.view.error, 'Disk error')
  assert.equal(session.view.dirty, true)
  assert.equal(values.size, 0)
  await session.follow(async () => branch)
  await session.follow(async () => local)
  assert.deepEqual(session.view.notes.map(note => note.key), [b, a])
  fail = false
  await session.retry()
  assert.deepEqual(texts(values, local), ['', 'x'.repeat(20000)])
  assert.equal(session.view.dirty, false)
  assert.equal(session.view.error, '')
})

test('old completion cannot clear a newer failed snapshot or lose its draft', async () => {
  const { store } = memoryStore({ [noteKey(local)]: 'old' })
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let calls = 0
  const session = new NoteSession({ ...store, set: async () => {
    if (++calls === 1) { started.resolve(); await release.promise; return }
    throw new Error('latest failed')
  } }, () => {})
  await session.follow(async () => local)
  const key = session.view.notes[0].key
  const first = session.save('first', key)
  await started.promise
  const second = session.save('second', key)
  release.resolve(); await Promise.all([first, second])
  assert.equal(session.view.notes[0].text, 'second')
  assert.equal(session.view.error, 'latest failed')
  assert.equal(session.view.dirty, true)
})

test('unreadable storage and missing or failed focus never become writable', async () => {
  const { store, values } = memoryStore({ [noteKey(local)]: { unexpected: true } })
  const session = new NoteSession(store, () => {})
  await session.follow(async () => local)
  assert.equal(session.view.ready, false)
  await session.createNote()
  assert.equal(values.size, 1)
  await session.follow(async () => null)
  assert.equal(session.view.ready, false)
  await session.follow(async () => { throw new Error('lookup failed') })
  assert.equal(session.view.problem, 'lookup failed')
})

test('single deletion drains pending saves and only publishes after successful write', async () => {
  const { store, values } = memoryStore({ [noteKey(local)]: 'original' })
  let fail = false, delay = false
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const session = new NoteSession({ ...store, set: async (key, value) => {
    if (delay) { delay = false; started.resolve(); await release.promise }
    if (fail) throw new Error('delete unavailable')
    await store.set(key, value)
  } }, () => {})
  await session.follow(async () => local)
  await add(session, 'keep')
  const doomed = session.view.notes[0]
  delay = true
  const saving = session.save('pending', doomed.key)
  await started.promise
  const deleting = session.deleteNote(doomed.id)
  assert.equal(session.view.ready, true)
  assert.equal(session.view.notes.length, 2)
  release.resolve(); await Promise.all([saving, deleting])
  assert.deepEqual(texts(values, local), ['keep'])
  assert.equal(session.view.invalidations.has(doomed.key), true)
  fail = true
  const keep = session.view.notes[0]
  await assert.rejects(() => session.deleteNote(keep.id))
  assert.equal(session.view.notes[0].key, keep.key)
  assert.equal(session.view.notes[0].text, 'keep')
  fail = false
  await session.deleteNote(keep.id)
  assert.equal(session.view.notes.length, 0)
})

test('targeted deletion preserves live scope and later saves without resurrection; explicit restore may reuse IDs', async () => {
  const { store, values } = memoryStore({
    [noteKey(local)]: collection([{ id: 'remove', text: 'remove' }, { id: 'keep', text: 'saved' }])
  })
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let delay = true
  const session = new NoteSession({ ...store, set: async (key, value) => {
    if (delay) { delay = false; started.resolve(); await release.promise }
    await store.set(key, value)
  } }, () => {})
  await session.follow(async () => local)
  const before = session.view, keep = before.notes[1]
  const deleting = session.deleteNote('remove')
  await started.promise
  const saving = session.save('concurrent sibling draft', keep.key)
  assert.equal(session.view.scopeKey, before.scopeKey)
  assert.equal(session.view.target, before.target)
  assert.equal(session.view.epoch, before.epoch)
  assert.equal(session.view.loading, false)
  assert.equal(session.view.ready, true)
  const leasing = session.acquireNoteOperation()
  assert.equal(session.view.ready, false)
  release.resolve()
  await Promise.all([deleting, saving])
  assert.deepEqual(texts(values, local), ['concurrent sibling draft'])
  assert.equal(session.view.notes[0].key, keep.key)
  assert.equal(session.view.invalidations.has(keep.key), false)
  const lease = await leasing
  await lease.write(noteKey(local), collection([{ id: 'remove', text: 'restored' }, { id: 'keep', text: 'concurrent sibling draft' }]))
  await lease.finish()
  await session.save('restored edit', session.view.notes[0].key)
  assert.deepEqual(texts(values, local), ['restored edit', 'concurrent sibling draft'])
})

test('targeted deletion follows its captured scope while focus and queued sibling saves advance', async () => {
  const { store, values } = memoryStore({
    [noteKey(local)]: collection([{ id: 'remove', text: 'remove' }, { id: 'keep', text: 'saved' }]),
    [noteKey(branch)]: 'other scope'
  })
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const session = new NoteSession({ ...store, set: async (key, value) => {
    started.resolve(); await release.promise; await store.set(key, value)
  } }, () => {})
  await session.follow(async () => local)
  const deleting = session.deleteNote('remove')
  await started.promise
  const saving = session.save('latest sibling', session.view.notes[1].key)
  await session.follow(async () => branch)
  release.resolve(); await Promise.all([deleting, saving])
  assert.equal(session.view.scopeKey, noteKey(branch))
  assert.equal(session.view.notes[0].text, 'other scope')
  assert.deepEqual(texts(values, local), ['latest sibling'])
  await session.follow(async () => local)
  assert.deepEqual(session.view.notes.map(note => note.text), ['latest sibling'])
})

test('successful targeted deletion resolves a failed sibling draft without clearing a later queued failure', async () => {
  const { store, values } = memoryStore({
    [noteKey(local)]: collection([{ id: 'remove', text: 'remove' }, { id: 'keep', text: 'saved' }])
  })
  let fail = true, delay = false
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const session = new NoteSession({ ...store, set: async (key, value) => {
    if (delay) { delay = false; started.resolve(); await release.promise }
    if (fail || readCollection(value).notes.some(note => note.text === 'newer failed draft')) throw new Error('save unavailable')
    await store.set(key, value)
  } }, () => {})
  await session.follow(async () => local)
  const keep = session.view.notes[1]
  await session.save('failed sibling draft', keep.key)
  assert.equal(session.view.error, 'save unavailable')
  fail = false
  await session.deleteNote('remove')
  assert.equal(session.view.error, '')
  assert.equal(session.view.dirty, false)
  assert.deepEqual(texts(values, local), ['failed sibling draft'])
  await session.createNote()
  delay = true
  const deleting = session.deleteNote(session.view.notes[1].id)
  await started.promise
  const saving = session.save('newer failed draft', keep.key)
  release.resolve()
  await deleting
  fail = true
  await saving
  assert.equal(session.view.notes[0].text, 'newer failed draft')
  assert.equal(session.view.error, 'save unavailable')
})

test('global deletion drains saves, counts all cards and retains settings and retired cap data', async () => {
  const { store, values } = memoryStore({ [noteKey(remote)]: 'unloaded',
    'settings:note-character-limit': { characterLimit: 10 }, 'settings:source-line-numbers': false })
  const session = new NoteSession(store, () => {})
  await session.follow(async () => local)
  await add(session, 'one'); await add(session)
  assert.equal(await session.prepareDeletion(), 3)
  await session.createNote()
  assert.equal(session.view.ready, false)
  await session.deletePrepared(); await session.finishDeletion()
  assert.equal(session.view.notes.length, 0)
  assert.equal(session.view.ready, true)
  assert.equal(values.size, 2)
  assert.deepEqual(values.get('settings:note-character-limit'), { characterLimit: 10 })
})

test('partial global deletion and stale loads cannot resurrect deleted drafts', async () => {
  const { store, values } = memoryStore({ [noteKey(local)]: 'old', [noteKey(branch)]: 'retry' })
  const delayed = Promise.withResolvers<unknown>(), started = Promise.withResolvers<void>()
  let delay = true, fail = true
  const session = new NoteSession({ ...store, get: key => {
    if (delay) { delay = false; started.resolve(); return delayed.promise }
    return store.get(key)
  }, delete: async key => {
    if (key === noteKey(branch) && fail) throw new Error('unavailable')
    await store.delete(key)
  } }, () => {})
  const following = session.follow(async () => local)
  await started.promise
  assert.equal(await session.prepareDeletion(), 2)
  await assert.rejects(() => session.deletePrepared())
  delayed.resolve('old'); await following
  assert.equal(values.has(noteKey(local)), false)
  fail = false
  await session.deletePrepared(); await session.finishDeletion()
  assert.equal(session.view.notes.length, 0)
  assert.equal(values.size, 0)
})

test('enumeration failure and cancellation preserve failed drafts; lease rejects stale calls', async () => {
  const { store } = memoryStore()
  let fail = true
  const session = new NoteSession({ ...store, keys: async () => {
    if (fail) throw new Error('cannot enumerate')
    return store.keys()
  }, set: async () => { throw new Error('cannot save') } }, () => {})
  await session.follow(async () => local)
  await add(session, 'unsaved')
  await assert.rejects(() => session.prepareDeletion())
  await session.finishDeletion()
  assert.equal(session.view.notes[0].text, 'unsaved')
  fail = false
  assert.equal(await session.prepareDeletion(), 1)
  await session.finishDeletion()
  assert.equal(session.view.notes[0].text, 'unsaved')
  const lease = await session.acquireNoteOperation()
  await assert.rejects(() => session.acquireNoteOperation())
  await lease.finish()
  await assert.rejects(() => lease.get(noteKey(local)))
  assert.throws(() => lease.recoveryCollections())
})

test('automatic deletion removes only whitespace notes and leaves Markdown bodies untouched', async () => {
  const { store, values } = memoryStore({
    [noteKey(local)]: collection([{ id: 'blank', text: ' \r\n\t' }, { id: 'markdown', text: '---' }])
  })
  const session = new NoteSession(store, () => {})
  await session.follow(async () => local)
  await session.pruneEmptyNote('markdown')
  assert.deepEqual(texts(values, local), [' \r\n\t', '---'])
  await session.pruneEmptyNote('blank')
  assert.deepEqual(texts(values, local), ['---'])
})

test('automatic deletion rechecks queued input and stale scope before issuing any write', async () => {
  const { store, values } = memoryStore({
    [noteKey(local)]: collection([{ id: 'blank', text: '' }, { id: 'keep', text: 'saved' }]),
    [noteKey(branch)]: 'branch'
  })
  let writes = 0
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const session = new NoteSession({ ...store, set: async (key, value) => {
    if (++writes === 1) { started.resolve(); await release.promise }
    await store.set(key, value)
  } }, () => {})
  await session.follow(async () => local)
  const blank = session.view.notes[0], keep = session.view.notes[1]
  const saving = session.save('queued sibling', keep.key)
  await started.promise
  const pruning = session.pruneEmptyNote(blank.id)
  const typing = session.save('new content', blank.key)
  release.resolve(); await Promise.all([saving, pruning, typing])
  assert.equal(writes, 2)
  assert.deepEqual(texts(values, local), ['new content', 'queued sibling'])
  await session.save('', blank.key)
  const stale = session.pruneEmptyNote(blank.id)
  await session.follow(async () => branch)
  const before = writes
  await stale
  assert.equal(writes, before)
  assert.deepEqual(texts(values, local), ['', 'queued sibling'])
})

test('input during automatic deletion keeps its ID and failed queued save recoverable', async () => {
  const { store, values } = memoryStore({
    [noteKey(local)]: collection([{ id: 'blank', text: '' }, { id: 'keep', text: 'keep' }])
  })
  let first = true, failInput = true
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const session = new NoteSession({ ...store, set: async (key, value) => {
    if (first) { first = false; started.resolve(); await release.promise }
    if (failInput && readCollection(value).notes.some(note => note.text === 'typed during delete')) throw new Error('input save failed')
    await store.set(key, value)
  } }, () => {})
  await session.follow(async () => local)
  const blank = session.view.notes[0]
  const pruning = session.pruneEmptyNote(blank.id)
  await started.promise
  const typing = session.save('typed during delete', blank.key)
  release.resolve(); await Promise.all([pruning, typing])
  assert.equal(session.view.notes[0].key, blank.key)
  assert.equal(session.view.notes[0].text, 'typed during delete')
  assert.equal(session.view.invalidations.has(blank.key), false)
  assert.equal(session.view.error, 'input save failed')
  assert.equal(session.view.dirty, true)
  assert.deepEqual(texts(values, local), ['keep'])
  failInput = false
  await session.retry()
  assert.deepEqual(texts(values, local), ['typed during delete', 'keep'])
  assert.equal(session.view.error, '')
})

test('failed automatic deletion retains whitespace draft and never invalidates its editor', async () => {
  const { store } = memoryStore({ [noteKey(local)]: ' \n' })
  const session = new NoteSession({ ...store, set: async () => { throw new Error('prune unavailable') } }, () => {})
  await session.follow(async () => local)
  const blank = session.view.notes[0]
  await assert.rejects(() => session.pruneEmptyNote(blank.id), /prune unavailable/)
  assert.equal(session.view.notes[0].key, blank.key)
  assert.equal(session.view.notes[0].text, ' \n')
  assert.equal(session.view.invalidations.has(blank.key), false)
})

test('automatic deletion queued before a focus round trip cannot prune the returned scope', async () => {
  const { store, values } = memoryStore({
    [noteKey(local)]: collection([{ id: 'blank', text: '' }, { id: 'keep', text: 'keep' }]),
    [noteKey(branch)]: 'branch'
  })
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let writes = 0
  const session = new NoteSession({ ...store, set: async (key, value) => {
    writes++; started.resolve(); await release.promise; await store.set(key, value)
  } }, () => {})
  await session.follow(async () => local)
  const saving = session.save('queued sibling', session.view.notes[1].key)
  await started.promise
  const pruning = session.pruneEmptyNote('blank')
  await session.follow(async () => branch)
  await session.follow(async () => local)
  release.resolve(); await Promise.all([saving, pruning])
  assert.equal(writes, 1)
  assert.deepEqual(texts(values, local), ['', 'queued sibling'])
  assert.equal(session.view.notes[0].id, 'blank')
})
