# Contributing

Use [Development](docs/DEVELOPMENT.md) to set up a checkout. Use [Architecture](docs/ARCHITECTURE.md) to find the relevant code.

## Prepare a change

1. Describe the intended behavior. Read the relevant code and tests.
2. Explain compatibility and migration before changing storage keys, identities, limits, permissions, or focus handling.
3. Update related code and tests. Before marking implementation complete, follow [Documentation maintenance](docs/DOCUMENTATION.md) for affected guidance. Preserve user files, notes, and settings.
4. Regenerate built assets instead of editing them directly.
5. For every user-visible change, add or update a Changeset before marking implementation complete, even when no commit or release is requested. Run `npm run changeset`, select `orca-sidenote`, choose the appropriate semantic-version bump, and write a short release note. Include the `.changeset/*.md` entry when committing the change. Documentation-only changes need no release entry.

Follow [Verification](docs/VERIFICATION.md) to choose checks and record results. `npm test` covers portable model, editor, and release tests. For documentation-only changes, check links and documented commands instead of running unrelated builds or behavior tests. Review generated version PRs as described in [Release](docs/RELEASE.md). The release/version workflow generates `CHANGELOG.md`.

## Submit a change

Describe the purpose, user-visible impact, implementation choices, and verification environment and results. For a bug, include reproduction conditions and before/after behavior. Report checks you did not perform. Exclude private notes, paths, secrets, and temporary files. For dependency changes, review the lockfile and [notices](docs/NOTICES.md).

## License

Unless explicitly stated otherwise, contributions use the project's [MIT LICENSE](LICENSE). Submit only material you have the right to contribute. Preserve external code's origin, license, and notices. There is no separate CLA or DCO process.
