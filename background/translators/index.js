async function translateTexts(texts, fromLang, toLang, userApiConfig = null) {
  // API Key user path — completely separate, no Chrome Translator API
  if (userApiConfig?.key && userApiConfig?.provider) {
    const { translate } = require('./user-api-translator.js')
    return translate(texts, fromLang, toLang, userApiConfig)
  }

  // Free user path
  const chromeTranslator = require('./chrome-translator.js')
  if (await chromeTranslator.isAvailable(fromLang, toLang)) {
    return chromeTranslator.translate(texts, fromLang, toLang)
  }

  // Fallback
  const googleTranslator = require('./google-translator.js')
  return googleTranslator.translate(texts, fromLang, toLang)
}

if (typeof module !== 'undefined') {
  module.exports = { translateTexts }
}
