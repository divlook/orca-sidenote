# Notes and data

Notes are strings in Orca's plugin-owned storage, separate from project files and Git. There is no automatic remote backup or synchronization. Separate Orca servers have separate stores.

Removing a project or worktree does not delete its note. Reusing the same host and path reads it again. Folder moves and host changes have no automatic migration. Retention after plugin removal or app-data reset is not guaranteed.

A failed draft may exist only in panel memory. Copy it before closing or reloading the panel. Do not edit or delete user storage keys or files for testing or recovery. Plan a migration before changing storage formats. Test it with isolated data.

## Back up notes

Backup files contain note text and potentially sensitive host and folder paths in plaintext. Store and share them accordingly. Native file saving is available in desktop isolated frames and requires a fresh click on the Save button.

Other Note panels cannot be detected or locked. Before a transfer, save or copy their unsaved content and close them.

1. Open **Note Settings → Data → Back up or restore notes…**.
2. Check the acknowledgement. Select **Start transfer**. Editing pauses in this panel until you close the dialog.
3. Select **Prepare backup**. Select **Save backup file**.

The backup includes all stored notes in this store and separate recovery drafts from this panel. Recovery drafts include failed saves, new drafts, and empty clears. The backup excludes settings, undo history, and unsaved drafts held only in other panels. Backup is available even when the active location, editor, or settings are not ready.

## Restore notes

Restore preserves exact host and path identities. Paths in the file are not file destinations. To move notes between a local development installation and a Git installation on the same computer, back up one store and restore into the other.

Before starting, save or copy unsaved content in other Note panels and close them. The host provides no cross-panel storage lock. Start transfer as described under [Back up notes](#back-up-notes).

1. Select a SideNote UTF-8 JSON backup. Choose a candidate for each identity. If a stored note and a recovery draft share an identity, choose one explicitly.
2. Select **Preview selected restore**. Different destination text and affected unsaved drafts remain unchanged unless you select replacement. Notes absent from the backup are not deleted.
3. For replacements, select **Save protection file**. The file contains affected stored originals and this panel's recovery drafts. Confirm replacement only after saving it. Protection and confirmation apply only to this preview. If choices or destination data change, prepare a new preview. Save protection again before replacing notes. Canceling the protection save blocks replacement and changes no notes.
4. Select **Restore selected notes**.

A changed note gets new undo history. An unchanged note keeps its history. Preview also refreshes selected clean notes whose saved text changed since this panel loaded them, including identical skips. Unsaved and failed drafts remain. A refreshed note loses undo history only when its cached text changes.

Restore stops on the first failed request. Its outcome may be unknown. Earlier writes are not rolled back. Preview again before retrying. Text over the current editing limit stays intact and does not change the limit.

## Delete all notes

Deletion cannot be undone. Copy important notes elsewhere before confirming. Close other Note panels first to avoid concurrent edits. Other Orca servers have separate stores.

Under **Note Settings**, select **Delete all notes…**. The count covers notes across all projects, worktrees, and hosts in this store, including removed targets and this panel's drafts. Pending writes finish before counting. Editing and focus loads remain suspended through confirmation.

Confirmation removes all `note:v1:` keys and discards this panel's drafts and undo history. Settings remain. Cancel before confirmation to preserve notes. Storage has no atomic bulk delete. A failure may leave some notes deleted and others available for retry. Closing after partial failure does not restore deleted notes.

## Formats and limits

[protocol.ts](../src/protocol.ts) defines a key as `note:v1:` + `JSON.stringify([hostId, path])`. A `null` host and a string host are distinct. Normalizing paths or merging host values can change identities.

The archive format is `orca-sidenote-notes`, version 1. Import rejects invalid UTF-8, malformed JSON, unsupported formats, and unknown fields. It does not import raw Orca storage JSON. Archives are limited to 16 MiB and 10,000 combined stored-note and recovery-draft candidates. These are application limits, not Orca quotas.

In the inspected Orca host, storage keys contain 1–256 characters excluding reserved names. Each JSON-serialized value is at most 256 KiB. The namespace holds at most 1,024 keys and 5 MiB of pretty-printed JSON. Settings share this namespace and count toward its limits. Actual writes can still fail.

The character limit is stored under `settings:note-character-limit` as `{ characterLimit: number | null }`. A missing value defaults to 8,000. Custom requires a positive safe integer. `null` means No limit. Counts use JavaScript string `length`. Older character-limit settings remain valid.

Source line-number visibility is stored separately as a boolean under `settings:source-line-numbers`. It defaults to On when absent.
