const CACHE_NAME = 'bt-translations-v1'

function makeCacheKey(source, text, fromLang, toLang) {
  const params = new URLSearchParams({ source, fromLang, toLang, text })
  return `https://bt-cache/translate?${params}`
}

async function getCache(source, text, fromLang, toLang) {
  try {
    const cache = await caches.open(CACHE_NAME)
    const res = await cache.match(makeCacheKey(source, text, fromLang, toLang))
    if (!res) return null
    return res.text()
  } catch {
    return null
  }
}

async function setCache(source, text, fromLang, toLang, translation) {
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(makeCacheKey(source, text, fromLang, toLang), new Response(translation))
  } catch {
    // Cache write failure is non-fatal
  }
}

if (typeof self !== 'undefined' && typeof module === 'undefined') {
  self.btGetCache = getCache
  self.btSetCache = setCache
}
if (typeof module !== 'undefined') {
  module.exports = { getCache, setCache }
}
