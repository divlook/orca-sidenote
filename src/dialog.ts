export function bindDialog(dialog: HTMLDialogElement, opener: HTMLButtonElement, close: HTMLButtonElement, canClose = () => true): void {
  opener.addEventListener('click', () => dialog.showModal())
  close.addEventListener('click', () => { if (canClose()) dialog.close() })
  dialog.addEventListener('close', () => opener.focus({ preventScroll: true }))
  dialog.addEventListener('cancel', event => {
    event.preventDefault()
    event.stopPropagation()
    if (canClose()) dialog.close()
  })
  // Native dialogs can tab into browser chrome at the iframe boundary.
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return
    const controls = [...dialog.querySelectorAll<HTMLElement>('button, select, input, [tabindex="0"]')]
      .filter(element => !element.hidden && !element.closest('[hidden]') && !element.matches(':disabled'))
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  })
  // Consume Escape before Monaco or the host can change editor/panel state.
  window.addEventListener('keydown', event => {
    if (!dialog.open || event.key !== 'Escape' || [...document.querySelectorAll('dialog[open]')].at(-1) !== dialog) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (canClose()) dialog.close()
  }, { capture: true })
}
