// shared/debug-translator.js — DEV-ONLY, default-OFF fake `Translator` harness.
// Loaded as a plain script (popup/options) and via importScripts (SW), like
// shared/config.js. Exposes `self.maybeInstallFakeTranslator` (async).
//
// PRODUCTION-SAFETY INVARIANT: when the storage key `__btDebugTranslator` is
// ABSENT (normal use), this module performs ZERO writes to `self.Translator`
// and is a pure no-op. The real global is captured once at module load and
// only swapped/restored when the key is explicitly present and enabled.

// Capture the real Translator reference ONCE, at module load.
const REAL = ('Translator' in self) ? self.Translator : undefined

// Whether THIS module has ever installed a fake (gates restore vs. leave-alone).
let installed = false

function makeFakeTranslator(cfg) {
  const instance = {
    async translate(text) { return '【FAKE译】' + text }
  }
  return {
    async availability({ sourceLanguage, targetLanguage }) {
      const a = cfg.availability
      if (a === 'available' || a === 'downloadable' || a === 'downloading') return a
      return 'unavailable'
    },
    async create({ sourceLanguage, targetLanguage, monitor }) {
      if (cfg.failCreate === true) throw new Error('FAKE: download failed')
      // 'available' mirrors the real API: ready instantly, no download events.
      if (cfg.availability === 'available') return instance
      // Any download-requiring state: stream monotonic progress then resolve.
      let listener = null
      if (monitor) {
        monitor({
          addEventListener(type, l) {
            if (type === 'downloadprogress') listener = l
          }
        })
      }
      let ms = Number(cfg.downloadMs)
      if (!Number.isFinite(ms)) ms = 4000
      ms = Math.max(500, Math.min(20000, ms))
      const steps = 12
      await new Promise(resolve => {
        let i = 1
        const tick = () => {
          const loaded = i / steps
          if (listener) listener({ loaded })
          if (i >= steps) { resolve(); return }
          i += 1
          setTimeout(tick, ms / steps)
        }
        setTimeout(tick, ms / steps)
      })
      return instance
    }
  }
}

async function maybeInstallFakeTranslator() {
  const cfg = (await chrome.storage.local.get('__btDebugTranslator')).__btDebugTranslator
  if (!cfg || cfg.enabled !== true) {
    // Key absent / disabled. Restore ONLY if we previously installed a fake.
    // Never-installed path performs ZERO assignment/delete on `self`.
    if (installed) {
      if (REAL === undefined) delete self.Translator
      else self.Translator = REAL
      installed = false
    }
    return
  }
  if (cfg.availability === 'no-api') {
    // Simulate a browser with no Translator API at all.
    delete self.Translator
    installed = true
    return
  }
  self.Translator = makeFakeTranslator(cfg)
  installed = true
}

if (typeof self !== 'undefined' && typeof module === 'undefined') {
  self.maybeInstallFakeTranslator = maybeInstallFakeTranslator
  self.makeFakeTranslator = makeFakeTranslator
}
if (typeof module !== 'undefined') {
  module.exports = { maybeInstallFakeTranslator, makeFakeTranslator }
}
