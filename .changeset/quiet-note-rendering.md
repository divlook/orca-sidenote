---
"orca-sidenote": patch
---

Avoid repeated note view allocation and unchanged card updates during autosave while preserving editor state and immediate control updates.

Create Source editors only when needed for editing or task toggles, while retaining initialized editors and their undo history.

Reduce repeated line-position scans while editing long notes, preserving exact line endings and undo behavior.

Coalesce consecutive waiting text saves into the latest complete collection without changing in-flight writes, operation boundaries, or failed-draft retry.
