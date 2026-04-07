// Uses Google Translate public endpoint as last-resort fallback (no SLA)

async function translate(texts, fromLang, toLang) {
  const results = []
  for (const text of texts) {
    const params = new URLSearchParams({ client: 'gtx', sl: fromLang, tl: toLang, dt: 't', q: text })
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`)
    if (!res.ok) throw new Error(`Google Translate error: ${res.status}`)
    const json = await res.json()
    const translated = json[0].map(part => part[0]).join('')
    results.push(translated)
  }
  return results
}

if (typeof module !== 'undefined') {
  module.exports = { translate }
}
