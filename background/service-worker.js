importScripts('batch-queue.js', 'cache.js',
  'translators/google-translator.js',
  'translators/user-api-translator.js', 'translators/index.js')

const queues = new Map()

// In-memory config cache — avoids storage.local.get on every batch cycle
let config = { translateMode: 'machine', apiProvider: '', apiKey: '', apiModel: '', apiBaseUrl: '', enableCache: true }
chrome.storage.local.get([...Object.keys(config), 'apiEnabled'], (stored) => {
  Object.assign(config, stored)
  // Migration: old apiEnabled / 'privacy' → translateMode
  if (stored.translateMode === 'privacy') config.translateMode = 'chrome-local'
  else if (!stored.translateMode && stored.apiEnabled !== undefined) {
    config.translateMode = stored.apiEnabled ? 'api' : 'machine'
  }
})
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in config) config[key] = newValue
  }
  queues.forEach(q => q.destroy())
  queues.clear()
})

// ── Context menus (SnapFocus image OCR) ──────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'ocr-only',      title: chrome.i18n.getMessage('ctxOcrOnly'),      contexts: ['image'] })
  chrome.contextMenus.create({ id: 'ocr-translate', title: chrome.i18n.getMessage('ctxOcrTranslate'), contexts: ['image'] })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.srcUrl || !tab?.id) return
  if (info.menuItemId !== 'ocr-only' && info.menuItemId !== 'ocr-translate') return

  const needTranslate = info.menuItemId === 'ocr-translate'

  // 1. Ping SnapFocus
  try {
    const ping = await fetch('http://localhost:57312/ping', { signal: AbortSignal.timeout(1500) })
    if (!ping.ok) throw new Error()
  } catch {
    chrome.tabs.sendMessage(tab.id, { type: 'OCR_ERROR', error: 'snapfocus_offline' }).catch(() => {})
    return
  }

  // 2. Fetch image → base64 data URI
  let dataUri
  try {
    dataUri = await fetchImageAsDataUri(info.srcUrl)
  } catch {
    chrome.tabs.sendMessage(tab.id, { type: 'OCR_ERROR', error: 'fetch_failed' }).catch(() => {})
    return
  }

  // 3. OCR
  let full
  try {
    const res = await fetch('http://localhost:57312/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUri }),
      signal: AbortSignal.timeout(12000)
    })
    const json = await res.json()
    full = (json.full || '').trim()
  } catch {
    chrome.tabs.sendMessage(tab.id, { type: 'OCR_ERROR', error: 'ocr_failed' }).catch(() => {})
    return
  }

  if (!full) {
    chrome.tabs.sendMessage(tab.id, { type: 'OCR_ERROR', error: 'no_text' }).catch(() => {})
    return
  }

  // 4. Translate (optional)
  let translation = null
  if (needTranslate) {
    try {
      const { targetLang = 'zh' } = await chrome.storage.local.get('targetLang')
      const { translateMode, apiProvider, apiKey, apiModel, apiBaseUrl } = config
      const userApiConfig = translateMode === 'api' && apiKey
        ? { provider: apiProvider, key: apiKey, model: apiModel, baseUrl: apiBaseUrl }
        : null
      ;[translation] = await translateTexts([full], 'auto', targetLang, userApiConfig)
    } catch {}
  }

  chrome.tabs.sendMessage(tab.id, { type: 'OCR_RESULT', srcUrl: info.srcUrl, full, translation }).catch(() => {})
})

async function fetchImageAsDataUri(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const mimeType = res.headers.get('content-type')?.split(';')[0] || 'image/png'
  const uint8 = new Uint8Array(await res.arrayBuffer())
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < uint8.length; i += chunk) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunk))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

// ── Page translation queue ────────────────────────────────────────────────────

function getQueue(fromLang, toLang) {
  const key = `${fromLang}-${toLang}`
  if (!queues.has(key)) {
    const isApi = config.translateMode === 'api' && config.apiKey
    const queueParams = isApi
      ? { intervalMs: 800, maxCount: 25, maxChars: 15000 }
      : { intervalMs: 300, maxCount: 8,  maxChars: 8000  }
    const queue = createBatchQueue(
      async (texts) => {
        const { translateMode, apiProvider, apiKey, apiModel, apiBaseUrl, enableCache } = config
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
          const translated = await translateTexts(uncachedTexts, fromLang, toLang, userApiConfig)
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage()
    return false
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
