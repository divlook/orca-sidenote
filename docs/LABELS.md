# Note labels

See the [Glossary](../GLOSSARY.md#note-labels) for terminology, [Architecture](ARCHITECTURE.md) for existing runtime contracts, and [Data](DATA.md) for current storage and transfer behavior.

## Purpose and boundaries

A label classifies a note without enforcing a workflow. Each note has zero or one label, assigned manually. Choosing another label replaces the current one; choosing **No label** clears the assignment. New and existing unlabeled notes remain unlabeled.

There is no separate `draft` label. Unlabeled notes cover both draft-stage work and ordinary notes that do not need classification. Labels are independent of Markdown task checkboxes, Editing or Reading mode, and card minimization. Completing checkboxes does not change a label.

Labels can be used to filter displayed cards. Automatic note sorting, hiding completed notes automatically, and enforced transitions are not supported. See [Note filtering](FILTERING.md). A note may move directly between any labels or return to no label.

## Shared catalog and defaults

One ordered label catalog is shared by all projects, worktrees, and hosts in the current plugin store. Separate Orca servers retain separate stores; sharing the catalog does not add synchronization between them.

The default catalog has this order:

| Label | Conventional meaning |
| --- | --- |
| `todo` | Planned work that has not started |
| `in progress` | Work underway |
| `in review` | Reviewing the result, including self-review |
| `done` | Work and any necessary review are complete |

These meanings are conventions, not validation rules. All four defaults can be renamed, recolored, deleted, or reordered just like user-created labels.

Each label has a name and a color selected from a fixed palette. Custom colors are not supported. Names must be unique after trimming leading and trailing whitespace and ignoring English letter case: `Bug` and ` bug ` conflict. Equal colors are allowed.

## Card presentation and selection

An assigned label appears as a compact color indicator plus its text name, and subtly tints the card toolbar. The note body in reading mode and the minimized summary retain their usual backgrounds. Color supplements the name; it is not the only way to identify the label.

An unlabeled card shows a small, uncolored **+ Label** button, not a `draft` or **No label** badge. Activating it opens the label picker. In that menu, **No label** is selected for an unlabeled note and is always the first option. The remaining options follow the shared catalog order.

Label controls remain available on minimized cards. Selecting or clearing a label updates the toolbar tint without changing note order, minimization, or body presentation. An active filter can hide a card after focus leaves it.

If the active worktree changes while a label selection is checking the catalog, the selection is discarded even if the original worktree becomes active again before that check finishes.

## Catalog management

Note Settings contains label management. Cards provide assignment and removal, rather than a second catalog-management interface.

Users can:

- Add labels, appended to the end of the catalog.
- Edit a label's name and palette color, then select **Save changes** for that label. Unsaved edits remain in the panel for retry if saving fails. Saved changes apply to every note using that label.
- Choose a color from a compact dropdown showing named palette colors for both new and existing labels.
- Reorder labels by dragging or using move-up and move-down buttons. The resulting order applies to every card's picker, not to note order.
- Delete labels.
- Reset all labels to the defaults.

If a catalog write is rejected during reset or restore, its outcome may be unknown. Reload the catalog before assigning labels or editing the catalog.

Before deleting a label or resetting the catalog, save or copy unsaved changes in other Note panels and close them. Other panels cannot be detected or locked. These operations are not atomic: a failure can leave some assignments cleared without completing the catalog change. Earlier writes are not rolled back.

### Delete a label

Deleting a label removes its assignment from every affected note in the current store, including notes in inactive or removed projects and worktrees. Note text remains unchanged.

Deletion shows the affected note count and requires confirmation, even when no notes use the label. The operation affects all projects in this store, not only the active project. Canceling before confirmation changes nothing.

### Reset labels

**Reset labels…** clears the current catalog rather than adding missing defaults. It shows the affected note count and requires explicit confirmation.

A confirmed reset:

1. Removes label assignments from all notes in the store.
2. Deletes the entire current catalog, including custom labels and edited defaults.
3. Recreates only `todo`, `in progress`, `in review`, and `done`, with their default colors and that order.

Reset preserves note text and note order. It does not assign the recreated labels to any note. Canceling before confirmation changes nothing. Other Orca server stores are unaffected.

## Backup and restore

Labels are note data, not preferences excluded from backup. Backups include the complete label catalog, its order, and note-label assignments, including assignments belonging to recovery collections.

Restore operates on selected note collections in their original exact host/path scopes. It imports only labels needed by collections that it creates or replaces, not every unused label in the backup. Consequently, restoring all notes does not necessarily recreate unused catalog entries.

### Merge labels without changing existing notes

Keep the destination catalog and its order. For each needed incoming label:

| Destination match | Restore behavior |
| --- | --- |
| Same normalized name and same palette color | Reuse the existing label |
| Same normalized name but different palette color | Add a separate label with an available numeric suffix, such as `Bug (2)` |
| No matching normalized name | Add the incoming label |

Apply the same name-uniqueness rule to generated suffixes. Remap restored notes to the reused or newly added labels. Append new labels in their relative backup order; reused labels retain their destination positions.

Do not overwrite the names, colors, order, or assignments of existing labels used by unselected notes. A partial restore must not change the rest of the shared picker beyond appending imported labels.

### Older backups

Older supported backups contain no label data. Incoming notes from those backups have no label. Replacing an existing collection removes its old assignments rather than copying them onto incoming notes. The destination label catalog remains.

## Storage and integration constraints

The label feature must preserve the existing contracts rather than bypass them:

- Keep `note:v1:` + `JSON.stringify([hostId, path])` unchanged, including exact host/path isolation.
- Keep label identity independent of its editable name and color so renaming does not detach notes.
- Preserve note IDs and collection order. Label-only changes must not discard note text, failed drafts, per-note editor history, or view state.
- Integrate label assignments into ordered collection writes and recovery data. Stale queued snapshots must not resurrect assignments removed by deletion or reset.
- Preserve focus-generation and editor revision/key guards, fail-closed readiness, visible save failures, and retry behavior.
- Preserve the existing restore preview, protection-file, confirmation, and partial-write safety contracts for label data as well as text. Do not promise an atomic store-wide transaction where the host provides none.

The current collection and archive schemas, including compatibility with older data, are documented in [Data](DATA.md).

## Verification

See [Verification](VERIFICATION.md) for the verification workflow. Label model and transfer scenarios are covered in [note-labels.test.ts](../src/notes/note-labels.test.ts). Use isolated stores for destructive scenarios.
