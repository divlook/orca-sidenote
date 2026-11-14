# orca-sidenote

## 0.6.0

### Minor Changes

- 559dbb2: Open reading-mode links in a browser or local worktree files in Orca, with a configurable browser destination. Remote web links are supported; remote file links are unsupported and show an error. Orca will request renewed access approval for the added `workspace:write` permission.
- 559dbb2: Wrap selections with parentheses, brackets, braces, double quotes, single quotes, or backticks, format Markdown with shortcuts, and paste URLs as links. Empty cursors insert only the typed character without auto-closing.

## 0.5.0

### Minor Changes

- bdfe913: Add multiple Markdown note cards per project and worktree.

  - Add independently editable, expandable and minimizable cards, with drag-and-drop and keyboard reordering.
  - Add note controls at the top and bottom of the list.
  - Add individual deletion with optional confirmation, and automatically remove empty notes when focus leaves.
  - Add a default reading mode that returns edited notes to reading mode when focus leaves.
  - Preserve single line breaks in reading mode and remove the plugin character limit.
  - Preserve existing notes as single cards and retain per-note undo and view state.
  - Update backups to preserve note IDs and order while continuing to import older backups.
  - Refresh the plugin cover and screenshots.

## 0.4.2

### Patch Changes

- 559fb34: Show the existing Preview image as the plugin page cover.

## 0.4.1

### Patch Changes

- 20d7748: Add Source and Preview screenshots to the community plugin gallery.

## 0.4.0

### Minor Changes

- 42ecdcb: Replace the Source editor with a smaller, locally bundled CodeMirror editor. Keep Markdown highlighting, search and replace, multiple cursors, per-note undo and view state, task editing, and exact saved text. Source no longer needs an editor worker or icon font. Existing notes and settings require no migration.

## 0.3.2

### Patch Changes

- 663f5a4: Remove Preview syntax highlighting to reduce the bundled distribution. All code blocks, including Mermaid, display escaped plain text with formatting preserved. Source keeps Monaco Markdown tokenization.

## 0.3.1

### Patch Changes

- 4f1d6f1: Update the HTML sanitizers used by Preview and the Source editor to address published security vulnerabilities.

## 0.3.0

### Minor Changes

- b0d73c9: Add versioned JSON notes backup and restore with separate recovery drafts, conflict previews, saved protection before replacements, and partial-result reporting. Preserve exact note text and identities without transferring settings or undo history.

  Refresh stale saved notes during restore preview, including identical skips, so later edits do not overwrite newer stored text. Keep unsaved drafts and unchanged notes' undo history.

  Show a DEV badge beside Note only for a confirmed development installation.

- b0d73c9: Restore Preview syntax highlighting with the full bundled highlight.js language library and aliases, paired light/dark colors, and escaped plain text for missing or unsupported languages. Remove Mermaid diagram rendering; existing Mermaid fences remain readable as ordinary code without changing saved Markdown. Source keeps Monaco and its existing editing behavior.

## 0.2.1

### Patch Changes

- cb0738b: Rename the plugin to SideNote for Orca to meet the Orca plugin directory's display-name requirements.

## 0.2.0

### Minor Changes

- 5e02323: Toggle Markdown task checkboxes in Preview through Source undo and autosave, remember Source line-number visibility, and distinguish fenced code blocks with a bordered surface.
- 5e02323: Render fenced `mermaid` code blocks as diagrams in Preview without changing saved Markdown. Diagrams follow the light/dark theme, use bundled local code, and show the original code with an error if rendering fails. Isolated rendering blocks external resources, HTML labels, diagram links, click actions, directives, and frontmatter.
- 5e02323: Highlight explicitly labeled Preview code blocks with locally bundled highlight.js languages and aliases. Keep unknown or unlabeled blocks plain, Mermaid diagrams first, and inline code unchanged. Follow Orca's light/dark mode with paired syntax palettes without changing saved Markdown.
- 5e02323: Add confirmed deletion of all notes in the current plugin store, preserving settings and supporting retry after partial failure. Continue Markdown lists in Source, distinguish inline code and reduce list indentation in Preview, and correct plugin-mixed link, comment and Mermaid edge-label contrast.

### Patch Changes

- 5e02323: Ship Monaco's icon font as WOFF instead of TTF so the generated plugin assets use a font format allowed by Orca's community registry, while preserving editor icons and third-party notices.
- 5e02323: Separate Character limit and Show Source line numbers into independent settings rows. Apply and save valid changes automatically without a Save button, preserving the previous limit for empty or invalid numeric drafts.
- 5e02323: Align Preview task checkboxes with the first text line, including loose, nested, ordered, quoted and wrapped list items.
