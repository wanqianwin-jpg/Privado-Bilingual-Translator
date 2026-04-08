importScripts('batch-queue.js', 'cache.js', 'translators/chrome-translator.js',
  'translators/google-translator.js', 'translators/user-api-translator.js',
  'translators/index.js')

const queues = new Map()

function getQueue(fromLang, toLang) {
  const key = `${fromLang}-${toLang}`
  if (!queues.has(key)) {
    const queue = createBatchQueue(
      async (texts) => {
        const { userApiConfig = null, enableCache = false } = await chrome.storage.local.get(['userApiConfig', 'enableCache'])
        const source = userApiConfig?.provider || 'free'

        // Check cache for each text (always for free users, opt-in for API key users)
        const results = []
        const uncachedIndexes = []
        const uncachedTexts = []

        for (let i = 0; i < texts.length; i++) {
          const cached = (enableCache || !userApiConfig?.key)
            ? await btGetCache(source, texts[i], fromLang, toLang)
            : null
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
            // Write to cache (always for free users, opt-in for API key users)
            if (enableCache || !userApiConfig?.key) {
              btSetCache(source, texts[i], fromLang, toLang, translated[j])
            }
          }
        }

        return results
      },
      { intervalMs: 300, maxCount: 8, maxChars: 8000 }
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

  chrome.storage.local.get(['userApiConfig'], ({ userApiConfig }) => {
    const { text, fromLang, toLang } = msg
    const queue = getQueue(fromLang, toLang)
    queue.add({
      id: msg.id,
      text,
      onResult: (translation) => sendResponse({ ok: true, translation }),
      onError: (err) => sendResponse({
        ok: false,
        error: err.message,
        isApiKeyError: !!(userApiConfig?.key)
      })
    })
  })

  return true // async sendResponse
})
