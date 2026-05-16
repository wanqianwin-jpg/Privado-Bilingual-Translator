const MODEL_PRESETS = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],
  gemini: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro']
}

const DEFAULT_MODELS = { openai: 'gpt-4o-mini', gemini: 'gemini-2.0-flash' }
const DEFAULT_BASE_URLS = { openai: 'https://api.openai.com/v1' }

const i18n = key => chrome.i18n.getMessage(key)

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const msg = i18n(el.dataset.i18n)
    if (msg) el.textContent = msg
  })
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const msg = i18n(el.dataset.i18nPlaceholder)
    if (msg) el.placeholder = msg
  })
  const title = i18n('optionsTitle')
  if (title) document.title = title
}

function updateProviderFields(provider, savedModel, savedBaseUrl) {
  const modelRow = document.getElementById('model-row')
  const baseurlRow = document.getElementById('baseurl-row')
  const modelInput = document.getElementById('api-model')
  const baseurlInput = document.getElementById('api-base-url')
  const datalist = document.getElementById('model-suggestions')

  const showModel = ['openai', 'gemini', 'custom'].includes(provider)
  const showBaseUrl = ['openai', 'custom'].includes(provider)

  modelRow.classList.toggle('hidden', !showModel)
  baseurlRow.classList.toggle('hidden', !showBaseUrl)

  if (showModel) {
    while (datalist.firstChild) datalist.removeChild(datalist.firstChild)
    ;(MODEL_PRESETS[provider] || []).forEach(m => {
      const opt = document.createElement('option')
      opt.value = m
      datalist.appendChild(opt)
    })
    modelInput.value = savedModel || DEFAULT_MODELS[provider] || ''
  }

  if (showBaseUrl) {
    baseurlInput.placeholder = provider === 'custom'
      ? 'https://your-api-endpoint/v1'
      : 'https://api.openai.com/v1'
    baseurlInput.value = savedBaseUrl || DEFAULT_BASE_URLS[provider] || ''
  }
}

// Pure: clamp a 0..1 download-progress fraction to an integer 0..100 percentage.
function clampPct(loaded) {
  return Math.max(0, Math.min(100, Math.round((loaded || 0) * 100)))
}

// Pure: map a Translator.availability() result (plus environment facts) to the
// model-section UI state. No DOM, no chrome — unit-testable in isolation.
// Returns { statusKey, isError, showButton, buttonEnabled }.
function availabilityToUiState(a, targetLang, hasTranslator) {
  if (targetLang === 'en') {
    return { statusKey: 'optionsModelNoneNeeded', isError: false, showButton: false, buttonEnabled: false }
  }
  if (!hasTranslator) {
    return { statusKey: 'optionsModelNoApi', isError: true, showButton: false, buttonEnabled: false }
  }
  if (a === 'available') {
    return { statusKey: 'optionsModelReady', isError: false, showButton: false, buttonEnabled: false }
  }
  if (a === 'downloadable' || a === 'after-download') {
    return { statusKey: 'optionsModelNeeded', isError: false, showButton: true, buttonEnabled: true }
  }
  if (a === 'downloading') {
    return { statusKey: 'statusDownloading', isError: false, showButton: true, buttonEnabled: false }
  }
  // 'unavailable' or anything unexpected: device/OS/disk can't do on-device translation.
  return { statusKey: 'optionsModelUnsupported', isError: true, showButton: false, buttonEnabled: false }
}

function setModelStatus(text, isError) {
  const el = document.getElementById('model-status')
  el.textContent = text
  el.classList.toggle('error', !!isError)
}

async function initModelSection() {
  const hintEl = document.getElementById('model-hint')
  const statusEl = document.getElementById('model-status')
  const progressRow = document.getElementById('model-progress-row')
  const progressEl = document.getElementById('model-progress')
  const pctEl = document.getElementById('model-pct')
  const btn = document.getElementById('download-model')
  if (!statusEl || !btn) return

  hintEl.textContent = i18n('toastChromeAfterDownload')

  const { targetLang = 'zh' } = await chrome.storage.local.get('targetLang')
  const hasTranslator = 'Translator' in self

  let a = 'unavailable'
  if (targetLang !== 'en' && hasTranslator) {
    try {
      a = await Translator.availability({ sourceLanguage: 'en', targetLanguage: targetLang })
    } catch {
      a = 'unavailable'
    }
  }

  const ui = availabilityToUiState(a, targetLang, hasTranslator)
  setModelStatus(i18n(ui.statusKey), ui.isError)
  btn.classList.toggle('hidden', !ui.showButton)
  btn.disabled = !ui.buttonEnabled
  progressRow.classList.toggle('hidden', a !== 'downloading')

  // If another context is already downloading, attach a monitor so the user
  // still sees live progress here (create() resolves once the model is ready).
  if (a === 'downloading') {
    attachDownload(targetLang, btn, progressRow, progressEl, pctEl, false)
  }

  btn.addEventListener('click', () => {
    attachDownload(targetLang, btn, progressRow, progressEl, pctEl, true)
  })
}

// This runs in the Options page (a real user-gesture context that also has the
// Translator API), so a click here provides the activation Chrome requires.
async function attachDownload(targetLang, btn, progressRow, progressEl, pctEl, fromClick) {
  if (fromClick) btn.disabled = true
  progressRow.classList.remove('hidden')
  progressEl.value = 0
  pctEl.textContent = '0%'
  setModelStatus(i18n('statusDownloading'), false)
  try {
    const t = await Translator.create({
      sourceLanguage: 'en',
      targetLanguage: targetLang,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          const pct = clampPct(e.loaded)
          progressEl.value = pct
          pctEl.textContent = pct + '%'
        })
      }
    })
    await t.translate('hello')
    setModelStatus(i18n('optionsModelReady'), false)
    progressRow.classList.add('hidden')
    btn.classList.add('hidden')
  } catch {
    setModelStatus(i18n('optionsModelFailed'), true)
    progressRow.classList.add('hidden')
    progressEl.value = 0
    pctEl.textContent = '0%'
    btn.classList.remove('hidden')
    btn.disabled = false
  }
}

async function init() {
  applyI18n()

  await initModelSection()

  // Shortcuts section
  const commands = await chrome.commands.getAll()
  const rewriteCmd = commands.find(c => c.name === 'rewrite-selection')
  document.getElementById('shortcut-rewrite').textContent = rewriteCmd?.shortcut || i18n('optionsShortcutNotSet')
  const readAloudCmd = commands.find(c => c.name === 'read-aloud')
  document.getElementById('shortcut-read-aloud').textContent = readAloudCmd?.shortcut || i18n('optionsShortcutNotSet')

  document.getElementById('shortcut-customize').addEventListener('click', (e) => {
    e.preventDefault()
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
  })

  document.getElementById('privacy-link').addEventListener('click', (e) => {
    e.preventDefault()
    chrome.tabs.create({ url: chrome.runtime.getURL('privacy.html') })
  })

  const { apiProvider = '', apiKey = '', apiModel = '', apiBaseUrl = '', enableCache = true, enableFreeFallback = true }
    = await chrome.storage.local.get(['apiProvider', 'apiKey', 'apiModel', 'apiBaseUrl', 'enableCache', 'enableFreeFallback'])

  document.getElementById('api-provider').value = apiProvider
  document.getElementById('api-key').value = apiKey
  document.getElementById('enable-cache').checked = enableCache
  document.getElementById('enable-free-fallback').checked = enableFreeFallback

  updateProviderFields(apiProvider, apiModel, apiBaseUrl)

  document.getElementById('api-provider').addEventListener('change', (e) => {
    updateProviderFields(e.target.value, '', '')
  })

  document.getElementById('save').addEventListener('click', async () => {
    const provider = document.getElementById('api-provider').value
    const key = document.getElementById('api-key').value.trim()
    const model = document.getElementById('api-model').value.trim()
    const baseUrl = document.getElementById('api-base-url').value.trim()
    const cache = document.getElementById('enable-cache').checked
    const freeFallback = document.getElementById('enable-free-fallback').checked

    await chrome.storage.local.set({ apiProvider: provider, apiKey: key, apiModel: model, apiBaseUrl: baseUrl, enableCache: cache, enableFreeFallback: freeFallback })

    showStatus(i18n('statusSaved'), '#0a7d0a')
  })

  document.getElementById('test').addEventListener('click', async () => {
    const provider = document.getElementById('api-provider').value
    const key = document.getElementById('api-key').value.trim()
    const model = document.getElementById('api-model').value.trim()
    const baseUrl = document.getElementById('api-base-url').value.trim()

    if (!provider || !key) { showStatus(i18n('statusFillFirst'), '#c00'); return }

    showStatus(i18n('statusTesting'), '#888')
    try {
      const result = await testApiCall(provider, key, model, baseUrl)
      showStatus(i18n('statusConnectedResult', [result]), '#0a7d0a')
    } catch (e) {
      showStatus(i18n('statusFailed', [e.message]), '#c00')
    }
  })
}

function showStatus(msg, color = '#0a7d0a') {
  const el = document.getElementById('status')
  el.textContent = msg
  el.style.color = color
  if (color === '#0a7d0a') setTimeout(() => { el.textContent = '' }, 3000)
}

async function testApiCall(provider, key, model, baseUrl) {
  if (provider === 'deepl') {
    const endpoint = key.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate'
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ['Hello'], target_lang: 'ZH' })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return json.translations[0].text
  }
  if (provider === 'openai' || provider === 'custom') {
    const endpoint = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions'
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Translate "Hello" to Chinese (Simplified). Reply with the translation only.' }],
        temperature: 0.1, max_tokens: 20
      })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return json.choices[0].message.content.trim()
  }
  if (provider === 'gemini') {
    const usedModel = model || 'gemini-2.0-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${usedModel}:generateContent?key=${key}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Translate "Hello" to Chinese (Simplified). Reply with the translation only.' }] }] })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return json.candidates[0].content.parts[0].text.trim()
  }
  throw new Error(i18n('errUnknownProvider'))
}

if (typeof module !== 'undefined') {
  module.exports = { availabilityToUiState, clampPct }
} else {
  init()
}
