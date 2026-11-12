# Usage

Open **Note** in Orca's right sidebar. Write in **Source**. The editor saves changes automatically and supports find and replace, line numbers, and per-note undo. Notes default to an 8,000-character limit.

Use **Preview** to read formatted Markdown and toggle task checkboxes with a click or Space. Changes save normally and can be undone in Source. Raw HTML checkboxes stay read-only. Images do not load.

The subtitle shows the current project and worktree. During **Switching…**, Source stays read-only until the new note is ready. A confirmed development installation shows a **DEV** badge.

## Code blocks

Preview displays fenced code as escaped plain text, regardless of the language name:

````markdown
```typescript
const message: string = 'Hello'
console.log(message)
```
````

Code blocks preserve whitespace without syntax highlighting. Mermaid fences display their source as ordinary code. Viewing a note does not change Source or saved text.

## Note settings

Open the gear beside **Note**. Under **Character limit**, choose **Default**, **No limit**, or **Custom**. Custom accepts a positive whole number. The limit applies to all notes. **No limit** removes the plugin cap, not host storage limits. Lowering a limit never truncates a note. An oversized note can still be shortened or edited without growing.

**Show Source line numbers** controls the gutter for all notes. It defaults to On. Each setting applies and saves automatically. An invalid or empty Custom draft does not replace the applied limit or block line-number changes. If a save fails, the last successful value applies. Change the control or edit the number again to retry.

Unreadable preferences block editing until each is explicitly replaced. Choose a limit mode or valid Custom number to replace an unreadable limit. Change **Show Source line numbers** to replace unreadable visibility.

## Editing and shortcuts

On macOS, **Cmd+Option+Up/Down** adds a cursor above or below. Typing edits all cursors. Select the keyboard icon beside **Note** for the shortcut list. Press **Esc** or select **Close** to dismiss it.

Enter continues unordered lists, increments ordered lists, and creates unchecked tasks. Indentation is preserved. Enter on an empty item exits that list level. Ordered markers use at most nine digits and repeat the maximum number when reached. Quoted lists, literal code or HTML, selections, and mixed list/non-list cursor groups retain normal Enter behavior. Pasted Markdown is not rewritten.

Right-click Source for **Change All Occurrences**, **Cut**, **Copy**, and **Paste**. Clipboard permission failures leave the note unchanged and show an error. The Source editor uses CodeMirror; existing notes and storage formats do not change.

If saving fails, your text stays in the panel. Select **Retry save**. Closing the panel or quitting the app while saving has failed may lose unsaved text.

## Your notes

Notes are separate by host and folder path. Use the main project folder for a project-wide note. Removing a worktree does not delete its note. Reusing the same host and path reads it again. Moving the folder or changing hosts creates a separate note.

Notes live in plugin-owned storage, not project Markdown files or Git. They do not sync or back up automatically. [Back up your notes](DATA.md#back-up-notes) to a separate file. Before deleting notes, read [Delete all notes](DATA.md#delete-all-notes): deletion clears this panel's drafts and undo history and cannot be undone.
