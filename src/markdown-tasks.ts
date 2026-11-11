import type { Token, Tokens, TokensList } from 'marked'
import { sourceLineStarts } from './source-text'

export interface TaskMarker { offset: number; marker: ' ' | 'x' | 'X' }

// Block-token line positions survive Marked's list indentation and quote-prefix
// removal. Resolve only task tokens, never task-like inline/code/HTML text.
export function mapMarkdownTasks(text: string, tokens: TokensList) {
  const starts = sourceLineStarts(text)
  const markers = new Map<Tokens.Checkbox, TaskMarker>()
  const newlines = (raw: string) => {
    let count = 0
    for (let index = 0; index < raw.length; index++) {
      if (raw[index] === '\r') { count++; if (raw[index + 1] === '\n') index++ }
      else if (raw[index] === '\n') count++
    }
    return count
  }
  function collect(blocks: Token[], start: number): void {
    for (const token of blocks) {
      if (token.type === 'list') {
        let line = start
        for (const item of (token as Tokens.List).items) {
          const first = item.tokens[0]
          const checkbox = first?.type === 'checkbox' ? first as Tokens.Checkbox
            : first?.type === 'paragraph' && first.tokens?.[0]?.type === 'checkbox' ? first.tokens[0] as Tokens.Checkbox : undefined
          if (item.task && checkbox) {
            const offset = starts[line]
            const end = starts[line + 1] ?? text.length
            const raw = text.slice(offset, end).replace(/(?:\r\n|\r|\n)$/, '')
            const match = /^(?:[ \t]*>[ \t]?|[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)*\[([ xX])\](?=[ \t]|$)/.exec(raw)
            if (!match || (match[1] !== ' ') !== checkbox.checked) throw new Error('The task source position could not be verified.')
            markers.set(checkbox, { offset: offset + match[0].length - 2, marker: match[1] as TaskMarker['marker'] })
          }
          collect(item.tokens, line)
          line += newlines(item.raw)
        }
      } else if (token.type === 'blockquote') collect((token as Tokens.Blockquote).tokens, start)
      start += newlines(token.raw)
    }
  }
  collect(tokens, 0)
  return { tokens, markers }
}
