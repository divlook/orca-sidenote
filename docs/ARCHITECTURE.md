# Architecture

| Task | Entry points | Contract |
| --- | --- | --- |
| Panel composition | [panel.ts](../src/panel.ts), [panel.html](../src/panel.html) | Compose feature modules. Keep storage and editor internals with their owners. |
| Active worktree | [worker.mjs](../src/worker.mjs), [focus.ts](../src/focus.ts), [protocol.ts](../src/protocol.ts) | Accept one active target from a complete CLI snapshot. Block editing for ambiguous or truncated results. The bounded CLI development probe must match this worker's nonce. Hide DEV when the result is unknown. |
| Notes and drafts | [session.ts](../src/session.ts) | Own focus generation guards, drafts, and ordered writes. Invalidate only affected editor states after restore or clean-cache refresh. Global deletion resets all states. An exclusive operation lease suspends editing and stale loads. Finishing it resumes the latest focus. A finished lease cannot read or write notes. Exclusion applies only within this panel. |
| Source and help | [source-editor.ts](../src/source-editor.ts), [source-state.ts](../src/source-state.ts), [source-commands.ts](../src/source-commands.ts), [source-menu.ts](../src/source-menu.ts), [shortcut-help.ts](../src/shortcut-help.ts) | Construct CodeMirror before enabling edits. Retain per-note state, selections, scroll and undo. Guard readiness, key, epoch and revision. Resolve rejected candidates synchronously through undo (redo for rejected Undo), without publishing them. Dispose views and listeners. |
| Settings | [note-settings.ts](../src/note-settings.ts), [note-preferences.ts](../src/note-preferences.ts), [note-settings-view.ts](../src/note-settings-view.ts) | Preserve storage formats and growth validation. The model owns independent readiness, ordered optimistic writes, last-saved rollback, and same-value retry. The view owns incomplete numeric drafts. |
| Transfer | [note-transfer.ts](../src/note-transfer.ts), [notes-transfer.ts](../src/notes-transfer.ts), [note-transfer-view.ts](../src/note-transfer-view.ts) | The codec validates bounded JSON. Transfer owns quotas, protection, and partial-write policy through a session lease. The view calls `orca.files.saveAs` with an `ArrayBuffer` in a fresh gesture. Handle `saved` and `cancelled` distinctly. There is no download fallback. |
| Preview | [dialog.ts](../src/dialog.ts), [preview.ts](../src/preview.ts) | Preserve iframe keyboard behavior and HTML sanitization. |
| Identity and positions | [protocol.ts](../src/protocol.ts), [source-text.ts](../src/source-text.ts), [markdown-tasks.ts](../src/markdown-tasks.ts), [markdown-list.ts](../src/markdown-list.ts) | Keep exact identities in one place. Preserve raw mixed line separators and UTF-16 offsets separately from CodeMirror's canonical LF document. History inverts exact-source effects. |

Preview renders fenced code as escaped plain text regardless of language. DOMPurify sanitizes the rendered Markdown. CodeMirror's Source highlighting is independent. Mermaid uses the ordinary code path.

Preserve Orca's guest resource and asset-session restrictions on remote images, fonts, stylesheets, and network calls.

Source uses explicit light/dark syntax palettes and host surface colors. If the comment color has insufficient contrast against an opaque host canvas, Source uses the host body foreground when it improves contrast. The check runs for same-scheme theme changes too. Transparent canvases retain the syntax palette. This is not a contrast guarantee for every theme or syntax token. Preview uses underlined body-colored links, semantic inline-code fills and borders, and host-colored plain code blocks.

Orca's HTML panel transpiler does not resolve bare npm imports. [build.mjs](../build.mjs) bundles Preview and selected CodeMirror extensions into the panel. Source needs no editor worker, font asset, remote language loading, or all-language catalogue. Generated newlines use the note's initial majority policy; untouched mixed separators stay exact. Clipboard input preserves the plain text supplied by the browser, which may already have been normalized by the OS.

See [Notices](NOTICES.md) for redistribution requirements.
