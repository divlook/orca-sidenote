# Contributing

Use [Development](docs/DEVELOPMENT.md) to set up a checkout. Use [Architecture](docs/ARCHITECTURE.md) to find the relevant code.

## Prepare a change

1. Describe the intended behavior. Read the relevant code and tests.
2. Explain compatibility and migration before changing storage keys, identities, limits, permissions, or focus handling.
3. Update related code, tests, and guidance. Preserve user files, notes, and settings.
4. Regenerate built assets instead of editing them directly.
5. For a user-visible change, run `npm run changeset`. Select `orca-sidenote` and the appropriate semantic-version bump. Write a short release note. Commit the generated `.changeset/*.md` with the change. Documentation-only changes need no release entry.

[Follow the verification guide](docs/VERIFICATION.md) and record your results. Review the generated version PR before merging it. See [Release](docs/RELEASE.md) for its contents and prerequisites.

## Submit a change

Describe the purpose, user-visible impact, implementation choices, and verification environment and results. For a bug, include reproduction conditions and before/after behavior. Report checks you did not perform. Exclude private notes, paths, secrets, and temporary files. For dependency changes, review the lockfile and [notices](docs/NOTICES.md).

## License

Unless explicitly stated otherwise, contributions use the project's [MIT LICENSE](LICENSE). Submit only material you have the right to contribute. Preserve external code's origin, license, and notices. There is no separate CLA or DCO process.
