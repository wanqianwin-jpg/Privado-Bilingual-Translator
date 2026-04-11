;(async function () {
  const stored = await chrome.storage.local.get([
    'siteSettings', 'displayMode', 'targetLang', 'translateMode', 'apiEnabled'
  ])
  const { siteSettings = {}, displayMode = 'bilingual', targetLang = 'zh' } = stored

  // Migration: old apiEnabled / 'privacy' → translateMode
  let translateMode = stored.translateMode === 'privacy' ? 'chrome-local' : stored.translateMode
  if (!translateMode) translateMode = stored.apiEnabled ? 'api' : 'machine'

  if (siteSettings[location.hostname] === 'never') return

  injectStyles()
  setDisplayMode(displayMode)

  let translationStarted = false

  async function startTranslation() {
    if (translationStarted) return
    translationStarted = true
    ball.setState('translating')

    // chrome-local: check Chrome Translator API availability upfront
    if (translateMode === 'chrome-local') {
      const status = await chromeTranslatorStatus('auto', targetLang)
      if (status === 'unavailable') {
        showPrivacyUnavailableToast()
        ball.setState('idle')
        translationStarted = false
        return
      }
      if (status === 'downloading') showChromeApiToast()
    }

    // apple-npu: ping SnapFocus upfront
    if (translateMode === 'apple-npu') {
      const alive = await snapFocusPing()
      if (!alive) {
        showPrivacyUnavailableToast()
        ball.setState('idle')
        translationStarted = false
        return
      }
    }

    const minLength = translateMode === 'api' ? 60 : undefined
    let elements = getTranslatableElements(document.body, { minLength })
    if (translateMode === 'api') elements = sortByViewport(elements)


    let pending = elements.length
    if (pending === 0) { ball.setState('done'); return }

    for (const el of elements) {
      translateElement(el, targetLang, translateMode).finally(() => {
        pending--
        if (pending === 0) ball.setState('done')
      })
    }
  }

  const ball = createFloatBall({
    manualMode: translateMode === 'api',
    onTranslate: startTranslation,
    initialMode: displayMode
  })

  // On YouTube/Reddit, page translation is handled by site-specific scripts.
  // Expose the ball so they can drive its state.
  if (window.BT_IS_YOUTUBE || window.BT_IS_REDDIT) {
    window.btBall = ball
    return
  }

  // machine / chrome-local / apple-npu auto-start; api waits for user click
  if (translateMode !== 'api') {
    startTranslation()
  }

  // IntersectionObserver: translate elements when they enter the viewport
  const io = new IntersectionObserver((entries) => {
    if (!translationStarted) return
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const node = entry.target
      io.unobserve(node)
      if (node.dataset.btTranslated) continue
      if (shouldTranslate(node)) {
        translateElement(node, targetLang, translateMode)
      } else {
        getTranslatableElements(node)
          .filter(el => !el.dataset.btTranslated)
          .forEach(el => translateElement(el, targetLang, translateMode))
      }
    }
  }, { rootMargin: '200px 0px' })

  const observer = new MutationObserver((mutations) => {
    if (!translationStarted) return
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue
        if (node.dataset.btSiblingFor) continue
        if (!node.dataset.btTranslated && shouldTranslate(node)) {
          translateElement(node, targetLang, translateMode)
          continue
        }
        if (SKIP_TAGS.has(node.tagName)) continue
        if (!node.textContent?.trim() && !node.shadowRoot) continue
        io.observe(node)
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
})()

async function translateElement(el, targetLang, translateMode) {
  if (el.dataset.btTranslated) return
  el.dataset.btTranslated = 'pending'
  const text = el.textContent.trim()

  // chrome-local: Chrome Translator API (Gemini Nano)
  if (translateMode === 'chrome-local') {
    try {
      if (await chromeTranslatorAvailable('auto', targetLang)) {
        const [translation] = await chromeTranslatorTranslate([text], 'auto', targetLang)
        injectTranslation(el, translation)
        return
      }
    } catch {}
    // Model not ready for this element — silent SW fallback
    // Page-level unavailability already caught in startTranslation
  }

  // apple-npu: SnapFocus local HTTP
  if (translateMode === 'apple-npu') {
    try {
      const translation = await snapFocusTranslate(text, targetLang)
      injectTranslation(el, translation)
      return
    } catch {}
    // SnapFocus unavailable for this element — silent SW fallback
  }

  // machine and api modes, plus privacy fallback
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

function sortByViewport(els) {
  function dist(el) {
    const r = el.getBoundingClientRect()
    if (r.bottom < 0) return -r.bottom
    if (r.top > window.innerHeight) return r.top
    return 0
  }
  return [...els].sort((a, b) => dist(a) - dist(b))
}

// ── Toasts ────────────────────────────────────────────────────────────────────

let apiErrorToastShown = false
function showApiErrorToast() {
  if (apiErrorToastShown) return
  apiErrorToastShown = true

  const toast = makeToast()
  const msg = document.createElement('span')
  msg.textContent = '⚠ API Key 请求失败'

  const btnFree = makeBtn('切换机翻', '#4285f4', async () => {
    await chrome.storage.local.set({ translateMode: 'machine' })
    location.reload()
  })
  const btnOptions = makeBtn('检查设置', null, () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }))

  toast.append(msg, btnFree, btnOptions)
  document.body.appendChild(toast)
  setTimeout(() => { toast.remove(); apiErrorToastShown = false }, 10000)
}

let privacyToastShown = false
function showPrivacyUnavailableToast() {
  if (privacyToastShown) return
  privacyToastShown = true

  const toast = makeToast()
  const msg = document.createElement('span')
  msg.textContent = '⚠ 隐私翻译暂不可用'

  const btnMachine = makeBtn('切换机翻', '#4285f4', async () => {
    await chrome.storage.local.set({ translateMode: 'machine' })
    location.reload()
  })
  const btnApi = makeBtn('用 API Key', null, () => chrome.runtime.openOptionsPage())

  toast.append(msg, btnMachine, btnApi)
  document.body.appendChild(toast)
  setTimeout(() => { toast.remove(); privacyToastShown = false }, 10000)
}

let chromeApiToastShown = false
function showChromeApiToast() {
  if (chromeApiToastShown) return
  chromeApiToastShown = true

  const toast = makeToast()
  const msg = document.createElement('span')
  msg.textContent = '⏳ Gemini Nano 模型下载中，完成后可离线翻译'
  toast.appendChild(msg)
  document.body.appendChild(toast)
  setTimeout(() => { toast.remove(); chromeApiToastShown = false }, 5000)
}

function makeToast() {
  const el = document.createElement('div')
  el.style.cssText = [
    'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
    'background:#333', 'color:#fff', 'padding:12px 16px', 'border-radius:6px',
    'font-size:13px', 'display:flex', 'gap:10px', 'align-items:center',
    'font-family:system-ui'
  ].join(';')
  return el
}

function makeBtn(label, bgColor, onClick) {
  const btn = document.createElement('button')
  btn.textContent = label
  btn.style.cssText = bgColor
    ? `background:${bgColor};color:#fff;border:none;border-radius:3px;padding:3px 8px;cursor:pointer`
    : 'background:transparent;color:#aaa;border:1px solid #555;border-radius:3px;padding:3px 8px;cursor:pointer'
  btn.addEventListener('click', onClick)
  return btn
}

// ── OCR overlay (triggered by context menu via SW) ────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'OCR_RESULT') showOcrOverlay(msg.srcUrl, msg.full, msg.translation)
  if (msg.type === 'OCR_ERROR')  showOcrErrorToast(msg.error)
})

function showOcrOverlay(srcUrl, text, translation) {
  document.getElementById('bt-ocr-overlay')?.remove()

  // Find the target image to anchor the overlay
  let anchor = null
  for (const img of document.querySelectorAll('img')) {
    if (img.src === srcUrl || img.currentSrc === srcUrl) { anchor = img; break }
  }

  const overlay = document.createElement('div')
  overlay.id = 'bt-ocr-overlay'
  overlay.style.cssText = [
    'position:fixed', 'z-index:2147483647',
    'background:#1e1e1e', 'color:#f0f0f0',
    'border-radius:10px', 'padding:14px 16px',
    'font-size:13px', 'font-family:system-ui',
    'max-width:340px', 'min-width:180px',
    'box-shadow:0 6px 24px rgba(0,0,0,0.45)',
    'line-height:1.6'
  ].join(';')

  // Position: below the image if found, else center screen
  if (anchor) {
    const r = anchor.getBoundingClientRect()
    overlay.style.top  = Math.min(r.bottom + 10, window.innerHeight - 220) + 'px'
    overlay.style.left = Math.max(10, Math.min(r.left, window.innerWidth - 360)) + 'px'
  } else {
    overlay.style.top = '50%'
    overlay.style.left = '50%'
    overlay.style.transform = 'translate(-50%, -50%)'
  }

  // Header
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px'
  const title = document.createElement('span')
  title.style.cssText = 'font-size:11px;color:#888;font-weight:600;letter-spacing:0.03em'
  title.textContent = 'OCR · SnapFocus'
  const closeBtn = document.createElement('button')
  closeBtn.textContent = '✕'
  closeBtn.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;font-size:12px;padding:0;line-height:1'
  closeBtn.addEventListener('click', () => overlay.remove())
  header.append(title, closeBtn)
  overlay.appendChild(header)

  // OCR text
  const textEl = document.createElement('div')
  textEl.textContent = text
  textEl.style.cssText = 'white-space:pre-wrap;word-break:break-word'
  overlay.appendChild(textEl)

  // Translation
  if (translation) {
    const divider = document.createElement('div')
    divider.style.cssText = 'border-top:1px solid #333;margin:10px 0'
    overlay.appendChild(divider)
    const transEl = document.createElement('div')
    transEl.textContent = translation
    transEl.style.cssText = 'color:#aaa;white-space:pre-wrap;word-break:break-word'
    overlay.appendChild(transEl)
  }

  // Copy buttons
  const btnRow = document.createElement('div')
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px'

  function makeCopyBtn(label, content) {
    const btn = document.createElement('button')
    btn.textContent = label
    btn.style.cssText = 'background:#333;color:#ddd;border:none;border-radius:5px;padding:5px 10px;font-size:11px;cursor:pointer;flex:1'
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(content)
      btn.textContent = '已复制 ✓'
      setTimeout(() => { btn.textContent = label }, 1500)
    })
    return btn
  }

  btnRow.appendChild(makeCopyBtn('复制原文', text))
  if (translation) btnRow.appendChild(makeCopyBtn('复制译文', translation))
  overlay.appendChild(btnRow)

  document.body.appendChild(overlay)
  setTimeout(() => overlay.remove(), 30000)
}

const OCR_ERRORS = {
  snapfocus_offline: '请先启动 SnapFocus',
  fetch_failed:      '图片加载失败',
  ocr_failed:        'OCR 识别失败',
  no_text:           '未识别到文字'
}

function showOcrErrorToast(error) {
  const toast = makeToast()
  const msg = document.createElement('span')
  msg.textContent = '⚠ ' + (OCR_ERRORS[error] || 'OCR 出错')
  toast.appendChild(msg)
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 4000)
}
