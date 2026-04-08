let paused = false

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'BT_GET_STATUS') {
    sendResponse({ paused })
    return
  }
  if (message.type === 'BT_TOGGLE_PAUSE') {
    paused = !paused
    sendResponse({ paused })
    return
  }
})

;(async function () {
  const { siteSettings = {}, displayMode = 'bilingual', targetLang = 'zh', apiEnabled = false }
    = await chrome.storage.local.get(['siteSettings', 'displayMode', 'targetLang', 'apiEnabled'])

  if (siteSettings[location.hostname] === 'never') return

  injectStyles()
  setDisplayMode(displayMode)

  // Check Chrome Translator status once for user feedback (free path only)
  if (!apiEnabled) {
    chromeTranslatorStatus('auto', targetLang).then(status => {
      if (status === 'downloading') showChromeApiToast()
    })
  }

  const elements = getTranslatableElements()
  elements.forEach(el => translateElement(el, targetLang, apiEnabled))

  // Single-page apps: observe DOM additions
  const observer = new MutationObserver((mutations) => {
    if (paused) return
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue
        // Check the node itself
        if (!node.dataset.btTranslated && shouldTranslate(node)) {
          translateElement(node, targetLang, apiEnabled)
        }
        // Check descendants
        const descendants = getTranslatableElements(node)
        descendants.filter(el => !el.dataset.btTranslated)
                 .forEach(el => translateElement(el, targetLang, apiEnabled))
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
})()

async function translateElement(el, targetLang, apiEnabled = false) {
  if (paused) return
  el.dataset.btTranslated = 'pending'
  const text = el.textContent.trim()

  // Free path: try Chrome Translator API first (local, no network)
  if (!apiEnabled) {
    try {
      if (await chromeTranslatorAvailable('auto', targetLang)) {
        const [translation] = await chromeTranslatorTranslate([text], 'auto', targetLang)
        injectTranslation(el, translation)
        addRetranslateButton(el, (target) => translateElement(target, targetLang, apiEnabled))
        return
      }
    } catch {
      // Chrome API failed — fall through to service worker
    }
  }

  // API Key path OR Chrome API unavailable: use service worker
  const id = Math.random().toString(36).slice(2)
  try {
    chrome.runtime.sendMessage(
      { type: 'TRANSLATE', id, text, fromLang: 'auto', toLang: targetLang },
      (response) => {
        if (chrome.runtime.lastError) return
        if (response?.ok) {
          injectTranslation(el, response.translation)
          addRetranslateButton(el, (target) => translateElement(target, targetLang, apiEnabled))
        } else if (response?.isApiKeyError) {
          showApiErrorToast()
        }
      }
    )
  } catch {
    // Extension context invalidated (e.g. after reload) — silently ignore
  }
}

let toastShown = false
function showApiErrorToast() {
  if (toastShown) return
  toastShown = true

  const toast = document.createElement('div')
  toast.style.cssText = [
    'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
    'background:#333', 'color:#fff', 'padding:12px 16px', 'border-radius:6px',
    'font-size:13px', 'display:flex', 'gap:10px', 'align-items:center',
    'font-family:system-ui'
  ].join(';')

  const msg = document.createElement('span')
  msg.textContent = '⚠ API Key 请求失败'

  const btnFree = document.createElement('button')
  btnFree.textContent = '切换免费模式'
  btnFree.style.cssText = 'background:#4285f4;color:#fff;border:none;border-radius:3px;padding:3px 8px;cursor:pointer'
  btnFree.addEventListener('click', async () => {
    await chrome.storage.local.set({ apiEnabled: false })
    location.reload()
  })

  const btnOptions = document.createElement('button')
  btnOptions.textContent = '检查设置'
  btnOptions.style.cssText = 'background:transparent;color:#aaa;border:1px solid #555;border-radius:3px;padding:3px 8px;cursor:pointer'
  btnOptions.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }))

  toast.appendChild(msg)
  toast.appendChild(btnFree)
  toast.appendChild(btnOptions)
  document.body.appendChild(toast)

  setTimeout(() => { toast.remove(); toastShown = false }, 10000)
}

let chromeApiToastShown = false
function showChromeApiToast() {
  if (chromeApiToastShown) return
  chromeApiToastShown = true

  const toast = document.createElement('div')
  toast.style.cssText = [
    'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
    'background:#333', 'color:#fff', 'padding:12px 16px', 'border-radius:6px',
    'font-size:13px', 'font-family:system-ui'
  ].join(';')

  const msg = document.createElement('span')
  msg.textContent = '⏳ Gemini Nano 模型下载中，完成后可离线翻译'

  toast.appendChild(msg)
  document.body.appendChild(toast)

  setTimeout(() => { toast.remove(); chromeApiToastShown = false }, 5000)
}
