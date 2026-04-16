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

// Calls the appropriate provider for a batch of texts.
// Throws CountMismatchError when the LLM returns wrong number of items.
class CountMismatchError extends Error {}

async function callProvider(texts, fromLang, toLang, config) {
  const { provider } = config
  switch (provider) {
    case 'deepl':  return translateDeepL(texts, fromLang, toLang, config)
    case 'openai':
    case 'custom': return translateOpenAI(texts, fromLang, toLang, config)
    case 'gemini': return translateGemini(texts, fromLang, toLang, config)
    default: throw new Error(`Unknown provider: ${provider}`)
  }
}

// Recursively splits and retries on CountMismatchError.
// Single items that still fail return an empty string rather than propagating.
async function splitRetry(texts, fromLang, toLang, config) {
  if (texts.length === 0) return []
  try {
    return await callProvider(texts, fromLang, toLang, config)
  } catch (err) {
    if (!(err instanceof CountMismatchError) || texts.length === 1) {
      if (texts.length === 1) return ['']   // single item: fail silently
      throw err                             // non-mismatch error: propagate
    }
    // Split in half and retry each chunk independently
    const mid = Math.ceil(texts.length / 2)
    const [left, right] = await Promise.all([
      splitRetry(texts.slice(0, mid), fromLang, toLang, config),
      splitRetry(texts.slice(mid),    fromLang, toLang, config)
    ])
    return [...left, ...right]
  }
}

async function translate(texts, fromLang, toLang, config) {
  return splitRetry(texts, fromLang, toLang, config)
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
  if (parsed.length !== texts.length) throw new CountMismatchError(`expected ${texts.length}, got ${parsed.length}`)
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
  if (parsed.length !== texts.length) throw new CountMismatchError(`expected ${texts.length}, got ${parsed.length}`)
  return parsed
}

const UserApiTranslator = { translate }
if (typeof self !== 'undefined' && typeof module === 'undefined') self.UserApiTranslator = UserApiTranslator
if (typeof module !== 'undefined') module.exports = UserApiTranslator
