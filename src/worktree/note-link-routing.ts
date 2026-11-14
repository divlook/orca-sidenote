import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { noteKey, parseNoteKey } from '../protocol'
import { parseNoteLink } from '../markdown/note-links'
import { focusedTarget } from './focus'

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Orca returned invalid link routing information.')
  return value as Record<string, unknown>
}
function inside(root: string, path: string): boolean {
  const suffix = relative(root, path)
  return suffix !== '' && suffix !== '..' && !suffix.startsWith('..' + sep) && !isAbsolute(suffix)
}

export async function localNoteFile(root: string, destination: string): Promise<string> {
  const candidate = resolve(root, destination)
  if (!inside(root, candidate)) throw new Error('File links must stay inside this note’s worktree.')
  const [canonicalRoot, canonicalFile] = await Promise.all([realpath(root), realpath(candidate)])
  if (!inside(canonicalRoot, canonicalFile) || !(await stat(canonicalFile)).isFile()) throw new Error('File links must resolve to a file inside this note’s worktree.')
  return relative(canonicalRoot, canonicalFile).split(sep).join('/')
}

type RouteDependencies = {
  snapshot(): Promise<unknown>
  host(method: string, params?: unknown): Promise<unknown>
  command(args: string[]): Promise<unknown>
  current(): boolean
}
export async function openNoteLink(input: { scope: string; href: string }, dependencies: RouteDependencies): Promise<void> {
  const target = parseNoteKey(input.scope), link = parseNoteLink(input.href)
  if (link.kind === 'mail') throw new Error('Email links must open from the panel.')
  const snapshot = object(await dependencies.snapshot())
  const active = focusedTarget(snapshot)
  const assertCurrent = () => {
    if (!dependencies.current() || !active || noteKey(active) !== input.scope) throw new Error('The note’s worktree changed. Open the link again.')
  }
  assertCurrent()
  const result = object(snapshot.result)
  if (!Array.isArray(result.worktrees)) throw new Error('The complete worktree list is unavailable.')
  const matches = result.worktrees.map(object).filter(row => row.path === target.path && row.hostId === target.hostId)
  if (matches.length !== 1) throw new Error('The note’s worktree cannot be identified uniquely.')
  const address = object(matches[0].address)
  if (typeof address.environment !== 'string' || !address.environment || typeof address.worktree !== 'string' || !address.worktree) throw new Error('The note’s worktree has no verified Orca route.')
  if (link.kind === 'web') {
    assertCurrent()
    await dependencies.command(['tab', 'create', '--url', link.href, '--worktree', address.worktree, '--environment', address.environment, '--json'])
    return
  }
  if (address.environment !== 'local' || target.hostId !== null && target.hostId !== 'local') throw new Error('Remote file links are not supported. File links can only open from local worktrees.')
  const listed = object(await dependencies.host('workspace.list'))
  if (listed.truncated !== false || !Array.isArray(listed.workspaces)) throw new Error('The complete Orca workspace list is unavailable.')
  const workspaces = listed.workspaces.map(object).filter(row => row.path === target.path && row.hostId === target.hostId)
  if (workspaces.length !== 1 || typeof workspaces[0].id !== 'string' || !workspaces[0].id) throw new Error('The note’s editor workspace cannot be identified uniquely.')
  assertCurrent()
  const path = await localNoteFile(target.path, link.path)
  assertCurrent()
  const opened = object(await dependencies.host('editor.open', { workspaceId: workspaces[0].id, path }))
  if (opened.opened !== true) throw new Error('Orca did not open the file.')
}
