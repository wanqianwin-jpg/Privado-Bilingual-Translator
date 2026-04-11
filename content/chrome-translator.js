// content/chrome-translator.js
// Chrome Translator API — runs in content script context only (not Service Worker)

async function chromeTranslatorAvailable(fromLang, toLang) {
  if (!('Translator' in self)) return false
  try {
    const canTranslate = await Translator.availability({ sourceLanguage: fromLang === 'auto' ? 'en' : fromLang, targetLanguage: toLang })
    return canTranslate === 'available'
  } catch {
    return false
  }
}

// Returns 'available' | 'downloading' | 'unavailable'
async function chromeTranslatorStatus(fromLang, toLang) {
  if (!('Translator' in self)) return 'unavailable'
  try {
    const status = await Translator.availability({ sourceLanguage: fromLang === 'auto' ? 'en' : fromLang, targetLanguage: toLang })
    if (status === 'available') return 'available'
    if (status === 'downloading') return 'downloading'
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

async function chromeTranslatorTranslate(texts, fromLang, toLang) {
  const translator = await Translator.create({
    sourceLanguage: fromLang === 'auto' ? 'en' : fromLang,
    targetLanguage: toLang
  })
  return Promise.all(texts.map(t => translator.translate(t)))
}

// ── Apple NPU via SnapFocus local HTTP server ─────────────────────────────────

const SNAPFOCUS_URL = 'http://localhost:57312'

async function snapFocusPing() {
  try {
    const res = await fetch(`${SNAPFOCUS_URL}/ping`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

// Translates a single text string via SnapFocus.
// Throws if SnapFocus is unreachable or returns an error.
async function snapFocusTranslate(text, toLang) {
  const res = await fetch(`${SNAPFOCUS_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, targetLanguage: toLang }),
    signal: AbortSignal.timeout(8000)
  })
  if (!res.ok) throw new Error(`SnapFocus error: ${res.status}`)
  const json = await res.json()
  if (!json.translation) throw new Error('SnapFocus: empty response')
  return json.translation
}
