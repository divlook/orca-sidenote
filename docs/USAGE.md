# Usage

1. Open **Note** in the right sidebar.
2. Write in **Source**, the Monaco Markdown editor; changes save automatically. Notes default to an 8,000-character limit. Source supports syntax highlighting, line numbers, find and replace, and per-note undo.
3. Use **Preview** to view Markdown and toggle Markdown task checkboxes with a click or Space. Changes save normally and can be undone in Source. Raw HTML checkboxes remain read-only, and images are not loaded. Fenced code blocks use a separate bordered surface.

## Code and diagrams

To color a code block in Preview, specify its language after the opening fence, for example `javascript`, `typescript`, `python`, `json`, or `bash`:

````markdown
```typescript
const message: string = 'Hello'
console.log(message)
```
````

Preview bundles highlight.js's full language set locally, including library aliases such as `js`, `ts`, `py`, and `sh`. Unsupported or missing language names remain plain code; there is no automatic language detection. Inline code keeps its existing background and border without syntax coloring. Highlighted blocks use paired light/dark palettes that follow Orca's mode, not custom host syntax colors. Viewing a note never changes its Source or saved text.

Write a fenced `mermaid` code block to display a diagram in Preview:

````markdown
```mermaid
flowchart LR
  Source --> Preview
```
````

Source and saved Markdown stay unchanged. Other code blocks remain code. If a diagram cannot render, Preview shows its original code and an error while the rest of the note stays available. Diagrams follow the light/dark theme and use bundled local Mermaid code; they do not load external images, fonts, or other resources, and diagram links and click actions are disabled. HTML labels are disabled. Mermaid directives (`%%{…}%%`) and frontmatter, including title-only frontmatter, are not supported; use Mermaid's `accTitle` and `accDescr` for accessible descriptions.

## Note settings and deletion

Select the gear beside **Note** to open **Note Settings**. Under **Character limit**, choose **Default**, **No limit**, or **Custom** and enter a positive whole number. The setting applies to all notes. **No limit** removes the plugin's character cap, not platform storage limits. Lowering the limit never truncates existing notes; notes already over the limit can be edited without growing or shortened.
Use **Show Source line numbers** in the same dialog to show or hide the gutter for all notes. It defaults to On and is remembered without changing your notes or undo history.

Each setting has its own row and applies and saves automatically; there is no Save button. An empty or invalid Custom value stays in the input without replacing the applied limit, and does not prevent changing line-number visibility. If saving fails, the last successfully saved value applies; edit the number or change the control again to retry.

Under **Note Settings**, **Delete all notes…** counts stored notes across every project, worktree and host identity in the current plugin store, including removed targets and unsaved drafts in this panel. Copy important notes elsewhere before confirming: deletion also clears Source undo history and cannot be undone. Settings are kept. If deletion stops with an error, retry the remaining notes; already deleted notes cannot be restored. Other running Orca servers have separate stores. Close other Note panels before deleting to avoid concurrent edits.

## Editing and shortcuts

The subtitle shows the current project and worktree. During **Switching…**, Source is read-only until the new note is ready.

In Source on macOS, **Cmd+Option+Up/Down** adds a cursor above or below; typing edits all cursors.

Enter continues unordered lists (`-`, `*`, `+`), increments ordered lists, and creates unchecked task items after checked or unchecked tasks. Indentation is preserved; Enter on an empty item exits that list level. Ordered markers stay within Markdown's nine-digit limit, repeating the maximum number when reached. Quoted lists, literal code/HTML, selections, and mixed list/non-list cursor groups retain normal Enter behavior. Pasted Markdown is not rewritten.

Select the keyboard icon beside **Note** to open **Keyboard Shortcuts**; press **Esc** or select **Close** to dismiss it.
The shortcut list scrolls independently, with space beside the keys for the scrollbar.

If saving fails, your text stays in the panel and you can select **Retry save**. Closing the panel or quitting the app while saving has failed may lose unsaved text.

## Storage scope

Notes are separate by host, folder path, and worktree. For a project-wide note, use the main project folder. Removing a project or worktree does not delete its note; adding the same host and path again restores it. Moving the folder or changing hosts creates a separate note.

Notes are stored in plugin-owned storage, separately from project `.md` files and Git. There is no automatic remote backup, synchronization, or export/import feature. Copy important notes to a separate file; see [Maintenance](MAINTENANCE.md#protect-stored-data) for data protection and recovery details.
