# Agent guidance

Write repository documentation in English. Preserve user notes and settings. Use isolated stores for destructive tests.

## Change scope

Make the smallest complete change that satisfies the request and preserves the invariants below. Include required caller and contract updates; leave independent cleanup and speculative abstractions outside the change.

## Invariants

- Preserve `note:v1:` + `JSON.stringify([hostId, path])` and host/path isolation. Plan migration before changing the format.
- Keep `notes.focused` and the installed CLI path as integration contracts. Block editing for ambiguous or truncated focus responses.
- Preserve focus generation and editor revision/key guards, ordered writes, failed drafts, retry, and per-note undo and view state.
- Keep editing disabled until readiness checks pass. Preserve non-truncating limits, rejected-edit restoration, and sanitized reading-mode output.

## Read by task

- Documentation maintenance, implementation completion, or pre-release review: [Documentation maintenance](docs/DOCUMENTATION.md).
- Product terminology: [Glossary](GLOSSARY.md).
- Note cards, Markdown editing, or reading-mode links: [Usage](docs/USAGE.md).
- Label assignment or catalog changes: [Labels](docs/LABELS.md).
- Label filtering or displayed-note operations: [Filtering](docs/FILTERING.md).
- Setup, build, load, or approval: [Development](docs/DEVELOPMENT.md).
- Tests, manual checks, or verification scope: [Verification](docs/VERIFICATION.md).
- Runtime ownership, storage formats, or editor invariants: [Architecture](docs/ARCHITECTURE.md).
- Backup, restore, deletion, or data recovery: [Data](docs/DATA.md).
- Unload, disable, upgrade, or troubleshoot: [Maintenance](docs/MAINTENANCE.md).
- Version, publish a Git distribution, or recover a release: [Release](docs/RELEASE.md).
- Dependency licenses or redistribution: [Notices](docs/NOTICES.md).
- Repository changes: [Contributing](CONTRIBUTING.md#prepare-a-change).
