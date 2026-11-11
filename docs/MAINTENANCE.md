# Maintenance

## Installation and trust

The current target is a local macOS development folder. Follow [Development](DEVELOPMENT.md) for installation, type generation, and builds. Do not assume a marketplace distribution or automatic update path.

The [manifest](../orca-plugin.json) uses `trusted-worker`, which runs Node code with the user's account permissions. `workspace:read` supports worktree-change events; `storage:own` stores notes and settings. Later edits in an approved development folder can run without renewed approval, so load only a trusted checkout. Review access again when capabilities or execution behavior change.

### Unload, disable, and re-enable

Preserve unsaved text before changing plugin state. To stop using this checkout as a local development folder, run from its root:

```sh
/Applications/Orca.app/Contents/Resources/bin/orca plugin dev unload . --environment local --json
```

Unloading removes the development override. An installed plugin with the same key becomes available again and may need its own approval if its access differs. This is not the same as disabling that installed plugin, and it does not guarantee note retention after removal.

To manage whether a plugin runs, list the local plugins first:

```sh
/Applications/Orca.app/Contents/Resources/bin/orca plugin list --environment local --json
```

Find the actual key in the response. Replace `<plugin-key>` below with that value before running either command; do not type the angle brackets literally. Disable to stop the plugin, or enable to request running it again:

```sh
/Applications/Orca.app/Contents/Resources/bin/orca plugin disable <plugin-key> --environment local --json
/Applications/Orca.app/Contents/Resources/bin/orca plugin enable <plugin-key> --environment local --json
```

Disable needs no approval. Re-enabling a disabled code-running plugin requires approval again. Review the returned access list and rerun the returned command with `--approve` and its fingerprint only after explicitly approving that access. Do not reuse or invent a fingerprint.

## Protect stored data

Notes are strings in Orca's plugin-owned storage, not project Markdown files or Git. [protocol.ts](../src/protocol.ts) defines the key as `note:v1:` + `JSON.stringify([hostId, path])`. Different worktree paths or host values identify different notes. Merging `null` and string host values or normalizing paths can change existing note identities.

Removing a project/worktree from the workspace list does not make this code delete its note. Reusing the same host/path reads the same key. Folder moves and host changes have no automatic note migration. Note retention after plugin removal or app-data reset is not guaranteed.

- There is no automatic remote backup, synchronization, or export/import feature. Cloning the Git repository does not back up user notes.
- Copy important Source text into a separate file. If saving fails, preserve the current text before closing or reloading the panel.
- Do not delete or edit user storage keys/files for testing or recovery. Before changing formats, plan how to read and migrate existing keys/strings and test with isolated data.
- **Note Settings → Delete all notes…** explicitly removes all `note:v1:` keys in the current plugin store, not just loaded worktrees, and discards this panel's drafts and undo history. It keeps settings. Pending writes finish before counting; editing and focus loads remain suspended through confirmation. Storage has no atomic bulk delete: a failure may leave some notes deleted and others available to retry. Cancel before confirming preserves notes; closing after a partial failure does not restore removed notes. Close other Note panels first because the host does not provide a cross-panel storage lock. Separate Orca servers have separate stores.

### Character limits

[note-settings.ts](../src/note-settings.ts) stores `{ characterLimit: number | null }` under `settings:note-character-limit`. A missing setting defaults to 8,000; Custom requires a positive safe integer; `null` means No limit. Counts use JavaScript string `length`. The setting applies to all notes. Lowering it never truncates text: an oversized note still allows edits that do not increase its length. No limit does not remove platform storage limits.

Unreadable settings block editing until each unreadable preference is explicitly replaced in **Note Settings**. Choose a character-limit mode or enter a valid Custom number to replace an unreadable limit; change **Show Source line numbers** to replace unreadable visibility. Each preference saves independently and automatically. Empty or invalid numeric drafts never replace the applied or stored limit and do not block visibility changes. Writes run in interaction order without disabling controls; a failed write restores the last successfully saved value while retaining the chosen control value so another input or change can retry. Do not overwrite the user's previous setting silently during recovery.
Source line-number visibility is stored separately as a boolean under `settings:source-line-numbers`, defaulting to On when absent. Older character-limit settings remain valid. Note deletion keeps both settings; a failed preference save does not replace the last successfully saved value.

## Troubleshooting

| Symptom | Checks and response |
| --- | --- |
| `Not saved` / `Retry save` | Keep the panel open and copy the text elsewhere. Inspect the error, select **Retry save**, and confirm `Saved`. A failed draft may exist only in panel memory. |
| `Location unavailable` / `Switching…` | Check the active worktree and installed CLI path. Run the read-only query below. Truncated lists, malformed responses, and multiple active targets block editing to prevent writes to the wrong note. |
| `Editor unavailable` | Check that bundles and worker assets are present together and inspect build errors. Preserve unsaved text before rebuilding/reloading. Do not bypass worker preflight to hide the failure. |
| `Settings unavailable` | Inspect the settings error and use the explicit replacement procedure above. Do not reset note storage. |
| Preview link error | Inspect the error. A failed external link must not clear the selected note or disable its editing. |

```sh
/Applications/Orca.app/Contents/Resources/bin/orca worktree ps --environment local --limit 10000 --json
```

This is the worker's query. It runs with a 15-second timeout and an output-size bound. `src/focus.ts` accepts only a unique active target in a complete list. Preserve generation guards, isolated drafts, and ordered writes so delayed requests and saves cannot overwrite the current note with another worktree's text.

When reporting an error, include Orca/Node versions, reproduction steps, and command error codes. Redact note content, private paths, and host details before sharing publicly. Use test data for hostile Markdown or injected storage failures.

## Upgrades and public distribution

Before updating, preserve important text and unsaved drafts separately and record the current checkout. Keep dependency changes with their lockfile updates. Regenerate API types after Orca updates and perform [development verification](DEVELOPMENT.md). Returning to older code does not automatically restore an already changed storage format.

Before making a public distribution:

1. Complete the relevant checks in [Contributing](../CONTRIBUTING.md), recording what actually ran.
2. Review manifest version, Orca compatibility, and permissions. `/Applications/Orca.app/Contents/Resources/bin/orca plugin inspect . --json` shows contributions and requested access.
3. Run `npm ci` and `npm run build`, then include the runtime source, complete generated `dist/`, project LICENSE, and third-party notices in the same distribution commit. Do not distribute `dist/` alone: the manifest directly references `src/worker.mjs` and `src/panel.html`; the worker imports `src/focus.ts`; the HTML uses source CSS and built assets.
4. Check for private notes, paths, screenshots, and local settings. Keep `node_modules/` and `.orca/` out of the distribution commit.

Orca's Git installation reads files from an exact commit or tag; it does not run `npm install` or `npm run build`. `/Applications/Orca.app/Contents/Resources/bin/orca plugin release-entry . --json` also uses committed HEAD, not uncommitted working files. Keep `dist/` under Git management with its source and notices so a distribution commit is directly loadable. Building locally does not commit those files. There is no separate release-asset packaging pipeline in this repository.

The package remains `private: true`: this is an Orca Git distribution, not an npm publishing path. Release automation does not publish to npm or require an npm token. MIT licensing does not change Orca approval or marketplace registration.

### Versioning and release preparation

For a user-visible change, add and commit a Changeset as described in [Contributing](../CONTRIBUTING.md#prepare-a-change). A push to `main` with pending entries creates or updates the `changeset-release/main` version PR through [the release workflow](../.github/workflows/release.yml). The workflow runs `npm run version:release`, which runs `npm run version:plugin` followed by `npm run build`, so the PR contains the synchronized versions, changelog, and built `dist/`. It pins [Changesets action v1.9.0](https://github.com/changesets/action/tree/a45c4d594aa4e2c509dc14a9f2b3b67ba3780d0d) to an immutable commit for compatibility with Changesets CLI 2.

Review the version, generated changelog, complete `dist/`, and notices together, and complete the relevant [development verification](DEVELOPMENT.md#verification) before merging the version PR. After a same-repository version PR is merged into `main`, [the release script](../scripts/release-plugin.mjs) uses the event's exact merged commit SHA to create the immutable `v<version>` tag and a GitHub Release based on the changelog. This is the merge commit for a merge, or the final resulting commit for squash/rebase merges, not the current `main` tip. It does not publish an npm package or create separate release assets.

The version job requests `contents: write` and `pull-requests: write`; the release job requests only `contents: write`. Keep the repository's default workflow token permissions at read. In repository **Settings → Actions → General**, **Allow GitHub Actions to create and approve pull requests** must be enabled; an organization policy may restrict this setting. This repository has that setting enabled.

When a workflow uses `GITHUB_TOKEN` to create or update a PR, GitHub creates matching `pull_request` workflows for the `opened`, `synchronize`, and `reopened` events in an approval-required state. A user with write access must select **Approve workflows to run** on the PR. A push made with `GITHUB_TOKEN` does not trigger a new push workflow. See [GitHub's workflow triggering documentation](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow). Automated checks do not replace testing the panel in Orca.

If the tag or release is missing after a version PR merges, rerun the release job from that PR's original workflow run while GitHub still makes it available. It uses the original merge commit rather than the current `main` tip. A matching tag with a missing release is recovered; a matching tag with an existing published release is a no-op. A tag pointing to a different commit or an existing draft or prerelease requires manual review; the workflow will not overwrite it.

`package.json` is the version source; `orca-plugin.json` and the lockfile's two root version fields must match it. Do not bump them manually or run bare `changeset version`. For offline release preparation rather than the normal automated flow, `npm run version:plugin` runs the official Changesets version command, consumes pending entries, and copies the resulting version to the manifest and lockfile root metadata. If the command or synchronization fails, it restores those release files, the changelog, and the pending entries. It rejects mismatched starting versions. The standalone command does not rebuild assets.

For [community listing](https://www.onorca.dev/plugins/add), the repository must be public on GitHub with the `orca-plugin` topic and a newly pushed `v<version>` tag for the complete distribution commit. The GitHub Release is not a substitute for the tag or topic. Check `https://www.onorca.dev/plugins/<owner>/<repo>` for listing status and required fixes. Orca says discovery usually takes an hour, but this is not a guaranteed deadline. Pushing source without a new version tag does not update the listing.

The [Changesets configuration](https://changesets.dev/guide/config#privatepackages) enables private-package versioning and disables Changesets' private-package tagging; `commit` is also false. Keep `private: true`. Do not use `changeset publish` or `npm publish`.

## Third-party licenses and redistribution notices

Project code uses the [MIT LICENSE](../LICENSE). The files below retain their original authors' terms; the project license does not replace them. Review the full notices for the actual version, and preserve copyright, permission, and license text.

| Component | Original notice and terms |
| --- | --- |
| marked 17.0.1 (Preview) | `dist/marked-LICENSE.txt`: MIT plus John Gruber's BSD 3-Clause notice. |
| DOMPurify 3.3.1 (Preview) | `dist/dompurify-LICENSE.txt`: Apache-2.0 OR MPL-2.0, including both full license texts. Review the obligations of the selected license. |
| highlight.js 11.12.0 (Preview code languages and palette colors) | `dist/licenses/highlight.js-11.12.0-LICENSE`: full BSD 3-Clause license, included by the bundle notice collector. |
| Monaco 0.57.0 | `dist/monaco-LICENSE.txt` and `dist/monaco-ThirdPartyNotices.txt`. |
| marked 14.0.0 (Monaco dependency) | `dist/monaco-marked-LICENSE.txt`: MIT plus John Gruber's BSD 3-Clause notice. |
| DOMPurify 3.4.15 (Monaco dependency) | `dist/monaco-dompurify-LICENSE.txt` and `dist/monaco-dompurify-LICENSE-MPL.txt`: preserve both files. |
| Mermaid 11.12.2 and bundled runtime dependencies | `dist/licenses/INDEX.txt` identifies exact packages and their full license/notice files in `dist/licenses/`, including Mermaid's marked and DOMPurify dependencies and diagram layout libraries. |

[build.mjs](../build.mjs) copies these full license texts and Monaco's ThirdPartyNotices from installed packages, resolving Monaco's dependencies separately from the preview dependencies. It also copies full license/notice files for every npm package contributing code to either esbuild metafile (panel/worker and diagram renderer); a missing package notice fails the build. Keep the generated `dist/licenses/` directory with the bundles. The build uses `legalComments: 'linked'`; preserve generated files such as `dist/panel.js.LEGAL.txt` alongside the bundles that reference them. Legal-comment identifiers do not replace full license texts.

Preview dependencies are direct, exact npm pins; [package-lock.json](../package-lock.json) also records transitive runtime versions. `@types/trusted-types` 2.0.7 and `type-fest` 4.41.0 are direct development dependencies used by library declarations, under their installed MIT and MIT/CC0-1.0 notices respectively; those declarations are not bundled into the runtime. No copied library code or declarations remain in `src/vendor/`.

When updating dependencies, review the installed versions, full licenses, and applicable notices again, then rebuild and include the regenerated notices with the matching bundles.
