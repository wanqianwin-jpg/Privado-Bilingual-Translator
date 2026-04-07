const MODES = ['bilingual', 'translation-only', 'original-only']

function injectTranslation(el, translatedText) {
  removeTranslation(el)
  const span = document.createElement('span')
  span.className = 'bt-translation'
  span.textContent = translatedText  // textContent only — no XSS risk
  el.appendChild(span)
  el.dataset.btTranslated = 'true'
}

function removeTranslation(el) {
  const existing = el.querySelector('.bt-translation')
  if (existing) existing.remove()
  delete el.dataset.btTranslated
}

function setDisplayMode(mode) {
  MODES.forEach(m => document.body.classList.remove(`bt-mode-${m}`))
  document.body.classList.add(`bt-mode-${mode}`)
}

function injectStyles() {
  if (document.getElementById('bt-styles')) return
  const style = document.createElement('style')
  style.id = 'bt-styles'
  style.textContent = `
    .bt-translation {
      display: block;
      color: #555;
      font-size: 0.95em;
      margin-top: 4px;
      border-left: 3px solid #4285f4;
      padding-left: 8px;
    }
    .bt-retranslate {
      display: none;
      position: absolute;
      top: 2px;
      right: 2px;
      font-size: 11px;
      color: #999;
      cursor: pointer;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 3px;
      padding: 1px 4px;
    }
    [data-bt-translated]:hover .bt-retranslate { display: block; }
    [data-bt-translated] { position: relative; }
    .bt-mode-translation-only [data-bt-translated] > :not(.bt-translation):not(.bt-retranslate) {
      visibility: hidden;
      height: 0;
      overflow: hidden;
    }
    .bt-mode-original-only .bt-translation { display: none; }
  `
  document.head.appendChild(style)
}

function addRetranslateButton(el, onRetranslate) {
  if (el.querySelector('.bt-retranslate')) return
  const btn = document.createElement('button')
  btn.className = 'bt-retranslate'
  btn.textContent = '重翻'
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    onRetranslate(el)
  })
  el.appendChild(btn)
}

if (typeof module !== 'undefined') {
  module.exports = { injectTranslation, removeTranslation, setDisplayMode, injectStyles, addRetranslateButton }
}
