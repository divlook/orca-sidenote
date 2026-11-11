import { readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

// Changesets owns the version and changelog; Orca also needs it in the manifest.
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const pkg = await readJson('package.json')
const manifest = await readJson('orca-plugin.json')
const lock = await readJson('package-lock.json')
if (pkg.private !== true || manifest.version !== pkg.version ||
    lock.version !== pkg.version || lock.packages[''].version !== pkg.version) {
  throw new Error('Expected a private package with matching package, manifest, and lockfile versions')
}

// Only these release files can change. Restore consumed entries too if sync fails.
const entries = (await readdir('.changeset')).filter(name => name.endsWith('.md'))
const paths = ['package.json', 'package-lock.json', 'orca-plugin.json', 'CHANGELOG.md',
  ...entries.map(name => `.changeset/${name}`)]
const before = new Map()
for (const path of paths) {
  try { before.set(path, await readFile(path)) }
  catch (error) {
    if (error.code !== 'ENOENT' || path !== 'CHANGELOG.md') throw error
    before.set(path, null)
  }
}

try {
  const require = createRequire(import.meta.url)
  const result = spawnSync(process.execPath, [require.resolve('@changesets/cli/bin.js'), 'version'], {
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Changesets version failed (${result.signal ?? result.status})`)
  const { version } = await readJson('package.json')
  if (version !== pkg.version) {
    // No dependency specs change in this single-package release: update only root metadata.
    const manifestText = before.get('orca-plugin.json').toString()
    await writeFile('orca-plugin.json', manifestText.replace(
      /("version"\s*:\s*")[^"]+(")/, (_, prefix, suffix) => `${prefix}${version}${suffix}`
    ))
    lock.version = version
    lock.packages[''].version = version
    await writeFile('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`)
  }
} catch (error) {
  for (const [path, contents] of before) {
    if (contents === null) await rm(path, { force: true })
    else await writeFile(path, contents)
  }
  throw error
}
