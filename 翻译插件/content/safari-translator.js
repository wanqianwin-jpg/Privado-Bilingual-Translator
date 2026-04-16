// content/safari-translator.js
// Safari ANE translation — routes through service worker → SafariWebExtensionHandler → TranslationSession

async function safariTranslatorStatus(fromLang, toLang) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'NATIVE_TRANSLATE_STATUS', fromLang, toLang },
      (response) => {
        if (chrome.runtime.lastError) { resolve('unavailable'); return }
        resolve(response?.status ?? 'unavailable')
      }
    )
  })
}

async function safariTranslatorTranslate(texts, fromLang, toLang) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'NATIVE_TRANSLATE', texts, fromLang, toLang },
      (response) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return }
        if (response?.ok) resolve(response.translations)
        else reject(new Error(response?.error ?? 'native translation failed'))
      }
    )
  })
}

async function safariDetectLanguage(text) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'DETECT_LANGUAGE', text },
      (response) => {
        if (chrome.runtime.lastError) { resolve('und'); return }
        resolve(response?.language ?? 'und')
      }
    )
  })
}
