# Verification

Run tests and checks only for code you trust. Orca can execute them locally without a sandbox. Do not change real user notes, settings, or storage to test failures. Use isolated in-memory storage and dedicated test notes. Confirm deletion only in an isolated store.

## Runtime, configuration, and dependencies

Run from the repository root:

```sh
npm run typecheck
npm run build
/Applications/Orca.app/Contents/Resources/bin/orca plugin test . --json
/Applications/Orca.app/Contents/Resources/bin/orca plugin check . --json
/Applications/Orca.app/Contents/Resources/bin/orca plugin validate . --json
```

The commands cover types, asset generation, behavior tests, plugin checks, and format validation. `validate` is offline and does not run plugin code. `plugin check` does not render this HTML panel. Test the relevant behavior in Orca too. Record Orca and Node versions, results, and checks you did not perform.

Pull request CI runs `npm ci`, `npm run build`, and `npm run test:release` on Ubuntu with Node.js 22. It does not run Orca-dependent typechecking or plugin checks, or render the panel. The release workflow builds assets for the version PR. It does not run those Orca checks or render the panel.

For release-tooling-only changes, run `npm run test:release`. These tests use temporary Git repositories and isolated GitHub API fixtures. They do not contact GitHub or require Orca. For documentation-only changes, check relative links and commands against current scripts and installed CLI help. Record those checks instead of running unrelated builds or behavior tests.

## Manual behavior

Use test notes and an approved disposable panel where native dialogs must be exercised. Use an isolated in-memory host for hostile inputs and injected storage failures.

- Save Source text and confirm `Saved`. Check Preview and reopening. Check that worktree transitions are read-only and keep text and undo isolated.
- Check character-limit boundaries and rejected-edit undo. Check separate limit and line-number controls, reload persistence, invalid drafts, delayed writes, failure rollback, and retry through normal interactions. Controls remain enabled during writes.
- Check settings and shortcut dialogs for Tab wrapping, Escape, and focus return. Check Enter continuation and exit for nested unordered, ordered, and task lists, literal fenced code, multiple cursors, and multiline paste.
- Toggle renderer-created tasks by click and Space. Check undo, focus, exact markers, save retry, duplicate tasks, CRLF/Unicode, stale events, and read-only transitions. Raw HTML inputs stay disabled. Check alignment in tight, loose, nested, ordered, quoted, and wrapped lists at narrow widths, including Chinese and Korean text.
- Check inline code, nested lists, and light, dark, and same-scheme theme changes. Known, aliased, unknown, and missing code languages must all retain escaped text and whitespace without syntax highlighting. Mermaid fences remain ordinary code. Check that Source Monaco Markdown tokenization remains intact. Check sanitization of raw HTML, JavaScript links, and images. Viewing must not write storage.
- In an isolated store, test deletion with queued saves, late loads, unloaded targets, partial failure and retry, preserved settings, and cleared editor models and undo.
- In an isolated store, test backup and restore with saved notes, failed and empty drafts, duplicate identities, conflicts, protection cancellation, limits, partial failures, and retry. Check stale selection during a delayed preview. Check native picker and save dialogs separately in an approved disposable panel.
