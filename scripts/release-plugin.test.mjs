import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { releasePlugin, githubApi } from './release-plugin.mjs'

const repository = 'owner/plugin'
async function fixture(t, { merge = false } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'plugin-release-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main')
  git('config', 'user.name', 'Fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ version: '0.1.0', private: true }))
  git('add', '.'); git('commit', '-m', 'Initial')
  if (merge) git('checkout', '-b', 'changeset-release/main')
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ version: '0.2.0', private: true }))
  await writeFile(join(cwd, 'orca-plugin.json'), JSON.stringify({ version: '0.2.0' }))
  await writeFile(join(cwd, 'package-lock.json'), JSON.stringify({ version: '0.2.0', packages: { '': { version: '0.2.0' } } }))
  await writeFile(join(cwd, 'CHANGELOG.md'), '# plugin\n\n## 0.2.0\n\n### Minor Changes\n\n- New feature\n\n## 0.1.0\n\nOld notes\n')
  git('add', '.'); git('commit', '-m', 'Release plugin')
  if (merge) { git('checkout', 'main'); git('merge', '--no-ff', 'changeset-release/main', '-m', 'Merge release') }
  const sha = git('rev-parse', 'HEAD')
  await writeFile(join(cwd, 'later.txt'), 'later')
  git('add', '.'); git('commit', '-m', 'Later main work')
  const event = { pull_request: { merged: true, merge_commit_sha: sha,
    base: { ref: 'main', repo: { full_name: repository } },
    head: { ref: 'changeset-release/main', repo: { full_name: repository } } } }
  const state = { ref: null, release: null, calls: [] }
  const api = async (method, path, body) => {
    state.calls.push({ method, path, body })
    if (method === 'GET' && path === 'git/ref/tags/v0.2.0') return state.ref
    if (method === 'GET' && path === 'releases/tags/v0.2.0') return state.release
    if (method === 'POST' && path === 'git/refs') return (state.ref = { object: { type: 'commit', sha: body.sha } })
    if (method === 'POST' && path === 'releases') return (state.release = body)
    throw new Error(`Unexpected fixture request ${method} ${path}`)
  }
  return { cwd, event, repository, api, sha, state }
}

test('ordinary pushes and unrelated/unmerged/fork PRs cannot release', async () => {
  const fail = () => { throw new Error('API must not be called') }
  for (const event of [{}, { pull_request: { merged: false } },
    { pull_request: { merged: true, base: { ref: 'main', repo: { full_name: repository } }, head: { ref: 'feature', repo: { full_name: repository } } } },
    { pull_request: { merged: true, base: { ref: 'main', repo: { full_name: repository } }, head: { ref: 'changeset-release/main', repo: { full_name: 'fork/plugin' } } } }]) {
    assert.deepEqual(await releasePlugin({ event, repository, api: fail }), { skipped: true })
  }
})

for (const merge of [false, true]) test(`release uses exact ${merge ? 'merge' : 'squash/rebase final'} commit and changelog; repeats no-op`, async t => {
  const f = await fixture(t, { merge })
  assert.deepEqual(await releasePlugin(f), { tag: 'v0.2.0', sha: f.sha, created: true })
  assert.equal(f.state.ref.object.sha, f.sha)
  assert.equal(f.state.release.target_commitish, f.sha)
  assert.equal(f.state.release.body, '### Minor Changes\n\n- New feature')
  await releasePlugin(f)
  assert.equal(f.state.calls.filter(call => call.method === 'POST').length, 2)
})

test('existing correct tag recovers missing release; conflicting tag never moves', async t => {
  const f = await fixture(t)
  f.state.ref = { object: { type: 'commit', sha: 'a'.repeat(40) } }
  await assert.rejects(releasePlugin(f), /points to another commit/)
  assert.equal(f.state.calls.filter(call => call.method === 'POST').length, 0)
  f.state.ref.object.sha = f.sha
  await releasePlugin(f)
  assert.equal(f.state.calls.filter(call => call.method === 'POST').length, 1)
})

test('release failures propagate and rerun recovers the already-created tag', async t => {
  const f = await fixture(t)
  await assert.rejects(releasePlugin({ ...f, api: (method, path, body) => {
    if (path === 'releases' && method === 'POST') throw new Error('API unavailable')
    return f.api(method, path, body)
  } }), /API unavailable/)
  assert.ok(f.state.ref)
  await releasePlugin(f)
  assert.equal(f.state.calls.filter(call => call.path === 'git/refs').length, 1)
})

test('draft releases fail rather than masquerade as successful publication', async t => {
  const f = await fixture(t)
  f.state.ref = { object: { type: 'commit', sha: f.sha } }
  f.state.release = { draft: true }
  await assert.rejects(releasePlugin(f), /draft or prerelease/)
})

test('HTTP adapter treats only GET 404 as absent and propagates API failures', async () => {
  const api = status => githubApi({ repository, token: 'fixture', fetch: async () => new Response('{"message":"failure"}', { status }) })
  assert.equal(await api(404)('GET', 'releases/tags/v0.2.0'), null)
  for (const [method, status] of [['GET', 403], ['GET', 500], ['POST', 404], ['POST', 422]]) {
    await assert.rejects(api(status)(method, 'git/refs'), new RegExp(`failed \\(${status}\\)`))
  }
})
