export type NoteTarget = { path: string; hostId: string | null; project?: string; worktree?: string }

export function noteKey(workspace: NoteTarget): string {
  return 'note:v1:' + JSON.stringify([workspace.hostId, workspace.path])
}

export const EDITOR_WORKER_READY = 'sidenote-worker-ready'

declare module 'orca' {
  interface PluginRequests {
    'notes.focused': { output: NoteTarget | null }
  }
}
