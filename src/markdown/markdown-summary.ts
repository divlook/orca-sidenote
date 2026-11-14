import { marked } from 'marked'
import DOMPurify from 'dompurify'

export function markdownSummary(text: string): string {
  for (const token of marked.lexer(text)) {
    if (token.type === 'space' || token.type === 'hr') continue
    let plain: string
    if (token.type === 'code') plain = String(token.text ?? '')
    else {
      const element = document.createElement('div')
      element.innerHTML = DOMPurify.sanitize(marked.parser([token]), {
        USE_PROFILES: { html: true }, FORBID_TAGS: ['img', 'style', 'form', 'input'], FORBID_ATTR: ['style']
      })
      for (const block of element.querySelectorAll('p,li,br,div,blockquote,tr,h1,h2,h3,h4,h5,h6')) block.append(' ')
      plain = element.textContent ?? ''
    }
    plain = plain.replace(/\s+/gu, ' ').trim()
    if (plain) return plain
  }
  return 'Empty note'
}
