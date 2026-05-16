const MODES = ['bilingual', 'translation-only', 'original-only']

// Insert translation as a sibling element — never touch el's own children.
// One DOM append = one reflow, no layout thrashing.
// translation-only: hide [data-bt-translated] via CSS, sibling fills the space.
// original-only:    hide [data-bt-sibling-for] via CSS.
function injectTranslation(el, translatedText) {
  removeTranslation(el)
  const div = document.createElement('div')
  div.dataset.btSiblingFor = 'true'
  div.textContent = translatedText
  // Table cells and slotted elements need the translation appended INSIDE rather than as a
  // sibling: table cells because a sibling would land in the row and destroy column layout;
  // slotted elements because a sibling div outside the slot won't be projected.
  const cellRole = el.getAttribute?.('role') ?? ''
  const isTableCell = el.tagName === 'TD' || el.tagName === 'TH' ||
    cellRole === 'gridcell' || cellRole === 'cell' ||
    cellRole === 'columnheader' || cellRole === 'rowheader'
  if (el.hasAttribute('slot') || isTableCell) {
    el.appendChild(div)
  } else {
    // Inline styles are only needed when the div lands inside a shadow root where
    // document.head <style> rules don't reach.
    if (el.getRootNode() instanceof ShadowRoot) {
      div.style.cssText = 'opacity:0.85;font-size:max(0.9em,13px);margin-top:2px;line-height:1.5;color:inherit'
    }
    // If the parent is a ROW flex/grid container AND it allows wrapping, the injected div
    // becomes an unwanted flex item. Force it to span the full width so it wraps to its
    // own row instead of squeezing into the existing row.
    // Only apply when flex-wrap is wrap/wrap-reverse — in a nowrap row, flex-basis:100%
    // still forces the item into the row but starves all sibling columns of space, causing
    // text to render vertically (GitHub file table is a classic example of this).
    if (el.parentElement) {
      const parentStyle = getComputedStyle(el.parentElement)
      const parentDisplay = parentStyle.display
      if (parentDisplay.includes('flex') || parentDisplay.includes('grid')) {
        const isRow = !parentStyle.flexDirection.includes('column')
        const isWrap = parentStyle.flexWrap === 'wrap' || parentStyle.flexWrap === 'wrap-reverse'
        if (isRow && isWrap) {
          div.style.flexBasis = '100%'
          div.style.width = '100%'
          div.style.minWidth = '0'
        }
      }
    }
    el.after(div)
  }
  el.dataset.btTranslated = 'true'
}

// Alias kept so youtube.js callers work without change
const injectTranslationSibling = injectTranslation

function removeTranslation(el) {
  // Translation may have been injected inside (slot / table-cell) or as next sibling
  const cellRole = el.getAttribute?.('role') ?? ''
  const isTableCell = el.tagName === 'TD' || el.tagName === 'TH' ||
    cellRole === 'gridcell' || cellRole === 'cell' ||
    cellRole === 'columnheader' || cellRole === 'rowheader'
  const probe = (el.hasAttribute('slot') || isTableCell) ? el.lastElementChild : el.nextElementSibling
  if (probe?.dataset.btSiblingFor) probe.remove()
  delete el.dataset.btTranslated
}

function setDisplayMode(mode) {
  if (!MODES.includes(mode)) return
  MODES.forEach(m => document.body.classList.remove(`bt-mode-${m}`))
  document.body.classList.add(`bt-mode-${mode}`)
}

function injectStyles() {
  if (document.getElementById('bt-styles')) return
  const style = document.createElement('style')
  style.id = 'bt-styles'
  style.textContent = `
    [data-bt-sibling-for] {
      display: block;
      opacity: 0.85;
      font-size: max(0.9em, 13px);
      margin-top: 2px;
      line-height: 1.5;
    }
    [data-bt-translated="pending"]::after {
      content: '';
      display: inline-block;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #4285f4;
      margin-left: 5px;
      vertical-align: middle;
      animation: bt-dot 1s ease-in-out infinite;
    }
    @keyframes bt-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.2; transform: scale(0.6); }
    }
    .bt-mode-translation-only [data-bt-translated="true"] { display: none; }
    .bt-mode-translation-only [data-bt-sibling-for] {
      opacity: 1;
      font-size: inherit;
      margin-top: 0;
    }
    .bt-mode-original-only [data-bt-sibling-for] { display: none; }
  `
  document.head.appendChild(style)
}

if (typeof module !== 'undefined') {
  module.exports = { injectTranslation, removeTranslation, injectTranslationSibling, setDisplayMode, injectStyles }
}
