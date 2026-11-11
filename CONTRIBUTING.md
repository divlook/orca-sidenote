# Contributing

Use this guide for bug fixes, features, tests, and documentation changes. See [Development](docs/DEVELOPMENT.md) for setup and [Maintenance](docs/MAINTENANCE.md) for data safety, distribution, and licenses.

## Prepare a change

1. Read the relevant code and tests and describe the intended behavior. The development guide lists entry points and integration constraints.
2. Before implementing changes to storage keys, host/path identity, limits, permissions, or focus handling, explain compatibility and migration implications.
3. Keep the change focused and update related tests and user guidance. Regenerate built assets rather than editing them directly. Preserve existing user files, notes, and settings.
4. For a user-visible change, run `npm run changeset`, select `orca-sidenote` and the appropriate semantic-version bump, and write a short release note. Commit the generated `.changeset/*.md` with the change. Documentation-only changes need no release entry. Once changes reach `main`, review the generated version PR, including its changelog and built assets, before merging it. See [Maintenance](docs/MAINTENANCE.md#versioning-and-release-preparation) for release automation and its prerequisites.

## Verification by change type

For runtime, configuration, or dependency changes, run the typecheck, build, and Orca test/check/validate commands in the development guide. Also cover the relevant behavior below.

Pull request CI runs `npm ci`, `npm run build`, and `npm run test:release` on Ubuntu with Node.js 22. It does not run Orca-dependent typechecking or plugin checks, or render the panel; contributors must run the relevant local checks and test in Orca.

| Change | Coverage |
| --- | --- |
| Storage and focus | Delayed successes/failures, read-only transitions, host/path isolation, failed saves/retry, and protection against writes to the wrong note. |
| Monaco, workers, build | Local worker startup, per-note undo/view state, rejected-edit restoration, shortcuts/find/multiple cursors, assets and notices. |
| Limits and settings | Default/Custom/No limit, invalid values, settings loading/failure/duplicate submission, and non-truncating oversized-note behavior. |
| Preview and UI | Sanitization and link policy, Source/Preview transitions, Tab/Escape/focus return, themes, and rendering in actual Orca. |
| Manifest, permissions, dependencies | Orca compatibility, requested access, approval changes, lockfile, and third-party notices. |
| Documentation only | Relative links and commands against current package scripts and installed CLI help. Record these checks instead of running unnecessary builds or behavior tests for unchanged code. |

Do not inject failures into real user storage or use existing user notes for destructive tests. Use the in-memory approach in existing tests and dedicated test notes. Passing automated checks does not replace rendering this HTML panel in Orca. Report unperformed checks explicitly.

## Submit a change

Describe the purpose, user-visible impact, important implementation choices, and verification commands/environment/results in the PR. For a bug, include reproduction conditions and before/after behavior. Automated release preparation does not replace the checks in this guide. Do not assume dedicated issue/PR templates.

Before submitting:

- [ ] Update the related code, tests, and documentation together.
- [ ] Review data compatibility and permission changes.
- [ ] Distinguish completed checks from checks not performed.
- [ ] Exclude user notes, private paths, secrets, and temporary files.
- [ ] For dependency changes, review the lockfile and third-party notices.

## License

Unless explicitly stated otherwise, contributions submitted for inclusion in this project are provided under its [MIT LICENSE](LICENSE). Submit only material you have the right to contribute. Preserve the origin, license, and notices of external code. There is no separate CLA or DCO process. See [Maintenance](docs/MAINTENANCE.md) for third-party terms.
