# SideNote for Orca

Keep Markdown notes beside each Orca project or worktree. SideNote follows the focused location and saves edits automatically.

![SideNote displaying two reading-mode notes and a minimized note](docs/images/cover.png)

*The compiled SideNote panel with demo data, captured in an isolated browser host with in-memory storage.*

## In this checkout

- Keep an ordered collection of note cards for each exact host and folder path, including worktrees.
- Add, reorder, minimize, and individually delete notes with optional deletion confirmation.
- Mix editing and reading cards, with find and replace, line numbers, per-note undo, task toggles, and plain-text code blocks.
- Back up and restore notes with a JSON file.

Preview does not render diagrams or load images. See [Usage](docs/USAGE.md) for editing and [Data](docs/DATA.md) for backup and restore.

## Try a local checkout

The development setup uses macOS, Orca and its CLI, Node.js 22 or later, and npm. Load only a trusted checkout. Its `trusted-worker` runs code with your account permissions.

1. [Build the checkout](docs/DEVELOPMENT.md#prerequisites-and-setup).
2. [Load the development folder](docs/DEVELOPMENT.md#load-the-development-folder).
3. Open **Note** in Orca's right sidebar.

Notes live in Orca's plugin storage, not project files or Git. They do not sync or back up automatically. [Back up important notes](docs/DATA.md#back-up-notes) to a separate file.

For changes, see [Contributing](CONTRIBUTING.md). For operational help, see [Maintenance](docs/MAINTENANCE.md).

## License

Project code is available under the [MIT License](LICENSE). Third-party files retain their own licenses. See [third-party notices](docs/NOTICES.md).
