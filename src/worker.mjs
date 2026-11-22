import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolveFocus } from './worktree/focus.ts'
import { openNoteLink } from './worktree/note-link-routing.ts'

// The installed CLI supplies complete workspace rows and their exact Orca addresses.
const cli = '/Applications/Orca.app/Contents/Resources/bin/orca'
function command(args) {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('Orca could not complete the request.'))
    execFile(cli, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) return fail()
      try {
        const response = JSON.parse(stdout)
        if (response?.ok === true) resolve(response)
        else fail()
      } catch { fail() }
    })
  })
}
function isOwnDevResponse(output, token) {
  try {
    const response = JSON.parse(output)
    return response?.ok === true && response.result?.result === token ? true : null
  } catch {
    return null
  }
}


export default function activate(orca) {
  const token = randomUUID()
  const root = fileURLToPath(new URL('..', import.meta.url))
  let devStatus
  let focusGeneration = 0
  orca.events.on('workspace.changed', () => { ++focusGeneration })
  const context = () => orca.host.call('workspace.readContext')
  const captureFocus = () => {
    const generation = focusGeneration
    const current = () => generation === focusGeneration
    return {
      context, current,
      environmentList: () => command(['environment', 'list', '--json']),
      snapshot: environment => command(['worktree', 'ps', '--environment', environment, '--limit', '10000', '--json']),
      currentWorkspace: async workspaceId => {
        try {
          return current() && (await context())?.workspaceId === workspaceId && current()
        } catch {
          return false
        }
      }
    }
  }
  orca.panels.handle('notes.openLink', async input => {
    if (typeof input?.scope !== 'string' || typeof input.href !== 'string') throw new Error('This note link is invalid.')
    const focus = captureFocus()
    await openNoteLink(input, {
      focus: () => resolveFocus(focus), current: focus.currentWorkspace, command,
      openFile: (workspaceId, path) => orca.host.call('editor.open', { workspaceId, path })
    })
    return null
  })
  orca.panels.handle('notes.devProbe', () => token)
  orca.panels.handle('notes.devStatus', () => {
    devStatus ??= new Promise(resolve => {
      execFile(cli, ['plugin', 'dev', 'request', root, 'notes.devProbe', '--environment', 'local', '--timeout-ms', '3000', '--json'], {
        encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024
      }, (error, stdout) => resolve(error ? null : isOwnDevResponse(stdout, token)))
    })
    return devStatus
  })
  orca.panels.handle('notes.focused', async () => {
    const focus = await resolveFocus(captureFocus(), captureFocus)
    if (focus === null) return null
    return focus.kind === 'local' ? focus.target : { unavailable: 'remote' }
  })
}
