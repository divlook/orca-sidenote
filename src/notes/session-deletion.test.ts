/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NoteSession, type NoteStore } from './session'
import { noteKey } from '../protocol'

test('failed deletion counting read preserves stored notes, drafts and settings and releases its lease', async () => {
  const local = { hostId: 'local', path: '/active' }
  const unloaded = { hostId: 'remote', path: '/unloaded' }
  const values = new Map<string, unknown>([
    [noteKey(local), 'saved active'], [noteKey(unloaded), 'saved unloaded'],
    ['settings:source-line-numbers', false], ['settings:confirm-note-deletion', true],
    ['settings:note-character-limit', { characterLimit: 10 }]
  ])
  const before = new Map(values)
  let failRead = false
  const store: NoteStore = {
    get: async key => {
      if (failRead && key === noteKey(unloaded)) throw new Error('counting read unavailable')
      return values.get(key) ?? null
    },
    keys: async () => [...values.keys()],
    set: async () => { throw new Error('retain failed draft') },
    delete: async key => { values.delete(key) }
  }
  const session = new NoteSession(store, () => {})
  await session.follow(async () => local)
  const key = session.view.notes[0].key
  await session.save('unsaved active draft', key)
  failRead = true
  await assert.rejects(() => session.prepareDeletion(), /counting read unavailable/)
  assert.equal(session.view.ready, false)
  assert.deepEqual(values, before)
  assert.equal(session.view.notes[0].text, 'unsaved active draft')
  await session.finishDeletion()
  assert.equal(session.view.ready, true)
  assert.equal(session.view.notes[0].key, key)
  assert.equal(session.view.notes[0].text, 'unsaved active draft')
  assert.equal(session.view.notes[0].dirty, true)
  assert.equal(session.view.error, 'retain failed draft')
  assert.deepEqual(values, before)
  const lease = await session.acquireNoteOperation()
  await lease.finish()
  assert.equal(session.view.ready, true)
})

test('bulk deletion cleans an empty saved location without touching settings or resurrecting notes', async () => {
  const target = { hostId: 'local', path: '/empty-saved-location' }
  const key = noteKey(target)
  const values = new Map<string, unknown>([
    [key, { version: 2, notes: [] }], ['settings:confirm-note-deletion', false]
  ])
  const store: NoteStore = {
    get: async key => values.get(key) ?? null,
    keys: async () => [...values.keys()],
    set: async (key, value) => { values.set(key, value) },
    delete: async key => { values.delete(key) }
  }
  const session = new NoteSession(store, () => {})
  await session.follow(async () => target)
  assert.equal(session.view.notes.length, 0)
  assert.equal(await session.prepareDeletion(), 1)
  await session.deletePrepared()
  await session.finishDeletion()
  assert.equal(values.has(key), false)
  assert.equal(values.get('settings:confirm-note-deletion'), false)
  assert.equal(values.size, 1)
  const reopened = new NoteSession(store, () => {})
  await reopened.follow(async () => target)
  assert.equal(reopened.view.ready, true)
  assert.equal(reopened.view.notes.length, 0)
  assert.equal(values.has(key), false)
})
