import { mkdtemp, readdir, realpath } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

async function findTests(directory, relative = '') {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await findTests(join(directory, entry.name), name))
    else if (entry.isFile() && entry.name.endsWith('.test.ts')) files.push(name)
  }
  return files
}
const files = (await findTests('src')).sort()
const directory = await realpath(await mkdtemp(join(tmpdir(), 'sidenote-model-tests-')))
process.on('exit', () => rmSync(directory, { recursive: true, force: true }))
const outfile = join(directory, 'model-tests.mjs')
await build({
  stdin: { contents: files.map(name => `import './src/${name}'`).join('\n'), resolveDir: process.cwd() },
  outfile, bundle: true, format: 'esm', platform: 'node', sourcemap: true
})
await import(pathToFileURL(outfile).href)
