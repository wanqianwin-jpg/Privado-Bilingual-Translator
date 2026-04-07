async function translateTexts(texts, fromLang, toLang, userApiConfig = null) {
  if (userApiConfig?.key && userApiConfig?.provider) {
    const userApi = (typeof UserApiTranslator !== 'undefined')
      ? UserApiTranslator
      : require('./user-api-translator.js')
    return userApi.translate(texts, fromLang, toLang, userApiConfig)
  }

  const chromeApi = (typeof ChromeTranslator !== 'undefined')
    ? ChromeTranslator
    : require('./chrome-translator.js')
  if (await chromeApi.isAvailable(fromLang, toLang)) {
    return chromeApi.translate(texts, fromLang, toLang)
  }

  const googleApi = (typeof GoogleTranslator !== 'undefined')
    ? GoogleTranslator
    : require('./google-translator.js')
  return googleApi.translate(texts, fromLang, toLang)
}

const TranslateIndex = { translateTexts }
if (typeof self !== 'undefined' && typeof module === 'undefined') self.translateTexts = translateTexts
if (typeof module !== 'undefined') module.exports = TranslateIndex
