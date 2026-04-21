// content/chrome-translator.js
// Chrome Translator API — runs in content script context only (not Service Worker)

async function chromeTranslatorAvailable(fromLang, toLang) {
  if (!('Translator' in self)) return false
  try {
    const canTranslate = await Translator.availability({ sourceLanguage: fromLang === 'auto' ? 'en' : fromLang, targetLanguage: toLang })
    return canTranslate === 'available'
  } catch {
    return false
  }
}

// Returns 'available' | 'after-download' | 'downloading' | 'unavailable'
async function chromeTranslatorStatus(fromLang, toLang) {
  if (!('Translator' in self)) return 'unavailable'
  try {
    const status = await Translator.availability({ sourceLanguage: fromLang === 'auto' ? 'en' : fromLang, targetLanguage: toLang })
    if (status === 'available') return 'available'
    if (status === 'downloading') return 'downloading'
    if (status === 'after-download') return 'after-download'
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

// Triggers model download and resolves when translator is ready.
// onProgress(pct: 0-100) called during download if total is known.
async function chromeTranslatorDownload(fromLang, toLang, onProgress) {
  return Translator.create({
    sourceLanguage: fromLang === 'auto' ? 'en' : fromLang,
    targetLanguage: toLang,
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => {
        if (onProgress && e.total > 0) onProgress(Math.round(e.loaded / e.total * 100))
      })
    }
  })
}

async function chromeTranslatorTranslate(texts, fromLang, toLang) {
  const translator = await Translator.create({
    sourceLanguage: fromLang === 'auto' ? 'en' : fromLang,
    targetLanguage: toLang
  })
  return Promise.all(texts.map(t => translator.translate(t)))
}
