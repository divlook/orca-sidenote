# Usage

Open **Note** in Orca's right sidebar. Each host and folder has an ordered collection of Markdown notes. The **Add note** icon in the heading and the button after the last card append a blank, expanded note in editing mode and focus its body. Cards grow with their content; only the outer list scrolls vertically. Long Preview code blocks can scroll horizontally.

Each card has a drag grip and three actions: **Read note / Edit note**, **Minimize note / Expand note**, and **Delete note**. Drag the toolbar outside the action buttons to a blue insertion line to reorder cards, or click the grip and press **Option+Up/Down**. Tab skips the grip and still reaches the three action buttons. Order saves for the current host and path.

When focus leaves a card whose content is empty or only whitespace, the card is deleted without a confirmation dialog. Existing empty cards are not swept on load. Moving focus within a card, dragging, readiness changes, and switching worktrees do not trigger this deletion. If queued typing makes the note nonempty, it is retained.

Minimized cards show a single-line plain-text summary of the first nonempty top-level Markdown block. Paragraphs, lists, and code blocks use the whole block, with whitespace normalized for display. Nonempty notes have a literal `...` suffix; empty notes show **Empty note**. The summary affects display only; the original body stays intact. Every toolbar action remains available while minimized. Changing mode does not expand a minimized card. Each note keeps its own selection, cursor, and undo history while you switch modes, minimize, reorder, or visit another worktree.

Use reading mode to read formatted Markdown and toggle task checkboxes with a click or Space. Single line breaks in paragraphs and list items remain visible; blank lines still separate blocks. Changes save normally and can be undone in that note's editor. Raw HTML checkboxes stay read-only. Images do not load. Long cards keep their toolbar visible while you scroll.

In reading mode, open HTTP and HTTPS links in your default browser, a new Orca browser tab, or a destination chosen each time. In note settings, **Open web links in** offers **Default browser** (the default), **Orca browser**, and **Ask every time**. `mailto:` links open externally. For a local worktree, relative file links resolve from its root; absolute paths and `file://` links within it open in Orca's editor. Remote worktrees can open web links through the same configured destinations. Remote file links are unsupported and show an error. Links outside the worktree, unsupported protocols, and links from an ambiguous, stale, or wrong-host scope are rejected with an error.

Before opening a local file, SideNote resolves its canonical path and checks that it is inside the worktree. Orca's editor API does not guard against a concurrent filesystem change between that check and opening the file.

Opening files requires the new `workspace:write` permission. Review and approve the requested access when Orca asks; approval does not open a link automatically.

The subtitle shows the current project and worktree. During **Switching…**, editing stays disabled until the new collection is ready. An ambiguous or unavailable location blocks editing. A confirmed development installation shows a **DEV** badge.

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

**Confirm before deleting a note** defaults to On. A card's trash icon opens **Delete this note?** with **Cancel** and **Delete**. Deleting permanently removes only that note and its unsaved draft. The card leaves smoothly unless reduced motion is enabled. Changing worktrees dismisses the confirmation without deleting anything.

Turn confirmation Off to make future trash clicks delete immediately and irreversibly. Changing the setting itself deletes nothing, and you can turn it back on at any time. It does not affect the separate **Delete all notes…** action.

**Show Source line numbers** controls the gutter for all notes and defaults to On. **Default note mode** defaults to Editing. Choose Reading to open existing notes in reading mode and return edited notes to reading mode when focus leaves the card; new notes start in editing mode. Settings apply and save automatically. If saving a setting fails, its last successful value applies; change the control again to retry. Unreadable deletion confirmation, line-number, or default-mode preferences block editing until explicitly replaced. An unreadable web-link preference blocks web links, not editing.

There is no plugin character limit or character counter. Host storage quotas still apply, and writes can fail.

## Editing and shortcuts

On macOS, **Cmd+Option+Up/Down** adds a cursor above or below. Typing edits all cursors. Select the keyboard icon beside **Note** for the shortcut list. Press **Esc** or select **Close** to dismiss it.

In editing mode, typing `(`, `[`, `{`, `"`, `'`, or a backtick wraps selected text with the matching delimiters and keeps the text selected. An empty cursor inserts only the typed character, without auto-closing. Asterisks and underscores are not intercepted for wrapping.

Use **Cmd+B** for bold, **Cmd+I** for italic, and **Cmd+Shift+X** for strikethrough. These insert Markdown delimiters rather than toggling existing formatting. **Cmd+K** creates a Markdown link: selected text becomes the escaped label and the cursor moves to the empty destination; with no selection, the cursor moves inside the empty label.

Pasting a single HTTP or HTTPS URL over selected ordinary single-line text creates a Markdown link. This applies to keyboard and context-menu paste. Empty cursors and linewise paste insert the URL as plain text; selections in code, existing links, images, or autolinks are not converted.

Enter continues unordered lists, increments ordered lists, and creates unchecked tasks. Indentation is preserved. Enter on an empty item exits that list level. Ordered markers use at most nine digits and repeat the maximum number when reached. Quoted lists, literal code or HTML, selections, and mixed list/non-list cursor groups retain normal Enter behavior. Other pasted Markdown is not rewritten.

Right-click Source for **Change All Occurrences**, **Cut**, **Copy**, and **Paste**. Clipboard permission failures leave the note unchanged and show an error. Source uses CodeMirror and preserves original Markdown, including mixed line separators.

Changes save automatically without saving or success labels. If saving fails, an error and **Retry save** appear. Your complete collection draft, including new notes and reordered cards, stays in panel memory for retry or backup. Closing the panel or quitting the app while saving has failed may lose unsaved text.

## Your notes

Collections are separate by exact host and folder path. Removing a worktree does not delete its notes. Reusing the same host and path reads them again. Moving the folder or changing hosts creates a separate collection. An older single note becomes one card without changing its text; Markdown separators never split notes.

Notes live in plugin-owned storage, not project Markdown files or Git. They do not sync or back up automatically. [Back up your notes](DATA.md#back-up-notes) to a separate file. Before deleting notes, read [Delete all notes](DATA.md#delete-all-notes): deletion clears this panel's drafts and undo history and cannot be undone.
