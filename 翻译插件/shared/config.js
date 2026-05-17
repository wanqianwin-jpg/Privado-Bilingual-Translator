// shared/config.js — single source of truth for translateMode resolution.
// Loaded as a plain script before any consumer (content scripts, popup, options, SW).
// Exposes the helper on `self` so it works in window, worker, and service worker contexts.

// Resolves the effective translateMode from a chrome.storage.local.get(...) result.
// Handles two legacy migrations:
//   - 'privacy' value (older naming) → 'chrome-local'
//   - missing value with old apiEnabled boolean → 'api' or 'machine'
function resolveTranslateMode(stored) {
  if (stored?.translateMode === 'privacy') return 'chrome-local'
  if (stored?.translateMode) return stored.translateMode
  if (stored?.apiEnabled !== undefined) return stored.apiEnabled ? 'api' : 'machine'
  return 'machine'
}

// The set of storage keys consumers should request when they need translateMode.
const TRANSLATE_MODE_KEYS = ['translateMode', 'apiEnabled']

// Resolves the effective web-page translation target.
//   - if the user made an explicit choice (truthy stored.targetLang) → keep it
//   - otherwise derive from the browser language via mapToTargetLang
// browserLang is passed explicitly in tests; in production it defaults to the
// browser UI language. lang-map is resolved the dual way config.js must handle
// shared deps: require() under jest, global (self.mapToTargetLang) in SW/page.
function resolveTargetLang(stored, browserLang) {
  if (stored && stored.targetLang) return stored.targetLang
  const map = (typeof module !== 'undefined' && typeof require === 'function')
    ? require('./lang-map').mapToTargetLang
    : (typeof self !== 'undefined' ? self.mapToTargetLang : mapToTargetLang)
  let lang = browserLang
  if (lang === undefined && typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
    lang = chrome.i18n.getUILanguage()
  }
  return map(lang)
}

if (typeof self !== 'undefined' && typeof module === 'undefined') {
  self.resolveTranslateMode = resolveTranslateMode
  self.resolveTargetLang = resolveTargetLang
  self.TRANSLATE_MODE_KEYS = TRANSLATE_MODE_KEYS
}
if (typeof module !== 'undefined') {
  module.exports = { resolveTranslateMode, resolveTargetLang, TRANSLATE_MODE_KEYS }
}
