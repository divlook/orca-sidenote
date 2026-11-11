import mermaid from 'mermaid'
import DOMPurify from 'dompurify'
import { assertDiagramSource } from './diagram-policy'
import { setDiagramRoot } from './diagram-document'

let pending: Promise<unknown> = Promise.resolve()

export function renderDiagram(text: string, dark: boolean, output: HTMLElement, current: () => boolean): Promise<void> {
  const result = pending.then(async () => {
    if (!current()) return
    assertDiagramSource(text)
    setDiagramRoot(output)
    let complete = false
    try {
      mermaid.initialize({
        startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default',
        themeVariables: dark ? { edgeLabelBackground: '#333333' } : {},
        htmlLabels: false, flowchart: { htmlLabels: false }, suppressErrorRendering: true,
        secure: ['securityLevel', 'startOnLoad', 'htmlLabels', 'flowchart', 'theme', 'themeVariables', 'secure', 'suppressErrorRendering']
      })
      const { svg } = await mermaid.render('sidenote-diagram', text, output)
      if (!current()) return
      const drawingTree = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true }, RETURN_DOM_FRAGMENT: true,
        FORBID_TAGS: ['foreignObject', 'image', 'a', 'script', 'iframe', 'animate', 'set'],
        FORBID_ATTR: ['src', 'tabindex']
      })
      // Preserve local symbol references, but strip resource URLs before attaching.
      for (const node of drawingTree.querySelectorAll('*')) {
        for (const name of ['href', 'xlink:href']) {
          const reference = node.getAttribute(name)
          if (reference !== null && !/^#[A-Za-z_][\w:.-]*$/.test(reference)) node.removeAttribute(name)
        }
      }
      output.replaceChildren(drawingTree)
      const drawing = output.querySelector('svg')
      if (!drawing) throw new Error('The diagram did not produce an SVG image.')
      drawing.setAttribute('role', 'img')
      if (!drawing.hasAttribute('aria-label') && !drawing.hasAttribute('aria-labelledby')) drawing.setAttribute('aria-label', 'Mermaid diagram')
      complete = true
    } finally {
      // Clean temporary DOM on parse/draw errors and stale renders alike.
      if (!complete) output.replaceChildren()
      setDiagramRoot(undefined)
    }
  })
  pending = result.catch(() => {})
  return result
}
