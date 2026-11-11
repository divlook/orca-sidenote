# Development

## Prerequisites and setup

This plugin adds workspace-following notes to Orca's right sidebar. Its current integration targets a local macOS development folder, not a marketplace installation or other operating systems. See [Usage](USAGE.md) for using notes and [Maintenance](MAINTENANCE.md) for data protection.

1. Install Git, Node.js 20 or later, and npm, and start Orca. The Orca compatibility requirement is `engines.orca` in the [manifest](../orca-plugin.json). Both the pinned marked dependency and Mermaid's resolved marked dependency require Node.js 20 or later.
2. Make sure the Orca CLI is at `/Applications/Orca.app/Contents/Resources/bin/orca`. The commands below use that absolute path, so the CLI does not need to be on your shell's `PATH`. The worker requires this exact path even if another `orca` executable is available.
3. Clone the repository and enter it:

```sh
git clone https://github.com/divlook/orca-sidenote.git
cd orca-sidenote
```

4. A fresh checkout may lack the ignored `.orca/types/` directory required by TypeScript configuration. Generate the API types, install dependencies, build the editor assets, and type-check:

```sh
/Applications/Orca.app/Contents/Resources/bin/orca plugin types . --json
npm ci
npm run build
npm run typecheck
```

The build deletes and recreates `dist/`. Keep the generated bundles, worker, assets, and notices in the same distribution commit as their source; do not ignore `dist/`. Orca installs committed Git files without running npm or this build. Its built-in TypeScript transpilation does not resolve bare npm imports in HTML panels, so the preview libraries and Monaco must be bundled. [package.json](../package.json) defines the scripts; [build.mjs](../build.mjs) defines the bundles and generated notices.

Monaco's Codicon TTF is converted to WOFF during the build, including its CSS URL and font-format declaration. WOFF is allowed by the [Orca community registry](https://www.onorca.dev/plugins/add); TTF/OTF files are not. Do not copy the original TTF into `dist/`. The conversion tool is build-only; Monaco's existing notices cover the redistributed font.

Mermaid 11.12.2 is loaded only when Preview contains a fenced `mermaid` block. `dist/diagram.js` bundles all supported diagram implementations locally. Orca's HTML guest CSP forbids nested frames, so rendering uses a Shadow DOM rather than an iframe. The separate Mermaid build injects [diagram-document.ts](../src/diagram-document.ts): its body/ID selectors resolve inside the active shadow render root, while element creation uses the real document for SVG measurement. It does not replace the global document or modify vendor source. Rendering is serialized because Mermaid and the scoped root are stateful. Temporary styles and final sanitized SVG remain in the shadow tree; stale work is discarded and temporary DOM is cleared on errors.

Preserve Orca's guest resource policy and asset-session restrictions, which block remote HTTP(S) images, fonts, stylesheets, and network calls. Do not bind Mermaid click callbacks or insert diagram SVG/styles into the panel's light DOM. Directives and frontmatter are rejected before Mermaid runs, HTML labels are disabled, sequence labels use SVG text, and final SVG links, images, and foreign objects are removed. When upgrading Mermaid, verify the scoped selectors with flowchart, sequence, class, state, ER, Gantt, pie, and block diagrams, including temporary CSS isolation and remote-resource attempts under the actual host CSP.

Preview statically bundles highlight.js 11.12.0 through its full main entry point, not the common-language subset. The synchronous code renderer checks Mermaid first, then resolves explicit language names and aliases with `getLanguage`; unknown or absent names use marked's ordinary escaped code renderer without auto-detection. Highlighted HTML still passes through DOMPurify. Token styles apply only within highlighted Preview blocks, using paired light/dark foregrounds and backgrounds; host theme changes update semantic borders and inline surfaces without replacing the syntax palette. Source's Monaco rules are independent.

## Load the development folder

5. Load the folder using the local environment explicitly to avoid loading into a different connected server:

```sh
/Applications/Orca.app/Contents/Resources/bin/orca plugin dev load . --environment local --json
```

This registers the current folder as a development plugin, overriding an installed plugin with the same key. If Orca returns `approval_required` or `approval_stale`, review the requested access and returned command. Only if you explicitly approve that access, rerun the returned command with its fingerprint. Do not invent a fingerprint. A `trusted-worker` runs with your account permissions; later code edits in an approved development folder can run without renewed approval.

6. Check that plugins are enabled in Settings → Plugins, then open **Note** in Orca's right sidebar.

Orca reloads development files when they change, but this repository has no automatic asset-build watcher. After changing bundled source or dependencies, run `npm run build` before reloading. If an explicit reload is needed, run:

```sh
/Applications/Orca.app/Contents/Resources/bin/orca plugin dev reload . --environment local --json
```

When API types are missing or need refreshing after an Orca update, use the type-generation command above. Do not hand-edit `.orca/types/`.

## Verification

For runtime, configuration, or dependency changes, run from the repository root:

```sh
npm run typecheck
npm run build
/Applications/Orca.app/Contents/Resources/bin/orca plugin test . --json
/Applications/Orca.app/Contents/Resources/bin/orca plugin check . --json
/Applications/Orca.app/Contents/Resources/bin/orca plugin validate . --json
```

Only run tests/checks for code you trust: Orca can execute them locally without a sandbox. These commands cover types, asset generation, behavior tests, plugin checks, and load-format validation. `validate` is an offline format check; it does not run plugin code. `plugin check` does not render this HTML panel, so its success is not a UI check. See [Contributing](../CONTRIBUTING.md) for change-specific coverage.

Pull request CI runs `npm ci`, `npm run build`, and `npm run test:release` on Ubuntu with Node.js 22. It does not run Orca-dependent typechecking or plugin checks, or render the panel. Run the relevant local checks above and test the panel in Orca.

The release workflow builds assets for the version PR; it does not run the Orca-dependent checks above or render the panel. See [Maintenance](MAINTENANCE.md#versioning-and-release-preparation) for reviewing and merging that PR.

For release-tooling-only changes, run `npm run test:release`. These deterministic tests use temporary Git repositories and isolated GitHub API fixtures; they do not contact GitHub or require Orca.

In actual Orca, use test notes to check:

- Source input reaches `Saved`, Preview works, and reopening retains the text.
- Worktree transitions are read-only; text and undo remain isolated per note.
- Limit boundaries reject growth correctly, and rejecting an edit preserves earlier undo history.
- Settings and shortcut dialogs handle Tab wrapping, Escape, and focus return.
- Preview toggles only renderer-created Markdown tasks (click and Space), preserving exact source markers, undo, focus and save retry; raw HTML inputs remain disabled. Check first-line checkbox alignment for tight, loose, nested, ordered, quoted and wrapped tasks at narrow widths, including Chinese/Korean text. Check duplicate tasks, CRLF/Unicode, stale events after switching/deletion, and read-only transitions.
- Enter continuation for unordered/ordered/task lists, nested indentation, empty-item exit, literal fenced code, multiple cursors, and normal multiline paste.
- Character limit and Source line-number visibility appear as separate settings, each with its own title, description and control. With no Save button, valid numbers and mode/visibility changes apply and persist automatically; empty/invalid numeric drafts preserve the applied limit without blocking visibility changes. Check reload persistence, rapid edits/toggles with delayed writes, and failures followed by the same desired value through normal input/change interaction. Controls remain enabled during writes; failed writes restore successful values without changing notes or undo.
- Confirmed global deletion in an isolated store, including queued saves, late focus loads, unloaded targets, partial failure/retry, settings preservation, and cleared editor models/undo. Never confirm deletion in the real user's store.
- Preview inline code in paragraphs, blockquotes and tables, compact nested lists at narrow widths, and same-scheme as well as light/dark theme changes.
- Mermaid flowchart/sequence blocks, malformed-block fallback, ordinary fences, blocked resources/clicks/configuration, Source/Preview cancellation, note changes, and light/dark rerendering. Use an isolated in-memory host for hostile inputs.
- Explicit Preview code languages (JavaScript, TypeScript, Python, JSON, Bash and an uncommon bundled language), library aliases, missing/unknown names, literal HTML/script text, unchanged indentation/newlines, inline styling, Mermaid precedence and failure fallback. Check paired syntax foreground/background contrast in both modes and after same-scheme host theme changes; viewing must not write storage.

Do not change existing user notes or the global character limit merely to test. Reproduce failed storage, delayed responses, and malformed data with the in-memory storage approach in the existing tests, not by damaging real storage. Record the Orca/Node environment and any checks you did not perform.

## Implementation entry points

| Area | Start here | Responsibility and constraints |
| --- | --- | --- |
| Panel composition and status | [panel.ts](../src/panel.ts), [panel.html](../src/panel.html) | Compose feature modules; keep storage and editor internals in their owners. |
| Active worktree identification | [worker.mjs](../src/worker.mjs), [focus.ts](../src/focus.ts), [protocol.ts](../src/protocol.ts) | Select only a uniquely active target from a complete CLI snapshot. |
| Drafts, persistence, transitions | [session.ts](../src/session.ts) | Ignore stale responses; isolate drafts; order writes and retain retryable failures. |
| Monaco | [source-editor.ts](../src/source-editor.ts), [editor.worker.ts](../src/editor.worker.ts) | Preflight the worker; preserve per-note models/view/undo, deferred-edit guards, and resource disposal. |
| Limits and settings | [note-settings.ts](../src/note-settings.ts), [note-settings-view.ts](../src/note-settings-view.ts) | Own storage format/validation and settings loading/saving state. |
| Dialogs and Preview | [dialog.ts](../src/dialog.ts), [preview.ts](../src/preview.ts) | Preserve iframe keyboard behavior and HTML sanitization. |

Run `src/*.test.ts` through Orca's test runner. Use current code and current verification results as the source of truth.

Source retains Monaco's light/dark syntax palettes. When its inherited comment color has insufficient contrast against an opaque host canvas, it uses the host body foreground if that improves contrast; this is recalculated even for theme changes within the same color scheme. Transparent host canvases retain the inherited palette. This targeted correction is not a contrast guarantee for every user theme or syntax token. Preview links use body foreground plus underline, inline code uses semantic quiet-fill and border tokens, and Mermaid's dark edge-label background is adjusted within Mermaid's own palette.
