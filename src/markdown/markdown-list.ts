import { marked, type Token } from 'marked'
import { countSourceLineBreaks } from '../source-text'

// Marked removes indentation from item bodies, but preserves their line breaks.
export function markdownListItemLines(text: string): Set<number> {
  const lines = new Set<number>()
  function collect(tokens: Token[], start: number): void {
    for (const token of tokens) {
      if (token.type === 'list') {
        let itemLine = start
        for (const item of token.items) {
          lines.add(itemLine)
          collect(item.tokens, itemLine)
          itemLine += countSourceLineBreaks(item.raw)
        }
      }
      start += countSourceLineBreaks(token.raw)
    }
  }
  // Empty in-progress items can otherwise parse as prose or Setext headings.
  const pendingItems = text.replace(/^([ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]*)?)$/gm, '$1sidenote')
  collect(marked.lexer(pendingItems), 1)
  return lines
}
