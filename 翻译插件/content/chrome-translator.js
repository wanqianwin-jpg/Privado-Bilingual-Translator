// content/chrome-translator.js
// Chrome Translator API — proxied through service worker (extension context required)

function _swMsg(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, r => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve(r)
    })
  })
}

// Returns 'available' | 'after-download' | 'downloading' | 'unavailable' | 'no-api'
async function chromeTranslatorStatus(fromLang, toLang) {
  try {
    const r = await _swMsg({ type: 'CHROME_TRANSLATE_STATUS', fromLang, toLang })
    return r?.status ?? 'unavailable'
  } catch {
    return 'unavailable'
  }
}

// Triggers model download via SW, resolves when ready.
// onProgress(pct: 0-100) is best-effort (SW can't stream progress back easily).
async function chromeTranslatorDownload(fromLang, toLang, onProgress) {
  const r = await _swMsg({ type: 'CHROME_TRANSLATE', texts: ['hello'], fromLang, toLang })
  if (!r?.ok) throw new Error(r?.error ?? 'download failed')
}

async function chromeTranslatorTranslate(texts, fromLang, toLang) {
  const r = await _swMsg({ type: 'CHROME_TRANSLATE', texts, fromLang, toLang })
  if (!r?.ok) throw new Error(r?.error ?? 'translation failed')
  return r.translations
}
