import { bindDialogControls } from '../dialog'
import { parseNoteLink } from './note-links'
import type { WebLinkOpening } from '../settings/note-settings'

type CapturedLink = { href: string; scope: string; epoch: number; opener: HTMLElement | null }
type LinkOptions = {
  current(scope: string, epoch: number): boolean
  preference(): { webLinkOpening: WebLinkOpening; webLinksReady: boolean }
  external(href: string): Promise<{ opened: boolean; reason?: string }>
  internal(scope: string, href: string): Promise<unknown>
  report(error: unknown): void
}
export function bindNoteLinks(options: LinkOptions) {
  const dialog = document.querySelector<HTMLDialogElement>('#open-note-link')!
  const cancel = document.querySelector<HTMLButtonElement>('#open-note-link-cancel')!
  let captured: CapturedLink | undefined
  let opener: HTMLElement | null = null
  const disposeDialog = bindDialogControls(dialog, cancel, { canClose: () => true, returnFocus: () => opener })
  function check(link: CapturedLink) {
    if (!options.current(link.scope, link.epoch)) throw new Error('The note’s worktree changed. Open the link again.')
  }
  async function external(link: CapturedLink) {
    check(link)
    // Invoke the bridge before any await: this is the actual link or chooser click.
    const result = await options.external(link.href)
    if (!result.opened && result.reason !== 'cancelled') throw new Error('Orca could not open this link in the default application.')
  }
  async function internal(link: CapturedLink) {
    check(link)
    await options.internal(link.scope, link.href)
  }
  for (const [id, action] of [['open-note-link-external', external], ['open-note-link-orca', internal]] as const) {
    document.querySelector<HTMLButtonElement>('#' + id)!.addEventListener('click', () => {
      const link = captured
      if (!link) return
      // Closing never defers the bridge call out of this gesture.
      dialog.close()
      void action(link).catch(options.report)
      captured = undefined
    })
  }
  return {
    async open(href: string, scope: string, epoch: number) {
      const link: CapturedLink = { href, scope, epoch, opener: document.activeElement instanceof HTMLElement ? document.activeElement : null }
      check(link)
      const destination = parseNoteLink(href)
      if (destination.kind === 'mail') return external(link)
      if (destination.kind === 'file') return internal(link)
      const preference = options.preference()
      if (!preference.webLinksReady) throw new Error('Choose a web link opening setting before opening this link.')
      if (preference.webLinkOpening === 'external') return external(link)
      if (preference.webLinkOpening === 'orca') return internal(link)
      captured = link
      opener = link.opener
      document.querySelector<HTMLElement>('#open-note-link-url')!.textContent = href
      dialog.showModal(); cancel.focus()
    },
    scopeChanging() { captured = undefined; if (dialog.open) dialog.close() },
    dispose() { this.scopeChanging(); disposeDialog() }
  }
}
