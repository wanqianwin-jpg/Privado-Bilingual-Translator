// Uses Microsoft Translator free endpoint as fallback (no API key needed)

const BingTranslator = (() => {
  async function translate(texts, fromLang, toLang) {
    const url = new URL('https://api.cognitive.microsofttranslator.com/translate')
    url.searchParams.set('api-version', '3.0')
    url.searchParams.set('to', toLang)
    if (fromLang && fromLang !== 'auto') url.searchParams.set('from', fromLang)

    const body = texts.map(t => ({ Text: t }))
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`Bing HTTP ${res.status}`)
    const data = await res.json()
    return data.map(item => item.translations[0].text)
  }

  return { translate }
})()

if (typeof self !== 'undefined' && typeof module === 'undefined') self.BingTranslator = BingTranslator
if (typeof module !== 'undefined') module.exports = BingTranslator
