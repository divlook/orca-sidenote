# Note filtering

See [Note labels](LABELS.md) for label behavior, the [Glossary](../GLOSSARY.md) for terminology, [Architecture](ARCHITECTURE.md) for runtime contracts, and [Data](DATA.md) for storage and transfer behavior.

## Purpose and boundaries

A label filter changes which cards are displayed, not which notes belong to the collection. Users can select multiple catalog labels and **No label**. A note matches any selected label, or **No label** if it is unlabeled. With no selections, all notes are shown. The initial filter is **All notes**.

The filter is a persisted view preference for the exact host and project or worktree path. It is excluded from notes backups. Filtering alone does not change note data or archive records. Its separate key and value format are documented in [Data](DATA.md); the existing `note:v1:` plus `JSON.stringify([hostId, path])` note identity remains unchanged.

Notes retain their manual collection order. Automatic sorting and creation or modification timestamps are not supported.

## Filter controls and empty state

The filter row below the heading contains a dropdown with multi-select rows for catalog labels and **No label**. It also shows the selection summary, **Clear**, and a displayed/total count. The menu stays open for multiple selections. The count includes temporarily displayed nonmatching cards. Clearing the filter shows the full collection in manual order.

When a nonempty collection has no displayed cards, a filtered-empty message offers a clear-filter action. **Add note** remains available. This state is distinct from an empty collection.

## Focus, new notes, and pending cards

When changing a focused note's label makes it stop matching, keep the card displayed until focus really leaves it. Dragging does not end this temporary display. Preserve hidden cards' editor state, undo history, mode, and minimized state.

New notes are always unlabeled. A new note remains displayed while it is focused or being edited, even when it does not match the filter; apply the filter when the card is exited. The existing empty-note pruning behavior remains in effect on an ordinary exit.

An explicit filter change takes effect immediately, including when it hides the active note. A focus change caused solely by interacting with the filter must not prune an empty note. Preserve content, failed drafts, editor history, mode, and minimization when a card is hidden.

A temporarily displayed nonmatching card shows a static neutral clock and **Filter pending** after the drag grip. At narrow widths, only the clock appears, with a tooltip and accessible explanation that the card will hide when focus leaves. Expanded and minimized cards use the same indicator without changing toolbar height, actions, or label tint.

## Reordering and bulk controls

Drag and Option+Up/Down keyboard reordering remain available with a filter active. Reorder only the slots occupied by currently displayed cards in the full manual sequence; keep hidden notes at their absolute indices. Temporarily displayed unmatched cards participate in the same way as other displayed cards. Both input methods use the same visible-slot semantics, the latest full collection membership, and preserve note records and content.

For example, if the full sequence is `A, X, B, Y`, only `A` and `B` are displayed, and `B` is moved before `A`, the resulting full sequence is `B, X, A, Y`.

**Minimize all notes** and **Expand all notes** affect displayed cards only, including temporarily displayed unmatched cards. Filtering does not change the existing scopes of backup, restore, global deletion, or catalog operations.

## Catalog changes

When a selected label is deleted, remove its selection while retaining any **No label** selection. If no selections remain, show all notes. Resetting the catalog removes selections for deleted label IDs; do not bind them to newly created defaults. Reconcile stale IDs in scoped filters without rebinding by name.

## Storage and integration constraints

Filtering preserves exact scope isolation, focus-generation and editor revision/key guards, ordered collection writes, complete failed drafts, and retry behavior. Data is never truncated to satisfy limits. Preference read or write errors are visible and retryable through **Retry filter**. Filtering preserves sanitized Markdown rendering and does not change collection membership merely to hide cards.

## Verification

See [Verification](VERIFICATION.md) for the verification workflow. Filter matching, persistence, failures, and displayed-slot reordering are covered in [note-filter.test.ts](../src/notes/note-filter.test.ts). Focus, pending indicators, and card state also require panel checks.
