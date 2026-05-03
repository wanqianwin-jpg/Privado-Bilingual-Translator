// content/chrome-translator.js
// Chrome Translator API — runs in content script context only (not Service Worker)

function _src(fromLang) { return fromLang === 'auto' ? 'en' : fromLang }

async function chromeTranslatorAvailable(fromLang, toLang) {
  if (!('Translator' in self)) return false
  try {
    const canTranslate = await Translator.availability({ sourceLanguage: _src(fromLang), targetLanguage: toLang })
    return canTranslate === 'available'
  } catch {
    return false
  }
}

// Returns 'available' | 'after-download' | 'downloading' | 'unavailable'
async function chromeTranslatorStatus(fromLang, toLang) {
  if (!('Translator' in self)) return 'no-api'

  let status
  try {
    status = await Translator.availability({ sourceLanguage: _src(fromLang), targetLanguage: toLang })
  } catch {
    return 'unavailable'
  }

  if (status === 'available')   return 'available'
  if (status === 'downloading') return 'downloading'
  if (status === 'after-download' || status === 'downloadable') return 'after-download'
  if (status === 'unavailable') return 'unavailable'

  // Unknown value: future Chrome API change — probe with create() to decide
  try {
    const ctrl = new AbortController()
    const t = await Translator.create({
      sourceLanguage: _src(fromLang),
      targetLanguage: toLang,
      signal: ctrl.signal,
      monitor(m) {
        m.addEventListener('downloadprogress', () => ctrl.abort())
      }
    })
    void t  // created successfully, model is ready
    return 'available'
  } catch (e) {
    return e?.name === 'AbortError' ? 'after-download' : 'unavailable'
  }
}

// Triggers model download and resolves when translator is ready.
// onProgress(pct: 0-100) called during download if total is known.
async function chromeTranslatorDownload(fromLang, toLang, onProgress) {
  return Translator.create({
    sourceLanguage: _src(fromLang),
    targetLanguage: toLang,
    monitor(m) {
      m.addEventListener('downloadprogress', (e) => {
        if (onProgress && e.total > 0) onProgress(Math.round(e.loaded / e.total * 100))
      })
    }
  })
}

// Cache Translator instances per (sourceLanguage, targetLanguage). Translator.create() opens a
// session and (on first call for a pair) downloads the model — without caching, every paragraph
// pays that cost.
const _translatorCache = new Map()
function _cachedTranslator(fromLang, toLang) {
  const key = `${_src(fromLang)}|${toLang}`
  let entry = _translatorCache.get(key)
  if (!entry) {
    entry = Translator.create({ sourceLanguage: _src(fromLang), targetLanguage: toLang })
    _translatorCache.set(key, entry)
    // If creation rejects, evict so the next call retries.
    Promise.resolve(entry).catch(() => _translatorCache.delete(key))
  }
  return entry
}

async function chromeTranslatorTranslate(texts, fromLang, toLang) {
  const translator = await _cachedTranslator(fromLang, toLang)
  return Promise.all(texts.map(t => translator.translate(t)))
}
