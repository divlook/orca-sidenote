import { execFile } from 'node:child_process'
import { focusedTarget } from './focus.ts'

// Use this installation's CLI: the plugin context API omits the focused workspace ID.
const cli = '/Applications/Orca.app/Contents/Resources/bin/orca'

export default function activate(orca) {
  orca.panels.handle('notes.focused', async () => {
    const output = await new Promise((resolve, reject) => {
      execFile(cli, ['worktree', 'ps', '--environment', 'local', '--limit', '10000', '--json'], {
        encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024
      }, (error, stdout) => error ? reject(new Error(stdout || error.message)) : resolve(stdout))
    })
    return focusedTarget(JSON.parse(output))
  })
}
