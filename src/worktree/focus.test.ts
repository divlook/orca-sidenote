/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { focusedTarget } from './focus'
import type { NoteTarget } from '../protocol'

const local: NoteTarget = { path: '/projects/app', hostId: 'local' }
const remote: NoteTarget = { path: '/projects/app', hostId: 'server' }

test('focus rejects ambiguous or truncated snapshots and preserves host identity', () => {
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
