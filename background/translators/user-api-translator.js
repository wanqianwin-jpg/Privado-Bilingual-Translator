async function translate(texts, fromLang, toLang, { provider, key }) {
  switch (provider) {
    case 'deepl':   return translateDeepL(texts, fromLang, toLang, key)
    case 'openai':  return translateOpenAI(texts, fromLang, toLang, key)
    case 'gemini':  return translateGemini(texts, fromLang, toLang, key)
    default: throw new Error(`Unknown provider: ${provider}`)
  }
}

function parseJsonResponse(raw) {
  // Strip markdown code blocks if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const parsed = JSON.parse(cleaned)
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array from translation API')
  return parsed
}

async function translateDeepL(texts, fromLang, toLang, key) {
  const endpoint = key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'
  const res = await fetch(endpoint, {
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
  const parsed = parseJsonResponse(json.choices[0].message.content)
  if (parsed.length !== texts.length) throw new Error(`Translation count mismatch: expected ${texts.length}, got ${parsed.length}`)
  return parsed
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
  const parsed = parseJsonResponse(json.candidates[0].content.parts[0].text)
  if (parsed.length !== texts.length) throw new Error(`Translation count mismatch: expected ${texts.length}, got ${parsed.length}`)
  return parsed
}

const UserApiTranslator = { translate }
if (typeof self !== 'undefined' && typeof module === 'undefined') self.UserApiTranslator = UserApiTranslator
if (typeof module !== 'undefined') module.exports = UserApiTranslator
