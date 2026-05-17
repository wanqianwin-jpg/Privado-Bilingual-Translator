// shared/i18n.js — runtime i18n layer so UI language can follow a chosen
// uiLang instead of being locked to the browser UI locale by chrome.i18n.
//
// Spike decision (already-decided, do NOT block):
//   Primary path = privileged fetch(chrome.runtime.getURL('_locales/<loc>/messages.json'))
//   + cache the raw chrome-i18n-format object into chrome.storage.local.
//   The three-level resolver fallback (active -> en -> chrome.i18n.getMessage)
//   structurally guarantees the UI never breaks even if fetch is ever blocked.
//   If a real-Chrome smoke ever shows the privileged fetch is blocked, options
//   are (a) add `_locales/*` to manifest web_accessible_resources, or
//   (b) bundle locale data. Not implemented now (YAGNI) — the chrome.i18n
//   ultimate fallback keeps the UI working meanwhile.
//
// This module delivers the shared resolver + loader/cache only; wiring call
// sites is handled by later tasks. Loader fetch path is review- + real-Chrome-
// smoke-verified (jsdom/jest cannot exercise extension fetch).

// --- Pure resolver -------------------------------------------------------

// Normalize subs into a positional array (chrome.i18n: string -> [string],
// undefined -> []).
function normalizeSubs(subs) {
  if (subs === undefined || subs === null) return []
  if (Array.isArray(subs)) return subs
  return [String(subs)]
}

// Substitute $1..$9, $$ and $NAME$ in a message string, matching chrome.i18n
// semantics. `placeholders` is the optional table[key].placeholders map whose
// entries' `.content` is itself a positional ref like "$1".
function substitute(message, subs, placeholders) {
  const args = normalizeSubs(subs)
  // Match: $$  |  $1..$9  |  $NAME$  (name = [A-Za-z0-9_]+, case-insensitive)
  return String(message).replace(/\$\$|\$([1-9])|\$([A-Za-z0-9_]+)\$/g, function (m, posDigit, name) {
    if (m === '$$') return '$'
    if (posDigit !== undefined) {
      const v = args[Number(posDigit) - 1]
      return v === undefined || v === null ? '' : String(v)
    }
    // Named placeholder — case-insensitive lookup in placeholders map.
    if (placeholders) {
      let entry = placeholders[name]
      if (entry === undefined) {
        const lower = name.toLowerCase()
        const hit = Object.keys(placeholders).find((k) => k.toLowerCase() === lower)
        if (hit !== undefined) entry = placeholders[hit]
      }
      if (entry && typeof entry.content === 'string') {
        const cm = /^\$([1-9])$/.exec(entry.content)
        if (cm) {
          const v = args[Number(cm[1]) - 1]
          return v === undefined || v === null ? '' : String(v)
        }
      }
    }
    // Unresolved $NAME$ — leave literal (non-corrupting choice for our UI).
    return m
  })
}

// resolveMessage(table, key, subs) -> substituted string, or undefined if the
// key is absent (so callers can fall back). Pure, no chrome/DOM deps.
function resolveMessage(table, key, subs) {
  if (!table || typeof table !== 'object') return undefined
  const entry = table[key]
  if (!entry || typeof entry.message !== 'string') return undefined
  return substitute(entry.message, subs, entry.placeholders)
}

// --- Loader + cache (privileged contexts only: SW / options page) --------

// Fetch _locales/<loc>/messages.json and cache the raw chrome-i18n-format
// object under chrome.storage.local['__btUiStrings_'+loc]. Idempotent.
// Never throws — resolves false on any failure, true on success.
async function ensureLocaleCached(loc) {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) return false
    const url = chrome.runtime.getURL('_locales/' + loc + '/messages.json')
    const resp = await fetch(url)
    if (!resp || !resp.ok) return false
    const data = await resp.json()
    if (!data || typeof data !== 'object') return false
    await storageSet('__btUiStrings_' + loc, data)
    return true
  } catch (e) {
    return false
  }
}

// --- Runtime accessor (works in all contexts) ---------------------------

let _activeTable = null
let _enTable = null

function isPrivilegedContext() {
  return typeof chrome !== 'undefined' && !!chrome.runtime && typeof chrome.runtime.getURL === 'function'
}

function hasStorage() {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local
}

function storageGet(storeKey) {
  return new Promise((resolve) => {
    try {
      if (!hasStorage()) return resolve(undefined)
      chrome.storage.local.get(storeKey, (res) => resolve(res ? res[storeKey] : undefined))
    } catch (e) {
      resolve(undefined)
    }
  })
}

function storageSet(storeKey, value) {
  return new Promise((resolve) => {
    try {
      if (!hasStorage()) return resolve()
      const obj = {}
      obj[storeKey] = value
      chrome.storage.local.set(obj, () => resolve())
    } catch (e) {
      resolve()
    }
  })
}

// Load one locale table into memory: prefer cached storage; else (privileged
// only) fetch+cache then re-read; else null. Best-effort, never throws.
async function loadTable(loc) {
  const storeKey = '__btUiStrings_' + loc
  let table = await storageGet(storeKey)
  if (table && typeof table === 'object') return table
  if (isPrivilegedContext()) {
    const ok = await ensureLocaleCached(loc)
    if (ok) {
      table = await storageGet(storeKey)
      if (table && typeof table === 'object') return table
    }
  }
  return null
}

// btI18nInit(loc) — load active-locale + en tables into the in-memory caches
// for synchronous btI18n() use. `loc` is the already-resolved locale-dir
// string (caller maps uiLang -> loc; we deliberately do not import lang-map).
// Tolerates missing chrome.storage (jest) by leaving caches null.
async function btI18nInit(loc) {
  _activeTable = await loadTable(loc)
  _enTable = loc === 'en' ? _activeTable : await loadTable('en')
}

// btI18n(key, subs) — SYNCHRONOUS three-level fallback:
//   active table -> en table -> chrome.i18n.getMessage -> '' (never blank/throw).
// Safe to call before btI18nInit (caches null -> falls straight to chrome.i18n).
function btI18n(key, subs) {
  let out = resolveMessage(_activeTable, key, subs)
  if (out !== undefined) return out
  out = resolveMessage(_enTable, key, subs)
  if (out !== undefined) return out
  if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
    return chrome.i18n.getMessage(key, subs)
  }
  return ''
}

if (typeof self !== 'undefined' && typeof module === 'undefined') {
  self.resolveMessage = resolveMessage
  self.ensureLocaleCached = ensureLocaleCached
  self.btI18nInit = btI18nInit
  self.btI18n = btI18n
}
if (typeof module !== 'undefined') {
  module.exports = { resolveMessage, ensureLocaleCached, btI18nInit, btI18n }
}
