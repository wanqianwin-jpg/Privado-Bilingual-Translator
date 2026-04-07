// Uses Google Translate public endpoint as last-resort fallback (no SLA)

async function translate(texts, fromLang, toLang) {
  return Promise.all(texts.map(async (text) => {
    const params = new URLSearchParams({ client: 'gtx', sl: fromLang, tl: toLang, dt: 't', q: text })
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`)
    if (!res.ok) throw new Error(`Google Translate error: ${res.status}`)
    const json = await res.json()
    return json[0].map(part => part[0]).join('')
  }))
}

const GoogleTranslator = { translate }
if (typeof self !== 'undefined' && typeof module === 'undefined') self.GoogleTranslator = GoogleTranslator
if (typeof module !== 'undefined') module.exports = GoogleTranslator
