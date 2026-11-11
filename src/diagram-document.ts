// esbuild injects this document binding only into the lazy Mermaid bundle.
// Mermaid's legacy renderers use global body/ID selectors rather than their
// supplied container. Resolve those selectors inside the rendering shadow tree.
let root: HTMLElement | undefined
const realDocument = globalThis.document

export function setDiagramRoot(value: HTMLElement | undefined): void { root = value }

function current(): HTMLElement {
  if (!root) throw new Error('The diagram render root is unavailable.')
  return root
}

export const document = new Proxy(realDocument, {
  get(target, property) {
    if (property === 'body' || property === 'head') return current()
    if (property === 'querySelector') return (selector: string) => selector === 'body' ? current() : current().querySelector(selector)
    if (property === 'querySelectorAll') return (selector: string) => selector === 'body' ? [current()] : current().querySelectorAll(selector)
    if (property === 'getElementById') return (id: string) => current().querySelector(`#${CSS.escape(id)}`)
    if (property === 'getElementsByTagName') return (tag: string) => current().getElementsByTagName(tag)
    if (property === 'getElementsByClassName') return (name: string) => current().getElementsByClassName(name)
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  }
})
