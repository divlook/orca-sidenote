import { marked, Renderer, type Tokens } from 'marked'
import DOMPurify from 'dompurify'
import { mapMarkdownTasks, type TaskMarker } from './markdown-tasks'

export function createPreview(element: HTMLElement, openExternal: (href: string) => Promise<unknown>, failed: (error: unknown) => void,
  toggle: (key: string, text: string, marker: TaskMarker, epoch: number) => boolean) {
  let rendered: string | undefined
  let identity: string | null | undefined
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
      if (rendered === text && identity === key && renderedEpoch === epoch) return
      const focused = document.activeElement instanceof HTMLInputElement && element.contains(document.activeElement)
        && identity === key ? document.activeElement.dataset.taskOffset : undefined
      const revision = ++generation
      renderedEpoch = epoch
      trustedInputs = []
      identity = key
      const nonce = `preview-${crypto.randomUUID()}-`
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
