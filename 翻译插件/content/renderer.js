const MODES = ['bilingual', 'translation-only', 'original-only']

// Insert translation as a sibling element — never touch el's own children.
// One DOM append = one reflow, no layout thrashing.
// translation-only: hide [data-bt-translated] via CSS, sibling fills the space.
// original-only:    hide [data-bt-sibling-for] via CSS.
function injectTranslation(el, translatedText) {
  removeTranslation(el)
  const div = document.createElement('div')
  div.dataset.btSiblingFor = 'true'
  // Inline styles penetrate shadow DOM (document.head styles don't reach shadow roots)
  div.style.cssText = 'opacity:0.85;font-size:max(0.9em,13px);margin-top:2px;line-height:1.5;color:inherit'
  div.textContent = translatedText
  // Slotted elements (slot="...") live inside a parent's shadow DOM — a sibling div won't be
  // projected into the same slot and will be invisible. Inject inside instead so it stays in context.
  if (el.hasAttribute('slot')) {
    el.appendChild(div)
  } else {
    el.after(div)
  }
  el.dataset.btTranslated = 'true'
}

// Alias kept so youtube.js callers work without change
const injectTranslationSibling = injectTranslation

function removeTranslation(el) {
  const probe = el.hasAttribute('slot') ? el.lastElementChild : el.nextElementSibling
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
