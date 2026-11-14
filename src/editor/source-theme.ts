import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export function sourceTheme() {
  const style = getComputedStyle(document.documentElement)
  const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  const dark = document.documentElement.classList.contains('dark')
  const background = color('--orca-background', dark ? '#1e1e1e' : '#ffffff')
  const foreground = color('--orca-foreground', dark ? '#d4d4d4' : '#333333')
  let comment = dark ? '#608b4e' : '#008000'
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d')
  if (context) {
    const sample = (value?: string) => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = background; context.fillRect(0, 0, 1, 1)
      if (value) { context.fillStyle = value; context.fillRect(0, 0, 1, 1) }
      return context.getImageData(0, 0, 1, 1).data
    }
    const luminance = (rgb: Uint8ClampedArray) => [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
      const channel = rgb[index] / 255
      return sum + weight * (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
    }, 0)
    const bg = luminance(sample())
    const contrast = (value: string) => { const fg = luminance(sample(value)); return (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05) }
    if (sample()[3] === 255 && contrast(comment) < 4.5 && contrast(foreground) > contrast(comment)) comment = foreground
  }
  return [EditorView.theme({
    '&': { fontSize: '13px', color: foreground, backgroundColor: background },
    '.cm-scroller': { overflow: 'visible', fontFamily: 'Menlo, Consolas, monospace' },
    '.cm-content': { padding: '12px 0', caretColor: foreground },
    '.cm-line': { padding: '0 12px' },
    '.cm-gutters': { backgroundColor: background, color: color('--orca-muted-foreground', '#888888'), border: 'none', paddingRight: '4px' },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '2ch' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: foreground },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: dark ? '#264f78' : '#add6ff' },
    '.cm-panels': { backgroundColor: color('--orca-popover', dark ? '#252526' : '#f3f3f3'), color: color('--orca-popover-foreground', foreground) },
    '.cm-panels-top': { borderBottom: `1px solid ${color('--orca-border', '#888888')}` },
    '.cm-search': { fontFamily: 'system-ui, sans-serif', fontSize: '12px' },
    '.cm-textfield, .cm-button': { color: foreground, background: background, border: `1px solid ${color('--orca-border', '#888888')}` },
    '.cm-searchMatch': { backgroundColor: dark ? '#5c4b1f' : '#ffec99' },
    '.cm-searchMatch-selected': { backgroundColor: dark ? '#866a20' : '#ffd866' }
  }, { dark }), syntaxHighlighting(HighlightStyle.define([
    { tag: tags.heading, color: dark ? '#569cd6' : '#0000ff', fontWeight: 'bold' },
    { tag: tags.emphasis, fontStyle: 'italic' }, { tag: tags.strong, fontWeight: 'bold' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: [tags.link, tags.url], color: dark ? '#ce9178' : '#a31515' },
    { tag: [tags.monospace, tags.string], color: dark ? '#ce9178' : '#a31515' },
    { tag: tags.comment, color: comment },
    { tag: [tags.processingInstruction, tags.meta], color: dark ? '#9cdcfe' : '#800000' },
    { tag: [tags.list, tags.quote], color: dark ? '#b5cea8' : '#0451a5' },
    { tag: [tags.contentSeparator, tags.punctuation], color: foreground }
  ]))]
}
