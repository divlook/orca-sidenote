import { marked, type Token } from 'marked'

// Marked removes indentation from item bodies, but preserves their line breaks.
// Follow block tokens, not inline text, to exclude literal code and HTML.
export function markdownListItemLines(text: string): Set<number> {
  const lines = new Set<number>()
  const newlines = (raw: string) => {
    let count = 0
    for (let index = 0; index < raw.length; index++) if (raw.charCodeAt(index) === 10) count++
    return count
  }
  function collect(tokens: Token[], start: number): void {
    for (const token of tokens) {
      if (token.type === 'list') {
        let itemLine = start
        for (const item of token.items) {
          lines.add(itemLine)
          collect(item.tokens, itemLine)
          itemLine += newlines(item.raw)
        }
      }
      start += newlines(token.raw)
    }
  }
  // Empty in-progress items can otherwise parse as prose or Setext headings.
  const pendingItems = text.replace(/^([ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]*)?)$/gm, '$1sidenote')
  collect(marked.lexer(pendingItems), 1)
  return lines
}
