async function translateTexts(texts, fromLang, toLang, userApiConfig = null, enableFreeFallback = true) {
  // API Key user path
  if (userApiConfig?.key && userApiConfig?.provider) {
    const userApi = (typeof UserApiTranslator !== 'undefined')
      ? UserApiTranslator
      : require('./user-api-translator.js')
    return userApi.translate(texts, fromLang, toLang, userApiConfig)
  }

  // Free fallback disabled: return empty strings so the caller produces no output
  if (!enableFreeFallback) return texts.map(() => '')

  // Free path: Google (Chrome Translator API handled via CHROME_TRANSLATE message in service-worker.js)
  const googleApi = (typeof GoogleTranslator !== 'undefined')
    ? GoogleTranslator
    : require('./google-translator.js')

  return await googleApi.translate(texts, fromLang, toLang)
}

const TranslateIndex = { translateTexts }
if (typeof self !== 'undefined' && typeof module === 'undefined') self.translateTexts = translateTexts
if (typeof module !== 'undefined') module.exports = TranslateIndex
