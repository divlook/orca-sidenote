# Verification

Run tests and checks only for code you trust. Orca can execute them locally without a sandbox. Do not change real user notes, settings, or storage to test failures. Use isolated in-memory storage and dedicated test notes. Confirm deletion only in an isolated store.

## Refactor verification outcomes

On macOS with Node.js v24.21.0, canonical `npm test` passed 75/75 with no skipped or todo tests. Original scenarios remained alongside the delayed preference-load publication regression. After the `rawEdit` move, affected typechecking, the Source editor suite (19/19), and the production build passed. The final popup repair also passed typechecking and the build. Offline plugin validation passed after undersized gallery assets were replaced with larger screenshots.

The actual compiled panel ran in Chromium with an isolated in-memory host. Surviving cards retained their DOM, editor identity, and undo across deletion; queued typing prevented unsafe empty-card pruning. A file-input restore preserved order and exact CRLF text, with unchanged notes retaining undo and changed notes receiving fresh history. Preview rendered single-newline breaks while blocking scripts, images, and executable JavaScript links. The Source menu retained focus ownership without prematurely pruning blank cards or switching nonempty cards to Reading; outside focus still triggered the appropriate behavior.

Browser clipboard and file-save bridges were synthetic fixtures. Installed Orca permissions, native clipboard, native file dialogs, and native IME were not tested. No real notes or settings were read or changed.

## Runtime, configuration, and dependencies

Run from the repository root:

```sh
npm run typecheck
npm test
npm run build
/Applications/Orca.app/Contents/Resources/bin/orca plugin check . --json
/Applications/Orca.app/Contents/Resources/bin/orca plugin validate . --json
```

The commands cover types, asset generation, portable behavior tests, plugin checks, and format validation. `validate` is offline and does not run plugin code. `plugin check` does not render this HTML panel. Test the relevant behavior in Orca too. Record Orca and Node versions, results, and checks you did not perform.

Pull request CI runs `npm ci`, `npm run build`, and `npm test` on Ubuntu with Node.js 22. The test command runs the TypeScript model cases bundled for Node, the Source editor cases, and release-tooling cases. Editor tests check raw separators, history, uncapped large edits, readiness rejection, composition annotations and multicursor editing. CI does not run Orca-dependent typechecking or plugin checks, or render the panel. The release workflow builds assets for the version PR. It does not run those Orca checks or render the panel.

For a focused run, use `npm run test:model`, `npm run test:editor`, or `npm run test:release`. Release tests use temporary Git repositories and isolated GitHub API fixtures. They do not contact GitHub or require Orca. For documentation-only changes, check relative links and commands against current scripts and installed CLI help. Record those checks instead of running unrelated builds or behavior tests.

## Manual behavior

Use test notes and an approved disposable panel where native dialogs must be exercised. Use an isolated in-memory host for hostile inputs and injected storage failures.

- Add from the heading icon and bottom button: each appends an expanded editable blank card, scrolls to it, and focuses its body even while storage is slow. Empty locations do not create a card automatically. Check independently growing cards, one vertical list scrollbar, horizontal Preview code scrolling, and sticky card toolbars without a maximum content width.
- Mix reading and editing cards, minimize them, change mode while minimized, expand, reorder with grip drag and keyboard, and switch worktrees. Check stable note IDs, persisted order, cursor, selection, undo and content isolation. Check first-block summaries for multiline paragraphs, lists/tasks, headings, fenced code with language labels, leading empty blocks, and empty notes. Nonempty notes have a literal `...` suffix, including short summaries; the original body stays unchanged.
- Check default per-note confirmation, cancel, successful deletion of only the captured ID, context changes while confirming, failed deletion recovery, immediate deletion when confirmation is Off, re-enabling, and no deletion from changing the setting. The bulk-delete confirmation remains separate.
- Edit past 8,000 characters without a cap or counter. Check independent line-number and deletion-confirmation controls, reload persistence, delayed writes, failed-write rollback, and retry. Check real autosave errors retain full drafts and offer retry without normal pending/success labels. Controls remain enabled during normal writes.
- Check settings and shortcut dialogs for Tab wrapping, Escape, and focus return. Check Enter continuation and exit for nested unordered, ordered, and task lists, literal fenced code, multiple cursors, and multiline paste.
- Toggle renderer-created tasks by click and Space. Check undo, focus, exact markers, save retry, duplicate tasks, CRLF/Unicode, stale events, and read-only transitions. Raw HTML inputs stay disabled. Check alignment in tight, loose, nested, ordered, quoted, and wrapped lists at narrow widths, including Chinese and Korean text.
- Check inline code, nested lists, and light, dark, and same-scheme theme changes. Single LF and CRLF breaks in paragraphs and list continuations must render as line breaks while blank lines separate paragraphs. Known, aliased, unknown, and missing code languages must all retain escaped Preview text and whitespace without syntax highlighting. Mermaid fences remain ordinary code. Check Source Markdown highlighting. Check sanitization of raw HTML, JavaScript links, and images. Viewing must not write storage.
- In an isolated store, test deletion with queued saves, late loads, unloaded targets, partial failure and retry, preserved settings, and cleared editor models and undo.
- In an isolated store, test backup and restore with saved notes, failed and empty drafts, duplicate identities, conflicts, protection cancellation, limits, partial failures, and retry. Check stale selection during a delayed preview. Check native picker and save dialogs separately in an approved disposable panel.
- Check all Source help shortcuts, Find/Replace controls and Find-first Escape. Check keyboard and context-menu Cut/Copy/Paste, whole-line copy/paste, multiple cursors, exact mixed separators, internal/external drag, denied clipboard access and stale asynchronous actions.
- Test Korean, Japanese and Chinese native IME candidates, composing Enter and rapid note switches in an approved disposable Orca panel. Synthetic composition events and isolated browser clipboard fixtures do not verify native IME or OS clipboard behavior. Record the OS, Orca version and untested prerequisites.

For isolated browser smoke testing, serve the actual `src/panel.html`, `src/panel.css`, and built `dist/panel.js` with an in-memory implementation of the frame host. Exercise the production DOM and CodeMirror through real browser input. Record this separately from an installed-Orca screenshot: the isolated host does not verify Orca bridge permissions, native clipboard, file dialogs, or IME. Never route this fixture to real user storage.

## Multi-note implementation checks

Verified on macOS with Node.js v24.21.0: integrated TypeScript checking and production asset build passed; all 19 Source editor tests and six isolated preference tests passed. The initial type check found readonly storage casts and an empty-array test narrowing issue; both were corrected before the successful rerun.

The actual compiled HTML/CSS/CodeMirror panel was exercised in Chromium with an isolated in-memory frame host, without reading or writing user notes or settings. Observed behavior included lossless legacy CRLF migration with no writes on load, both append controls and immediate focus during delayed writes, mixed modes and minimized cards, pointer drag insertion feedback and persisted order, keyboard reorder and undo, and retained state across host changes. Korean multiline paragraph, list, and fenced-code summaries used the whole first block. This historical run predated removal of the toolbar copy control.

A note over 9,500 characters saved without a plugin cap. Its card grew beyond the viewport, CodeMirror had no vertical scrollbar, and the toolbar stayed at the outer list's top while scrolling. At a 1,280-pixel viewport, card width was 1,252 pixels with no maximum-width style. Save failure retained the draft and recovered through Retry save. Individual-delete failure retained the same-scope confirmation for retry; a focus change dismissed it without deleting the new scope. Confirmation Off deleted immediately, changing the setting alone deleted nothing, and it could be re-enabled. Sanitized task toggles worked, raw HTML inputs stayed disabled, images were absent, and ambiguous focus disabled editing.

That historical run did not verify the installed Orca frame bridge, native OS clipboard, native file dialogs, or native IME. The current gallery images show the compiled panel with synthetic notes in an isolated browser host with in-memory storage.

## Targeted deletion and toolbar repair checks

On macOS with Node.js v24.21.0, the final TypeScript check and production build passed. The isolated session tests passed 17/17, including saves queued after a deletion request, focus changes during persistence, an exclusive lease draining deletion, restoring the same note ID, and failed-draft error recovery.

The actual compiled panel ran in Chromium with an in-memory frame host. Successful deletion retained all 11 surviving card DOM nodes and EditorView instances, reading/minimized state, focus, selection, undo, and list scroll position (80 before and after). Recorded native animation frames showed the target height and sibling gap closing smoothly. Failed deletion retained the same card, editor, and text without an animation. Queued sibling edits survived deletion and a focus change. Reduced motion removed the target immediately. Overlapping removals and focus changes left no animation ghosts. An explicit pagehide event cancelled the active animation and disposed all cards; native navigation during animation completed, but old-document cleanup counts were unavailable.

During delayed deletion, only trash actions were disabled; sibling editing, mode, collapse, and Add remained usable. A second trash click could not replace the captured target, including after a scope change. The header Add icon and bottom button each appended and focused a blank card. A short minimized note displayed a literal `...` suffix while its editor and stored body stayed unchanged. The toolbar Copy action was absent.

These checks used synthetic notes and preferences only. Installed Orca bridge permissions, native clipboard, file dialogs, and IME were not tested. Preview single-newline behavior was investigated without changing the renderer.

## Empty-card, default-mode, and corner checks

The subsequent integrated TypeScript check and production build passed on macOS with Node.js v24.21.0. All 31 isolated session, deletion, preference, and settings tests passed using in-memory stores. New regressions cover whitespace-only deletion, nonempty input queued before or during deletion, failed queued input recovery, and a focus round trip while deletion waits behind a write.

In the actual compiled Chromium panel, leaving a focused empty or whitespace-only card deleted it without opening confirmation. Unfocused empty cards, internal toolbar focus, native dragging, workspace changes, and unload did not prune notes. An already-open delete dialog retained its empty card. Input during an automatic deletion kept the same card and EditorView; a later blur settled the retained nonempty card into Reading after persistence. Failed deletion kept the card without animating it.

Reading opened existing cards in reading mode; Add always created an expanded editing card with body focus. Internal focus and dragging kept editing active, and genuine outside focus returned nonempty cards to Reading. Editing mode stayed active on blur with the Editing default. The setting persisted across fixture reloads. Native blank-toolbar dragging persisted order, action-origin drags did not reorder, and grip keyboard reordering still worked. Blank-toolbar clicks and drag completion retained toolbar focus so a later outside transition was handled.

Light and dark captures covered short and long Source, Preview, and minimized cards. Native corner crops showed the lower rounded border intact. Cards retained visible overflow; only the body, preview, and summary clipped their lower corners. Long-card toolbars remained sticky at the outer panel's top, and CodeMirror had no inner vertical scrollbar.

Both repair cycles passed independent reviews of the implementation and settings/toolbar/documentation slices. These were isolated compiled-panel checks with synthetic data. Installed Orca bridge permissions, native clipboard, file dialogs, and IME remain untested. At the time of those checks, Preview newline behavior was unchanged.

## Preview line-break checks

On macOS with Node.js v24.21.0, `npm run typecheck` and `npm run build` passed. A temporary Chromium page bundled the actual Preview and Source editor modules with a synthetic in-memory callback, not an Orca frame or user storage. LF and CRLF paragraphs and list continuations rendered `<br>`; blank lines separated paragraphs. Fenced code retained its text and contained no `<br>`. Raw scripts and images were absent, and JavaScript links had no executable URL.

Viewing preserved the exact original strings and invoked no write callback. Clicking a task in Unicode/CRLF text changed only the exact marker and preserved the remaining raw source; stale editor identity rejected a toggle and read-only mode disabled it. This fixture does not verify installed Orca, native clipboard, IME, or host storage.

## Source menu focus checks

The rebuilt panel was exercised in Chromium with synthetic in-memory notes. Opening the Source menu kept a blank card editable and allowed CRLF paste. With Reading as the default, a nonempty card stayed in editing mode while its menu was open; moving focus outside returned it to Reading or pruned a blank card. Arrow keys, Enter on Copy, and Escape did not change the source. At a 450×300 viewport, all four actions remained visible and hit-testable outside the card. A delayed synthetic Paste after a scope change made no writes.

The type check and production build passed. These checks did not verify installed Orca, native clipboard, native file dialogs, or IME.

## Feature folder migration checks

The final folder layout passed `npm run typecheck`, `npm test`, and `npm run build`; all 75 tests passed with no failures or skips. A static AST audit found no missing relative source imports or module cycles, and the changed documentation links resolved. `orca plugin validate . --json` reported the plugin valid.

The rebuilt panel ran in isolated Chromium with synthetic in-memory data. It opened two cards with Unicode and CRLF text; mixed Reading and Editing modes, default Reading, focused Editing on Add, and per-note undo worked. A reading task toggle persisted `[x]` while preserving CRLF; scripts and images were absent. The four-action Source menu retained a blank card until Escape and an outside focus change pruned it. Workspace A→B→A edits remained isolated, settings and help dialogs opened, and the problem area and browser errors were empty.

This smoke test did not explicitly retest soft breaks, dragging, the native Orca bridge, native clipboard, file dialogs, or IME.
