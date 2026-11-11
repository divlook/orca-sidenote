declare module 'monaco-editor/languages/definitions/markdown/markdown.js' {
  import type { languages } from 'monaco-editor'
  export const conf: languages.LanguageConfiguration
  export const language: languages.IMonarchLanguage
}

// Orca's unbundled test runner requires a relative import of the installed ESM.
declare module '*node_modules/marked/lib/marked.esm.js' {
  export { marked } from 'marked'
}
