import type { NoteTarget } from '../protocol.ts'
import { isAbsolute } from 'node:path'

type Environment = `runtime:${string}`
type Workspace = {
  target: NoteTarget
  id: string
  identity?: string
  instanceId?: string
  isActive: boolean
  address?: { environment: string; worktree: string }
}

export type ConfirmedFocus =
  | { kind: 'local'; target: NoteTarget; workspaceId: string; worktree: string | undefined }
  | { kind: 'remote' }
  | null

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('\0')
}

function invalidFocus(): never {
  throw new Error('The active worktree could not be verified.')
}

function readSnapshot(snapshot: unknown): { rows: Workspace[]; omitted: string[] } {
  if (!record(snapshot) || snapshot.ok !== true || !record(snapshot.result)) invalidFocus()
  const { worktrees, truncated, totalCount, hostScope } = snapshot.result
  if (truncated !== false || !Array.isArray(worktrees) || worktrees.length !== totalCount
    || !record(hostScope) || !Array.isArray(hostScope.omittedHostIds)
    || !hostScope.omittedHostIds.every(text)
    || new Set(hostScope.omittedHostIds).size !== hostScope.omittedHostIds.length) invalidFocus()
  const rows = worktrees.map((row: unknown): Workspace => {
    if (!record(row) || !text(row.worktreeId) || !text(row.path) || typeof row.isActive !== 'boolean'
      || (row.hostId !== null && !text(row.hostId))) invalidFocus()
    const target: NoteTarget = { path: row.path, hostId: row.hostId }
    if (text(row.repo)) target.project = row.repo
    if (text(row.displayName)) target.worktree = row.displayName
    else if (text(row.branch)) target.worktree = row.branch.replace(/^refs\/heads\//, '')
    const key = record(row.identity) && text(row.identity.key) ? row.identity.key : undefined
    const address = record(row.address) && text(row.address.environment) && text(row.address.worktree)
      ? { environment: row.address.environment, worktree: row.address.worktree }
      : undefined
    return {
      target, id: row.worktreeId, identity: key ? `identity:${key}` : undefined,
      instanceId: text(row.worktreeInstanceId) ? row.worktreeInstanceId : undefined,
      isActive: row.isActive, address
    }
  })
  return { rows, omitted: hostScope.omittedHostIds }
}

function focusId(context: unknown): string | null {
  if (context === null) return null
  if (!record(context) || !text(context.workspaceId)) invalidFocus()
  return context.workspaceId
}

function localHost({ target }: Workspace): boolean {
  return target.hostId === 'local' || target.hostId === null
}

function localFocus(row: Workspace, workspaceId: string): ConfirmedFocus {
  if (!isAbsolute(row.target.path)) invalidFocus()
  return {
    kind: 'local', target: row.target, workspaceId,
    worktree: row.address?.environment === 'local' ? row.address.worktree : undefined
  }
}

function pairedEnvironment(value: string): value is Environment {
  return value !== 'runtime:local' && /^runtime:[a-zA-Z0-9_-]+$/.test(value)
}

function readPairedHosts(response: unknown): Set<Environment> {
  if (!record(response) || response.ok !== true || !record(response.result)
    || !Array.isArray(response.result.environments)) invalidFocus()
  const hosts = new Set<Environment>()
  for (const row of response.result.environments) {
    if (!record(row) || !text(row.id)) invalidFocus()
    const host = `runtime:${row.id}`
    if (!pairedEnvironment(host) || hosts.has(host)) invalidFocus()
    hosts.add(host)
  }
  return hosts
}

function matchesPairedRow(row: Workspace, id: string, host: Environment): boolean {
  if (row.id === id) return true
  // The server's own snapshot can call its host "local". Its instance must match the
  // desktop's host-qualified projection, not an identity in another runtime's namespace.
  return localHost(row) && !!row.instanceId
    && id === `identity:wt2:${encodeURIComponent(host)}:${encodeURIComponent(row.instanceId)}`
}

type FocusSources = {
  context(): Promise<unknown>
  snapshot(environment: string): Promise<unknown>
  environmentList(): Promise<unknown>
  current(): boolean
}

export async function resolveFocus(sources: FocusSources): Promise<ConfirmedFocus> {
  try {
    const workspaceId = focusId(await sources.context())
    const local = readSnapshot(await sources.snapshot('local'))
    let result: ConfirmedFocus
    if (workspaceId === null) {
      // Orca can return null for unresolved paired focus. An empty local catalog may list
      // "local" itself as omitted; check configured hosts as well because hidden rows do
      // not contribute to the snapshot's omitted-host entries.
      if (local.omitted.some(host => host !== 'local')
        || local.rows.some(row => row.isActive || !localHost(row))) invalidFocus()
      if (readPairedHosts(await sources.environmentList()).size) invalidFocus()
      result = null
    } else {
      const localMatches = local.rows.filter(row => row.id === workspaceId || row.identity === workspaceId)
      if (localMatches.length > 1) invalidFocus()
      const match = localMatches[0]
      // Orca's worker projects modern local Git workspaces with this host-qualified ID.
      // A paired catalog projects a raw ID, or a fallback identity qualified by its host.
      if (match && localHost(match) && match.identity === workspaceId && workspaceId.startsWith('identity:wt2:local:')) {
        result = localFocus(match, workspaceId)
      } else {
        // Raw IDs (including folder IDs) can be duplicated across environments.
        const hosts = readPairedHosts(await sources.environmentList())
        if (local.omitted.some(host => host !== 'local' && (!pairedEnvironment(host) || !hosts.has(host)))) invalidFocus()
        const remotes = await Promise.all([...hosts].map(async host => {
          const remote = readSnapshot(await sources.snapshot(host.slice('runtime:'.length)))
          if (remote.omitted.some(uncovered => uncovered !== 'local')) invalidFocus()
          return remote.rows.filter(row => matchesPairedRow(row, workspaceId, host)).length
        }))
        const remoteMatches = remotes.reduce((sum, size) => sum + size, 0)
        if (Number(!!match) + remoteMatches !== 1) invalidFocus()
        result = match && localHost(match) ? localFocus(match, workspaceId) : { kind: 'remote' }
      }
    }
    if (!sources.current() || workspaceId !== focusId(await sources.context()) || !sources.current()) invalidFocus()
    return result
  } catch {
    // Never return raw host/CLI errors to the frame.
    return invalidFocus()
  }
}
