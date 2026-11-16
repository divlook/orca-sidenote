import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundled = await build({ entryPoints: ['src/context-menu.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const { createContextMenu, copyMarkdown } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))

// A DOM boundary fixture, not a clipboard-success simulator. Native clipboard success
// is verified separately in Orca. These tests exercise failure cleanup and stale UI.
class Element extends EventTarget {
  children = []; parent = null; hidden = false; disabled = false; style = {}; attributes = new Map(); textContent = ''
  constructor(tag = 'div') { super(); this.tag = tag }
  setAttribute(key, value) { this.attributes.set(key, value) }
  hasAttribute(key) { return this.attributes.has(key) }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parent = this; this.children.push(node) } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null }
  replaceChildren() { for (const child of [...this.children]) child.remove() }
  contains(node) { return node === this || this.children.some(child => child.contains(node)) }
  focus() { document.activeElement = this }
  select() { document.selection.ranges = [] }
  get isConnected() { return document.contains(this) }
  get offsetWidth() { return 100 }
  get offsetHeight() { return 100 }
  getBoundingClientRect() { return { left: 10, right: 110, top: 10, bottom: 110 } }
  get previousElementSibling() { return this.parent.children[this.parent.children.indexOf(this) - 1] }
  querySelectorAll(selector) {
    const nodes = this.children.flatMap(node => [node, ...node.querySelectorAll(selector)])
    if (selector === '.note-context-tooltip') return nodes.filter(node => node.className === 'note-context-tooltip')
    if (selector === '[role="menuitem"]:not(button:disabled)') return nodes.filter(node => node.attributes.get('role') === 'menuitem' && !(node.tag === 'button' && node.disabled))
    return nodes.filter(node => node.tag === 'button' && !node.disabled)
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
  click() { this.dispatchEvent(new Event('click')) }
}
function fixture() {
  const previous = { document: globalThis.document, HTMLElement: globalThis.HTMLElement, window: globalThis.window }
  const document = new Element('document')
  document.createElement = tag => new Element(tag)
  document.selection = { ranges: [], get rangeCount() { return this.ranges.length }, getRangeAt(index) { return this.ranges[index] }, removeAllRanges() { this.ranges = [] }, addRange(range) { this.ranges.push(range) } }
  document.getSelection = () => document.selection
  globalThis.document = document; globalThis.HTMLElement = Element; globalThis.window = { innerWidth: 800, innerHeight: 600 }
  const owner = new Element(); document.append(owner); owner.focus()
  return { owner, document, restore() { Object.assign(globalThis, previous) } }
}
function context(owner) {
  const event = new Event('contextmenu', { cancelable: true })
  Object.assign(event, { button: 2, clientX: 10, clientY: 10 }); owner.dispatchEvent(event)
}

test('menu Escape stays owner-scoped and stale detached actions cannot run', () => {
  const f = fixture()
  try {
    let actions = 0
    const menu = createContextMenu(f.owner, () => [{ label: 'Copy Markdown', run: () => actions++ }])
    const unrelated = new Event('keydown', { cancelable: true }); Object.assign(unrelated, { key: 'Escape' }); f.owner.dispatchEvent(unrelated)
    assert.equal(unrelated.defaultPrevented, false)
    context(f.owner)
    const node = f.owner.children.find(node => node.attributes.get('role') === 'menu'), stale = node.children[0]
    const escape = new Event('keydown', { cancelable: true }); Object.assign(escape, { key: 'Escape' }); f.owner.dispatchEvent(escape)
    assert.equal(escape.defaultPrevented, true); assert.equal(node.hidden, true)
    context(f.owner); stale.click(); assert.equal(actions, 0)
    const current = node.children[0]; menu.dispose(); current.click(); assert.equal(actions, 0)
  } finally { f.restore() }
})

test('only the Paste info icon reveals its description and never invokes Paste', () => {
  const f = fixture()
  try {
    let runs = 0
    const menu = createContextMenu(f.owner, () => [
      { label: 'Copy', run: () => runs++ },
      { label: 'Paste', disabled: true, tooltip: 'Menu paste is unsupported. Use Cmd+V to paste.', run: () => runs++ },
      { label: 'Next', run: () => runs++ }
    ])
    context(f.owner)
    const node = f.owner.children.find(child => child.attributes.get('role') === 'menu')
    const [copy, row, next] = node.children, [button, info, tooltip] = row.children
    assert.equal(button.disabled, true); assert.equal(button.attributes.get('aria-hidden'), 'true')
    assert.equal(row.attributes.get('role'), 'none')
    assert.equal(info.attributes.get('role'), 'menuitem'); assert.equal(info.attributes.get('aria-label'), 'Paste information')
    assert.equal(info.attributes.get('aria-describedby'), tooltip.id); assert.equal(tooltip.attributes.get('role'), 'tooltip')
    assert.match(tooltip.textContent, /Cmd\+V/)
    button.dispatchEvent(new Event('pointerenter')); row.dispatchEvent(new Event('pointerenter'))
    assert.equal(tooltip.style.visibility, 'hidden')
    info.dispatchEvent(new Event('pointerenter')); assert.equal(tooltip.style.visibility, 'visible')
    info.dispatchEvent(new Event('pointerleave')); assert.equal(tooltip.style.visibility, 'hidden')
    tooltip.dispatchEvent(new Event('pointerenter')); assert.equal(tooltip.style.visibility, 'hidden')
    info.dispatchEvent(new Event('pointerenter')); assert.equal(tooltip.style.visibility, 'visible')
    next.dispatchEvent(new Event('pointerenter')); assert.equal(tooltip.style.visibility, 'hidden')
    const key = name => { const event = new Event('keydown', { cancelable: true }); Object.assign(event, { key: name }); node.dispatchEvent(event) }
    copy.focus(); key('ArrowDown'); assert.equal(f.document.activeElement, info)
    info.dispatchEvent(new Event('focus')); assert.equal(tooltip.style.visibility, 'visible')
    button.click(); info.click(); key('Enter'); key(' '); assert.equal(runs, 0)
    key('ArrowDown'); assert.equal(f.document.activeElement, next)
    key('ArrowUp'); assert.equal(f.document.activeElement, info)
    key('Escape'); assert.equal(node.hidden, true); assert.equal(node.children.length, 0)
    assert.equal(tooltip.style.visibility, 'hidden'); assert.equal(f.document.activeElement, f.owner)
    context(f.owner); menu.dispose(); assert.equal(node.children.length, 0); assert.equal(node.parent, null)
    button.click(); info.click(); assert.equal(runs, 0)
  } finally { f.restore() }
})

test('unavailable entries without a handler preserve help and executable menu actions', () => {
  const f = fixture()
  try {
    let selections = 0
    const menu = createContextMenu(f.owner, () => [
      { label: 'Paste', disabled: true, tooltip: 'Use Cmd+V to paste.' },
      { label: 'Select All', run: () => selections++ }
    ])
    context(f.owner)
    const node = f.owner.children.find(child => child.attributes.get('role') === 'menu')
    const [row, selectAll] = node.children, [paste, info, tooltip] = row.children
    assert.equal(paste.disabled, true)
    paste.click(); info.focus(); info.dispatchEvent(new Event('focus'))
    assert.equal(node.hidden, false)
    assert.equal(tooltip.style.visibility, 'visible')
    assert.equal(f.document.activeElement, info)
    selectAll.click()
    assert.equal(selections, 1)
    assert.equal(node.hidden, true)
    menu.dispose()
  } finally { f.restore() }
})

test('failed Markdown copy restores focus and selected text without treating missing native data as success', () => {
  const f = fixture()
  try {
    const range = { commonAncestorContainer: f.owner, cloneRange() { return this } }
    f.document.selection.ranges = [range]
    let observed
    f.document.execCommand = command => { observed = [command, f.document.activeElement.value]; return false }
    assert.equal(copyMarkdown(f.owner, '**raw**\r\ntext'), false)
    assert.deepEqual(observed, ['copy', '**raw**\r\ntext'])
    assert.equal(f.document.activeElement, f.owner); assert.deepEqual(f.document.selection.ranges, [range]); assert.equal(f.owner.children.length, 0)
    f.document.execCommand = () => { throw Error('denied') }
    assert.throws(() => copyMarkdown(f.owner, ''), /denied/)
    assert.equal(f.document.activeElement, f.owner); assert.deepEqual(f.document.selection.ranges, [range]); assert.equal(f.owner.children.length, 0)
    f.document.execCommand = () => true
    assert.equal(copyMarkdown(f.owner, ''), false, 'A native return value without a clipboard event is not confirmation')
  } finally { f.restore() }
})

test('clipboard errors remain visible after closing the menu and focus transfer', () => {
  const f = fixture()
  try {
    const menu = createContextMenu(f.owner, () => [{ label: 'Copy', run: () => menu.fail('Copy failed. Your note was not changed.') }])
    context(f.owner); f.owner.children.find(node => node.attributes.get('role') === 'menu').children[0].click()
    new Element().focus()
    const alert = f.owner.children.find(node => node.attributes.get('role') === 'alert')
    assert.equal(alert.hidden, false); assert.match(alert.textContent, /Copy failed/)
    menu.dispose()
  } finally { f.restore() }
})
