async function translate(texts, fromLang, toLang, { provider, key }) {
  switch (provider) {
    case 'deepl':   return translateDeepL(texts, fromLang, toLang, key)
    case 'openai':  return translateOpenAI(texts, fromLang, toLang, key)
    case 'gemini':  return translateGemini(texts, fromLang, toLang, key)
    default: throw new Error(`Unknown provider: ${provider}`)
  }
}

async function translateDeepL(texts, fromLang, toLang, key) {
  const res = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { 'Authorization': `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: texts,
      source_lang: fromLang === 'auto' ? undefined : fromLang.toUpperCase(),
      target_lang: toLang.toUpperCase()
    })
  })
  if (!res.ok) throw new Error(`DeepL error: ${res.status}`)
  const json = await res.json()
  return json.translations.map(t => t.text)
}

async function translateOpenAI(texts, fromLang, toLang, key) {
  const numbered = texts.map((t, i) => `${i}: ${t}`).join('\n')
  const prompt = `Translate the following ${texts.length} texts to ${toLang}. Return a JSON array of translated strings, same order, no extra text.\n\n${numbered}`
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    })
  })
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`)
  const json = await res.json()
  return JSON.parse(json.choices[0].message.content)
}

async function translateGemini(texts, fromLang, toLang, key) {
  const numbered = texts.map((t, i) => `${i}: ${t}`).join('\n')
  const prompt = `Translate these texts to ${toLang}. Return JSON array only.\n\n${numbered}`
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  })
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`)
  const json = await res.json()
  return JSON.parse(json.candidates[0].content.parts[0].text)
}

if (typeof module !== 'undefined') {
  module.exports = { translate }
}
