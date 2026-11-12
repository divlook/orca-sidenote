# Third-party notices

Project code uses the [MIT LICENSE](../LICENSE). Third-party files retain their authors' terms. Review the full notices for the actual versions. Preserve copyright, permission, and license text.

| Component | Notice and terms |
| --- | --- |
| marked 17.0.1 (Preview) | `dist/marked-LICENSE.txt`: MIT and John Gruber's BSD 3-Clause notice. |
| DOMPurify 3.4.17 (Preview) | `dist/dompurify-LICENSE.txt` and `dist/dompurify-LICENSE-MPL.txt`: Apache-2.0 OR MPL-2.0. Preserve both full texts. |
| CodeMirror, Lezer and runtime helpers | `dist/licenses/INDEX.txt` lists exact bundled versions and their full MIT notices. |

[build.mjs](../build.mjs) copies full Preview license texts and notices for packages contributing code to the panel's esbuild metafile. A missing package notice fails the build. Keep `dist/licenses/` with the bundle.

The build uses `legalComments: 'linked'`. Preserve generated files such as `dist/panel.js.LEGAL.txt` with their bundles. Legal-comment identifiers do not replace full license texts.

Runtime dependencies are exact direct npm pins. [package-lock.json](../package-lock.json) records transitive runtime versions. `@types/trusted-types` 2.0.7 is a direct development dependency required by DOMPurify's declarations. Its installed notice is MIT; declarations are not bundled into the runtime. Preview imports the official DOMPurify 3.4.17 package directly.

When updating dependencies, review installed versions, full licenses, and applicable notices. Rebuild and include regenerated notices with the matching bundles.
