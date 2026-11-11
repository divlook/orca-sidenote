import type { NoteTarget } from './protocol'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function focusedTarget(snapshot: unknown): NoteTarget | null {
  if (!record(snapshot) || snapshot.ok !== true || !record(snapshot.result)) {
    throw new Error('The current worktree information cannot be read.')
  }
  const result = snapshot.result
  if (result.truncated !== false || !Array.isArray(result.worktrees)) {
    throw new Error('The complete worktree list is unavailable.')
  }
  let target: NoteTarget | null = null
  for (const row of result.worktrees) {
    if (!record(row) || typeof row.isActive !== 'boolean') throw new Error('The worktree information has an invalid format.')
    if (!row.isActive) continue
    if (target) throw new Error('The current worktree cannot be identified uniquely.')
    if (typeof row.path !== 'string' || !row.path || (row.hostId !== null && typeof row.hostId !== 'string')) {
      throw new Error('The current worktree path cannot be determined.')
    }
    target = { path: row.path, hostId: row.hostId }
    if (typeof row.repo === 'string' && row.repo.trim()) target.project = row.repo
    if (typeof row.displayName === 'string' && row.displayName.trim()) target.worktree = row.displayName
    else if (typeof row.branch === 'string' && row.branch.trim()) target.worktree = row.branch.replace(/^refs\/heads\//, '')
  }
  return target
}
