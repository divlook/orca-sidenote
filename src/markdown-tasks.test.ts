import { assert, test } from 'orca/testing'
import { marked } from '../node_modules/marked/lib/marked.esm.js'
import { mapMarkdownTasks } from './markdown-tasks'
import { applySourceChanges } from './source-text'

const parseMarkdownTasks = (text: string) => mapMarkdownTasks(text, marked.lexer(text))

test('task positions follow duplicate nested ordered and quoted block items through Unicode and CRLF', () => {
  const text = '😀 intro\r\n\r\n- [ ] duplicate\r\n  continuation\r\n  - [X] duplicate\r\n\r\n- [ ] duplicate\r\n\r\n> 1. [x] quote\r\n>\r\n>    - [ ] nested\r\n'
  const { markers } = parseMarkdownTasks(text)
  const lines = text.split('\r\n')
  const expected = [[2, 3], [4, 5], [6, 3], [8, 6], [10, 8]]
    .map(([line, column]) => lines.slice(0, line).join('\r\n').length + (line ? 2 : 0) + column)
  assert.deepEqual([...markers.values()].map(marker => marker.offset), expected)
  assert.deepEqual([...markers.values()].map(marker => marker.marker), [' ', 'X', ' ', 'x', ' '])
  for (const marker of markers.values()) assert.equal(text.slice(marker.offset - 1, marker.offset + 2), `[${marker.marker}]`)
})

test('block precedence excludes task-like code HTML and inline text', () => {
  const text = 'text `- [ ] inline`\n\n```md\n- [ ] fenced\n```\n\n    - [ ] indented\n\n<div>\n- [ ] html\n</div>\n\n- [ ] actual\n'
  const { markers } = parseMarkdownTasks(text)
  assert.equal(markers.size, 1)
  const marker = [...markers.values()][0]
  assert.equal(text.slice(0, marker.offset) + 'x' + text.slice(marker.offset + 1), text.replace('- [ ] actual', '- [x] actual'))
})

test('loose list and same-line nested quote/list prefixes retain structural positions', () => {
  const cases: [string, [number, number, string][]][] = [
    ['- first\n\n  paragraph\n\n  - [ ] task\n\n- [x] task\n', [[4, 5, ' '], [6, 3, 'x']]],
    ['> > - - [ ] task\n', [[0, 9, ' ']]],
    // Marked treats the tab-expanded first body as text, not a task.
    ['-\t[ ] tab\n- [X] last', [[1, 3, 'X']]],
    ['> - [ ] first\n>   continuation\n> - [ ] second\n', [[0, 5, ' '], [2, 5, ' ']]]
  ]
  for (const [text, positions] of cases) {
    const { markers } = parseMarkdownTasks(text)
    const lines = text.split('\n')
    assert.deepEqual([...markers.values()], positions.map(([line, column, marker]) => ({
      offset: lines.slice(0, line).join('\n').length + (line ? 1 : 0) + column, marker
    })))
  }
})

test('task edits preserve mixed and standalone CR line endings byte-for-byte', () => {
  for (const text of ['😀 intro\r\r- [ ] first\r- [X] second\r', '😀 intro\r\n\n- [ ] first\n- [X] second\r\n']) {
    const { markers } = parseMarkdownTasks(text)
    const expectedOffsets = text.startsWith('😀 intro\r\r') ? [13, 25] : [14, 26]
    assert.deepEqual([...markers.values()].map(marker => marker.offset), expectedOffsets)
    for (const marker of markers.values()) {
      const next = applySourceChanges(text, [{
        from: marker.offset, to: marker.offset + 1,
        text: marker.marker === ' ' ? 'x' : ' '
      }])
      assert.equal(next, text.slice(0, marker.offset) + (marker.marker === ' ' ? 'x' : ' ') + text.slice(marker.offset + 1))
    }
  }
})
