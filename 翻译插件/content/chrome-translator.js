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

// Triggers model download via SW over a long-lived Port, resolves when ready.
// onProgress(pct: 0-100) is streamed live from the SW's downloadprogress events.
function chromeTranslatorDownload(fromLang, toLang, onProgress) {
  return new Promise((resolve, reject) => {
    let settled = false
    const port = chrome.runtime.connect({ name: 'bt-chrome-dl' })
    const finish = (fn, arg) => {
      if (settled) return
      settled = true
      try { port.disconnect() } catch {}
      fn(arg)
    }
    port.onMessage.addListener((m) => {
      if (m?.pct != null) { onProgress?.(m.pct); return }
      if (m?.done) { finish(resolve); return }
      if (m?.error) { finish(reject, new Error(m.error)); return }
    })
    port.onDisconnect.addListener(() => {
      finish(reject, new Error(chrome.runtime.lastError?.message || 'download disconnected'))
    })
    port.postMessage({ fromLang, toLang })
  })
}

async function chromeTranslatorTranslate(texts, fromLang, toLang) {
  const r = await _swMsg({ type: 'CHROME_TRANSLATE', texts, fromLang, toLang })
  if (!r?.ok) throw new Error(r?.error ?? 'translation failed')
  return r.translations
}

if (typeof module !== 'undefined') {
  module.exports = { chromeTranslatorStatus, chromeTranslatorDownload, chromeTranslatorTranslate }
}
