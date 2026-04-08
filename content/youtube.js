// content/youtube.js

let lastText = ''
let debounceTimer = null
let transLine = null
let currentObserver = null
let currentInterval = null

async function init() {
  const { targetLang = 'zh' } = await chrome.storage.local.get('targetLang')
  waitForPlayer(targetLang)
  window.addEventListener('yt-navigate-finish', () => waitForPlayer(targetLang))
}

function waitForPlayer(targetLang) {
  if (currentObserver) {
    currentObserver.disconnect()
    currentObserver = null
  }
  if (currentInterval) {
    clearInterval(currentInterval)
    currentInterval = null
  }
  transLine = null
  lastText = ''

  currentInterval = setInterval(() => {
    const container = document.querySelector('.ytp-caption-window-container')
    if (!container) return
    clearInterval(currentInterval)
    currentInterval = null

    const observer = new MutationObserver(() => {
      const captionEls = document.querySelectorAll('.ytp-caption-segment')
      if (!captionEls.length) {
        if (transLine) transLine.textContent = ''
        return
      }
      const text = Array.from(captionEls).map(el => el.textContent.trim()).filter(Boolean).join(' ')
      if (!text) {
        if (transLine) transLine.textContent = ''
        return
      }
      if (text === lastText) return
      lastText = text

      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => translateCaption(text, targetLang, container), 200)
    })

    currentObserver = observer
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
