async function isAvailable(fromLang, toLang) {
  if (typeof translation === 'undefined') return false
  const result = await translation.canTranslate({ sourceLanguage: fromLang, targetLanguage: toLang })
  return result === 'readily' || result === 'after-download'
}

async function translate(texts, fromLang, toLang) {
  const translator = await translation.createTranslator({
    sourceLanguage: fromLang,
    targetLanguage: toLang
  })
  return Promise.all(texts.map(text => translator.translate(text)))
}

if (typeof module !== 'undefined') {
  module.exports = { isAvailable, translate }
}
