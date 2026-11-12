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

export function countSourceLineBreaks(text: string): number {
  let count = 0
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\r') { count++; if (text[index + 1] === '\n') index++ }
    else if (text[index] === '\n') count++
  }
  return count
}

type SourceChange = { from: number; to: number; text: string }

// Raw UTF-16 ranges are ordered from the end of the source to the beginning.
export function applySourceChanges(text: string, changes: readonly SourceChange[]): string {
  let result = text
  let previous = text.length
  for (const change of changes) {
    const start = change.from
    const end = change.to
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > previous) {
      throw new Error('The editor source range could not be verified.')
    }
    result = result.slice(0, start) + change.text + result.slice(end)
    previous = start
  }
  return result
}
