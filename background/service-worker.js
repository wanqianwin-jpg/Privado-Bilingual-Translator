importScripts('batch-queue.js', 'translators/chrome-translator.js',
  'translators/google-translator.js', 'translators/user-api-translator.js',
  'translators/index.js')

const queues = new Map()

function getQueue(fromLang, toLang, userApiConfig) {
  const key = `${fromLang}-${toLang}-${userApiConfig?.provider || 'free'}`
  if (!queues.has(key)) {
    const queue = createBatchQueue(
      (texts) => translateTexts(texts, fromLang, toLang, userApiConfig),
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
    const queue = getQueue(fromLang, toLang, userApiConfig)
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
