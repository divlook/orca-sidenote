# Development

## Prerequisites and setup

This setup targets a local macOS development folder. Install Git, Orca, Node.js 22 or later, and npm. Start Orca. The [manifest](../orca-plugin.json) states the Orca compatibility requirement.

The worker requires `/Applications/Orca.app/Contents/Resources/bin/orca`, even if another `orca` executable exists. The commands below use that path.

Clone the repository and enter it:

```sh
git clone https://github.com/divlook/orca-sidenote.git
cd orca-sidenote
```

A fresh checkout may lack the ignored `.orca/types/` directory. Generate the API types, install dependencies, build assets, check types, and run the portable tests:

```sh
/Applications/Orca.app/Contents/Resources/bin/orca plugin types . --json
npm ci
npm run build
npm run typecheck
npm test
```

The build deletes and recreates `dist/`. Keep generated bundles, assets, and notices with their source in a distribution commit. Orca installs committed Git files without running the build. See [Release](RELEASE.md) and [Notices](NOTICES.md).

## Load the development folder

Load only a trusted checkout. The manifest uses `trusted-worker`, which runs Node code with your account permissions. `workspace:read` supports worktree-change events. `storage:own` stores notes and settings. Later edits in an approved development folder can run without renewed approval. Review access again when capabilities or execution behavior change.

Load the folder into the local environment:

```sh
/Applications/Orca.app/Contents/Resources/bin/orca plugin dev load . --environment local --json
```

This development folder overrides an installed plugin with the same key. If Orca returns `approval_required` or `approval_stale`, review the requested access and returned command. Rerun that command with its returned fingerprint only if you explicitly approve the access. Do not invent a fingerprint.

Enable plugins in Settings → Plugins. Open **Note** in the right sidebar. The **DEV** badge appears only when the worker confirms its own development installation. It stays hidden if the result is unavailable or inconclusive.

Orca reloads development files when they change. This repository has no automatic asset-build watcher. Run `npm run build` after changing bundled source or dependencies. If you need an explicit reload, run:

```sh
/Applications/Orca.app/Contents/Resources/bin/orca plugin dev reload . --environment local --json
```

Regenerate API types after an Orca update if they are missing or stale. Do not hand-edit `.orca/types/`. See [Verification](VERIFICATION.md) for checks and [Architecture](ARCHITECTURE.md) for code ownership.
