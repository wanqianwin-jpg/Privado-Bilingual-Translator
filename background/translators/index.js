async function translateTexts(texts, fromLang, toLang, userApiConfig = null) {
  // API Key user path
  if (userApiConfig?.key && userApiConfig?.provider) {
    const userApi = (typeof UserApiTranslator !== 'undefined')
      ? UserApiTranslator
      : require('./user-api-translator.js')
    return userApi.translate(texts, fromLang, toLang, userApiConfig)
  }

  // Free path: Google → Bing fallback (Chrome API handled in content script)
  const googleApi = (typeof GoogleTranslator !== 'undefined')
    ? GoogleTranslator
    : require('./google-translator.js')
  const bingApi = (typeof BingTranslator !== 'undefined')
    ? BingTranslator
    : require('./bing-translator.js')

  try {
    return await googleApi.translate(texts, fromLang, toLang)
  } catch (googleErr) {
    return await bingApi.translate(texts, fromLang, toLang)
  }
}

const TranslateIndex = { translateTexts }
if (typeof self !== 'undefined' && typeof module === 'undefined') self.translateTexts = translateTexts
if (typeof module !== 'undefined') module.exports = TranslateIndex
