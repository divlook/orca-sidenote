type DialogPolicy = { canClose: () => boolean; returnFocus: () => HTMLElement | null | undefined }

export function bindDialogControls(dialog: HTMLDialogElement, close: HTMLButtonElement, policy: DialogPolicy): () => void {
  const closeDialog = () => { if (policy.canClose()) dialog.close() }
  const restoreFocus = () => { policy.returnFocus()?.focus({ preventScroll: true }) }
  const cancel = (event: Event) => { event.preventDefault(); event.stopPropagation(); closeDialog() }
  // Native dialogs can tab into browser chrome at the iframe boundary.
  const tab = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return
    const controls = [...dialog.querySelectorAll<HTMLElement>('button, select, input, [tabindex="0"]')]
      .filter(element => !element.hidden && !element.closest('[hidden]') && !element.matches(':disabled'))
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  // Consume Escape before the editor or host can change panel state.
  const escape = (event: KeyboardEvent) => {
    if (!dialog.open || event.key !== 'Escape' || [...document.querySelectorAll('dialog[open]')].at(-1) !== dialog) return
    event.preventDefault(); event.stopImmediatePropagation(); closeDialog()
  }
  close.addEventListener('click', closeDialog)
  dialog.addEventListener('close', restoreFocus)
  dialog.addEventListener('cancel', cancel)
  dialog.addEventListener('keydown', tab)
  window.addEventListener('keydown', escape, { capture: true })
  return () => {
    close.removeEventListener('click', closeDialog)
    dialog.removeEventListener('close', restoreFocus)
    dialog.removeEventListener('cancel', cancel)
    dialog.removeEventListener('keydown', tab)
    window.removeEventListener('keydown', escape, { capture: true })
  }
}

export function bindDialog(dialog: HTMLDialogElement, opener: HTMLButtonElement, close: HTMLButtonElement, canClose = () => true): void {
  opener.addEventListener('click', () => dialog.showModal())
  bindDialogControls(dialog, close, { canClose, returnFocus: () => opener })
}
