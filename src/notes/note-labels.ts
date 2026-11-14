export const LABEL_KEY = 'labels:v1'
export const LABEL_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'] as const
export type LabelColor = typeof LABEL_COLORS[number]
export type NoteLabel = Readonly<{ id: string; name: string; color: LabelColor }>
export const DEFAULT_LABELS: readonly NoteLabel[] = Object.freeze([
  { id: 'default-todo', name: 'todo', color: 'gray' },
  { id: 'default-in-progress', name: 'in progress', color: 'blue' },
  { id: 'default-in-review', name: 'in review', color: 'purple' },
  { id: 'default-done', name: 'done', color: 'green' }
])
export function labelName(name: string): string { return name.trim().replace(/[A-Z]/g, letter => letter.toLowerCase()) }
export function labelCatalog(value: unknown): readonly NoteLabel[] {
  if (!Array.isArray(value)) throw new Error('The label catalog cannot be read.')
  const ids = new Set<string>(), names = new Set<string>()
  return Object.freeze(value.map(item => {
    if (!item || typeof item !== 'object' || Object.keys(item).length !== 3
      || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string' || !item.name.trim()
      || item.name !== item.name.trim() || !LABEL_COLORS.includes(item.color)
      || ids.has(item.id) || names.has(labelName(item.name))) throw new Error('Labels require unique names, identities, and a palette color.')
    ids.add(item.id); names.add(labelName(item.name))
    return Object.freeze({ id: item.id, name: item.name, color: item.color }) as NoteLabel
  }))
}
export function readLabels(value: unknown): readonly NoteLabel[] {
  if (value === null) return DEFAULT_LABELS
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2
    || !('version' in value) || value.version !== 1 || !('labels' in value)) throw new Error('The label catalog cannot be read.')
  return labelCatalog(value.labels)
}
export function mergeLabels(destination: readonly NoteLabel[], incoming: readonly NoteLabel[], used: ReadonlySet<string>) {
  const labels = [...destination], remap = new Map<string, string>()
  for (const label of incoming) {
    if (!used.has(label.id)) {
      const existing = destination.find(item => labelName(item.name) === labelName(label.name) && item.color === label.color)
      if (existing) remap.set(label.id, existing.id)
      continue
    }
    const match = labels.find(item => labelName(item.name) === labelName(label.name))
    if (match?.color === label.color) { remap.set(label.id, match.id); continue }
    let name = label.name, suffix = 2
    while (labels.some(item => labelName(item.name) === labelName(name))) name = `${label.name} (${suffix++})`
    const id = crypto.randomUUID()
    labels.push({ id, name, color: label.color }); remap.set(label.id, id)
  }
  return { labels: labelCatalog(labels), remap }
}
