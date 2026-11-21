/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveFocus } from './focus'

const local = {
  worktreeId: 'repo::/projects/app', path: '/projects/app', hostId: 'local',
  identity: { key: 'wt2:local:local-instance' }, worktreeInstanceId: 'local-instance',
  displayName: 'main', isActive: true,
  address: { environment: 'local', worktree: 'identity:wt2:local:local-instance' }
}
const remote = {
  ...local, worktreeId: 'remote-repo::/projects/app',
  identity: { key: 'wt2:local:remote-instance' }, worktreeInstanceId: 'remote-instance',
  address: { environment: 'paired-id', worktree: 'identity:wt2:local:remote-instance' }
}
const paired = 'runtime:paired-id'
const snapshot = (worktrees: unknown[], omittedHostIds: string[] = []) => ({
  ok: true, result: { truncated: false, totalCount: worktrees.length, worktrees, hostScope: { omittedHostIds } }
})
const environments = (...ids: string[]) => ({ ok: true, result: { environments: ids.map(id => ({ id })) } })
const environmentList = async () => environments('paired-id')

test('host-qualified local focus needs neither a local active flag nor a paired runtime', async () => {
  const workspaceId = `identity:${local.identity.key}`
  const checked: string[] = []
  const focus = await resolveFocus({
    context: async () => ({ workspaceId }),
    environmentList: async () => { throw new Error('local identity does not need pairing discovery') },
    snapshot: async environment => {
      checked.push(environment)
      if (environment !== 'local') throw new Error('remote disconnected')
      return snapshot([{ ...local, isActive: false }], [paired])
    },
    current: () => true
  })
  assert.deepEqual(checked, ['local'])
  assert.deepEqual(focus, {
    kind: 'local', workspaceId, worktree: local.address.worktree,
    target: { path: local.path, hostId: local.hostId, worktree: 'main' }
  })
})

test('both active flags can coexist; raw and host-qualified remote identifiers use their own snapshot', async () => {
  for (const workspaceId of [remote.worktreeId, 'identity:wt2:runtime%3Apaired-id:remote-instance']) {
    assert.deepEqual(await resolveFocus({
      context: async () => ({ workspaceId }),
      environmentList,
      snapshot: async environment => environment === 'local'
        ? snapshot([local], [paired])
        : snapshot([remote]),
      current: () => true
    }), { kind: 'remote' })
  }
})

test('bare IDs reject local/remote twins; a normalized host-qualified remote ID does not select the local twin', async () => {
  const twin = { ...remote, worktreeId: local.worktreeId }
  const sources = {
    environmentList,
    snapshot: async (environment: string) => environment === 'local' ? snapshot([local], [paired]) : snapshot([twin]),
    current: () => true
  }
  await assert.rejects(resolveFocus({ ...sources, context: async () => ({ workspaceId: local.worktreeId }) }))
  assert.deepEqual(await resolveFocus({
    ...sources, context: async () => ({ workspaceId: 'identity:wt2:runtime%3Apaired-id:remote-instance' })
  }), { kind: 'remote' })
})

test('local folder IDs are valid only once all other candidate sets exclude that ID', async () => {
  const workspaceId = 'folder:folder-instance'
  const folder = { ...local, identity: undefined, worktreeId: workspaceId, address: { environment: 'local', worktree: workspaceId } }
  const setup = {
    context: async () => ({ workspaceId }),
    environmentList,
    snapshot: async (environment: string) => environment === 'local' ? snapshot([folder], [paired]) : snapshot([remote]),
    current: () => true
  }
  assert.equal((await resolveFocus(setup))?.kind, 'local')
  await assert.rejects(resolveFocus({
    ...setup, snapshot: async environment => environment === 'local' ? snapshot([folder], [paired]) : snapshot([folder])
  }))
})

test('null only confirms idle without an omitted host or contradictory local activity', async () => {
  const setup = { context: async () => null, current: () => true, environmentList: async () => environments() }
  assert.equal(await resolveFocus({ ...setup, snapshot: async () => snapshot([]) }), null)
  assert.equal(await resolveFocus({ ...setup, snapshot: async () => snapshot([], ['local']) }), null)
  for (const localSnapshot of [snapshot([], [paired]), snapshot([local]), snapshot([local], [paired])]) {
    await assert.rejects(resolveFocus({ ...setup, snapshot: async () => localSnapshot }))
  }
  await assert.rejects(resolveFocus({ ...setup, snapshot: async () => snapshot([]), environmentList }))
})

test('focus rejects missing IDs, partial lists, duplicated matches, transport errors and late observations', async () => {
  const complete = snapshot([remote])
  const sources = {
    context: async () => ({ workspaceId: remote.worktreeId }),
    environmentList,
    snapshot: async (environment: string) => environment === 'local' ? snapshot([local], [paired]) : complete,
    current: () => true
  }
  const error = { message: 'The active worktree could not be verified.' }
  for (const reply of [
    snapshot([]), snapshot([remote, remote]),
    { ...complete, result: { ...complete.result, totalCount: 2 } },
    { ...complete, result: { ...complete.result, truncated: true } }
  ]) {
    await assert.rejects(resolveFocus({
      ...sources, snapshot: async environment => environment === 'local' ? snapshot([local], [paired]) : reply
    }), error)
  }
  await assert.rejects(resolveFocus({ ...sources, context: async () => ({ displayName: 'main' }) }), error)
  for (const key of ['context', 'snapshot', 'environmentList'] as const) {
    await assert.rejects(resolveFocus({ ...sources, [key]: async () => { throw new Error('private server detail') } }), error)
  }
  await assert.rejects(resolveFocus({ ...sources, current: () => false }), error)
  let reads = 0
  await assert.rejects(resolveFocus({
    ...sources, context: async () => ({ workspaceId: reads++ === 0 ? remote.worktreeId : local.worktreeId })
  }), error)
})
