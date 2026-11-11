# orca-sidenote

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
