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

// Returns 'available' | 'downloading' | 'unavailable'
async function chromeTranslatorStatus(fromLang, toLang) {
  if (!('Translator' in self)) return 'unavailable'
  try {
    const status = await Translator.availability({ sourceLanguage: fromLang === 'auto' ? 'en' : fromLang, targetLanguage: toLang })
    if (status === 'available') return 'available'
    if (status === 'downloading') return 'downloading'
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

async function chromeTranslatorTranslate(texts, fromLang, toLang) {
  const translator = await Translator.create({
    sourceLanguage: fromLang === 'auto' ? 'en' : fromLang,
    targetLanguage: toLang
  })
  return Promise.all(texts.map(t => translator.translate(t)))
}
