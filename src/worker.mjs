import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { focusedTarget } from './worktree/focus.ts'
import { openNoteLink } from './worktree/note-link-routing.ts'

// Use this installation's CLI: the plugin context API omits the focused workspace ID.
const cli = '/Applications/Orca.app/Contents/Resources/bin/orca'
function command(args) {
  return new Promise((resolve, reject) => {
    execFile(cli, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) { reject(new Error(stdout || error.message)); return }
        try {
          const response = JSON.parse(stdout)
          if (response.ok !== true) throw new Error('Orca could not open the note link.')
          resolve(response)
        } catch (failure) { reject(failure) }
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
  orca.panels.handle('notes.openLink', input => {
    const generation = focusGeneration
    return openNoteLink(input, {
      snapshot: () => command(['worktree', 'ps', '--environment', 'local', '--limit', '10000', '--json']),
      host: (method, params) => orca.host.call(method, params),
      command, current: () => generation === focusGeneration
    }).then(() => null)
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
    const output = await new Promise((resolve, reject) => {
      execFile(cli, ['worktree', 'ps', '--environment', 'local', '--limit', '10000', '--json'], {
        encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024
      }, (error, stdout) => error ? reject(new Error(stdout || error.message)) : resolve(stdout))
    })
    return focusedTarget(JSON.parse(output))
  })
}
