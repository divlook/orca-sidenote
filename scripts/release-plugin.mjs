import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export async function releasePlugin({ event, repository, api, cwd = process.cwd() }) {
  const pr = event.pull_request
  if (!pr?.merged || pr.base?.ref !== 'main' ||
      pr.base?.repo?.full_name !== repository || pr.head?.repo?.full_name !== repository ||
      pr.head?.ref !== 'changeset-release/main') return { skipped: true }
  const sha = pr.merge_commit_sha
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('Missing merged commit SHA')
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const json = path => JSON.parse(git('show', `${sha}:${path}`))
  const pkg = json('package.json')
  const version = pkg.version
  if (!/^\d+\.\d+\.\d+$/.test(version) || pkg.private !== true) {
    throw new Error('Expected a stable version of the private plugin')
  }
  const lock = json('package-lock.json')
  if (json('orca-plugin.json').version !== version || lock.version !== version ||
      lock.packages[''].version !== version) throw new Error('Release versions do not match')
  if (JSON.parse(git('show', `${sha}^:package.json`)).version === version) {
    throw new Error('Release commit must change the package version')
  }
  const changelog = git('show', `${sha}:CHANGELOG.md`)
  const heading = `## ${version}`
  const lines = changelog.split('\n')
  const start = lines.indexOf(heading)
  if (start < 0) throw new Error(`Missing changelog entry for ${version}`)
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim()
  if (!body) throw new Error('Release notes are empty')

  const tag = `v${version}`
  const tagPath = `git/ref/tags/${tag}`
  const ref = await api('GET', tagPath)
  if (ref) {
    let object = ref.object
    while (object.type === 'tag') object = (await api('GET', `git/tags/${object.sha}`)).object
    if (object.type !== 'commit' || object.sha !== sha) throw new Error(`${tag} points to another commit`)
  } else {
    await api('POST', 'git/refs', { ref: `refs/tags/${tag}`, sha })
  }
  const release = await api('GET', `releases/tags/${tag}`)
  if (release) {
    if (release.draft || release.prerelease) throw new Error(`${tag} already has a draft or prerelease; review it manually`)
    return { tag, sha, created: false }
  }
  await api('POST', 'releases', { tag_name: tag, target_commitish: sha, name: tag, body,
    draft: false, prerelease: false })
  return { tag, sha, created: true }
}

export function githubApi({ repository, token, fetch = globalThis.fetch }) {
  return async (method, path, body) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    if (method === 'GET' && response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub ${method} ${path} failed (${response.status}): ${await response.text()}`)
    return response.json()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN } = process.env
  if (!GITHUB_EVENT_PATH || !GITHUB_REPOSITORY || !GITHUB_TOKEN) throw new Error('GitHub event, repository, and token are required')
  const event = JSON.parse(await readFile(GITHUB_EVENT_PATH, 'utf8'))
  console.log(await releasePlugin({ event, repository: GITHUB_REPOSITORY,
    api: githubApi({ repository: GITHUB_REPOSITORY, token: GITHUB_TOKEN }) }))
}
