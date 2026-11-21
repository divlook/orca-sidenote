import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { noteKey } from '../protocol.ts'
import { parseNoteLink } from '../markdown/note-links.ts'
import type { ConfirmedFocus } from './focus.ts'

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
  focus(): Promise<ConfirmedFocus>
  openFile(workspaceId: string, path: string): Promise<unknown>
  command(args: string[]): Promise<unknown>
  current(workspaceId: string): Promise<boolean>
}
export async function openNoteLink(input: { scope: string; href: string }, dependencies: RouteDependencies): Promise<void> {
  const link = parseNoteLink(input.href)
  if (link.kind === 'mail') throw new Error('Email links must open from the panel.')
  const active = await dependencies.focus()
  if (active?.kind === 'remote' && link.kind === 'file') {
    throw new Error('Remote file links are not supported. File links can only open from local worktrees.')
  }
  if (active?.kind !== 'local' || noteKey(active.target) !== input.scope) {
    throw new Error('The note’s worktree changed. Open the link again.')
  }
  const assertCurrent = async () => {
    if (!await dependencies.current(active.workspaceId)) {
      throw new Error('The note’s worktree changed. Open the link again.')
    }
  }
  if (link.kind === 'web') {
    if (!active.worktree) throw new Error('The note’s worktree has no verified Orca route.')
    await assertCurrent()
    await dependencies.command(['tab', 'create', '--url', link.href, '--worktree', active.worktree, '--environment', 'local', '--json'])
    return
  }
  const path = await localNoteFile(active.target.path, link.path)
  await assertCurrent()
  const opened = object(await dependencies.openFile(active.workspaceId, path))
  if (opened.opened !== true) throw new Error('Orca did not open the file.')
}
