# SideNote for Orca

Write Markdown notes for Orca projects and worktrees in the right sidebar. The panel automatically shows the note for the focused project or worktree.

![Source and Preview tabs of the same demo note, shown side by side](docs/images/sidenote.png)

*The same demo note's Source and Preview tabs, captured in an isolated environment and shown side by side.*

## Features

- Keep separate notes for each host and folder path, including worktrees.
- Write Markdown in Source, the editor with automatic saving, find and replace, line numbers, and per-note undo.
- Use Preview to view formatted Markdown, toggle task checkboxes, and view locally rendered Mermaid diagrams and syntax-highlighted code. Preview does not load images.
- Set a character limit and choose whether to show Source line numbers.

## Get started

The current setup uses a local macOS development folder. It requires Orca and its CLI, plus Node.js 20 or later and npm.

Load only a trusted checkout. The plugin's `trusted-worker` runs Node.js code with your account permissions. See [Installation and trust](docs/MAINTENANCE.md#installation-and-trust) for access details.

1. Build the plugin with the [Development setup instructions](docs/DEVELOPMENT.md#prerequisites-and-setup).
2. Load the folder with the [development loading instructions](docs/DEVELOPMENT.md#load-the-development-folder).
3. Open **Note** in Orca's right sidebar.

## Notes and storage

- Orca stores notes in plugin-owned storage, not project Markdown files or Git.
- Copy important notes to a separate file.
- Notes default to an 8,000-character limit. You can change the limit in **Note Settings**.

## Documentation

- [Usage](docs/USAGE.md): edit notes, use Preview, change settings, delete notes, or understand note storage scope.

See [Development](docs/DEVELOPMENT.md), [Maintenance](docs/MAINTENANCE.md), and [Contributing](CONTRIBUTING.md) for setup, data protection, and change workflows.

## License

Project code is available under the [MIT License](LICENSE), copyright 2026 orca-sidenote contributors. Third-party files retain their own licenses. See the [third-party notices](docs/MAINTENANCE.md#third-party-licenses-and-redistribution-notices).
