# Agent guidance

This is a local macOS Orca development plugin. User notes live in Orca plugin storage, not project files. Use test notes for development and verification; preserve existing user notes and settings.

Write repository documentation in English.

## Invariants

- Storage keys are `note:v1:` + `JSON.stringify([hostId, path])`. Preserve host/path isolation; plan data migration before changing this format.
- `notes.focused` and the installed CLI's absolute path are concrete integration contracts. Keep editing blocked for ambiguous or truncated focus responses.
- Preserve focus generation and editor revision/key guards, ordered writes, failed drafts and retry, and per-note Monaco undo/view state.
- Lowering limits must not truncate notes. Preserve worker preflight, undo-based rejected-edit restoration, and sanitized preview.

## Read when needed

- Setup, architecture, builds, or behavior checks: [Development](docs/DEVELOPMENT.md).
- Storage incidents, upgrades, distribution, or third-party licenses: [Maintenance](docs/MAINTENANCE.md).
- Change submission, verification scope, or PR preparation: [Contributing](CONTRIBUTING.md).
