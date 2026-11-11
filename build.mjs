import { build } from 'esbuild'
import { mkdir, copyFile, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import ttf2woff from 'ttf2woff'

// Orca community plugins permit WOFF, but not Monaco's original TTF asset.
const monacoFont = {
  name: 'monaco-woff',
  setup(build) {
    build.onLoad({ filter: /[/\\]codicon[/\\]codicon\.css$/ }, async ({ path }) => {
      const css = await readFile(path, 'utf8')
      const source = 'url(./codicon.ttf) format("truetype")'
      if (!css.includes(source)) throw new Error('Monaco codicon font declaration changed; review WOFF conversion')
      return {
        contents: css.replace(source, 'url(./codicon.woff) format("woff")'),
        loader: 'css', resolveDir: resolve(path, '..')
      }
    })
    build.onResolve({ filter: /^\.\/codicon\.woff$/ }, ({ resolveDir }) => ({
      path: resolve(resolveDir, 'codicon.woff'), namespace: 'monaco-woff'
    }))
    build.onLoad({ filter: /\.woff$/, namespace: 'monaco-woff' }, async ({ path }) => ({
      contents: Buffer.from(ttf2woff(await readFile(path.replace(/\.woff$/, '.ttf')))),
      loader: 'file'
    }))
  }
}

await rm('dist', { recursive: true, force: true })
await mkdir('dist', { recursive: true })
const result = await build({
  entryPoints: { panel: 'src/panel.ts', 'editor.worker': 'src/editor.worker.ts' },
  outdir: 'dist', bundle: true, format: 'esm', splitting: true, minify: true,
  target: 'es2022', assetNames: 'assets/[name]-[hash]', plugins: [monacoFont],
  external: ['orca', 'orca/*'], legalComments: 'linked', metafile: true
})
const diagramResult = await build({
  entryPoints: ['src/diagram.ts'], outfile: 'dist/diagram.js',
  bundle: true, format: 'esm', minify: true, target: 'es2022',
  inject: ['src/diagram-document.ts'], legalComments: 'linked', metafile: true
})
await copyFile('node_modules/monaco-editor/LICENSE', 'dist/monaco-LICENSE.txt')
await copyFile('node_modules/monaco-editor/ThirdPartyNotices.txt', 'dist/monaco-ThirdPartyNotices.txt')

// Resolve Monaco's own copies, which can differ from the preview dependencies.
const require = createRequire(import.meta.url)
const monacoRequire = createRequire(new URL('./node_modules/monaco-editor/package.json', import.meta.url))
for (const [resolver, dependency, license, destination] of [
  [require, 'marked', 'LICENSE.md', 'marked-LICENSE.txt'],
  [require, 'dompurify', 'LICENSE', 'dompurify-LICENSE.txt'],
  [monacoRequire, 'marked', 'LICENSE.md', 'monaco-marked-LICENSE.txt'],
  [monacoRequire, 'dompurify', 'LICENSE', 'monaco-dompurify-LICENSE.txt'],
  [monacoRequire, 'dompurify', 'LICENSE-MPL', 'monaco-dompurify-LICENSE-MPL.txt']
]) {
  const source = new URL(`../${license}`, pathToFileURL(resolver.resolve(dependency)))
  await copyFile(source, `dist/${destination}`)
}

// Include full notices only for packages that contributed code to these bundles.
// Metafile inputs include Mermaid's locally bundled diagram implementations.
const runtimePackages = new Map()
for (const input of [...Object.keys(result.metafile.inputs), ...Object.keys(diagramResult.metafile.inputs)]) {
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
