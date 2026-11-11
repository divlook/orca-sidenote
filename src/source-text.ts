export function sourceLineStarts(text: string): number[] {
  const starts = [0]
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\r') {
      if (text[index + 1] === '\n') index++
      starts.push(index + 1)
    } else if (text[index] === '\n') starts.push(index + 1)
  }
  return starts
}

export function canonicalSource(text: string): string { return text.replace(/\r\n|\r/g, '\n') }

type SourceChange = { range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string }

// Monaco's changes are ordered from the end of the document to the beginning.
// Keep untouched source bytes, including mixed line endings, outside each range.
export function applySourceChanges(text: string, changes: readonly SourceChange[]): string {
  const starts = sourceLineStarts(text)
  let result = text
  let previous = text.length
  for (const change of changes) {
    const start = starts[change.range.startLineNumber - 1] + change.range.startColumn - 1
    const end = starts[change.range.endLineNumber - 1] + change.range.endColumn - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > previous) {
      throw new Error('The editor source range could not be verified.')
    }
    result = result.slice(0, start) + change.text + result.slice(end)
    previous = start
  }
  return result
}
