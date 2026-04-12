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
