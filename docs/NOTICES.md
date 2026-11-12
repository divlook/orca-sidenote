# Third-party notices

Project code uses the [MIT LICENSE](../LICENSE). Third-party files retain their authors' terms. Review the full notices for the actual versions. Preserve copyright, permission, and license text.

| Component | Notice and terms |
| --- | --- |
| marked 17.0.1 (Preview) | `dist/marked-LICENSE.txt`: MIT and John Gruber's BSD 3-Clause notice. |
| DOMPurify 3.4.17 (Preview) | `dist/dompurify-LICENSE.txt` and `dist/dompurify-LICENSE-MPL.txt`: Apache-2.0 OR MPL-2.0. Preserve both full texts. |
| Monaco 0.57.0 | `dist/monaco-LICENSE.txt` and `dist/monaco-ThirdPartyNotices.txt`. |
| marked 14.0.0 (Monaco dependency) | `dist/monaco-marked-LICENSE.txt`: MIT and John Gruber's BSD 3-Clause notice. |
| DOMPurify 3.4.17 (Monaco sanitizer) | `dist/monaco-dompurify-LICENSE.txt` and `dist/monaco-dompurify-LICENSE-MPL.txt`. Preserve both. |
| Bundled runtime contributors | `dist/licenses/INDEX.txt` names the contributing packages and their full notices. |

[build.mjs](../build.mjs) copies full license texts and Monaco's ThirdPartyNotices from installed packages. It resolves Monaco's dependencies separately from Preview dependencies. It also copies full notices for npm packages contributing code to the panel/worker esbuild metafile. A missing package notice fails the build. Keep `dist/licenses/` with the bundles.

The build uses `legalComments: 'linked'`. Preserve generated files such as `dist/panel.js.LEGAL.txt` with their bundles. Legal-comment identifiers do not replace full license texts.

Preview dependencies are exact direct npm pins. [package-lock.json](../package-lock.json) records transitive runtime versions. `@types/trusted-types` 2.0.7 and `type-fest` 4.41.0 are direct development dependencies used by library declarations. Their installed notices are MIT and MIT/CC0-1.0 respectively. Those declarations are not bundled into the runtime.

The DOMPurify npm override follows the exact direct pin, replacing Monaco 0.57.0's affected dependency. That override alone does not replace Monaco's separately vendored sanitizer. The build redirects only Monaco's sanitizer import to the official patched npm ESM export.

An esbuild module suffix preserves an independent instance for Monaco's hooks and Trusted Types policy. Preview uses its own instance. The build rejects any contributing Monaco vendored DOMPurify module. Review and remove this exception when a compatible stable Monaco release includes the patched sanitizer.

When updating dependencies, review installed versions, full licenses, and applicable notices. Rebuild and include regenerated notices with the matching bundles.
