# Verification

Run tests and checks only for code you trust. Orca can execute them locally without a sandbox. Do not change real user notes, settings, or storage to test failures. Use isolated in-memory storage and dedicated test notes. Confirm deletion only in an isolated store.

## Runtime, configuration, and dependencies

Run from the repository root:

```sh
npm run typecheck
npm test
npm run build
/Applications/Orca.app/Contents/Resources/bin/orca plugin check . --json
/Applications/Orca.app/Contents/Resources/bin/orca plugin validate . --json
```

These commands check types, portable behavior, generated assets, and plugin validity. `validate` is offline and does not run plugin code. `plugin check` does not render this HTML panel. Test the relevant behavior in Orca too. Record Orca and Node versions, results, and checks you did not perform.

Pull request CI runs `npm ci`, `npm run build`, and `npm test` on Ubuntu with Node.js 22. Portable tests cover the TypeScript models, Source editor, and release tooling. CI does not run Orca-dependent typechecking or plugin checks, or render the panel. The release workflow builds assets for the version PR.

For a focused run, use `npm run test:model`, `npm run test:editor`, or `npm run test:release`. Release tests use temporary Git repositories and isolated GitHub API fixtures. They do not contact GitHub or require Orca.

For documentation-only changes, check relative links and commands against current scripts and installed CLI help. Record those checks instead of running unrelated builds or behavior tests.

## Manual behavior

Use test notes and an approved disposable panel where native dialogs must be exercised. Use an isolated in-memory host for hostile inputs and injected storage failures.

- Add from the heading icon and bottom button. Each must append an expanded editable blank card, scroll to it, and focus its body even while storage is slow. Empty locations must not create a card automatically. Check independently growing cards, one vertical list scrollbar, horizontal Preview code scrolling, and sticky card toolbars without a maximum content width. Check scrollbars in light and dark themes, including hover, wheel and keyboard scrolling. Settings must scroll independently of the note list.
- Mix reading and editing cards, minimize them, change mode while minimized, expand, reorder with grip drag and keyboard, and switch worktrees. Check stable note IDs, persisted order, cursor, selection, undo and content isolation. Check first-block summaries for multiline paragraphs, lists/tasks, headings, fenced code with language labels, leading empty blocks, and empty notes. Nonempty summaries must have a literal `...` suffix, including short summaries. The original body must stay unchanged.
- Check default per-note confirmation, cancellation, and deletion of only the captured ID. Check context changes while confirming and recovery from a failed deletion. Check immediate deletion with confirmation Off and re-enabling confirmation. Changing the setting alone must delete nothing. The bulk-delete confirmation must remain separate.
- Edit past 8,000 characters without a cap or counter. Check independent line-number and deletion-confirmation controls, reload persistence, delayed writes, failed-write rollback, and retry. Check real autosave errors retain full drafts and offer retry without normal pending/success labels. Controls remain enabled during normal writes.
- Check settings and shortcut dialogs for Tab wrapping, Escape, and focus return. Check Enter continuation and exit for nested unordered, ordered, and task lists, literal fenced code, multiple cursors, and multiline paste.
- Toggle renderer-created tasks by click and Space. Check undo, focus, exact markers, save retry, duplicate tasks, CRLF/Unicode, stale events, and read-only transitions. Raw HTML inputs stay disabled. Check alignment in tight, loose, nested, ordered, quoted, and wrapped lists at narrow widths, including Chinese and Korean text.
- Check inline code, nested lists, and light, dark, and same-scheme theme changes. Single LF and CRLF breaks in paragraphs and list continuations must render as line breaks while blank lines separate paragraphs. Known, aliased, unknown, and missing code languages must all retain escaped Preview text and whitespace without syntax highlighting. Mermaid fences remain ordinary code. Check Source Markdown highlighting. Check sanitization of raw HTML, JavaScript links, and images. Viewing must not write storage.
- In an approved disposable panel, check HTTP and HTTPS links with Default browser, Orca, and Ask every time, including cancellation. Orca must open a new browser tab. `mailto:` must open externally. Check persistence, delayed preference writes, failed-write rollback, retry, and unreadable settings. Check access reapproval when upgrading from a version without `workspace:write`. Approval alone must open nothing.
- Use isolated local worktrees and test files. Check that relative links resolve from the worktree root. Contained absolute and `file://` links must open in Orca's editor. Exercise outside paths, unsupported protocols, ambiguous and stale scopes, host changes, wrong-host routes, symlink escapes, and remote file links. Rejected links must show an error and open no destination. Check remote web links and focus changes while an opening action is pending.
- Check link activation by click and Enter. Check focus return after choosing or cancelling the chooser. Rendered links must have no native `href`. Middle-click and context-menu actions must not bypass routing. Check that sanitization removes `file:` URLs from media attributes.
- In an isolated store, test deletion with queued saves, late loads, unloaded targets, partial failure and retry, preserved settings, and cleared editor models and undo.
- In label settings, check named color dropdowns by pointer and keyboard for new and existing labels, including Escape and focus return. Edit two rows. Check that their unsaved indicators, enabled **Save changes** controls, and drafts survive saving one row and reordering. Check revert, pending, success, failed save and retry, including focus and caret preservation. Exercise add, delete and reset confirmation in an isolated store at narrow widths with light and dark theme variables.
- In settings, scroll by wheel and keyboard in light, dark, and narrow views. Only the body must scroll. The title, header close button, header border, and footer **Close** must stay visible. Check space above the footer at maximum scroll and focus return from both close buttons. Check Tab wrapping and retained unsaved label drafts. Escape must close the color menu before the dialog. The menu must stay within the body, remain scrollable, and close when the body scrolls.
- Check preference and label color dropdowns together, with one menu open at a time. Preference choices must save automatically. Label edits must wait for **Save changes**. Check failed preference rollback, retry, and keyboard navigation. The settings scrollbar must stay at the body edge while content remains inset. Dropdowns must stay between the fixed header and footer.
- Exercise label filter OR selections, **No label**, clear, counts, filtered-empty state, scoped persistence and failure retry. Check temporary unmatched cards, empty-card pruning exceptions, hidden editor state, visible-slot pointer and keyboard reordering, and displayed-only bulk controls. Delete and reset selected labels in an isolated store. Check that stale selections do not bind to new IDs.
- In an isolated store, test backup and restore with saved notes, failed and empty drafts, duplicate identities, conflicts, protection cancellation, limits, partial failures, and retry. Check stale selection during a delayed preview. Check native picker and save dialogs separately in an approved disposable panel.
- Check all Source help shortcuts, Find/Replace controls and Find-first Escape. Check keyboard and context-menu Cut/Copy/Paste, whole-line copy/paste, multiple cursors, exact mixed separators, internal/external drag, denied clipboard access and stale asynchronous actions.
- In editing mode, wrap forward and backward selections with `(`, `[`, `{`, `"`, `'`, and backtick. The original text must remain selected. Check empty and mixed empty/nonempty cursors. Empty cursors must insert only the typed character without auto-closing. Check ordinary typing of asterisks and underscores. Exercise undo and mixed line separators.
- Check **Cmd+B**, **Cmd+I**, **Cmd+Shift+X**, and **Cmd+K** with selections and empty cursors. Check inserted Markdown, escaped link labels, cursor placement, repeated shortcuts, multiple selections, undo, and readiness changes.
- Paste a single HTTP or HTTPS URL by keyboard and the Source menu over ordinary single-line text. Check the resulting Markdown link. Check empty cursors, linewise paste, multiline selections, code, existing links, images, autolinks, and non-URL clipboard text. Check multiple selections, undo, mixed line separators, and readiness changes.
- Test Korean, Japanese and Chinese native IME candidates, composing Enter and rapid note switches in an approved disposable Orca panel. Synthetic composition events and isolated browser clipboard fixtures do not verify native IME or OS clipboard behavior. Record the OS, Orca version and untested prerequisites.

For isolated browser smoke testing, serve the actual `src/panel.html`, `src/panel.css`, and built `dist/panel.js` with an in-memory implementation of the frame host. Exercise the production DOM and CodeMirror through real browser input. Record this separately from an installed-Orca screenshot: the isolated host does not verify Orca bridge permissions, native clipboard, file dialogs, or IME. Never route this fixture to real user storage.

## Record verification results

Include the changed behavior, commands and scenarios exercised, environment, observed results, and remaining checks in the change report.

Distinguish an isolated browser run from an installed-Orca check. Synthetic host bridges do not test Orca permissions, native clipboard, file dialogs, or native IME. Record each native check separately when you perform it.

