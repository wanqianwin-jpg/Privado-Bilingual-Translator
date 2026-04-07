async function isAvailable(fromLang, toLang) {
  if (typeof translation === 'undefined') return false
  try {
    const result = await translation.canTranslate({ sourceLanguage: fromLang, targetLanguage: toLang })
    return result === 'readily'  // 'after-download' falls back to Google
  } catch {
    return false
  }
}

async function translate(texts, fromLang, toLang) {
  const translator = await translation.createTranslator({
    sourceLanguage: fromLang,
    targetLanguage: toLang
  })
  return Promise.all(texts.map(text => translator.translate(text)))
}

const ChromeTranslator = { isAvailable, translate }
if (typeof self !== 'undefined' && typeof module === 'undefined') self.ChromeTranslator = ChromeTranslator
if (typeof module !== 'undefined') module.exports = ChromeTranslator
