import { build } from 'esbuild'
import { mkdir, copyFile, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

await rm('dist', { recursive: true, force: true })
await mkdir('dist', { recursive: true })
const result = await build({
  entryPoints: { panel: 'src/panel.ts' },
  outdir: 'dist', bundle: true, format: 'esm', splitting: true, minify: true,
  target: 'es2022',
  external: ['orca', 'orca/*'], legalComments: 'linked', metafile: true
})
const require = createRequire(import.meta.url)
for (const [dependency, license, destination] of [
  ['marked', 'LICENSE.md', 'marked-LICENSE.txt'],
  ['dompurify', 'LICENSE', 'dompurify-LICENSE.txt'],
  ['dompurify', 'LICENSE-MPL', 'dompurify-LICENSE-MPL.txt']
]) {
  const source = new URL(`../${license}`, pathToFileURL(require.resolve(dependency)))
  await copyFile(source, `dist/${destination}`)
}

const runtimePackages = new Map()
const contributingInputs = new Set(Object.values(result.metafile.outputs).flatMap(output =>
  Object.entries(output.inputs).filter(([, contribution]) => contribution.bytesInOutput > 0).map(([input]) => input)))
for (const input of contributingInputs) {
  if (!input.includes('node_modules/')) continue
  let directory = dirname(resolve(input))
  while (directory.includes('node_modules')) {
    try {
      const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      if (metadata.name && metadata.version) { runtimePackages.set(directory, metadata); break }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    directory = dirname(directory)
  }
}
const index = []
await mkdir('dist/licenses')
for (const [directory, metadata] of runtimePackages) {
  const notices = (await readdir(directory)).filter(name => /^(licen[cs]e|copying|notice)([.-]|$)/i.test(name) && !/\.(?:[cm]?[jt]s|json|map)$/i.test(name))
  if (!notices.length) throw new Error(`No full license notice found for ${metadata.name}@${metadata.version}`)
  const prefix = `${metadata.name.replaceAll('/', '__').replaceAll('@', '')}-${metadata.version}`
  for (const notice of notices) await copyFile(join(directory, notice), `dist/licenses/${prefix}-${notice}`)
  index.push(`${metadata.name}@${metadata.version} (${metadata.license ?? 'see notice'}): ${notices.map(name => `${prefix}-${name}`).join(', ')}`)
}
await writeFile('dist/licenses/INDEX.txt', [...new Set(index)].sort().join('\n') + '\n')
