# SideNote

SideNote keeps Markdown notes alongside the active Orca project or worktree. This glossary defines the shared language for note content, its presentation, and note data transfers.

## Language

### Notes and locations

**Note**:
An individual piece of Markdown content in a note collection, separate from its visual presentation. Notes are managed by SideNote, not kept in project files or Git.

**Note card**:
The visual presentation of one note, with controls for its mode, minimization, order, and deletion.
_Avoid_: note (when referring only to the visual container).

**Note collection**:
The ordered set of notes for one note scope. Reordering changes the collection's order, not the notes' content.

**Note scope**:
The exact host and project or worktree folder path that identifies a note collection, independent of project names and branch labels. Removing a worktree leaves its notes intact; returning to the same host and path returns the same collection.
_Avoid_: branch notes (for a collection's ownership).

### Card presentation

**Editing mode**:
The per-note mode for editing Markdown text, labeled **Editing** in settings.
_Avoid_: Source mode (as the user-facing mode name, not the editor's name or shortcut terminology).

**Reading mode**:
The per-note mode for viewing formatted Markdown, labeled **Reading** in settings. Markdown task checkboxes remain editable in this mode.
_Avoid_: Preview mode (as the user-facing mode name, not the renderer's name).

**Minimized card**:
A note card displaying a single-line summary instead of its body, with its controls still available. Minimizing preserves the note's content and current mode; it neither closes nor deletes the note.
_Avoid_: closed note, deleted note (for minimization).

**Default note mode**:
The saved preference for existing notes' initial mode; when set to Reading, it also returns edited notes to Reading when focus leaves the card. It is distinct from a note's current mode; new notes start in Editing regardless of this preference.

### Note data transfers

**Recovery collection**:
A complete collection held by this panel with unsaved changes or a saving error, kept separately from the stored collection for recovery. It includes note content and order, rather than only the text of a failed edit.

**Notes backup**:
A file containing all stored note collections and separate recovery collections from this panel. It excludes preferences, undo history, and unsaved changes held only in other panels.

**Notes restore**:
The transfer of selected collections from a backup into their original note scopes. Replacement covers a whole collection, including its note order, rather than appending individual notes; unselected collections remain unchanged.

**Protection file**:
A backup of stored originals affected by a planned restore replacement, together with this panel's recovery collections. It is tied to that restore preview and must be saved before replacement.
