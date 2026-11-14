import type { LabelColor } from '../notes/note-labels'

type Choice<T extends string> = { value: T; label: string; color?: LabelColor }
type Binding<T extends string> = { name: string | (() => string); options: readonly Choice<T>[]; selected: () => T; choose: (value: T) => void }
export type SettingsDropdown = {
  bind<T extends string>(trigger: HTMLButtonElement, binding: Binding<T>): { render(): void }
  close(focus?: boolean): boolean
}

export function createSettingsDropdown(dialog: HTMLDialogElement, body: HTMLElement): SettingsDropdown {
  const menu = document.createElement('div')
  menu.id = 'settings-dropdown-menu'; menu.className = 'settings-dropdown-menu'; menu.hidden = true
  menu.setAttribute('role', 'menu'); dialog.append(menu)
  let active: HTMLButtonElement | null = null
  function close(focus = true) {
    if (!active) return false
    const trigger = active; active = null; menu.hidden = true; trigger.setAttribute('aria-expanded', 'false')
    if (focus && trigger.isConnected && !trigger.disabled) trigger.focus({ preventScroll: true })
    return true
  }
  function display<T extends string>(element: HTMLElement, choice: Choice<T>) {
    const children: Node[] = []
    if (choice.color) {
      const dot = document.createElement('span'); dot.className = `label-dot label-color-${choice.color}`; dot.setAttribute('aria-hidden', 'true')
      children.push(dot)
    }
    children.push(document.createTextNode(choice.label)); element.replaceChildren(...children)
  }
  function bind<T extends string>(trigger: HTMLButtonElement, binding: Binding<T>) {
    trigger.classList.add('settings-dropdown-trigger'); trigger.setAttribute('aria-haspopup', 'menu')
    trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', menu.id)
    function render() {
      const choice = binding.options.find(option => option.value === binding.selected())!
      display(trigger, choice)
      const name = typeof binding.name === 'function' ? binding.name() : binding.name
      trigger.setAttribute('aria-label', `${name}: ${choice.label}`)
    }
    function open() {
      if (active === trigger) { close(false); return }
      close(false); active = trigger; menu.replaceChildren()
      const name = typeof binding.name === 'function' ? binding.name() : binding.name
      menu.setAttribute('aria-label', name)
      for (const option of binding.options) {
        const choice = document.createElement('button'); choice.type = 'button'; choice.setAttribute('role', 'menuitemradio')
        choice.setAttribute('aria-checked', String(option.value === binding.selected())); display(choice, option)
        choice.addEventListener('click', () => { binding.choose(option.value); render(); close() })
        menu.append(choice)
      }
      menu.hidden = false; trigger.setAttribute('aria-expanded', 'true')
      const bounds = trigger.getBoundingClientRect(), bodyBounds = body.getBoundingClientRect()
      const left = Math.max(6, bodyBounds.left), right = Math.min(window.innerWidth - 6, bodyBounds.right)
      const top = Math.max(6, bodyBounds.top), bottom = Math.min(window.innerHeight - 6, bodyBounds.bottom)
      menu.style.maxWidth = `${Math.max(0, right - left)}px`; menu.style.minWidth = `${Math.min(140, Math.max(0, right - left))}px`
      menu.style.maxHeight = `${Math.max(0, bottom - top)}px`
      menu.style.left = `${Math.max(left, Math.min(bounds.left, right - menu.offsetWidth))}px`
      menu.style.top = `${Math.max(top, Math.min(bounds.bottom, bottom - menu.offsetHeight))}px`
      menu.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true })
    }
    trigger.addEventListener('click', open)
    trigger.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (active !== trigger) open() }
    })
    render()
    return { render }
  }
  menu.addEventListener('keydown', event => {
    if (event.key === 'Tab' && active) {
      event.preventDefault(); event.stopPropagation()
      const controls = [...dialog.querySelectorAll<HTMLElement>('button, select, input, [tabindex="0"]')]
        .filter(control => !menu.contains(control) && !control.hidden && !control.closest('[hidden]') && !control.matches(':disabled'))
      const index = controls.indexOf(active), next = (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
      close(false); controls[next]?.focus(); return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const choices = [...menu.querySelectorAll<HTMLButtonElement>('button')], index = choices.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length
    choices[next]?.focus()
  })
  menu.addEventListener('focusout', () => { requestAnimationFrame(() => { if (active && !menu.contains(document.activeElement) && document.activeElement !== active) close(false) }) })
  document.addEventListener('pointerdown', event => { if (active && !menu.contains(event.target as Node) && !active.contains(event.target as Node)) close(false) })
  body.addEventListener('scroll', () => close(false))
  dialog.addEventListener('close', () => close(false))
  window.addEventListener('resize', () => close(false))
  return { bind, close }
}
