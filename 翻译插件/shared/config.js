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

if (typeof self !== 'undefined' && typeof module === 'undefined') {
  self.resolveTranslateMode = resolveTranslateMode
  self.TRANSLATE_MODE_KEYS = TRANSLATE_MODE_KEYS
}
if (typeof module !== 'undefined') {
  module.exports = { resolveTranslateMode, TRANSLATE_MODE_KEYS }
}
