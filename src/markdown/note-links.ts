export type NoteLink = { kind: 'web'; href: string } | { kind: 'mail'; href: string } | { kind: 'file'; path: string }

export function parseNoteLink(href: string): NoteLink {
  if (!href || href !== href.trim() || /[\u0000-\u0020\u007f\\]/.test(href)) throw new Error('This note link has an invalid destination.')
  if (/^https?:\/\//i.test(href)) {
    const url = new URL(href)
    if (!url.hostname || url.username || url.password) throw new Error('This web link has an invalid destination.')
    return { kind: 'web', href: url.href }
  }
  if (/^mailto:/i.test(href)) return { kind: 'mail', href }
  let path = href
  if (/^file:/i.test(path)) {
    if (!/^file:\/\/\//i.test(path) || /^file:\/\/\/\//i.test(path)) throw new Error('File links must not name another host.')
    path = path.slice(7)
  } else if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('//')) {
    throw new Error('This note link protocol is not supported.')
  }
  if (/[?#]/.test(path) || /%(?:2f|5c)/i.test(path)) throw new Error('File links cannot contain queries, fragments, or encoded separators.')
  try { path = decodeURIComponent(path) } catch { throw new Error('This file link has invalid encoding.') }
  if (/[\u0000-\u001f\u007f\\?#%]/.test(path) || path.startsWith('//')) throw new Error('This file link has an invalid path.')
  return { kind: 'file', path }
}
