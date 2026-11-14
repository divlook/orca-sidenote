/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseNoteLink } from '../markdown/note-links'
import { noteKey } from '../protocol'
import { localNoteFile, openNoteLink } from './note-link-routing'
import { NotePreferences } from '../settings/note-preferences'
import { WEB_LINK_OPENING_KEY } from '../settings/note-settings'

test('note link parser confines protocols and decodes file paths exactly once', () => {
  assert.deepEqual(parseNoteLink('file:///root/a%20b.md'), { kind: 'file', path: '/root/a b.md' })
  assert.deepEqual(parseNoteLink('docs/a.md'), { kind: 'file', path: 'docs/a.md' })
  assert.equal(parseNoteLink('https://example.com/a?q=1#part').kind, 'web')
  assert.equal(parseNoteLink('mailto:a@example.com').kind, 'mail')
  for (const href of ['javascript:alert(1)', 'data:text/plain,x', 'https:example.com', '//host/file', 'file://host/a', 'file:////host/a', 'a%2fb', 'a%5Cb', 'a%00b', 'a%252fb', 'a#part', 'a?q=1', 'a\\b', '%', ' https://example.com']) {
    assert.throws(() => parseNoteLink(href), Error, href)
  }
})

test('local files return editor-relative canonical paths and reject symlink escape', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sidenote-links-'))
  try {
    const root = join(directory, 'root')
    await mkdir(root); await writeFile(join(root, 'a b.md'), 'synthetic')
    await writeFile(join(directory, 'outside.md'), 'synthetic')
    await symlink(join(directory, 'outside.md'), join(root, 'escape.md'))
    await symlink(join(root, 'a b.md'), join(root, 'inside.md'))
    assert.equal(await localNoteFile(root, 'a b.md'), 'a b.md')
    assert.equal(await localNoteFile(root, join(root, 'a b.md')), 'a b.md')
    assert.equal(await localNoteFile(root, 'inside.md'), 'a b.md')
    for (const path of ['../outside.md', 'escape.md', '.', 'missing.md']) await assert.rejects(localNoteFile(root, path))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

function fixture(hostId: string | null = null, path = '/synthetic/root') {
  const target = { hostId, path }
  const row = { ...target, isActive: true, address: { environment: hostId ? 'paired-authoritative' : 'local', worktree: 'identity:exact' } }
  const snapshot = { ok: true, result: { truncated: false, worktrees: [row] } }
  const commands: string[][] = [], calls: string[] = []
  let current = true
  const dependencies = {
    snapshot: async () => snapshot,
    host: async (method: string) => { calls.push(method); return { truncated: false, workspaces: [{ ...target, id: 'workspace-exact' }] } },
    command: async (args: string[]) => { commands.push(args); return null },
    current: () => current
  }
  return { target, row, snapshot, commands, calls, dependencies, stale: () => { current = false }, input: { scope: noteKey(target), href: 'https://example.com/' } }
}
test('internal web routing copies authoritative remote address and always creates a tab', async () => {
  const f = fixture('ssh:opaque-host')
  await openNoteLink(f.input, f.dependencies)
  assert.deepEqual(f.commands, [['tab', 'create', '--url', 'https://example.com/', '--worktree', 'identity:exact', '--environment', 'paired-authoritative', '--json']])
  assert.deepEqual(f.calls, [])
})
test('routing rejects truncated ambiguous stale missing-address and cross-host snapshots', async () => {
  for (const scenario of ['truncated', 'ambiguous', 'stale', 'address', 'host']) {
    const f = fixture()
    if (scenario === 'truncated') f.snapshot.result.truncated = true
    if (scenario === 'ambiguous') f.snapshot.result.worktrees.push({ ...f.row })
    if (scenario === 'stale') f.stale()
    if (scenario === 'address') f.row.address.environment = ''
    if (scenario === 'host') f.row.hostId = 'other-host'
    await assert.rejects(openNoteLink(f.input, f.dependencies))
    assert.equal(f.commands.length, 0)
  }
})
test('remote file links are unsupported without workspace lookup or opening a destination', async () => {
  for (const [hostId, environment] of [
    ['ssh:opaque-host', 'paired-authoritative'],
    ['ssh:opaque-host', 'local'],
    [null, 'paired-authoritative'],
  ] as const) {
    const f = fixture(hostId)
    f.row.address.environment = environment
    for (const href of ['a.md', '/synthetic/root/a.md', 'file:///synthetic/root/a.md']) {
      await assert.rejects(openNoteLink({ ...f.input, href }, f.dependencies), Error)
    }
    assert.deepEqual(f.calls, []); assert.deepEqual(f.commands, [])
  }
})
test('scope change during asynchronous workspace lookup rejects editor opening', async () => {
  const f = fixture()
  f.dependencies.host = async () => { f.stale(); return { truncated: false, workspaces: [{ ...f.target, id: 'workspace-exact' }] } }
  await assert.rejects(openNoteLink({ ...f.input, href: 'a.md' }, f.dependencies))
  assert.deepEqual(f.commands, [])
})
test('local editor routing sends a relative path and rejects incomplete or ambiguous host lists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sidenote-route-'))
  try {
    await writeFile(join(root, 'a.md'), 'synthetic')
    const f = fixture(null, root)
    const calls: { method: string; params: unknown }[] = []
    const dependencies = { ...f.dependencies, host: async (method: string, params?: unknown) => {
      calls.push({ method, params })
      return method === 'workspace.list' ? { truncated: false, workspaces: [{ ...f.target, id: 'exact' }] } : { opened: true }
    } }
    await openNoteLink({ ...f.input, href: 'a.md' }, dependencies)
    assert.deepEqual(calls.at(-1), { method: 'editor.open', params: { workspaceId: 'exact', path: 'a.md' } })
    for (const listed of [{ truncated: true, workspaces: [] }, { truncated: false, workspaces: [{ ...f.target, id: 'a' }, { ...f.target, id: 'b' }] }]) {
      await assert.rejects(openNoteLink({ ...f.input, href: 'a.md' }, { ...dependencies, host: async () => listed }))
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('web preference defaults independently, rolls back, retries and preserves note data', async () => {
  const values = new Map<string, unknown>([['note:v1:synthetic', 'untouched']])
  let fail = false
  const store = { get: async (key: string) => values.get(key) ?? null, set: async (key: string, value: unknown) => { if (fail) throw new Error('write failed'); values.set(key, value) } }
  const preferences = new NotePreferences(store, () => {})
  await preferences.loaded
  assert.equal(preferences.view.webLinkOpening, 'external')
  await preferences.chooseWebLinkOpening('ask')
  fail = true; await preferences.chooseWebLinkOpening('orca')
  assert.equal(preferences.view.webLinkOpening, 'ask'); assert.equal(preferences.view.ready, true)
  fail = false; await preferences.chooseWebLinkOpening('orca')
  assert.equal(values.get(WEB_LINK_OPENING_KEY), 'orca')
  assert.equal(values.get('note:v1:synthetic'), 'untouched')
  values.set(WEB_LINK_OPENING_KEY, 'invalid')
  const invalid = new NotePreferences(store, () => {}); await invalid.loaded
  assert.equal(invalid.view.webLinksReady, false); assert.equal(invalid.view.ready, true)
})
