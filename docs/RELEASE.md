# Release and distribution

The package stays `private: true`. Orca distributes this plugin through Git, not npm. Do not use `changeset publish` or `npm publish`. No npm token is required.

## Prepare a distribution

1. Complete the relevant [verification](VERIFICATION.md). Record what ran.
2. Review the manifest version, Orca compatibility, and permissions. Use `/Applications/Orca.app/Contents/Resources/bin/orca plugin inspect . --json` to inspect contributions and access.
3. Run `npm ci` and `npm run build`. Include runtime source, the complete generated `dist/`, project LICENSE, and [third-party notices](NOTICES.md) in the same distribution commit.
4. Check for private notes, paths, screenshots, and local settings. Exclude `node_modules/` and `.orca/`.

Do not distribute `dist/` alone. The manifest points to `src/worker.mjs` and `src/panel.html`. The worker imports `src/worktree/focus.ts`. The HTML uses source CSS and built assets.

Orca installs files from an exact Git commit or tag without running npm or the build. `/Applications/Orca.app/Contents/Resources/bin/orca plugin release-entry . --json` uses committed HEAD, not uncommitted files. Building does not commit them. There is no separate release-asset packaging pipeline.

## Version and release

For a user-visible change, add a Changeset as described in [Contributing](../CONTRIBUTING.md#prepare-a-change). A push to `main` with pending entries creates or updates the `changeset-release/main` version PR. The [release workflow](../.github/workflows/release.yml) runs `npm run version:release`, which synchronizes versions and changelog, then builds `dist/`. It pins [Changesets action v1.9.0](https://github.com/changesets/action/tree/a45c4d594aa4e2c509dc14a9f2b3b67ba3780d0d) to an immutable commit for Changesets CLI 2 compatibility.

Review the version, changelog, full `dist/`, and notices together. Complete relevant verification before merging the PR. After a same-repository version PR merges into `main`, the [release script](../scripts/release-plugin.mjs) tags the exact merged commit and creates a GitHub Release from the changelog. For a merge it uses the merge commit. For squash or rebase it uses the final resulting commit, not the current `main` tip. It creates no separate release assets.

The version job requests `contents: write` and `pull-requests: write`. The release job requests `contents: write`. Keep default workflow token permissions at read. In repository **Settings → Actions → General**, enable **Allow GitHub Actions to create and approve pull requests**. Organization policy may restrict this setting.

A PR created or updated with `GITHUB_TOKEN` has matching `pull_request` workflows in an approval-required state for `opened`, `synchronize`, and `reopened`. A user with write access must select **Approve workflows to run**. A push made with `GITHUB_TOKEN` does not start a new push workflow. See [GitHub's workflow triggering documentation](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow).

If the tag or release is missing, rerun the release job from the original PR workflow while it remains available. It uses the original merge commit. A matching tag with a missing release is recovered. A matching tag with a published release is a no-op. A conflicting tag or an existing draft or prerelease requires manual review. The workflow will not overwrite it.

`package.json` is the version source. `orca-plugin.json` and both root lockfile version fields must match it. Do not bump them manually or run bare `changeset version`.

For offline preparation, `npm run version:plugin` runs Changesets and synchronizes those fields. On failure, it restores the release files, changelog, and consumed entries. It rejects mismatched starting versions. The standalone command does not rebuild assets. [Changesets configuration](https://changesets.dev/guide/config#privatepackages) enables private-package versioning, disables its private-package tagging, and sets `commit` to false.

## Community listing

The [community listing](https://www.onorca.dev/plugins/add) requires a public GitHub repository with the `orca-plugin` topic and a newly pushed `v<version>` tag for the complete distribution commit. A GitHub Release does not replace the tag or topic. Check `https://www.onorca.dev/plugins/<owner>/<repo>` for status and required fixes.

Orca checks for new tags every 30 minutes. Listing has no guaranteed deadline, and size can require maintainer review. Pushing source without a new version tag does not update the listing. MIT licensing does not change Orca approval or marketplace registration.
