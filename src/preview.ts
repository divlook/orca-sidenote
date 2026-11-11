import { marked, Renderer, type Tokens } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import { isMermaidFence } from './diagram-policy'
import type * as DiagramModule from './diagram'
import { mapMarkdownTasks, type TaskMarker } from './markdown-tasks'

let diagrams: Promise<typeof DiagramModule> | undefined
function loadDiagrams(): Promise<typeof DiagramModule> {
  // Built separately with a scoped document binding for Mermaid's global selectors.
  return diagrams ??= import(new URL('./diagram.js', import.meta.url).href) as Promise<typeof DiagramModule>
}

export function createPreview(element: HTMLElement, openExternal: (href: string) => Promise<unknown>, failed: (error: unknown) => void,
  toggle: (key: string, text: string, marker: TaskMarker, epoch: number) => boolean) {
  let rendered: string | undefined
  let identity: string | null | undefined
  let scheme = ''
  let generation = 0
  let editable = false
  let currentEpoch = 0
  let renderedEpoch = -1
  let trustedInputs: HTMLInputElement[] = []
  element.addEventListener('click', event => {
    const anchor = event.target instanceof Element ? event.target.closest('a') : null
    if (!anchor) return
    event.preventDefault()
    const href = anchor.getAttribute('href') ?? ''
    if (/^(https?:|mailto:)/i.test(href)) void openExternal(href).catch(failed)
  })
  return {
    render(text: string, key: string | null = null, ready = false, epoch = 0) {
      editable = ready
      currentEpoch = epoch
      for (const input of trustedInputs) input.disabled = !ready
      const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      if (rendered === text && identity === key && scheme === theme && renderedEpoch === epoch) return
      const focused = document.activeElement instanceof HTMLInputElement && element.contains(document.activeElement)
        && identity === key ? document.activeElement.dataset.taskOffset : undefined
      const revision = ++generation
      renderedEpoch = epoch
      trustedInputs = []
      scheme = theme
      identity = key
      const blocks: { id: string; text: string }[] = []
      const nonce = `mermaid-${crypto.randomUUID()}-`
      const renderer = new Renderer()
      const parsed = mapMarkdownTasks(text, marked.lexer(text))
      const tasks: { id: string; marker: TaskMarker; checked: boolean }[] = []
      renderer.checkbox = token => {
        const marker = parsed.markers.get(token)
        if (!marker) return '<input type="checkbox" disabled>'
        const id = `${nonce}task-${tasks.length}`
        tasks.push({ id, marker, checked: token.checked })
        return `<span id="${id}"></span> `
      }
      const ordinaryListItem = renderer.listitem.bind(renderer)
      renderer.listitem = token => {
        const checkbox = token.tokens[0]
        const paragraph = token.tokens[1]
        if (checkbox?.type !== 'checkbox' || !parsed.markers.has(checkbox as Tokens.Checkbox) || paragraph?.type !== 'paragraph') {
          return ordinaryListItem(token)
        }
        // Marked emits loose task markers before the paragraph, on a separate line.
        return ordinaryListItem({ ...token, tokens: [
          { ...paragraph, tokens: [checkbox, ...(paragraph as Tokens.Paragraph).tokens] }, ...token.tokens.slice(2)
        ] })
      }
      const ordinaryCode = renderer.code.bind(renderer)
      renderer.code = token => {
        if (isMermaidFence(token)) {
          const id = `${nonce}${blocks.length}`
          blocks.push({ id, text: token.text })
          return `<div id="${id}"></div>`
        }
        const language = token.lang?.match(/^\S+/)?.[0]
        if (!language || !hljs.getLanguage(language)) return ordinaryCode(token)
        try {
          // Match marked's displayed trailing newline before spans can enclose it.
          const code = token.text.replace(/\n$/, '') + '\n'
          const highlighted = hljs.highlight(code, { language, ignoreIllegals: true })
          if (highlighted.errorRaised || !highlighted.value) return ordinaryCode(token)
          return ordinaryCode({ ...token, text: '', escaped: true })
            .replace('\n</code>', () => `${highlighted.value}</code>`)
            .replace('<pre>', '<pre class="highlighted-code">')
        } catch {
          return ordinaryCode(token)
        }
      }
      element.innerHTML = DOMPurify.sanitize(marked.parser(parsed.tokens, { renderer }), {
        USE_PROFILES: { html: true }, FORBID_TAGS: ['img', 'style', 'form'], FORBID_ATTR: ['style']
      })
      for (const input of element.querySelectorAll<HTMLInputElement>('input')) { input.type = 'checkbox'; input.disabled = true }
      for (const task of tasks) {
        const placeholder = element.querySelector(`#${task.id}`)
        if (!placeholder) continue
        const input = document.createElement('input')
        trustedInputs.push(input)
        input.type = 'checkbox'
        input.className = 'markdown-task-checkbox'
        input.checked = task.checked
        input.disabled = !editable
        input.dataset.taskOffset = String(task.marker.offset)
        input.setAttribute('aria-label', 'Toggle task')
        input.addEventListener('change', () => {
          if (!editable || revision !== generation || !input.isConnected || key === null || currentEpoch !== epoch
            || !toggle(key, text, task.marker, epoch)) input.checked = task.checked
        })
        placeholder.replaceWith(input)
        if (focused === input.dataset.taskOffset) input.focus({ preventScroll: true })
      }
      for (const block of blocks) {
        const container = element.querySelector<HTMLElement>(`#${block.id}`)
        if (!container) continue
        container.className = 'mermaid-block'
        const status = document.createElement('p')
        status.setAttribute('role', 'status')
        status.textContent = 'Rendering Mermaid diagram…'
        const source = document.createElement('pre')
        const code = document.createElement('code')
        code.textContent = block.text
        source.append(code)
        const host = document.createElement('div')
        host.className = 'mermaid-diagram'
        // Keep layout available for SVG measurements without exposing temporary DOM.
        host.style.visibility = 'hidden'
        const shadow = host.attachShadow({ mode: 'open' })
        const style = document.createElement('style')
        style.textContent = ':host{display:block;overflow:auto}svg{display:block;max-width:100%;height:auto}'
        const output = document.createElement('div')
        shadow.append(style, output)
        container.append(status, source, host)
        const current = () => revision === generation && container.isConnected
        void loadDiagrams().then(async module => {
          if (!current()) return
          await module.renderDiagram(block.text, theme === 'dark', output, current)
          if (!current()) return
          host.style.visibility = 'visible'
          status.hidden = true
          source.hidden = true
        }).catch(error => {
          if (!current()) return
          host.remove()
          status.textContent = `Mermaid diagram unavailable: ${error instanceof Error ? error.message : String(error)}`
        })
      }
      rendered = text
    },
    suspend() {
      generation++
      rendered = undefined
      element.replaceChildren()
    },
    dispose() { this.suspend() }
  }
}
