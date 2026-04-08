const MODES = ['bilingual', 'translation-only', 'original-only']

function injectTranslation(el, translatedText) {
  removeTranslation(el)

  // Wrap all existing child nodes in .bt-original span
  const originalSpan = document.createElement('span')
  originalSpan.className = 'bt-original'
  while (el.firstChild) {
    originalSpan.appendChild(el.firstChild)
  }
  el.appendChild(originalSpan)

  // Append translation
  const transSpan = document.createElement('span')
  transSpan.className = 'bt-translation'
  transSpan.textContent = translatedText  // textContent only — no XSS risk
  el.appendChild(transSpan)

  el.dataset.btTranslated = 'true'
}

function removeTranslation(el) {
  // Unwrap original content
  const originalSpan = Array.from(el.children).find(c => c.classList.contains('bt-original'))
  if (originalSpan) {
    while (originalSpan.firstChild) {
      el.insertBefore(originalSpan.firstChild, originalSpan)
    }
    originalSpan.remove()
  }

  const transSpan = Array.from(el.children).find(c => c.classList.contains('bt-translation'))
  if (transSpan) transSpan.remove()

  const retranslateBtn = Array.from(el.children).find(c => c.classList.contains('bt-retranslate'))
  if (retranslateBtn) retranslateBtn.remove()

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
    .bt-translation {
      display: block;
      color: #555;
      font-size: 0.95em;
      margin-top: 4px;
      border-left: 3px solid #4285f4;
      padding-left: 8px;
      animation: bt-fadein 0.3s ease-in;
    }
    @keyframes bt-fadein {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    [data-bt-translated="pending"]::after {
      content: '';
      display: block;
      height: 14px;
      margin-top: 6px;
      border-radius: 4px;
      background: linear-gradient(90deg, #e8e8e8 25%, #f5f5f5 50%, #e8e8e8 75%);
      background-size: 200% 100%;
      animation: bt-shimmer 1.5s infinite;
      border-left: 3px solid #d0d0d0;
      padding-left: 8px;
      box-sizing: border-box;
    }
    @keyframes bt-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
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
    .bt-mode-translation-only .bt-original { display: none; }
    .bt-mode-translation-only .bt-translation {
      border-left: none;
      padding-left: 0;
      color: inherit;
      font-size: inherit;
      margin-top: 0;
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
    if (typeof onRetranslate === 'function') onRetranslate(el)
  })
  el.appendChild(btn)
}

if (typeof module !== 'undefined') {
  module.exports = { injectTranslation, removeTranslation, setDisplayMode, injectStyles, addRetranslateButton }
}
