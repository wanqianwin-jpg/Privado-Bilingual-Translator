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

async function init() {
  applyI18n()

  const { apiProvider = '', apiKey = '', apiModel = '', apiBaseUrl = '', enableCache = true }
    = await chrome.storage.local.get(['apiProvider', 'apiKey', 'apiModel', 'apiBaseUrl', 'enableCache'])

  document.getElementById('api-provider').value = apiProvider
  document.getElementById('api-key').value = apiKey
  document.getElementById('enable-cache').checked = enableCache

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

    await chrome.storage.local.set({ apiProvider: provider, apiKey: key, apiModel: model, apiBaseUrl: baseUrl, enableCache: cache })

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

init()
