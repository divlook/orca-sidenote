// Orca's unbundled test runner requires a relative import of the installed ESM.
declare module '*node_modules/marked/lib/marked.esm.js' {
  export { marked } from 'marked'
}
