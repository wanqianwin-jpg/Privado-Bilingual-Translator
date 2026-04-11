// DeepL requires specific target codes; LLM prompts work better with full names
const DEEPL_LANG = {
  'zh': 'ZH', 'zh-TW': 'ZH-HANT', 'en': 'EN-US', 'ja': 'JA', 'ko': 'KO',
  'fr': 'FR', 'de': 'DE', 'es': 'ES', 'pt-BR': 'PT-BR', 'ru': 'RU', 'ar': 'AR', 'it': 'IT'
}
const LANG_NAME = {
  'zh': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)', 'en': 'English',
  'ja': 'Japanese', 'ko': 'Korean', 'fr': 'French', 'de': 'German',
  'es': 'Spanish', 'pt-BR': 'Portuguese (Brazilian)', 'ru': 'Russian', 'ar': 'Arabic', 'it': 'Italian'
}

async function translate(texts, fromLang, toLang, config) {
  const { provider, key } = config
  switch (provider) {
    case 'deepl':  return translateDeepL(texts, fromLang, toLang, config)
    case 'openai':
    case 'custom': return translateOpenAI(texts, fromLang, toLang, config)
    case 'gemini': return translateGemini(texts, fromLang, toLang, config)
    default: throw new Error(`Unknown provider: ${provider}`)
  }
}

function parseJsonResponse(raw) {
  // Strip reasoning blocks (<think>...</think>) from models like o3, DeepSeek-R1
  const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  // Find the first '[' and its matching ']', properly handling nested brackets and strings
  const start = stripped.indexOf('[')
  if (start === -1) throw new Error('No JSON array found in response')
  let depth = 0, inStr = false, escape = false, end = -1
  for (let i = start; i < stripped.length; i++) {
    const c = stripped[i]
    if (escape)        { escape = false; continue }
    if (c === '\\' && inStr) { escape = true; continue }
    if (c === '"')     { inStr = !inStr; continue }
    if (inStr)         continue
    if (c === '[')     depth++
    else if (c === ']') { if (--depth === 0) { end = i; break } }
  }
  if (end === -1) throw new Error('Unmatched bracket in response')
  const parsed = JSON.parse(stripped.slice(start, end + 1))
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array from translation API')
  return parsed
}

async function translateDeepL(texts, fromLang, toLang, { key }) {
  const endpoint = key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: texts,
      source_lang: fromLang === 'auto' ? undefined : fromLang.toUpperCase(),
      target_lang: DEEPL_LANG[toLang] ?? toLang.toUpperCase()
    })
  })
  if (!res.ok) throw new Error(`DeepL error: ${res.status}`)
  const json = await res.json()
  return json.translations.map(t => t.text)
}

async function translateOpenAI(texts, fromLang, toLang, { key, model, baseUrl }) {
  const endpoint = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions'
  const usedModel = model || 'gpt-4o-mini'
  const numbered = texts.map((t, i) => `${i}: ${t}`).join('\n')
  const langName = LANG_NAME[toLang] ?? toLang
  const prompt = `Translate the following ${texts.length} texts to ${langName}. Output ONLY a JSON array of translated strings in the same order. No explanations, no notes, no markdown.\n\n${numbered}`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: usedModel,
      messages: [
        { role: 'system', content: 'You are a translation engine. Output only raw JSON. No thinking, no explanations, no markdown fences.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1
    })
  })
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`)
  const json = await res.json()
  const parsed = parseJsonResponse(json.choices[0].message.content)
  if (parsed.length !== texts.length) throw new Error(`Translation count mismatch: expected ${texts.length}, got ${parsed.length}`)
  return parsed
}

async function translateGemini(texts, fromLang, toLang, { key, model }) {
  const usedModel = model || 'gemini-2.0-flash'
  const numbered = texts.map((t, i) => `${i}: ${t}`).join('\n')
  const langName = LANG_NAME[toLang] ?? toLang
  const prompt = `Translate these texts to ${langName}. Output ONLY a JSON array of translated strings, same order. No explanations, no markdown.\n\n${numbered}`
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${usedModel}:generateContent?key=${key}`
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
