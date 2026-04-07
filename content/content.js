(async function () {
  const { siteSettings = {}, displayMode = 'bilingual', targetLang = 'zh' }
    = await chrome.storage.local.get(['siteSettings', 'displayMode', 'targetLang'])

  if (siteSettings[location.hostname] === 'never') return

  injectStyles()
  setDisplayMode(displayMode)

  const elements = getTranslatableElements()
  elements.forEach(el => translateElement(el, targetLang))

  // Single-page apps: observe DOM additions
  const observer = new MutationObserver(() => {
    const fresh = getTranslatableElements().filter(el => !el.dataset.btTranslated)
    fresh.forEach(el => translateElement(el, targetLang))
  })
  observer.observe(document.body, { childList: true, subtree: true })
})()

function translateElement(el, targetLang) {
  const text = el.textContent.trim()
  const id = Math.random().toString(36).slice(2)

  chrome.runtime.sendMessage(
    { type: 'TRANSLATE', id, text, fromLang: 'auto', toLang: targetLang },
    (response) => {
      if (chrome.runtime.lastError) return
      if (response?.ok) {
        injectTranslation(el, response.translation)
        addRetranslateButton(el, (target) => translateElement(target, targetLang))
      } else if (response?.isApiKeyError) {
        showApiErrorToast()
      }
    }
  )
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
    await chrome.storage.local.set({ userApiConfig: {} })
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
