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
The ordered set of notes for one note scope, kept in manual order.

**Note scope**:
The exact host and project or worktree folder path that identifies a note collection, independent of project names and branch labels. Removing a worktree leaves its notes intact; returning to the same host and path returns the same collection.
_Avoid_: branch notes (for a collection's ownership).

**Manual order**:
The order of a note collection set by rearranging its notes.

### Note labels

**Note label**:
An optional, user-defined classification of a note, not a stage that enforces a workflow. A note has at most one label, shown with its name and color.
_Avoid_: note status, note tag.

**Label catalog**:
The ordered set of labels shared across projects and worktrees in one SideNote store. Each label has an editable name and palette color; the four default labels are todo, in progress, in review, and done.

**Label filter**:
A choice of note labels, optionally including unlabeled notes, used to determine which notes are displayed.

### Card presentation

**Note view preference**:
A note scope's preference for which notes are displayed, separate from the notes and their manual order.

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
A complete collection held by this panel with unsaved changes or a saving error, kept separately from the stored collection for recovery. It includes note content, label assignments, and order, rather than only the text of a failed edit.

**Notes backup**:
A file containing the complete label catalog, all stored note collections and their label assignments, and separate recovery collections from this panel. It excludes preferences, undo history, and unsaved changes held only in other panels.

**Notes restore**:
The transfer of selected collections from a backup into their original note scopes. Replacement covers a whole collection, including its note order and label assignments, rather than appending individual notes. Labels needed by restored notes are merged into the destination catalog; unselected collections remain unchanged.

**Protection file**:
A backup of stored originals affected by a planned restore replacement, together with this panel's recovery collections. It is tied to that restore preview and must be saved before replacement.
