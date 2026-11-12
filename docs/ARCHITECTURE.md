# Architecture

| Task | Entry points | Contract |
| --- | --- | --- |
| Panel composition | [panel.ts](../src/panel.ts), [panel.html](../src/panel.html) | Compose feature modules. Keep storage and editor internals with their owners. |
| Active worktree | [worker.mjs](../src/worker.mjs), [focus.ts](../src/focus.ts), [protocol.ts](../src/protocol.ts) | Accept one active target from a complete CLI snapshot. Block editing for ambiguous or truncated results. The bounded CLI development probe must match this worker's nonce. Hide DEV when the result is unknown. |
| Notes and drafts | [session.ts](../src/session.ts) | Own focus generation guards, drafts, and ordered writes. Invalidate only affected editor models after restore or clean-cache refresh. Global deletion resets all models. An exclusive operation lease suspends editing and stale loads. Finishing it resumes the latest focus. A finished lease cannot read or write notes. Exclusion applies only within this panel. |
| Monaco and help | [source-editor.ts](../src/source-editor.ts), [editor.worker.ts](../src/editor.worker.ts), [shortcut-help.ts](../src/shortcut-help.ts) | Keep worker preflight, per-note models, view and undo, and deferred readiness/key/revision guards. Restore rejected edits through undo after the Monaco transaction. Dispose resources. Keep static help separate from Monaco behavior. |
| Settings | [note-settings.ts](../src/note-settings.ts), [note-preferences.ts](../src/note-preferences.ts), [note-settings-view.ts](../src/note-settings-view.ts) | Preserve storage formats and growth validation. The model owns independent readiness, ordered optimistic writes, last-saved rollback, and same-value retry. The view owns incomplete numeric drafts. |
| Transfer | [note-transfer.ts](../src/note-transfer.ts), [notes-transfer.ts](../src/notes-transfer.ts), [note-transfer-view.ts](../src/note-transfer-view.ts) | The codec validates bounded JSON. Transfer owns quotas, protection, and partial-write policy through a session lease. The view calls `orca.files.saveAs` with an `ArrayBuffer` in a fresh gesture. Handle `saved` and `cancelled` distinctly. There is no download fallback. |
| Preview | [dialog.ts](../src/dialog.ts), [preview.ts](../src/preview.ts) | Preserve iframe keyboard behavior and HTML sanitization. |
| Identity and positions | [protocol.ts](../src/protocol.ts), [source-text.ts](../src/source-text.ts), [markdown-tasks.ts](../src/markdown-tasks.ts), [markdown-list.ts](../src/markdown-list.ts) | Keep exact identities in one place. Share line-break counting while preserving exact source offsets and Monaco's canonical LF text. |

Preview uses the full highlight.js library, including aliases. It highlights only explicit supported languages. Missing and unknown names remain escaped plain text. DOMPurify sanitizes highlighted output with the rest of the Markdown. Monaco's Source rules are independent. Mermaid uses the ordinary code path.

Preserve Orca's guest resource and asset-session restrictions on remote images, fonts, stylesheets, and network calls.

Source retains Monaco's light/dark syntax palettes. If the inherited comment color has insufficient contrast against an opaque host canvas, Source uses the host body foreground when it improves contrast. The check runs for same-scheme theme changes too. Transparent canvases retain the inherited palette. This is not a contrast guarantee for every theme or syntax token. Preview uses underlined body-colored links, semantic inline-code fills and borders, and a paired light/dark code palette.

Orca's HTML panel transpiler does not resolve bare npm imports. [build.mjs](../build.mjs) bundles Preview and Monaco. The build converts Monaco's Codicon TTF and CSS declaration to WOFF. The [community registry](https://www.onorca.dev/plugins/add) permits WOFF but not TTF/OTF. Do not copy the original TTF into `dist/`. Monaco's notices cover the redistributed font.

See [Notices](NOTICES.md) for redistribution requirements.
