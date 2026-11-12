# Agent guidance

Write repository documentation in English. Preserve user notes and settings. Use isolated stores for destructive tests.

## Invariants

- Preserve `note:v1:` + `JSON.stringify([hostId, path])` and host/path isolation. Plan migration before changing the format.
- Keep `notes.focused` and the installed CLI path as integration contracts. Block editing for ambiguous or truncated focus responses.
- Preserve focus generation and editor revision/key guards, ordered writes, failed drafts, retry, and per-note undo and view state.
- Keep fail-closed editor readiness, non-truncating limits, rejected-edit restoration, and sanitized Preview.

## Read by task

- Setup, build, load, or approval: [Development](docs/DEVELOPMENT.md).
- Tests, manual checks, or verification scope: [Verification](docs/VERIFICATION.md).
- Runtime ownership, storage formats, or editor invariants: [Architecture](docs/ARCHITECTURE.md).
- Backup, restore, deletion, or data recovery: [Data](docs/DATA.md).
- Unload, disable, upgrade, or troubleshoot: [Maintenance](docs/MAINTENANCE.md).
- Version, publish a Git distribution, or recover a release: [Release](docs/RELEASE.md).
- Dependency licenses or redistribution: [Notices](docs/NOTICES.md).
- Prepare or submit a change: [Contributing](CONTRIBUTING.md).
