# orca-sidenote

## 0.8.2

### Patch Changes

- 92fda84: Match Keyboard Shortcuts to Note Settings with a fixed header, a scrollable body, and a footer Close button. Share layout styles between the two dialogs while preserving keyboard navigation and settings behavior.

## 0.8.1

### Patch Changes

- afdd30b: Use the custom editing context menu to Cut and Copy when eligible, or Select All to select the whole current note. Change All Occurrences remains available above Select All and through Cmd+F2 (Ctrl+F2 on Windows and Linux). Editing and reading context menus now adapt their width to their contents, within viewport bounds, and wrap long labels. Menu Paste stays disabled; hover over or focus its info icon for a tooltip explaining Cmd+V on macOS or Ctrl+V on Windows and Linux. The tooltip appears close, directly above the info icon, or below it when there is insufficient space above. It may overlap other menu items but does not intercept clicks, and the hover explanation disappears immediately when the pointer leaves the icon. Keyboard focus also shows the explanation; blur or Escape hides it. The explanation is also available to screen readers. In reading mode, Copy Markdown copies the whole underlying raw Markdown regardless of text selection.

## 0.8.0

### Minor Changes

- 336f402: Filter notes by label with per-location view preferences.
- 336f402: Add shared note labels and include label data in backups.

### Patch Changes

- 336f402: Keep settings header and Close button visible while scrolling.
- 336f402: Update the minimize and expand icons for note cards and bulk controls.
- 336f402: Prevent delayed label selections from applying after switching away and back, and require a catalog reload after an unconfirmed reset or restore write.
- 336f402: Use consistent settings dropdowns and move the settings scrollbar to the edge.
- 336f402: Restore themed scrollbars in notes and settings.
- 336f402: Use compact named color dropdowns in label settings.
- 336f402: Show label colors and make unsaved label edits clear.
- 336f402: Tint note card toolbars with their assigned label color.
- 336f402: Keep label picker options accessible above subsequent note cards.
- 336f402: Select filter options by clicking their rows.
- 336f402: Improve settings header separation and bottom scrolling space.

## 0.7.0

### Minor Changes

- f972bd1: Let a minimized card's summary or **Edit note** open its editor directly, preserving the cursor, selection, and undo history.

  Use inward-pointing arrows for minimizing cards and boundary lines with outward arrows for expanding them, and refresh the gallery images.

  Add **Minimize all notes** and **Expand all notes** beside Add note. These controls affect only the current collection and preserve each card's mode, cursor, undo history, and blank drafts.

## 0.6.1

### Patch Changes

- f202145: Skip the drag grip during Tab navigation, remove outlines from drag controls, and use thinner, muted keyboard focus outlines on buttons.

  Use #0e0f11 backgrounds for the cover and screenshots, without rounded outer frames or shadows.

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
