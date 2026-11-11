import { assert, test } from 'orca/testing'
import { marked, type Tokens } from 'marked'
import { assertDiagramSource, isMermaidFence } from './diagram-policy'

test('only Mermaid fenced code is selected, including nested and tilde fences', () => {
  const examples = [
    ['```mermaid\nflowchart LR\n A-->B\n```', true],
    ['~~~mermaid\nsequenceDiagram\n A->>B: Hello\n~~~', true],
    ['> ```mermaid\n> flowchart LR\n> A-->B\n> ```', true],
    ['```javascript\nmermaid\n```', false],
    ['```Mermaid\nflowchart LR\n```', false],
    ['    mermaid\n    flowchart LR', false]
  ] as const
  for (const [source, selected] of examples) {
    let actual = false
    marked.walkTokens(marked.lexer(source), token => {
      if (token.type === 'code') actual = isMermaidFence(token as Tokens.Code)
    })
    assert.equal(actual, selected)
  }
  for (const source of ['mermaid flowchart LR', '`mermaid`', '<pre><code class="language-mermaid">flowchart LR</code></pre>']) {
    let diagrams = 0
    marked.walkTokens(marked.lexer(source), token => { if (token.type === 'code' && isMermaidFence(token as Tokens.Code)) diagrams++ })
    assert.equal(diagrams, 0)
  }
})

test('configuration cannot override Preview security before rendering', () => {
  for (const source of [
    '%%{init: {"securityLevel":"loose","htmlLabels":true}}%%\nflowchart LR\n A-->B',
    'flowchart LR\n%%{config: {"themeCSS":"@import url(https://example.com)"}}%%\n A-->B',
    '---\nconfig:\n  securityLevel: loose\n---\nflowchart LR\n A-->B',
    '\ufeff\r\n---\r\ntitle: Metadata\r\n---\r\nflowchart LR\r\n A-->B'
  ]) assert.throws(() => assertDiagramSource(source), /directives and frontmatter/)
})
