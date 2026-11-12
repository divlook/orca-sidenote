import { assert, test } from 'orca/testing'
import { NoteSession, type NoteStore } from './session'
import { noteKey, type NoteTarget } from './protocol'
import { focusedTarget } from './focus'

const local: NoteTarget = { path: '/projects/app', hostId: 'local' }
const branch: NoteTarget = { path: '/projects/app-feature', hostId: 'local' }
const remote: NoteTarget = { path: '/projects/app', hostId: 'server' }

test('note storage keys stay compatible across plugin identity changes', () => {
  assert.equal(noteKey(local), 'note:v1:["local","/projects/app"]')
  assert.equal(noteKey({ hostId: null, path: '/projects/a "quoted" path' }),
    'note:v1:[null,"/projects/a \\"quoted\\" path"]')
})

function memoryStore(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial))
  const store: NoteStore = {
    get: async key => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value) },
    keys: async () => [...values.keys()],
    delete: async key => { values.delete(key) }
  }
  return { store, values }
}

test('focus selects the exact active path and host despite duplicate workspace names', () => {
  const snapshot = { ok: true, result: { truncated: false, worktrees: [
    { isActive: false, path: local.path, hostId: local.hostId, displayName: 'main' },
    { isActive: true, path: remote.path, hostId: remote.hostId, displayName: 'main' }
  ] } }
  assert.deepEqual(focusedTarget(snapshot), { ...remote, worktree: 'main' })
  snapshot.result.worktrees[0].isActive = true
  assert.throws(() => focusedTarget(snapshot))
  snapshot.result.truncated = true
  assert.throws(() => focusedTarget(snapshot))
})

test('automatically switched targets retain separate notes through reopening and clearing', async () => {
  const { store } = memoryStore()
  let session = new NoteSession(store, () => {})
  for (const [target, text] of [[local, '# Project'], [branch, '- [x] Worktree complete'], [remote, 'Remote note']] as const) {
    await session.follow(async () => target)
    assert.equal(session.view.text, '')
    await session.save(text)
  }
  session = new NoteSession(store, () => {})
  for (const [target, text] of [[local, '# Project'], [branch, '- [x] Worktree complete'], [remote, 'Remote note']] as const) {
    await session.follow(async () => target)
    assert.equal(session.view.text, text)
  }
  await session.save('')
  session = new NoteSession(store, () => {})
  await session.follow(async () => remote)
  assert.equal(session.view.text, '')
})

test('a save finishing after focus changes cannot write into the new worktree', async () => {
  const { store, values } = memoryStore()
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const session = new NoteSession({ ...store, set: async (key, text) => {
    if (key === noteKey(local)) { started.resolve(); await release.promise }
    await store.set(key, text)
  } }, () => {})
  await session.follow(async () => local)
  const saved = session.save('Original worktree note')
  await started.promise
  await session.follow(async () => branch)
  const nextSaved = session.save('New worktree note')
  assert.equal(values.size, 0)
  assert.equal(session.view.text, 'New worktree note')
  release.resolve()
  await Promise.all([saved, nextSaved])
  assert.equal(values.get(noteKey(local)), 'Original worktree note')
  assert.equal(values.get(noteKey(branch)), 'New worktree note')
  assert.equal(session.view.text, 'New worktree note')
})

test('late note loads do not replace the newly focused note', async () => {
  const old = Promise.withResolvers<unknown>()
  const started = Promise.withResolvers<void>()
  const session = new NoteSession({
    ...memoryStore().store,
    get: key => {
      if (key !== noteKey(local)) return Promise.resolve('New note')
      started.resolve()
      return old.promise
    },
    set: async () => {}
  }, () => {})
  const previous = session.follow(async () => local)
  await started.promise
  await session.follow(async () => branch)
  old.resolve('Previous note')
  await previous
  assert.equal(session.view.text, 'New note')
  assert.equal(session.view.ready, true)
})

test('returning to a worktree while an older load is pending preserves newly typed text', async () => {
  const old = Promise.withResolvers<unknown>()
  let first = true
  const started = Promise.withResolvers<void>()
  const session = new NoteSession({
    ...memoryStore().store,
    get: async () => {
      if (first) {
        first = false
        started.resolve()
        return old.promise
      }
      return ''
    },
    set: async () => {}
  }, () => {})
  const previous = session.follow(async () => local)
  await started.promise
  await session.follow(async () => branch)
  await session.follow(async () => local)
  await session.save('Newly typed note')
  old.resolve('Late previous content')
  await previous
  assert.equal(session.view.text, 'Newly typed note')
})

test('storage failure retains the draft across focus changes and retry saves it', async () => {
  const { store, values } = memoryStore()
  let fail = true
  const session = new NoteSession({ ...store, set: async (key, text) => {
    if (fail) throw new Error('Disk error')
    await store.set(key, text)
  } }, () => {})
  await session.follow(async () => local)
  await session.save('Note to retain')
  assert.equal(session.view.dirty, true)
  assert.equal(values.has(noteKey(local)), false)
  await session.follow(async () => branch)
  await session.follow(async () => local)
  assert.equal(session.view.text, 'Note to retain')
  fail = false
  await session.save(session.view.text)
  assert.equal(values.get(noteKey(local)), 'Note to retain')
  assert.equal(session.view.dirty, false)
})

test('unreadable stored data and missing focus never become writable blank notes', async () => {
  const { store, values } = memoryStore({ [noteKey(local)]: { unexpected: true } })
  const session = new NoteSession(store, () => {})
  await session.follow(async () => local)
  assert.equal(session.view.ready, false)
  await session.save('Must not overwrite')
  assert.deepEqual(values.get(noteKey(local)), { unexpected: true })
  await session.follow(async () => null)
  assert.equal(session.view.ready, false)
  await session.save('Must not save')
  assert.equal(values.size, 1)
})

test('stale editor identity and suspended input cannot save to another note', async () => {
  const { store, values } = memoryStore()
  const session = new NoteSession(store, () => {})
  await session.follow(async () => local)
  const originalKey = session.view.key
  await session.save('Original', originalKey)
  const target = Promise.withResolvers<NoteTarget | null>()
  const switching = session.follow(() => target.promise)
  await session.save('Late suspended input', originalKey)
  target.resolve(branch)
  await switching
  await session.save('Late old model input', originalKey)
  assert.equal(session.view.text, '')
  assert.equal(values.get(noteKey(local)), 'Original')
  assert.equal(values.has(noteKey(branch)), false)
})

test('the note consumer rejects over-limit edits without changing the accepted draft', async () => {
  const { store, values } = memoryStore()
  const session = new NoteSession(store, () => {})
  await session.follow(async () => local)
  session.setLimit(3)
  const accepted = 'abc'
  await session.save(accepted, session.view.key)
  await session.save(accepted + 'overflow', session.view.key)
  assert.equal(session.view.text, accepted)
  assert.equal(values.get(noteKey(local)), accepted)
})

test('custom and unlimited limits persist long notes without truncating them when lowered', async () => {
  const { store, values } = memoryStore()
  const session = new NoteSession(store, () => {})
  session.setLimit(null)
  await session.follow(async () => local)
  const long = 'a'.repeat(9000)
  await session.save(long)
  assert.equal(values.get(noteKey(local)), long)
  session.setLimit(20)
  assert.equal(session.view.text, long)
  await session.save(long + 'x')
  assert.equal(session.view.text, long)
  await session.save('b' + long.slice(1))
  assert.equal(session.view.text.length, 9000)
  await session.save('short')
  assert.equal(values.get(noteKey(local)), 'short')
  await session.follow(async () => branch)
  await session.save('b'.repeat(21))
  assert.equal(session.view.text, '')
  await session.save('b'.repeat(20))
  assert.equal(values.get(noteKey(branch)), 'b'.repeat(20))
})

test('pending and failing focus clears visible content while retaining the draft', async () => {
  const { store } = memoryStore()
  const session = new NoteSession(store, () => {})
  const target = { ...local, project: 'app', worktree: 'main' }
  await session.follow(async () => target)
  await session.save('Private previous note')
  const lookup = Promise.withResolvers<NoteTarget | null>()
  const switching = session.follow(() => lookup.promise)
  assert.equal(session.view.loading, true)
  assert.equal(session.view.ready, false)
  assert.equal(session.view.key, '')
  assert.equal(session.view.target, null)
  assert.equal(session.view.text, '')
  lookup.reject(new Error('Lookup failed'))
  await switching
  assert.equal(session.view.ready, false)
  assert.equal(session.view.target, null)
  await session.follow(async () => target)
  assert.equal(session.view.text, 'Private previous note')
  assert.deepEqual(session.view.target, target)
})

test('late target lookups and their failures cannot replace the latest worktree', async () => {
  const { store } = memoryStore()
  const session = new NoteSession(store, () => {})
  for (const reject of [false, true]) {
    const lookup = Promise.withResolvers<NoteTarget | null>()
    const previous = session.follow(() => lookup.promise)
    await session.follow(async () => branch)
    await session.save('Latest note')
    if (reject) lookup.reject(new Error('Old lookup failed'))
    else lookup.resolve(local)
    await previous
    assert.deepEqual(session.view.target, branch)
    assert.equal(session.view.text, 'Latest note')
    assert.equal(session.view.ready, true)
  }
})

test('global deletion drains queued saves and includes unloaded notes without removing settings', async () => {
  const { store, values } = memoryStore({ [noteKey(remote)]: 'Unloaded', 'settings:note-character-limit': { characterLimit: null } })
  const release = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  const session = new NoteSession({ ...store, set: async (key, value) => {
    started.resolve()
    await release.promise
    await store.set(key, value)
  } }, () => {})
  await session.follow(async () => local)
  const saving = session.save('Queued')
  await started.promise
  const preparation = session.prepareDeletion()
  assert.equal(session.view.ready, false)
  await session.save('Must not resurrect')
  release.resolve()
  await saving
  assert.equal(await preparation, 2)
  await session.deletePrepared()
  await session.finishDeletion()
  assert.equal(session.view.text, '')
  assert.equal(session.view.ready, true)
  assert.equal(values.size, 1)
  assert.equal(values.has('settings:note-character-limit'), true)
})

test('global deletion invalidates loads and retries partial failure without resurrecting removed drafts', async () => {
  const { store, values } = memoryStore({ [noteKey(local)]: 'Old', [noteKey(branch)]: 'Keep until retry' })
  const delayed = Promise.withResolvers<unknown>()
  const started = Promise.withResolvers<void>()
  let delay = true, fail = true
  const session = new NoteSession({ ...store, get: key => {
    if (delay) { started.resolve(); return delayed.promise }
    return store.get(key)
  }, delete: async key => {
    if (key === noteKey(branch) && fail) throw new Error('Unavailable')
    await store.delete(key)
  } }, () => {})
  const following = session.follow(async () => local)
  await started.promise
  assert.equal(await session.prepareDeletion(), 2)
  let rejected = false
  try { await session.deletePrepared() } catch { rejected = true }
  assert.equal(rejected, true)
  assert.equal(values.has(noteKey(local)), false)
  assert.equal(values.has(noteKey(branch)), true)
  assert.equal(session.view.ready, false)
  delayed.resolve('Old')
  await following
  delay = false
  fail = false
  await session.deletePrepared()
  await session.finishDeletion()
  assert.equal(session.view.text, '')
  assert.equal(values.size, 0)
})

test('failed enumeration and cancellation preserve failed unsaved drafts', async () => {
  const { store, values } = memoryStore()
  let fail = true
  const session = new NoteSession({ ...store, keys: async () => {
    if (fail) throw new Error('Cannot enumerate')
    return store.keys()
  }, set: async () => { throw new Error('Cannot save') } }, () => {})
  await session.follow(async () => local)
  await session.save('Unsaved draft')
  await assert.rejects(() => session.prepareDeletion())
  await session.finishDeletion()
  assert.equal(session.view.text, 'Unsaved draft')
  fail = false
  assert.equal(await session.prepareDeletion(), 1)
  await session.finishDeletion()
  assert.equal(session.view.text, 'Unsaved draft')
  assert.equal(values.size, 0)
})
