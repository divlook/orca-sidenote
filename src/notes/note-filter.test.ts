/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NoteFilters, allNotes, filterKey, reorderDisplayed, type NoteFilter } from './note-filter'
import { noteKey, NOTE_KEY_PREFIX } from '../protocol'
import { NoteSession, type NoteStore } from './session'

const scopeA = noteKey({ hostId: null, path: '/project' })
const scopeB = noteKey({ hostId: 'remote', path: '/project' })
const selected = (id: string): NoteFilter => ({ version: 1, labelIds: [id], noLabel: false })

test('delayed scoped filter reads cannot publish into another exact host/path or write before readiness', async () => {
  const delayed = Promise.withResolvers<unknown>()
  const writes: string[] = []
  const filters = new NoteFilters({
    get: key => key === filterKey(scopeA) ? delayed.promise : Promise.resolve(selected('remote-label')),
    set: async key => { writes.push(key) }
  }, () => {})
  const loadingA = filters.follow(scopeA)
  await filters.choose(selected('too-early'))
  assert.deepEqual(writes, [])
  await filters.follow(scopeB)
  assert.deepEqual(filters.view.value, selected('remote-label'))
  delayed.resolve(selected('local-label'))
  await loadingA
  assert.deepEqual(filters.view.value, selected('remote-label'))
  await filters.follow(scopeA)
  assert.deepEqual(filters.view.value, selected('local-label'))
  assert.notEqual(filterKey(scopeA), filterKey(noteKey({ hostId: null, path: '/project/' })))
  assert.equal(filterKey(scopeA).startsWith(NOTE_KEY_PREFIX), false)
})

test('unknown preference writes retain presentation, reread exact scope, and never overwrite a newer ordered choice', async () => {
  const values = new Map<string, unknown>()
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let first = true
  const filters = new NoteFilters({
    get: async key => values.get(key),
    set: async (key, value) => {
      if (first) { first = false; started.resolve(); await release.promise; values.set(key, value); throw new Error('Unknown write outcome') }
      values.set(key, value)
    }
  }, () => {})
  await filters.follow(scopeA)
  const older = filters.choose(selected('older'))
  await started.promise
  const newer = filters.choose(selected('newer'))
  release.resolve()
  await Promise.all([older, newer])
  assert.equal(filters.view.ready, true)
  assert.deepEqual(filters.view.value, selected('newer'))
  await filters.retry()
  assert.deepEqual(values.get(filterKey(scopeA)), selected('newer'))

  const uncertain = new NoteFilters({
    get: async key => values.get(key),
    set: async (key, value) => { values.set(key, value); throw new Error('Committed then rejected') }
  }, () => {})
  await uncertain.follow(scopeA)
  await uncertain.choose(selected('committed'))
  assert.equal(uncertain.view.ready, false)
  assert.match(uncertain.view.error, /Committed then rejected/)
  assert.deepEqual(uncertain.view.value, selected('committed'))
  await uncertain.follow(scopeB)
  await uncertain.retry()
  assert.deepEqual(uncertain.view.value, allNotes())
  await uncertain.follow(scopeA)
  await uncertain.retry()
  assert.equal(uncertain.view.ready, true)
  assert.deepEqual(uncertain.view.value, selected('committed'))
})

test('retry reads cannot overwrite a newer preference revision when concurrent retry finishes late', async () => {
  const late = Promise.withResolvers<unknown>(), started = Promise.withResolvers<void>()
  let reads = 0
  const filters = new NoteFilters({
    get: async () => {
      reads++
      if (reads === 1) throw new Error('Read unavailable')
      if (reads === 2) { started.resolve(); return late.promise }
      return selected('loaded')
    },
    set: async () => {}
  }, () => {})
  await filters.follow(scopeA)
  const older = filters.retry()
  await started.promise
  await filters.retry()
  await filters.choose(selected('latest'))
  late.resolve(selected('stale'))
  await older
  assert.deepEqual(filters.view.value, selected('latest'))
  assert.equal(filters.view.ready, true)
})

test('visible-slot consumer includes pending pins and latest note records without moving hidden indices', async () => {
  const values = new Map<string, unknown>([[scopeA, { version: 3, notes: [
    { id: 'A', text: 'alpha', labelId: 'chosen' }, { id: 'X', text: 'hidden x' },
    { id: 'B', text: 'beta', labelId: 'chosen' }, { id: 'Y', text: 'hidden y' },
    { id: 'P', text: 'pending pin' }
  ] }]])
  const store: NoteStore = {
    get: async key => values.get(key), set: async (key, value) => { values.set(key, value) },
    keys: async () => [...values.keys()], delete: async key => { values.delete(key) }
  }
  const session = new NoteSession(store, () => {})
  await session.follow(async () => ({ hostId: null, path: '/project' }))
  const b = session.view.notes.find(note => note.id === 'B')!
  await session.save('latest beta\r\n📝', b.key)
  const displayed = new Set(['A', 'B', 'P'])
  const full = session.view.notes.map(note => note.id)
  const order = reorderDisplayed(full, displayed, 'B', 'A')
  assert.deepEqual(order, ['B', 'X', 'A', 'Y', 'P'])
  await session.reorderNotes(order)
  assert.equal(session.view.notes[0].text, 'latest beta\r\n📝')
  assert.equal(session.view.notes[0].labelId, 'chosen')
  const pinOrder = reorderDisplayed(session.view.notes.map(note => note.id), displayed, 'P', 'B')
  assert.deepEqual(pinOrder, ['P', 'X', 'B', 'Y', 'A'])
  await session.reorderNotes(pinOrder)
  assert.deepEqual(session.view.notes.map(note => note.id), pinOrder)
  assert.deepEqual(reorderDisplayed(pinOrder, displayed, 'gone', 'A'), pinOrder)
  assert.deepEqual(reorderDisplayed(pinOrder, displayed, 'P', 'X'), pinOrder)
})
