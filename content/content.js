;(async function () {
  const { siteSettings = {}, displayMode = 'bilingual', targetLang = 'zh', apiEnabled = false }
    = await chrome.storage.local.get(['siteSettings', 'displayMode', 'targetLang', 'apiEnabled'])

  if (siteSettings[location.hostname] === 'never') return

  injectStyles()
  setDisplayMode(displayMode)

  let translationStarted = false

  async function startTranslation() {
    if (translationStarted) return
    translationStarted = true
    ball.setState('translating')

    // LLM path: higher min-length (skip short phrases), viewport-first order
    const minLength = apiEnabled ? 60 : undefined
    let elements = getTranslatableElements(document.body, { minLength })
    if (apiEnabled) elements = sortByViewport(elements)

    let pending = elements.length

    if (pending === 0) {
      ball.setState('done')
      return
    }

    for (const el of elements) {
      translateElement(el, targetLang, apiEnabled).finally(() => {
        pending--
        if (pending === 0) ball.setState('done')
      })
    }
  }

  const ball = createFloatBall({
    apiMode: apiEnabled,
    onTranslate: startTranslation,
    initialMode: displayMode
  })

  // On YouTube, page translation is handled by youtube.js with site-specific logic.
  // Expose the ball so youtube.js can drive its state.
  if (window.BT_IS_YOUTUBE || window.BT_IS_REDDIT) {
    window.btBall = ball
    return
  }

  if (!apiEnabled) {
    chromeTranslatorStatus('auto', targetLang).then(status => {
      if (status === 'downloading') showChromeApiToast()
    })
    startTranslation()
  }

  // IntersectionObserver: translate elements when they enter the viewport.
  // Handles custom elements (e.g. Reddit's shreddit-post) whose shadow DOM
  // isn't ready yet when MutationObserver fires — by the time they're visible, they're fully rendered.
  const io = new IntersectionObserver((entries) => {
    if (!translationStarted) return
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const node = entry.target
      io.unobserve(node)
      if (node.dataset.btTranslated) continue
      if (shouldTranslate(node)) {
        translateElement(node, targetLang, apiEnabled)
      } else {
        // Container may have been a custom element — try walking its subtree now
        getTranslatableElements(node)
          .filter(el => !el.dataset.btTranslated)
          .forEach(el => translateElement(el, targetLang, apiEnabled))
      }
    }
  }, { rootMargin: '200px 0px' })  // pre-load 200px before entering viewport

  const observer = new MutationObserver((mutations) => {
    if (!translationStarted) return
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue
        if (node.dataset.btSiblingFor) continue  // skip our own injected translation divs
        // For known-good elements, translate immediately
        if (!node.dataset.btTranslated && shouldTranslate(node)) {
          translateElement(node, targetLang, apiEnabled)
          continue
        }
        // For everything else (including custom elements with shadow DOM),
        // hand off to IntersectionObserver to wait until rendered.
        // Skip tags that can never have translatable text to keep the IO list lean.
        if (SKIP_TAGS.has(node.tagName)) continue
        if (!node.textContent?.trim() && !node.shadowRoot) continue
        io.observe(node)
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
})()

async function translateElement(el, targetLang, apiEnabled = false) {
  if (el.dataset.btTranslated) return
  el.dataset.btTranslated = 'pending'
  const text = el.textContent.trim()

  if (!apiEnabled) {
    try {
      if (await chromeTranslatorAvailable('auto', targetLang)) {
        const [translation] = await chromeTranslatorTranslate([text], 'auto', targetLang)
        injectTranslation(el, translation)
        return
      }
    } catch {}
  }

  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    try {
      chrome.runtime.sendMessage(
        { type: 'TRANSLATE', id, text, fromLang: 'auto', toLang: targetLang },
        (response) => {
          if (chrome.runtime.lastError) { resolve(); return }
          if (response?.ok) {
            injectTranslation(el, response.translation)
          } else if (response?.isApiKeyError) {
            showApiErrorToast()
          }
          resolve()
        }
      )
    } catch {
      resolve()
    }
  })
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

function sortByViewport(els) {
  function dist(el) {
    const r = el.getBoundingClientRect()
    if (r.bottom < 0) return -r.bottom           // above viewport
    if (r.top > window.innerHeight) return r.top  // below viewport
    return 0                                       // in viewport
  }
  return [...els].sort((a, b) => dist(a) - dist(b))
}
