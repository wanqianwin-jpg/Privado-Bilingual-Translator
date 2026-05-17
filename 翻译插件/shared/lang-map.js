// shared/lang-map.js — pure browser-language → uiLang/targetLang mapping.
// Dependency-free. No production wiring here; consumers wire it in later tasks.

// The 12 web-page translation targets.
const SUPPORTED_TARGET = ['zh', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'ar', 'it', 'pt-BR']

// The published UI locale directory names (note zh_CN/zh_TW/pt_BR underscores).
const SUPPORTED_UI_LOCALE = ['zh_CN', 'zh_TW', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'ar', 'it', 'pt_BR']

// Base languages whose code == locale-dir name and == translation target.
const SUPPORTED_BASE = ['en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'ar', 'it']

// Internal: classify a browser language tag into a neutral key.
// Returns one of: 'zh', 'zh-TW', 'pt', a SUPPORTED_BASE code, or 'en' (fallback).
function classify(browserLang) {
  const lang = String(browserLang || '').toLowerCase()
  if (lang === 'zh-hant' || lang === 'zh-tw') return 'zh-TW'
  if (lang === 'zh' || lang === 'zh-hans' || lang === 'zh-cn') return 'zh'
  if (lang === 'pt' || lang.indexOf('pt-') === 0) return 'pt'
  const primary = lang.split('-')[0]
  if (SUPPORTED_BASE.indexOf(primary) !== -1) return primary
  return 'en'
}

function mapToTargetLang(browserLang) {
  const key = classify(browserLang)
  if (key === 'pt') return 'pt-BR'
  return key
}

function mapToUiLang(browserLang) {
  const key = classify(browserLang)
  if (key === 'zh') return 'zh_CN'
  if (key === 'zh-TW') return 'zh_TW'
  if (key === 'pt') return 'pt_BR'
  return key
}

if (typeof self !== 'undefined' && typeof module === 'undefined') {
  self.mapToTargetLang = mapToTargetLang
  self.mapToUiLang = mapToUiLang
  self.SUPPORTED_TARGET = SUPPORTED_TARGET
  self.SUPPORTED_UI_LOCALE = SUPPORTED_UI_LOCALE
}
if (typeof module !== 'undefined') {
  module.exports = { mapToTargetLang, mapToUiLang, SUPPORTED_TARGET, SUPPORTED_UI_LOCALE }
}
