// importScripts is only available in service worker context;
// in MV2 background.html these scripts are already loaded via <script> tags.
if (typeof importScripts === 'function') {
  importScripts('../shared/config.js',
    'batch-queue.js', 'cache.js',
    'translators/google-translator.js',
    'translators/user-api-translator.js', 'translators/index.js')
}

const IS_SAFARI = navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')

const queues = new Map()

// In-memory config cache — avoids storage.local.get on every batch cycle
let config = { translateMode: 'machine', apiProvider: '', apiKey: '', apiModel: '', apiBaseUrl: '', enableCache: true, enableFreeFallback: true }
chrome.storage.local.get([...Object.keys(config), 'apiEnabled'], (stored) => {
  Object.assign(config, stored)
  config.translateMode = resolveTranslateMode(stored)
})
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  let configChanged = false
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in config) {
      config[key] = newValue
      configChanged = true
    }
  }
  // Only flush queues when keys that affect translation behavior actually changed.
  // Unrelated changes (displayMode, siteSettings, etc) shouldn't drop in-flight requests.
  if (configChanged) {
    queues.forEach(q => q.destroy())
    queues.clear()
  }
})

// ── Context menus (Apple NPU image OCR) ──────────────────────────────────────

function registerContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'ocr-only',      title: chrome.i18n.getMessage('ctxOcrOnly'),      contexts: ['image'] })
    chrome.contextMenus.create({ id: 'ocr-translate', title: chrome.i18n.getMessage('ctxOcrTranslate'), contexts: ['image'] })
    if (!IS_SAFARI) {
      chrome.contextMenus.create({ id: 'rewrite-selection', title: chrome.i18n.getMessage('ctxRewriteSelection'), contexts: ['selection'] })
      chrome.contextMenus.create({ id: 'read-aloud', title: chrome.i18n.getMessage('ctxReadAloud'), contexts: ['selection'] })
    }
  })
}

// Only available in Safari (native messaging + Vision.framework)
// Direct call sufficient — MV2 persistent background runs this on every load
chrome.runtime.onInstalled.addListener(registerContextMenus)
chrome.runtime.onStartup.addListener(registerContextMenus)
if (IS_SAFARI) {
  registerContextMenus()
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'rewrite-selection') {
    if (!tab?.id) return
    const { targetLang = 'zh' } = await chrome.storage.local.get('targetLang')
    chrome.tabs.sendMessage(tab.id, {
      type: 'REWRITE_SELECTION',
      text: info.selectionText || null,
      targetLang
    }).catch(() => {})
    return
  }

  if (info.menuItemId === 'read-aloud') {
    if (!tab?.id) return
    chrome.tabs.sendMessage(tab.id, {
      type: 'READ_ALOUD',
      text: info.selectionText || null
    }).catch(() => {})
    return
  }

  if (!info.srcUrl || !tab?.id) return
  if (info.menuItemId !== 'ocr-only' && info.menuItemId !== 'ocr-translate') return

  const needTranslate = info.menuItemId === 'ocr-translate'

  // Fetch image → base64 data URI
  let dataUri
  try {
    dataUri = await fetchImageAsDataUri(info.srcUrl)
  } catch {
    chrome.tabs.sendMessage(tab.id, { type: 'OCR_ERROR', error: 'fetch_failed' }).catch(() => {})
    return
  }

  // OCR via native app
  try {
    const { targetLang = 'zh' } = await chrome.storage.local.get('targetLang')
    const r = await sendNativeMsg(
      needTranslate
        ? { type: 'OCR_TRANSLATE', image: dataUri, toLang: targetLang }
        : { type: 'OCR',           image: dataUri }
    )
    if (r?.error === 'no_text' || (!r?.full && r?.error)) {
      chrome.tabs.sendMessage(tab.id, { type: 'OCR_ERROR', error: r.error === 'no_text' ? 'no_text' : 'ocr_failed' }).catch(() => {})
      return
    }
    if (!r?.full) {
      chrome.tabs.sendMessage(tab.id, { type: 'OCR_ERROR', error: 'ocr_failed' }).catch(() => {})
      return
    }
    chrome.tabs.sendMessage(tab.id, {
      type: 'OCR_RESULT', srcUrl: info.srcUrl, full: r.full, translation: r.translation ?? null
    }).catch(() => {})
  } catch {
    chrome.tabs.sendMessage(tab.id, { type: 'OCR_ERROR', error: 'ocr_failed' }).catch(() => {})
  }
})

async function fetchImageAsDataUri(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  return await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error || new Error('FileReader failed'))
    r.readAsDataURL(blob)
  })
}

// ── Page translation queue ────────────────────────────────────────────────────

function getQueue(fromLang, toLang) {
  const key = `${fromLang}-${toLang}`
  if (!queues.has(key)) {
    const isApi = config.translateMode === 'api' && config.apiKey
    const queueParams = isApi
      ? { intervalMs: 800, maxCount: 10, maxChars: 4000 }
      : { intervalMs: 300, maxCount: 8,  maxChars: 8000 }
    const queue = createBatchQueue(
      async (texts) => {
        const { translateMode, apiProvider, apiKey, apiModel, apiBaseUrl, enableCache, enableFreeFallback } = config
        const userApiConfig = translateMode === 'api' && apiKey ? { provider: apiProvider, key: apiKey, model: apiModel, baseUrl: apiBaseUrl } : null
        const source = apiProvider || 'free'
        const useCache = translateMode !== 'api' || enableCache

        const results = []
        const uncachedIndexes = []
        const uncachedTexts = []

        for (let i = 0; i < texts.length; i++) {
          const cached = useCache ? await btGetCache(source, texts[i], fromLang, toLang) : null
          if (cached !== null) {
            results[i] = cached
          } else {
            uncachedIndexes.push(i)
            uncachedTexts.push(texts[i])
          }
        }

        if (uncachedTexts.length > 0) {
          const translated = await translateTexts(uncachedTexts, fromLang, toLang, userApiConfig, enableFreeFallback !== false)
          for (let j = 0; j < uncachedIndexes.length; j++) {
            const i = uncachedIndexes[j]
            results[i] = translated[j]
            if (useCache) btSetCache(source, texts[i], fromLang, toLang, translated[j])
          }
        }

        return results
      },
      queueParams
    )
    queues.set(key, queue)
  }
  return queues.get(key)
}

// Safari Native Messaging: bundle ID of the containing app
const NATIVE_APP_ID = 'com.wanqian.Privado---Bilingual-Translator'

// Safari exposes `browser` (Promise-based) or `chrome` (callback-based) depending on context.
// This wrapper normalises both into a Promise.
function sendNativeMsg(msg) {
  const _browser = typeof self.browser !== 'undefined' ? self.browser : null
  if (_browser?.runtime?.sendNativeMessage) {
    return _browser.runtime.sendNativeMessage(NATIVE_APP_ID, msg)
  }
  if (typeof chrome.runtime.sendNativeMessage === 'function') {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(NATIVE_APP_ID, msg, r => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
        else resolve(r)
      })
    })
  }
  return Promise.reject(new Error('sendNativeMessage unavailable'))
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage()
    return false
  }

  // apple-npu: status check → native app
  if (msg.type === 'NATIVE_TRANSLATE_STATUS') {
    sendNativeMsg({ type: 'TRANSLATE_STATUS', fromLang: msg.fromLang, toLang: msg.toLang })
      .then(r => {
        chrome.storage.local.set({ _npu_result: JSON.stringify(r), _npu_error: null })
        sendResponse({ status: r?.status ?? 'unavailable' })
      })
      .catch(e => {
        chrome.storage.local.set({ _npu_error: e?.message ?? 'unknown', _npu_result: null })
        sendResponse({ status: 'unavailable' })
      })
    return true
  }

  // apple-npu: batch translate → native app
  if (msg.type === 'NATIVE_TRANSLATE') {
    sendNativeMsg({ type: 'TRANSLATE', texts: msg.texts, fromLang: msg.fromLang, toLang: msg.toLang })
      .then(r => sendResponse({ ok: true, translations: r?.translations ?? [] }))
      .catch(err => sendResponse({ ok: false, error: err.message }))
    return true
  }

  // apple-npu: language detection → native app
  if (msg.type === 'DETECT_LANGUAGE') {
    sendNativeMsg({ type: 'DETECT_LANGUAGE', text: msg.text })
      .then(r => sendResponse({ language: r?.language ?? 'und', confidence: r?.confidence ?? 0 }))
      .catch(() => sendResponse({ language: 'und', confidence: 0 }))
    return true
  }

  if (msg.type !== 'TRANSLATE') return false

  const { text, fromLang, toLang } = msg
  const queue = getQueue(fromLang, toLang)
  queue.add({
    id: msg.id,
    text,
    onResult: (translation) => sendResponse({ ok: true, translation }),
    onError: (err) => sendResponse({ ok: false, error: err.message, isApiKeyError: config.translateMode === 'api' })
  })

  return true
})

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'rewrite-selection') {
    if (!tab?.id) return
    const { targetLang = 'zh' } = await chrome.storage.local.get('targetLang')
    chrome.tabs.sendMessage(tab.id, {
      type: 'REWRITE_SELECTION',
      text: null,
      targetLang
    }).catch(() => {})
    return
  }

  if (command === 'read-aloud') {
    if (!tab?.id) return
    chrome.tabs.sendMessage(tab.id, {
      type: 'READ_ALOUD',
      text: null
    }).catch(() => {})
  }
})
