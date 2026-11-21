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
import type { ConfirmedFocus } from './focus'

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

function fixture(path = '/synthetic/root') {
  const target = { hostId: 'local', path }
  const route = { kind: 'local', target, workspaceId: 'identity:wt2:local:exact', worktree: 'identity:wt2:local:exact' } as const
  const commands: string[][] = [], calls: { workspaceId: string; path: string }[] = []
  const state: { focus: ConfirmedFocus; current: boolean } = { focus: route, current: true }
  const dependencies = {
    focus: async () => state.focus,
    openFile: async (workspaceId: string, path: string) => { calls.push({ workspaceId, path }); return { opened: true } },
    command: async (args: string[]) => { commands.push(args); return null },
    current: async () => state.current
  }
  return { state, route, commands, calls, dependencies, input: { scope: noteKey(target), href: 'https://example.com/' } }
}

test('Orca web links use the verified local address and create a new tab', async () => {
  const f = fixture()
  await openNoteLink(f.input, f.dependencies)
  assert.deepEqual(f.commands, [['tab', 'create', '--url', 'https://example.com/', '--worktree', f.route.worktree, '--environment', 'local', '--json']])
  assert.deepEqual(f.calls, [])
})

test('routing rejects no focus, changed host, stale focus and unavailable addresses', async () => {
  for (const scenario of ['idle', 'host', 'stale', 'address']) {
    const f = fixture()
    if (scenario === 'idle') f.state.focus = null
    if (scenario === 'host') f.state.focus = { ...f.route, target: { ...f.route.target, hostId: null } }
    if (scenario === 'stale') f.state.current = false
    if (scenario === 'address') f.state.focus = { ...f.route, worktree: undefined }
    await assert.rejects(openNoteLink(f.input, f.dependencies))
    assert.deepEqual(f.commands, [])
  }
})

test('remote focus cannot open a file or reroute a local web link', async () => {
  const f = fixture()
  f.state.focus = { kind: 'remote' }
  for (const href of ['a.md', '/synthetic/root/a.md', 'file:///synthetic/root/a.md']) {
    await assert.rejects(openNoteLink({ ...f.input, href }, f.dependencies), /Remote file links are not supported/)
  }
  await assert.rejects(openNoteLink(f.input, f.dependencies), /worktree changed/)
  assert.deepEqual(f.calls, []); assert.deepEqual(f.commands, [])
})

test('local editor uses the confirmed workspace ID and relative path, and rechecks after path lookup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sidenote-route-'))
  try {
    await writeFile(join(root, 'a.md'), 'synthetic')
    const f = fixture(root)
    const input = { ...f.input, href: 'a.md' }
    await openNoteLink(input, f.dependencies)
    assert.deepEqual(f.calls, [{ workspaceId: f.route.workspaceId, path: 'a.md' }])
    f.state.current = false
    await assert.rejects(openNoteLink(input, f.dependencies), /worktree changed/)
    assert.equal(f.calls.length, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('web preference defaults independently, rolls back, retries and preserves note data', async () => {
  const values = new Map<string, unknown>([['note:v1:synthetic', 'untouched']])
  let fail = false
  const store = { get: async (key: string) => values.get(key) ?? null, set: async (key: string, value: unknown) => { if (fail) throw new Error('write failed'); values.set(key, value) } }
  const preferences = new NotePreferences(store, () => {})
  await preferences.initialize()
  assert.equal(preferences.view.webLinkOpening, 'external')
  await preferences.chooseWebLinkOpening('ask')
  fail = true; await preferences.chooseWebLinkOpening('orca')
  assert.equal(preferences.view.webLinkOpening, 'ask'); assert.equal(preferences.view.ready, true)
  fail = false; await preferences.chooseWebLinkOpening('orca')
  assert.equal(values.get(WEB_LINK_OPENING_KEY), 'orca')
  assert.equal(values.get('note:v1:synthetic'), 'untouched')
  values.set(WEB_LINK_OPENING_KEY, 'invalid')
  const invalid = new NotePreferences(store, () => {}); await invalid.initialize()
  assert.equal(invalid.view.webLinksReady, false); assert.equal(invalid.view.ready, true)
})
