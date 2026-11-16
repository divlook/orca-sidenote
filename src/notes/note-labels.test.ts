/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NoteSession, type NoteStore } from './session'
import { collection, readCollection, sameCollection } from './note-collection'
import { DEFAULT_LABELS, LABEL_KEY, labelCatalog, readLabels } from './note-labels'
import { noteKey } from '../protocol'
import { archive, decodeArchive, encodeArchive } from '../transfer/note-archive'
import { planRestore } from '../transfer/note-archive'
import { NotesTransfer } from '../transfer/notes-transfer'

const target = { hostId: null, path: '/labels' }, other = { hostId: 'removed-host', path: '/removed' }
const id = DEFAULT_LABELS[0].id
function fixture(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial))
  const store: NoteStore = { get: async key => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value) }, keys: async () => [...values.keys()],
    delete: async key => { values.delete(key) } }
  const session = new NoteSession(store, () => {})
  return { values, store, session }
}

test('label catalog validates trimmed English-case names, palette and stable identities', () => {
  assert.throws(() => labelCatalog([{ id: 'a', name: ' Bug ', color: 'red' }]))
  assert.throws(() => labelCatalog([{ id: 'a', name: 'Bug', color: 'red' }, { id: 'b', name: 'bug', color: 'blue' }]))
  assert.throws(() => labelCatalog([{ id: 'a', name: 'Bug', color: '#fff' }]))
  assert.equal(sameCollection(collection([{ id: 'n', text: '', labelId: id }]), collection([{ id: 'n', text: '' }])), false)
  assert.deepEqual(readCollection({ version: 2, notes: [{ id: 'n', text: 'old' }] }), collection([{ id: 'n', text: 'old' }]))
})

test('assignment replacement and clear preserve text, order and editor invalidations', async () => {
  const { session, values } = fixture({ [noteKey(target)]: 'one\r\ntwo' })
  await session.follow(async () => target); await session.loadLabels()
  assert.equal(values.has(LABEL_KEY), false)
  const card = session.view.notes[0].key
  await session.assignLabel(card, id)
  await session.save('edited\r\ntext', card)
  assert.equal(session.view.notes[0].labelId, id)
  await session.assignLabel(card, DEFAULT_LABELS[1].id)
  assert.equal(session.view.notes[0].labelId, DEFAULT_LABELS[1].id)
  await session.assignLabel(card, null)
  assert.equal(session.view.notes[0].labelId, undefined)
  assert.equal(session.view.notes[0].text, 'edited\r\ntext')
  assert.equal(session.view.invalidations.size, 0)
  await session.addLabel(' Bug ', 'red')
  const bug = session.labels.labels.at(-1)!
  await session.updateLabel(bug.id, 'Issue', 'pink')
  await session.reorderLabels([...session.labels.labels].reverse().map(label => label.id))
  assert.equal(session.labels.labels[0].name, 'Issue')
  await assert.rejects(session.addLabel(' issue ', 'blue'))
})

test('delete and reset count all scopes, cancellation changes nothing, fresh reset IDs never reattach', async () => {
  const notes = collection([{ id: 'a', text: 'keep', labelId: id }, { id: 'b', text: 'plain' }])
  const { session, values } = fixture({ [noteKey(target)]: notes, [noteKey(other)]: notes })
  await session.follow(async () => target); await session.loadLabels()
  assert.equal(await session.prepareLabelDeletion(id), 2)
  assert.equal(session.view.ready, false)
  await session.finishLabelDeletion()
  assert.equal(readCollection(values.get(noteKey(other))).notes[0].labelId, id)
  assert.equal(await session.prepareLabelDeletion(id), 2)
  await session.deletePreparedLabels(); await session.finishLabelDeletion()
  assert.equal(readCollection(values.get(noteKey(other))).notes[0].labelId, undefined)
  assert.equal(session.view.invalidations.size, 0)
  assert.equal(await session.prepareLabelDeletion(null), 0)
  await session.deletePreparedLabels(); await session.finishLabelDeletion()
  assert.deepEqual(session.labels.labels.map(label => label.name), DEFAULT_LABELS.map(label => label.name))
  assert.ok(session.labels.labels.every(label => !DEFAULT_LABELS.some(old => old.id === label.id)))
})

test('destructive labels drain queued snapshots and preserve failed recovery text with assignments cleared', async () => {
  const { store, values } = fixture({ [noteKey(target)]: collection([{ id: 'n', text: 'saved', labelId: id }]) })
  let fail = true
  const session = new NoteSession({ ...store, set: async (key, value) => {
    if (fail && key === noteKey(target)) throw new Error('quota')
    await store.set(key, value)
  } }, () => {})
  await session.follow(async () => target); await session.loadLabels()
  await session.save('failed draft', session.view.notes[0].key)
  fail = false
  assert.equal(await session.prepareLabelDeletion(id), 1)
  await session.deletePreparedLabels(); await session.finishLabelDeletion()
  assert.equal(session.view.notes[0].text, 'failed draft')
  assert.equal(session.view.notes[0].labelId, undefined)
  assert.equal(session.view.notes[0].error, 'quota')
  await session.retry()
  assert.deepEqual(readCollection(values.get(noteKey(target))).notes, [{ id: 'n', text: 'failed draft' }])
})

test('backup contains full ordered catalog and labeled recovery; restore imports used labels in backup order only', async () => {
  const labels = labelCatalog([{ id: 'z', name: 'Unused', color: 'gray' }, { id: 'b', name: 'Bug', color: 'red' },
    { id: 'd', name: 'Done', color: 'green' }, { id: 'x', name: 'New', color: 'blue' }])
  const destination = labelCatalog([{ id: 'existing', name: 'bug', color: 'blue' }, { id: 'same', name: 'DONE', color: 'green' },
    { id: 'suffix', name: 'bug (2)', color: 'pink' }])
  const { session, values } = fixture({ [LABEL_KEY]: { version: 1, labels: destination } })
  const transfer = new NotesTransfer(session)
  await transfer.beginTransfer()
  const notes = [{ ...target, notes: [{ id: 'one', text: 'one', labelId: 'x' },
    { id: 'two', text: 'two', labelId: 'b' }, { id: 'three', text: '', labelId: 'd' }] }]
  const incoming = archive(notes, [], labels)
  const expected = { format: 'orca-sidenote-notes', version: 3, labels, notes, recoveryDrafts: [] }
  assert.deepEqual(decodeArchive(new TextEncoder().encode(JSON.stringify(expected))), expected)
  assert.deepEqual(JSON.parse(new TextDecoder().decode(encodeArchive(incoming))), expected)
  const plan = await transfer.previewRestore(incoming, [{ key: noteKey(target), source: 'notes', replace: false }])
  assert.deepEqual(plan.labels.map(label => label.name), ['bug', 'DONE', 'bug (2)', 'Bug (3)', 'New'])
  await transfer.commitRestore(plan, false)
  const restored = readCollection(values.get(noteKey(target))).notes
  assert.equal(restored[2].labelId, 'same')
  assert.equal(restored[1].labelId, plan.labels[3].id)
  const backup = await transfer.captureBackup()
  assert.deepEqual(backup.labels, plan.labels)
  assert.equal(backup.notes[0].notes[0].labelId, plan.labels[4].id)
  await transfer.finishTransfer()
})

test('old backup replacements clear assignments, protection retains labels, label-only restore keeps history', async () => {
  const { session, values } = fixture({ [noteKey(target)]: collection([{ id: 'legacy', text: 'same', labelId: id }]) })
  await session.follow(async () => target)
  const transfer = new NotesTransfer(session); await transfer.beginTransfer()
  const old = decodeArchive(new TextEncoder().encode(JSON.stringify({ format: 'orca-sidenote-notes', version: 2,
    notes: [{ ...target, notes: [{ id: 'legacy', text: 'same' }] }], recoveryDrafts: [] })))
  const plan = await transfer.previewRestore(old, [{ key: noteKey(target), source: 'notes', replace: true }])
  assert.deepEqual(plan.protection.labels, DEFAULT_LABELS)
  assert.equal(plan.protection.notes[0].notes[0].labelId, id)
  transfer.protectRestore(plan, 'saved'); await transfer.commitRestore(plan, true)
  assert.equal(readCollection(values.get(noteKey(target))).notes[0].labelId, undefined)
  assert.equal(session.view.invalidations.size, 0)
  await transfer.finishTransfer()
})

test('failed catalog assignment and restore cannot write dangling references', async () => {
  const { store, values } = fixture({ [noteKey(target)]: 'safe' })
  const session = new NoteSession({ ...store, set: async (key, value) => {
    await store.set(key, value)
    if (key === LABEL_KEY) throw new Error('catalog quota')
  } }, () => {})
  await session.follow(async () => target); await session.loadLabels()
  await assert.rejects(session.assignLabel(session.view.notes[0].key, id), /catalog quota/)
  assert.equal(values.get(noteKey(target)), 'safe')
  assert.equal(session.labels.ready, false)
  assert.equal(session.labels.error, 'catalog quota')
  assert.ok(values.has(LABEL_KEY), 'a rejected catalog write can already have committed')
  await session.loadLabels()
  assert.equal(session.labels.ready, true)
  assert.equal(session.labels.error, '')
  const transfer = new NotesTransfer(session); await transfer.beginTransfer()
  const incoming = archive([{ ...other, notes: [{ id: 'n', text: 'incoming', labelId: 'custom' }] }], [],
    [{ id: 'custom', name: 'Custom', color: 'red' }])
  const plan = await transfer.previewRestore(incoming, [{ key: noteKey(other), source: 'notes', replace: false }])
  await assert.rejects(transfer.commitRestore(plan, false), /outcome may be unknown/)
  assert.equal(values.has(noteKey(other)), false)
  await transfer.finishTransfer()
})

test('recovery backup carries saved and failed assignments and conflict-only previews import no catalog entries', async () => {
  const { store } = fixture({ [noteKey(target)]: collection([{ id: 'n', text: 'saved', labelId: id }]) })
  const session = new NoteSession({ ...store, set: async () => { throw new Error('offline') } }, () => {})
  await session.follow(async () => target)
  await session.save('recovery', session.view.notes[0].key)
  const transfer = new NotesTransfer(session)
  await transfer.beginTransfer()
  const backup = await transfer.captureBackup()
  assert.deepEqual(backup.labels, DEFAULT_LABELS)
  assert.equal(backup.notes[0].notes[0].labelId, id)
  assert.equal(backup.recoveryDrafts[0].notes[0].labelId, id)
  assert.equal(backup.recoveryDrafts[0].notes[0].text, 'recovery')
  await transfer.finishTransfer()
  const incoming = archive([{ ...target, notes: [{ id: 'n', text: 'new', labelId: 'new' }] }], [],
    [{ id: 'new', name: 'New', color: 'red' }])
  const plan = planRestore(incoming, [{ key: noteKey(target), source: 'notes', replace: false }],
    new Map([[noteKey(target), collection([{ id: 'n', text: 'old' }])]]), [], DEFAULT_LABELS)
  assert.equal(plan.items[0].action, 'conflict')
  assert.deepEqual(plan.labels, DEFAULT_LABELS)
})

test('queued assignment snapshots drain before deletion and later retry cannot resurrect removed IDs', async () => {
  const { store, values } = fixture({ [noteKey(target)]: collection([{ id: 'n', text: 'saved', labelId: id }]) })
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let delay = true
  const session = new NoteSession({ ...store, set: async (key, value) => {
    if (key === noteKey(target) && delay) { delay = false; started.resolve(); await release.promise }
    await store.set(key, value)
  } }, () => {})
  await session.follow(async () => target); await session.loadLabels()
  const first = session.save('first', session.view.notes[0].key)
  await started.promise
  const second = session.save('second', session.view.notes[0].key)
  const prepared = session.prepareLabelDeletion(id)
  release.resolve()
  await Promise.all([first, second])
  assert.equal(await prepared, 1)
  await session.deletePreparedLabels(); await session.finishLabelDeletion()
  await session.retry()
  assert.deepEqual(readCollection(values.get(noteKey(target))).notes, [{ id: 'n', text: 'second' }])
})

for (const action of ['load', 'edit', 'assign'] as const) {
  test(`pending catalog ${action} blocks transfer and destructive leases without retaining a lease`, async () => {
    const { store, values } = fixture({ [noteKey(target)]: 'preserved' })
    const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
    let delay = false
    const session = new NoteSession({ ...store,
      get: async key => {
        if (delay && action === 'load' && key === LABEL_KEY) { started.resolve(); await release.promise }
        return store.get(key)
      },
      set: async (key, value) => {
        if (delay && action !== 'load' && key === LABEL_KEY) { started.resolve(); await release.promise }
        await store.set(key, value)
      }
    }, () => {})
    await session.follow(async () => target); await session.loadLabels()
    delay = true
    const pending = action === 'load' ? session.loadLabels()
      : action === 'edit' ? session.updateLabel(id, 'Renamed', 'red')
        : session.assignLabel(session.view.notes[0].key, id)
    await started.promise
    const transfer = new NotesTransfer(session)
    await assert.rejects(transfer.beginTransfer(), /label catalog operation/)
    await assert.rejects(session.prepareDeletion(), /label catalog operation/)
    await assert.rejects(session.acquireNoteOperation(), /label catalog operation/)
    assert.equal(session.view.ready, true)
    release.resolve()
    await pending
    await transfer.beginTransfer()
    await assert.rejects(session.loadLabels(), /note operation/)
    const backup = await transfer.captureBackup()
    assert.equal(backup.labels[0].name, action === 'edit' ? 'Renamed' : 'todo')
    assert.equal(backup.notes[0].notes[0].labelId, action === 'assign' ? id : undefined)
    await transfer.finishTransfer()
    assert.equal(await session.prepareDeletion(), 1)
    await session.finishDeletion()
    assert.equal(session.view.ready, true)
    assert.equal(readCollection(values.get(noteKey(target))).notes[0].text, 'preserved')
  })
}

test('restore does not mistake colliding label IDs for identical notes or import conflict-only labels', () => {
  const labels = labelCatalog([{ id: 'collision', name: 'Incoming', color: 'red' },
    { id: 'unused', name: 'Unused', color: 'gray' }])
  const destination = labelCatalog([{ id: 'collision', name: 'Existing', color: 'blue' }])
  const notes = [{ id: 'n', text: 'same', labelId: 'collision' }]
  const incoming = archive([{ ...target, notes }], [], labels)
  const states = new Map([[noteKey(target), collection(notes)]])
  const conflict = planRestore(incoming, [{ key: noteKey(target), source: 'notes', replace: false }], states, [], destination)
  assert.equal(conflict.items[0].action, 'conflict')
  assert.deepEqual(conflict.labels, destination)
  const replacement = planRestore(incoming, [{ key: noteKey(target), source: 'notes', replace: true }], states, [], destination)
  assert.equal(replacement.items[0].action, 'replace')
  assert.deepEqual(replacement.labels.map(label => label.name), ['Existing', 'Incoming'])
  assert.notEqual(replacement.items[0].note.notes[0].labelId, 'collision')
  assert.equal(replacement.items[0].note.notes[0].labelId, replacement.labels[1].id)
})

for (const phase of ['get', 'set'] as const) {
  test(`label assignment rejects a focus round trip during catalog ${phase}`, async () => {
    const { store, values } = fixture({ [noteKey(target)]: 'original', [noteKey(other)]: 'other' })
    const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
    let delay = false
    const session = new NoteSession({ ...store,
      get: async key => {
        if (delay && phase === 'get' && key === LABEL_KEY) { started.resolve(); await release.promise }
        return store.get(key)
      },
      set: async (key, value) => {
        if (delay && phase === 'set' && key === LABEL_KEY) { started.resolve(); await release.promise }
        await store.set(key, value)
      }
    }, () => {})
    await session.follow(async () => target); await session.loadLabels()
    const card = session.view.notes[0].key
    delay = true
    const pending = session.assignLabel(card, id)
    await started.promise
    await session.follow(async () => other)
    await session.follow(async () => target)
    release.resolve()
    await pending
    assert.equal(session.view.notes[0].key, card)
    assert.equal(session.view.notes[0].labelId, undefined)
    assert.equal(readCollection(values.get(noteKey(target))).notes[0].labelId, undefined)
    assert.equal(values.get(noteKey(other)), 'other')
    assert.equal(session.view.invalidations.size, 0)
    delay = false
    await session.assignLabel(card, id)
    assert.equal(session.view.notes[0].labelId, id)
    assert.equal(readCollection(values.get(noteKey(target))).notes[0].labelId, id)
  })
}

for (const action of ['reset', 'restore'] as const) {
  test(`failed ${action} catalog writes require reload after an unknown outcome`, async () => {
    const { store, values } = fixture({ [noteKey(target)]: 'safe' })
    const session = new NoteSession({ ...store, set: async (key, value) => {
      await store.set(key, value)
      if (key === LABEL_KEY) throw new Error('catalog outcome unknown')
    } }, () => {})
    await session.follow(async () => target); await session.loadLabels()
    if (action === 'reset') {
      await session.prepareLabelDeletion(null)
      await assert.rejects(session.deletePreparedLabels(), /catalog outcome unknown/)
      await session.finishLabelDeletion()
    } else {
      const transfer = new NotesTransfer(session)
      await transfer.beginTransfer()
      const incoming = archive([{ ...other, notes: [{ id: 'n', text: 'incoming', labelId: 'custom' }] }], [],
        [{ id: 'custom', name: 'Custom', color: 'red' }])
      const plan = await transfer.previewRestore(incoming, [{ key: noteKey(other), source: 'notes', replace: false }])
      await assert.rejects(transfer.commitRestore(plan, false), /outcome may be unknown/)
      await transfer.finishTransfer()
      assert.equal(values.has(noteKey(other)), false)
    }
    assert.equal(session.labels.ready, false)
    assert.equal(session.labels.error, 'catalog outcome unknown')
    assert.equal(values.get(noteKey(target)), 'safe')
    await session.loadLabels()
    assert.equal(session.labels.ready, true)
    assert.equal(session.labels.error, '')
    assert.deepEqual(session.labels.labels, readLabels(values.get(LABEL_KEY)))
  })
}

test('cached views reflect cleared assignments while a later scope write is pending', async () => {
  const values = new Map<string, unknown>([
    [noteKey(target), collection([{ id: 'active', text: 'active', labelId: id }])],
    [noteKey(other), collection([{ id: 'other', text: 'other', labelId: id }])],
    [LABEL_KEY, { version: 1, labels: DEFAULT_LABELS }]
  ])
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let session: NoteSession
  const store: NoteStore = {
    get: async key => values.get(key) ?? null,
    keys: async () => [...values.keys()],
    delete: async key => { values.delete(key) },
    set: async (key, value) => {
      if (key === noteKey(target)) assert.equal(session.view.notes[0].labelId, id)
      if (key === noteKey(other)) { started.resolve(); await release.promise }
      values.set(key, value)
    }
  }
  session = new NoteSession(store, () => {})
  await session.follow(async () => target)
  await session.prepareLabelDeletion(id)
  const deleting = session.deletePreparedLabels()
  await started.promise
  assert.equal(session.view.notes[0].labelId, undefined)
  assert.equal(session.view.notes[0].text, 'active')
  release.resolve()
  await deleting
  await session.finishLabelDeletion()
})
