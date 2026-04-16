// Uses Google Translate public endpoint as last-resort fallback (no SLA)

async function translate(texts, fromLang, toLang) {
  console.log('[GoogleTranslator] translate called with', texts.length, 'texts, fromLang:', fromLang, 'toLang:', toLang)

  return Promise.all(texts.map(async (text) => {
    const params = new URLSearchParams({ client: 'gtx', sl: fromLang, tl: toLang, dt: 't', q: text })
    const url = `https://translate.googleapis.com/translate_a/single?${params}`

    console.log('[GoogleTranslator] Fetching:', url.substring(0, 100) + '...')

    const res = await fetch(url)
    if (!res.ok) {
      console.error('[GoogleTranslator] HTTP error:', res.status)
      throw new Error(`Google Translate error: ${res.status}`)
    }
    const json = await res.json()
    const result = json[0].map(part => part[0]).join('')
    console.log('[GoogleTranslator] Result for', text.substring(0, 30), ':', result)
    return result
  }))
}

const GoogleTranslator = { translate }
if (typeof self !== 'undefined' && typeof module === 'undefined') self.GoogleTranslator = GoogleTranslator
if (typeof module !== 'undefined') module.exports = GoogleTranslator
