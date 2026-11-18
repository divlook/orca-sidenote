/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { focusedTarget, missingFocus } from './focus'
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

test('missing local focus distinguishes a confirmed remote workspace from no focused workspace', () => {
  const context = { workspaceId: 'remote-workspace' }
  const row = { worktreeId: context.workspaceId, isActive: false, path: '/projects/app', hostId: 'local' }
  const local = { ok: true, result: { truncated: false, worktrees: [] } }
  const remote = { ok: true, result: { truncated: false, worktrees: [row] } }
  assert.deepEqual(missingFocus(context, local, [remote]), { unavailable: 'remote' })
  assert.equal(missingFocus(null, local, []), null)
  for (const remotes of [
    [{ ...remote, result: { ...remote.result, truncated: true } }],
    [],
    [remote, remote],
    [{ ...remote, result: { ...remote.result, worktrees: [{ ...row, worktreeId: 'other' }] } }]
  ]) assert.throws(() => missingFocus(context, local, remotes))
  assert.throws(() => missingFocus(context, remote, [remote]))
  assert.throws(() => missingFocus({ displayName: 'same name' }, local, [remote]))
})
