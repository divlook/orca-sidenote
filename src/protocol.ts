export type NoteTarget = { path: string; hostId: string | null; project?: string; worktree?: string }

export const NOTE_KEY_PREFIX = 'note:v1:'

export function parseNoteKey(key: string): { hostId: string | null; path: string } {
  if (!key.startsWith(NOTE_KEY_PREFIX)) throw new Error('Invalid note identity.')
  const pair: unknown = JSON.parse(key.slice(NOTE_KEY_PREFIX.length))
  if (!Array.isArray(pair) || pair.length !== 2 || (pair[0] !== null && typeof pair[0] !== 'string')
    || typeof pair[1] !== 'string' || pair[1].length === 0 || noteKey({ hostId: pair[0], path: pair[1] }) !== key) {
    throw new Error('A stored note identity cannot be exported without changing it.')
  }
  return { hostId: pair[0], path: pair[1] }
}

export function noteKey(workspace: NoteTarget): string {
  return NOTE_KEY_PREFIX + JSON.stringify([workspace.hostId, workspace.path])
}

declare module 'orca' {
  interface PluginRequests {
    'notes.focused': { output: NoteTarget | null }
    'notes.devStatus': { output: true | null }
    'notes.openLink': { input: { scope: string; href: string }; output: null }
  }
}
