// content/youtube.js

let lastText = ''
let debounceTimer = null
let transLine = null

async function init() {
  const { targetLang = 'zh' } = await chrome.storage.local.get('targetLang')
  waitForPlayer(targetLang)
}

function waitForPlayer(targetLang) {
  const interval = setInterval(() => {
    const container = document.querySelector('.ytp-caption-window-container')
    if (!container) return
    clearInterval(interval)

    const observer = new MutationObserver(() => {
      const captionEl = document.querySelector('.ytp-caption-segment')
      if (!captionEl) return

      const text = captionEl.textContent.trim()
      if (!text || text === lastText) return
      lastText = text

      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => translateCaption(text, targetLang, container), 200)
    })

    observer.observe(container, { childList: true, subtree: true, characterData: true })
  }, 500)
}

function translateCaption(text, targetLang, container) {
  chrome.runtime.sendMessage(
    { type: 'TRANSLATE', id: 'yt-' + Date.now(), text, fromLang: 'auto', toLang: targetLang },
    (response) => {
      if (chrome.runtime.lastError) return
      if (!response?.ok) return
      showTranslation(response.translation, container)
    }
  )
}

function showTranslation(text, container) {
  if (!transLine) {
    transLine = document.createElement('div')
    transLine.className = 'bt-yt-translation'
    transLine.style.cssText = [
      'color:#fff', 'font-size:1em', 'text-align:center',
      'text-shadow:0 0 4px #000,0 0 4px #000',
      'margin-top:4px', 'pointer-events:none'
    ].join(';')
    container.appendChild(transLine)
  }
  transLine.textContent = text  // textContent only — no XSS risk
}

init()
