# Notes and data

Each exact host and worktree path has an ordered collection of notes in Orca's plugin-owned storage, separate from project files and Git. There is no automatic remote backup or synchronization. Separate Orca servers have separate stores.

Removing a project or worktree does not delete its note. Reusing the same host and path reads it again. Folder moves and host changes have no automatic migration. Retention after plugin removal or app-data reset is not guaranteed.

A failed draft may exist only in panel memory. Copy it before closing or reloading the panel. Do not edit or delete user storage keys or files for testing or recovery. Plan a migration before changing storage formats. Test it with isolated data.

## Back up notes

Backup files contain note text and potentially sensitive host and folder paths in plaintext. Store and share them accordingly. Native file saving is available in desktop isolated frames and requires a fresh click on the Save button.

Other Note panels cannot be detected or locked. Before a transfer, save or copy their unsaved content and close them.

1. Open **Note Settings → Data → Back up or restore notes…**.
2. Check the acknowledgement. Select **Start transfer**. Editing pauses in this panel until you close the dialog.
3. Select **Prepare backup**. Select **Save backup file**.

The backup includes all stored collections, with note IDs and order, and separate recovery collections from this panel. Recovery collections include failed edits, new blank notes, empty clears, and unsaved ordering changes. The backup excludes settings, undo history, and unsaved drafts held only in other panels. Backup is available even when the active location, editor, or settings are not ready.

## Restore notes

Restore preserves exact host and path identities. Paths in the file are not file destinations. To move notes between a local development installation and a Git installation on the same computer, back up one store and restore into the other.

Before starting, save or copy unsaved content in other Note panels and close them. The host provides no cross-panel storage lock. Start transfer as described under [Back up notes](#back-up-notes).

1. Select a SideNote UTF-8 JSON backup. Choose a collection for each host/path identity. If stored notes and a recovery collection share an identity, choose one explicitly.
2. Select **Preview selected restore**. Different destination collections and affected unsaved drafts remain unchanged unless you select replacement. Replacement applies to the whole selected collection, including note IDs and order. Collections absent from the backup are not deleted.
3. For replacements, select **Save protection file**. The file contains affected stored originals and this panel's recovery drafts. Confirm replacement only after saving it. Protection and confirmation apply only to this preview. If choices or destination data change, prepare a new preview. Save protection again before replacing notes. Canceling the protection save blocks replacement and changes no notes.
4. Select **Restore selected notes**.

A changed note gets new undo history. An unchanged note keeps its history. Preview also refreshes selected clean notes whose saved text changed since this panel loaded them, including identical skips. Unsaved and failed drafts remain. A refreshed note loses undo history only when its cached text changes.

Restore stops on the first failed request. Its outcome may be unknown. Earlier writes are not rolled back. Preview again before retrying. Text is never truncated to a plugin character limit; Orca's storage quotas still apply.

## Delete all notes

Deletion cannot be undone. Copy important notes elsewhere before confirming. Close other Note panels first to avoid concurrent edits. Other Orca servers have separate stores.

Under **Note Settings**, select **Delete all notes…**. The count covers notes or empty saved locations across all projects, worktrees, and hosts in this store, including removed targets and this panel's drafts. Each empty or unreadable saved location counts as one cleanup entry. Pending writes finish before counting. Editing and focus loads remain suspended through confirmation.

Confirmation removes all `note:v1:` keys and discards this panel's drafts and undo history. Settings remain. Cancel before confirmation to preserve notes. Storage has no atomic bulk delete. A failure may leave some notes deleted and others available for retry. Closing after partial failure does not restore deleted notes.

Deleting one card is an ordered, target-only transaction: it waits for earlier writes and saves its collection without that note, without a global lease or refocusing the panel. The card and its draft are removed only after a successful write. During that draft's lifetime, later queued snapshots also omit the deleted ID so they cannot restore it. An explicit lease replacement creates a new draft and can restore the same ID. A failed request may have an unknown outcome; the panel rereads clean data without discarding unsaved drafts. A successful deletion clears only that card's editor history; it does not change other notes or preferences. Bulk deletion and transfer remain exclusive operations and drain pending single-card deletions.

## Formats and limits

[protocol.ts](../src/protocol.ts) defines a key as `note:v1:` + `JSON.stringify([hostId, path])`. A `null` host and a string host are distinct. Normalizing paths or merging host values can change identities.

Values are version 2 objects: `{ version: 2, notes: [{ id, text }] }`. Array order is display order. IDs are nonempty and unique within a collection. New notes use random UUIDs and append as blank notes. Missing values mean an empty collection. Every legacy string, including empty strings, JSON-looking Markdown and text containing `---`, is read as exactly one note with the stable ID `legacy`. Reading never writes storage; the first mutation saves the collection object. Older plugin releases expect strings and cannot read version 2 envelopes. Keep a backup before downgrading; there is no automatic downgrade conversion.

The archive format is `orca-sidenote-notes`, version 2. Each record has exact `hostId`, `path`, and an ordered `notes` array of `{ id, text }`. Both `notes` and `recoveryDrafts` contain collection records. Version 1 backups are accepted losslessly as one `legacy` note per record. Restoring a legacy record into an existing scope follows the same whole-collection conflict and replacement rules; it does not append to or split the destination notes. Import rejects invalid UTF-8, malformed JSON, unsupported formats, unknown fields, and duplicate identities or note IDs. It does not import raw Orca storage JSON. Archives are limited to 16 MiB and 10,000 combined note candidates (empty collections count as one). These are application resource bounds, not Orca quotas.

In the inspected Orca host, storage keys contain 1–256 characters excluding reserved names. Each JSON-serialized value is at most 256 KiB. The namespace holds at most 1,024 keys and 5 MiB of pretty-printed JSON. Settings share this namespace and count toward its limits. Actual writes can still fail.

There is no plugin character cap. The retired `settings:note-character-limit` value is left untouched and ignored. The host's per-value quota applies to the complete collection, so multiple notes at one location share that quota. Storage errors remain visible and failed snapshots can be retried; this is not a promise of unlimited storage.

Source line-number visibility is stored separately as a boolean under `settings:source-line-numbers`. It defaults to On when absent.

Single-note deletion confirmation is stored separately as a boolean under `settings:confirm-note-deletion`. It defaults to On when absent and applies to future per-card trash actions. Changing this setting deletes nothing and does not disable the separate confirmation for deleting all notes.

Default note mode is stored separately under `settings:default-note-mode` as `editing` or `reading`. It defaults to `editing` when absent. Existing setting values are preserved.
