import type { Tokens } from 'marked'

export function isMermaidFence(token: Tokens.Code): boolean {
  return token.lang?.trim().split(/\s+/)[0] === 'mermaid' && /^\s*(`{3,}|~{3,})/.test(token.raw)
}

export function assertDiagramSource(text: string): void {
  // These are Mermaid's configuration entry points. Reject before any render DOM exists.
  if (/%%\s*\{/.test(text) || /^\s*---(?:\r?\n|$)/.test(text)) {
    throw new Error('Diagram directives and frontmatter are not supported in Preview.')
  }
}
