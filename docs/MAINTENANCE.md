# Maintenance

## Unload, disable, and re-enable

Preserve unsaved text before changing plugin state. To remove this development override, run from the checkout root:

```sh
/Applications/Orca.app/Contents/Resources/bin/orca plugin dev unload . --environment local --json
```

An installed plugin with the same key becomes available again. It may need its own approval if its access differs. Unloading does not disable that plugin or guarantee note retention.

To manage a plugin, list local plugins first:

```sh
/Applications/Orca.app/Contents/Resources/bin/orca plugin list --environment local --json
```

Find the actual key in the response. Replace `<plugin-key>` in the appropriate command below. Do not type the angle brackets.

Disabling needs no approval. Re-enabling a disabled code-running plugin needs approval. Review the returned access list. Rerun the returned command with `--approve` and its fingerprint only after you explicitly approve the access. Do not reuse or invent a fingerprint.

```sh
/Applications/Orca.app/Contents/Resources/bin/orca plugin disable <plugin-key> --environment local --json
/Applications/Orca.app/Contents/Resources/bin/orca plugin enable <plugin-key> --environment local --json
```

## Troubleshooting

| Symptom | Checks and response |
| --- | --- |
| `Not saved` / `Retry save` | Keep the panel open and copy the text elsewhere. Inspect the error, select **Retry save**, and check for `Saved`. A failed draft may exist only in panel memory. |
| `Location unavailable` / `Switching…` | Check the active worktree and installed CLI path. Run the read-only query below. Incomplete or ambiguous results block editing to protect notes. |
| `Editor unavailable` | Check bundles and worker assets. Inspect build errors. Preserve unsaved text before rebuilding or reloading. Keep worker preflight enabled. |
| `Settings unavailable` | Inspect the settings error. Use the explicit replacement procedure in [Usage](USAGE.md#note-settings). Do not reset note storage. |
| Preview link error | Inspect the error. A failed link must not clear the note or disable editing. |

```sh
/Applications/Orca.app/Contents/Resources/bin/orca worktree ps --environment local --limit 10000 --json
```

The worker uses this query with a 15-second timeout and an output-size bound. It accepts only one active target in a complete list. When reporting errors, include Orca and Node versions, reproduction steps, and command error codes. Redact note content, private paths, and host details.

## Upgrades

Before updating, preserve important text and unsaved drafts separately. Record the current checkout. Keep dependency changes with their lockfile updates. Regenerate API types after Orca updates. Perform [verification](VERIFICATION.md). Older code does not automatically restore a changed storage format. See [Data](DATA.md) for backup and recovery.
